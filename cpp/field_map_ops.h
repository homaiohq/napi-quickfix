// FieldMap operations shared by MessageWrap and GroupWrap.
//
// FIX::Message (its body), FIX::Header, FIX::Trailer and FIX::Group are all
// FIX::FieldMap. The JS-facing field and repeating-group methods are therefore
// written once here as templates over a `Select` callable:
//
//   FIX::FieldMap& select(int tag)
//
// which picks the FieldMap that owns `tag`. MessageWrap routes well-known
// header/trailer tags to the right section; GroupWrap always returns itself.
// Each op parses its own arguments from the CallbackInfo, so the wrappers are
// one-line delegations.
//
// Group indices are 1-based, as in QuickFIX.
#ifndef NAPI_QUICKFIX_FIELD_MAP_OPS_H
#define NAPI_QUICKFIX_FIELD_MAP_OPS_H

#include <napi.h>

#include <cstdint>
#include <string>
#include <vector>

#include "errors.h"
#include "group_wrap.h"
#include "quickfix/FieldMap.h"
#include "quickfix/Group.h"

namespace napi_quickfix {
namespace fieldmap {

// --- argument coercion ------------------------------------------------------

inline bool IsNullish(Napi::Value v) { return v.IsUndefined() || v.IsNull(); }

inline int CoerceTag(Napi::Env env, Napi::Value v) {
  if (!v.IsNumber()) {
    throw Napi::TypeError::New(env, "field tag must be a number");
  }
  return v.As<Napi::Number>().Int32Value();
}

// Group index (1-based). Range errors are left to QuickFIX, which throws
// FieldNotFound for an index that does not exist.
inline int CoerceIndex(Napi::Env env, Napi::Value v) {
  if (!v.IsNumber()) {
    throw Napi::TypeError::New(env, "group index must be a number");
  }
  return v.As<Napi::Number>().Int32Value();
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

// --- group snapshots --------------------------------------------------------

// The delimiter of a stored group entry. QuickFIX stores entries as plain
// FieldMaps (addGroup copies and slices), so the delimiter is recovered from
// the entry itself: the dynamic type when it survived (entries QuickFIX parsed
// with a dictionary are FIX::Group), otherwise the first field — which is the
// delimiter by definition, since every group order sorts it first.
inline int DelimOf(const FIX::FieldMap& stored) {
  if (const auto* g = dynamic_cast<const FIX::Group*>(&stored)) {
    return g->delim();
  }
  if (stored.begin() != stored.end()) {
    return stored.begin()->getTag();
  }
  return 0;
}

// A FIX::Group copy of a stored entry (fields, nested groups and field order).
inline FIX::Group Snapshot(int tag, const FIX::FieldMap& stored) {
  FIX::Group group(tag, DelimOf(stored));
  static_cast<FIX::FieldMap&>(group) = stored;
  return group;
}

// `[[tag, value], ...]` for the map's own fields (not its groups' fields).
inline Napi::Array Fields(Napi::Env env, const FIX::FieldMap& map) {
  Napi::Array out = Napi::Array::New(env);
  uint32_t i = 0;
  for (const FIX::FieldBase& field : map) {
    Napi::Array pair = Napi::Array::New(env, 2);
    pair.Set(0u, Napi::Number::New(env, field.getTag()));
    pair.Set(1u, Napi::String::New(env, field.getString()));
    out.Set(i++, pair);
  }
  return out;
}

// --- field ops (tag-routed) -------------------------------------------------

template <class Select>
Napi::Value GetField(const Napi::CallbackInfo& info, Select select) {
  Napi::Env env = info.Env();
  int tag = CoerceTag(env, info[0]);
  NQ_TRY(env) {
    return Napi::String::New(env, select(tag).getField(tag));
  } NQ_CATCH(env)
}

template <class Select>
Napi::Value SetField(const Napi::CallbackInfo& info, Select select) {
  Napi::Env env = info.Env();
  int tag = CoerceTag(env, info[0]);
  std::string value = CoerceValue(env, info[1]);
  NQ_TRY(env) {
    select(tag).setField(tag, value);
  } NQ_CATCH(env)
  return env.Undefined();
}

template <class Select>
Napi::Value IsSetField(const Napi::CallbackInfo& info, Select select) {
  Napi::Env env = info.Env();
  int tag = CoerceTag(env, info[0]);
  NQ_TRY(env) {
    return Napi::Boolean::New(env, select(tag).isSetField(tag));
  } NQ_CATCH(env)
}

template <class Select>
Napi::Value RemoveField(const Napi::CallbackInfo& info, Select select) {
  Napi::Env env = info.Env();
  int tag = CoerceTag(env, info[0]);
  NQ_TRY(env) {
    select(tag).removeField(tag);
  } NQ_CATCH(env)
  return env.Undefined();
}

// string | undefined
template <class Select>
Napi::Value GetFieldIfSet(const Napi::CallbackInfo& info, Select select) {
  Napi::Env env = info.Env();
  int tag = CoerceTag(env, info[0]);
  NQ_TRY(env) {
    const FIX::FieldMap& map = select(tag);
    if (!map.isSetField(tag)) {
      return env.Undefined();
    }
    return Napi::String::New(env, map.getField(tag));
  } NQ_CATCH(env)
}

// --- repeating-group ops (tag-routed) ---------------------------------------

// addGroup(group: Group): appends a COPY of `group` under its own count tag and
// bumps the count field.
template <class Select>
Napi::Value AddGroup(const Napi::CallbackInfo& info, Select select) {
  Napi::Env env = info.Env();
  GroupWrap* group = GroupWrap::UnwrapArg(env, info[0], "group");
  NQ_TRY(env) {
    int tag = group->Group().field();
    select(tag).addGroup(tag, group->Group());
  } NQ_CATCH(env)
  return env.Undefined();
}

// getGroup(index, tag): Group — a snapshot copy of the index-th entry
// (1-based). Throws FieldNotFound when the tag has no groups or the index is
// out of range.
template <class Select>
Napi::Value GetGroup(const Napi::CallbackInfo& info, Select select) {
  Napi::Env env = info.Env();
  int index = CoerceIndex(env, info[0]);
  int tag = CoerceTag(env, info[1]);
  NQ_TRY(env) {
    const FIX::FieldMap& stored = select(tag).getGroupRef(index, tag);
    return GroupWrap::NewInstance(env, Snapshot(tag, stored));
  } NQ_CATCH(env)
}

// replaceGroup(index, group): overwrites the index-th entry (1-based) under
// group.field(). QuickFIX silently ignores a missing slot; we throw
// FieldNotFound instead so a typo cannot silently drop an update.
template <class Select>
Napi::Value ReplaceGroup(const Napi::CallbackInfo& info, Select select) {
  Napi::Env env = info.Env();
  int index = CoerceIndex(env, info[0]);
  GroupWrap* group = GroupWrap::UnwrapArg(env, info[1], "group");
  NQ_TRY(env) {
    int tag = group->Group().field();
    FIX::FieldMap& map = select(tag);
    if (!map.hasGroup(index, tag)) {
      throw FIX::FieldNotFound(tag);
    }
    map.replaceGroup(index, tag, group->Group());
  } NQ_CATCH(env)
  return env.Undefined();
}

// removeGroup(tag) | removeGroup(index, tag). No-op when absent (as QuickFIX).
template <class Select>
Napi::Value RemoveGroup(const Napi::CallbackInfo& info, Select select) {
  Napi::Env env = info.Env();
  NQ_TRY(env) {
    if (info.Length() < 2 || IsNullish(info[1])) {
      int tag = CoerceTag(env, info[0]);
      select(tag).removeGroup(tag);
    } else {
      int index = CoerceIndex(env, info[0]);
      int tag = CoerceTag(env, info[1]);
      select(tag).removeGroup(index, tag);
    }
  } NQ_CATCH(env)
  return env.Undefined();
}

// hasGroup(tag) | hasGroup(index, tag)
template <class Select>
Napi::Value HasGroup(const Napi::CallbackInfo& info, Select select) {
  Napi::Env env = info.Env();
  NQ_TRY(env) {
    if (info.Length() < 2 || IsNullish(info[1])) {
      int tag = CoerceTag(env, info[0]);
      return Napi::Boolean::New(env, select(tag).hasGroup(tag));
    }
    int index = CoerceIndex(env, info[0]);
    int tag = CoerceTag(env, info[1]);
    return Napi::Boolean::New(env, select(tag).hasGroup(index, tag));
  } NQ_CATCH(env)
}

template <class Select>
Napi::Value GroupCount(const Napi::CallbackInfo& info, Select select) {
  Napi::Env env = info.Env();
  int tag = CoerceTag(env, info[0]);
  NQ_TRY(env) {
    return Napi::Number::New(
        env, static_cast<double>(select(tag).groupCount(tag)));
  } NQ_CATCH(env)
}

// --- whole-map ops ----------------------------------------------------------

inline Napi::Value IsEmpty(Napi::Env env, FIX::FieldMap& map) {
  NQ_TRY(env) {
    return Napi::Boolean::New(env, map.isEmpty());
  } NQ_CATCH(env)
}

// Own fields plus every field of every (nested) group entry.
inline Napi::Value TotalFields(Napi::Env env, const FIX::FieldMap& map) {
  NQ_TRY(env) {
    return Napi::Number::New(env, static_cast<double>(map.totalFields()));
  } NQ_CATCH(env)
}

inline Napi::Value Clear(Napi::Env env, FIX::FieldMap& map) {
  NQ_TRY(env) {
    map.clear();
  } NQ_CATCH(env)
  return env.Undefined();
}

}  // namespace fieldmap
}  // namespace napi_quickfix

#endif  // NAPI_QUICKFIX_FIELD_MAP_OPS_H
