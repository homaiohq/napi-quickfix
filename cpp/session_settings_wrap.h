#ifndef NAPI_QUICKFIX_SESSION_SETTINGS_WRAP_H
#define NAPI_QUICKFIX_SESSION_SETTINGS_WRAP_H

#include <napi.h>

#include "quickfix/SessionSettings.h"

namespace napi_quickfix {

// Napi::ObjectWrap over FIX::SessionSettings.
//
//   SessionSettings.fromString(text): SessionSettings
//   SessionSettings.fromFile(path): SessionSettings
//   settings.getSessions(): SessionID[]
class SessionSettingsWrap : public Napi::ObjectWrap<SessionSettingsWrap> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);

  explicit SessionSettingsWrap(const Napi::CallbackInfo& info);

  FIX::SessionSettings& Settings() { return settings_; }
  const FIX::SessionSettings& Settings() const { return settings_; }

  static SessionSettingsWrap* UnwrapArg(Napi::Env env, Napi::Value value,
                                     const char* argName);

 private:
  static Napi::FunctionReference constructor_;

  static Napi::Value FromString(const Napi::CallbackInfo& info);
  static Napi::Value FromFile(const Napi::CallbackInfo& info);

  Napi::Value GetSessions(const Napi::CallbackInfo& info);

  FIX::SessionSettings settings_;
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_SESSION_SETTINGS_WRAP_H
