#include <napi.h>

#include <memory>
#include <set>
#include <string>
#include <utility>

#include "errors.h"
#include "field_map_ops.h"
#include "message_wrap.h"
#include "quickfix/Exceptions.h"
#include "quickfix/Message.h"
#include "quickfix/Session.h"
#include "quickfix/SessionID.h"
#include "session_id_wrap.h"
#include "session_op_gate.h"
#include "session_wrap.h"

namespace napi_quickfix {

namespace {

// AsyncWorker for FIX::Session::sendToTarget. Runs OFF the JS main thread so the
// event loop stays free to service the ApplicationBridge TSFN BlockingCall(s)
// that toApp/toAdmin trigger during the send. Running on the main thread would
// deadlock (main blocked in sendToTarget -> toApp -> BlockingCall -> waits for
// main to run CallJs, which it can't).
//
// The FIX::Message and FIX::SessionID are COPIED BY VALUE on the JS thread
// before Queue()ing, so Execute() never touches any JS object. toApp may mutate
// the worker's private copy during send — that's fine, it's QuickFIX's business.
//
// Two upstream overloads are supported: by explicit SessionID, or by qualifier
// (QuickFIX then resolves the session from the message's own header fields:
// BeginString / SenderCompID / TargetCompID).
//
// Session::sendToTarget looks the session up in the process-wide registry and
// uses the raw pointer, so Execute() runs under the owning engine's
// SessionOpGate::OpScope to keep that engine alive until the send has returned.
// That gate is resolved by SendToTarget() on the JS thread, before the worker
// is queued (for the qualifier form after deriving the SessionID from the
// message header, exactly as the upstream overload does): the send is thereby
// bound to the engine that owned the session when it was called, and can
// never run through an engine registered for the same id afterwards -- not
// even if it sat in the libuv queue across the owner's stop() and that
// engine's construction. Execute() only re-checks that the gate is still the
// owner once the scope is held (see session_op_gate.h).
class SendToTargetWorker : public Napi::AsyncWorker {
 public:
  SendToTargetWorker(Napi::Env env, FIX::Message message, FIX::SessionID id,
                     std::shared_ptr<SessionOpGate> gate)
      : Napi::AsyncWorker(env),
        deferred_(Napi::Promise::Deferred::New(env)),
        message_(std::move(message)),
        id_(std::move(id)),
        gate_(std::move(gate)) {}

  Napi::Promise Promise() { return deferred_.Promise(); }

  // Worker thread. NO Napi/JS access.
  void Execute() override {
    try {
      std::unique_ptr<SessionOpGate::OpScope> inflight =
          SessionOpGate::Acquire(gate_, id_);
      if (!inflight) {
        throw FIX::SessionNotFound(id_.toString());
      }
      result_ = FIX::Session::sendToTarget(message_, id_);
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
      deferred_.Resolve(Napi::Boolean::New(env, result_));
    }
  }

  void OnError(const Napi::Error& e) override {
    Napi::HandleScope scope(Env());
    deferred_.Reject(e.Value());
  }

