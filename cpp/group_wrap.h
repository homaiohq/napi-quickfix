#ifndef NAPI_QUICKFIX_GROUP_WRAP_H
#define NAPI_QUICKFIX_GROUP_WRAP_H

#include <napi.h>

#include "quickfix/Group.h"

namespace napi_quickfix {

// Napi::ObjectWrap over FIX::Group — one entry of a repeating group.
//
//   new GroupWrap(field: number, delim: number, order?: number[])
//
// `field` is the group's count tag (e.g. 453 NoPartyIDs), `delim` the first tag
// of every entry (e.g. 448 PartyID), and `order` the optional full field order
// of an entry (delimiter first). Without `order`, fields sort delimiter-first
// then by tag number.
//
// Field methods: getField / setField / isSetField / removeField /
// getFieldIfSet / totalFields / isEmpty / clear / fields / toString.
// Nested groups: addGroup / getGroup / replaceGroup / removeGroup / hasGroup /
// groupCount. Group indices are 1-based, as in QuickFIX.
class GroupWrap : public Napi::ObjectWrap<GroupWrap> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);

  // Build a JS GroupWrap wrapping a COPY of the given FIX::Group.
  static Napi::Object NewInstance(Napi::Env env, const FIX::Group& group);

  explicit GroupWrap(const Napi::CallbackInfo& info);

  FIX::Group& Group() { return group_; }
  const FIX::Group& Group() const { return group_; }

  // Unwrap a JS value that must be a GroupWrap; throws Napi::TypeError if not.
  static GroupWrap* UnwrapArg(Napi::Env env, Napi::Value value,
                              const char* argName);

 private:
  static Napi::FunctionReference constructor_;

  static FIX::Group MakeGroup(const Napi::CallbackInfo& info);

  Napi::Value Field(const Napi::CallbackInfo& info);
  Napi::Value Delim(const Napi::CallbackInfo& info);

  Napi::Value GetField(const Napi::CallbackInfo& info);
  Napi::Value SetField(const Napi::CallbackInfo& info);
  Napi::Value IsSetField(const Napi::CallbackInfo& info);
  Napi::Value RemoveField(const Napi::CallbackInfo& info);
  Napi::Value GetFieldIfSet(const Napi::CallbackInfo& info);
  Napi::Value TotalFields(const Napi::CallbackInfo& info);
  Napi::Value IsEmpty(const Napi::CallbackInfo& info);
  Napi::Value Clear(const Napi::CallbackInfo& info);
  Napi::Value Fields(const Napi::CallbackInfo& info);
  Napi::Value ToString(const Napi::CallbackInfo& info);

  Napi::Value AddGroup(const Napi::CallbackInfo& info);
  Napi::Value GetGroup(const Napi::CallbackInfo& info);
  Napi::Value ReplaceGroup(const Napi::CallbackInfo& info);
  Napi::Value RemoveGroup(const Napi::CallbackInfo& info);
  Napi::Value HasGroup(const Napi::CallbackInfo& info);
  Napi::Value GroupCount(const Napi::CallbackInfo& info);

  FIX::Group group_;
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_GROUP_WRAP_H
