#include "acceptor_wrap.h"

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

Napi::FunctionReference AcceptorWrap::constructor_;

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

Napi::Object AcceptorWrap::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(
      env, "Acceptor",
      {
          InstanceMethod("start", &AcceptorWrap::Start),
          InstanceMethod("stop", &AcceptorWrap::Stop),
          InstanceMethod("isLoggedOn", &AcceptorWrap::IsLoggedOn),
          InstanceMethod("getSessions", &AcceptorWrap::GetSessions),
          InstanceMethod("getSession", &AcceptorWrap::GetSession),
          InstanceMethod("ref", &AcceptorWrap::Ref),
          InstanceMethod("unref", &AcceptorWrap::Unref),
      });
  constructor_ = Napi::Persistent(func);
  constructor_.SuppressDestruct();
  exports.Set("AcceptorWrap", func);
  return exports;
}

AcceptorWrap::AcceptorWrap(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<AcceptorWrap>(info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsObject()) {
    throw Napi::TypeError::New(
        env, "new Acceptor({ settings, handlers?, store?, log? })");
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

    RejectDuplicateSessions(settings, "acceptor");
    acceptor_ = std::make_unique<FIX::SocketAcceptor>(
        *bridge_, *storeFactory_, settings, *logFactory_);
    sessionIDs_ = acceptor_->getSessions();
    SessionOpGate::Register(sessionIDs_, gate_);
  } NQ_CATCH(env)

  // Deterministic teardown on env shutdown, before the TSFN is finalized. See
  // InitiatorWrap for the rationale.
  env_ = env;
  cleanupHook_ = env.AddCleanupHook(&AcceptorWrap::CleanupEntry, this);
}

void AcceptorWrap::CleanupEntry(AcceptorWrap* self) {
  self->cleanupHookFired_ = true;
  self->Teardown(true);
}

AcceptorWrap::~AcceptorWrap() {
  if (!cleanupHookFired_ && !cleanupHook_.IsEmpty() && env_ != nullptr) {
    cleanupHook_.Remove(env_);
  }
  Teardown(true);
  DestroyEngine();
}

void AcceptorWrap::Teardown(bool force) {
  // Runs on the MAIN thread. Ordering (see InitiatorWrap::Teardown for detail):
  //   1. Deactivate the bridge so callbacks during stop() pass through without
  //      touching the TSFN or waiting on the frozen JS loop (breaks deadlock).
  //   2. stop(force): joins the QuickFIX network threads.
  //   3. Abort the TSFN: safe now that no producer thread remains.
  if (stopped_) return;
  stopped_ = true;
  if (bridge_) {
    bridge_->Deactivate();
  }
  if (acceptor_ && started_) {
    try {
      acceptor_->stop(force);
    } catch (...) {
    }
  }
  if (bridge_) {
    bridge_->Abort();
  }
}

// Destroy the FIX engine (and with it every FIX::Session it owns) on the JS
// thread, with no session operation in flight on a libuv thread. Called from
// the destructor only; stop() uses DestroyStoppedEngine() below instead, as
// its worker has already Freeze()d the gate on the worker thread (see Stop()).
// The gate is per engine, so Freeze() here only waits for operations on THIS
// engine's sessions, and Teardown() has already deactivated its bridge and
// joined its network threads: none of those operations can be blocked on the
// JS thread (or on a session mutex), so Freeze() cannot deadlock. Operations
// on other engines -- which may well be blocked in a BlockingCall that needs
// this very thread -- are not waited for.
void AcceptorWrap::DestroyEngine() {
  if (!acceptor_) return;
  gate_->Freeze();
  SessionOpGate::Unregister(sessionIDs_, gate_.get());
  acceptor_.reset();
  gate_->Unfreeze();
}

// The stop() path: the gate was frozen by the stop worker; destroy and lift
// the freeze. JS thread only.
void AcceptorWrap::DestroyStoppedEngine() {
  SessionOpGate::Unregister(sessionIDs_, gate_.get());
  acceptor_.reset();
  gate_->Unfreeze();
}

Napi::Value AcceptorWrap::Start(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  auto deferred = Napi::Promise::Deferred::New(env);
  if (stopped_) {
    deferred.Reject(Napi::Error::New(env, "Acceptor has been stopped").Value());
    return deferred.Promise();
  }
  if (started_) {
    deferred.Resolve(env.Undefined());
    return deferred.Promise();
  }
  if (busy_) {
    deferred.Reject(
        Napi::Error::New(env, "Acceptor start/stop already in progress")
            .Value());
    return deferred.Promise();
  }
  busy_ = true;
  started_ = true;  // optimistic; reset in onSettled on failure

  FIX::SocketAcceptor* acceptor = acceptor_.get();
  auto* self = this;
  auto* worker = new EngineOpWorker(
      env, info.This().As<Napi::Object>(),
      [acceptor]() { acceptor->start(); },
      [self](bool ok, const std::shared_ptr<EngineOpWorker::Settlement>& s) {
        self->busy_ = false;
        if (!ok) self->started_ = false;
        s->Settle();
      });
  Napi::Promise promise = worker->Promise();
  worker->Queue();
  return promise;
}

