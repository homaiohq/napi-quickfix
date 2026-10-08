#include "group_wrap.h"

#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "field_map_ops.h"
#include "field_map_util.h"

namespace napi_quickfix {

namespace {

// What NewInstance hands the constructor: ownership of a ready-made group.
// JS code cannot create an External, so this path is internal only.
using Adopted = Napi::External<std::unique_ptr<FIX::Group>>;

}  // namespace

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
  std::unique_ptr<FIX::Group> clone(CloneAsGroup(countTag, instance));
  // The constructor moves the group out of `clone`; if construction throws
  // first, `clone` still frees it.
  return constructor_.New({Adopted::New(env, &clone)});
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
    : Napi::ObjectWrap<GroupWrap>(info) {
  Napi::Env env = info.Env();
  if (info.Length() == 1 && info[0].IsExternal()) {
    group_ = std::move(*info[0].As<Adopted>().Data());
    return;
  }
  if (info.Length() < 2) {
    throw Napi::TypeError::New(
        env, "new Group(countTag: number, delimiterTag: number, order?: number[])");
  }
  const int countTag = CoerceTag(env, info[0]);
  const int delim = CoerceTag(env, info[1]);
  const std::vector<int> order =
      info.Length() >= 3 ? CoerceOrder(env, info[2], "order") : std::vector<int>();

  if (order.empty()) {
    // FIX::Group(field, delim): delimiter first, then numeric.
    group_ = std::make_unique<FIX::Group>(countTag, delim);
    return;
  }
  // FIX::Group(field, delim, order[]): the delimiter must open every
  // instance on the wire, so it has to lead the order.
  if (order[0] != delim) {
    throw Napi::TypeError::New(
        env, "order must start with the delimiter tag (" +
                 std::to_string(delim) + "), got " + std::to_string(order[0]));
  }
  group_ = std::make_unique<FIX::Group>(countTag, delim, MakeOrder(order));
}

Napi::Value GroupWrap::GetField(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return GetFieldOf(env, *group_, CoerceTag(env, info[0]));
}

Napi::Value GroupWrap::SetField(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const int tag = CoerceTag(env, info[0]);
  SetFieldOf(env, *group_, tag, CoerceValue(env, info[1]));
  return env.Undefined();
}

Napi::Value GroupWrap::HasField(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return Napi::Boolean::New(env, group_->isSetField(CoerceTag(env, info[0])));
}

Napi::Value GroupWrap::AddGroup(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const FIX::Group& sub = UnwrapArg(env, info[0], "group")->Group();
  AddGroupTo(env, *group_, sub.field(), sub);
  return env.Undefined();
}

Napi::Value GroupWrap::GetGroup(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const int num = CoerceGroupIndex(env, info[0]);
  const int countTag = CoerceTag(env, info[1]);
  return GetGroupOf(env, *group_, num, countTag);
}

Napi::Value GroupWrap::GroupCount(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return GroupCountOf(env, *group_, CoerceTag(env, info[0]));
}

Napi::Value GroupWrap::GetCountTag(const Napi::CallbackInfo& info) {
  return Napi::Number::New(info.Env(), group_->field());
}

Napi::Value GroupWrap::GetDelimiterTag(const Napi::CallbackInfo& info) {
  return Napi::Number::New(info.Env(), group_->delim());
}

Napi::Value GroupWrap::ToString(const Napi::CallbackInfo& info) {
  return FieldMapToString(info.Env(), *group_, /*pretty=*/false);
}

Napi::Value GroupWrap::ToPretty(const Napi::CallbackInfo& info) {
  return FieldMapToString(info.Env(), *group_, /*pretty=*/true);
}

}  // namespace napi_quickfix
