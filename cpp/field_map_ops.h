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
#include <limits>
#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "errors.h"
#include "group_wrap.h"
#include "quickfix/FieldMap.h"
#include "quickfix/Group.h"
#include "quickfix/Message.h"

namespace napi_quickfix {
namespace fieldmap {

// --- argument coercion ------------------------------------------------------

inline bool IsNullish(Napi::Value v) { return v.IsUndefined() || v.IsNull(); }

// A JS number that is an integer within int range (no NaN, no fraction), as
// an int. Int32Value() would silently truncate 1.5 to 1 and NaN to 0.
inline bool ToInteger(Napi::Value v, int& out) {
  if (!v.IsNumber()) {
    return false;
  }
  const double d = v.As<Napi::Number>().DoubleValue();
  if (!(d >= std::numeric_limits<int>::min() &&
        d <= std::numeric_limits<int>::max())) {
    return false;  // NaN, infinities and out-of-range values all land here
  }
  const int i = static_cast<int>(d);
  if (static_cast<double>(i) != d) {
    return false;
  }
  out = i;
  return true;
}

// A field tag for reads (getField, isSetField, ...): any integer. A tag that
// no message can hold (0, negative) simply reads as absent / FieldNotFound.
inline int CoerceTag(Napi::Env env, Napi::Value v) {
  int tag;
  if (!ToInteger(v, tag)) {
    throw Napi::TypeError::New(env, "field tag must be an integer");
  }
  return tag;
}

// A field tag for writes (setField): a positive integer, since QuickFIX would
// happily emit "0=x" or "-1=x" on the wire.
inline int CoerceSetTag(Napi::Env env, Napi::Value v) {
  int tag;
  if (!ToInteger(v, tag) || tag <= 0) {
    throw Napi::TypeError::New(env, "field tag must be a positive integer");
  }
  return tag;
}

// The largest tag accepted in a group's field order (delimiter included).
// QuickFIX's message_order allocates and zero-fills `largestTag + 1` ints per
// group, so an unbounded tag would mean a multi-GB allocation (or a signed
// overflow at INT_MAX) inside the Group constructor, where a std::bad_alloc
// is not translated and aborts the process. 2^20 keeps that at 4 MiB while
// leaving every standard and user-defined tag range (< 100000) usable.
constexpr int kMaxOrderTag = 1 << 20;

// A delimiter or group-order tag: a positive integer bounded by kMaxOrderTag.
inline int CheckOrderTag(Napi::Env env, int tag) {
  if (tag > kMaxOrderTag) {
    throw Napi::RangeError::New(
        env, "group order field tags must be at most " +
                 std::to_string(kMaxOrderTag));
  }
  return tag;
}

// Group index (1-based): an integer. Range errors are handled per operation
// (FieldNotFound, false, or a no-op) since QuickFIX does not bound index 0.
inline int CoerceIndex(Napi::Env env, Napi::Value v) {
  int index;
  if (!ToInteger(v, index)) {
    throw Napi::TypeError::New(env, "group index must be an integer");
  }
  return index;
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

// --- typed copies -----------------------------------------------------------

// The delimiter of a stored group entry. Entries are stored as FIX::Group
// (the ones QuickFIX parses with a dictionary, the ones AddGroup stores and
// the ones Clone rebuilds), so the dynamic type normally carries it. The
// fallback covers a plain-FieldMap entry QuickFIX itself stored (e.g. with
// FieldMap::addGroup): its first field, which is the delimiter by definition
// since every group order sorts it first.
inline int DelimOf(const FIX::FieldMap& stored) {
  if (const auto* g = dynamic_cast<const FIX::Group*>(&stored)) {
    return g->delim();
  }
  if (stored.begin() != stored.end()) {
    return stored.begin()->getTag();
  }
  return 0;
}

// FieldMap::operator= (hence every copy of a FIX::Message or FIX::Group,
// FIX::Group's copy constructor included) stores each nested entry as
// `new FieldMap(*entry)`: the fields and field order survive, but the entry's
// FIX::Group type, and with it its delimiter, is sliced away. Clone copies
// like operator= and then rebuilds every nested entry as a FIX::Group, so the
// delimiter of an entry that is empty or lacks its delimiter field is not lost
// on the way from the engine (or a JS Group) to a snapshot.

// Rebuild the nested entries of `dst`, a FieldMap::operator= copy of `src`, as
// FIX::Group. Walks the two group maps in lockstep (operator= preserves tags,
// counts and order) and swaps each sliced entry for a typed one that takes
// over its contents, so nothing is copied twice. The count tag is the map
// key: a QuickFIX-parsed entry's Group::field() is its first wire tag. The
// slot keeps its (hollowed) entry until the typed one is complete, so `dst`
// stays consistent should an allocation throw.
inline void RebuildGroups(FIX::FieldMap& dst, const FIX::FieldMap& src) {
  FIX::FieldMap::g_iterator copied = dst.g_begin();
  for (const auto& tagWithEntries : src.groups()) {
    const int tag = tagWithEntries.first;
    std::vector<FIX::FieldMap*>& slots = copied->second;
    for (size_t i = 0; i < tagWithEntries.second.size(); i++) {
      const FIX::FieldMap& original = *tagWithEntries.second[i];
      auto typed = std::make_unique<FIX::Group>(tag, DelimOf(original));
      static_cast<FIX::FieldMap&>(*typed) = std::move(*slots[i]);
      RebuildGroups(*typed, original);
      delete slots[i];
      slots[i] = typed.release();
    }
    ++copied;
  }
}

// Assign `src` to `dst` (fields, nested groups and field order), keeping every
// nested entry a FIX::Group. `dst`'s own dynamic type is untouched: a Group
// keeps its count tag and delimiter.
inline void Clone(FIX::FieldMap& dst, const FIX::FieldMap& src) {
  dst = src;
  RebuildGroups(dst, src);
}

// Header, body and trailer of `src` into `dst`, nested entries typed.
inline void CloneMessage(FIX::Message& dst, const FIX::Message& src) {
  dst = src;
  RebuildGroups(dst.getHeader(), src.getHeader());
  RebuildGroups(dst, src);
  RebuildGroups(dst.getTrailer(), src.getTrailer());
}

// The same, by value. FIX::Message has a move constructor (unlike FIX::Group),
// so the returned copy stays typed whether or not the return is elided.
inline FIX::Message CloneMessage(const FIX::Message& src) {
  FIX::Message copy;
  CloneMessage(copy, src);
  return copy;
}

// A heap FIX::Group copy of an entry of the `tag` repeating group, for
// FieldMap::addGroupPtr (which takes ownership).
inline FIX::Group* CloneEntry(int tag, const FIX::FieldMap& entry) {
  auto group = std::make_unique<FIX::Group>(tag, DelimOf(entry));
  Clone(*group, entry);
  return group.release();
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
  int tag = CoerceSetTag(env, info[0]);
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
// bumps the count field. The copy is typed down to the last nested entry (see
// Clone); the map takes ownership of the pointer.
template <class Select>
Napi::Value AddGroup(const Napi::CallbackInfo& info, Select select) {
  Napi::Env env = info.Env();
  GroupWrap* group = GroupWrap::UnwrapArg(env, info[0], "group");
  NQ_TRY(env) {
    int tag = group->Group().field();
    select(tag).addGroupPtr(tag, CloneEntry(tag, group->Group()), true);
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
    return GroupWrap::NewInstance(env, tag, DelimOf(stored), stored);
  } NQ_CATCH(env)
}

// Whether the index-th entry (1-based) exists. QuickFIX's hasGroup(num, tag)
// is `groupCount(tag) >= num` with no lower bound, so it answers true for
// index 0 even on an empty tag; 0 is the typo a 1-based API must catch.
inline bool HasGroupAt(const FIX::FieldMap& map, int index, int tag) {
  return index >= 1 && map.hasGroup(index, tag);
}

// replaceGroup(index, group): overwrites the index-th entry (1-based) under
// group.field() with a typed copy (FieldMap::replaceGroup would slice the
// nested entries). The stored entry keeps its own delimiter. QuickFIX silently
// ignores a missing slot (including index 0); we throw FieldNotFound instead
// so a typo cannot silently drop an update.
template <class Select>
Napi::Value ReplaceGroup(const Napi::CallbackInfo& info, Select select) {
  Napi::Env env = info.Env();
  int index = CoerceIndex(env, info[0]);
  GroupWrap* group = GroupWrap::UnwrapArg(env, info[1], "group");
  NQ_TRY(env) {
    int tag = group->Group().field();
    FIX::FieldMap& map = select(tag);
    if (!HasGroupAt(map, index, tag)) {
      throw FIX::FieldNotFound(tag);
    }
    Clone(map.getGroupRef(index, tag), group->Group());
  } NQ_CATCH(env)
  return env.Undefined();
}

// The `(tag)` / `(index, tag)` argument shapes of removeGroup and hasGroup.
// Coercion happens outside NQ_TRY so a TypeError stays a TypeError (NQ_CATCH
// would translate it into a plain Error).
struct IndexAndTag {
  bool hasIndex;
  int index;
  int tag;
};

inline IndexAndTag CoerceIndexAndTag(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || IsNullish(info[1])) {
    return {false, 0, CoerceTag(env, info[0])};
  }
  int index = CoerceIndex(env, info[0]);
  return {true, index, CoerceTag(env, info[1])};
}

// removeGroup(tag) | removeGroup(index, tag). No-op when absent (as QuickFIX).
template <class Select>
Napi::Value RemoveGroup(const Napi::CallbackInfo& info, Select select) {
  Napi::Env env = info.Env();
  const IndexAndTag args = CoerceIndexAndTag(info);
  NQ_TRY(env) {
    if (args.hasIndex) {
      select(args.tag).removeGroup(args.index, args.tag);
    } else {
      select(args.tag).removeGroup(args.tag);
    }
  } NQ_CATCH(env)
  return env.Undefined();
}

// hasGroup(tag) | hasGroup(index, tag)
template <class Select>
Napi::Value HasGroup(const Napi::CallbackInfo& info, Select select) {
  Napi::Env env = info.Env();
  const IndexAndTag args = CoerceIndexAndTag(info);
  NQ_TRY(env) {
    const FIX::FieldMap& map = select(args.tag);
    return Napi::Boolean::New(
        env, args.hasIndex ? HasGroupAt(map, args.index, args.tag)
                           : map.hasGroup(args.tag));
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
