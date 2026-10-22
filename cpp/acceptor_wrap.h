#ifndef NAPI_QUICKFIX_ACCEPTOR_WRAP_H
#define NAPI_QUICKFIX_ACCEPTOR_WRAP_H

#include <napi.h>

#include <memory>
#include <set>

#include "quickfix/Log.h"
#include "quickfix/MessageStore.h"
#include "quickfix/SessionID.h"
#include "quickfix/SocketAcceptor.h"

#include "application_bridge.h"
#include "engine_common.h"
#include "engine_workers.h"
#include "js_message_store.h"
#include "session_op_gate.h"

namespace napi_quickfix {

// FIX::SocketAcceptor whose stop() leaves the SocketServer to the acceptor's
// own network thread. QuickFIX's onStop() runs on the STOPPING thread (the stop
// worker, or the JS thread in Teardown()) right after FIX::Acceptor::stop()
// sets the stop flag, and calls m_pServer->close(). That close shuts the
// listening socket down, which wakes the network thread's poll(), and the
// network thread -- now seeing the stop flag -- leaves its loop, closes the
// server again and DELETES it. Nothing orders the two: a stopping thread
// preempted inside close() resumes on the freed SocketServer and walks its
// freed socket map (SIGSEGV in std::_Rb_tree_increment, issue #24). Even when
// it wins, the two close() calls close the same descriptor numbers twice, and
// the second may hit a descriptor the process has reopened in between.
//
// With onStop() a no-op -- as FIX::SocketInitiator's already is -- only the
// network thread touches the server: it sees the stop flag once its poll()
// times out (SocketServer's 1 s timeout), and stop() waits for that in its
// thread join. onStop() is private in FIX::SocketAcceptor but virtual (pure in
// FIX::Acceptor), so it can be overridden here.
class SocketAcceptor final : public FIX::SocketAcceptor {
 public:
  using FIX::SocketAcceptor::SocketAcceptor;

 private:
  void onStop() override {}
};

// Napi::ObjectWrap over FIX::SocketAcceptor. Mirrors InitiatorWrap.
//
//   new Acceptor({ settings, handlers?, store?, log? })
class AcceptorWrap : public Napi::ObjectWrap<AcceptorWrap> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  explicit AcceptorWrap(const Napi::CallbackInfo& info);
  ~AcceptorWrap() override;

 private:
  static Napi::FunctionReference constructor_;

  Napi::Value Start(const Napi::CallbackInfo& info);
  Napi::Value Stop(const Napi::CallbackInfo& info);
  Napi::Value IsLoggedOn(const Napi::CallbackInfo& info);
  Napi::Value GetSessions(const Napi::CallbackInfo& info);
  Napi::Value GetSession(const Napi::CallbackInfo& info);
  Napi::Value Ref(const Napi::CallbackInfo& info);
  Napi::Value Unref(const Napi::CallbackInfo& info);

  void Teardown(bool force);
  // Destroy the FIX engine under gate_->Freeze(); destructor only.
  void DestroyEngine();
  // Destroy the FIX engine once stop() has frozen the gate; Stop() only.
  void DestroyStoppedEngine();

  // Destruct order: acceptor first (declared last), then log, store, bridge.
  std::unique_ptr<ApplicationBridge> bridge_;
  std::unique_ptr<FIX::MessageStoreFactory> storeFactory_;
  // storeFactory_ as a JsMessageStoreFactory when the engine was built with a
  // MessageStoreAdapter (store: <bridge object>), else null. Its bridge is
  // torn down next to the Application bridge on every path (Teardown, the
  // stop worker's settlement, DestroyStoppedEngine, ref/unref).
  JsMessageStoreFactory* jsStore_ = nullptr;
  // Wraps the real factory so a failed engine constructor can reclaim the
  // engine-level Log QuickFIX would otherwise leak (see engine_common.h).
  std::unique_ptr<TrackingLogFactory> logFactory_;
  // Gate between this engine's destruction and the libuv-thread session
  // operations on ITS sessions (see session_op_gate.h). Shared with the stop
  // worker; registered for sessionIDs_ at construction, unregistered when the
  // engine is destroyed.
  std::shared_ptr<SessionOpGate> gate_ = std::make_shared<SessionOpGate>();
  std::unique_ptr<FIX::SocketAcceptor> acceptor_;

  // The SessionIDs this engine was configured with, copied at construction so
  // getSessions() still answers after stop() has destroyed the engine.
  std::set<FIX::SessionID> sessionIDs_;

  bool started_ = false;
  // Set by stop() when it launches its worker (so start() rejects from then
  // on) and by Teardown(); cleared again if that stop() failed. It is NOT
  // "the engine is stopped": a stop() may be in flight.
  bool stopped_ = false;
  bool tornDown_ = false;  // Teardown() has run (it runs once)
  bool busy_ = false;  // guards against overlapping start/stop AsyncWorkers
  // Signalled by the in-flight stop() worker once its operation has returned;
  // non-null from Stop() launching the worker until that stop settles on the
  // JS thread. Teardown() waits on it (see there).
  std::shared_ptr<StopCompletion> stopSync_;
  // The promise of the stop() in flight, from the call until it settles
  // (which, for a graceful stop, is after its worker's OnOK). A stop() made
  // meanwhile returns this same promise instead of resolving early.
  Napi::ObjectReference stopPromise_;

  static void CleanupEntry(AcceptorWrap* self);

  napi_env env_ = nullptr;
  // Runs Teardown on the MAIN thread during environment shutdown, BEFORE N-API
  // finalizes the TSFN. See InitiatorWrap for the full rationale.
  Napi::Env::CleanupHook<void (*)(AcceptorWrap*), AcceptorWrap> cleanupHook_;
  bool cleanupHookFired_ = false;
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_ACCEPTOR_WRAP_H
