// Argument coercion shared by MessageWrap and GroupWrap, plus the helper that
// turns a JS tag array into a QuickFIX `message_order`.
//
// Field order follows QuickFIX exactly. Every FieldMap sorts with the
// `message_order` it was constructed with: numeric for a message body unless
// an explicit order is given (FIX::Message(hdrOrder, trlOrder, order)), and
// for a group the delimiter first followed by the given order
// (FIX::Group(field, delim, order[])). Tags not listed in an explicit order
// sort after the listed ones, numerically.
#ifndef NAPI_QUICKFIX_FIELD_MAP_UTIL_H
#define NAPI_QUICKFIX_FIELD_MAP_UTIL_H

#include <napi.h>

#include <string>
#include <vector>

#include "quickfix/MessageSorters.h"

namespace napi_quickfix {

// Largest tag accepted in an explicit `order`. QuickFIX indexes a flat array
// by tag for ordered maps (4 bytes per possible tag), so the cap bounds that
// allocation. Standard FIX tags stay below 10000; user-defined ones rarely
// exceed a few tens of thousands.
constexpr int kMaxOrderTag = 100000;

// Coerce a JS arg to a FIX tag: any int32 integer. Unknown tags surface as
// FieldNotFound from QuickFIX on reads, as in the C++ API.
inline int CoerceTag(Napi::Env env, Napi::Value v) {
  if (!v.IsNumber()) {
    throw Napi::TypeError::New(env, "field tag must be a number");
  }
  const double d = v.As<Napi::Number>().DoubleValue();
  if (d != static_cast<double>(static_cast<int>(d)) || d < -2147483648.0 ||
      d > 2147483647.0) {
    throw Napi::TypeError::New(env, "field tag must be an integer");
  }
  return static_cast<int>(d);
}

// Coerce a JS arg to a tag being SET. Like CoerceTag but positive: QuickFIX's
// ordered sorter indexes its array by tag, so a non-positive tag must never
// enter a map that may carry an explicit order.
inline int CoerceSetTag(Napi::Env env, Napi::Value v) {
  const int tag = CoerceTag(env, v);
  if (tag < 1) {
    throw Napi::TypeError::New(env, "field tag must be a positive integer");
  }
  return tag;
}

// Coerce a JS arg to a 1-based group instance index. Must be an integer; an
// out-of-range value is left to QuickFIX, which reports FieldNotFound.
inline int CoerceGroupIndex(Napi::Env env, Napi::Value v) {
  if (!v.IsNumber()) {
    throw Napi::TypeError::New(env, "group index must be a number");
  }
  const double d = v.As<Napi::Number>().DoubleValue();
  if (d != static_cast<double>(static_cast<int>(d)) || d < -2147483648.0 ||
      d > 2147483647.0) {
    throw Napi::TypeError::New(env, "group index must be an integer");
  }
  return static_cast<int>(d);
}

// Coerce a JS arg to a FIX field value string. Accepts string or number
// (numbers are stringified without trailing ".0"). Throws TypeError otherwise.
inline std::string CoerceValue(Napi::Env env, Napi::Value v) {
  if (v.IsString()) {
    return v.As<Napi::String>().Utf8Value();
  }
  if (v.IsNumber()) {
    double d = v.As<Napi::Number>().DoubleValue();
    if (d == static_cast<double>(static_cast<long long>(d))) {
      return std::to_string(static_cast<long long>(d));
    }
    return std::to_string(d);
  }
  throw Napi::TypeError::New(env, "field value must be a string or number");
}

// Coerce an optional JS `order` argument (undefined/null = none) to a list of
// distinct tags in [1, kMaxOrderTag]. Throws TypeError otherwise.
inline std::vector<int> CoerceOrder(Napi::Env env, Napi::Value v,
                                    const char* argName) {
  std::vector<int> order;
  if (v.IsUndefined() || v.IsNull()) {
    return order;
  }
  if (!v.IsArray()) {
    throw Napi::TypeError::New(
        env, std::string(argName) + " must be an array of field tags");
  }
  Napi::Array arr = v.As<Napi::Array>();
  for (uint32_t i = 0; i < arr.Length(); i++) {
    const int tag = CoerceTag(env, arr.Get(i));
    if (tag < 1 || tag > kMaxOrderTag) {
      throw Napi::TypeError::New(
          env, std::string(argName) + " tags must be integers between 1 and " +
                   std::to_string(kMaxOrderTag));
    }
    bool seen = false;
    for (int t : order) {
      if (t == tag) seen = true;
    }
    if (!seen) order.push_back(tag);
  }
  return order;
}

// QuickFIX sorter for an explicit order (numeric when the list is empty).
inline FIX::message_order MakeOrder(const std::vector<int>& order) {
  if (order.empty()) {
    return FIX::message_order(FIX::message_order::normal);
  }
  return FIX::message_order(order.data(), order.size());
}

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_FIELD_MAP_UTIL_H