Napi::Value AcceptorWrap::Stop(const Napi::CallbackInfo& info) {
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
        Napi::Error::New(env, "Acceptor start/stop already in progress")
            .Value());
    return deferred.Promise();
  }
  if (!acceptor_) {
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
  FIX::SocketAcceptor* acceptor = acceptor_.get();
  ApplicationBridge* bridge = bridge_.get();
  const bool started = started_;
  std::shared_ptr<SessionOpGate> gate = gate_;
  auto* self = this;
  auto* worker = new EngineOpWorker(
      env, info.This().As<Napi::Object>(),
      // Runs on the worker thread. stop()'s onLogout/toAdmin callbacks fire on
      // QuickFIX threads while the main loop is free to service the TSFN.
      [acceptor, gate, started, force]() {
        try {
          if (started) acceptor->stop(force);
        } catch (...) {
          gate->Freeze();
          throw;
        }
        // stop() has joined the network threads. Now block new session
        // operations (SessionOpWorker / SendToTargetWorker) on THIS engine's
        // sessions and wait for the in-flight ones to finish: they hold raw
        // FIX::Session pointers that the destruction below is about to
        // invalidate. Waiting HERE, on the worker thread, keeps the JS loop
        // free for any BlockingCall such an operation is still making (e.g.
        // reset() -> toAdmin). Other engines' operations are unaffected.
        gate->Freeze();
      },
      [self, bridge, env, force](
          bool ok, const std::shared_ptr<EngineOpWorker::Settlement>& s) {
        self->busy_ = false;
        if (!ok) {
          // stop() threw part-way: the network threads may still be running,
          // so the engine is NOT safe to destroy. Keep it, let session
          // operations through again and clear stopped_ so that a later
          // stop() -- or the destructor's Teardown() -- retries; the bridge
          // stays active so those threads' callbacks keep reaching JS. Mirrors
          // Start() clearing started_ on failure.
          self->stopped_ = false;
          self->gate_->Unfreeze();
          s->Settle();
          return;
        }
        // stop() has completed: the network threads are joined and session
        // operations are frozen. Destroy the engine on the JS thread rather
        // than at GC: QuickFIX only deletes its FIX::Session objects -- and
        // removes them from the process-wide registry that lookupSession() /
        // sendToTarget() read -- in the engine destructor. Deferring that to GC
        // would leave stale Session handles resolvable and make a new engine
        // with the same SessionIDs fail with ConfigError "Duplicate Session"
        // until the old wrap happened to be collected. A stopped engine cannot
        // be restarted anyway (start() rejects once stopped_ is set).
        if (force || bridge == nullptr) {
          // Force: abort the TSFN, discarding any callback still queued (a
          // 'logout' listener may therefore never run), and destroy right away.
          if (bridge) bridge->Abort();
          self->DestroyStoppedEngine();
          s->Settle();
          return;
        }
        // Graceful: the 'logout' events stop() fired are still queued in the
        // bridge, and their listeners may read the session they name
        // (getSession() / Session handles are documented to stay live until
        // stop() settles). Nothing orders the TSFN's dispatch of those events
        // before this AsyncWorker completion, so destroy the engine -- and
        // settle the promise -- only once they have been dispatched: queue the
        // destruction through the bridge's own FIFO behind them, then release
        // the TSFN so it closes once drained. The owner reference held by the
        // settlement keeps this wrap alive until then.
        const bool queued = bridge->RunAfterQueued(env, [self, s](Napi::Env e) {
          if (e == nullptr) {
            // Discarded: the environment is being torn down. The wrap's own
            // teardown destroys the engine; nothing JS-side is safe here.
            s->Abandon();
            return;
          }
          self->DestroyStoppedEngine();
          s->Settle();
        });
        bridge->Release();
        if (!queued) {
          self->DestroyStoppedEngine();
          s->Settle();
        }
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
Napi::Value AcceptorWrap::IsLoggedOn(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const bool hasId = info.Length() >= 1 && !info[0].IsUndefined();
  // Validate the argument even when the engine is down, for a stable API.
  SessionIDWrap* id =
      hasId ? SessionIDWrap::UnwrapArg(env, info[0], "sessionID") : nullptr;
  if (!acceptor_ || !started_) {
    return Napi::Boolean::New(env, false);
  }
  NQ_TRY(env) {
    if (id == nullptr) {
      return Napi::Boolean::New(env, acceptor_->isLoggedOn());
    }
    FIX::Session* session = acceptor_->getSession(id->SessionID());
    return Napi::Boolean::New(env,
                              session != nullptr && session->isLoggedOn());
  } NQ_CATCH(env)
}

// getSessions(): SessionID[] -- the sessions this engine was configured with.
Napi::Value AcceptorWrap::GetSessions(const Napi::CallbackInfo& info) {
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
Napi::Value AcceptorWrap::GetSession(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  SessionIDWrap* id = SessionIDWrap::UnwrapArg(env, info[0], "sessionID");
  if (!acceptor_ || !acceptor_->has(id->SessionID())) {
    return env.Undefined();
  }
  return SessionWrap::NewInstance(env, id->SessionID());
}

Napi::Value AcceptorWrap::Ref(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (bridge_) bridge_->Ref(env);
  return info.This();
}

Napi::Value AcceptorWrap::Unref(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (bridge_) bridge_->Unref(env);
  return info.This();
}

}  // namespace napi_quickfix
