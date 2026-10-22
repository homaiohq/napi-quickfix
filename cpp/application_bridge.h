#ifndef NAPI_QUICKFIX_APPLICATION_BRIDGE_H
#define NAPI_QUICKFIX_APPLICATION_BRIDGE_H

#include <napi.h>

#include <atomic>
#include <condition_variable>
#include <cstdint>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>

#include "quickfix/Application.h"
#include "quickfix/DataDictionary.h"
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
    // Carried as a FIX::Message (not its wire string) so repeating groups the
    // handler added survive: re-parsing a string without a dictionary would
    // flatten them.
    FIX::Message editedMessage;
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
    // A deep copy of the message for message-bearing calls (a
    // fieldmap::CloneMessage, which keeps every nested group entry typed).
    // Copied, not serialized: the engine parsed it with the session's
    // dictionary, and only the structured copy keeps its repeating groups for
    // the JS handler, which takes the copy over.
    FIX::Message message;
    // The session dictionary the JS wrapper routes the message's fields by
    // (see SessionDictionary); null when the session is gone.
    std::shared_ptr<const FIX::DataDictionary> sessionDictionary;
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
  // The trampoline's body; CallJs runs it under a catch-all (see there).
  static void CallJsBody(Napi::Env env, ApplicationBridge* context,
                         CallData* data, Result& result);

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

  // Drop what the bridge roots on the engine's behalf: the handlers object
  // and the per-session dictionaries (see handlers_ below). JS thread only;
  // call it once the engine is gone, or once no queued callback can reach JS
  // any more (after Abort()). A callback dispatched afterwards passes
  // through as if no handler were installed.
  void DropHandlers();

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
                  const FIX::Message& message);

  // The session dictionary of `id`, shared so a JS Message can keep it past
  // the session's lifetime: a copy of the session's DataDictionaryProvider
  // (which shares its dictionaries' ownership) aliased to the dictionary for
  // the session's BeginString. Built once per session, on the QuickFIX thread
  // running the callback (the session is alive there); onCreate drops the
  // entry so a recreated session gets its own. Null if the session is not
  // registered.
  std::shared_ptr<const FIX::DataDictionary> SessionDictionary(
      const FIX::SessionID& id);
  std::mutex dictionariesMtx_;
  std::map<FIX::SessionID, std::shared_ptr<const FIX::DataDictionary>>
      dictionaries_;

  // The user's handlers object, held strongly for the engine's whole life so
  // a started engine stays reachable through them (the wrapper's handlers
  // close over the Engine), like a net.Server does through its listeners.
  // That makes a reference cycle through native memory the GC cannot see:
  // wrap -> bridge -> handlers -> Engine -> wrap. The wraps break it with
  // DropHandlers() as soon as the engine is destroyed (stop() settled, or
  // the force/failed-stop paths that abort the TSFN); the destructor's Reset
  // is only the fallback for a wrap collected without stop().
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
  //
  // Invariant: every path that sets inactive_ stores it BEFORE taking
  // pendingMtx_ to run WakeAllPending(), and RegisterChannel() re-checks
  // inactive_ UNDER pendingMtx_. So a registration that saw inactive_ unset is
  // already in pending_ when the wake loop runs, and one that lost the race is
  // refused; either way no caller can start waiting after the wake. The JS
  // thread relies on this when it blocks on a network thread after
  // Deactivate() (Teardown's stop() join, DestroyEngine's gate freeze).
  std::mutex pendingMtx_;
  std::unordered_map<std::uint64_t, std::shared_ptr<SyncChannel>> pending_;
  std::uint64_t nextChannelId_ = 0;

  // Returns false (nothing registered) if the bridge is already inactive.
  bool RegisterChannel(const std::shared_ptr<SyncChannel>& ch,
                       std::uint64_t& id);
  void UnregisterChannel(std::uint64_t id);
  void WakeAllPending();
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_APPLICATION_BRIDGE_H
