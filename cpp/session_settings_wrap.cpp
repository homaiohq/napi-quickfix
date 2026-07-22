#include "session_settings_wrap.h"

#include <set>
#include <sstream>
#include <string>

#include "errors.h"
#include "quickfix/SessionID.h"
#include "session_id_wrap.h"

namespace napi_quickfix {

Napi::FunctionReference SessionSettingsWrap::constructor_;

Napi::Object SessionSettingsWrap::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(
      env, "SessionSettings",
      {
          StaticMethod("fromString", &SessionSettingsWrap::FromString),
          StaticMethod("fromFile", &SessionSettingsWrap::FromFile),
          InstanceMethod("getSessions", &SessionSettingsWrap::GetSessions),
      });

  constructor_ = Napi::Persistent(func);
  constructor_.SuppressDestruct();

  exports.Set("SessionSettingsWrap", func);
  return exports;
}

SessionSettingsWrap* SessionSettingsWrap::UnwrapArg(Napi::Env env,
                                                 Napi::Value value,
                                                 const char* argName) {
  if (!value.IsObject() ||
      !value.As<Napi::Object>().InstanceOf(constructor_.Value())) {
    throw Napi::TypeError::New(
        env, std::string(argName) + " must be a SessionSettings instance");
  }
  return Napi::ObjectWrap<SessionSettingsWrap>::Unwrap(
      value.As<Napi::Object>());
}

// Constructor is internal: (kind: "string"|"file", payload: string).
// Users go through the static fromString/fromFile factories.
SessionSettingsWrap::SessionSettingsWrap(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<SessionSettingsWrap>(info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
    throw Napi::TypeError::New(
        env,
        "SessionSettings cannot be constructed directly; use "
        "SessionSettings.fromString() or SessionSettings.fromFile()");
  }
  std::string kind = info[0].As<Napi::String>().Utf8Value();
  std::string payload = info[1].As<Napi::String>().Utf8Value();

  NQ_TRY(env) {
    if (kind == "string") {
      std::istringstream stream(payload);
      settings_ = FIX::SessionSettings(stream);
    } else {  // "file"
      settings_ = FIX::SessionSettings(payload);
    }
  } NQ_CATCH(env)
}

Napi::Value SessionSettingsWrap::FromString(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    throw Napi::TypeError::New(env, "fromString(text: string)");
  }
  return constructor_.New(
      {Napi::String::New(env, "string"), info[0].As<Napi::String>()});
}

Napi::Value SessionSettingsWrap::FromFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    throw Napi::TypeError::New(env, "fromFile(path: string)");
  }
  return constructor_.New(
      {Napi::String::New(env, "file"), info[0].As<Napi::String>()});
}

Napi::Value SessionSettingsWrap::GetSessions(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  NQ_TRY(env) {
    std::set<FIX::SessionID> sessions = settings_.getSessions();
    Napi::Array arr = Napi::Array::New(env, sessions.size());
    uint32_t i = 0;
    for (const auto& id : sessions) {
      arr.Set(i++, SessionIDWrap::NewInstance(env, id));
    }
    return arr;
  } NQ_CATCH(env)
}

}  // namespace napi_quickfix
