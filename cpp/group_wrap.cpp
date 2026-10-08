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
  // Both QuickFIX's parser and our addGroup store instances as FIX::Group
  // objects, which know their delimiter. Fall back to the first field (every
  // group sorter puts the delimiter first), then to the count tag for an
  // empty instance, so the constructor's tag validation passes.
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
  const std::vector<int> order =
      info.Length() >= 3 ? CoerceOrder(env, info[2], "order") : std::vector<int>();

  if (order.empty()) {
    // FIX::Group(field, delim): delimiter first, then numeric.
    group_ = FIX::Group(countTag, delim);
  } else {
    // FIX::Group(field, delim, order[]): the delimiter must open every
    // instance on the wire, so it has to lead the order.
    if (order[0] != delim) {
      throw Napi::TypeError::New(
          env, "order must start with the delimiter tag (" +
                   std::to_string(delim) + "), got " + std::to_string(order[0]));
    }
    group_ = FIX::Group(countTag, delim, MakeOrder(order));
  }
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
  NQ_TRY(env) {
    // Store a FIX::Group copy (not a sliced FieldMap) so getGroup can read
    // the delimiter back; QuickFIX's parser stores instances the same way.
    group_.addGroupPtr(sub->group_.field(), new FIX::Group(sub->group_));
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