 private:
  Napi::Promise::Deferred deferred_;
  FIX::Message message_;
  FIX::SessionID id_;
  std::shared_ptr<SessionOpGate> gate_;
  bool result_ = false;
  CapturedError err_;
};

// sendToTarget(message: Message, sessionID: SessionID): Promise<boolean>
// sendToTarget(message: Message, qualifier?: string): Promise<boolean>
Napi::Value SendToTarget(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  MessageWrap* msg = MessageWrap::UnwrapArg(env, info[0], "message");

  // Copy the message (and session id) by value on the JS thread so the worker
  // never touches JS-owned objects.
  FIX::Message message = fieldmap::CloneMessage(msg->Message());
  const bool byQualifier = info.Length() < 2 || info[1].IsUndefined() ||
                           info[1].IsString();
  FIX::SessionID id;
  if (!byQualifier) {
    id = SessionIDWrap::UnwrapArg(env, info[1], "sessionID")->SessionID();
  }

  // Resolve the owning engine HERE, on the JS thread (see the worker's
  // comment): a session that no engine owns is refused right away, with the
  // same error the worker reports when the engine goes away under it.
  std::shared_ptr<SessionOpGate> gate;
  try {
    if (byQualifier) {
      // Mirrors FIX::Session::sendToTarget(Message&, const std::string&):
      // a header missing tag 8/49/56 is a SessionNotFound.
      const std::string qualifier =
          info[1].IsString() ? info[1].As<Napi::String>().Utf8Value()
                             : std::string();
      try {
        id = message.getSessionID(qualifier);
      } catch (const FIX::FieldNotFound&) {
        throw FIX::SessionNotFound();
      }
    }
    gate = SessionOpGate::Lookup(id);
    if (!gate) {
      throw FIX::SessionNotFound(id.toString());
    }
  } catch (const FIX::Exception& e) {
    CapturedError err;
    err.Capture(e);
    auto deferred = Napi::Promise::Deferred::New(env);
    deferred.Reject(err.ToError(env).Value());
    return deferred.Promise();
  }

  auto* worker = new SendToTargetWorker(env, std::move(message), std::move(id),
                                        std::move(gate));
  Napi::Promise promise = worker->Promise();
  worker->Queue();
  return promise;
}

// lookupSession(sessionID: SessionID): Session | undefined
Napi::Value LookupSession(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  SessionIDWrap* id = SessionIDWrap::UnwrapArg(env, info[0], "sessionID");
  NQ_TRY(env) {
    // The gate of the engine owning the id; registered by every wrap
    // constructor right after it created its sessions, unregistered right
    // before they are destroyed, so (both on the JS thread) a session that
    // exists has exactly one. No gate means no session.
    std::shared_ptr<SessionOpGate> gate = SessionOpGate::Lookup(id->SessionID());
    if (!gate || !FIX::Session::doesSessionExist(id->SessionID())) {
      return env.Undefined();
    }
    return SessionWrap::NewInstance(env, id->SessionID(), std::move(gate));
  } NQ_CATCH(env)
}

// doesSessionExist(sessionID: SessionID): boolean
Napi::Value DoesSessionExist(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  SessionIDWrap* id = SessionIDWrap::UnwrapArg(env, info[0], "sessionID");
  NQ_TRY(env) {
    return Napi::Boolean::New(env,
                              FIX::Session::doesSessionExist(id->SessionID()));
  } NQ_CATCH(env)
}

// getSessions(): SessionID[]  -- every session registered in this process.
Napi::Value GetSessions(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  NQ_TRY(env) {
    const std::set<FIX::SessionID> ids = FIX::Session::getSessions();
    Napi::Array out = Napi::Array::New(env, ids.size());
    uint32_t i = 0;
    for (const FIX::SessionID& id : ids) {
      out.Set(i++, SessionIDWrap::NewInstance(env, id));
    }
    return out;
  } NQ_CATCH(env)
}

// numSessions(): number
Napi::Value NumSessions(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  NQ_TRY(env) {
    return Napi::Number::New(env,
                             static_cast<double>(FIX::Session::numSessions()));
  } NQ_CATCH(env)
}

}  // namespace

void RegisterSessionStatic(Napi::Env env, Napi::Object exports) {
  exports.Set("sendToTarget",
              Napi::Function::New(env, SendToTarget, "sendToTarget"));
  exports.Set("lookupSession",
              Napi::Function::New(env, LookupSession, "lookupSession"));
  exports.Set("doesSessionExist",
              Napi::Function::New(env, DoesSessionExist, "doesSessionExist"));
  exports.Set("getSessions",
              Napi::Function::New(env, GetSessions, "getSessions"));
  exports.Set("numSessions",
              Napi::Function::New(env, NumSessions, "numSessions"));
}

}  // namespace napi_quickfix
