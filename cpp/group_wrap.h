#ifndef NAPI_QUICKFIX_GROUP_WRAP_H
#define NAPI_QUICKFIX_GROUP_WRAP_H

#include <napi.h>

#include "quickfix/FieldMap.h"
#include "quickfix/Group.h"

namespace napi_quickfix {

// Napi::ObjectWrap over FIX::Group — one instance of a repeating group.
//
//   new GroupWrap(countTag: number, delimiterTag: number, order?: number[])
//
// Methods: getField / setField / hasField / addGroup / getGroup / groupCount /
// getCountTag / getDelimiterTag / toString / toPretty.
//
// Field order is QuickFIX's: FIX::Group(field, delim) puts the delimiter
// first and the rest in numeric order; FIX::Group(field, delim, order[]) puts
// the listed tags in that sequence (the delimiter must lead it) and any other
// tag after them, numerically.
class GroupWrap : public Napi::ObjectWrap<GroupWrap> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);

  // Build a JS GroupWrap holding a COPY of an existing group instance (as
  // stored inside a message or a parent group). `countTag` is the NoXxx tag
  // the instance lives under. Instances are stored as FIX::Group objects (by
  // the parser and by our addGroup), so the delimiter is read from there.
  static Napi::Object NewInstance(Napi::Env env, int countTag,
                                  const FIX::FieldMap& instance);

  explicit GroupWrap(const Napi::CallbackInfo& info);

  FIX::Group& Group() { return group_; }
  const FIX::Group& Group() const { return group_; }

  // Unwrap a JS value that must be a GroupWrap; throws Napi::TypeError if not.
  static GroupWrap* UnwrapArg(Napi::Env env, Napi::Value value,
                              const char* argName);

 private:
  static Napi::FunctionReference constructor_;

  Napi::Value GetField(const Napi::CallbackInfo& info);
  Napi::Value SetField(const Napi::CallbackInfo& info);
  Napi::Value HasField(const Napi::CallbackInfo& info);
  Napi::Value AddGroup(const Napi::CallbackInfo& info);
  Napi::Value GetGroup(const Napi::CallbackInfo& info);
  Napi::Value GroupCount(const Napi::CallbackInfo& info);
  Napi::Value GetCountTag(const Napi::CallbackInfo& info);
  Napi::Value GetDelimiterTag(const Napi::CallbackInfo& info);
  Napi::Value ToString(const Napi::CallbackInfo& info);
  Napi::Value ToPretty(const Napi::CallbackInfo& info);

  FIX::Group group_;
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_GROUP_WRAP_H
