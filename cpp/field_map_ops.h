// Operations on a FIX::FieldMap shared by MessageWrap (whose body, header and
// trailer are FieldMaps) and GroupWrap (one group instance):
//
//   - copies that keep nested group instances typed as FIX::Group, so a
//     delimiter set through this API survives every copy we make;
//   - the JS-facing field / group method bodies, so a guard added to one
//     wrapper cannot be missed in the other.
#ifndef NAPI_QUICKFIX_FIELD_MAP_OPS_H
#define NAPI_QUICKFIX_FIELD_MAP_OPS_H

#include <napi.h>

#include "quickfix/FieldMap.h"
#include "quickfix/Group.h"
#include "quickfix/Message.h"

namespace napi_quickfix {

// --- Copies ----------------------------------------------------------------
//
// FieldMap::operator= re-creates every nested instance as a plain FieldMap
// (`new FieldMap(*group)`), slicing off FIX::Group's delimiter. QuickFIX's own
// parser stores instances the same sliced way, which is harmless for it: a
// parsed instance always starts with its delimiter on the wire. Instances
// built through this API may not (a Group whose delimiter was never set), so
// every copy we make goes through these helpers, which clone a FIX::Group
// instance as a FIX::Group, recursively.

// Deep-copy `src` into `dst`: fields, sorter and nested groups.
void CopyFieldMap(FIX::FieldMap& dst, const FIX::FieldMap& src);

// Deep-copy a whole message (header, body, trailer, structure flags).
void CopyMessage(FIX::Message& dst, const FIX::Message& src);

// Heap-clone one group instance for addGroupPtr: a FIX::Group when `src` is
// one, else a plain FieldMap (keeping the first-field delimiter heuristic
// meaningful for it).
FIX::FieldMap* CloneInstance(const FIX::FieldMap& src);

// Clone an instance as a FIX::Group living under `countTag`. The delimiter is
// read from `instance` when it is a FIX::Group, else from its first field
// (every group sorter puts the delimiter first), else `countTag` for an empty
// sliced instance so the Group constructor's validation passes.
FIX::Group* CloneAsGroup(int countTag, const FIX::FieldMap& instance);

// --- JS-facing method bodies ---------------------------------------------
//
// Arguments arrive already coerced (see field_map_util.h); QuickFIX
// exceptions are translated to JS errors.

Napi::Value GetFieldOf(Napi::Env env, const FIX::FieldMap& map, int tag);
void SetFieldOf(Napi::Env env, FIX::FieldMap& map, int tag,
                const std::string& value);
// Append a typed copy of `instance` under `countTag`; QuickFIX sets the count
// field and keeps it equal to the number of instances.
void AddGroupTo(Napi::Env env, FIX::FieldMap& map, int countTag,
                const FIX::Group& instance);
// A JS Group holding a copy of instance `num` (1-based) of group `countTag`.
Napi::Value GetGroupOf(Napi::Env env, const FIX::FieldMap& map, int num,
                       int countTag);
Napi::Value GroupCountOf(Napi::Env env, const FIX::FieldMap& map,
                         int countTag);
// `map`'s fields and nested groups as a wire string, `|` for SOH when pretty.
Napi::Value FieldMapToString(Napi::Env env, const FIX::FieldMap& map,
                             bool pretty);

}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_FIELD_MAP_OPS_H
