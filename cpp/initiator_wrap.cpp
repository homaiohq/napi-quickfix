#include "initiator_wrap.h"

#include <string>

#include "quickfix/FileLog.h"
#include "quickfix/FileStore.h"

#include "engine_common.h"
#include "engine_workers.h"
#include "errors.h"
#include "session_settings_wrap.h"

namespace napi_quickfix {

Napi::FunctionReference InitiatorWrap::constructor_;

namespace {

std::string OptString(Napi::Object opts, const char* key,
                      const std::string& dflt) {
  if (opts.Has(key)) {
    Napi::Value v = opts.Get(key);
    if (v.IsString()) return v.As<Napi::String>().Utf8Value();
  }
  return dflt;
}

}  // namespace

Napi::Object InitiatorWrap::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(
      env, "Initiator",
      {
          InstanceMethod("start", &InitiatorWrap::Start),
          InstanceMethod("stop", &InitiatorWrap::Stop),
          InstanceMethod("isLoggedOn", &InitiatorWrap::IsLoggedOn),
          InstanceMethod("ref", &InitiatorWrap::Ref),
          InstanceMethod("unref", &InitiatorWrap::Unref),
          InstanceMethod("setCallbackEnabled", &InitiatorWrap::SetCallbackEnabled),
      });
  constructor_ = Napi::Persistent(func);
  constructor_.SuppressDestruct();
  exports.Set("InitiatorWrap", func);
  return exports;
}

InitiatorWrap::InitiatorWrap(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<InitiatorWrap>(info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsObject()) {
    throw Napi::TypeError::New(
        env, "new Initiator({ settings, handlers?, store?, log? })");
  }
  Napi::Object opts = info[0].As<Napi::Object>();

  SessionSettingsWrap* settingsWrap =
      SessionSettingsWrap::UnwrapArg(env, opts.Get("settings"), "settings");

  Napi::Object handlers;
  if (opts.Has("handlers") && opts.Get("handlers").IsObject()) {
    handlers = opts.Get("handlers").As<Napi::Object>();
  } else {
    handlers = Napi::Object::New(env);
  }

  std::string store = OptString(opts, "store", "file");
  std::string log = OptString(opts, "log", "screen");

  const FIX::SessionSettings& settings = settingsWrap->Settings();

  // Bridge must be created on the JS thread (captures env / handlers).
  bridge_ = std::make_unique<ApplicationBridge>(env, handlers);

  NQ_TRY(env) {
    if (store == "memory") {
      storeFactory_ = std::make_unique<FIX::MemoryStoreFactory>();
    } else {
      storeFactory_ = std::make_unique<FIX::FileStoreFactory>(settings);
    }

    if (log == "none") {
      logFactory_ = std::make_unique<NullLogFactory>();
    } else if (log == "file") {
      logFactory_ = std::make_unique<FIX::FileLogFactory>(settings);
    } else {
      logFactory_ = std::make_unique<FIX::ScreenLogFactory>(settings);
    }

    initiator_ = std::make_unique<FIX::SocketInitiator>(
        *bridge_, *storeFactory_, settings, *logFactory_);
  } NQ_CATCH(env)

  // Register a cleanup hook so teardown runs deterministically on the MAIN
  // thread during environment shutdown, BEFORE the TSFN is finalized. ObjectWrap
  // finalizers do NOT reliably run before env teardown when the loop is
  // unref'd, so relying on the destructor alone lets a live QuickFIX network
  // thread call into an already-destroyed TSFN and abort the process.
  env_ = env;
  cleanupHook_ = env.AddCleanupHook(&InitiatorWrap::CleanupEntry, this);
}

void InitiatorWrap::CleanupEntry(InitiatorWrap* self) {
  // Runs on the MAIN thread during env shutdown. Join network threads and tear
  // down the bridge before N-API destroys the TSFN. Mark fired so the later
  // destructor doesn't Remove() an already-freed cleanup hook (double free).
  self->cleanupHookFired_ = true;
  self->Teardown(true);
}

InitiatorWrap::~InitiatorWrap() {
  // If the object is GC-finalized BEFORE env shutdown, remove the cleanup hook
  // so it won't fire on freed memory. If the hook already fired, node already
  // freed the hook data — do NOT Remove() (that would double-free).
  if (!cleanupHookFired_ && !cleanupHook_.IsEmpty() && env_ != nullptr) {
    cleanupHook_.Remove(env_);
  }
  Teardown(true);
}

