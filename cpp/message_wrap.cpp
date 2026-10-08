#include "message_wrap.h"

#include <algorithm>
#include <string>
#include <utility>
#include <vector>

#include "data_dictionary_wrap.h"
#include "errors.h"
#include "field_map_ops.h"
#include "field_map_util.h"
#include "group_wrap.h"
#include "quickfix/FieldNumbers.h"

namespace napi_quickfix {

namespace {

// The section a tag is routed to, so callers don't have to know which
// section a well-known tag belongs to:
//   1. standard header/trailer tags (MsgType, SenderCompID, CheckSum, ...)
//      go to their section, as FIX::Message::isHeaderField decides;
//   2. any other tag already present in the header or trailer stays there.
//      The engine parses with the session dictionary, which can declare
//      custom header/trailer fields the static list does not know, and a
//      caller may have placed one there with setHeaderField;
//   3. everything else is a body field.
// Group count tags (NoHops in the header, NoPartyIDs in the body) are
// routed the same way.
FIX::FieldMap& SectionFor(FIX::Message& message, int tag) {
  if (FIX::Message::isHeaderField(tag)) return message.getHeader();
  if (FIX::Message::isTrailerField(tag)) return message.getTrailer();
  if (message.getHeader().isSetField(tag)) return message.getHeader();
  if (message.getTrailer().isSetField(tag)) return message.getTrailer();
  return message;
}

const FIX::DataDictionary* OptionalDictionary(Napi::Env env, Napi::Value v,
                                              const char* argName) {
  if (v.IsUndefined() || v.IsNull()) {
    return nullptr;
  }
  return &DataDictionaryWrap::UnwrapArg(env, v, argName)->Dictionary();
}

}  // namespace

Napi::FunctionReference MessageWrap::constructor_;

Napi::Object MessageWrap::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(
      env, "Message",
      {
          InstanceMethod("getField", &MessageWrap::GetField),
          InstanceMethod("setField", &MessageWrap::SetField),
          InstanceMethod("hasField", &MessageWrap::HasField),
          InstanceMethod("addGroup", &MessageWrap::AddGroup),
          InstanceMethod("getGroup", &MessageWrap::GetGroup),
          InstanceMethod("groupCount", &MessageWrap::GroupCount),
          InstanceMethod("getHeaderField", &MessageWrap::GetHeaderField),
          InstanceMethod("setHeaderField", &MessageWrap::SetHeaderField),
          InstanceMethod("getTrailerField", &MessageWrap::GetTrailerField),
          InstanceMethod("setTrailerField", &MessageWrap::SetTrailerField),
          InstanceMethod("toString", &MessageWrap::ToString),
          InstanceMethod("toPretty", &MessageWrap::ToPretty),
          InstanceMethod("getMsgType", &MessageWrap::GetMsgType),
      });

  constructor_ = Napi::Persistent(func);
  constructor_.SuppressDestruct();

  exports.Set("MessageWrap", func);
  return exports;
}

