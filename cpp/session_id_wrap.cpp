#include "session_id_wrap.h"

#include <string>

#include "errors.h"

namespace napi_quickfix {

Napi::FunctionReference SessionIDWrap::constructor_;

Napi::Object SessionIDWrap::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(
      env, "SessionID",
      {
          InstanceMethod("getBeginString", &SessionIDWrap::GetBeginString),
          InstanceMethod("getSenderCompID", &SessionIDWrap::GetSenderCompID),
          InstanceMethod("getTargetCompID", &SessionIDWrap::GetTargetCompID),
          InstanceMethod("getSessionQualifier",
                         &SessionIDWrap::GetSessionQualifier),
          InstanceMethod("toString", &SessionIDWrap::ToString),
      });

  constructor_ = Napi::Persistent(func);
  constructor_.SuppressDestruct();

  exports.Set("SessionIDWrap", func);
  return exports;
}

Napi::Object SessionIDWrap::NewInstance(Napi::Env env,
                                        const FIX::SessionID& id) {
  Napi::Object obj = constructor_.New(
      {Napi::String::New(env, id.getBeginString().getValue()),
       Napi::String::New(env, id.getSenderCompID().getValue()),
       Napi::String::New(env, id.getTargetCompID().getValue()),
       Napi::String::New(env, id.getSessionQualifier())});
  return obj;
}

SessionIDWrap* SessionIDWrap::UnwrapArg(Napi::Env env, Napi::Value value,
                                     const char* argName) {
  if (!value.IsObject() ||
      !value.As<Napi::Object>().InstanceOf(constructor_.Value())) {
    throw Napi::TypeError::New(
        env, std::string(argName) + " must be a SessionID instance");
  }
  return Napi::ObjectWrap<SessionIDWrap>::Unwrap(value.As<Napi::Object>());
}

SessionIDWrap::SessionIDWrap(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<SessionIDWrap>(info) {
  Napi::Env env = info.Env();
  if (info.Length() < 3 || !info[0].IsString() || !info[1].IsString() ||
      !info[2].IsString()) {
    throw Napi::TypeError::New(
        env,
        "new SessionID(beginString, senderCompID, targetCompID, qualifier?)");
  }
  std::string begin = info[0].As<Napi::String>().Utf8Value();
  std::string sender = info[1].As<Napi::String>().Utf8Value();
  std::string target = info[2].As<Napi::String>().Utf8Value();
  std::string qualifier;
  if (info.Length() >= 4 && info[3].IsString()) {
    qualifier = info[3].As<Napi::String>().Utf8Value();
  }
  session_id_ = FIX::SessionID(begin, sender, target, qualifier);
}

Napi::Value SessionIDWrap::GetBeginString(const Napi::CallbackInfo& info) {
  return Napi::String::New(info.Env(), session_id_.getBeginString().getValue());
}

Napi::Value SessionIDWrap::GetSenderCompID(const Napi::CallbackInfo& info) {
  return Napi::String::New(info.Env(),
                           session_id_.getSenderCompID().getValue());
}

Napi::Value SessionIDWrap::GetTargetCompID(const Napi::CallbackInfo& info) {
  return Napi::String::New(info.Env(),
                           session_id_.getTargetCompID().getValue());
}

Napi::Value SessionIDWrap::GetSessionQualifier(const Napi::CallbackInfo& info) {
  return Napi::String::New(info.Env(), session_id_.getSessionQualifier());
}

Napi::Value SessionIDWrap::ToString(const Napi::CallbackInfo& info) {
  return Napi::String::New(info.Env(), session_id_.toString());
}

}  // namespace napi_quickfix
