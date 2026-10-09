#ifndef NAPI_QUICKFIX_ENGINE_WORKERS_H
#define NAPI_QUICKFIX_ENGINE_WORKERS_H

#include <napi.h>

#include <functional>
#include <memory>
#include <utility>

#include "errors.h"

namespace napi_quickfix {

// A generic AsyncWorker that runs a blocking QuickFIX engine operation
// (start/stop) on a libuv worker thread and resolves/rejects a JS Promise.
// (The per-message SendToTargetWorker lives in session_static.cpp.)
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
// flight. The reference is released when the promise is settled -- through
// the Settlement handed to onSettled, which the wrap may settle later than
// OnOK (on the JS thread) when the promise has to wait for deferred work,
// e.g. an engine destruction queued behind the bridge's pending callbacks.
class EngineOpWorker : public Napi::AsyncWorker {
 public:
  // The promise plus the owner reference, moved out of the worker (which
  // deletes itself once OnOK/OnError returns) so settling can outlive it.
  class Settlement {
   public:
    Settlement(Napi::Promise::Deferred deferred, Napi::ObjectReference ownerRef,
               CapturedError err)
        : deferred_(std::move(deferred)),
          ownerRef_(std::move(ownerRef)),
          err_(std::move(err)) {}

    // Resolve, or reject with the error the op threw, and release the owner
    // reference. JS thread only; idempotent.
    void Settle() {
      if (done_) return;
      done_ = true;
      Napi::Env env = deferred_.Env();
      Napi::HandleScope scope(env);
      if (err_.has) {
        deferred_.Reject(err_.ToError(env).Value());
      } else {
        deferred_.Resolve(env.Undefined());
      }
      ownerRef_.Reset();
    }

    // The environment is going away before the promise could be settled:
    // leave the promise pending and the reference to the environment's own
    // cleanup, touching nothing that may already be torn down.
    void Abandon() {
      if (done_) return;
      done_ = true;
      ownerRef_.SuppressDestruct();
    }

   private:
    Napi::Promise::Deferred deferred_;
    Napi::ObjectReference ownerRef_;
    CapturedError err_;
    bool done_ = false;
  };

  // onSettled(ok, settlement) runs on the JS thread once op() has returned
  // (ok) or thrown (!ok). It must eventually Settle() (or Abandon()) the
  // settlement -- right away, or later on the JS thread.
  using OnSettled =
      std::function<void(bool, const std::shared_ptr<Settlement>&)>;

  EngineOpWorker(Napi::Env env, Napi::Object owner, std::function<void()> op,
                 OnSettled onSettled)
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
    Napi::HandleScope scope(Env());
    Dispatch();
  }

  // Runs on the JS thread (only if AsyncWorker::SetError was used; we don't, so
  // errors flow through OnOK — but provide OnError for completeness/safety).
  void OnError(const Napi::Error& e) override {
    Napi::HandleScope scope(Env());
    err_.has = true;
    err_.message = e.Message();
    err_.fixErrorName = "Error";
    Dispatch();
  }

 private:
  void Dispatch() {
    const bool ok = !err_.has;
    auto settlement = std::make_shared<Settlement>(
        std::move(deferred_), std::move(ownerRef_), std::move(err_));
    if (onSettled_) {
      onSettled_(ok, settlement);
    } else {
      settlement->Settle();
    }
  }

  Napi::Promise::Deferred deferred_;
  Napi::ObjectReference ownerRef_;
  std::function<void()> op_;
  OnSettled onSettled_;
  CapturedError err_;
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_ENGINE_WORKERS_H
