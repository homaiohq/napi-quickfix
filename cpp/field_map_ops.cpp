#include "field_map_ops.h"

#include <algorithm>
#include <memory>
#include <string>

#include "errors.h"
#include "group_wrap.h"

namespace napi_quickfix {

namespace {

// The delimiter of a stored instance; see CloneAsGroup in the header.
int DelimiterOf(const FIX::FieldMap& instance, int fallback) {
  if (const auto* asGroup = dynamic_cast<const FIX::Group*>(&instance)) {
    return asGroup->delim();
  }
  if (instance.begin() != instance.end()) {
    return instance.begin()->getTag();
  }
  return fallback;
}

// `dst` has just been assigned from `src`, so it holds sliced copies of the
// nested instances. Swap them for typed clones. The count fields are left as
// the source had them (the parser's instances carry the wire's count, ours
// the instance count).
void RestoreGroups(FIX::FieldMap& dst, const FIX::FieldMap& src) {
  for (const auto& tagWithGroups : src.groups()) {
    const int tag = tagWithGroups.first;
    // Drops the sliced instances and the count field.
    dst.removeGroup(tag);
    for (const FIX::FieldMap* instance : tagWithGroups.second) {
      dst.addGroupPtr(tag, CloneInstance(*instance), /*setCount=*/false);
    }
    if (src.isSetField(tag)) {
      dst.setField(tag, src.getField(tag));
    }
  }
}

}  // namespace

void CopyFieldMap(FIX::FieldMap& dst, const FIX::FieldMap& src) {
  // FieldMap::operator= copies the fields, the sorter and (sliced) nested
  // instances; only the latter need redoing.
  dst = src;
  RestoreGroups(dst, src);
}

void CopyMessage(FIX::Message& dst, const FIX::Message& src) {
  dst = src;
  RestoreGroups(dst.getHeader(), src.getHeader());
  RestoreGroups(dst, src);
  RestoreGroups(dst.getTrailer(), src.getTrailer());
}

FIX::FieldMap* CloneInstance(const FIX::FieldMap& src) {
  if (const auto* asGroup = dynamic_cast<const FIX::Group*>(&src)) {
    return CloneAsGroup(asGroup->field(), src);
  }
  auto clone = std::make_unique<FIX::FieldMap>();
  CopyFieldMap(*clone, src);
  return clone.release();
}

FIX::Group* CloneAsGroup(int countTag, const FIX::FieldMap& instance) {
  // A numeric placeholder sorter: CopyFieldMap replaces it with the source's
  // own sorter, so no group-order array is allocated just to be discarded.
  auto clone = std::make_unique<FIX::Group>(
      countTag, DelimiterOf(instance, countTag),
      FIX::message_order(FIX::message_order::normal));
  CopyFieldMap(*clone, instance);
  return clone.release();
}

Napi::Value GetFieldOf(Napi::Env env, const FIX::FieldMap& map, int tag) {
  NQ_TRY(env) {
    return Napi::String::New(env, map.getField(tag));
  } NQ_CATCH(env)
}

void SetFieldOf(Napi::Env env, FIX::FieldMap& map, int tag,
                const std::string& value) {
  NQ_TRY(env) {
    map.setField(tag, value);
  } NQ_CATCH(env)
}

void AddGroupTo(Napi::Env env, FIX::FieldMap& map, int countTag,
                const FIX::Group& instance) {
  NQ_TRY(env) {
    map.addGroupPtr(countTag, CloneAsGroup(countTag, instance));
  } NQ_CATCH(env)
}

Napi::Value GetGroupOf(Napi::Env env, const FIX::FieldMap& map, int num,
                       int countTag) {
  NQ_TRY(env) {
    const FIX::FieldMap& instance = map.getGroupRef(num, countTag);
    return GroupWrap::NewInstance(env, countTag, instance);
  } NQ_CATCH(env)
}

Napi::Value GroupCountOf(Napi::Env env, const FIX::FieldMap& map,
                         int countTag) {
  return Napi::Number::New(env, static_cast<double>(map.groupCount(countTag)));
}

Napi::Value FieldMapToString(Napi::Env env, const FIX::FieldMap& map,
                             bool pretty) {
  NQ_TRY(env) {
    std::string s;
    map.calculateString(s);
    if (pretty) {
      std::replace(s.begin(), s.end(), '\x01', '|');
    }
    return Napi::String::New(env, s);
  } NQ_CATCH(env)
}

}  // namespace napi_quickfix
