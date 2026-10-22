#include "session_wrap.h"

#include <cmath>
#include <ctime>
#include <limits>
#include <memory>
#include <string>
#include <utility>

#include "errors.h"
#include "quickfix/Exceptions.h"
#include "quickfix/FieldTypes.h"
#include "session_id_wrap.h"
#include "session_op_gate.h"

namespace napi_quickfix {

Napi::FunctionReference SessionWrap::constructor_;

Napi::Object SessionWrap::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(
      env, "Session",
      {
          InstanceMethod("getSessionID", &SessionWrap::GetSessionID),

          InstanceMethod("isLoggedOn", &SessionWrap::IsLoggedOn),
          InstanceMethod("isEnabled", &SessionWrap::IsEnabled),
          InstanceMethod("sentLogon", &SessionWrap::SentLogon),
          InstanceMethod("sentLogout", &SessionWrap::SentLogout),
          InstanceMethod("receivedLogon", &SessionWrap::ReceivedLogon),
          InstanceMethod("isInitiator", &SessionWrap::IsInitiator),
          InstanceMethod("isAcceptor", &SessionWrap::IsAcceptor),
          InstanceMethod("isSessionTime", &SessionWrap::IsSessionTime),
          InstanceMethod("isLogonTime", &SessionWrap::IsLogonTime),

          InstanceMethod("getExpectedSenderNum",
                         &SessionWrap::GetExpectedSenderNum),
          InstanceMethod("getExpectedTargetNum",
                         &SessionWrap::GetExpectedTargetNum),
          InstanceMethod("setNextSenderMsgSeqNum",
                         &SessionWrap::SetNextSenderMsgSeqNum),
          InstanceMethod("setNextTargetMsgSeqNum",
                         &SessionWrap::SetNextTargetMsgSeqNum),

          InstanceMethod("getResetOnLogon", &SessionWrap::GetResetOnLogon),
          InstanceMethod("setResetOnLogon", &SessionWrap::SetResetOnLogon),
          InstanceMethod("getResetOnLogout", &SessionWrap::GetResetOnLogout),
          InstanceMethod("setResetOnLogout", &SessionWrap::SetResetOnLogout),
          InstanceMethod("getResetOnDisconnect",
                         &SessionWrap::GetResetOnDisconnect),
          InstanceMethod("setResetOnDisconnect",
                         &SessionWrap::SetResetOnDisconnect),
          InstanceMethod("getRefreshOnLogon", &SessionWrap::GetRefreshOnLogon),
          InstanceMethod("setRefreshOnLogon", &SessionWrap::SetRefreshOnLogon),
          InstanceMethod("getCheckCompId", &SessionWrap::GetCheckCompId),
          InstanceMethod("setCheckCompId", &SessionWrap::SetCheckCompId),
          InstanceMethod("getCheckLatency", &SessionWrap::GetCheckLatency),
          InstanceMethod("setCheckLatency", &SessionWrap::SetCheckLatency),
          InstanceMethod("getPersistMessages",
                         &SessionWrap::GetPersistMessages),
          InstanceMethod("setPersistMessages",
                         &SessionWrap::SetPersistMessages),
          InstanceMethod("getSendRedundantResendRequests",
                         &SessionWrap::GetSendRedundantResendRequests),
          InstanceMethod("setSendRedundantResendRequests",
                         &SessionWrap::SetSendRedundantResendRequests),
          InstanceMethod("getValidateLengthAndChecksum",
                         &SessionWrap::GetValidateLengthAndChecksum),
          InstanceMethod("setValidateLengthAndChecksum",
                         &SessionWrap::SetValidateLengthAndChecksum),
          InstanceMethod("getSendNextExpectedMsgSeqNum",
                         &SessionWrap::GetSendNextExpectedMsgSeqNum),
          InstanceMethod("setSendNextExpectedMsgSeqNum",
                         &SessionWrap::SetSendNextExpectedMsgSeqNum),
          InstanceMethod("getIsNonStopSession",
                         &SessionWrap::GetIsNonStopSession),
          InstanceMethod("setIsNonStopSession",
                         &SessionWrap::SetIsNonStopSession),
          InstanceMethod("getLogonTimeout", &SessionWrap::GetLogonTimeout),
          InstanceMethod("setLogonTimeout", &SessionWrap::SetLogonTimeout),
          InstanceMethod("getLogoutTimeout", &SessionWrap::GetLogoutTimeout),
          InstanceMethod("setLogoutTimeout", &SessionWrap::SetLogoutTimeout),
          InstanceMethod("getMaxLatency", &SessionWrap::GetMaxLatency),
          InstanceMethod("setMaxLatency", &SessionWrap::SetMaxLatency),
          InstanceMethod("getTimestampPrecision",
                         &SessionWrap::GetTimestampPrecision),
          InstanceMethod("setTimestampPrecision",
                         &SessionWrap::SetTimestampPrecision),

          InstanceMethod("logon", &SessionWrap::Logon),
          InstanceMethod("logout", &SessionWrap::Logout),
          InstanceMethod("refresh", &SessionWrap::Refresh),
      });

