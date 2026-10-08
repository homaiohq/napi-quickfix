#ifndef NAPI_QUICKFIX_MESSAGE_WRAP_H
#define NAPI_QUICKFIX_MESSAGE_WRAP_H

#include <napi.h>

#include "quickfix/Message.h"

namespace napi_quickfix {

// Napi::ObjectWrap over FIX::Message.
//
//   new MessageWrap()
//   new MessageWrap(raw: string, validate?: boolean = false,
//                   dictionary?: DataDictionaryWrap)
//
// Methods: getField / setField / hasField / getHeaderField / setHeaderField /
// getTrailerField / setTrailerField / addGroup / getGroup / groupCount /
// toString / toPretty / getMsgType.
//
// Body fields are serialised in the order they were FIRST set (a later
// setField on the same tag overwrites in place). QuickFIX would otherwise sort
// them numerically; see field_map_util.h for how the order is kept.
class MessageWrap : public Napi::ObjectWrap<MessageWrap> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);

  // Build a JS MessageWrap owning the given FIX::Message (pass a copy to keep
  // yours; the ApplicationBridge trampoline moves its copy in).
  static Napi::Object NewInstance(Napi::Env env, FIX::Message msg);

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
  Napi::Value HasField(const Napi::CallbackInfo& info);
  Napi::Value AddGroup(const Napi::CallbackInfo& info);
  Napi::Value GetGroup(const Napi::CallbackInfo& info);
  Napi::Value GroupCount(const Napi::CallbackInfo& info);
  Napi::Value GetHeaderField(const Napi::CallbackInfo& info);
  Napi::Value SetHeaderField(const Napi::CallbackInfo& info);
  Napi::Value GetTrailerField(const Napi::CallbackInfo& info);
  Napi::Value SetTrailerField(const Napi::CallbackInfo& info);
  Napi::Value ToString(const Napi::CallbackInfo& info);
  Napi::Value ToPretty(const Napi::CallbackInfo& info);
  Napi::Value GetMsgType(const Napi::CallbackInfo& info);

  // Give a NEW body tag the last slot in the wire order before it is set.
  // No-op if the tag is already present.
  void EnsureBodyTag(int tag);

  FIX::Message message_;
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_MESSAGE_WRAP_H
