// Generate `src/generated/fields.ts` — the typed FIELD (field-name -> tag-number)
// table — from QuickFIX's own `FixFieldNumbers.h`.
//
// The upstream header is the single source of truth for field names, so the
// binding exposes exactly the same names as `FIX::FIELD::*` in C++. The output is
// checked in so consumers (and `tsc`) never need the QuickFIX sources; re-run this
// script whenever the QuickFIX pin in CMakeLists.txt moves.
//
// Source resolution, in order:
//   1. `--from <path>`                      an explicit FixFieldNumbers.h
//   2. build/_deps/quickfix-src/src/C++/    the sources CMake FetchContent fetched,
//                                           only if that checkout is at the pinned tag
//   3. raw.githubusercontent.com            at the GIT_TAG pinned in CMakeLists.txt
//
// (2) is guarded because a stale build tree from an older pin would otherwise be
// stamped with the new tag and pass `--check`.
//
// Usage:
//   node scripts/gen-fields.mjs            write src/generated/fields.ts
//   node scripts/gen-fields.mjs --check    exit 1 if the checked-in file is stale
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'generated', 'fields.ts');
const FETCHED = join(ROOT, 'build', '_deps', 'quickfix-src', 'src', 'C++', 'FixFieldNumbers.h');

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
  const url = `https://raw.githubusercontent.com/quickfix/quickfix/${tag}/src/C++/FixFieldNumbers.h`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status} ${res.statusText}`);
  return { text: await res.text(), origin: url, tag };
}

// Parse `const int Name = 123;` lines inside `namespace FIELD { ... }`. The block
// ends at the first closing brace after the declarations: QuickFIX has shipped
// both `} // namespace FIELD` (>= 1.16) and a bare, indented `}` (<= 1.15).
function parseFields(text) {
  const start = text.indexOf('namespace FIELD');
  if (start < 0) throw new Error('namespace FIELD block not found in header');

  const fields = [];
  const seen = new Set();
  for (const line of text.slice(start).split('\n')) {
    const t = line.trim();
    if (t.startsWith('}') && fields.length > 0) break;
    if (!t.startsWith('const int ')) continue;
    const m = /^const int ([A-Za-z_][A-Za-z0-9_]*) = (\d+);$/.exec(t);
    if (!m) throw new Error(`unrecognised field declaration: ${t}`);
    const name = m[1];
    if (seen.has(name)) throw new Error(`duplicate field name: ${name}`);
    seen.add(name);
    fields.push({ name, tag: Number(m[2]) });
  }
  if (fields.length === 0) throw new Error('no fields parsed');

  // Sort by tag, then name, so regenerating gives a stable, reviewable diff.
  // Several tags carry more than one name (aliases across FIX versions); all are kept.
  fields.sort((a, b) => a.tag - b.tag || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return fields;
}

function render(fields, tag) {
  const lines = [
    '// GENERATED FILE — DO NOT EDIT.',
    `// Source: QuickFIX ${tag} src/C++/FixFieldNumbers.h (namespace FIX::FIELD).`,
    '// Regenerate with `yarn gen:fields` after moving the QuickFIX pin in CMakeLists.txt.',
    '',
    '/**',
    ' * Field-name → tag-number map, e.g. `FIELD.MsgType === 35`.',
    ' *',
    ' * Mirrors `FIX::FIELD::*` from the bundled QuickFIX exactly. Values are literal',
    ' * types, so `FIELD.Password` is typed as `554` and a misspelt name is a compile',
    ' * error. Entries can be passed straight to tag-taking APIs such as',
    ' * `Message.setField(tag, value)`.',
    ' *',
    ' * Also available as `@homaiohq/napi-quickfix/fields`, which does not load the',
    ' * native addon.',
    ' */',
    '// @__PURE__ lets bundlers drop the whole table when nothing imports from it.',
    'export const FIELD = /* @__PURE__ */ Object.freeze({',
  ];
  for (const { name, tag: n } of fields) {
    lines.push(`  ${name}: ${n},`);
  }
  lines.push('} as const);');
  lines.push('');
  lines.push('/** Every field name known to the bundled QuickFIX, e.g. `"MsgType"`. */');
  lines.push('export type FieldName = keyof typeof FIELD;');
  lines.push('');
  return lines.join('\n');
}

const { text, origin, tag } = await loadHeader();
const fields = parseFields(text);
const output = render(fields, tag);

if (check) {
  // Compare with line endings normalised: a Windows checkout with core.autocrlf
  // hands us CRLF while the generator renders LF.
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
  if (current !== output) {
    console.error(`${OUT} is stale (source: ${origin}); run \`yarn gen:fields\``);
    process.exit(1);
  }
  console.log(`${OUT} is up to date (${fields.length} fields, QuickFIX ${tag})`);
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, output);
  console.log(`wrote ${OUT}: ${fields.length} fields from ${origin} (QuickFIX ${tag})`);
}