Napi::Object MessageWrap::NewInstance(Napi::Env env, FIX::Message msg) {
  // Construct an empty MessageWrap then move the FIX::Message in. Callers
  // that still need their message pass a copy; the bridge moves.
  Napi::Object obj = constructor_.New({});
  MessageWrap* wrap = Napi::ObjectWrap<MessageWrap>::Unwrap(obj);
  wrap->message_ = std::move(msg);
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
    // Empty message, numeric body order.
    return;
  }
  const bool haveRaw = !info[0].IsUndefined() && !info[0].IsNull();
  if (haveRaw && !info[0].IsString()) {
    throw Napi::TypeError::New(
        env,
        "new Message(raw?: string, validate?: boolean, dictionary?: DataDictionary, "
        "order?: number[], sessionDictionary?: DataDictionary)");
  }
  bool validate = false;
  if (info.Length() >= 2 && !info[1].IsUndefined() && !info[1].IsNull()) {
    validate = info[1].ToBoolean().Value();
  }
  // With a dictionary QuickFIX recognises repeating groups while parsing, so
  // they are reachable through getGroup and survive re-serialisation. Without
  // one every repeated tag lands in the flat body (QuickFIX behaviour).
  //
  // `dictionary` describes the application messages, `sessionDictionary` the
  // header and trailer (FIX::Message::setString(raw, validate, session, app)).
  // A FIX 4.x dictionary covers both, so either one stands in for a missing
  // other; a FIXT 1.1 session needs both, as the engine uses them.
  const FIX::DataDictionary* appDictionary =
      info.Length() >= 3 ? OptionalDictionary(env, info[2], "dictionary")
                         : nullptr;
  const std::vector<int> order =
      info.Length() >= 4 ? CoerceOrder(env, info[3], "order") : std::vector<int>();
  const FIX::DataDictionary* sessionDictionary =
      info.Length() >= 5 ? OptionalDictionary(env, info[4], "sessionDictionary")
                         : nullptr;
  if (!sessionDictionary) sessionDictionary = appDictionary;
  if (!appDictionary) appDictionary = sessionDictionary;

  if (!order.empty()) {
    // FIX::Message(hdrOrder, trlOrder, order): the body sorts by `order`.
    FIX::Message ordered(FIX::message_order(FIX::message_order::header),
                         FIX::message_order(FIX::message_order::trailer),
                         MakeOrder(order));
    ordered.clear();  // this constructor leaves m_tag uninitialised
    message_ = std::move(ordered);
  }
  if (!haveRaw) {
    return;
  }
  const std::string raw = info[0].As<Napi::String>().Utf8Value();
  NQ_TRY(env) {
    if (sessionDictionary) {
      message_.setString(raw, validate, sessionDictionary, appDictionary);
    } else {
      message_.setString(raw, validate);
    }
  } NQ_CATCH(env)
}

Napi::Value MessageWrap::GetField(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const int tag = CoerceTag(env, info[0]);
  return GetFieldOf(env, SectionFor(message_, tag), tag);
}

Napi::Value MessageWrap::SetField(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const int tag = CoerceTag(env, info[0]);
  SetFieldOf(env, SectionFor(message_, tag), tag, CoerceValue(env, info[1]));
  return env.Undefined();
}

Napi::Value MessageWrap::HasField(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const int tag = CoerceTag(env, info[0]);
  return Napi::Boolean::New(env, SectionFor(message_, tag).isSetField(tag));
}

Napi::Value MessageWrap::AddGroup(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const FIX::Group& group = GroupWrap::UnwrapArg(env, info[0], "group")->Group();
  const int countTag = group.field();
  AddGroupTo(env, SectionFor(message_, countTag), countTag, group);
  return env.Undefined();
}

Napi::Value MessageWrap::GetGroup(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const int num = CoerceGroupIndex(env, info[0]);
  const int countTag = CoerceTag(env, info[1]);
  return GetGroupOf(env, SectionFor(message_, countTag), num, countTag);
}

Napi::Value MessageWrap::GroupCount(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const int countTag = CoerceTag(env, info[0]);
  return GroupCountOf(env, SectionFor(message_, countTag), countTag);
}

Napi::Value MessageWrap::GetHeaderField(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return GetFieldOf(env, message_.getHeader(), CoerceTag(env, info[0]));
}

Napi::Value MessageWrap::SetHeaderField(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const int tag = CoerceTag(env, info[0]);
  SetFieldOf(env, message_.getHeader(), tag, CoerceValue(env, info[1]));
  return env.Undefined();
}

Napi::Value MessageWrap::GetTrailerField(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return GetFieldOf(env, message_.getTrailer(), CoerceTag(env, info[0]));
}

Napi::Value MessageWrap::SetTrailerField(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const int tag = CoerceTag(env, info[0]);
  SetFieldOf(env, message_.getTrailer(), tag, CoerceValue(env, info[1]));
  return env.Undefined();
}

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
