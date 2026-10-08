#ifndef NAPI_QUICKFIX_GROUP_WRAP_H
#define NAPI_QUICKFIX_GROUP_WRAP_H

#include <napi.h>

#include <vector>

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
// Field order on the wire: the delimiter tag always comes first (FIX requires
// it to open every instance), then the tags of `order` in the given sequence,
// then every other tag in the order it was set. Nothing is sorted numerically.
class GroupWrap : public Napi::ObjectWrap<GroupWrap> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);

  // Build a JS GroupWrap holding a COPY of an existing group instance (as
  // stored inside a message or a parent group). `countTag` is the NoXxx tag
  // the instance lives under. The delimiter comes from the stored FIX::Group
  // when QuickFIX parsed it with a dictionary, else from the first field.
  static Napi::Object NewInstance(Napi::Env env, int countTag,
                                  const FIX::FieldMap& instance);

  explicit GroupWrap(const Napi::CallbackInfo& info);

  FIX::Group& Group() { return group_; }
  const FIX::Group& Group() const { return group_; }

  // Unwrap a JS value that must be a GroupWrap; throws Napi::TypeError if not.
  static GroupWrap* UnwrapArg(Napi::Env env, Napi::Value value,
                              const char* argName);

  // Throw a JS Error unless the delimiter field is set: FIX needs it to open
  // every instance, and getGroup recovers the delimiter from the first field.
  void RequireDelimiter(Napi::Env env) const;

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

  // Make sure `tag` has a slot in the wire order before it is set for the
  // first time (see field_map_util.h). No-op if the tag is already present.
  void EnsureTag(int tag);

  FIX::Group group_;
  // Tags pinned by the constructor's `order` argument (delimiter first).
  std::vector<int> pinned_;
};

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_GROUP_WRAP_H
