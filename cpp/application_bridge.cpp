#include "application_bridge.h"

#include <mutex>
#include <string>
#include <utility>

#include "field_map_ops.h"
#include "message_wrap.h"
#include "session_id_wrap.h"

namespace napi_quickfix {

namespace {

// Mutating (outbound) callbacks: the JS handler may edit the message.
bool IsMutating(ApplicationBridge::CallType type) {
  return type == ApplicationBridge::CallType::kToAdmin ||
         type == ApplicationBridge::CallType::kToApp;
}

}  // namespace

const char* ApplicationBridge::HandlerName(CallType type) {
  switch (type) {
    case CallType::kOnCreate: return "onCreate";
    case CallType::kOnLogon: return "onLogon";
    case CallType::kOnLogout: return "onLogout";
    case CallType::kToAdmin: return "toAdmin";
    case CallType::kToApp: return "toApp";
    case CallType::kFromAdmin: return "fromAdmin";
    case CallType::kFromApp: return "fromApp";
  }
  return "";
}

bool ApplicationBridge::CallTypeFromName(const std::string& name,
                                         CallType& out) {
  for (int i = 0; i < kCallTypeCount; i++) {
    const auto type = static_cast<CallType>(i);
    if (name == HandlerName(type)) {
      out = type;
      return true;
    }
  }
  return false;
}

ApplicationBridge::ApplicationBridge(Napi::Env env, Napi::Object handlers) {
  if (!handlers.IsEmpty() && handlers.IsObject()) {
    handlers_ = Napi::Persistent(handlers);
  }
  // Forward only the callbacks that have a handler function. The names are
  // fixed, so this is decided here rather than on every callback.
  for (int i = 0; i < kCallTypeCount; i++) {
    const auto type = static_cast<CallType>(i);
    const bool present = !handlers_.IsEmpty() &&
                         handlers.Get(HandlerName(type)).IsFunction();
    enabled_[i].store(present, std::memory_order_release);
  }

  // Create the TSFN. No JS callback (the trampoline is the CallJs template
  // param). Initial thread count of 1 represents the QuickFIX side; released on
  // Release()/Abort(). Context = this. maxQueueSize 0 = unbounded.
  tsfn_ = TSFN::New(
      env,
      "napi_quickfix::ApplicationBridge",  // resource name
      0,                                    // unbounded queue
      1,                                    // initial thread count
      this,                                 // context
      [](Napi::Env, void*, ApplicationBridge*) { /* finalizer: no-op */ });
}

ApplicationBridge::~ApplicationBridge() {
  // Wake any straggling waiter so it can't block on a destroyed channel.
  inactive_.store(true, std::memory_order_release);
  WakeAllPending();
  // Ensure the TSFN is released so it doesn't dangle. If already released this
  // is a no-op-ish (Abort on an aborted tsfn returns an error we ignore).
  if (!released_) {
    tsfn_.Abort();
    released_ = true;
  }
  if (!handlers_.IsEmpty()) {
    handlers_.Reset();
  }
}

void ApplicationBridge::Release() {
  if (!released_) {
    // Mark inactive BEFORE releasing so any QuickFIX thread that is about to
    // dispatch sees it and bails out (pass-through) instead of racing the TSFN.
    inactive_.store(true, std::memory_order_release);
    WakeAllPending();
    released_ = true;
    tsfn_.Release();
  }
}

void ApplicationBridge::Abort() {
  if (!released_) {
    inactive_.store(true, std::memory_order_release);
    WakeAllPending();
    released_ = true;
    tsfn_.Abort();
  }
}

void ApplicationBridge::SetCallbackEnabled(CallType type, bool enabled) {
  enabled_[static_cast<int>(type)].store(enabled, std::memory_order_release);
}

void ApplicationBridge::Deactivate() {
  inactive_.store(true, std::memory_order_release);
  // Release any network thread already blocked in CallSync so the subsequent
  // engine stop() (which joins those threads) can complete without deadlocking
  // on the frozen main loop.
  WakeAllPending();
}

std::uint64_t ApplicationBridge::RegisterChannel(
    const std::shared_ptr<SyncChannel>& ch) {
  std::lock_guard<std::mutex> lock(pendingMtx_);
  std::uint64_t id = nextChannelId_++;
  pending_[id] = ch;
  return id;
}

void ApplicationBridge::UnregisterChannel(std::uint64_t id) {
  std::lock_guard<std::mutex> lock(pendingMtx_);
  pending_.erase(id);
}

void ApplicationBridge::WakeAllPending() {
  std::lock_guard<std::mutex> lock(pendingMtx_);
  for (auto& kv : pending_) {
    auto& ch = kv.second;
    {
      std::lock_guard<std::mutex> chLock(ch->mtx);
      if (!ch->done) {
        ch->done = true;  // pass-through (default Result: no mutate, no throw)
      }
    }
    ch->cv.notify_all();
  }
}

void ApplicationBridge::Ref(Napi::Env env) {
  if (!released_) {
    tsfn_.Ref(env);
  }
}

void ApplicationBridge::Unref(Napi::Env env) {
  if (!released_) {
    tsfn_.Unref(env);
  }
}

// ---------------------------------------------------------------------------
// FIX::Application overrides (invoked on QuickFIX threads).
// ---------------------------------------------------------------------------

void ApplicationBridge::FireAndForget(CallType type, const FIX::SessionID& id) {
  // Bridge is releasing/aborting (possibly during finalize where the TSFN is
  // being destroyed): don't touch the TSFN. Fire-and-forget just drops.
  // Nothing registered for this callback: nothing to deliver.
  if (inactive_.load(std::memory_order_acquire) || !IsEnabled(type)) {
    return;
  }
  auto* data = new CallData();
  data->type = type;
  data->sessionID = id;
  data->hasMessage = false;
  // channel stays null: fire-and-forget.
  napi_status status = tsfn_.NonBlockingCall(data);
  if (status != napi_ok) {
    delete data;  // TSFN won't take ownership if the call failed.
  }
}

ApplicationBridge::Result ApplicationBridge::CallSync(CallType type,
                                                      const FIX::SessionID& id,
                                                      const FIX::Message& message) {
  // Bridge is releasing/aborting: never call into the TSFN (its internals may be
  // torn down during finalize -> calling would abort the process). Return an
  // empty pass-through result so the QuickFIX thread proceeds without mutation
  // or thrown exception. Same when nothing is registered for this callback:
  // no copy, no round trip.
  if (inactive_.load(std::memory_order_acquire) || !IsEnabled(type)) {
    Result r;
    return r;
  }

  auto channel = std::make_shared<SyncChannel>();
  std::uint64_t channelId = RegisterChannel(channel);

  auto* data = new CallData();
  data->type = type;
  data->sessionID = id;
  // Deep copy: fields, groups (keeping their delimiters) and field order.
  CopyMessage(data->message, message);
  data->hasMessage = true;
  data->channel = channel;  // shared: trampoline gets its own owning copy

  napi_status status = tsfn_.BlockingCall(data);
  if (status != napi_ok) {
    // TSFN is closing/aborted: it won't take ownership and won't fulfill the
    // channel. Clean up and return a pass-through result.
    delete data;
    UnregisterChannel(channelId);
    Result r;
    return r;
  }

  // Wait for the trampoline (normal completion) or Abort/Deactivate (teardown)
  // to signal the channel. Never blocks forever: WakeAllPending() sets done.
  {
    std::unique_lock<std::mutex> lock(channel->mtx);
    channel->cv.wait(lock, [&channel] { return channel->done; });
  }
  UnregisterChannel(channelId);
  std::lock_guard<std::mutex> lock(channel->mtx);
  return std::move(channel->result);
}

void ApplicationBridge::onCreate(const FIX::SessionID& id) {
  FireAndForget(CallType::kOnCreate, id);
}

void ApplicationBridge::onLogon(const FIX::SessionID& id) {
  FireAndForget(CallType::kOnLogon, id);
}

void ApplicationBridge::onLogout(const FIX::SessionID& id) {
  FireAndForget(CallType::kOnLogout, id);
}

void ApplicationBridge::toAdmin(FIX::Message& message,
                                const FIX::SessionID& id) {
  Result r = CallSync(CallType::kToAdmin, id, message);
  if (r.mutated) {
    message.clear();  // FieldMap's move-assign does not free replaced groups
    message = std::move(r.editedMessage);
  }
  // toAdmin doesn't throw in the FIX interface; ignore r.threw here.
}

void ApplicationBridge::toApp(FIX::Message& message, const FIX::SessionID& id)
    EXCEPT(FIX::DoNotSend) {
  Result r = CallSync(CallType::kToApp, id, message);
  if (r.threw) {
    // toApp may throw DoNotSend.
    throw FIX::DoNotSend();
  }
  if (r.mutated) {
    message.clear();  // FieldMap's move-assign does not free replaced groups
    message = std::move(r.editedMessage);
  }
}

void ApplicationBridge::fromAdmin(const FIX::Message& message,
                                  const FIX::SessionID& id)
    EXCEPT(FIX::FieldNotFound, FIX::IncorrectDataFormat, FIX::IncorrectTagValue,
           FIX::RejectLogon) {
  Result r = CallSync(CallType::kFromAdmin, id, message);
  if (r.threw) {
    if (r.errorName == "RejectLogon") throw FIX::RejectLogon(r.errorMessage);
    if (r.errorName == "IncorrectDataFormat") throw FIX::IncorrectDataFormat(0);
    if (r.errorName == "IncorrectTagValue") throw FIX::IncorrectTagValue(0);
    if (r.errorName == "FieldNotFound") throw FIX::FieldNotFound(0);
    // Default: reject the logon so the peer sees a definitive response.
    throw FIX::RejectLogon(r.errorMessage);
  }
}

void ApplicationBridge::fromApp(const FIX::Message& message,
                                const FIX::SessionID& id)
    EXCEPT(FIX::FieldNotFound, FIX::IncorrectDataFormat, FIX::IncorrectTagValue,
           FIX::UnsupportedMessageType) {
  Result r = CallSync(CallType::kFromApp, id, message);
  if (r.threw) {
    if (r.errorName == "UnsupportedMessageType")
      throw FIX::UnsupportedMessageType();
    if (r.errorName == "IncorrectDataFormat") throw FIX::IncorrectDataFormat(0);
    if (r.errorName == "IncorrectTagValue") throw FIX::IncorrectTagValue(0);
    if (r.errorName == "FieldNotFound") throw FIX::FieldNotFound(0);
    throw FIX::UnsupportedMessageType();
  }
}

// ---------------------------------------------------------------------------
// JS-thread trampoline. Runs on the Node event-loop thread.
// ---------------------------------------------------------------------------

void ApplicationBridge::CallJs(Napi::Env env, Napi::Function /*jsCallback*/,
                               ApplicationBridge* context, CallData* data) {
  // RAII: always delete the CallData and, for sync calls, ALWAYS signal the
  // channel even on early return or a thrown C++ exception in this trampoline.
  // The signal is a no-op if Abort/Deactivate already woke the waiter (done set)
  // — the waiter has already returned pass-through and discarded the channel.
  struct Guard {
    CallData* data;
    Result result;
    ~Guard() {
      if (data->channel) {
        auto& ch = *data->channel;
        {
          std::lock_guard<std::mutex> lock(ch.mtx);
          if (!ch.done) {
            ch.result = std::move(result);
            ch.done = true;
          }
        }
        ch.cv.notify_all();
      }
      delete data;
    }
  } guard{data, {}};

  // env may be null during environment teardown; nothing safe to do.
  if (env == nullptr || context == nullptr) {
    return;
  }

  const bool isSync = (data->channel != nullptr);

  Napi::HandleScope scope(env);

  // Resolve the handler function, if the user provided one.
  Napi::Function handler;
  if (!context->handlers_.IsEmpty()) {
    Napi::Object handlers = context->handlers_.Value();
    Napi::Value h = handlers.Get(HandlerName(data->type));
    if (h.IsFunction()) {
      handler = h.As<Napi::Function>();
    }
  }

  if (handler.IsEmpty()) {
    // No handler for this callback (the forwarding switch is normally off in
    // that case, but the handlers object is the authority): pass-through.
    return;
  }

  // Build the JS arguments: (message?, sessionID).
  Napi::Object sessionIdObj = SessionIDWrap::NewInstance(env, data->sessionID);

  Napi::Object msgObj;
  bool haveMsg = false;
  if (data->hasMessage) {
    // Hand JS a copy of the engine's own FIX::Message: repeating groups parsed
    // with the session dictionary and the sender's body order stay intact.
    msgObj = MessageWrap::NewInstance(env, std::move(data->message));
    haveMsg = true;
  }

  try {
    if (haveMsg) {
      handler.Call({msgObj, sessionIdObj});
    } else {
      handler.Call({sessionIdObj});
    }
  } catch (const Napi::Error& e) {
    if (isSync) {
      guard.result.threw = true;
      // Read a `.fixError` / name off the JS error to pick the FIX exception.
      Napi::Value nameVal;
      try {
        nameVal = e.Value().As<Napi::Object>().Get("fixError");
      } catch (...) {
      }
      if (nameVal.IsString()) {
        guard.result.errorName = nameVal.As<Napi::String>().Utf8Value();
      }
      try {
        guard.result.errorMessage = e.Message();
      } catch (...) {
      }
    }
    // For fire-and-forget, the JS error is swallowed here (there's no FIX-thread
    // waiting). Reported best-effort by leaving it; QuickFIX doesn't care.
  }

  // For mutating sync callbacks, read back the (possibly edited) message.
  if (isSync && IsMutating(data->type) && haveMsg && !guard.result.threw) {
    try {
      MessageWrap* w = Napi::ObjectWrap<MessageWrap>::Unwrap(msgObj);
      // Copy: JS may keep using its object. Group instances stay typed so
      // the engine serialises exactly what the handler built.
      CopyMessage(guard.result.editedMessage, w->Message());
      guard.result.mutated = true;
    } catch (...) {
      guard.result.mutated = false;
    }
  }
  // guard destructor signals the channel (for sync) and deletes data.
}

}  // namespace napi_quickfix
