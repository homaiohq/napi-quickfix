// Generate `src/generated/values.ts` — one frozen, literally-typed object of FIX
// value constants per field (`MsgType`, `Side`, `OrdType`, `ExecType`, ...) plus
// the `VALUES` tree — from QuickFIX's own `FixValues.h`.
//
// The upstream header is the single source of truth, so the binding exposes every
// value QuickFIX itself knows instead of a hand-curated subset. The output is
// checked in so consumers (and `tsc`) never need the QuickFIX sources; re-run this
// script whenever the QuickFIX pin in CMakeLists.txt moves.
//
// Naming rule (upstream `Group_SUFFIX` → `Group.Key`):
//   1. The group is everything before the first underscore and is always a FIX
//      field name (`Side_BUY` → group `Side`). Groups are emitted in alphabetical
//      order; members keep their upstream (spec) order.
//   2. The groups listed in VERBATIM_GROUPS — only `MsgType`, whose constants mirror
//      message names and are already mixed-case upstream — keep every suffix
//      verbatim: `MsgType_NewOrderSingle` → `NewOrderSingle`, `MsgType_IOI` → `IOI`,
//      `MsgType_XMLnonFIX` → `XMLnonFIX`.
//   3. Every other group is SCREAMING_SNAKE upstream and is converted to PascalCase:
//      split on `_`, lower-case each word, upper-case its first character, join.
//      `Side_SELL_SHORT` → `SellShort`, `OrdType_LIMIT` → `Limit`,
//      `EncryptMethod_NONE_OTHER` → `NoneOther`, `YieldType_..._OF32NDS` → `...Of32nds`.
//      Leading, trailing and repeated underscores are ignored. A lowercase letter in
//      such a suffix aborts the generator unless the name is listed in
//      PASCAL_CASE_EXCEPTIONS, so a new mixed-case upstream name is handled
//      deliberately (verbatim group, exception, or new rule) instead of being
//      silently renamed by a heuristic.
//   4. A key that would start with a digit is prefixed with an underscore so it
//      stays a valid identifier (`_30Days`). C identifiers cannot carry any other
//      special character, so no further escaping exists; anything that still fails
//      `[A-Za-z_][A-Za-z0-9_]*`, or two upstream names that normalise to the same
//      key within a group, aborts the generator rather than silently picking one.
//   5. Each group becomes a top-level `export const <Group>`, so a group named like
//      something the generated module itself refers to (`Object`, `VALUES`,
//      `ValueGroups`, `ValueGroupName`, see RESERVED_GROUPS) aborts the generator:
//      `export const Object = Object.freeze(...)` would compile and then throw at
//      import time. `FIELD` is reserved for the same reason one level up:
//      src/enums.ts spreads every group next to the tag table (`{ ...VALUES, FIELD }`),
//      so a `FIELD` group would be silently shadowed there.
//
// Values are always strings — FIX is string-on-the-wire — whatever the C++
// declaration form: `const char X[] = "ABC"` → `'ABC'`, `const char X = '1'` →
// `'1'`, `const int X = 2` → `'2'`.
//
// Where the header comes from (`--from`, the FetchContent checkout at the pinned
// tag, or GitHub) is shared with gen-fields.mjs in scripts/lib/quickfix-header.mjs.
//
// Usage:
//   node scripts/gen-values.mjs            write src/generated/values.ts
//   node scripts/gen-values.mjs --check    exit 1 if the checked-in file is stale
import { join } from 'node:path';

import { ROOT, emit, loadHeader, parseArgs } from './lib/quickfix-header.mjs';

const OUT = join(ROOT, 'src', 'generated', 'values.ts');
const { check, fromPath } = parseArgs();

// Undo the C escapes that can appear in a char / string literal of the header.
function unescapeC(literal) {
  return literal.replace(/\\(.)/g, (whole, c) => {
    if (c === '\\' || c === '"' || c === "'") return c;
    throw new Error(`unsupported escape ${whole} in FixValues.h literal`);
  });
}

