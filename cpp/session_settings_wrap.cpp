#include "session_settings_wrap.h"

#include "addon_data.h"

#include <set>
#include <sstream>
#include <string>
#include <vector>

#include "errors.h"
#include "quickfix/SessionID.h"
#include "session_id_wrap.h"

namespace napi_quickfix {

Napi::Object SessionSettingsWrap::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(
      env, "SessionSettings",
      {
          StaticMethod("fromString", &SessionSettingsWrap::FromString),
          StaticMethod("fromFile", &SessionSettingsWrap::FromFile),
          InstanceMethod("getSessions", &SessionSettingsWrap::GetSessions),
      });

  AddonData::Get(env).sessionSettings = Napi::Persistent(func);

  exports.Set("SessionSettingsWrap", func);
  return exports;
}

SessionSettingsWrap* SessionSettingsWrap::UnwrapArg(Napi::Env env,
                                                 Napi::Value value,
                                                 const char* argName) {
  if (!value.IsObject() ||
      !value.As<Napi::Object>().InstanceOf(AddonData::Get(env).sessionSettings.Value())) {
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
  return AddonData::Get(env).sessionSettings.New(
      {Napi::String::New(env, "string"), info[0].As<Napi::String>()});
}

Napi::Value SessionSettingsWrap::FromFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    throw Napi::TypeError::New(env, "fromFile(path: string)");
  }
  return AddonData::Get(env).sessionSettings.New(
      {Napi::String::New(env, "file"), info[0].As<Napi::String>()});
}

// getSessions(connectionType?): every [SESSION], or only those an engine of
// `connectionType` ("initiator" | "acceptor") would create -- the same filter
// the engine wraps apply (RejectDuplicateSessions, engine_common.h), with the
// [DEFAULT] section merged in. The TS create() factories use it to preload
// the message store for exactly the sessions the engine will own.
Napi::Value SessionSettingsWrap::GetSessions(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const bool filtered = info.Length() >= 1 && !info[0].IsUndefined();
  std::string connectionType;
  if (filtered) {
    if (!info[0].IsString()) {
      throw Napi::TypeError::New(env, "getSessions(connectionType?: string)");
    }
    connectionType = info[0].As<Napi::String>().Utf8Value();
  }
  NQ_TRY(env) {
    std::set<FIX::SessionID> sessions = settings_.getSessions();
    std::vector<FIX::SessionID> selected;
    for (const auto& id : sessions) {
      if (filtered) {
        const FIX::Dictionary& dict = settings_.get(id);
        if (!dict.has("ConnectionType") ||
            dict.getString("ConnectionType") != connectionType) {
          continue;
        }
      }
      selected.push_back(id);
    }
    Napi::Array arr = Napi::Array::New(env, selected.size());
    uint32_t i = 0;
    for (const auto& id : selected) {
      arr.Set(i++, SessionIDWrap::NewInstance(env, id));
    }
    return arr;
  } NQ_CATCH(env)
}

}  // namespace napi_quickfix
