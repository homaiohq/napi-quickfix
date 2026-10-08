#include "data_dictionary_wrap.h"

#include <sstream>
#include <string>

#include "errors.h"
#include "message_wrap.h"

namespace napi_quickfix {

Napi::FunctionReference DataDictionaryWrap::constructor_;

Napi::Object DataDictionaryWrap::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(
      env, "DataDictionary",
      {
          StaticMethod("fromFile", &DataDictionaryWrap::FromFile),
          StaticMethod("fromString", &DataDictionaryWrap::FromString),
          InstanceMethod("validate", &DataDictionaryWrap::Validate),
          InstanceMethod("getVersion", &DataDictionaryWrap::GetVersion),
          InstanceMethod("getFieldName", &DataDictionaryWrap::GetFieldName),
          InstanceMethod("getFieldTag", &DataDictionaryWrap::GetFieldTag),
          InstanceMethod("isField", &DataDictionaryWrap::IsField),
          InstanceMethod("isMsgType", &DataDictionaryWrap::IsMsgType),
      });

  constructor_ = Napi::Persistent(func);
  constructor_.SuppressDestruct();

  exports.Set("DataDictionaryWrap", func);
  return exports;
}

DataDictionaryWrap* DataDictionaryWrap::UnwrapArg(Napi::Env env,
                                                  Napi::Value value,
                                                  const char* argName) {
  if (!value.IsObject() ||
      !value.As<Napi::Object>().InstanceOf(constructor_.Value())) {
    throw Napi::TypeError::New(
        env, std::string(argName) + " must be a DataDictionary instance");
  }
  return Napi::ObjectWrap<DataDictionaryWrap>::Unwrap(value.As<Napi::Object>());
}

// Constructor is internal: (kind: "string"|"file", payload: string).
DataDictionaryWrap::DataDictionaryWrap(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<DataDictionaryWrap>(info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
    throw Napi::TypeError::New(
        env,
        "DataDictionary cannot be constructed directly; use "
        "DataDictionary.fromFile() or DataDictionary.fromString()");
  }
  std::string kind = info[0].As<Napi::String>().Utf8Value();
  std::string payload = info[1].As<Napi::String>().Utf8Value();

  NQ_TRY(env) {
    if (kind == "string") {
      std::istringstream stream(payload);
      dict_.readFromStream(stream);
    } else {  // "file"
      dict_.readFromURL(payload);
    }
  } NQ_CATCH(env)
}

Napi::Value DataDictionaryWrap::FromFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    throw Napi::TypeError::New(env, "fromFile(path: string)");
  }
  return constructor_.New(
      {Napi::String::New(env, "file"), info[0].As<Napi::String>()});
}

Napi::Value DataDictionaryWrap::FromString(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    throw Napi::TypeError::New(env, "fromString(xml: string)");
  }
  return constructor_.New(
      {Napi::String::New(env, "string"), info[0].As<Napi::String>()});
}

// validate(message, bodyOnly?: boolean). With bodyOnly the dictionary is used
// as the application dictionary only: no BeginString version check and no
// header/trailer field validation (QuickFIX's `validate(msg, true)`).
Napi::Value DataDictionaryWrap::Validate(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  MessageWrap* msg = MessageWrap::UnwrapArg(env, info[0], "message");
  bool bodyOnly = false;
  if (info.Length() >= 2 && !info[1].IsUndefined() && !info[1].IsNull()) {
    bodyOnly = info[1].ToBoolean().Value();
  }
  NQ_TRY(env) {
    dict_.validate(msg->Message(), bodyOnly);
  } NQ_CATCH(env)
  return env.Undefined();
}

// The BeginString the spec declares (e.g. "FIX.4.4"), "" if it has none.
Napi::Value DataDictionaryWrap::GetVersion(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  NQ_TRY(env) {
    return Napi::String::New(env, dict_.getVersion());
  } NQ_CATCH(env)
}

Napi::Value DataDictionaryWrap::GetFieldName(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) {
    throw Napi::TypeError::New(env, "getFieldName(tag: number)");
  }
  int tag = info[0].As<Napi::Number>().Int32Value();
  NQ_TRY(env) {
    std::string name;
    if (!dict_.getFieldName(tag, name)) {
      return env.Undefined();
    }
    return Napi::String::New(env, name);
  } NQ_CATCH(env)
}

Napi::Value DataDictionaryWrap::GetFieldTag(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    throw Napi::TypeError::New(env, "getFieldTag(name: string)");
  }
  std::string name = info[0].As<Napi::String>().Utf8Value();
  NQ_TRY(env) {
    int tag = 0;
    if (!dict_.getFieldTag(name, tag)) {
      return env.Undefined();
    }
    return Napi::Number::New(env, tag);
  } NQ_CATCH(env)
}

Napi::Value DataDictionaryWrap::IsField(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) {
    throw Napi::TypeError::New(env, "isField(tag: number)");
  }
  int tag = info[0].As<Napi::Number>().Int32Value();
  NQ_TRY(env) {
    return Napi::Boolean::New(env, dict_.isField(tag));
  } NQ_CATCH(env)
}

Napi::Value DataDictionaryWrap::IsMsgType(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    throw Napi::TypeError::New(env, "isMsgType(msgType: string)");
  }
  std::string msgType = info[0].As<Napi::String>().Utf8Value();
  NQ_TRY(env) {
    return Napi::Boolean::New(env, dict_.isMsgType(msgType));
  } NQ_CATCH(env)
}

}  // namespace napi_quickfix
