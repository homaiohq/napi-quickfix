#ifndef NAPI_QUICKFIX_SESSION_ID_WRAP_H
#define NAPI_QUICKFIX_SESSION_ID_WRAP_H

#include <napi.h>

#include "quickfix/SessionID.h"

namespace napi_quickfix {

// Napi::ObjectWrap over FIX::SessionID.
//
//   new SessionID(beginString, senderCompID, targetCompID, qualifier?)
//
// Getters: getBeginString / getSenderCompID / getTargetCompID /
// getSessionQualifier; plus toString.
class SessionIDWrap : public Napi::ObjectWrap<SessionIDWrap> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);

  // Build a JS SessionID wrapping a copy of the given FIX::SessionID.
  static Napi::Object NewInstance(Napi::Env env, const FIX::SessionID& id);

  explicit SessionIDWrap(const Napi::CallbackInfo& info);

  FIX::SessionID& SessionID() { return session_id_; }
  const FIX::SessionID& SessionID() const { return session_id_; }

  // Unwrap a JS value that must be a SessionID; throws Napi::TypeError if not.
  static SessionIDWrap* UnwrapArg(Napi::Env env, Napi::Value value,
                               const char* argName);

 private:
  static Napi::FunctionReference constructor_;

  Napi::Value GetBeginString(const Napi::CallbackInfo& info);
  Napi::Value GetSenderCompID(const Napi::CallbackInfo& info);
  Napi::Value GetTargetCompID(const Napi::CallbackInfo& info);
  Napi::Value GetSessionQualifier(const Napi::CallbackInfo& info);
  Napi::Value ToString(const Napi::CallbackInfo& info);

  FIX::SessionID session_id_;
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_SESSION_ID_WRAP_H