  constructor_ = Napi::Persistent(func);
  constructor_.SuppressDestruct();

  exports.Set("SessionWrap", func);
  return exports;
}

Napi::Object SessionWrap::NewInstance(Napi::Env env, const FIX::SessionID& id,
                                      std::shared_ptr<SessionOpGate> gate) {
  Napi::Object obj = constructor_.New({SessionIDWrap::NewInstance(env, id)});
  Unwrap(obj)->gate_ = std::move(gate);
  return obj;
}

SessionWrap::SessionWrap(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<SessionWrap>(info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1) {
    throw Napi::TypeError::New(
        env,
        "Session cannot be constructed directly; use lookupSession() or "
        "engine.getSession()");
  }
  // Copy by value: the wrap must outlive any SessionID JS object.
  id_ = SessionIDWrap::UnwrapArg(env, info[0], "sessionID")->SessionID();
}

// Engines are created and destroyed on the JS thread only, and so is this
// call, so the owner check and the lookup cannot interleave with an engine
// stop. During a graceful stop() the gate stays registered until the engine is
// destroyed (Freeze() -> Unregister() -> delete, all before stop() settles), so
// a 'logout' listener fired by the stop still resolves the session.
FIX::Session& SessionWrap::Resolve() {
  if (!gate_ || SessionOpGate::Lookup(id_) != gate_) {
    throw FIX::SessionNotFound(id_.toString());
  }
  FIX::Session* session = FIX::Session::lookupSession(id_);
  if (session == nullptr) {
    throw FIX::SessionNotFound(id_.toString());
  }
  return *session;
}

Napi::Value SessionWrap::GetSessionID(const Napi::CallbackInfo& info) {
  return SessionIDWrap::NewInstance(info.Env(), id_);
}

// --- generic helpers ---------------------------------------------------------

template <typename Fn>
Napi::Value SessionWrap::BoolGet(const Napi::CallbackInfo& info, Fn fn) {
  Napi::Env env = info.Env();
  NQ_TRY(env) {
    return Napi::Boolean::New(env, (Resolve().*fn)());
  } NQ_CATCH(env)
}

template <typename Fn>
Napi::Value SessionWrap::IntGet(const Napi::CallbackInfo& info, Fn fn) {
  Napi::Env env = info.Env();
  NQ_TRY(env) {
    return Napi::Number::New(env, static_cast<double>((Resolve().*fn)()));
  } NQ_CATCH(env)
}

template <typename Fn>
Napi::Value SessionWrap::BoolSet(const Napi::CallbackInfo& info, Fn fn,
                                 const char* name) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBoolean()) {
    throw Napi::TypeError::New(env, std::string(name) + "(value: boolean)");
  }
  const bool value = info[0].As<Napi::Boolean>().Value();
  NQ_TRY(env) {
    (Resolve().*fn)(value);
    return env.Undefined();
  } NQ_CATCH(env)
}

