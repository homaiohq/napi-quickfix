#ifndef NAPI_QUICKFIX_ENGINE_WORKERS_H
#define NAPI_QUICKFIX_ENGINE_WORKERS_H

#include <napi.h>

#include <functional>
#include <utility>

#include "errors.h"

namespace napi_quickfix {

// A generic AsyncWorker that runs a blocking QuickFIX engine operation
// (start/stop) on a libuv worker thread and resolves/rejects a JS Promise.
//
// Why off-thread: start()/stop() synchronously invoke FIX::Application callbacks
// (toAdmin/toApp during send-on-logon, onLogout during stop) which the
// ApplicationBridge dispatches back to the JS thread via a TSFN BlockingCall +
// future. If the operation ran ON the JS thread, the event loop couldn't service
// the TSFN trampoline and we'd deadlock. Running it on a worker thread keeps the
// main event loop free to run CallJs.
//
// Lifetime: the worker holds a Napi::ObjectReference to the owning wrap object so
// it (and its bridge / engine / factories) can't be GC'd while the op is in
// flight. The ref is released in OnOK/OnError (both run on the JS thread).
class EngineOpWorker : public Napi::AsyncWorker {
 public:
  // onSettled receives `true` if the op succeeded, `false` if it threw.
  EngineOpWorker(Napi::Env env, Napi::Object owner, std::function<void()> op,
                 std::function<void(bool)> onSettled)
      : Napi::AsyncWorker(env),
        deferred_(Napi::Promise::Deferred::New(env)),
        op_(std::move(op)),
        onSettled_(std::move(onSettled)) {
    ownerRef_ = Napi::Persistent(owner);
  }

  Napi::Promise Promise() { return deferred_.Promise(); }

  // Runs on a libuv worker thread. NO Napi/JS access allowed here.
  void Execute() override {
    try {
      op_();
    } catch (const std::exception& e) {
      err_.Capture(e);
    } catch (...) {
      err_.has = true;
      err_.message = "unknown native error";
      err_.fixErrorName = "Error";
    }
  }

  // Runs on the JS thread.
  void OnOK() override {
    Napi::Env env = Env();
    Napi::HandleScope scope(env);
    if (onSettled_) onSettled_(!err_.has);
    if (err_.has) {
      deferred_.Reject(err_.ToError(env).Value());
    } else {
      deferred_.Resolve(env.Undefined());
    }
    ownerRef_.Reset();
  }

  // Runs on the JS thread (only if AsyncWorker::SetError was used; we don't, so
  // errors flow through OnOK — but provide OnError for completeness/safety).
  void OnError(const Napi::Error& e) override {
    Napi::Env env = Env();
    Napi::HandleScope scope(env);
    if (onSettled_) onSettled_(false);
    deferred_.Reject(e.Value());
    ownerRef_.Reset();
  }

 private:
  Napi::Promise::Deferred deferred_;
  Napi::ObjectReference ownerRef_;
  std::function<void()> op_;
  std::function<void(bool)> onSettled_;
  CapturedError err_;
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_ENGINE_WORKERS_H
