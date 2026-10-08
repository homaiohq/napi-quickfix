#include <napi.h>

#include <set>
#include <string>
#include <utility>

#include "errors.h"
#include "message_wrap.h"
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
// uses the raw pointer, so Execute() runs under a SessionOpGate::OpScope to
// keep the owning engine alive until the send has returned.
class SendToTargetWorker : public Napi::AsyncWorker {
 public:
  SendToTargetWorker(Napi::Env env, FIX::Message message, FIX::SessionID id)
      : Napi::AsyncWorker(env),
        deferred_(Napi::Promise::Deferred::New(env)),
        message_(std::move(message)),
        byId_(true),
        id_(std::move(id)) {}

  SendToTargetWorker(Napi::Env env, FIX::Message message, std::string qualifier)
      : Napi::AsyncWorker(env),
        deferred_(Napi::Promise::Deferred::New(env)),
        message_(std::move(message)),
        byId_(false),
        qualifier_(std::move(qualifier)) {}

  Napi::Promise Promise() { return deferred_.Promise(); }

  // Worker thread. NO Napi/JS access.
  void Execute() override {
    SessionOpGate::OpScope inflight;
    try {
      result_ = byId_ ? FIX::Session::sendToTarget(message_, id_)
                      : FIX::Session::sendToTarget(message_, qualifier_);
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
  bool byId_;
  FIX::SessionID id_;
  std::string qualifier_;
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
  SendToTargetWorker* worker = nullptr;
  if (info.Length() < 2 || info[1].IsUndefined()) {
    worker = new SendToTargetWorker(env, msg->Message(), std::string());
  } else if (info[1].IsString()) {
    worker = new SendToTargetWorker(env, msg->Message(),
                                    info[1].As<Napi::String>().Utf8Value());
  } else {
    SessionIDWrap* id = SessionIDWrap::UnwrapArg(env, info[1], "sessionID");
    worker = new SendToTargetWorker(env, msg->Message(), id->SessionID());
  }
  Napi::Promise promise = worker->Promise();
  worker->Queue();
  return promise;
}

// lookupSession(sessionID: SessionID): Session | undefined
Napi::Value LookupSession(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  SessionIDWrap* id = SessionIDWrap::UnwrapArg(env, info[0], "sessionID");
  NQ_TRY(env) {
    if (!FIX::Session::doesSessionExist(id->SessionID())) {
      return env.Undefined();
    }
    return SessionWrap::NewInstance(env, id->SessionID());
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