// The FIX::Session setters take a plain `int`; a double outside its range is
// undefined behaviour to cast (and on x86-64 lands on INT_MIN, which would e.g.
// make a MaxLatency reject every inbound message). Bound it here and report
// a RangeError, matching SeqNumSet / SetTimestampPrecision.
template <typename Fn>
Napi::Value SessionWrap::IntSet(const Napi::CallbackInfo& info, Fn fn,
                                const char* name) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) {
    throw Napi::TypeError::New(env, std::string(name) + "(value: number)");
  }
  const double raw = info[0].As<Napi::Number>().DoubleValue();
  constexpr double kIntMin = static_cast<double>(std::numeric_limits<int>::min());
  constexpr double kIntMax = static_cast<double>(std::numeric_limits<int>::max());
  if (!std::isfinite(raw) || std::floor(raw) != raw || raw < kIntMin ||
      raw > kIntMax) {
    throw Napi::RangeError::New(
        env, std::string(name) + ": value must be an integer in the int32 range");
  }
  NQ_TRY(env) {
    (Resolve().*fn)(static_cast<int>(raw));
    return env.Undefined();
  } NQ_CATCH(env)
}

// isSessionTime(nowMs?) / isLogonTime(nowMs?): `nowMs` is an epoch-millisecond
// number (Date.getTime()); omitted => the engine's current UTC clock.
Napi::Value SessionWrap::TimeCheck(const Napi::CallbackInfo& info,
                                   bool logonTime) {
  Napi::Env env = info.Env();
  bool hasNow = info.Length() >= 1 && !info[0].IsUndefined();
  double nowMs = 0;
  if (hasNow) {
    if (!info[0].IsNumber()) {
      throw Napi::TypeError::New(
          env, logonTime ? "isLogonTime(nowMs?: number)"
                         : "isSessionTime(nowMs?: number)");
    }
    nowMs = info[0].As<Napi::Number>().DoubleValue();
    // Bound to the range a JS Date can hold (+/- 100M days around the epoch)
    // before the floating-to-integer cast below: converting a finite double
    // that does not fit in time_t is undefined behaviour, not a saturation.
    constexpr double kMaxDateMs = 8.64e15;
    if (!std::isfinite(nowMs) || std::fabs(nowMs) > kMaxDateMs) {
      throw Napi::RangeError::New(
          env, "nowMs must be an epoch-millisecond number in the Date range");
    }
  }
  NQ_TRY(env) {
    FIX::Session& session = Resolve();
    FIX::UtcTimeStamp now = FIX::UtcTimeStamp::now();
    if (hasNow) {
      const double secs = std::floor(nowMs / 1000.0);
      const int millis = static_cast<int>(nowMs - secs * 1000.0);
      now = FIX::UtcTimeStamp(static_cast<time_t>(secs), millis);
    }
    return Napi::Boolean::New(env, logonTime ? session.isLogonTime(now)
                                             : session.isSessionTime(now));
  } NQ_CATCH(env)
}

