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
#include "session_op_gate.h"

namespace napi_quickfix {

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
  std::unique_ptr<FIX::LogFactory> logFactory_;
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
  bool stopped_ = false;
  bool busy_ = false;  // guards against overlapping start/stop AsyncWorkers

  static void CleanupEntry(AcceptorWrap* self);

  napi_env env_ = nullptr;
  // Runs Teardown on the MAIN thread during environment shutdown, BEFORE N-API
  // finalizes the TSFN. See InitiatorWrap for the full rationale.
  Napi::Env::CleanupHook<void (*)(AcceptorWrap*), AcceptorWrap> cleanupHook_;
  bool cleanupHookFired_ = false;
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_ACCEPTOR_WRAP_H
