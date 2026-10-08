// Helpers shared by MessageWrap and GroupWrap for keeping FIX::FieldMap bodies
// in INSERTION order rather than QuickFIX's default numeric tag order.
//
// QuickFIX sorts every FieldMap with a `message_order` fixed at construction
// (numeric for a message body, dictionary order for a group). The sorter is
// immutable, so "keep the order the caller set the fields in" is implemented
// by rebuilding the map: whenever a NEW tag is about to be set, construct a
// fresh map whose `group`-mode order lists every existing tag in its current
// sequence followed by the new tag, copy the contents across, and swap. A tag
// that is already present is overwritten in place and never moves.
//
// `message_order` indexes a flat array by tag number, so tags are capped at
// kMaxTag to bound that allocation (see CoerceTag).
#ifndef NAPI_QUICKFIX_FIELD_MAP_UTIL_H
#define NAPI_QUICKFIX_FIELD_MAP_UTIL_H

#include <napi.h>

#include <string>
#include <vector>

#include "quickfix/FieldMap.h"
#include "quickfix/MessageSorters.h"

namespace napi_quickfix {

// Largest tag number accepted when SETTING a field. FIX tags are small
// positive integers (standard tags stay below 10000, user-defined ones rarely
// exceed a few tens of thousands); the cap bounds the per-message order array,
// which costs 4 bytes per possible tag. Reads accept any 32-bit integer so a
// tag that arrived in a parsed message can always be looked up.
constexpr int kMaxTag = 100000;

// Coerce a JS arg to a FIX tag for a READ. Any integer in the int32 range is
// accepted; an unknown tag then surfaces as FieldNotFound from QuickFIX, as it
// always did. Throws TypeError for non-numbers and non-integers.
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

// Coerce a JS arg to a FIX tag for a SET. Throws TypeError unless it is an
// integer in [1, kMaxTag].
inline int CoerceSetTag(Napi::Env env, Napi::Value v) {
  const int tag = CoerceTag(env, v);
  if (tag < 1 || tag > kMaxTag) {
    throw Napi::TypeError::New(
        env, "field tag must be an integer between 1 and " +
                 std::to_string(kMaxTag));
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

// Tags of `map`'s own fields (not nested groups) in their current sequence.
inline std::vector<int> CurrentTagOrder(const FIX::FieldMap& map) {
  std::vector<int> order;
  order.reserve(map.totalFields());
  for (const FIX::FieldBase& field : map) {
    order.push_back(field.getTag());
  }
  return order;
}

// Whether `map` can be rebuilt with an explicit order. The order array is
// indexed by tag, so every present tag must lie in [1, kMaxTag]: a parsed
// message may carry a negative or huge tag (QuickFIX's parser accepts both),
// which would write out of bounds or allocate gigabytes. And a tag-keyed
// sorter cannot keep repeated tags in sequence, so a map holding duplicates
// (a group parsed without a dictionary) is left to QuickFIX's own insertion,
// which preserves the duplicates.
inline bool CanReorder(const FIX::FieldMap& map) {
  std::vector<int> seen;
  for (const FIX::FieldBase& field : map) {
    const int tag = field.getTag();
    if (tag < 1 || tag > kMaxTag) return false;
    for (int t : seen) {
      if (t == tag) return false;
    }
    seen.push_back(tag);
  }
  return true;
}

// Append `tag` to `order` unless already listed.
inline void AppendUnique(std::vector<int>& order, int tag) {
  for (int t : order) {
    if (t == tag) return;
  }
  order.push_back(tag);
}

// Build a `group`-mode sorter that orders tags exactly as listed; tags not
// listed sort after them numerically (never the case right after a rebuild).
inline FIX::message_order MakeOrder(const std::vector<int>& order) {
  if (order.empty()) {
    return FIX::message_order(FIX::message_order::normal);
  }
  return FIX::message_order(order.data(), order.size());
}

// Copy every field and every nested group of `from` into `to`, honouring
// `to`'s own sorter. Group instances are deep-copied; the count fields are
// copied as ordinary fields (setCount=false), so their values are preserved.
inline void CopyContents(const FIX::FieldMap& from, FIX::FieldMap& to) {
  for (const FIX::FieldBase& field : from) {
    to.setField(field);
  }
  for (const auto& tagWithGroups : from.groups()) {
    for (const FIX::FieldMap* group : tagWithGroups.second) {
      to.addGroup(tagWithGroups.first, *group, /*setCount=*/false);
    }
  }
}

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_FIELD_MAP_UTIL_H
