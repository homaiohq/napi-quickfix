#include "message_wrap.h"

#include <algorithm>
#include <string>

#include "data_dictionary_wrap.h"
#include "errors.h"
#include "field_map_ops.h"
#include "quickfix/FieldNumbers.h"

namespace napi_quickfix {

Napi::FunctionReference MessageWrap::constructor_;

Napi::Object MessageWrap::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(
      env, "Message",
      {
          InstanceMethod("getField", &MessageWrap::GetField),
          InstanceMethod("setField", &MessageWrap::SetField),
          InstanceMethod("isSetField", &MessageWrap::IsSetField),
          InstanceMethod("removeField", &MessageWrap::RemoveField),
          InstanceMethod("getFieldIfSet", &MessageWrap::GetFieldIfSet),
          InstanceMethod("getHeaderField", &MessageWrap::GetHeaderField),
          InstanceMethod("setHeaderField", &MessageWrap::SetHeaderField),
          InstanceMethod("getTrailerField", &MessageWrap::GetTrailerField),
          InstanceMethod("setTrailerField", &MessageWrap::SetTrailerField),
          InstanceMethod("isEmpty", &MessageWrap::IsEmpty),
          InstanceMethod("totalFields", &MessageWrap::TotalFields),
          InstanceMethod("clear", &MessageWrap::Clear),
          InstanceMethod("fields", &MessageWrap::Fields),
          InstanceMethod("headerFields", &MessageWrap::HeaderFields),
          InstanceMethod("trailerFields", &MessageWrap::TrailerFields),
          InstanceMethod("addGroup", &MessageWrap::AddGroup),
          InstanceMethod("getGroup", &MessageWrap::GetGroup),
          InstanceMethod("replaceGroup", &MessageWrap::ReplaceGroup),
          InstanceMethod("removeGroup", &MessageWrap::RemoveGroup),
          InstanceMethod("hasGroup", &MessageWrap::HasGroup),
          InstanceMethod("groupCount", &MessageWrap::GroupCount),
          InstanceMethod("toString", &MessageWrap::ToString),
          InstanceMethod("toPretty", &MessageWrap::ToPretty),
          InstanceMethod("getMsgType", &MessageWrap::GetMsgType),
      });

  constructor_ = Napi::Persistent(func);
  constructor_.SuppressDestruct();

  exports.Set("MessageWrap", func);
  return exports;
}

Napi::Object MessageWrap::NewInstance(Napi::Env env, const FIX::Message& msg) {
  // Construct an empty MessageWrap then overwrite its FIX::Message with a copy.
  Napi::Object obj = constructor_.New({});
  MessageWrap* wrap = Napi::ObjectWrap<MessageWrap>::Unwrap(obj);
  wrap->message_ = msg;
  return obj;
}

MessageWrap* MessageWrap::UnwrapArg(Napi::Env env, Napi::Value value,
                                 const char* argName) {
  if (!value.IsObject() ||
      !value.As<Napi::Object>().InstanceOf(constructor_.Value())) {
    throw Napi::TypeError::New(
        env, std::string(argName) + " must be a Message instance");
  }
  return Napi::ObjectWrap<MessageWrap>::Unwrap(value.As<Napi::Object>());
}

