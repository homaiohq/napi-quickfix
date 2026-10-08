#include "session_wrap.h"

#include <cmath>
#include <ctime>
#include <functional>
#include <limits>
#include <string>
#include <utility>

#include "engine_workers.h"
#include "errors.h"
#include "quickfix/Exceptions.h"
#include "quickfix/FieldTypes.h"
#include "session_id_wrap.h"

namespace napi_quickfix {

Napi::FunctionReference SessionWrap::constructor_;

Napi::Object SessionWrap::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(
      env, "Session",
      {
          InstanceMethod("getSessionID", &SessionWrap::GetSessionID),

          InstanceMethod("isLoggedOn", &SessionWrap::IsLoggedOn),
          InstanceMethod("isEnabled", &SessionWrap::IsEnabled),
          InstanceMethod("sentLogon", &SessionWrap::SentLogon),
          InstanceMethod("sentLogout", &SessionWrap::SentLogout),
          InstanceMethod("receivedLogon", &SessionWrap::ReceivedLogon),
          InstanceMethod("isInitiator", &SessionWrap::IsInitiator),
          InstanceMethod("isAcceptor", &SessionWrap::IsAcceptor),
          InstanceMethod("isSessionTime", &SessionWrap::IsSessionTime),
          InstanceMethod("isLogonTime", &SessionWrap::IsLogonTime),

          InstanceMethod("getExpectedSenderNum",
                         &SessionWrap::GetExpectedSenderNum),
          InstanceMethod("getExpectedTargetNum",
                         &SessionWrap::GetExpectedTargetNum),
          InstanceMethod("setNextSenderMsgSeqNum",
                         &SessionWrap::SetNextSenderMsgSeqNum),
          InstanceMethod("setNextTargetMsgSeqNum",
                         &SessionWrap::SetNextTargetMsgSeqNum),

          InstanceMethod("getResetOnLogon", &SessionWrap::GetResetOnLogon),
          InstanceMethod("setResetOnLogon", &SessionWrap::SetResetOnLogon),
          InstanceMethod("getResetOnLogout", &SessionWrap::GetResetOnLogout),
          InstanceMethod("setResetOnLogout", &SessionWrap::SetResetOnLogout),
          InstanceMethod("getResetOnDisconnect",
                         &SessionWrap::GetResetOnDisconnect),
          InstanceMethod("setResetOnDisconnect",
                         &SessionWrap::SetResetOnDisconnect),
          InstanceMethod("getRefreshOnLogon", &SessionWrap::GetRefreshOnLogon),
          InstanceMethod("setRefreshOnLogon", &SessionWrap::SetRefreshOnLogon),
          InstanceMethod("getCheckCompId", &SessionWrap::GetCheckCompId),
          InstanceMethod("setCheckCompId", &SessionWrap::SetCheckCompId),
          InstanceMethod("getCheckLatency", &SessionWrap::GetCheckLatency),
          InstanceMethod("setCheckLatency", &SessionWrap::SetCheckLatency),
          InstanceMethod("getPersistMessages",
                         &SessionWrap::GetPersistMessages),
          InstanceMethod("setPersistMessages",
                         &SessionWrap::SetPersistMessages),
          InstanceMethod("getSendRedundantResendRequests",
                         &SessionWrap::GetSendRedundantResendRequests),
          InstanceMethod("setSendRedundantResendRequests",
                         &SessionWrap::SetSendRedundantResendRequests),
          InstanceMethod("getValidateLengthAndChecksum",
                         &SessionWrap::GetValidateLengthAndChecksum),
          InstanceMethod("setValidateLengthAndChecksum",
                         &SessionWrap::SetValidateLengthAndChecksum),
          InstanceMethod("getSendNextExpectedMsgSeqNum",
                         &SessionWrap::GetSendNextExpectedMsgSeqNum),
          InstanceMethod("setSendNextExpectedMsgSeqNum",
                         &SessionWrap::SetSendNextExpectedMsgSeqNum),
          InstanceMethod("getIsNonStopSession",
                         &SessionWrap::GetIsNonStopSession),
          InstanceMethod("setIsNonStopSession",
                         &SessionWrap::SetIsNonStopSession),
          InstanceMethod("getLogonTimeout", &SessionWrap::GetLogonTimeout),
          InstanceMethod("setLogonTimeout", &SessionWrap::SetLogonTimeout),
          InstanceMethod("getLogoutTimeout", &SessionWrap::GetLogoutTimeout),
          InstanceMethod("setLogoutTimeout", &SessionWrap::SetLogoutTimeout),
          InstanceMethod("getMaxLatency", &SessionWrap::GetMaxLatency),
          InstanceMethod("setMaxLatency", &SessionWrap::SetMaxLatency),
          InstanceMethod("getTimestampPrecision",
                         &SessionWrap::GetTimestampPrecision),
          InstanceMethod("setTimestampPrecision",
                         &SessionWrap::SetTimestampPrecision),

          InstanceMethod("logon", &SessionWrap::Logon),
          InstanceMethod("logout", &SessionWrap::Logout),
          InstanceMethod("disconnect", &SessionWrap::Disconnect),
          InstanceMethod("reset", &SessionWrap::Reset),
          InstanceMethod("refresh", &SessionWrap::Refresh),
      });

