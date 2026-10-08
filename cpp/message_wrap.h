#ifndef NAPI_QUICKFIX_MESSAGE_WRAP_H
#define NAPI_QUICKFIX_MESSAGE_WRAP_H

#include <napi.h>

#include "quickfix/Message.h"

namespace napi_quickfix {

// Napi::ObjectWrap over FIX::Message.
//
//   new MessageWrap()
//   new MessageWrap(raw: string, validate?: boolean = false)
//
// Methods: getField / setField / addGroup / getHeaderField / setHeaderField /
// getTrailerField / setTrailerField / toString / toPretty / getMsgType.
class MessageWrap : public Napi::ObjectWrap<MessageWrap> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);

  // Build a JS MessageWrap wrapping a COPY of the given FIX::Message. Used by
  // the ApplicationBridge trampoline to hand messages to JS handlers.
  static Napi::Object NewInstance(Napi::Env env, const FIX::Message& msg);

  explicit MessageWrap(const Napi::CallbackInfo& info);

  // Internal accessor for other wrappers (validate, sendToTarget, bridge).
  FIX::Message& Message() { return message_; }
  const FIX::Message& Message() const { return message_; }

  // Unwrap a JS value that must be a MessageWrap; throws Napi::TypeError if not.
  static MessageWrap* UnwrapArg(Napi::Env env, Napi::Value value,
                             const char* argName);

 private:
  static Napi::FunctionReference constructor_;

  Napi::Value GetField(const Napi::CallbackInfo& info);
  Napi::Value SetField(const Napi::CallbackInfo& info);
  Napi::Value AddGroup(const Napi::CallbackInfo& info);
  Napi::Value GetHeaderField(const Napi::CallbackInfo& info);
  Napi::Value SetHeaderField(const Napi::CallbackInfo& info);
  Napi::Value GetTrailerField(const Napi::CallbackInfo& info);
  Napi::Value SetTrailerField(const Napi::CallbackInfo& info);
  Napi::Value ToString(const Napi::CallbackInfo& info);
  Napi::Value ToPretty(const Napi::CallbackInfo& info);
  Napi::Value GetMsgType(const Napi::CallbackInfo& info);

  FIX::Message message_;
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_MESSAGE_WRAP_H
