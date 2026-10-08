// Generate `src/generated/fields.ts` — the typed FIELD (field-name -> tag-number)
// table — from QuickFIX's own `FixFieldNumbers.h`.
//
// The upstream header is the single source of truth for field names, so the
// binding exposes exactly the same names as `FIX::FIELD::*` in C++. The output is
// checked in so consumers (and `tsc`) never need the QuickFIX sources; re-run this
// script whenever the QuickFIX pin in CMakeLists.txt moves.
//
// Where the header comes from (`--from`, the FetchContent checkout at the pinned
// tag, or GitHub) is shared with gen-values.mjs in scripts/lib/quickfix-header.mjs.
//
// Usage:
//   node scripts/gen-fields.mjs            write src/generated/fields.ts
//   node scripts/gen-fields.mjs --check    exit 1 if the checked-in file is stale
import { join } from 'node:path';

import { ROOT, emit, loadHeader, parseArgs } from './lib/quickfix-header.mjs';

const OUT = join(ROOT, 'src', 'generated', 'fields.ts');
const { check, fromPath } = parseArgs();

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

const { text, origin, tag } = await loadHeader('FixFieldNumbers.h', { fromPath });
const fields = parseFields(text);
emit({
  out: OUT,
  output: render(fields, tag),
  check,
  summary: `${fields.length} fields`,
  script: 'gen:fields',
  origin,
  tag,
});
