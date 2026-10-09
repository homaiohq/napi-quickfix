#include "initiator_wrap.h"

#include <memory>
#include <string>

#include "quickfix/FileLog.h"
#include "quickfix/FileStore.h"

#include "engine_common.h"
#include "engine_workers.h"
#include "errors.h"
#include "session_id_wrap.h"
#include "session_op_gate.h"
#include "session_settings_wrap.h"
#include "session_wrap.h"

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
          InstanceMethod("getSessions", &InitiatorWrap::GetSessions),
          InstanceMethod("getSession", &InitiatorWrap::GetSession),
          InstanceMethod("ref", &InitiatorWrap::Ref),
          InstanceMethod("unref", &InitiatorWrap::Unref),
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
    sessionIDs_ = initiator_->getSessions();
    SessionOpGate::Register(sessionIDs_, gate_);
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
  DestroyEngine();
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

// Destroy the FIX engine (and with it every FIX::Session it owns) on the JS
// thread, with no session operation in flight on a libuv thread. Called from
// the destructor only; stop() does the same from its worker's OnOK, but there
// the Freeze() has already happened on the worker thread (see Stop()). The
// gate is per engine, so Freeze() here only waits for operations on THIS
// engine's sessions, and Teardown() has already deactivated its bridge and
// joined its network threads: none of those operations can be blocked on the
// JS thread (or on a session mutex), so Freeze() cannot deadlock. Operations
// on other engines -- which may well be blocked in a BlockingCall that needs
// this very thread -- are not waited for.
void InitiatorWrap::DestroyEngine() {
  if (!initiator_) return;
  gate_->Freeze();
  SessionOpGate::Unregister(sessionIDs_, gate_.get());
  initiator_.reset();
  gate_->Unfreeze();
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
  if (!initiator_) {
    // Already torn down: just release the TSFN and resolve.
    stopped_ = true;
    if (bridge_) bridge_->Release();
    deferred.Resolve(env.Undefined());
    return deferred.Promise();
  }
  busy_ = true;
  stopped_ = true;

  // A never-started engine takes the same async path (minus the stop() call):
  // its FIX::Session objects are registered from construction, so a session
  // operation may already be in flight against them and the destruction below
  // must wait for it just the same.
  FIX::SocketInitiator* initiator = initiator_.get();
  ApplicationBridge* bridge = bridge_.get();
  const bool started = started_;
  std::shared_ptr<SessionOpGate> gate = gate_;
  auto* self = this;
  auto* worker = new EngineOpWorker(
      env, info.This().As<Napi::Object>(),
      // Runs on the worker thread. stop()'s onLogout/toAdmin callbacks fire on
      // QuickFIX threads while the main loop is free to service the TSFN.
      [initiator, gate, started, force]() {
        try {
          if (started) initiator->stop(force);
        } catch (...) {
          gate->Freeze();
          throw;
        }
        // stop() has joined the network threads. Now block new session
        // operations (SessionOpWorker / SendToTargetWorker) on THIS engine's
        // sessions and wait for the in-flight ones to finish: they hold raw
        // FIX::Session pointers that the destruction in OnOK below is about
        // to invalidate. Waiting HERE, on the worker thread, keeps the JS loop
        // free for any BlockingCall such an operation is still making (e.g.
        // reset() -> toAdmin). Other engines' operations are unaffected.
        gate->Freeze();
      },
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
        // Nothing references the engine any more: network threads are joined
        // and session operations are frozen. Destroy it NOW (on the JS thread)
        // rather than at GC: QuickFIX only deletes its FIX::Session objects --
        // and removes them from the process-wide registry that
        // lookupSession()/sendToTarget() read -- in the engine destructor.
        // Deferring that to GC would leave stale Session handles resolvable
        // and make a new engine with the same SessionIDs fail with a
        // "Duplicate Session" ConfigError until the old wrap happened to be
        // collected. A stopped engine cannot be restarted anyway (start()
        // rejects once stopped_ is set).
        SessionOpGate::Unregister(self->sessionIDs_, self->gate_.get());
        self->initiator_.reset();
        self->gate_->Unfreeze();
      });
  Napi::Promise promise = worker->Promise();
  worker->Queue();
  return promise;
}

// isLoggedOn(sessionID?): with no argument, true if ANY session of this engine
// is logged on (FIX::Initiator/Acceptor::isLoggedOn); with a SessionID, true
// only if THAT session belongs to this engine and is logged on. Always false
// before start() and once stop() has settled; while a graceful stop() is in
// progress it still reports the live state (the engine is only destroyed when
// the stop() promise settles).
Napi::Value InitiatorWrap::IsLoggedOn(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const bool hasId = info.Length() >= 1 && !info[0].IsUndefined();
  // Validate the argument even when the engine is down, for a stable API.
  SessionIDWrap* id =
      hasId ? SessionIDWrap::UnwrapArg(env, info[0], "sessionID") : nullptr;
  if (!initiator_ || !started_) {
    return Napi::Boolean::New(env, false);
  }
  NQ_TRY(env) {
    if (id == nullptr) {
      return Napi::Boolean::New(env, initiator_->isLoggedOn());
    }
    FIX::Session* session = initiator_->getSession(id->SessionID());
    return Napi::Boolean::New(env,
                              session != nullptr && session->isLoggedOn());
  } NQ_CATCH(env)
}

// getSessions(): SessionID[] -- the sessions this engine was configured with.
Napi::Value InitiatorWrap::GetSessions(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Array out = Napi::Array::New(env, sessionIDs_.size());
  uint32_t i = 0;
  for (const FIX::SessionID& sid : sessionIDs_) {
    out.Set(i++, SessionIDWrap::NewInstance(env, sid));
  }
  return out;
}

// getSession(sessionID): Session | undefined -- undefined if the id is not one
// of this engine's sessions or stop() has settled (its sessions are destroyed
// then, see Stop()). While stop() is still in progress the sessions are alive
// and a handle is returned, e.g. for a 'logout' listener reading final seq nums.
Napi::Value InitiatorWrap::GetSession(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  SessionIDWrap* id = SessionIDWrap::UnwrapArg(env, info[0], "sessionID");
  if (!initiator_ || !initiator_->has(id->SessionID())) {
    return env.Undefined();
  }
  return SessionWrap::NewInstance(env, id->SessionID());
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

}  // namespace napi_quickfix