  constructor_ = Napi::Persistent(func);
  constructor_.SuppressDestruct();

  exports.Set("SessionWrap", func);
  return exports;
}

Napi::Object SessionWrap::NewInstance(Napi::Env env,
                                      const FIX::SessionID& id) {
  return constructor_.New({SessionIDWrap::NewInstance(env, id)});
}

SessionWrap::SessionWrap(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<SessionWrap>(info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1) {
    throw Napi::TypeError::New(
        env,
        "Session cannot be constructed directly; use lookupSession() or "
        "engine.getSession()");
  }
  // Copy by value: the wrap must outlive any SessionID JS object.
  id_ = SessionIDWrap::UnwrapArg(env, info[0], "sessionID")->SessionID();
}

FIX::Session& SessionWrap::Resolve() {
  FIX::Session* session = FIX::Session::lookupSession(id_);
  if (session == nullptr) {
    throw FIX::SessionNotFound(id_.toString());
  }
  return *session;
}

Napi::Value SessionWrap::GetSessionID(const Napi::CallbackInfo& info) {
  return SessionIDWrap::NewInstance(info.Env(), id_);
}

// --- generic helpers ---------------------------------------------------------

template <typename Fn>
Napi::Value SessionWrap::BoolGet(const Napi::CallbackInfo& info, Fn fn) {
  Napi::Env env = info.Env();
  NQ_TRY(env) {
    return Napi::Boolean::New(env, (Resolve().*fn)());
  } NQ_CATCH(env)
}

template <typename Fn>
Napi::Value SessionWrap::IntGet(const Napi::CallbackInfo& info, Fn fn) {
  Napi::Env env = info.Env();
  NQ_TRY(env) {
    return Napi::Number::New(env, static_cast<double>((Resolve().*fn)()));
  } NQ_CATCH(env)
}

template <typename Fn>
Napi::Value SessionWrap::BoolSet(const Napi::CallbackInfo& info, Fn fn,
                                 const char* name) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBoolean()) {
    throw Napi::TypeError::New(env, std::string(name) + "(value: boolean)");
  }
  const bool value = info[0].As<Napi::Boolean>().Value();
  NQ_TRY(env) {
    (Resolve().*fn)(value);
    return env.Undefined();
  } NQ_CATCH(env)
}

// The FIX::Session setters take a plain `int`; a double outside its range is
// undefined behaviour to cast (and on x86-64 lands on INT_MIN, which would e.g.
// make a MaxLatency reject every inbound message). Bound it here and report
// a RangeError, matching SeqNumSet / SetTimestampPrecision.
template <typename Fn>
Napi::Value SessionWrap::IntSet(const Napi::CallbackInfo& info, Fn fn,
                                const char* name) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) {
    throw Napi::TypeError::New(env, std::string(name) + "(value: number)");
  }
  const double raw = info[0].As<Napi::Number>().DoubleValue();
  constexpr double kIntMin = static_cast<double>(std::numeric_limits<int>::min());
  constexpr double kIntMax = static_cast<double>(std::numeric_limits<int>::max());
  if (!std::isfinite(raw) || std::floor(raw) != raw || raw < kIntMin ||
      raw > kIntMax) {
    throw Napi::RangeError::New(
        env, std::string(name) + ": value must be an integer in the int32 range");
  }
  NQ_TRY(env) {
    (Resolve().*fn)(static_cast<int>(raw));
    return env.Undefined();
  } NQ_CATCH(env)
}

