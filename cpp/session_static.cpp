#include <napi.h>

#include <utility>

#include "errors.h"
#include "field_map_ops.h"
#include "message_wrap.h"
#include "quickfix/Message.h"
#include "quickfix/Session.h"
#include "quickfix/SessionID.h"
#include "session_id_wrap.h"

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
class SendToTargetWorker : public Napi::AsyncWorker {
 public:
  SendToTargetWorker(Napi::Env env, FIX::Message message, FIX::SessionID id)
      : Napi::AsyncWorker(env),
        deferred_(Napi::Promise::Deferred::New(env)),
        message_(std::move(message)),
        id_(std::move(id)) {}

  Napi::Promise Promise() { return deferred_.Promise(); }

  // Worker thread. NO Napi/JS access.
  void Execute() override {
    try {
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
  bool result_ = false;
  CapturedError err_;
};

}  // namespace

// sendToTarget(message: Message, sessionID: SessionID): Promise<boolean>
static Napi::Value SendToTarget(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  MessageWrap* msg = MessageWrap::UnwrapArg(env, info[0], "message");
  SessionIDWrap* id = SessionIDWrap::UnwrapArg(env, info[1], "sessionID");

  // Copy the message and session id by value on the JS thread so the worker
  // never touches JS-owned objects.
  FIX::Message copy;
  CopyMessage(copy, msg->Message());  // group instances keep their delimiters
  auto* worker =
      new SendToTargetWorker(env, std::move(copy), id->SessionID());
  Napi::Promise promise = worker->Promise();
  worker->Queue();
  return promise;
}

void RegisterSessionStatic(Napi::Env env, Napi::Object exports) {
  exports.Set("sendToTarget",
              Napi::Function::New(env, SendToTarget, "sendToTarget"));
}

}  // namespace napi_quickfix