void InitiatorWrap::Teardown(bool force) {
  // Runs on the MAIN thread (finalizer / explicit teardown). MUST NOT block on a
  // JS round-trip and MUST NOT deadlock. Ordering matters:
  //   1. Deactivate the bridge (set a flag, no TSFN op): any callback firing on
  //      a QuickFIX network thread during the upcoming stop() will pass through
  //      immediately without touching the TSFN or waiting on the (frozen) JS
  //      loop. This breaks the stop()->onLogout->BlockingCall deadlock.
  //   2. stop(force): joins all QuickFIX network threads. After it returns, no
  //      network thread is running, so none can race into the TSFN.
  //   3. Abort the TSFN: safe now that no producer thread remains.
  if (stopped_) return;
  stopped_ = true;
  if (bridge_) {
    bridge_->Deactivate();
  }
  if (initiator_ && started_) {
    try {
      initiator_->stop(force);
    } catch (...) {
    }
  }
  if (bridge_) {
    bridge_->Abort();
  }
}

Napi::Value InitiatorWrap::Start(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  auto deferred = Napi::Promise::Deferred::New(env);
  if (stopped_) {
    deferred.Reject(Napi::Error::New(env, "Initiator has been stopped").Value());
    return deferred.Promise();
  }
  if (started_) {
    deferred.Resolve(env.Undefined());
    return deferred.Promise();
  }
  if (busy_) {
    deferred.Reject(
        Napi::Error::New(env, "Initiator start/stop already in progress")
            .Value());
    return deferred.Promise();
  }
  busy_ = true;
  started_ = true;  // set optimistically; reset in onSettled on failure

  FIX::SocketInitiator* initiator = initiator_.get();
  auto* self = this;
  auto* worker = new EngineOpWorker(
      env, info.This().As<Napi::Object>(),
      [initiator]() { initiator->start(); },
      [self](bool ok) {
        self->busy_ = false;
        // If start failed, mark not-started so teardown won't try to stop an
        // engine that never came up, and a later start() can retry.
        if (!ok) self->started_ = false;
      });
  Napi::Promise promise = worker->Promise();
  worker->Queue();
  return promise;
}

Napi::Value InitiatorWrap::Stop(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  bool force = false;
  if (info.Length() >= 1 && !info[0].IsUndefined()) {
    force = info[0].ToBoolean().Value();
  }
  auto deferred = Napi::Promise::Deferred::New(env);
  if (stopped_) {
    deferred.Resolve(env.Undefined());
    return deferred.Promise();
  }
  if (busy_) {
    deferred.Reject(
        Napi::Error::New(env, "Initiator start/stop already in progress")
            .Value());
    return deferred.Promise();
  }
  if (!initiator_ || !started_) {
    // Never started (or already torn down): just release the TSFN and resolve.
    stopped_ = true;
    if (bridge_) bridge_->Release();
    deferred.Resolve(env.Undefined());
    return deferred.Promise();
  }
  busy_ = true;
  stopped_ = true;

  FIX::SocketInitiator* initiator = initiator_.get();
  ApplicationBridge* bridge = bridge_.get();
  auto* self = this;
  auto* worker = new EngineOpWorker(
      env, info.This().As<Napi::Object>(),
      // stop() runs on the worker thread; its onLogout/toAdmin callbacks fire on
      // QuickFIX threads while the main loop is free to service the TSFN.
      [initiator, force]() { initiator->stop(force); },
      [self, bridge, force](bool /*ok*/) {
        self->busy_ = false;
        // Now that stop() has completed and no more callbacks will fire, drain
        // (or abort) the TSFN so the event loop can exit on its own.
        if (bridge) {
          if (force) {
            bridge->Abort();
          } else {
            bridge->Release();
          }
        }
      });
  Napi::Promise promise = worker->Promise();
  worker->Queue();
  return promise;
}

Napi::Value InitiatorWrap::IsLoggedOn(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!initiator_ || !started_ || stopped_) {
    return Napi::Boolean::New(env, false);
  }
  NQ_TRY(env) {
    return Napi::Boolean::New(env, initiator_->isLoggedOn());
  } NQ_CATCH(env)
}

Napi::Value InitiatorWrap::Ref(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (bridge_) bridge_->Ref(env);
  return info.This();
}

Napi::Value InitiatorWrap::Unref(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (bridge_) bridge_->Unref(env);
  return info.This();
}

Napi::Value InitiatorWrap::SetCallbackEnabled(const Napi::CallbackInfo& info) {
  return SetCallbackEnabledImpl(info, bridge_.get());
}

}  // namespace napi_quickfix
