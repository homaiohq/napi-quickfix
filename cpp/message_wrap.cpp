#include "message_wrap.h"

#include <algorithm>
#include <string>
#include <utility>
#include <vector>

#include "errors.h"
#include "quickfix/FieldNumbers.h"

namespace napi_quickfix {

Napi::FunctionReference MessageWrap::constructor_;

namespace {

// Coerce a JS arg to a FIX field value string. Accepts string or number
// (numbers are stringified without trailing ".0"). Throws TypeError otherwise.
std::string CoerceValue(Napi::Env env, Napi::Value v) {
  if (v.IsString()) {
    return v.As<Napi::String>().Utf8Value();
  }
  if (v.IsNumber()) {
    double d = v.As<Napi::Number>().DoubleValue();
    // Integers -> plain integer string; otherwise a plain double string.
    if (d == static_cast<double>(static_cast<long long>(d))) {
      return std::to_string(static_cast<long long>(d));
    }
    return std::to_string(d);
  }
  throw Napi::TypeError::New(env, "field value must be a string or number");
}

int CoerceTag(Napi::Env env, Napi::Value v) {
  if (!v.IsNumber()) {
    throw Napi::TypeError::New(env, "field tag must be a number");
  }
  return v.As<Napi::Number>().Int32Value();
}

}  // namespace

Napi::Object MessageWrap::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(
      env, "Message",
      {
          InstanceMethod("getField", &MessageWrap::GetField),
          InstanceMethod("setField", &MessageWrap::SetField),
          InstanceMethod("addGroup", &MessageWrap::AddGroup),
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
        env, "new Message(raw: string, validate?: boolean)");
  }
  const std::string raw = info[0].As<Napi::String>().Utf8Value();
  bool validate = false;
  if (info.Length() >= 2 && !info[1].IsUndefined() && !info[1].IsNull()) {
    validate = info[1].ToBoolean().Value();
  }
  NQ_TRY(env) {
    message_.setString(raw, validate);
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
  int tag = CoerceTag(env, info[0]);
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

// addGroup(countTag, entry: [tag, value][]): appends one repeating-group entry
// to the body. Fields keep the given order (the first tag is the delimiter)
// and QuickFIX sets the count tag to the number of entries.
Napi::Value MessageWrap::AddGroup(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  int countTag = CoerceTag(env, info[0]);
  if (!info[1].IsArray()) {
    throw Napi::TypeError::New(env, "group entry must be an array of [tag, value] pairs");
  }
  Napi::Array entry = info[1].As<Napi::Array>();
  if (entry.Length() == 0) {
    throw Napi::TypeError::New(env, "group entry must contain at least one field");
  }
  std::vector<std::pair<int, std::string>> fields;
  std::vector<int> order;
  for (uint32_t i = 0; i < entry.Length(); i++) {
    Napi::Value item = entry.Get(i);
    if (!item.IsArray() || item.As<Napi::Array>().Length() != 2) {
      throw Napi::TypeError::New(env, "group entry items must be [tag, value] pairs");
    }
    Napi::Array pair = item.As<Napi::Array>();
    int tag = CoerceTag(env, pair.Get(0u));
    if (tag <= 0) {
      throw Napi::TypeError::New(env, "field tag must be a positive integer");
    }
    if (std::find(order.begin(), order.end(), tag) != order.end()) {
      throw Napi::TypeError::New(env, "group entry must not repeat a tag");
    }
    fields.emplace_back(tag, CoerceValue(env, pair.Get(1u)));
    order.push_back(tag);
  }
  order.push_back(0);  // FIX::message_order(const int[]) expects a 0 terminator.
  NQ_TRY(env) {
    FIX::Group group(countTag, order.front(), order.data());
    for (const auto& [tag, value] : fields) {
      group.setField(tag, value);
    }
    message_.addGroup(group);
  } NQ_CATCH(env)
  return env.Undefined();
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
  int tag = CoerceTag(env, info[0]);
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
  int tag = CoerceTag(env, info[0]);
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
