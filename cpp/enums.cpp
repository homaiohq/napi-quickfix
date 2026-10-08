#include <napi.h>

namespace napi_quickfix {

namespace {

void SetInt(Napi::Object obj, const char* key, int value) {
  obj.Set(key, Napi::Number::New(obj.Env(), value));
}

void SetStr(Napi::Object obj, const char* key, const char* value) {
  obj.Set(key, Napi::String::New(obj.Env(), value));
}

}  // namespace

// Exposes commonly-needed FIX enum values (MsgType, Side, ...) as `exports.enums`.
// Field tags are NOT here: `FIELD` is generated on the TS side from QuickFIX's
// FixFieldNumbers.h (scripts/gen-fields.mjs) so it covers every field.
// Not exhaustive by design — a curated, useful subset.
void RegisterEnums(Napi::Env env, Napi::Object exports) {
  Napi::Object enums = Napi::Object::New(env);

  // --- MsgType ------------------------------------------------------------
  Napi::Object msgType = Napi::Object::New(env);
  SetStr(msgType, "Heartbeat", "0");
  SetStr(msgType, "TestRequest", "1");
  SetStr(msgType, "ResendRequest", "2");
  SetStr(msgType, "Reject", "3");
  SetStr(msgType, "SequenceReset", "4");
  SetStr(msgType, "Logout", "5");
  SetStr(msgType, "Logon", "A");
  SetStr(msgType, "NewOrderSingle", "D");
  SetStr(msgType, "ExecutionReport", "8");
  SetStr(msgType, "OrderCancelRequest", "F");
  SetStr(msgType, "OrderCancelReplaceRequest", "G");
  SetStr(msgType, "OrderCancelReject", "9");
  enums.Set("MsgType", msgType);

  // --- Side ---------------------------------------------------------------
  Napi::Object side = Napi::Object::New(env);
  SetStr(side, "Buy", "1");
  SetStr(side, "Sell", "2");
  SetStr(side, "SellShort", "5");
  enums.Set("Side", side);

  // --- OrdType ------------------------------------------------------------
  Napi::Object ordType = Napi::Object::New(env);
  SetStr(ordType, "Market", "1");
  SetStr(ordType, "Limit", "2");
  SetStr(ordType, "Stop", "3");
  SetStr(ordType, "StopLimit", "4");
  enums.Set("OrdType", ordType);

  // --- TimeInForce --------------------------------------------------------
  Napi::Object tif = Napi::Object::New(env);
  SetStr(tif, "Day", "0");
  SetStr(tif, "GoodTillCancel", "1");
  SetStr(tif, "ImmediateOrCancel", "3");
  SetStr(tif, "FillOrKill", "4");
  enums.Set("TimeInForce", tif);

  exports.Set("enums", enums);
}

}  // namespace napi_quickfix