// isSessionTime(nowMs?) / isLogonTime(nowMs?): `nowMs` is an epoch-millisecond
// number (Date.getTime()); omitted => the engine's current UTC clock.
Napi::Value SessionWrap::TimeCheck(const Napi::CallbackInfo& info,
                                   bool logonTime) {
  Napi::Env env = info.Env();
  bool hasNow = info.Length() >= 1 && !info[0].IsUndefined();
  double nowMs = 0;
  if (hasNow) {
    if (!info[0].IsNumber()) {
      throw Napi::TypeError::New(
          env, logonTime ? "isLogonTime(nowMs?: number)"
                         : "isSessionTime(nowMs?: number)");
    }
    nowMs = info[0].As<Napi::Number>().DoubleValue();
    if (!std::isfinite(nowMs)) {
      throw Napi::TypeError::New(env, "nowMs must be a finite number");
    }
  }
  NQ_TRY(env) {
    FIX::Session& session = Resolve();
    FIX::UtcTimeStamp now = FIX::UtcTimeStamp::now();
    if (hasNow) {
      const double secs = std::floor(nowMs / 1000.0);
      const int millis = static_cast<int>(nowMs - secs * 1000.0);
      now = FIX::UtcTimeStamp(static_cast<time_t>(secs), millis);
    }
    return Napi::Boolean::New(env, logonTime ? session.isLogonTime(now)
                                             : session.isSessionTime(now));
  } NQ_CATCH(env)
}

// Sequence numbers are FIX::SEQNUM (uint64_t). JS numbers are exact up to
// 2^53, which is far beyond any practical MsgSeqNum; reject anything that is
// not a non-negative safe integer.
Napi::Value SessionWrap::SeqNumSet(const Napi::CallbackInfo& info, bool sender,
                                   const char* name) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) {
    throw Napi::TypeError::New(env, std::string(name) + "(seqNum: number)");
  }
  const double raw = info[0].As<Napi::Number>().DoubleValue();
  constexpr double kMaxSafe = 9007199254740991.0;  // Number.MAX_SAFE_INTEGER
  if (!std::isfinite(raw) || std::floor(raw) != raw || raw < 0 ||
      raw > kMaxSafe) {
    throw Napi::RangeError::New(
        env, std::string(name) + ": seqNum must be a non-negative safe integer");
  }
  const FIX::SEQNUM num = static_cast<FIX::SEQNUM>(raw);
  NQ_TRY(env) {
    // These touch the MessageStore (may throw IOException) but take only the
    // SessionState mutex, which QuickFIX never holds across a callback.
    if (sender) {
      Resolve().setNextSenderMsgSeqNum(num);
    } else {
      Resolve().setNextTargetMsgSeqNum(num);
    }
    return env.Undefined();
  } NQ_CATCH(env)
}

Napi::Value SessionWrap::RunAsync(const Napi::CallbackInfo& info,
                                  std::function<void(FIX::Session&)> op) {
  // The SessionID is copied by value into the worker; Execute() never touches
  // this wrap or any JS object.
  auto* worker = new SessionOpWorker(info.Env(), id_, std::move(op));
  Napi::Promise promise = worker->Promise();
  worker->Queue();
  return promise;
}

// --- state getters -----------------------------------------------------------

Napi::Value SessionWrap::IsLoggedOn(const Napi::CallbackInfo& info) {
  return BoolGet(info, &FIX::Session::isLoggedOn);
}
Napi::Value SessionWrap::IsEnabled(const Napi::CallbackInfo& info) {
  return BoolGet(info, &FIX::Session::isEnabled);
}
Napi::Value SessionWrap::SentLogon(const Napi::CallbackInfo& info) {
  return BoolGet(info, &FIX::Session::sentLogon);
}
Napi::Value SessionWrap::SentLogout(const Napi::CallbackInfo& info) {
  return BoolGet(info, &FIX::Session::sentLogout);
}
Napi::Value SessionWrap::ReceivedLogon(const Napi::CallbackInfo& info) {
  return BoolGet(info, &FIX::Session::receivedLogon);
}
Napi::Value SessionWrap::IsInitiator(const Napi::CallbackInfo& info) {
  return BoolGet(info, &FIX::Session::isInitiator);
}
Napi::Value SessionWrap::IsAcceptor(const Napi::CallbackInfo& info) {
  return BoolGet(info, &FIX::Session::isAcceptor);
}
Napi::Value SessionWrap::IsSessionTime(const Napi::CallbackInfo& info) {
  return TimeCheck(info, /*logonTime=*/false);
}
Napi::Value SessionWrap::IsLogonTime(const Napi::CallbackInfo& info) {
  return TimeCheck(info, /*logonTime=*/true);
}

// --- sequence numbers --------------------------------------------------------

