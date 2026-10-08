#ifndef NAPI_QUICKFIX_SESSION_WRAP_H
#define NAPI_QUICKFIX_SESSION_WRAP_H

#include <napi.h>

#include <functional>

#include "quickfix/Session.h"
#include "quickfix/SessionID.h"

namespace napi_quickfix {

// Napi::ObjectWrap giving JS a handle on a live FIX::Session.
//
// Lifetime: FIX::Session objects are OWNED BY THE ENGINE (Initiator/Acceptor)
// and FIX::Session::lookupSession returns a raw, non-owning pointer. This wrap
// therefore never caches that pointer: it stores the FIX::SessionID by value and
// re-resolves it with lookupSession on EVERY call, throwing a QuickFixError with
// fixErrorName 'SessionNotFound' once the engine has been stopped (which
// destroys its sessions) or if the id never matched a session.
//
//   new SessionWrap(sessionID: SessionIDWrap)   -- internal; JS reaches a
//   Session through lookupSession() / engine.getSession().
//
// Sync (safe on the JS thread — they never take FIX::Session::m_mutex, which
// QuickFIX holds across application callbacks):
//   getSessionID, isLoggedOn, isEnabled, sentLogon, sentLogout, receivedLogon,
//   isInitiator, isAcceptor, isSessionTime(nowMs?), isLogonTime(nowMs?),
//   getExpectedSenderNum, getExpectedTargetNum, setNextSenderMsgSeqNum,
//   setNextTargetMsgSeqNum, and the runtime option getters/setters.
// Async (Promise; run on a SessionOpWorker — see engine_workers.h):
//   logon, logout(reason?), disconnect, reset, refresh.
class SessionWrap : public Napi::ObjectWrap<SessionWrap> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);

  // Build a JS Session bound to a copy of `id`. Does NOT check that the
  // session exists; callers (lookupSession / engine.getSession) do.
  static Napi::Object NewInstance(Napi::Env env, const FIX::SessionID& id);

  explicit SessionWrap(const Napi::CallbackInfo& info);

  const FIX::SessionID& SessionID() const { return id_; }

 private:
  static Napi::FunctionReference constructor_;

  // Resolve the live FIX::Session or throw FIX::SessionNotFound. Must be called
  // inside NQ_TRY so the exception maps to a QuickFixError.
  FIX::Session& Resolve();

  Napi::Value GetSessionID(const Napi::CallbackInfo& info);

  Napi::Value IsLoggedOn(const Napi::CallbackInfo& info);
  Napi::Value IsEnabled(const Napi::CallbackInfo& info);
  Napi::Value SentLogon(const Napi::CallbackInfo& info);
  Napi::Value SentLogout(const Napi::CallbackInfo& info);
  Napi::Value ReceivedLogon(const Napi::CallbackInfo& info);
  Napi::Value IsInitiator(const Napi::CallbackInfo& info);
  Napi::Value IsAcceptor(const Napi::CallbackInfo& info);
  Napi::Value IsSessionTime(const Napi::CallbackInfo& info);
  Napi::Value IsLogonTime(const Napi::CallbackInfo& info);

  Napi::Value GetExpectedSenderNum(const Napi::CallbackInfo& info);
  Napi::Value GetExpectedTargetNum(const Napi::CallbackInfo& info);
  Napi::Value SetNextSenderMsgSeqNum(const Napi::CallbackInfo& info);
  Napi::Value SetNextTargetMsgSeqNum(const Napi::CallbackInfo& info);

  // Runtime options (plain members on FIX::Session; no locking, no callbacks).
  Napi::Value GetResetOnLogon(const Napi::CallbackInfo& info);
  Napi::Value SetResetOnLogon(const Napi::CallbackInfo& info);
  Napi::Value GetResetOnLogout(const Napi::CallbackInfo& info);
  Napi::Value SetResetOnLogout(const Napi::CallbackInfo& info);
  Napi::Value GetResetOnDisconnect(const Napi::CallbackInfo& info);
  Napi::Value SetResetOnDisconnect(const Napi::CallbackInfo& info);
  Napi::Value GetRefreshOnLogon(const Napi::CallbackInfo& info);
  Napi::Value SetRefreshOnLogon(const Napi::CallbackInfo& info);
  Napi::Value GetCheckCompId(const Napi::CallbackInfo& info);
  Napi::Value SetCheckCompId(const Napi::CallbackInfo& info);
  Napi::Value GetCheckLatency(const Napi::CallbackInfo& info);
  Napi::Value SetCheckLatency(const Napi::CallbackInfo& info);
  Napi::Value GetPersistMessages(const Napi::CallbackInfo& info);
  Napi::Value SetPersistMessages(const Napi::CallbackInfo& info);
  Napi::Value GetSendRedundantResendRequests(const Napi::CallbackInfo& info);
  Napi::Value SetSendRedundantResendRequests(const Napi::CallbackInfo& info);
  Napi::Value GetValidateLengthAndChecksum(const Napi::CallbackInfo& info);
  Napi::Value SetValidateLengthAndChecksum(const Napi::CallbackInfo& info);
  Napi::Value GetSendNextExpectedMsgSeqNum(const Napi::CallbackInfo& info);
  Napi::Value SetSendNextExpectedMsgSeqNum(const Napi::CallbackInfo& info);
  Napi::Value GetIsNonStopSession(const Napi::CallbackInfo& info);
  Napi::Value SetIsNonStopSession(const Napi::CallbackInfo& info);
  Napi::Value GetLogonTimeout(const Napi::CallbackInfo& info);
  Napi::Value SetLogonTimeout(const Napi::CallbackInfo& info);
  Napi::Value GetLogoutTimeout(const Napi::CallbackInfo& info);
  Napi::Value SetLogoutTimeout(const Napi::CallbackInfo& info);
  Napi::Value GetMaxLatency(const Napi::CallbackInfo& info);
  Napi::Value SetMaxLatency(const Napi::CallbackInfo& info);
  Napi::Value GetTimestampPrecision(const Napi::CallbackInfo& info);
  Napi::Value SetTimestampPrecision(const Napi::CallbackInfo& info);

  // Async.
  Napi::Value Logon(const Napi::CallbackInfo& info);
  Napi::Value Logout(const Napi::CallbackInfo& info);
  Napi::Value Disconnect(const Napi::CallbackInfo& info);
  Napi::Value Reset(const Napi::CallbackInfo& info);
  Napi::Value Refresh(const Napi::CallbackInfo& info);

  // Shared helpers for the one-liner getters/setters above.
  template <typename Fn>
  Napi::Value BoolGet(const Napi::CallbackInfo& info, Fn fn);
  template <typename Fn>
  Napi::Value IntGet(const Napi::CallbackInfo& info, Fn fn);
  template <typename Fn>
  Napi::Value BoolSet(const Napi::CallbackInfo& info, Fn fn, const char* name);
  template <typename Fn>
  Napi::Value IntSet(const Napi::CallbackInfo& info, Fn fn, const char* name);
  Napi::Value TimeCheck(const Napi::CallbackInfo& info, bool logonTime);
  Napi::Value SeqNumSet(const Napi::CallbackInfo& info, bool sender,
                        const char* name);
  Napi::Value RunAsync(const Napi::CallbackInfo& info,
                       std::function<void(FIX::Session&)> op);

  FIX::SessionID id_;
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_SESSION_WRAP_H