// Sequence numbers are FIX::SEQNUM (uint64_t). JS numbers are exact up to
// 2^53, which is far beyond any practical MsgSeqNum; reject anything that is
// not a positive safe integer. MsgSeqNum (tag 34) is 1-based: QuickFIX's own
// SessionState::reset() and MemoryStore start at 1, and a peer answers 34=0
// with a Logout ("MsgSeqNum too low").
//
// The write itself runs on a worker (see the control section below): it
// takes SessionState::m_mutex and writes to the message store. It is NOT
// serialised against the engine: Session::sendRaw holds Session::m_mutex
// across fill() (reads the next sender num into the header), toApp/toAdmin
// and persist() (incrNextSenderMsgSeqNum from the store), and Session::next()
// likewise across the target-num verification, fromApp/fromAdmin and
// incrNextTargetMsgSeqNum. A setter landing inside that window -- from a
// handler, or while a sendToTarget() / heartbeat is in flight on this
// session -- is overwritten by the increment that follows, and the wire is
// left one off from the peer. The setters are meant for a quiescent session
// (before start(), from a 'logout' event, or when the caller knows nothing is
// in flight); documented on the JS API, not fixable here (m_mutex is
// private).
Napi::Value SessionWrap::SeqNumSet(const Napi::CallbackInfo& info, bool sender,
                                   const char* name) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) {
    throw Napi::TypeError::New(env, std::string(name) + "(seqNum: number)");
  }
  const double raw = info[0].As<Napi::Number>().DoubleValue();
  constexpr double kMaxSafe = 9007199254740991.0;  // Number.MAX_SAFE_INTEGER
  if (!std::isfinite(raw) || std::floor(raw) != raw || raw < 1 ||
      raw > kMaxSafe) {
    throw Napi::RangeError::New(
        env, std::string(name) + ": seqNum must be a positive safe integer");
  }
  const FIX::SEQNUM num = static_cast<FIX::SEQNUM>(raw);
  return RunOnWorker(info, [sender, num](FIX::Session& session) {
    if (sender) {
      session.setNextSenderMsgSeqNum(num);
    } else {
      session.setNextTargetMsgSeqNum(num);
    }
  });
}

// --- state getters -----------------------------------------------------------

Napi::Value SessionWrap::IsLoggedOn(const Napi::CallbackInfo& info) {
  return BoolGet(info, &FIX::Session::isLoggedOn);
}
Napi::Value SessionWrap::IsEnabled(const Napi::CallbackInfo& info) {
  return BoolGet(info, &FIX::Session::isEnabled);
}
Napi::Value SessionWrap::SentLogon(const Napi::CallbackInfo& info) {
  return BoolGet(info, &FIX::Session::sentLogon);
}
Napi::Value SessionWrap::SentLogout(const Napi::CallbackInfo& info) {
  return BoolGet(info, &FIX::Session::sentLogout);
}
Napi::Value SessionWrap::ReceivedLogon(const Napi::CallbackInfo& info) {
  return BoolGet(info, &FIX::Session::receivedLogon);
}
Napi::Value SessionWrap::IsInitiator(const Napi::CallbackInfo& info) {
  return BoolGet(info, &FIX::Session::isInitiator);
}
Napi::Value SessionWrap::IsAcceptor(const Napi::CallbackInfo& info) {
  return BoolGet(info, &FIX::Session::isAcceptor);
}
Napi::Value SessionWrap::IsSessionTime(const Napi::CallbackInfo& info) {
  return TimeCheck(info, /*logonTime=*/false);
}
Napi::Value SessionWrap::IsLogonTime(const Napi::CallbackInfo& info) {
  return TimeCheck(info, /*logonTime=*/true);
}

// --- sequence numbers --------------------------------------------------------

Napi::Value SessionWrap::GetExpectedSenderNum(const Napi::CallbackInfo& info) {
  return IntGet(info, &FIX::Session::getExpectedSenderNum);
}
Napi::Value SessionWrap::GetExpectedTargetNum(const Napi::CallbackInfo& info) {
  return IntGet(info, &FIX::Session::getExpectedTargetNum);
}
Napi::Value SessionWrap::SetNextSenderMsgSeqNum(
    const Napi::CallbackInfo& info) {
  return SeqNumSet(info, /*sender=*/true, "setNextSenderMsgSeqNum");
}
Napi::Value SessionWrap::SetNextTargetMsgSeqNum(
    const Napi::CallbackInfo& info) {
  return SeqNumSet(info, /*sender=*/false, "setNextTargetMsgSeqNum");
}

// --- runtime options ---------------------------------------------------------

#define NQ_BOOL_OPTION(Name)                                                   \
  Napi::Value SessionWrap::Get##Name(const Napi::CallbackInfo& info) {         \
    return BoolGet(info, &FIX::Session::get##Name);                            \
  }                                                                            \
  Napi::Value SessionWrap::Set##Name(const Napi::CallbackInfo& info) {         \
    return BoolSet(info, &FIX::Session::set##Name, "set" #Name);               \
  }

