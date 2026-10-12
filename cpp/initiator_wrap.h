#ifndef NAPI_QUICKFIX_INITIATOR_WRAP_H
#define NAPI_QUICKFIX_INITIATOR_WRAP_H

#include <napi.h>

#include <memory>
#include <set>

#include "quickfix/Log.h"
#include "quickfix/MessageStore.h"
#include "quickfix/SessionID.h"
#include "quickfix/SocketInitiator.h"

#include "application_bridge.h"
#include "engine_common.h"
#include "engine_workers.h"
#include "session_op_gate.h"

namespace napi_quickfix {

// Napi::ObjectWrap over FIX::SocketInitiator.
//
//   new Initiator({ settings, handlers?, store?, log? })
//     store: 'file' | 'memory'         (default 'file')
//     log:   'screen' | 'file' | 'none' (default 'screen')
//
// Methods: start / stop(force?) / isLoggedOn(sessionID?) / getSessions /
// getSession(sessionID) / ref / unref.
class InitiatorWrap : public Napi::ObjectWrap<InitiatorWrap> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  explicit InitiatorWrap(const Napi::CallbackInfo& info);
  ~InitiatorWrap() override;

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

  // Declaration order matters: members destruct in REVERSE order, so the
  // initiator (declared last) is destroyed FIRST, before the factories and
  // bridge it references.
  std::unique_ptr<ApplicationBridge> bridge_;
  std::unique_ptr<FIX::MessageStoreFactory> storeFactory_;
  // Wraps the real factory so a failed engine constructor can reclaim the
  // engine-level Log QuickFIX would otherwise leak (see engine_common.h).
  std::unique_ptr<TrackingLogFactory> logFactory_;
  // Gate between this engine's destruction and the libuv-thread session
  // operations on ITS sessions (see session_op_gate.h). Shared with the stop
  // worker; registered for sessionIDs_ at construction, unregistered when the
  // engine is destroyed.
  std::shared_ptr<SessionOpGate> gate_ = std::make_shared<SessionOpGate>();
  std::unique_ptr<FIX::SocketInitiator> initiator_;

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

  static void CleanupEntry(InitiatorWrap* self);

  // Env captured at construction (JS thread), used only to remove the cleanup
  // hook if the object is GC-finalized before environment shutdown.
  napi_env env_ = nullptr;
  // Runs Teardown on the MAIN thread during environment shutdown, BEFORE N-API
  // finalizes the TSFN — the only reliable point to join QuickFIX network
  // threads before the TSFN they call into is destroyed. Removed in the
  // destructor ONLY if the hook has not already fired (node's cleanup wrapper
  // frees its own data after invoking the hook, so Remove() afterward would
  // double-free; we track that with cleanupHookFired_).
  Napi::Env::CleanupHook<void (*)(InitiatorWrap*), InitiatorWrap> cleanupHook_;
  bool cleanupHookFired_ = false;
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_INITIATOR_WRAP_H
