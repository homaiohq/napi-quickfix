#ifndef NAPI_QUICKFIX_MESSAGE_WRAP_H
#define NAPI_QUICKFIX_MESSAGE_WRAP_H

#include <napi.h>

#include <memory>

#include "quickfix/DataDictionary.h"
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
// removeGroup / hasGroup / groupCount) auto-route standard header/trailer
// tags to the right section, as well as the header/trailer fields declared by
// the session dictionary the message was parsed or delivered with. Any other
// tag goes to the section that already holds it (body first). isEmpty and
// clear() cover all three sections; totalFields / fields read the body.
class MessageWrap : public Napi::ObjectWrap<MessageWrap> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);

  // Build a JS MessageWrap holding a copy of `msg` (typed down to the last
  // nested group entry, see fieldmap::CloneMessage), or taking `msg` over.
  // The ApplicationBridge trampoline moves its own copy in, with the session
  // dictionary that routes its fields (null: none).
  static Napi::Object NewInstance(Napi::Env env, const FIX::Message& msg);
  static Napi::Object NewInstance(
      Napi::Env env, FIX::Message&& msg,
      std::shared_ptr<const FIX::DataDictionary> sessionDictionary = nullptr);
  // The same by raw Node-API status: false, with nothing created, if the
  // instance cannot be built -- in particular when the environment is
  // stopping (worker.terminate()), where the throwing form would abort the
  // process. For the ApplicationBridge trampoline.
  static bool TryNewInstance(
      napi_env env, FIX::Message&& msg,
      std::shared_ptr<const FIX::DataDictionary> sessionDictionary,
      napi_value* out);

  explicit MessageWrap(const Napi::CallbackInfo& info);

  // Internal accessor for other wrappers (validate, sendToTarget, bridge).
  FIX::Message& Message() { return message_; }
  const FIX::Message& Message() const { return message_; }

  // Unwrap a JS value that must be a MessageWrap; throws Napi::TypeError if not.
  static MessageWrap* UnwrapArg(Napi::Env env, Napi::Value value,
                             const char* argName);

 private:

  // The section (header / body / trailer) that owns `tag`.
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
  // The session dictionary whose header/trailer fields SectionFor routes
  // (null: none). Shared, since the message may outlive the session or the
  // JS DataDictionary it came from.
  std::shared_ptr<const FIX::DataDictionary> sessionDictionary_;
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_MESSAGE_WRAP_H