// Parse every `const char X[] = "..."`, `const char X = '.'` and `const int X = n;`
// declaration in the header. The header is a flat list inside `namespace FIX`.
function parseDeclarations(text) {
  const decls = [];
  const seen = new Set();
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('const ')) continue;
    let m;
    let name;
    let value;
    if ((m = /^const char ([A-Za-z_][A-Za-z0-9_]*)\[\] = "((?:\\.|[^"\\])*)";$/.exec(t))) {
      name = m[1];
      value = unescapeC(m[2]);
    } else if ((m = /^const char ([A-Za-z_][A-Za-z0-9_]*) = '((?:\\.|[^'\\]))';$/.exec(t))) {
      name = m[1];
      value = unescapeC(m[2]);
    } else if ((m = /^const int ([A-Za-z_][A-Za-z0-9_]*) = (-?\d+);$/.exec(t))) {
      name = m[1];
      value = m[2];
    } else {
      throw new Error(`unrecognised value declaration: ${t}`);
    }
    if (seen.has(name)) throw new Error(`duplicate value name: ${name}`);
    seen.add(name);
    decls.push({ name, value });
  }
  if (decls.length === 0) throw new Error('no values parsed');
  return decls;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Group names the generated module cannot export without shadowing an identifier
// it uses itself, plus `FIELD`, which src/enums.ts merges the groups with (rule 5).
// Keep in sync with render() and with `enums` in src/enums.ts.
const RESERVED_GROUPS = new Set(['Object', 'VALUES', 'ValueGroups', 'ValueGroupName', 'FIELD']);

// Groups whose upstream suffixes are already mixed-case and are kept verbatim (rule 2).
// Listing them explicitly, rather than voting on the data, keeps the output stable:
// a future header cannot flip a whole group's keys without a change here.
const VERBATIM_GROUPS = new Set(['MsgType']);

// Upstream names outside VERBATIM_GROUPS that contain a lowercase letter and are still
// PascalCased like their SCREAMING_SNAKE siblings (rule 3). `FIX4n` reads as "FIX 4.n".
const PASCAL_CASE_EXCEPTIONS = new Set(['YieldType_FIX4n_YIELD_VALUE_OF32NDS']);

function pascalCase(suffix) {
  return suffix
    .split('_')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

function toKey(group, suffix, verbatim) {
  let key = verbatim ? suffix : pascalCase(suffix);
  if (/^\d/.test(key)) key = `_${key}`;
  if (!IDENTIFIER.test(key)) {
    throw new Error(`cannot derive an identifier for ${group}_${suffix} (got "${key}")`);
  }
  return key;
}

// Group `Group_SUFFIX` declarations by field name and normalise the suffixes.
function groupValues(decls) {
  const groups = new Map();
  for (const { name, value } of decls) {
    const underscore = name.indexOf('_');
    if (underscore <= 0 || underscore === name.length - 1) {
      throw new Error(`value name is not of the form Group_SUFFIX: ${name}`);
    }
    // `group` is a non-empty prefix of a name the parser already matched against
    // IDENTIFIER, so it is always a valid identifier itself.
    const group = name.slice(0, underscore);
    const suffix = name.slice(underscore + 1);
    if (RESERVED_GROUPS.has(group)) {
      throw new Error(`cannot export a value group named ${group} (from ${name})`);
    }
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ suffix, value });
  }

  for (const group of VERBATIM_GROUPS) {
    if (!groups.has(group)) throw new Error(`verbatim group ${group} is missing upstream`);
  }

  const out = [];
  for (const [group, items] of groups) {
    const verbatim = VERBATIM_GROUPS.has(group);
    const members = [];
    const keys = new Map();
    for (const { suffix, value } of items) {
      const mixedCase = /[a-z]/.test(suffix);
      if (!verbatim && mixedCase && !PASCAL_CASE_EXCEPTIONS.has(`${group}_${suffix}`)) {
        throw new Error(
          `${group}_${suffix} is not SCREAMING_SNAKE; add ${group} to VERBATIM_GROUPS, ` +
            'list the name in PASCAL_CASE_EXCEPTIONS, or extend the naming rule',
        );
      }
      const key = toKey(group, suffix, verbatim);
      if (keys.has(key)) {
        throw new Error(
          `${group}_${keys.get(key)} and ${group}_${suffix} both normalise to ${group}.${key}`,
        );
      }
      keys.set(key, suffix);
      members.push({ key, value });
    }
    out.push({ group, members });
  }

  // Alphabetical groups keep a regenerated diff local to the groups that changed;
  // members stay in upstream order, which follows the FIX spec's enumeration.
  out.sort((a, b) => (a.group < b.group ? -1 : a.group > b.group ? 1 : 0));
  return out;
}

