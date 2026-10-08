#include "message_wrap.h"

#include <algorithm>
#include <string>

#include <utility>
#include <vector>

#include "data_dictionary_wrap.h"
#include "errors.h"
#include "field_map_util.h"
#include "group_wrap.h"
#include "quickfix/FieldNumbers.h"

namespace napi_quickfix {

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
        "order?: number[])");
  }
  bool validate = false;
  if (info.Length() >= 2 && !info[1].IsUndefined() && !info[1].IsNull()) {
    validate = info[1].ToBoolean().Value();
  }
  // With a dictionary QuickFIX recognises repeating groups while parsing, so
  // they are reachable through getGroup and survive re-serialisation. Without
  // one every repeated tag lands in the flat body (QuickFIX behaviour).
  const FIX::DataDictionary* dictionary = nullptr;
  if (info.Length() >= 3 && !info[2].IsUndefined() && !info[2].IsNull()) {
    dictionary =
        &DataDictionaryWrap::UnwrapArg(env, info[2], "dictionary")->Dictionary();
  }
  const std::vector<int> order =
      info.Length() >= 4 ? CoerceOrder(env, info[3], "order") : std::vector<int>();

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
    if (dictionary) {
      message_.setString(raw, validate, dictionary);
    } else {
      message_.setString(raw, validate);
    }
  } NQ_CATCH(env)
}

Napi::Value MessageWrap::GetField(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  int tag = CoerceTag(env, info[0]);
  NQ_TRY(env) {
    // Auto-route standard header/trailer fields (MsgType, SenderCompID,
    // CheckSum, ...) to the right section so callers don't have to know which
    // section a well-known tag belongs to. Everything else is a body field.
    const std::string& value =
        FIX::Message::isHeaderField(tag)    ? message_.getHeader().getField(tag)
        : FIX::Message::isTrailerField(tag) ? message_.getTrailer().getField(tag)
                                            : message_.getField(tag);
    return Napi::String::New(env, value);
  } NQ_CATCH(env)
}

Napi::Value MessageWrap::SetField(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  int tag = CoerceSetTag(env, info[0]);
  std::string value = CoerceValue(env, info[1]);
  NQ_TRY(env) {
    if (FIX::Message::isHeaderField(tag)) {
      message_.getHeader().setField(tag, value);
    } else if (FIX::Message::isTrailerField(tag)) {
      message_.getTrailer().setField(tag, value);
    } else {
      message_.setField(tag, value);
    }
  } NQ_CATCH(env)
  return env.Undefined();
}

Napi::Value MessageWrap::HasField(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  int tag = CoerceTag(env, info[0]);
  const bool set = FIX::Message::isHeaderField(tag)
                       ? message_.getHeader().isSetField(tag)
                   : FIX::Message::isTrailerField(tag)
                       ? message_.getTrailer().isSetField(tag)
                       : message_.isSetField(tag);
  return Napi::Boolean::New(env, set);
}

// Route a group's count tag to the section it belongs to, like setField does
// for plain fields (NoHops lives in the header, everything else in the body).
static FIX::FieldMap& SectionFor(FIX::Message& message, int countTag) {
  if (FIX::Message::isHeaderField(countTag)) return message.getHeader();
  if (FIX::Message::isTrailerField(countTag)) return message.getTrailer();
  return message;
}

Napi::Value MessageWrap::AddGroup(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  GroupWrap* group = GroupWrap::UnwrapArg(env, info[0], "group");
  const int countTag = group->Group().field();
  NQ_TRY(env) {
    // Store a FIX::Group copy (not a sliced FieldMap) so getGroup can read
    // the delimiter back; QuickFIX's parser stores instances the same way.
    // QuickFIX sets the NoXxx count field and keeps it equal to the number
    // of instances.
    SectionFor(message_, countTag)
        .addGroupPtr(countTag, new FIX::Group(group->Group()));
  } NQ_CATCH(env)
  return env.Undefined();
}

Napi::Value MessageWrap::GetGroup(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const int num = CoerceGroupIndex(env, info[0]);
  const int countTag = CoerceTag(env, info[1]);
  NQ_TRY(env) {
    const FIX::FieldMap& instance =
        SectionFor(message_, countTag).getGroupRef(num, countTag);
    return GroupWrap::NewInstance(env, countTag, instance);
  } NQ_CATCH(env)
}

Napi::Value MessageWrap::GroupCount(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const int countTag = CoerceTag(env, info[0]);
  return Napi::Number::New(
      env, static_cast<double>(SectionFor(message_, countTag).groupCount(countTag)));
}

Napi::Value MessageWrap::GetHeaderField(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  int tag = CoerceTag(env, info[0]);
  NQ_TRY(env) {
    const std::string& value = message_.getHeader().getField(tag);
    return Napi::String::New(env, value);
  } NQ_CATCH(env)
}

Napi::Value MessageWrap::SetHeaderField(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  int tag = CoerceSetTag(env, info[0]);
  std::string value = CoerceValue(env, info[1]);
  NQ_TRY(env) {
    message_.getHeader().setField(tag, value);
  } NQ_CATCH(env)
  return env.Undefined();
}

Napi::Value MessageWrap::GetTrailerField(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  int tag = CoerceTag(env, info[0]);
  NQ_TRY(env) {
    const std::string& value = message_.getTrailer().getField(tag);
    return Napi::String::New(env, value);
  } NQ_CATCH(env)
}

Napi::Value MessageWrap::SetTrailerField(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  int tag = CoerceSetTag(env, info[0]);
  std::string value = CoerceValue(env, info[1]);
  NQ_TRY(env) {
    message_.getTrailer().setField(tag, value);
  } NQ_CATCH(env)
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