Napi::Value SessionWrap::GetExpectedSenderNum(const Napi::CallbackInfo& info) {
  return IntGet(info, &FIX::Session::getExpectedSenderNum);
}
Napi::Value SessionWrap::GetExpectedTargetNum(const Napi::CallbackInfo& info) {
  return IntGet(info, &FIX::Session::getExpectedTargetNum);
}
Napi::Value SessionWrap::SetNextSenderMsgSeqNum(
    const Napi::CallbackInfo& info) {
  return SeqNumSet(info, /*sender=*/true, "setNextSenderMsgSeqNum");
}
Napi::Value SessionWrap::SetNextTargetMsgSeqNum(
    const Napi::CallbackInfo& info) {
  return SeqNumSet(info, /*sender=*/false, "setNextTargetMsgSeqNum");
}

// --- runtime options ---------------------------------------------------------

#define NQ_BOOL_OPTION(Name)                                                   \
  Napi::Value SessionWrap::Get##Name(const Napi::CallbackInfo& info) {         \
    return BoolGet(info, &FIX::Session::get##Name);                            \
  }                                                                            \
  Napi::Value SessionWrap::Set##Name(const Napi::CallbackInfo& info) {         \
    return BoolSet(info, &FIX::Session::set##Name, "set" #Name);               \
  }

#define NQ_INT_OPTION(Name)                                                    \
  Napi::Value SessionWrap::Get##Name(const Napi::CallbackInfo& info) {         \
    return IntGet(info, &FIX::Session::get##Name);                             \
  }                                                                            \
  Napi::Value SessionWrap::Set##Name(const Napi::CallbackInfo& info) {         \
    return IntSet(info, &FIX::Session::set##Name, "set" #Name);                \
  }

NQ_BOOL_OPTION(ResetOnLogon)
NQ_BOOL_OPTION(ResetOnLogout)
NQ_BOOL_OPTION(ResetOnDisconnect)
NQ_BOOL_OPTION(RefreshOnLogon)
NQ_BOOL_OPTION(CheckCompId)
NQ_BOOL_OPTION(CheckLatency)
NQ_BOOL_OPTION(PersistMessages)
NQ_BOOL_OPTION(SendRedundantResendRequests)
NQ_BOOL_OPTION(ValidateLengthAndChecksum)
NQ_BOOL_OPTION(SendNextExpectedMsgSeqNum)
NQ_BOOL_OPTION(IsNonStopSession)
NQ_INT_OPTION(LogonTimeout)
NQ_INT_OPTION(LogoutTimeout)
NQ_INT_OPTION(MaxLatency)

#undef NQ_BOOL_OPTION
#undef NQ_INT_OPTION

Napi::Value SessionWrap::GetTimestampPrecision(const Napi::CallbackInfo& info) {
  return IntGet(info, &FIX::Session::getTimestampPrecision);
}

// FIX::Session::setTimestampPrecision silently ignores values outside 0..9;
// surface that as a RangeError instead of a no-op.
Napi::Value SessionWrap::SetTimestampPrecision(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) {
    throw Napi::TypeError::New(env, "setTimestampPrecision(precision: number)");
  }
  const double raw = info[0].As<Napi::Number>().DoubleValue();
  if (!std::isfinite(raw) || std::floor(raw) != raw || raw < 0 || raw > 9) {
    throw Napi::RangeError::New(
        env, "setTimestampPrecision: precision must be an integer in 0..9");
  }
  NQ_TRY(env) {
    Resolve().setTimestampPrecision(static_cast<int>(raw));
    return env.Undefined();
  } NQ_CATCH(env)
}

// --- async ops ---------------------------------------------------------------

Napi::Value SessionWrap::Logon(const Napi::CallbackInfo& info) {
  return RunAsync(info, [](FIX::Session& s) { s.logon(); });
}

Napi::Value SessionWrap::Logout(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  std::string reason;
  if (info.Length() >= 1 && !info[0].IsUndefined()) {
    if (!info[0].IsString()) {
      throw Napi::TypeError::New(env, "logout(reason?: string)");
    }
    reason = info[0].As<Napi::String>().Utf8Value();
  }
  return RunAsync(info, [reason](FIX::Session& s) { s.logout(reason); });
}

Napi::Value SessionWrap::Disconnect(const Napi::CallbackInfo& info) {
  return RunAsync(info, [](FIX::Session& s) { s.disconnect(); });
}

Napi::Value SessionWrap::Reset(const Napi::CallbackInfo& info) {
  return RunAsync(info, [](FIX::Session& s) { s.reset(); });
}

Napi::Value SessionWrap::Refresh(const Napi::CallbackInfo& info) {
  return RunAsync(info, [](FIX::Session& s) { s.refresh(); });
}

}  // namespace napi_quickfix
