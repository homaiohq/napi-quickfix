#include "group_wrap.h"

#include <string>
#include <unordered_set>
#include <vector>

#include "errors.h"
#include "field_map_ops.h"

namespace napi_quickfix {

Napi::FunctionReference GroupWrap::constructor_;

Napi::Object GroupWrap::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(
      env, "Group",
      {
          InstanceMethod("field", &GroupWrap::Field),
          InstanceMethod("delim", &GroupWrap::Delim),
          InstanceMethod("getField", &GroupWrap::GetField),
          InstanceMethod("setField", &GroupWrap::SetField),
          InstanceMethod("isSetField", &GroupWrap::IsSetField),
          InstanceMethod("removeField", &GroupWrap::RemoveField),
          InstanceMethod("getFieldIfSet", &GroupWrap::GetFieldIfSet),
          InstanceMethod("totalFields", &GroupWrap::TotalFields),
          InstanceMethod("isEmpty", &GroupWrap::IsEmpty),
          InstanceMethod("clear", &GroupWrap::Clear),
          InstanceMethod("fields", &GroupWrap::Fields),
          InstanceMethod("toString", &GroupWrap::ToString),
          InstanceMethod("addGroup", &GroupWrap::AddGroup),
          InstanceMethod("getGroup", &GroupWrap::GetGroup),
          InstanceMethod("replaceGroup", &GroupWrap::ReplaceGroup),
          InstanceMethod("removeGroup", &GroupWrap::RemoveGroup),
          InstanceMethod("hasGroup", &GroupWrap::HasGroup),
          InstanceMethod("groupCount", &GroupWrap::GroupCount),
      });

  constructor_ = Napi::Persistent(func);
  constructor_.SuppressDestruct();

  exports.Set("GroupWrap", func);
  return exports;
}

// The entry travels to the constructor as an External, which JS code cannot
// forge, so the constructor can tell this internal path from a user call. The
// pointer is only read, and only during constructor_.New (Napi::External
// takes a non-const pointer, hence the cast).
Napi::Object GroupWrap::NewInstance(Napi::Env env, int tag, int delim,
                                    const FIX::FieldMap& entry) {
  return constructor_.New(
      {Napi::External<FIX::FieldMap>::New(env,
                                          const_cast<FIX::FieldMap*>(&entry)),
       Napi::Number::New(env, tag), Napi::Number::New(env, delim)});
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

const FIX::FieldMap* GroupWrap::EntryArg(const Napi::CallbackInfo& info) {
  if (info.Length() == 3 && info[0].IsExternal()) {
    return info[0].As<Napi::External<FIX::FieldMap>>().Data();
  }
  return nullptr;
}

// FIX::Group has no default constructor, so the member is built from the
// arguments in the initializer list. Returned as a prvalue: FIX::Group has no
// move constructor, so a named return would copy (and slice nested entries).
FIX::Group GroupWrap::MakeGroup(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (EntryArg(info) != nullptr) {
    // The constructor body clones the entry, field order included, over it.
    return FIX::Group(info[1].As<Napi::Number>().Int32Value(),
                      info[2].As<Napi::Number>().Int32Value(),
                      fieldmap::PlaceholderOrder());
  }
  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
    throw Napi::TypeError::New(
        env, "new Group(field: number, delim: number, order?: number[])");
  }
  const int field = fieldmap::CoerceSetTag(env, info[0]);
  const int delim =
      fieldmap::CheckOrderTag(env, fieldmap::CoerceSetTag(env, info[1]));

  if (info.Length() < 3 || fieldmap::IsNullish(info[2])) {
    return FIX::Group(field, delim);
  }
  if (!info[2].IsArray()) {
    throw Napi::TypeError::New(env, "order must be an array of field tags");
  }
  // QuickFIX reads the order array up to a 0 terminator, so 0 is not a valid
  // entry; the delimiter must come first for the sort to be meaningful. A tag
  // listed twice takes its last position (message_order::setOrder overwrites
  // its rank), which could move the delimiter off the front: rejected.
  Napi::Array arr = info[2].As<Napi::Array>();
  std::vector<int> order;
  std::unordered_set<int> seen;
  order.reserve(arr.Length() + 1);
  for (uint32_t i = 0; i < arr.Length(); i++) {
    int tag;
    if (!fieldmap::ToInteger(arr.Get(i), tag) || tag <= 0) {
      throw Napi::TypeError::New(
          env, "order must contain only positive integer field tags");
    }
    if (!seen.insert(tag).second) {
      throw Napi::TypeError::New(
          env, "order must not list field tag " + std::to_string(tag) +
                   " twice");
    }
    order.push_back(fieldmap::CheckOrderTag(env, tag));
  }
  if (order.empty()) {
    return FIX::Group(field, delim);
  }
  if (order.front() != delim) {
    throw Napi::TypeError::New(env, "order must start with the delimiter tag");
  }
  order.push_back(0);
  return FIX::Group(field, delim, order.data());
}