#define NQ_INT_OPTION(Name)                                                    \
  Napi::Value SessionWrap::Get##Name(const Napi::CallbackInfo& info) {         \
    return IntGet(info, &FIX::Session::get##Name);                             \
  }                                                                            \
  Napi::Value SessionWrap::Set##Name(const Napi::CallbackInfo& info) {         \
    return IntSet(info, &FIX::Session::set##Name, "set" #Name);                \
  }

NQ_BOOL_OPTION(ResetOnLogon)
NQ_BOOL_OPTION(ResetOnLogout)
NQ_BOOL_OPTION(ResetOnDisconnect)
NQ_BOOL_OPTION(RefreshOnLogon)
NQ_BOOL_OPTION(CheckCompId)
NQ_BOOL_OPTION(CheckLatency)
NQ_BOOL_OPTION(PersistMessages)
NQ_BOOL_OPTION(SendRedundantResendRequests)
NQ_BOOL_OPTION(ValidateLengthAndChecksum)
NQ_BOOL_OPTION(SendNextExpectedMsgSeqNum)
NQ_BOOL_OPTION(IsNonStopSession)
NQ_INT_OPTION(LogonTimeout)
NQ_INT_OPTION(LogoutTimeout)
NQ_INT_OPTION(MaxLatency)

#undef NQ_BOOL_OPTION
#undef NQ_INT_OPTION

Napi::Value SessionWrap::GetTimestampPrecision(const Napi::CallbackInfo& info) {
  return IntGet(info, &FIX::Session::getTimestampPrecision);
}

// FIX::Session::setTimestampPrecision silently ignores values outside 0..9;
// surface that as a RangeError instead of a no-op.
Napi::Value SessionWrap::SetTimestampPrecision(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) {
    throw Napi::TypeError::New(env, "setTimestampPrecision(precision: number)");
  }
  const double raw = info[0].As<Napi::Number>().DoubleValue();
  if (!std::isfinite(raw) || std::floor(raw) != raw || raw < 0 || raw > 9) {
    throw Napi::RangeError::New(
        env, "setTimestampPrecision: precision must be an integer in 0..9");
  }
  NQ_TRY(env) {
    Resolve().setTimestampPrecision(static_cast<int>(raw));
    return env.Undefined();
  } NQ_CATCH(env)
}

// --- control ------------------------------------------------------------------
// logon()/logout()/refresh() and the two sequence-number setters run on a
// libuv worker, like sendToTarget(), and return a Promise. The reason is the
// lock they take, not the work they do: each goes through SessionState, whose
// mutex a QuickFIX network thread -- or a sendToTarget() worker, which runs
// Session::sendRaw -- holds while it persists through the message store. With
// a JS message store (js_message_store.h) that thread is parked under the
// mutex until the JS event loop has served its call; a member taking the same
// mutex ON the JS thread would then block the loop that has to release it:
// LOOP -> SessionState::m_mutex -> LOOP, a hard deadlock of the whole process
// (reproduced in the issue #29 spike, with or without a JS store call in
// flight at the time of the call, since even a synchronous adapter runs on the
// loop). On a worker the loop stays free and the member merely waits its
// turn. The JS layer serialises these five members per session, so
// `logout(); logon();` still takes effect in that order.
//
// logon()/logout() flip SessionState's `enabled` flag, a plain bool that the
// engine's network thread reads in Session::next() under Session::m_mutex
// while these members write it without one -- formally a data race, the same
// one FIX::Initiator::stop() makes when it calls logout()/logon() on every
// session from the stopping thread. In practice the network thread observes
// the flag on its next pass; this binding does not patch QuickFIX to make it
// atomic.
//
// The worker holds the engine's SessionOpGate for the whole operation
// (SessionOpGate::Acquire), exactly as SendToTargetWorker does, so the engine
// cannot destroy the session under it; the gate was bound when the handle was
// created, so the operation can never run against a later engine that reuses
// the id. The pre-check on the JS thread rejects a handle whose engine is
// already gone without queuing anything.
//
// FIX::Session::disconnect() and reset() are deliberately NOT exposed. Through
// the session's responder they reach FIX::SocketMonitor::drop(), which mutates
// the monitor's socket sets with no lock while the engine's network thread
// iterates them in SocketMonitor::block(); QuickFIX only ever calls them from
// that thread itself (upstream issue #346, closed "not planned"). Any thread
// this binding could run them on -- JS or libuv -- races it. logout() is the
// supported way to bring a session down from the application.