function quote(value) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function render(groups, tag) {
  const lines = [
    '// GENERATED FILE — DO NOT EDIT.',
    `// Source: QuickFIX ${tag} src/C++/FixValues.h (namespace FIX).`,
    '// Regenerate with `yarn gen:values` after moving the QuickFIX pin in CMakeLists.txt.',
    '//',
    '// FIX value constants: one frozen object per field, e.g. `Side.Buy === \'1\'`,',
    '// `MsgType.Logon === \'A\'`, `OrdStatus.New === \'0\'`. Values are literal types, so',
    '// `Side.Buy` is typed as `\'1\'` and a misspelt name is a compile error. Every',
    '// value is a string (FIX is string-on-the-wire), whatever its C++ declaration.',
    '//',
    '// Names derive from `FIX::<Field>_<VALUE>`: SCREAMING_SNAKE suffixes become',
    '// PascalCase (`Side_SELL_SHORT` → `Side.SellShort`), already mixed-case ones',
    '// (`MsgType_NewOrderSingle`, `MsgType_IOI`) are kept verbatim, and a key that',
    '// would start with a digit gets a leading underscore. The full rule lives in',
    '// scripts/gen-values.mjs.',
    '//',
    '// Also available as `@homaiohq/napi-quickfix/values`, which does not load the',
    '// native addon. @__PURE__ lets bundlers drop any group nothing imports.',
    '',
  ];
  for (const { group, members } of groups) {
    lines.push(`/** \`${group}\` values (\`FIX::${group}_*\`). */`);
    lines.push(`export const ${group} = /* @__PURE__ */ Object.freeze({`);
    for (const { key, value } of members) {
      lines.push(`  ${key}: ${quote(value)},`);
    }
    lines.push('} as const);');
    lines.push('');
  }

  lines.push('/** The shape of {@link VALUES}: every value group keyed by field name. */');
  lines.push('export interface ValueGroups {');
  for (const { group } of groups) {
    lines.push(`  readonly ${group}: typeof ${group};`);
  }
  lines.push('}');
  lines.push('');
  lines.push('/** Every value group keyed by field name, e.g. `VALUES.Side.Buy === \'1\'`. */');
  lines.push('export const VALUES: ValueGroups = /* @__PURE__ */ Object.freeze({');
  for (const { group } of groups) {
    lines.push(`  ${group},`);
  }
  lines.push('});');
  lines.push('');
  lines.push('/** Every field that has a value group, e.g. `"Side"`. */');
  lines.push('export type ValueGroupName = keyof ValueGroups;');
  lines.push('');
  return lines.join('\n');
}

const { text, origin, tag } = await loadHeader('FixValues.h', { fromPath });
const groups = groupValues(parseDeclarations(text));
const count = groups.reduce((n, { members }) => n + members.length, 0);
emit({
  out: OUT,
  output: render(groups, tag),
  check,
  summary: `${count} values in ${groups.length} groups`,
  script: 'gen:values',
  origin,
  tag,
});
