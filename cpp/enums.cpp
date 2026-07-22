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

// Exposes commonly-needed FIX field tags and enum values as `exports.enums`.
// Not exhaustive by design — a curated, useful subset.
void RegisterEnums(Napi::Env env, Napi::Object exports) {
  Napi::Object enums = Napi::Object::New(env);

  // --- FIELD: tag numbers -------------------------------------------------
  Napi::Object field = Napi::Object::New(env);
  SetInt(field, "BeginString", 8);
  SetInt(field, "BodyLength", 9);
  SetInt(field, "CheckSum", 10);
  SetInt(field, "MsgType", 35);
  SetInt(field, "MsgSeqNum", 34);
  SetInt(field, "SenderCompID", 49);
  SetInt(field, "TargetCompID", 56);
  SetInt(field, "SendingTime", 52);
  SetInt(field, "HeartBtInt", 108);
  SetInt(field, "EncryptMethod", 98);
  SetInt(field, "TestReqID", 112);
  SetInt(field, "ResetSeqNumFlag", 141);
  SetInt(field, "Text", 58);
  SetInt(field, "ClOrdID", 11);
  SetInt(field, "OrderID", 37);
  SetInt(field, "ExecID", 17);
  SetInt(field, "Symbol", 55);
  SetInt(field, "Side", 54);
  SetInt(field, "OrderQty", 38);
  SetInt(field, "Price", 44);
  SetInt(field, "OrdType", 40);
  SetInt(field, "TimeInForce", 59);
  SetInt(field, "TransactTime", 60);
  SetInt(field, "ExecType", 150);
  SetInt(field, "OrdStatus", 39);
  SetInt(field, "LeavesQty", 151);
  SetInt(field, "CumQty", 14);
  SetInt(field, "AvgPx", 6);
  enums.Set("FIELD", field);

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
