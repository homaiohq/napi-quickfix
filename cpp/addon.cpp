// Module init for @homaiohq/napi-quickfix: registers all wrappers and
// module-level functions. FIX constants (field tags, value groups) are not
// exported here: they are generated on the TS side from the QuickFIX headers
// (scripts/gen-fields.mjs, scripts/gen-values.mjs).

#include <napi.h>

#include <exception>
#include <string>

#include "quickfix/Exceptions.h"
#include "quickfix/Field.h"
#include "quickfix/FieldNumbers.h"
#include "quickfix/Message.h"

#include "acceptor_wrap.h"
#include "data_dictionary_wrap.h"
#include "initiator_wrap.h"
#include "message_wrap.h"
#include "session_id_wrap.h"
#include "session_settings_wrap.h"
#include "session_wrap.h"

namespace napi_quickfix {

// Defined in session_static.cpp.
void RegisterSessionStatic(Napi::Env env, Napi::Object exports);

namespace {

// Keep in sync with package.json "version".
constexpr const char* kAddonVersion = "0.1.0";

Napi::Value Version(const Napi::CallbackInfo& info) {
  return Napi::String::New(info.Env(), kAddonVersion);
}

// Phase-1 regression smoke: prove quickfix parsing still links & works.
Napi::Value QuickfixParseMsgType(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    throw Napi::TypeError::New(
        env, "quickfixParseMsgType(raw: string): expected a string argument");
  }
  const std::string raw = info[0].As<Napi::String>().Utf8Value();
  try {
    FIX::Message message(raw, /*validate=*/false);
    const std::string& msgType = message.getHeader().getField(FIX::FIELD::MsgType);
    return Napi::String::New(env, msgType);
  } catch (const FIX::Exception& e) {
    Napi::Error err = Napi::Error::New(env, e.what());
    err.Set("fixError", Napi::String::New(env, "InvalidMessage"));
    throw err;
  } catch (const std::exception& e) {
    throw Napi::Error::New(env, e.what());
  }
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("version", Napi::Function::New(env, Version, "version"));
  exports.Set("quickfixParseMsgType",
              Napi::Function::New(env, QuickfixParseMsgType, "quickfixParseMsgType"));

  MessageWrap::Init(env, exports);
  SessionIDWrap::Init(env, exports);
  SessionSettingsWrap::Init(env, exports);
  DataDictionaryWrap::Init(env, exports);
  SessionWrap::Init(env, exports);
  InitiatorWrap::Init(env, exports);
  AcceptorWrap::Init(env, exports);

  RegisterSessionStatic(env, exports);

  return exports;
}

}  // namespace

}  // namespace napi_quickfix

static Napi::Object InitModule(Napi::Env env, Napi::Object exports) {
  return napi_quickfix::Init(env, exports);
}

NODE_API_MODULE(napi_quickfix, InitModule)
