#ifndef NAPI_QUICKFIX_APPLICATION_BRIDGE_H
#define NAPI_QUICKFIX_APPLICATION_BRIDGE_H

#include <napi.h>

#include <atomic>
#include <condition_variable>
#include <cstdint>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>

#include "quickfix/Application.h"
#include "quickfix/Message.h"
#include "quickfix/SessionID.h"

namespace napi_quickfix {

// Bridges QuickFIX's FIX::Application callbacks (invoked on QuickFIX's own
// network threads) to a set of JS handler functions, via a SINGLE
// TypedThreadSafeFunction dispatcher.
//
// Fire-and-forget callbacks (onCreate/onLogon/onLogout) use NonBlockingCall and
// never wait. Synchronous mutate/throw callbacks (toAdmin/toApp/fromAdmin/
// fromApp) use BlockingCall + a shared SyncChannel (mutex/condition_variable) so
// the QuickFIX thread observes any message mutation or thrown FIX exception
// before returning. Crucially, the wait can be released not only by the JS
// trampoline but also by Deactivate()/Abort() during teardown, so a network
// thread never blocks forever when the main event loop is frozen (e.g. inside a
// finalize/cleanup hook). The engine wraps run start/stop/sendToTarget on libuv
// worker threads (AsyncWorker) so the main loop stays free to service these
// BlockingCall trampolines — this is what breaks the original deadlock.
class ApplicationBridge : public FIX::Application {
 public:
  enum class CallType {
    kOnCreate,
    kOnLogon,
    kOnLogout,
    kToAdmin,
    kToApp,
    kFromAdmin,
    kFromApp,
    // Not an Application callback: a closure queued by the JS thread through
    // the same FIFO, so it runs after every event queued before it (see
    // RunAfterQueued).
    kBarrier,
  };

  // Result returned from the JS trampoline for synchronous calls.
  struct Result {
    // For mutating callbacks (toAdmin/toApp), the (possibly edited) message.
    std::string editedMessage;
    bool mutated = false;
    // If the JS handler threw, the FIX exception class name to re-throw
    // (e.g. "DoNotSend", "RejectLogon", "UnsupportedMessageType") and message.
    bool threw = false;
    std::string errorName;
    std::string errorMessage;
  };

  // Reply channel for a synchronous call. Heap-allocated and shared (shared_ptr)
  // between the waiting QuickFIX thread and the JS trampoline so neither can
  // dangle. Guarded by a mutex + condition_variable so the waiter can be woken
  // either by the trampoline (normal completion) or by Abort()/Deactivate()
  // (teardown), instead of blocking forever on a future when the main loop is
  // frozen inside a cleanup hook.
  struct SyncChannel {
    std::mutex mtx;
    std::condition_variable cv;
    bool done = false;
    Result result;
  };

  struct CallData {
    CallType type;
    FIX::SessionID sessionID;  // copied by value — safe across threads
    std::string rawMessage;    // serialized message for message-bearing calls
    bool hasMessage = false;
    // For synchronous calls only: shared reply channel (null for fire-and-forget).
    std::shared_ptr<SyncChannel> channel;
    // kBarrier only. Invoked with a null Env if the item is dropped (TSFN
    // aborted / environment teardown): then it must not touch JS.
    std::function<void(Napi::Env)> barrier;
  };

  // The JS-thread trampoline. Runs on the Node event-loop thread. Declared
  // before the TSFN alias because it is used as a template argument.
  static void CallJs(Napi::Env env, Napi::Function jsCallback,
                     ApplicationBridge* context, CallData* data);

  using TSFN = Napi::TypedThreadSafeFunction<ApplicationBridge, CallData,
                                             ApplicationBridge::CallJs>;

  // Construct on the JS thread. `handlers` is the user's handlers object (may be
  // empty/undefined). `env` is captured for control (Ref/Unref).
  ApplicationBridge(Napi::Env env, Napi::Object handlers);
  ~ApplicationBridge() override;

  // TSFN lifecycle. Acquire is a no-op placeholder (the initial thread count is
  // 1 from New); Release drains, Abort force-stops. Ref/Unref control whether
  // the TSFN keeps the event loop alive.
  void Release();
  void Abort();
  // Mark the bridge inactive WITHOUT touching the TSFN. Callbacks arriving on
  // QuickFIX threads will pass through immediately. Call this on the MAIN thread
  // BEFORE stopping the engine during finalize, so the subsequent engine stop()
  // (which joins the network threads) can't have a callback race into a TSFN
  // that is about to be aborted.
  void Deactivate();
  void Ref(Napi::Env env);
  void Unref(Napi::Env env);

  // Queue `fn` to run on the JS thread AFTER every callback already queued
  // (the TSFN queue is FIFO), and keep the event loop alive until it has run.
  // JS thread only; call it before Release()/Abort(). Returns false, without
  // queuing anything, if the bridge is no longer accepting work -- the caller
  // then runs `fn` itself. `fn` receives a null Env if the queue is discarded
  // before it is reached (Abort() / environment teardown) and must then do
  // nothing that touches JS.
  bool RunAfterQueued(Napi::Env env, std::function<void(Napi::Env)> fn);

  // FIX::Application overrides.
  void onCreate(const FIX::SessionID&) override;
  void onLogon(const FIX::SessionID&) override;
  void onLogout(const FIX::SessionID&) override;
  void toAdmin(FIX::Message&, const FIX::SessionID&) override;
  void toApp(FIX::Message&, const FIX::SessionID&) EXCEPT(FIX::DoNotSend) override;
  void fromAdmin(const FIX::Message&, const FIX::SessionID&)
      EXCEPT(FIX::FieldNotFound, FIX::IncorrectDataFormat,
             FIX::IncorrectTagValue, FIX::RejectLogon) override;
  void fromApp(const FIX::Message&, const FIX::SessionID&)
      EXCEPT(FIX::FieldNotFound, FIX::IncorrectDataFormat,
             FIX::IncorrectTagValue, FIX::UnsupportedMessageType) override;

 private:
  void FireAndForget(CallType type, const FIX::SessionID& id);
  // Runs a synchronous call and returns the Result (throwing FIX exception is
  // handled by the caller-side override, which inspects Result).
  Result CallSync(CallType type, const FIX::SessionID& id,
                  const std::string& raw);

  Napi::ObjectReference handlers_;
  TSFN tsfn_;
  bool released_ = false;
  // Set true by Abort()/Release() (which may run on the MAIN thread during
  // finalize) and read by the FIX::Application overrides (which run on QuickFIX
  // network threads). Once true, the overrides must NOT touch the TSFN — during
  // environment teardown the TSFN's internals may already be destroyed, and
  // calling into it aborts the process. Atomic so the cross-thread read is safe.
  std::atomic<bool> inactive_{false};

  // Wake all in-flight synchronous callers (used by Deactivate/Abort so a
  // network thread blocked in CallSync doesn't wait forever when the main loop
  // is frozen inside a cleanup hook). Registers each SyncChannel while pending.
  std::mutex pendingMtx_;
  std::unordered_map<std::uint64_t, std::shared_ptr<SyncChannel>> pending_;
  std::uint64_t nextChannelId_ = 0;

  std::uint64_t RegisterChannel(const std::shared_ptr<SyncChannel>& ch);
  void UnregisterChannel(std::uint64_t id);
  void WakeAllPending();
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_APPLICATION_BRIDGE_H