GroupWrap::GroupWrap(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<GroupWrap>(info), group_(MakeGroup(info)) {
  if (const FIX::FieldMap* entry = EntryArg(info)) {
    fieldmap::Clone(group_, *entry);  // fields, order and typed nested entries
  }
}

Napi::Value GroupWrap::Field(const Napi::CallbackInfo& info) {
  return Napi::Number::New(info.Env(), group_.field());
}

Napi::Value GroupWrap::Delim(const Napi::CallbackInfo& info) {
  return Napi::Number::New(info.Env(), group_.delim());
}

// A Group is a single FieldMap: every tag selects itself.
#define NQ_SELF [this](int) -> FIX::FieldMap& { return group_; }

Napi::Value GroupWrap::GetField(const Napi::CallbackInfo& info) {
  return fieldmap::GetField(info, NQ_SELF);
}

Napi::Value GroupWrap::SetField(const Napi::CallbackInfo& info) {
  return fieldmap::SetField(info, NQ_SELF);
}

Napi::Value GroupWrap::IsSetField(const Napi::CallbackInfo& info) {
  return fieldmap::IsSetField(info, NQ_SELF);
}

Napi::Value GroupWrap::RemoveField(const Napi::CallbackInfo& info) {
  return fieldmap::RemoveField(info, NQ_SELF);
}

Napi::Value GroupWrap::GetFieldIfSet(const Napi::CallbackInfo& info) {
  return fieldmap::GetFieldIfSet(info, NQ_SELF);
}

Napi::Value GroupWrap::TotalFields(const Napi::CallbackInfo& info) {
  return fieldmap::TotalFields(info.Env(), group_);
}

Napi::Value GroupWrap::IsEmpty(const Napi::CallbackInfo& info) {
  return fieldmap::IsEmpty(info.Env(), group_);
}

Napi::Value GroupWrap::Clear(const Napi::CallbackInfo& info) {
  return fieldmap::Clear(info.Env(), group_);
}

Napi::Value GroupWrap::Fields(const Napi::CallbackInfo& info) {
  return fieldmap::Fields(info.Env(), group_);
}

// The entry's fields (and nested groups) as a SOH-delimited string, in the
// order they would be emitted on the wire.
Napi::Value GroupWrap::ToString(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  NQ_TRY(env) {
    std::string s;
    group_.calculateString(s);
    return Napi::String::New(env, s);
  } NQ_CATCH(env)
}

Napi::Value GroupWrap::AddGroup(const Napi::CallbackInfo& info) {
  return fieldmap::AddGroup(info, NQ_SELF);
}

Napi::Value GroupWrap::GetGroup(const Napi::CallbackInfo& info) {
  return fieldmap::GetGroup(info, NQ_SELF);
}

Napi::Value GroupWrap::ReplaceGroup(const Napi::CallbackInfo& info) {
  return fieldmap::ReplaceGroup(info, NQ_SELF);
}

Napi::Value GroupWrap::RemoveGroup(const Napi::CallbackInfo& info) {
  return fieldmap::RemoveGroup(info, NQ_SELF);
}

Napi::Value GroupWrap::HasGroup(const Napi::CallbackInfo& info) {
  return fieldmap::HasGroup(info, NQ_SELF);
}

Napi::Value GroupWrap::GroupCount(const Napi::CallbackInfo& info) {
  return fieldmap::GroupCount(info, NQ_SELF);
}

#undef NQ_SELF

}  // namespace napi_quickfix