namespace {

class SessionOpWorker : public Napi::AsyncWorker {
 public:
  SessionOpWorker(Napi::Env env, FIX::SessionID id,
                  std::shared_ptr<SessionOpGate> gate,
                  std::function<void(FIX::Session&)> op)
      : Napi::AsyncWorker(env),
        deferred_(Napi::Promise::Deferred::New(env)),
        id_(std::move(id)),
        gate_(std::move(gate)),
        op_(std::move(op)) {}

  Napi::Promise Promise() { return deferred_.Promise(); }

  // Worker thread. NO Napi/JS access.
  void Execute() override {
    try {
      std::unique_ptr<SessionOpGate::OpScope> inflight =
          SessionOpGate::Acquire(gate_, id_);
      if (!inflight) {
        throw FIX::SessionNotFound(id_.toString());
      }
      FIX::Session* session = FIX::Session::lookupSession(id_);
      if (session == nullptr) {
        throw FIX::SessionNotFound(id_.toString());
      }
      op_(*session);
    } catch (const std::exception& e) {
      err_.Capture(e);
    } catch (...) {
      err_.has = true;
      err_.message = "unknown native error";
      err_.fixErrorName = "Error";
    }
  }

  void OnOK() override {
    Napi::Env env = Env();
    Napi::HandleScope scope(env);
    if (err_.has) {
      deferred_.Reject(err_.ToError(env).Value());
    } else {
      deferred_.Resolve(env.Undefined());
    }
  }

  void OnError(const Napi::Error& e) override {
    Napi::HandleScope scope(Env());
    deferred_.Reject(e.Value());
  }

 private:
  Napi::Promise::Deferred deferred_;
  FIX::SessionID id_;
  std::shared_ptr<SessionOpGate> gate_;
  std::function<void(FIX::Session&)> op_;
  CapturedError err_;
};

}  // namespace

Napi::Value SessionWrap::RunOnWorker(const Napi::CallbackInfo& info,
                                     std::function<void(FIX::Session&)> op) {
  Napi::Env env = info.Env();
  // Same owner check as Resolve(), on the JS thread: a handle whose engine
  // is gone (or whose id now belongs to another engine) is refused before
  // anything is queued. The worker re-checks under the gate.
  if (!gate_ || SessionOpGate::Lookup(id_) != gate_) {
    CapturedError err;
    err.Capture(FIX::SessionNotFound(id_.toString()));
    auto deferred = Napi::Promise::Deferred::New(env);
    deferred.Reject(err.ToError(env).Value());
    return deferred.Promise();
  }
  auto* worker = new SessionOpWorker(env, id_, gate_, std::move(op));
  Napi::Promise promise = worker->Promise();
  worker->Queue();
  return promise;
}

Napi::Value SessionWrap::Logon(const Napi::CallbackInfo& info) {
  return RunOnWorker(info, [](FIX::Session& session) { session.logon(); });
}

Napi::Value SessionWrap::Logout(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  std::string reason;
  if (info.Length() >= 1 && !info[0].IsUndefined()) {
    if (!info[0].IsString()) {
      throw Napi::TypeError::New(env, "logout(reason?: string)");
    }
    reason = info[0].As<Napi::String>().Utf8Value();
  }
  return RunOnWorker(
      info, [reason](FIX::Session& session) { session.logout(reason); });
}

// Rejects with IOException (as a QuickFixError) if the message store cannot
// be read.
Napi::Value SessionWrap::Refresh(const Napi::CallbackInfo& info) {
  return RunOnWorker(info, [](FIX::Session& session) { session.refresh(); });
}

}  // namespace napi_quickfix
