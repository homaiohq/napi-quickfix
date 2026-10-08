// Shared plumbing for the `scripts/gen-*.mjs` generators: locate a QuickFIX header
// at the pinned tag and write (or `--check`) a generated TypeScript file.
//
// Source resolution, in order:
//   1. `--from <path>`                      an explicit copy of the header
//   2. build/_deps/quickfix-src/src/C++/    the sources CMake FetchContent fetched,
//                                           only if that checkout is at the pinned tag
//   3. raw.githubusercontent.com            at the GIT_TAG pinned in CMakeLists.txt
//
// (2) is guarded because a stale build tree from an older pin would otherwise be
// stamped with the new tag and pass `--check`.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FETCHED_DIR = join(ROOT, 'build', '_deps', 'quickfix-src');

// `{ check, fromPath }` from a generator's argv.
export function parseArgs(argv = process.argv.slice(2)) {
  const fromIdx = argv.indexOf('--from');
  return {
    check: argv.includes('--check'),
    fromPath: fromIdx >= 0 ? argv[fromIdx + 1] : undefined,
  };
}

export function pinnedTag() {
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

// Load `src/C++/<headerName>` of the pinned QuickFIX: `{ text, origin, tag }`.
export async function loadHeader(headerName, { fromPath } = {}) {
  const tag = pinnedTag();
  if (fromPath) {
    return { text: readFileSync(resolve(fromPath), 'utf8'), origin: fromPath, tag };
  }
  const fetched = join(FETCHED_DIR, 'src', 'C++', headerName);
  if (existsSync(fetched)) {
    const fetchedTag = checkoutTag(FETCHED_DIR);
    if (fetchedTag === tag) {
      return { text: readFileSync(fetched, 'utf8'), origin: 'build/_deps/quickfix-src', tag };
    }
    console.warn(
      `build/_deps/quickfix-src is at ${fetchedTag ?? 'an unknown tag'}, not the pinned ${tag}; ` +
        'fetching the header from GitHub instead (run `yarn clean && yarn build` to refresh)',
    );
  }
  const url = `https://raw.githubusercontent.com/quickfix/quickfix/${tag}/src/C++/${headerName}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status} ${res.statusText}`);
  return { text: await res.text(), origin: url, tag };
}

// Write `output` to `out`, or with `check` exit 1 if `out` does not already hold it.
// `summary` describes the content (e.g. "6107 fields"); `script` is the yarn script
// that regenerates it (e.g. "gen:fields").
export function emit({ out, output, check, summary, script, origin, tag }) {
  if (check) {
    // Compare with line endings normalised: a Windows checkout with core.autocrlf
    // hands us CRLF while the generator renders LF.
    const current = existsSync(out) ? readFileSync(out, 'utf8').replace(/\r\n/g, '\n') : '';
    if (current !== output) {
      console.error(`${out} is stale (source: ${origin}); run \`yarn ${script}\``);
      process.exit(1);
    }
    console.log(`${out} is up to date (${summary}, QuickFIX ${tag})`);
  } else {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, output);
    console.log(`wrote ${out}: ${summary} from ${origin} (QuickFIX ${tag})`);
  }
}
