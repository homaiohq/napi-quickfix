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
//   2. A group whose names are already mixed-case upstream — more than half of its
//      suffixes contain a lowercase letter; in v1.16.0 that is only `MsgType`, whose
//      constants mirror message names — keeps every suffix verbatim:
//      `MsgType_NewOrderSingle` → `NewOrderSingle`, `MsgType_IOI` → `IOI`,
//      `MsgType_XMLnonFIX` → `XMLnonFIX`.
//   3. Every other group is SCREAMING_SNAKE upstream and is converted to PascalCase:
//      split on `_`, lower-case each word, upper-case its first character, join.
//      `Side_SELL_SHORT` → `SellShort`, `OrdType_LIMIT` → `Limit`,
//      `EncryptMethod_NONE_OTHER` → `NoneOther`, `YieldType_..._OF32NDS` → `...Of32nds`.
//      Leading, trailing and repeated underscores are ignored.
//   4. A key that would start with a digit is prefixed with an underscore so it
//      stays a valid identifier (`_30Days`). C identifiers cannot carry any other
//      special character, so no further escaping exists; anything that still fails
//      `[A-Za-z_][A-Za-z0-9_]*`, or two upstream names that normalise to the same
//      key within a group, aborts the generator rather than silently picking one.
//
// Values are always strings — FIX is string-on-the-wire — whatever the C++
// declaration form: `const char X[] = "ABC"` → `'ABC'`, `const char X = '1'` →
// `'1'`, `const int X = 2` → `'2'`.
//
// Source resolution, in order:
//   1. `--from <path>`                      an explicit FixValues.h
//   2. build/_deps/quickfix-src/src/C++/    the sources CMake FetchContent fetched,
//                                           only if that checkout is at the pinned tag
//   3. raw.githubusercontent.com            at the GIT_TAG pinned in CMakeLists.txt
//
// (2) is guarded because a stale build tree from an older pin would otherwise be
// stamped with the new tag and pass `--check`.
//
// Usage:
//   node scripts/gen-values.mjs            write src/generated/values.ts
//   node scripts/gen-values.mjs --check    exit 1 if the checked-in file is stale
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'generated', 'values.ts');
const FETCHED = join(ROOT, 'build', '_deps', 'quickfix-src', 'src', 'C++', 'FixValues.h');

const args = process.argv.slice(2);
const check = args.includes('--check');
const fromIdx = args.indexOf('--from');
const fromPath = fromIdx >= 0 ? args[fromIdx + 1] : undefined;

function pinnedTag() {
  const cmake = readFileSync(join(ROOT, 'CMakeLists.txt'), 'utf8');
  const m = /^\s*GIT_TAG\s+(\S+)/m.exec(cmake);
  if (!m) throw new Error('could not find GIT_TAG in CMakeLists.txt');
  return m[1];
}

// Tag of the FetchContent checkout, or undefined if it cannot be determined.
function checkoutTag(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'describe', '--tags', '--exact-match'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

async function loadHeader() {
  const tag = pinnedTag();
  if (fromPath) {
    return { text: readFileSync(resolve(fromPath), 'utf8'), origin: fromPath, tag };
  }
  if (existsSync(FETCHED)) {
    const fetchedTag = checkoutTag(dirname(dirname(dirname(FETCHED))));
    if (fetchedTag === tag) {
      return { text: readFileSync(FETCHED, 'utf8'), origin: 'build/_deps/quickfix-src', tag };
    }
    console.warn(
      `build/_deps/quickfix-src is at ${fetchedTag ?? 'an unknown tag'}, not the pinned ${tag}; ` +
        'fetching the header from GitHub instead (run `yarn clean && yarn build` to refresh)',
    );
  }
  const url = `https://raw.githubusercontent.com/quickfix/quickfix/${tag}/src/C++/FixValues.h`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status} ${res.statusText}`);
  return { text: await res.text(), origin: url, tag };
}

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
    const group = name.slice(0, underscore);
    const suffix = name.slice(underscore + 1);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ suffix, value });
  }

  const out = [];
  for (const [group, items] of groups) {
    const mixedCase = items.filter(({ suffix }) => /[a-z]/.test(suffix)).length;
    const verbatim = mixedCase * 2 > items.length;
    const members = [];
    const keys = new Map();
    for (const { suffix, value } of items) {
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

const { text, origin, tag } = await loadHeader();
const groups = groupValues(parseDeclarations(text));
const output = render(groups, tag);
const count = groups.reduce((n, { members }) => n + members.length, 0);
const summary = `${count} values in ${groups.length} groups`;

if (check) {
  // Compare with line endings normalised: a Windows checkout with core.autocrlf
  // hands us CRLF while the generator renders LF.
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
  if (current !== output) {
    console.error(`${OUT} is stale (source: ${origin}); run \`yarn gen:values\``);
    process.exit(1);
  }
  console.log(`${OUT} is up to date (${summary}, QuickFIX ${tag})`);
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, output);
  console.log(`wrote ${OUT}: ${summary} from ${origin} (QuickFIX ${tag})`);
}
