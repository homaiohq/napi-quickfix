#include "js_message_store.h"

#include <cmath>
#include <exception>
#include <utility>

#include "quickfix/Exceptions.h"
#include "quickfix/Session.h"
#include "session_id_wrap.h"

namespace napi_quickfix {

namespace {

using Method = JsMessageStoreFactory::Method;
using Outcome = JsMessageStoreFactory::Outcome;
using Status = JsMessageStoreFactory::Status;
using State = JsMessageStoreFactory::State;

Napi::Value ToDate(Napi::Env env, const FIX::UtcTimeStamp& ts) {
  const double ms = static_cast<double>(ts.getTimeT()) * 1000.0 +
                    static_cast<double>(ts.getFraction(3));
  return Napi::Date::New(env, ms);
}

FIX::UtcTimeStamp FromDate(Napi::Value v, const char* what) {
  double ms = 0;
  if (v.IsDate()) {
    ms = v.As<Napi::Date>().ValueOf();
  } else if (v.IsNumber()) {
    ms = v.As<Napi::Number>().DoubleValue();
  } else {
    throw std::runtime_error(std::string(what) + " must be a Date");
  }
  constexpr double kMaxDateMs = 8.64e15;
  if (!std::isfinite(ms) || std::fabs(ms) > kMaxDateMs) {
    throw std::runtime_error(std::string(what) + " is not a valid Date");
  }
  const double secs = std::floor(ms / 1000.0);
  return FIX::UtcTimeStamp(static_cast<time_t>(secs),
                           static_cast<int>(ms - secs * 1000.0));
}

FIX::SEQNUM ReadSeq(Napi::Value v, const char* what) {
  if (!v.IsNumber()) {
    throw std::runtime_error(std::string(what) + " must be a number");
  }
  const double d = v.As<Napi::Number>().DoubleValue();
  constexpr double kMaxSafe = 9007199254740991.0;
  if (!std::isfinite(d) || d < 1 || std::floor(d) != d || d > kMaxSafe) {
    throw std::runtime_error(std::string(what) +
                             " must be a positive safe integer");
  }
  return static_cast<FIX::SEQNUM>(d);
}

Napi::Object StateToJs(Napi::Env env, const State& s) {
  Napi::Object o = Napi::Object::New(env);
  o.Set("creationTime", ToDate(env, s.creationTime));
  o.Set("nextSenderMsgSeqNum",
        Napi::Number::New(env, static_cast<double>(s.nextSender)));
  o.Set("nextTargetMsgSeqNum",
        Napi::Number::New(env, static_cast<double>(s.nextTarget)));
  return o;
}

std::string ErrorMessage(Napi::Value err) {
  try {
    if (err.IsObject()) {
      Napi::Value m = err.As<Napi::Object>().Get("message");
      if (m.IsString()) return m.As<Napi::String>().Utf8Value();
    }
    if (err.IsString()) return err.As<Napi::String>().Utf8Value();
    return err.ToString().Utf8Value();
  } catch (...) {
    return "adapter rejected";
  }
}

Outcome Failed(Status status, std::string error) {
  Outcome o;
  o.status = status;
  o.error = std::move(error);
  return o;
}

// True while the calling thread is inside a catch handler. QuickFIX makes
// store calls from its own handlers in Session::next(Message) with no
// IOException guard of their own: catch (UnsupportedVersion&) runs
// incrNextTargetMsgSeqNum() (or nextLogout()'s) after generateLogout(). An
// IOException thrown there escapes the network thread: std::terminate. (The
// sender getter those handlers also read never throws at all.) Must be
// evaluated before entering a try whose catch asks the question (inside it,
// the store's own IOException is current).
bool InQuickFixHandler() { return std::current_exception() != nullptr; }

}  // namespace

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

struct JsMessageStoreFactory::CallData {
  enum class Kind { kCall, kReport } kind = Kind::kCall;
  Request req;
  std::uint64_t channelId = kNoChannel;
  // kReport
  std::string message;
  bool poisoned = false;
  bool late = false;
};

const char* JsMessageStoreFactory::MethodName(Method m) {
  switch (m) {
    case Method::kLoad: return "load";
    case Method::kCreate: return "create";
    case Method::kSetSeqNums: return "setSeqNums";
    case Method::kSetMessage: return "setMessage";
    case Method::kGetMessages: return "getMessages";
    case Method::kReset: return "reset";
  }
  return "";
}

JsMessageStoreFactory::JsMessageStoreFactory(Napi::Env env, Napi::Object bridge,
                                             std::map<FIX::SessionID, State> seeds,
                                             int timeoutMs)
    : jsThread_(std::this_thread::get_id()),
      shared_(std::make_shared<Shared>()),
      seeds_(std::move(seeds)),
      timeoutMs_(timeoutMs) {
  shared_->factory = this;
  bridge_ = Napi::Persistent(bridge);
  // The two promise continuations, created once. Each bridged call binds
  // them to its channel id (Function.prototype.bind), so no per-call native
  // closure -- and no per-call finalizer racing the waiting thread for the
  // channel's ownership -- exists: the continuation only ever holds the
  // registry, and looks the channel up by id.
  std::shared_ptr<Shared> shared = shared_;
  onFulfilled_ = Napi::Persistent(Napi::Function::New(
      env,
      [shared](const Napi::CallbackInfo& info) -> Napi::Value {
        Napi::Env e = info.Env();
        const std::uint64_t id =
            info.Length() > 0 && info[0].IsNumber()
                ? static_cast<std::uint64_t>(info[0].As<Napi::Number>().DoubleValue())
                : kNoChannel;
        OnSettled(shared, e, id, true, info.Length() > 1 ? info[1] : e.Undefined());
        return e.Undefined();
      },
      "storeFulfilled"));
  onRejected_ = Napi::Persistent(Napi::Function::New(
      env,
      [shared](const Napi::CallbackInfo& info) -> Napi::Value {
        Napi::Env e = info.Env();
        const std::uint64_t id =
            info.Length() > 0 && info[0].IsNumber()
                ? static_cast<std::uint64_t>(info[0].As<Napi::Number>().DoubleValue())
                : kNoChannel;
        OnSettled(shared, e, id, false, info.Length() > 1 ? info[1] : e.Undefined());
        return e.Undefined();
      },
      "storeRejected"));
  tsfn_ = TSFN::New(env, "napi_quickfix::JsMessageStore", 0, 1, this,
                    [](Napi::Env, void*, JsMessageStoreFactory*) {});
}

JsMessageStoreFactory::~JsMessageStoreFactory() {
  // JS thread. Wake any straggling waiter, detach the continuations (they
  // may still be reached by a Promise that settles later), and drop the
  // TSFN and the rooted JS objects.
  Deactivate();
  shared_->factory = nullptr;
  if (!released_) {
    tsfn_.Abort();
    released_ = true;
  }
  if (!bridge_.IsEmpty()) bridge_.Reset();
  if (!onFulfilled_.IsEmpty()) onFulfilled_.Reset();
  if (!onRejected_.IsEmpty()) onRejected_.Reset();
}

// --- constructor options -------------------------------------------------------------

std::map<FIX::SessionID, State> JsMessageStoreFactory::ReadSeeds(Napi::Env env,
                                                                  Napi::Value v) {
  if (!v.IsArray()) {
    throw Napi::TypeError::New(env, "storeStates must be an array");
  }
  std::map<FIX::SessionID, State> seeds;
  Napi::Array arr = v.As<Napi::Array>();
  for (uint32_t i = 0; i < arr.Length(); ++i) {
    Napi::Value item = arr.Get(i);
    if (!item.IsObject()) {
      throw Napi::TypeError::New(env, "storeStates entries must be objects");
    }
    Napi::Object o = item.As<Napi::Object>();
    SessionIDWrap* id = SessionIDWrap::UnwrapArg(env, o.Get("sessionID"), "sessionID");
    State st;
    try {
      st.creationTime = FromDate(o.Get("creationTime"), "creationTime");
      st.nextSender = ReadSeq(o.Get("nextSenderMsgSeqNum"), "nextSenderMsgSeqNum");
      st.nextTarget = ReadSeq(o.Get("nextTargetMsgSeqNum"), "nextTargetMsgSeqNum");
    } catch (const std::exception& e) {
      throw Napi::TypeError::New(env, std::string("storeStates: ") + e.what());
    }
    seeds[id->SessionID()] = st;
  }
  return seeds;
}

int JsMessageStoreFactory::ReadTimeout(Napi::Env env, Napi::Value v) {
  if (v.IsUndefined()) return 30000;
  if (!v.IsNumber()) {
    throw Napi::TypeError::New(env, "storeTimeoutMs must be a number");
  }
  const double d = v.As<Napi::Number>().DoubleValue();
  constexpr double kMaxInt = 2147483647.0;
  if (!std::isfinite(d) || std::floor(d) != d || d < 0 || d > kMaxInt) {
    throw Napi::RangeError::New(
        env, "storeTimeoutMs must be an integer from 0 to 2147483647 (0 disables the timeout)");
  }
  return static_cast<int>(d);
}

// --- registry ------------------------------------------------------------------

namespace {
struct StoreRegistry {
  std::mutex mtx;
  std::map<FIX::SessionID, JsMessageStore*> stores;
};
StoreRegistry& Registry() {
  static StoreRegistry registry;
  return registry;
}
}  // namespace

JsMessageStore* JsMessageStoreFactory::Lookup(const FIX::SessionID& id) {
  StoreRegistry& r = Registry();
  std::lock_guard<std::mutex> lock(r.mtx);
  auto it = r.stores.find(id);
  return it == r.stores.end() ? nullptr : it->second;
}

FIX::MessageStore* JsMessageStoreFactory::create(const FIX::UtcTimeStamp& /*now*/,
                                                 const FIX::SessionID& id) {
  auto seed = seeds_.find(id);
  if (seed == seeds_.end()) {
    // Only reachable if the TS preload and the engine disagree on the
    // session list, which the shared getSessions(connectionType) prevents.
    throw FIX::ConfigError("message store: no preloaded state for session " +
                           id.toString());
  }
  auto* store = new JsMessageStore(*this, id, seed->second);
  StoreRegistry& r = Registry();
  std::lock_guard<std::mutex> lock(r.mtx);
  r.stores[id] = store;
  return store;
}

void JsMessageStoreFactory::destroy(FIX::MessageStore* store) {
  auto* js = static_cast<JsMessageStore*>(store);
  {
    StoreRegistry& r = Registry();
    std::lock_guard<std::mutex> lock(r.mtx);
    auto it = r.stores.find(js->SessionID());
    if (it != r.stores.end() && it->second == js) r.stores.erase(it);
  }
  delete store;
}

// --- teardown protocol -----------------------------------------------------------

void JsMessageStoreFactory::Deactivate() {
  shared_->pending.Deactivate([](const std::shared_ptr<Channel>& ch) {
    ch->ForceFulfil(Failed(Status::kAborted, "engine tearing down"));
  });
}

void JsMessageStoreFactory::Release() {
  if (!released_) {
    Deactivate();
    released_ = true;
    tsfn_.Release();
  }
}

void JsMessageStoreFactory::Abort() {
  if (!released_) {
    Deactivate();
    released_ = true;
    tsfn_.Abort();
  }
}

void JsMessageStoreFactory::DropBridge() {
  if (!bridge_.IsEmpty()) bridge_.Reset();
}

void JsMessageStoreFactory::Ref(Napi::Env env) {
  if (!released_) tsfn_.Ref(env);
}

void JsMessageStoreFactory::Unref(Napi::Env env) {
  if (!released_) tsfn_.Unref(env);
}

// --- calls -------------------------------------------------------------------------

JsMessageStoreFactory::Outcome JsMessageStoreFactory::Call(const Request& req) {
  if (OnJsThread()) {
    return Failed(Status::kAborted, "called on the JS thread");
  }
  // Cheap fast path; the authoritative check is Register()'s, under its lock.
  if (shared_->pending.Inactive()) {
    return Failed(Status::kAborted, "engine tearing down");
  }
  auto ch = std::make_shared<Channel>();
  ch->method = req.method;
  ch->id = req.id;
  ch->seq = req.a;
  std::uint64_t channelId = 0;
  if (!shared_->pending.Register(ch, channelId)) {
    return Failed(Status::kAborted, "engine tearing down");
  }
  auto data = std::make_unique<CallData>();
  data->kind = CallData::Kind::kCall;
  data->req = req;
  data->channelId = channelId;
  if (tsfn_.BlockingCall(data.get()) != napi_ok) {
    shared_->pending.Erase(channelId);
    return Failed(Status::kAborted, "engine tearing down");
  }
  data.release();  // the trampoline owns it now
  if (!ch->Wait(std::chrono::milliseconds(timeoutMs_))) {
    // Expired: the registry entry stays, so the continuation that settles
    // this channel later can tell it was late (OnSettled erases it then).
    return Failed(Status::kTimedOut,
                  "timed out after " + std::to_string(timeoutMs_) + " ms");
  }
  shared_->pending.Erase(channelId);
  std::lock_guard<std::mutex> lock(ch->mtx);
  return ch->outcome;
}

JsMessageStoreFactory::Outcome JsMessageStoreFactory::CallDirect(
    const Request& req) {
  if (bridge_.IsEmpty()) {
    return Failed(Status::kAborted, "engine tearing down");
  }
  Napi::Env env = bridge_.Env();
  Napi::HandleScope scope(env);
  return Invoke(env, req, kNoChannel);
}

void JsMessageStoreFactory::ReportError(const FIX::SessionID& id, Method method,
                                        const std::string& message,
                                        bool poisoned, bool late) {
  auto data = std::make_unique<CallData>();
  data->kind = CallData::Kind::kReport;
  data->req.method = method;
  data->req.id = id;
  data->message = message;
  data->poisoned = poisoned;
  data->late = late;
  if (OnJsThread()) {
    if (bridge_.IsEmpty()) return;
    Napi::Env env = bridge_.Env();
    Napi::HandleScope scope(env);
    DeliverReport(env, *data);
    return;
  }
  if (shared_->pending.Inactive()) return;
  if (tsfn_.NonBlockingCall(data.get()) == napi_ok) {
    data.release();
  }
}

void JsMessageStoreFactory::DeliverReport(Napi::Env env, const CallData& data) {
  try {
    Napi::Object bridge = bridge_.Value();
    Napi::Value fn = bridge.Get("storeError");
    if (!fn.IsFunction()) return;
    fn.As<Napi::Function>().Call(
        bridge, {SessionIDWrap::NewInstance(env, data.req.id),
                 Napi::String::New(env, MethodName(data.req.method)),
                 Napi::String::New(env, data.message),
                 Napi::Boolean::New(env, data.poisoned),
                 Napi::Boolean::New(env, data.late)});
  } catch (...) {
    // A throwing listener is the user's problem (EventEmitter semantics);
    // nothing here may unwind into the trampoline.
  }
}

// JS thread (TSFN trampoline).
void JsMessageStoreFactory::CallJs(Napi::Env env, Napi::Function,
                                   JsMessageStoreFactory* self, CallData* data) {
  std::unique_ptr<CallData> owned(data);
  // A null env means the queue is being discarded (Abort() / environment
  // teardown): `self` may already be gone, and every waiter has been
  // released by the Deactivate() that precedes an Abort(). Touch nothing.
  if (env == nullptr || self == nullptr) return;
  if (data->kind == CallData::Kind::kReport) {
    if (self->bridge_.IsEmpty()) return;
    Napi::HandleScope scope(env);
    self->DeliverReport(env, *data);
    return;
  }
  auto settle = [&](Outcome o) {
    self->shared_->pending.WithChannel(
        data->channelId, [&](const std::shared_ptr<Channel>& ch) {
          ch->TryFulfil(std::move(o));
          return false;  // the waiter erases its own entry
        });
  };
  // Once deactivated every waiter has been released: do not run the adapter
  // for a call nobody waits on (a write landing after stop() would be a
  // write after close()).
  if (self->bridge_.IsEmpty() || self->shared_->pending.Inactive()) {
    settle(Failed(Status::kAborted, "engine tearing down"));
    return;
  }
  // Nor for a call whose waiter gave up while it sat in the queue (the loop
  // was busy): the engine has moved on, maybe retried it, and a stale
  // setMessage run now could commit over the retry's row for the same
  // seqnum (set() refuses that retry until this one is settled: dropping it
  // settles it). Dropped, it counts as a late settlement that wrote nothing.
  bool expired = false;
  self->shared_->pending.WithChannel(
      data->channelId, [&](const std::shared_ptr<Channel>& ch) {
        std::lock_guard<std::mutex> lock(ch->mtx);
        expired = ch->expired && !ch->done;
        return expired;  // nothing will settle it: erase here
      });
  if (expired) {
    SettledLate(self->shared_, data->req.method, data->req.id, data->req.a,
                "timed out before the adapter was called; not run");
    return;
  }
  Napi::HandleScope scope(env);
  Outcome sync = self->Invoke(env, data->req, data->channelId);
  // kPending: a Promise was bound and the continuation settles the channel
  // later; any synchronous outcome settles it now.
  if (sync.status != Status::kPending) {
    settle(std::move(sync));
  }
}

JsMessageStoreFactory::Outcome JsMessageStoreFactory::ParseResult(
    Napi::Env /*env*/, Method method, Napi::Value value) {
  Outcome o;
  switch (method) {
    case Method::kLoad: {
      if (value.IsNull() || value.IsUndefined()) {
        o.present = false;
        break;
      }
      if (!value.IsObject()) {
        throw std::runtime_error("load() must return an object or null");
      }
      Napi::Object s = value.As<Napi::Object>();
      o.present = true;
      o.state.creationTime = FromDate(s.Get("creationTime"), "creationTime");
      o.state.nextSender = ReadSeq(s.Get("nextSenderMsgSeqNum"), "nextSenderMsgSeqNum");
      o.state.nextTarget = ReadSeq(s.Get("nextTargetMsgSeqNum"), "nextTargetMsgSeqNum");
      break;
    }
    case Method::kGetMessages: {
      if (!value.IsArray()) {
        throw std::runtime_error("getMessages() must return string[]");
      }
      Napi::Array arr = value.As<Napi::Array>();
      const uint32_t n = arr.Length();
      o.strings.reserve(n);
      for (uint32_t i = 0; i < n; ++i) {
        Napi::Value v = arr.Get(i);
        if (!v.IsString()) {
          throw std::runtime_error("getMessages() entries must be strings");
        }
        o.strings.push_back(v.As<Napi::String>().Utf8Value());
      }
      break;
    }
    default:
      break;
  }
  return o;
}

JsMessageStoreFactory::Outcome JsMessageStoreFactory::Invoke(
    Napi::Env env, const Request& req, std::uint64_t channelId) {
  const Method method = req.method;
  try {
    Napi::Object bridge = bridge_.Value();
    Napi::Value fnv = bridge.Get(MethodName(method));
    if (!fnv.IsFunction()) {
      throw std::runtime_error(std::string("store bridge has no ") +
                               MethodName(method) + "()");
    }
    Napi::Function fn = fnv.As<Napi::Function>();
    std::vector<napi_value> args;
    args.push_back(SessionIDWrap::NewInstance(env, req.id));
    switch (method) {
      case Method::kLoad:
        break;
      case Method::kCreate:
      case Method::kReset:
        args.push_back(StateToJs(env, req.state));
        break;
      case Method::kSetSeqNums:
      case Method::kGetMessages:
        args.push_back(Napi::Number::New(env, static_cast<double>(req.a)));
        args.push_back(Napi::Number::New(env, static_cast<double>(req.b)));
        break;
      case Method::kSetMessage:
        args.push_back(Napi::Number::New(env, static_cast<double>(req.a)));
        args.push_back(Napi::String::New(env, req.msg));
        break;
    }
    Napi::Value result = fn.Call(bridge, args);
    if (result.IsPromise()) {
      if (channelId == kNoChannel) {
        // Direct dispatch: not awaited (the TS layer collects it).
        return Outcome{};
      }
      Napi::Object promise = result.As<Napi::Object>();
      Napi::Function then = promise.Get("then").As<Napi::Function>();
      Napi::Value id = Napi::Number::New(env, static_cast<double>(channelId));
      auto bind = [&](const Napi::FunctionReference& ref) -> Napi::Value {
        Napi::Function f = ref.Value();
        return f.Get("bind").As<Napi::Function>().Call(f, {env.Undefined(), id});
      };
      then.Call(promise, {bind(onFulfilled_), bind(onRejected_)});
      Outcome pending;
      pending.status = Status::kPending;  // settled by the continuation
      return pending;
    }
    return ParseResult(env, method, result);
  } catch (const Napi::Error& e) {
    return Failed(Status::kThrew, ErrorMessage(e.Value()));
  } catch (const std::exception& e) {
    return Failed(Status::kThrew, e.what());
  }
}

// JS thread: the Promise of a bridged call settled.
void JsMessageStoreFactory::OnSettled(const std::shared_ptr<Shared>& shared,
                                      Napi::Env env, std::uint64_t channelId,
                                      bool fulfilled, Napi::Value value) {
  if (channelId == kNoChannel) return;
  Method method = Method::kLoad;
  FIX::SessionID id;
  FIX::SEQNUM seq = 0;
  bool late = false;
  Outcome o;
  if (fulfilled) {
    // Parsing needs the method, which lives on the channel: look it up
    // first, parse, then settle under the registry lock.
    bool found = shared->pending.WithChannel(
        channelId, [&](const std::shared_ptr<Channel>& ch) {
          method = ch->method;
          id = ch->id;
          return false;
        });
    if (!found) return;  // completed or aborted already; nothing waits
    try {
      o = ParseResult(env, method, value);
    } catch (const std::exception& e) {
      o = Failed(Status::kThrew, e.what());
    }
  } else {
    o = Failed(Status::kThrew, ErrorMessage(value));
  }
  shared->pending.WithChannel(channelId, [&](const std::shared_ptr<Channel>& ch) {
    method = ch->method;
    id = ch->id;
    seq = ch->seq;
    switch (ch->TryFulfil(std::move(o))) {
      case Channel::Fulfilment::kFulfilled:
      case Channel::Fulfilment::kAlreadyDone:
        return false;  // the waiter erases its own entry
      case Channel::Fulfilment::kExpired:
        late = true;
        return true;  // nobody waits any more: erase here
    }
    return false;
  });
  if (!late) return;
  SettledLate(shared, method, id, seq,
              std::string(fulfilled ? "settled" : "rejected") +
                  " after the timeout had already failed the call");
}

// JS thread: a timed-out call settled after its waiter was released with
// IOException (OnSettled), or was dropped unrun (CallJs). The fatal writes
// track this (the poison cannot lift before the write has landed):
// setSeqNums, reset, and the create() a reload issues for a missing row; so
// does a reload's load(), so no other reload starts while it may still be
// running (see Gate()), its result discarded unreported; and setMessage,
// whose seqnum set() refuses until then (CheckUnsettledSet()), reported
// without poison. A late getMessages is discarded.
void JsMessageStoreFactory::SettledLate(const std::shared_ptr<Shared>& shared,
                                        Method method, const FIX::SessionID& id,
                                        FIX::SEQNUM seq, const std::string& how) {
  if (method == Method::kGetMessages) return;
  if (JsMessageStore* store = Lookup(id)) {
    store->OnLateSettlement(method, seq);
  }
  if (method == Method::kLoad) return;
  if (shared->factory == nullptr) return;
  if (method == Method::kSetMessage) {
    shared->factory->ReportError(
        id, method, how + "; set(" + std::to_string(seq) + ") is accepted again",
        /*poisoned=*/false, /*late=*/true);
    return;
  }
  shared->factory->ReportError(id, method, how, /*poisoned=*/true, /*late=*/true);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

JsMessageStore::JsMessageStore(Factory& factory, const FIX::SessionID& id,
                               const Factory::State& seed)
    : factory_(factory), id_(id), cache_(seed.creationTime) {
  cache_.setNextSenderMsgSeqNum(seed.nextSender);
  cache_.setNextTargetMsgSeqNum(seed.nextTarget);
}

JsMessageStore::Factory::State JsMessageStore::Snapshot() const {
  Factory::State s;
  s.creationTime = cache_.getCreationTime();
  s.nextSender = cache_.getNextSenderMsgSeqNum();
  s.nextTarget = cache_.getNextTargetMsgSeqNum();
  return s;
}

void JsMessageStore::Apply(const Factory::State& s) const {
  cache_.setCreationTime(s.creationTime);
  cache_.setNextSenderMsgSeqNum(s.nextSender);
  cache_.setNextTargetMsgSeqNum(s.nextTarget);
}

void JsMessageStore::Throw(Factory::Method method, const std::string& why) const {
  throw FIX::IOException(std::string("message store ") +
                         Factory::MethodName(method) + ": " + why);
}

// Sequence numbers cross the bridge as JS numbers (doubles), exact only up to
// 2^53-1; ReadSeq() refuses larger values coming back from JS, this refuses
// them going out. Reached by a counterparty's SequenceReset (GapFillFlag=N,
// a 64-bit NewSeqNo) or by an increment past the limit. Nothing has been
// forwarded, so cache and adapter are still equal: report without poison
// (the non-fatal path of Forward()) and throw; QuickFIX's IOException
// handler disconnects the session.
void JsMessageStore::CheckSafeSeq(FIX::SEQNUM n, Factory::Method method,
                                  const char* what) const {
  constexpr FIX::SEQNUM kMaxSafeSeq = 9007199254740991ULL;  // 2^53-1
  if (n <= kMaxSafeSeq) return;
  const std::string why =
      std::string(what) + "(" + std::to_string(n) +
      "): sequence numbers above 9007199254740991 (2^53-1, Number.MAX_SAFE_INTEGER)"
      " cannot reach the adapter exactly; refused before the write";
  factory_.ReportError(id_, method, why, /*poisoned=*/false, /*late=*/false);
  Throw(method, why);
}

// Session::persist() stores the message under the MsgSeqNum fill() stamped,
// which is the next sender seqnum unless the cache moved in between: on a
// poisoned store the stamp came from the cache (the seqnum getters never
// reload) and this call's Gate(), or the network thread's getCreationTime()
// between fill() and persist() (sendRaw() holds Session::m_mutex, not
// SessionState::m_mutex, across them), then reloaded it (a late write that
// landed); or a Session.setNextSenderMsgSeqNum() worker took
// SessionState::m_mutex while sendRaw() ran toApp/toAdmin (the setter does
// not take Session::m_mutex, see session_wrap.cpp). Stored and sent, the
// message would carry a number the store no longer agrees with. Refused like
// a non-fatal adapter failure: IOException inside sendRaw()'s try (nothing is
// sent) and a non-poisoning 'storeError'.
void JsMessageStore::CheckStamp(FIX::SEQNUM seq) const {
  FIX::SEQNUM next;
  {
    std::lock_guard<std::mutex> lock(mtx_);
    next = cache_.getNextSenderMsgSeqNum();
  }
  if (seq == next) return;
  const std::string why =
      "set(" + std::to_string(seq) + "): the message was stamped MsgSeqNum=" +
      std::to_string(seq) + " but the next sender seqnum is now " +
      std::to_string(next) +
      " (a reload or a sequence-number setter moved it after the stamp); refused, not sent";
  factory_.ReportError(id_, Factory::Method::kSetMessage, why, /*poisoned=*/false,
                       /*late=*/false);
  Throw(Factory::Method::kSetMessage, why);
}

// A setMessage(seq) that timed out may still commit (the adapter runs it on
// another pool connection than the retry's): landing after this write, it
// would leave row `seq` holding the message whose send failed, and a resend
// of `seq` would deliver that one instead of the message sent as `seq`.
// Refused like a non-fatal adapter failure until it has settled (OnSettled())
// or was dropped unrun (CallJs()): the send resolves false and the next one
// takes the same seqnum.
void JsMessageStore::CheckUnsettledSet(FIX::SEQNUM seq) const {
  {
    std::lock_guard<std::mutex> lock(mtx_);
    auto it = unsettledSets_.find(seq);
    if (it == unsettledSets_.end() || it->second <= 0) return;
  }
  const std::string why =
      "set(" + std::to_string(seq) + "): an earlier setMessage(" + std::to_string(seq) +
      ") timed out and has not settled; its write could still land over this one"
      " (a resend would deliver the failed message); refused, not sent";
  factory_.ReportError(id_, Factory::Method::kSetMessage, why, /*poisoned=*/false,
                       /*late=*/false);
  Throw(Factory::Method::kSetMessage, why);
}

void JsMessageStore::LogEvent(const std::string& text) const {
  if (factory_.OnJsThread()) return;
  FIX::Session* session = FIX::Session::lookupSession(id_);
  if (session == nullptr) return;
  try {
    session->getLog()->onEvent(text);
  } catch (...) {
  }
}

void JsMessageStore::Poison(Factory::Method method, const std::string& why,
                            bool unsettled) const {
  {
    std::lock_guard<std::mutex> lock(mtx_);
    poisoned_ = true;
    if (unsettled) ++unsettled_;
    lastError_ = std::string(Factory::MethodName(method)) + ": " + why;
  }
  LogEvent("Message store poisoned (" + std::string(Factory::MethodName(method)) +
           " " + why + "): session state will be reloaded before the next call");
  factory_.ReportError(id_, method, why, /*poisoned=*/true, /*late=*/false);
}

void JsMessageStore::Gate(const char* what, bool reload) const {
  std::unique_lock<std::mutex> lock(mtx_);
  if (!poisoned_) return;
  if (unsettled_ > 0) {
    throw FIX::IOException(std::string("message store ") + what +
                           ": store poisoned (" + lastError_ +
                           "), a timed-out call has not settled yet");
  }
  if (reloadInFlight_) {
    throw FIX::IOException(std::string("message store ") + what +
                           ": store poisoned (" + lastError_ +
                           "), reload in progress");
  }
  if (!reload && !pendingReset_) {
    throw FIX::IOException(std::string("message store ") + what +
                           ": store poisoned (" + lastError_ + ")");
  }
  if (factory_.OnJsThread()) {
    throw FIX::IOException(std::string("message store ") + what +
                           ": store poisoned (" + lastError_ + ")");
  }
  reloadInFlight_ = true;
  const bool retryReset = pendingReset_;
  const FIX::UtcTimeStamp resetTime = pendingResetTime_;
  lock.unlock();
  Factory::Method failed = Factory::Method::kLoad;
  Factory::Outcome o = retryReset ? RetryReset(resetTime, failed) : Reload(failed);
  lock.lock();
  reloadInFlight_ = false;
  if (o.status != Factory::Status::kOk) {
    lastError_ = std::string(Factory::MethodName(failed)) + ": " + o.error;
    const std::string why = o.error;
    lock.unlock();
    if (o.status != Factory::Status::kAborted) {
      LogEvent("Message store reload failed (" + std::string(Factory::MethodName(failed)) +
               " " + why + ")");
      factory_.ReportError(id_, failed, why, /*poisoned=*/true, /*late=*/false);
    }
    throw FIX::IOException(std::string("message store ") + what +
                           ": reload failed (" + why + ")");
  }
  poisoned_ = false;
  lastError_.clear();
  lock.unlock();
  LogEvent(retryReset ? "Message store: the failed reset was retried: poison lifted"
                      : "Message store reloaded: poison lifted");
}

// The reset a failure left pending (see reset()), retried with its original
// timestamp: a reload would restore the numbers QuickFIX meant to discard,
// and the session would go on as if the reset had happened (a Logon with
// ResetOnLogon=Y would leave with the old MsgSeqNum and no ResetSeqNumFlag).
// Idempotent, so a timed-out reset that landed late is harmless to repeat. A
// timed-out retry is an unsettled write like a timed-out reset().
JsMessageStore::Factory::Outcome JsMessageStore::RetryReset(
    const FIX::UtcTimeStamp& when, Factory::Method& failed) const {
  Factory::Request r;
  r.method = Factory::Method::kReset;
  r.id = id_;
  r.state.creationTime = when;
  r.state.nextSender = 1;
  r.state.nextTarget = 1;
  Factory::Outcome o = factory_.Call(r);
  if (o.status != Factory::Status::kOk) {
    failed = Factory::Method::kReset;
    o.error = "retrying the failed reset: " + o.error;
    if (o.status == Factory::Status::kTimedOut) {
      std::lock_guard<std::mutex> lock(mtx_);
      ++unsettled_;
    }
    return o;
  }
  std::lock_guard<std::mutex> lock(mtx_);
  cache_.reset(when);
  pendingReset_ = false;
  return o;
}

// load() through the bridge and apply it to the cache. A null result means
// the row is gone (deleted behind the engine's back): as upstream's refresh()
// does -- m_cache.reset(now), then populateCache() INSERTs a 1/1 row
// (PostgreSQLStore.cpp:107-127) -- the session's numbering restarts at 1/1
// with a new creation time, persisted through create() before the cache takes
// it. A timed-out create() is an unsettled write like a timed-out setSeqNums;
// a timed-out load() is unsettled too, not because it writes but so that a
// stalled adapter costs one timeout, not one per store call (each getter and
// write would start a reload of its own and park the network thread on it),
// and never holds more than one of them. On failure `failed` names the
// method that failed and nothing is applied.
JsMessageStore::Factory::Outcome JsMessageStore::Reload(Factory::Method& failed) const {
  Factory::Request req;
  req.method = Factory::Method::kLoad;
  req.id = id_;
  Factory::Outcome o = factory_.Call(req);
  if (o.status != Factory::Status::kOk) {
    failed = Factory::Method::kLoad;
    if (o.status == Factory::Status::kTimedOut) {
      std::lock_guard<std::mutex> lock(mtx_);
      ++unsettled_;
    }
    return o;
  }
  Factory::State state = o.state;
  if (!o.present) {
    Factory::Request create;
    create.method = Factory::Method::kCreate;
    create.id = id_;
    create.state = Factory::State{};  // now, 1/1
    Factory::Outcome c = factory_.Call(create);
    if (c.status != Factory::Status::kOk) {
      failed = Factory::Method::kCreate;
      c.error = "recreating the missing row: " + c.error;
      if (c.status == Factory::Status::kTimedOut) {
        std::lock_guard<std::mutex> lock(mtx_);
        ++unsettled_;
      }
      return c;
    }
    state = create.state;
    LogEvent("Message store: load() found no row; recreated it at 1/1");
  }
  std::lock_guard<std::mutex> lock(mtx_);
  Apply(state);
  return o;
}

JsMessageStore::Factory::Outcome JsMessageStore::Forward(Factory::Request req,
                                                         bool fatal) const {
  req.id = id_;
  Factory::Outcome o = factory_.Call(req);
  switch (o.status) {
    case Factory::Status::kOk:
      return o;
    case Factory::Status::kAborted:
      // Teardown: no report, no poison (the engine is going away).
      Throw(req.method, o.error);
    case Factory::Status::kPending:
      Throw(req.method, "internal: pending outcome escaped");
    case Factory::Status::kThrew:
    case Factory::Status::kTimedOut:
      if (fatal) {
        Poison(req.method, o.error, /*unsettled=*/o.status == Factory::Status::kTimedOut);
      } else {
        if (o.status == Factory::Status::kTimedOut &&
            req.method == Factory::Method::kSetMessage) {
          // Counted before the throw, still under SS (see OnLateSettlement()).
          std::lock_guard<std::mutex> lock(mtx_);
          if (++unsettledSets_[req.a] == 0) unsettledSets_.erase(req.a);
        }
        factory_.ReportError(id_, req.method, o.error, /*poisoned=*/false,
                             /*late=*/false);
      }
      Throw(req.method, o.error);
  }
  Throw(req.method, "unknown outcome");
}

bool JsMessageStore::set(FIX::SEQNUM seq, const std::string& msg)
    EXCEPT(FIX::IOException) {
  CheckSafeSeq(seq, Factory::Method::kSetMessage, "set");
  Gate("setMessage");
  CheckStamp(seq);
  CheckUnsettledSet(seq);
  Factory::Request r;
  r.method = Factory::Method::kSetMessage;
  r.a = seq;
  r.msg = msg;
  Forward(r, /*fatal=*/false);
  return true;
}

void JsMessageStore::get(FIX::SEQNUM b, FIX::SEQNUM e,
                         std::vector<std::string>& out) const
    EXCEPT(FIX::IOException) {
  Gate("getMessages");
  Factory::Request r;
  r.method = Factory::Method::kGetMessages;
  r.a = b;
  r.b = e;
  out = Forward(r, /*fatal=*/false).strings;
}

// The two seqnum getters never move the cache (see the header): while
// poisoned they retry a pending reset, whose numbers the cache already holds
// (see reset()), and never reload, so every read QuickFIX makes between two
// writes returns the same number (generateLogon()'s shouldSendReset() and
// fill(), verify()'s too-high and too-low checks, nextLogon()'s and
// nextResendRequest()'s comparisons). Reloading is left to the writes and to
// getCreationTime().
FIX::SEQNUM JsMessageStore::CachedSeqNum(const char* what, bool sender) const {
  try {
    Gate(what, /*reload=*/false);
  } catch (const FIX::IOException&) {
  }
  std::lock_guard<std::mutex> lock(mtx_);
  return sender ? cache_.getNextSenderMsgSeqNum() : cache_.getNextTargetMsgSeqNum();
}

// Never throws (see the header): Session::fill() reads it outside sendRaw()'s
// try, from generateLogout() in Session::reset() on the connect path
// (setResponder(), no handler on the acceptor) and in QuickFIX's own catch
// handlers. Nothing stamped with it reaches the wire without persist(),
// whose writes throw inside sendRaw()'s try while the store is poisoned, and
// set() refuses a stamp a reload has since moved (CheckStamp()).
FIX::SEQNUM JsMessageStore::getNextSenderMsgSeqNum() const EXCEPT(FIX::IOException) {
  return CachedSeqNum("getNextSenderMsgSeqNum", /*sender=*/true);
}

// Never throws (see the header): Session::next(Message) reads it through
// nextQueued() AFTER its catch handlers, on every inbound message. The
// inbound path that read it goes on to incrNextTargetMsgSeqNum(), which does
// throw while poisoned and takes the session down.
FIX::SEQNUM JsMessageStore::getNextTargetMsgSeqNum() const EXCEPT(FIX::IOException) {
  return CachedSeqNum("getNextTargetMsgSeqNum", /*sender=*/false);
}

// Never throws (see the header): Session::setResponder() reads it through
// checkSessionTime() on the connect path, where the initiator swallows the
// exception with the session stuck "pending" for good and the acceptor has
// no handler at all. The one getter that reloads while poisoned: QuickFIX
// reads it first in every network-thread pass over the session (the tick
// Session::next(), Session::next(Message), setResponder()), before any seqnum
// read, so its reload never splits the reads of one pass. It is what retries
// a failing adapter on an idle session, once per tick (none while a
// timed-out one is unsettled, see Reload()); QuickFIX skips it with
// NonStopSession=Y, where the next write retries instead. If it fails the
// cached time is returned and the writes, which do throw, take the session
// down at its next send or inbound message.
FIX::UtcTimeStamp JsMessageStore::getCreationTime() const EXCEPT(FIX::IOException) {
  try {
    Gate("getCreationTime");
  } catch (const FIX::IOException&) {
  }
  std::lock_guard<std::mutex> lock(mtx_);
  return cache_.getCreationTime();
}

void JsMessageStore::setNextSenderMsgSeqNum(FIX::SEQNUM n) EXCEPT(FIX::IOException) {
  CheckSafeSeq(n, Factory::Method::kSetSeqNums, "setNextSenderMsgSeqNum");
  Gate("setNextSenderMsgSeqNum");
  Factory::Request r;
  r.method = Factory::Method::kSetSeqNums;
  {
    std::lock_guard<std::mutex> lock(mtx_);
    r.a = n;
    r.b = cache_.getNextTargetMsgSeqNum();
  }
  Forward(r, /*fatal=*/true);
  std::lock_guard<std::mutex> lock(mtx_);
  cache_.setNextSenderMsgSeqNum(n);
}

void JsMessageStore::setNextTargetMsgSeqNum(FIX::SEQNUM n) EXCEPT(FIX::IOException) {
  CheckSafeSeq(n, Factory::Method::kSetSeqNums, "setNextTargetMsgSeqNum");
  Gate("setNextTargetMsgSeqNum");
  Factory::Request r;
  r.method = Factory::Method::kSetSeqNums;
  {
    std::lock_guard<std::mutex> lock(mtx_);
    r.a = cache_.getNextSenderMsgSeqNum();
    r.b = n;
  }
  Forward(r, /*fatal=*/true);
  std::lock_guard<std::mutex> lock(mtx_);
  cache_.setNextTargetMsgSeqNum(n);
}

// Session::persist() calls it right after set(), or alone with
// PersistMessages=N. In the latter case there is no MsgSeqNum to check (see
// CheckStamp()): a store poisoned on entry means the message was stamped from
// the cache of a poisoned store, so it is refused even if this call's reload
// lifts the poison.
void JsMessageStore::incrNextSenderMsgSeqNum() EXCEPT(FIX::IOException) {
  const bool wasPoisoned = Poisoned();
  Gate("incrNextSenderMsgSeqNum");
  if (wasPoisoned) {
    const std::string why =
        "the message was stamped while the store was poisoned; refused, not sent";
    factory_.ReportError(id_, Factory::Method::kSetSeqNums, why, /*poisoned=*/false,
                         /*late=*/false);
    Throw(Factory::Method::kSetSeqNums, why);
  }
  FIX::SEQNUM next;
  {
    std::lock_guard<std::mutex> lock(mtx_);
    next = cache_.getNextSenderMsgSeqNum() + 1;
  }
  setNextSenderMsgSeqNum(next);
}

// Throws on failure (the inbound path's handler disconnects), except inside
// one of QuickFIX's own catch handlers (see InQuickFixHandler()): the
// UnsupportedVersion handler increments with no guard. There the failure has
// already been recorded (poison / 'storeError') and the cache keeps the old
// number; the Logout that handler sent sets sentLogout(), so the logout
// timeout disconnects the session.
//
// The inbound message was checked (verify()) against the target getter,
// which does not reload; on a store poisoned on entry, this call's reload is
// the first, and if it moved the target number the message was accepted
// against a number the store no longer holds. It is then not counted (no
// write on top of the moved number) and reported (non-poisoning
// 'storeError'), but this does NOT throw: nextQueued() reaches this call
// outside any try (Session.cpp:1157 from :1308; SocketConnection catches
// only InvalidMessage), where a throw is std::terminate, and the two call
// paths cannot be told apart from here. Nor does it poison: the reload left
// cache and adapter equal. The cache keeps the moved number, so QuickFIX's
// own sequence checks reconcile: the peer's next message is too low (Logout
// + disconnect) or too high (ResendRequest).
void JsMessageStore::incrNextTargetMsgSeqNum() EXCEPT(FIX::IOException) {
  const bool inHandler = InQuickFixHandler();
  try {
    bool wasPoisoned;
    FIX::SEQNUM seen;
    {
      std::lock_guard<std::mutex> lock(mtx_);
      wasPoisoned = poisoned_;
      seen = cache_.getNextTargetMsgSeqNum();
    }
    Gate("incrNextTargetMsgSeqNum");
    FIX::SEQNUM next;
    {
      std::lock_guard<std::mutex> lock(mtx_);
      next = cache_.getNextTargetMsgSeqNum() + 1;
    }
    if (wasPoisoned && next != seen + 1) {
      const std::string why =
          "the inbound message was checked against MsgSeqNum=" + std::to_string(seen) +
          " but the reload that lifted the poison moved the next target seqnum to " +
          std::to_string(next - 1) + "; not counted";
      LogEvent("Message store: " + why);
      factory_.ReportError(id_, Factory::Method::kSetSeqNums, why, /*poisoned=*/false,
                           /*late=*/false);
      return;
    }
    setNextTargetMsgSeqNum(next);
  } catch (const FIX::IOException&) {
    if (!inHandler) throw;
  }
}

void JsMessageStore::reset(const FIX::UtcTimeStamp& now) EXCEPT(FIX::IOException) {
  Factory::Request r;
  r.method = Factory::Method::kReset;
  r.id = id_;
  r.state.creationTime = now;
  r.state.nextSender = 1;
  r.state.nextTarget = 1;
  if (factory_.OnJsThread()) {
    // Engine constructor (session constructed outside session time): the
    // bridge is called directly and its Promise is collected by the TS
    // layer, whose create() awaits it and tears the engine down on
    // rejection. The cache takes the new state now, so getExpected*() read
    // 1/1 as soon as create() resolves.
    Factory::Outcome o = factory_.CallDirect(r);
    if (o.status == Factory::Status::kThrew) {
      Poison(r.method, o.error, /*unsettled=*/false);
      return;
    }
    std::lock_guard<std::mutex> lock(mtx_);
    cache_.reset(now);
    return;
  }
  try {
    Gate("reset");
    Forward(r, /*fatal=*/true);
    std::lock_guard<std::mutex> lock(mtx_);
    cache_.reset(now);
  } catch (const FIX::IOException&) {
    // Never throws into QuickFIX (see the header): the failure has been
    // recorded (poison + storeError) by Gate()/Forward(). The reset itself
    // is remembered: the poison lifts only once Gate() has retried it
    // (RetryReset()), never through a plain reload of the old numbers.
    // The cache takes the reset numbers now, as upstream's stores do (cache
    // first), so every read QuickFIX makes on its way to the wire agrees
    // whichever of their Gate() retries succeeds: generateLogon()'s
    // shouldSendReset() and fill() must both see 1, or a Logon leaves as
    // 34=1 without 141=Y. Nothing reloads the old numbers over it while the
    // reset is pending, and every write Gate()s (retries the reset) first.
    std::lock_guard<std::mutex> lock(mtx_);
    if (poisoned_) {
      pendingReset_ = true;
      pendingResetTime_ = now;
      cache_.reset(now);
    }
  }
}

void JsMessageStore::refresh() EXCEPT(FIX::IOException) {
  // A refresh is a reload. Not poisoned: load through the bridge and apply;
  // poisoned: Gate() does exactly that (or refuses). Never throws into
  // QuickFIX (see the header); SessionOpWorker reads Poisoned() afterwards.
  try {
    {
      std::unique_lock<std::mutex> lock(mtx_);
      if (poisoned_) {
        // The reload Gate() serves IS the refresh.
        lock.unlock();
        Gate("refresh");
        return;
      }
      if (reloadInFlight_) return;
      reloadInFlight_ = true;
    }
    Factory::Method failed = Factory::Method::kLoad;
    Factory::Outcome o = Reload(failed);
    {
      std::lock_guard<std::mutex> lock(mtx_);
      reloadInFlight_ = false;
    }
    if (o.status == Factory::Status::kOk || o.status == Factory::Status::kAborted) {
      return;
    }
    // Reload() already counted a timed-out load()/create() as unsettled.
    Poison(failed, o.error, /*unsettled=*/false);
  } catch (const FIX::IOException&) {
  }
}

FIX::SEQNUM JsMessageStore::CachedNextSender() const EXCEPT(FIX::IOException) {
  std::lock_guard<std::mutex> lock(mtx_);
  if (poisoned_) {
    throw FIX::IOException("message store poisoned (" + lastError_ + ")");
  }
  return cache_.getNextSenderMsgSeqNum();
}

FIX::SEQNUM JsMessageStore::CachedNextTarget() const EXCEPT(FIX::IOException) {
  std::lock_guard<std::mutex> lock(mtx_);
  if (poisoned_) {
    throw FIX::IOException("message store poisoned (" + lastError_ + ")");
  }
  return cache_.getNextTargetMsgSeqNum();
}

bool JsMessageStore::Poisoned() const {
  std::lock_guard<std::mutex> lock(mtx_);
  return poisoned_;
}

std::string JsMessageStore::LastError() const {
  std::lock_guard<std::mutex> lock(mtx_);
  return lastError_;
}

// Not clamped at 0: the waiter counts its timed-out call (Poison(), or
// Reload()/RetryReset() for load()/create()/reset, Forward() for setMessage)
// only after Call() returned, so a settlement racing that window arrives first
// and takes the counter to -1; the increment then brings it back to 0. Safe:
// the waiter holds SS throughout, so no store call reads the counter
// meanwhile. Every kExpired tracked call is counted exactly once (CallDirect()
// never times out; teardown's ForceFulfil() leaves nothing late, and the store
// dies with the engine; one dropped unrun by CallJs() is settled there), so
// the count is exact once both have run. setMessage counts per seqnum in
// unsettledSets_, outside the poison.
void JsMessageStore::OnLateSettlement(Factory::Method method, FIX::SEQNUM seq) {
  std::lock_guard<std::mutex> lock(mtx_);
  if (method == Factory::Method::kSetMessage) {
    if (--unsettledSets_[seq] == 0) unsettledSets_.erase(seq);
    return;
  }
  --unsettled_;
}

}  // namespace napi_quickfix
