#include "acceptor_wrap.h"

#include <string>

#include "quickfix/FileLog.h"
#include "quickfix/FileStore.h"

#include "engine_common.h"
#include "engine_workers.h"
#include "errors.h"
#include "session_id_wrap.h"
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

    acceptor_ = std::make_unique<FIX::SocketAcceptor>(
        *bridge_, *storeFactory_, settings, *logFactory_);
    sessionIDs_ = acceptor_->getSessions();
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
      [self](bool ok) {
        self->busy_ = false;
        if (!ok) self->started_ = false;
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
  if (!acceptor_ || !started_) {
    stopped_ = true;
    if (bridge_) bridge_->Release();
    // Destroy the (never started) engine now so its FIX::Session objects leave
    // the process-wide registry; see the comment in the started path below.
    acceptor_.reset();
    deferred.Resolve(env.Undefined());
    return deferred.Promise();
  }
  busy_ = true;
  stopped_ = true;

  FIX::SocketAcceptor* acceptor = acceptor_.get();
  ApplicationBridge* bridge = bridge_.get();
  auto* self = this;
  auto* worker = new EngineOpWorker(
      env, info.This().As<Napi::Object>(),
      [acceptor, force]() { acceptor->stop(force); },
      [self, bridge, force](bool /*ok*/) {
        self->busy_ = false;
        if (bridge) {
          if (force) {
            bridge->Abort();
          } else {
            bridge->Release();
          }
        }
        // stop() has joined the network threads, so nothing else references
        // the engine. Destroy it NOW (on the JS thread) rather than at GC:
        // QuickFIX only deletes its FIX::Session objects -- and removes them
        // from the process-wide registry that lookupSession()/sendToTarget()
        // read -- in the engine destructor. Deferring that to GC would leave
        // stale Session handles resolvable and make a new engine with the
        // same SessionIDs fail with a "Duplicate Session" ConfigError until
        // the old wrap happened to be collected. A stopped engine cannot be
        // restarted anyway (start() rejects once stopped_ is set).
        self->acceptor_.reset();
      });
  Napi::Promise promise = worker->Promise();
  worker->Queue();
  return promise;
}

// isLoggedOn(sessionID?): with no argument, true if ANY session of this engine
// is logged on (FIX::Initiator/Acceptor::isLoggedOn); with a SessionID, true
// only if THAT session belongs to this engine and is logged on. Always false
// before start() and after stop().
Napi::Value AcceptorWrap::IsLoggedOn(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const bool hasId = info.Length() >= 1 && !info[0].IsUndefined();
  // Validate the argument even when the engine is down, for a stable API.
  SessionIDWrap* id =
      hasId ? SessionIDWrap::UnwrapArg(env, info[0], "sessionID") : nullptr;
  if (!acceptor_ || !started_ || stopped_) {
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
// of this engine's sessions or the engine has been stopped (its sessions are
// destroyed on stop, see Stop()).
Napi::Value AcceptorWrap::GetSession(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  SessionIDWrap* id = SessionIDWrap::UnwrapArg(env, info[0], "sessionID");
  if (!acceptor_ || stopped_ || !acceptor_->has(id->SessionID())) {
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
