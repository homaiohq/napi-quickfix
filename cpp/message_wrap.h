#ifndef NAPI_QUICKFIX_MESSAGE_WRAP_H
#define NAPI_QUICKFIX_MESSAGE_WRAP_H

#include <napi.h>

#include "quickfix/Message.h"

namespace napi_quickfix {

// Napi::ObjectWrap over FIX::Message.
//
//   new MessageWrap()
//   new MessageWrap(raw: string, validate?: boolean = false,
//                   sessionDictionary?: DataDictionary,
//                   applicationDictionary?: DataDictionary)
//
// With a dictionary the raw string is parsed structurally (repeating groups
// become nested FieldMaps); without one it is parsed flat, as before.
//
// Field methods (getField / setField / isSetField / removeField /
// getFieldIfSet) and group methods (addGroup / getGroup / replaceGroup /
// removeGroup / hasGroup / groupCount) auto-route well-known header/trailer
// tags to the right section. isEmpty / totalFields / fields read the body;
// clear() empties all three sections.
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

  // The section (header / body / trailer) that owns a well-known tag.
  FIX::FieldMap& SectionFor(int tag);

  Napi::Value GetField(const Napi::CallbackInfo& info);
  Napi::Value SetField(const Napi::CallbackInfo& info);
  Napi::Value IsSetField(const Napi::CallbackInfo& info);
  Napi::Value RemoveField(const Napi::CallbackInfo& info);
  Napi::Value GetFieldIfSet(const Napi::CallbackInfo& info);
  Napi::Value GetHeaderField(const Napi::CallbackInfo& info);
  Napi::Value SetHeaderField(const Napi::CallbackInfo& info);
  Napi::Value GetTrailerField(const Napi::CallbackInfo& info);
  Napi::Value SetTrailerField(const Napi::CallbackInfo& info);
  Napi::Value IsEmpty(const Napi::CallbackInfo& info);
  Napi::Value TotalFields(const Napi::CallbackInfo& info);
  Napi::Value Clear(const Napi::CallbackInfo& info);
  Napi::Value Fields(const Napi::CallbackInfo& info);
  Napi::Value HeaderFields(const Napi::CallbackInfo& info);
  Napi::Value TrailerFields(const Napi::CallbackInfo& info);

  Napi::Value AddGroup(const Napi::CallbackInfo& info);
  Napi::Value GetGroup(const Napi::CallbackInfo& info);
  Napi::Value ReplaceGroup(const Napi::CallbackInfo& info);
  Napi::Value RemoveGroup(const Napi::CallbackInfo& info);
  Napi::Value HasGroup(const Napi::CallbackInfo& info);
  Napi::Value GroupCount(const Napi::CallbackInfo& info);

  Napi::Value ToString(const Napi::CallbackInfo& info);
  Napi::Value ToPretty(const Napi::CallbackInfo& info);
  Napi::Value GetMsgType(const Napi::CallbackInfo& info);

  FIX::Message message_;
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_MESSAGE_WRAP_H
