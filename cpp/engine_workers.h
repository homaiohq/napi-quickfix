#ifndef NAPI_QUICKFIX_ENGINE_WORKERS_H
#define NAPI_QUICKFIX_ENGINE_WORKERS_H

#include <napi.h>

#include <functional>
#include <utility>

#include "errors.h"
#include "quickfix/Exceptions.h"
#include "quickfix/Session.h"
#include "quickfix/SessionID.h"

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

// An AsyncWorker that runs a blocking per-session operation (logon / logout /
// disconnect / reset / refresh) against a FIX::Session on a libuv worker thread.
//
// Why off-thread: FIX::Session holds its m_mutex across the Application
// callbacks it fires (toAdmin/toApp inside sendRaw, onLogout inside disconnect).
// reset() and disconnect() both take that mutex and fire callbacks, so run ON
// the JS thread they would either block behind a QuickFIX thread that is itself
// waiting on the (now-blocked) event loop, or fire a BlockingCall the loop can't
// service — a deadlock either way. logon()/logout()/refresh() don't hold the
// session mutex today, but they are state transitions whose effect is only
// observable through callbacks, so they share the same async shape for a
// uniform API.
//
// Lifetime: FIX::Session objects are owned by the engine and looked up by value
// (FIX::SessionID) on the WORKER thread, never cached. A missing session is
// surfaced as a QuickFixError with fixErrorName 'SessionNotFound'.
class SessionOpWorker : public Napi::AsyncWorker {
 public:
  SessionOpWorker(Napi::Env env, FIX::SessionID id,
                  std::function<void(FIX::Session&)> op)
      : Napi::AsyncWorker(env),
        deferred_(Napi::Promise::Deferred::New(env)),
        id_(std::move(id)),
        op_(std::move(op)) {}

  Napi::Promise Promise() { return deferred_.Promise(); }

  // Worker thread. NO Napi/JS access.
  void Execute() override {
    try {
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
  std::function<void(FIX::Session&)> op_;
  CapturedError err_;
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_ENGINE_WORKERS_H