MessageWrap::MessageWrap(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<MessageWrap>(info) {
  Napi::Env env = info.Env();
  if (info.Length() == 0) {
    // Empty message.
    return;
  }
  if (!info[0].IsString()) {
    throw Napi::TypeError::New(
        env,
        "new Message(raw: string, validate?: boolean, "
        "sessionDictionary?: DataDictionary, "
        "applicationDictionary?: DataDictionary)");
  }
  const std::string raw = info[0].As<Napi::String>().Utf8Value();
  bool validate = false;
  if (info.Length() >= 2 && !fieldmap::IsNullish(info[1])) {
    validate = info[1].ToBoolean().Value();
  }
  const FIX::DataDictionary* sessionDD = nullptr;
  const FIX::DataDictionary* appDD = nullptr;
  if (info.Length() >= 3 && !fieldmap::IsNullish(info[2])) {
    sessionDD = &DataDictionaryWrap::UnwrapArg(env, info[2], "sessionDictionary")
                     ->Dictionary();
  }
  if (info.Length() >= 4 && !fieldmap::IsNullish(info[3])) {
    appDD = &DataDictionaryWrap::UnwrapArg(env, info[3], "applicationDictionary")
                 ->Dictionary();
  }
  NQ_TRY(env) {
    if (sessionDD != nullptr || appDD != nullptr) {
      // The dictionaries are read only during this call; the wrapper objects
      // are kept alive by the caller's arguments for its duration.
      message_.setString(raw, validate, sessionDD, appDD);
    } else {
      message_.setString(raw, validate);
    }
  } NQ_CATCH(env)
}

// Auto-route standard header/trailer fields (MsgType, SenderCompID, CheckSum,
// NoHops, ...) to the right section so callers don't have to know which
// section a well-known tag belongs to. Everything else is a body field.
FIX::FieldMap& MessageWrap::SectionFor(int tag) {
  if (FIX::Message::isHeaderField(tag)) {
    return message_.getHeader();
  }
  if (FIX::Message::isTrailerField(tag)) {
    return message_.getTrailer();
  }
  return message_;
}

#define NQ_ROUTED [this](int tag) -> FIX::FieldMap& { return SectionFor(tag); }
#define NQ_HEADER [this](int) -> FIX::FieldMap& { return message_.getHeader(); }
#define NQ_TRAILER [this](int) -> FIX::FieldMap& { return message_.getTrailer(); }

Napi::Value MessageWrap::GetField(const Napi::CallbackInfo& info) {
  return fieldmap::GetField(info, NQ_ROUTED);
}

Napi::Value MessageWrap::SetField(const Napi::CallbackInfo& info) {
  return fieldmap::SetField(info, NQ_ROUTED);
}

Napi::Value MessageWrap::IsSetField(const Napi::CallbackInfo& info) {
  return fieldmap::IsSetField(info, NQ_ROUTED);
}

Napi::Value MessageWrap::RemoveField(const Napi::CallbackInfo& info) {
  return fieldmap::RemoveField(info, NQ_ROUTED);
}

Napi::Value MessageWrap::GetFieldIfSet(const Napi::CallbackInfo& info) {
  return fieldmap::GetFieldIfSet(info, NQ_ROUTED);
}

Napi::Value MessageWrap::GetHeaderField(const Napi::CallbackInfo& info) {
  return fieldmap::GetField(info, NQ_HEADER);
}

Napi::Value MessageWrap::SetHeaderField(const Napi::CallbackInfo& info) {
  return fieldmap::SetField(info, NQ_HEADER);
}

Napi::Value MessageWrap::GetTrailerField(const Napi::CallbackInfo& info) {
  return fieldmap::GetField(info, NQ_TRAILER);
}

Napi::Value MessageWrap::SetTrailerField(const Napi::CallbackInfo& info) {
  return fieldmap::SetField(info, NQ_TRAILER);
}

Napi::Value MessageWrap::IsEmpty(const Napi::CallbackInfo& info) {
  return fieldmap::IsEmpty(info.Env(), message_);
}

Napi::Value MessageWrap::TotalFields(const Napi::CallbackInfo& info) {
  return fieldmap::TotalFields(info.Env(), message_);
}

// Empties header, body and trailer.
Napi::Value MessageWrap::Clear(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  NQ_TRY(env) {
    message_.clear();
  } NQ_CATCH(env)
  return env.Undefined();
}

Napi::Value MessageWrap::Fields(const Napi::CallbackInfo& info) {
  return fieldmap::Fields(info.Env(), message_);
}

Napi::Value MessageWrap::HeaderFields(const Napi::CallbackInfo& info) {
  return fieldmap::Fields(info.Env(), message_.getHeader());
}

Napi::Value MessageWrap::TrailerFields(const Napi::CallbackInfo& info) {
  return fieldmap::Fields(info.Env(), message_.getTrailer());
}

Napi::Value MessageWrap::AddGroup(const Napi::CallbackInfo& info) {
  return fieldmap::AddGroup(info, NQ_ROUTED);
}

Napi::Value MessageWrap::GetGroup(const Napi::CallbackInfo& info) {
  return fieldmap::GetGroup(info, NQ_ROUTED);
}

Napi::Value MessageWrap::ReplaceGroup(const Napi::CallbackInfo& info) {
  return fieldmap::ReplaceGroup(info, NQ_ROUTED);
}

Napi::Value MessageWrap::RemoveGroup(const Napi::CallbackInfo& info) {
  return fieldmap::RemoveGroup(info, NQ_ROUTED);
}

Napi::Value MessageWrap::HasGroup(const Napi::CallbackInfo& info) {
  return fieldmap::HasGroup(info, NQ_ROUTED);
}

Napi::Value MessageWrap::GroupCount(const Napi::CallbackInfo& info) {
  return fieldmap::GroupCount(info, NQ_ROUTED);
}

#undef NQ_ROUTED
#undef NQ_HEADER
#undef NQ_TRAILER

Napi::Value MessageWrap::ToString(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  NQ_TRY(env) {
    return Napi::String::New(env, message_.toString());
  } NQ_CATCH(env)
}

Napi::Value MessageWrap::ToPretty(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  NQ_TRY(env) {
    std::string s = message_.toString();
    std::replace(s.begin(), s.end(), '\x01', '|');
    return Napi::String::New(env, s);
  } NQ_CATCH(env)
}

Napi::Value MessageWrap::GetMsgType(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  NQ_TRY(env) {
    const std::string& msgType = message_.getHeader().getField(FIX::FIELD::MsgType);
    return Napi::String::New(env, msgType);
  } NQ_CATCH(env)
}

}  // namespace napi_quickfix
