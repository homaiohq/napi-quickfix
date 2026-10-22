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
    if (opts.Has("store") && opts.Get("store").IsObject()) {
      auto js = std::make_unique<JsMessageStoreFactory>(
          env, opts.Get("store").As<Napi::Object>(),
          JsMessageStoreFactory::ReadSeeds(env, opts.Get("storeStates")),
          JsMessageStoreFactory::ReadTimeout(env, opts.Get("storeTimeoutMs")));
      jsStore_ = js.get();
      storeFactory_ = std::move(js);
    } else if (store == "memory") {
      storeFactory_ = std::make_unique<FIX::MemoryStoreFactory>();
    } else {
      storeFactory_ = std::make_unique<FIX::FileStoreFactory>(settings);
    }

    std::unique_ptr<FIX::LogFactory> logFactory;
    if (log == "none") {
      logFactory = std::make_unique<NullLogFactory>();
    } else if (log == "file") {
      logFactory = std::make_unique<FIX::FileLogFactory>(settings);
    } else {
      logFactory = std::make_unique<FIX::ScreenLogFactory>(settings);
    }
    logFactory_ = std::make_unique<TrackingLogFactory>(std::move(logFactory));

    RejectDuplicateSessions(settings, "initiator");
    try {
      initiator_ = std::make_unique<FIX::SocketInitiator>(
          *bridge_, *storeFactory_, settings, *logFactory_);
    } catch (...) {
      // A [SESSION] after the first valid one threw: QuickFIX has leaked the
      // sessions it had already created (see DestroyOrphanedSessions) and the
      // engine-level Log it requested before creating any of them (see
      // TrackingLogFactory). Both would otherwise only have been reclaimed by
      // the engine destructor that never runs.
      DestroyOrphanedSessions(settings, "initiator");
      logFactory_->DestroyOrphanedEngineLog();
      throw;
    }
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
  //      loop, and every BlockingCall already waiting is woken. This breaks
  //      the stop()->onLogout->BlockingCall deadlock.
  //   2. Join the stop() worker if one is in flight: its operation may still
  //      be inside FIX::Initiator::stop() -- or waiting in gate->Freeze() for
  //      a sendToTarget() that step 1 has just unblocked -- on a libuv thread,
  //      and the destructor's DestroyEngine() that follows Teardown() must not
  //      delete the engine under it. (Node drains the thread pool before it
  //      runs cleanup hooks or finalizers, so this wait is expected to return
  //      at once; it makes the ordering a property of this code rather than
  //      of Node's shutdown sequence.) This is also why the early return is
  //      keyed on tornDown_, not stopped_: stopped_ is set for the whole
  //      duration of an in-flight stop().
  //   3. stop(force): joins all QuickFIX network threads. A no-op if the
  //      worker's stop() completed (FIX::Initiator::isStopped()); the real
  //      stop if it threw part-way or no stop() was ever called. After it
  //      returns, no network thread is running, so none can race into the TSFN.
  //   4. Abort the TSFN: safe now that no producer thread remains.
  if (tornDown_) return;
  tornDown_ = true;
  stopped_ = true;
  // The store bridge first: a network thread parked in a store call holds
  // SessionState::m_mutex, which the stop() below takes (logout()).
  if (jsStore_) {
    jsStore_->Deactivate();
  }
  if (bridge_) {
    bridge_->Deactivate();
  }
  if (stopSync_) {
    stopSync_->Wait();
    stopSync_.reset();
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
  if (jsStore_) {
    jsStore_->Abort();
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
void InitiatorWrap::DestroyEngine() {
  if (!initiator_) return;
  gate_->Freeze();
  SessionOpGate::Unregister(sessionIDs_, gate_.get());
  initiator_.reset();
  gate_->Unfreeze();
  // No session is left to call the store: release its bridge and drop the
  // adapter it roots (the TS layer calls the adapter's close() once the
  // stop() promise has settled).
  if (jsStore_) {
    jsStore_->Release();
    jsStore_->DropBridge();
  }
  if (jsStore_) {
    jsStore_->Abort();  // idempotent after Teardown()
    jsStore_->DropBridge();
  }
}

// The stop() path: the gate was frozen by the stop worker; destroy and lift
// the freeze. JS thread only.
void InitiatorWrap::DestroyStoppedEngine() {
  SessionOpGate::Unregister(sessionIDs_, gate_.get());
  initiator_.reset();
  gate_->Unfreeze();
  // No session is left to call the store: release its bridge and drop the
  // adapter it roots (the TS layer calls the adapter's close() once the
  // stop() promise has settled).
  if (jsStore_) {
    jsStore_->Release();
    jsStore_->DropBridge();
  }
  // The engine is gone, so nothing will call the handlers again: drop the
  // bridge's reference to them. It is what kept this wrap reachable from the
  // user's Engine object (the handlers close over it) and so made the wrap
  // -- and the Engine, its listeners and the parsed dictionaries -- immortal.
  // On the graceful path this runs from the barrier queued behind every
  // callback stop() fired, so none of them is lost; on the force path the
  // TSFN was aborted first, discarding the queue.
  if (bridge_) bridge_->DropHandlers();
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
      [self](bool ok, const std::shared_ptr<EngineOpWorker::Settlement>& s) {
        self->busy_ = false;
        // If start failed, mark not-started so teardown won't try to stop an
        // engine that never came up, and a later start() can retry.
        if (!ok) self->started_ = false;
        s->Settle();
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
  // A stop() is in flight (its worker is running, or a graceful stop is
  // waiting for its queued 'logout' events to be dispatched before destroying
  // the engine): join it. Resolving right away here -- `stopped_` is already
  // set -- would break the README's promise that the sessions are gone once
  // stop() settles. The first call's `force` applies to both.
  if (!stopPromise_.IsEmpty()) {
    return stopPromise_.Value();
  }
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
    // Already torn down: just release the TSFN, drop the handlers (nothing
    // can call them without an engine) and resolve.
    stopped_ = true;
    if (bridge_) {
      bridge_->Release();
      bridge_->DropHandlers();
    }
    if (jsStore_) {
      jsStore_->Release();
      jsStore_->DropBridge();
    }
    deferred.Resolve(env.Undefined());
    return deferred.Promise();
  }
  busy_ = true;
  stopped_ = true;
  // A forced stop must not wait on a store call that may never settle:
  // FIX::Initiator/Acceptor::stop() takes SessionState::m_mutex (logout())
  // on the worker, and a network thread may hold it inside a store call.
  // Failing every pending and future store call with IOException first lets
  // that thread out of the store. A graceful stop keeps the store serving:
  // its writes are legitimate, and each is bounded by storeTimeoutMs.
  if (force && jsStore_) {
    jsStore_->Deactivate();
  }
  // Lets Teardown() wait for the worker's operation instead of destroying the
  // engine under it; cleared in onSettled once the operation has returned.
  auto stopDone = std::make_shared<StopCompletion>();
  stopSync_ = stopDone;

  // A never-started engine takes the same async path (minus the stop() call):
  // its FIX::Session objects are registered from construction, so a session
  // operation may already be in flight against them and the destruction below
  // must wait for it just the same.
  FIX::SocketInitiator* initiator = initiator_.get();
  ApplicationBridge* bridge = bridge_.get();
  JsMessageStoreFactory* jsStore = jsStore_;
  const bool started = started_;
  std::shared_ptr<SessionOpGate> gate = gate_;
  auto* self = this;
  auto* worker = new EngineOpWorker(
      env, info.This().As<Napi::Object>(),
      // Runs on the worker thread. stop()'s onLogout/toAdmin callbacks fire on
      // QuickFIX threads while the main loop is free to service the TSFN.
      [initiator, gate, started, force, stopDone]() {
        // Signal completion on every exit of this lambda, success or throw,
        // and only after the gate freeze below has returned as well.
        struct SignalOnExit {
          std::shared_ptr<StopCompletion> done;
          ~SignalOnExit() { done->Signal(); }
        } signalOnExit{stopDone};
        try {
          if (started) initiator->stop(force);
        } catch (...) {
          gate->Freeze();
          throw;
        }
        // stop() has joined the network threads. Now block new session
        // operations (SendToTargetWorker) on THIS engine's
        // sessions and wait for the in-flight ones to finish: they hold raw
        // FIX::Session pointers that the destruction below is about to
        // invalidate. Waiting HERE, on the worker thread, keeps the JS loop
        // free for any BlockingCall such an operation is still making (e.g.
        // sendToTarget() -> toApp). Other engines' operations are unaffected.
        gate->Freeze();
      },
      [self, bridge, jsStore, env, force, gate](
          bool ok, const std::shared_ptr<EngineOpWorker::Settlement>& s) {
        self->busy_ = false;
        self->stopSync_.reset();  // the worker's operation has returned
        // Settles the promise and lets a later stop() start over (the
        // in-flight stop is finished, successfully or not).
        auto settle = [self, s]() {
          self->stopPromise_.Reset();
          s->Settle();
        };
        if (!ok) {
          // stop() threw part-way: the network threads may still be running,
          // so the engine is NOT safe to destroy. Keep it, let session
          // operations through again and clear stopped_ so that a later
          // stop() -- or the destructor's Teardown() -- retries. Mirrors
          // Start() clearing started_ on failure. The bridge is released (or
          // aborted) as on success, so a failed stop() does not keep the
          // event loop alive: the TSFN holds a loop reference until it is
          // released, and a script that catches the rejection and falls off
          // the end would otherwise never exit. From here on the engine's
          // callbacks pass through without reaching JS; the retried stop()
          // then destroys the engine as soon as its worker settles, since
          // RunAfterQueued() refuses a released bridge.
          self->stopped_ = false;
          self->gate_->Unfreeze();
          if (bridge) {
            if (force) {
              // The abort discarded the queue: no callback can reach JS
              // any more, so the handlers can go now.
              bridge->Abort();
              bridge->DropHandlers();
            } else {
              // Callbacks already queued (a trailing 'logout') are still
              // dispatched after the release, and read the handlers: keep
              // them. The retried stop() drops them in
              // DestroyStoppedEngine().
              bridge->Release();
            }
          }
          // Same for the store bridge: released, so the engine's remaining
          // store calls fail (IOException) rather than keep the loop alive.
          if (jsStore) {
            if (force) {
              jsStore->Abort();
            } else {
              jsStore->Release();
            }
          }
          settle();
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
          settle();
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
        const bool queued =
            bridge->RunAfterQueued(env, [self, s, settle, gate](Napi::Env e) {
              if (e == nullptr) {
                // Discarded: the environment is being torn down. The wrap's
                // own teardown (cleanup hook, then destructor) destroys the
                // engine; touch nothing but the settlement and the gate,
                // which this closure owns (the gate by shared_ptr). In
                // particular do not reach through `self`: what keeps the
                // wrap alive until here is the TSFN's reference on the
                // napi_env (the env -- and with it every ObjectWrap
                // finalizer -- is deleted only after the TSFN has dropped
                // its queue), a Node internal this code must not lean on.
                // The promise reference needs no special care: the wrap
                // destructor deletes it, and runs with the env valid.
                //
                // The freeze the stop worker took is still held: lift it,
                // as DestroyStoppedEngine() would have. A SendToTargetWorker
                // parked in OpScope since then is otherwise never woken, and
                // the destructor's own DestroyEngine() -- which nests its
                // freeze inside this one -- never brings the count to zero
                // either; the libuv pool thread it sits on would be parked
                // for good, and whoever drains the pool at exit (a Worker's
                // terminate(), the process teardown) would hang on it. Once
                // woken it runs against the engine, still intact at this
                // point (the bridge is inactive, so a callback it makes
                // passes through), or is refused by Acquire() if the engine
                // has already been unregistered; the destructor's Freeze()
                // waits for it either way.
                s->Abandon();
                gate->Unfreeze();
                return;
              }
              self->DestroyStoppedEngine();
              settle();
            });
        bridge->Release();
        if (!queued) {
          self->DestroyStoppedEngine();
          settle();
        }
      });
  Napi::Promise promise = worker->Promise();
  stopPromise_ = Napi::Persistent(static_cast<Napi::Object>(promise));
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
  return SessionWrap::NewInstance(env, id->SessionID(), gate_);
}

Napi::Value InitiatorWrap::Ref(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (bridge_) bridge_->Ref(env);
  if (jsStore_) jsStore_->Ref(env);
  return info.This();
}

Napi::Value InitiatorWrap::Unref(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (bridge_) bridge_->Unref(env);
  if (jsStore_) jsStore_->Unref(env);
  return info.This();
}

}  // namespace napi_quickfix
