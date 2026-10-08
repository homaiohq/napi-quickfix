#include "group_wrap.h"

#include <algorithm>
#include <string>
#include <vector>

#include "errors.h"
#include "field_map_util.h"

namespace napi_quickfix {

Napi::FunctionReference GroupWrap::constructor_;

Napi::Object GroupWrap::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(
      env, "Group",
      {
          InstanceMethod("getField", &GroupWrap::GetField),
          InstanceMethod("setField", &GroupWrap::SetField),
          InstanceMethod("hasField", &GroupWrap::HasField),
          InstanceMethod("addGroup", &GroupWrap::AddGroup),
          InstanceMethod("getGroup", &GroupWrap::GetGroup),
          InstanceMethod("groupCount", &GroupWrap::GroupCount),
          InstanceMethod("getCountTag", &GroupWrap::GetCountTag),
          InstanceMethod("getDelimiterTag", &GroupWrap::GetDelimiterTag),
          InstanceMethod("toString", &GroupWrap::ToString),
          InstanceMethod("toPretty", &GroupWrap::ToPretty),
      });

  constructor_ = Napi::Persistent(func);
  constructor_.SuppressDestruct();

  exports.Set("GroupWrap", func);
  return exports;
}

Napi::Object GroupWrap::NewInstance(Napi::Env env, int countTag,
                                    const FIX::FieldMap& instance) {
  // A dictionary-parsed instance is stored as a FIX::Group and knows its
  // delimiter. One added through addGroup is sliced to a plain FieldMap, so
  // fall back to its first field: RequireDelimiter guarantees the delimiter
  // was set, and both sorters put it first. An empty instance can only come
  // from QuickFIX itself; use the count tag so tag validation passes.
  int delim = countTag;
  if (const auto* asGroup = dynamic_cast<const FIX::Group*>(&instance)) {
    delim = asGroup->delim();
  } else if (instance.begin() != instance.end()) {
    delim = instance.begin()->getTag();
  }
  Napi::Object obj = constructor_.New(
      {Napi::Number::New(env, countTag), Napi::Number::New(env, delim)});
  GroupWrap* wrap = Napi::ObjectWrap<GroupWrap>::Unwrap(obj);
  // FieldMap assignment copies fields, nested groups AND the sorter, so the
  // copy serialises exactly like the original.
  static_cast<FIX::FieldMap&>(wrap->group_) = instance;
  return obj;
}

void GroupWrap::RequireDelimiter(Napi::Env env) const {
  if (!group_.isSetField(group_.delim())) {
    throw Napi::Error::New(
        env, "group delimiter field " + std::to_string(group_.delim()) +
                 " must be set before the group is added");
  }
}

GroupWrap* GroupWrap::UnwrapArg(Napi::Env env, Napi::Value value,
                                const char* argName) {
  if (!value.IsObject() ||
      !value.As<Napi::Object>().InstanceOf(constructor_.Value())) {
    throw Napi::TypeError::New(
        env, std::string(argName) + " must be a Group instance");
  }
  return Napi::ObjectWrap<GroupWrap>::Unwrap(value.As<Napi::Object>());
}

GroupWrap::GroupWrap(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<GroupWrap>(info),
      // Placeholder; replaced below once the arguments are validated.
      group_(0, 0, FIX::message_order(FIX::message_order::normal)) {
  Napi::Env env = info.Env();
  if (info.Length() < 2) {
    throw Napi::TypeError::New(
        env, "new Group(countTag: number, delimiterTag: number, order?: number[])");
  }
  const int countTag = CoerceSetTag(env, info[0]);
  const int delim = CoerceSetTag(env, info[1]);

  pinned_.push_back(delim);
  if (info.Length() >= 3 && !info[2].IsUndefined() && !info[2].IsNull()) {
    if (!info[2].IsArray()) {
      throw Napi::TypeError::New(env, "order must be an array of field tags");
    }
    Napi::Array arr = info[2].As<Napi::Array>();
    for (uint32_t i = 0; i < arr.Length(); i++) {
      const int tag = CoerceSetTag(env, arr.Get(i));
      if (i == 0 && tag != delim) {
        throw Napi::TypeError::New(
            env, "order must start with the delimiter tag (" +
                     std::to_string(delim) + "), got " + std::to_string(tag));
      }
      AppendUnique(pinned_, tag);
    }
  }

  group_ = FIX::Group(countTag, delim, MakeOrder(pinned_));
}

void GroupWrap::EnsureTag(int tag) {
  if (group_.isSetField(tag) ||
      std::find(pinned_.begin(), pinned_.end(), tag) != pinned_.end()) {
    // Already has a slot in the sorter: pinned tags are listed from the start,
    // set tags were listed by the rebuild that admitted them.
    return;
  }
  if (!CanReorder(group_)) {
    // Out-of-range or repeated tags (see field_map_util.h): let QuickFIX
    // insert under the existing sorter instead of rebuilding.
    return;
  }
  std::vector<int> order = pinned_;
  for (int t : CurrentTagOrder(group_)) {
    AppendUnique(order, t);
  }
  order.push_back(tag);
  FIX::Group fresh(group_.field(), group_.delim(), MakeOrder(order));
  CopyContents(group_, fresh);
  group_ = fresh;
}

Napi::Value GroupWrap::GetField(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  int tag = CoerceTag(env, info[0]);
  NQ_TRY(env) {
    return Napi::String::New(env, group_.getField(tag));
  } NQ_CATCH(env)
}

Napi::Value GroupWrap::SetField(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  int tag = CoerceSetTag(env, info[0]);
  std::string value = CoerceValue(env, info[1]);
  NQ_TRY(env) {
    EnsureTag(tag);
    group_.setField(tag, value);
  } NQ_CATCH(env)
  return env.Undefined();
}

Napi::Value GroupWrap::HasField(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  int tag = CoerceTag(env, info[0]);
  return Napi::Boolean::New(env, group_.isSetField(tag));
}

Napi::Value GroupWrap::AddGroup(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  GroupWrap* sub = UnwrapArg(env, info[0], "group");
  sub->RequireDelimiter(env);
  NQ_TRY(env) {
    EnsureTag(sub->group_.field());
    group_.addGroup(sub->group_);
  } NQ_CATCH(env)
  return env.Undefined();
}

Napi::Value GroupWrap::GetGroup(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const int num = CoerceGroupIndex(env, info[0]);
  const int countTag = CoerceTag(env, info[1]);
  NQ_TRY(env) {
    const FIX::FieldMap& instance = group_.getGroupRef(num, countTag);
    return NewInstance(env, countTag, instance);
  } NQ_CATCH(env)
}

Napi::Value GroupWrap::GroupCount(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const int countTag = CoerceTag(env, info[0]);
  return Napi::Number::New(
      env, static_cast<double>(group_.groupCount(countTag)));
}

Napi::Value GroupWrap::GetCountTag(const Napi::CallbackInfo& info) {
  return Napi::Number::New(info.Env(), group_.field());
}

Napi::Value GroupWrap::GetDelimiterTag(const Napi::CallbackInfo& info) {
  return Napi::Number::New(info.Env(), group_.delim());
}

Napi::Value GroupWrap::ToString(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  NQ_TRY(env) {
    std::string s;
    group_.calculateString(s);
    return Napi::String::New(env, s);
  } NQ_CATCH(env)
}

Napi::Value GroupWrap::ToPretty(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  NQ_TRY(env) {
    std::string s;
    group_.calculateString(s);
    std::replace(s.begin(), s.end(), '\x01', '|');
    return Napi::String::New(env, s);
  } NQ_CATCH(env)
}

}  // namespace napi_quickfix
