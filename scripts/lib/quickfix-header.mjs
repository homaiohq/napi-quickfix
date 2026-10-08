// Shared plumbing for the `scripts/gen-*.mjs` generators: locate a QuickFIX header
// at the pinned tag and write (or `--check`) a generated TypeScript file.
//
// Source resolution, in order:
//   1. `--from <path>`                      an explicit copy of the header; its version
//                                           is checked against the pin when the path is
//                                           inside a QuickFIX git checkout, else assumed
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

// `{ check, fromPath }` from a generator's argv. Accepts `--check`, `--from <path>`
// and `--from=<path>`; anything else is an error rather than a silent no-op, so a
// misspelt `--chekc` cannot overwrite the file it was meant to verify.
export function parseArgs(argv = process.argv.slice(2)) {
  let check = false;
  let fromPath;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check') {
      check = true;
    } else if (arg === '--from' || arg.startsWith('--from=')) {
      fromPath = arg === '--from' ? argv[++i] : arg.slice('--from='.length);
      // A `--from` without its path (missing, empty — e.g. an unset shell variable — or
      // another flag) must not quietly fall through to the FetchContent checkout or
      // GitHub: the operator meant to pin the header to a local copy.
      if (!fromPath || fromPath.startsWith('--')) {
        throw new Error('--from requires a path argument');
      }
    } else {
      throw new Error(`unknown argument ${arg}; expected --check and/or --from <path>`);
    }
  }
  return { check, fromPath };
}

export function pinnedTag() {
  const cmake = readFileSync(join(ROOT, 'CMakeLists.txt'), 'utf8');
  const m = /^\s*GIT_TAG\s+(\S+)/m.exec(cmake);
  if (!m) throw new Error('could not find GIT_TAG in CMakeLists.txt');
  return m[1];
}

// Trimmed stdout of `git -C <dir> <args>`, or undefined if git fails (not a checkout,
// no exact tag, ...).
function gitOutput(dir, args) {
  try {
    return execFileSync('git', ['-C', dir, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

// Whether the checkout at `dir` has `tag` checked out, by comparing commits: unlike
// `describe --exact-match`, a HEAD past the tag (e.g. master) is a plain `false`
// rather than "no tag", and a commit carrying several tags cannot be misreported.
// Undefined when `dir` is not a checkout or does not know `tag`.
function checkoutIsAt(dir, tag) {
  const head = gitOutput(dir, ['rev-parse', '--verify', 'HEAD^{commit}']);
  const pinned = gitOutput(dir, ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`]);
  if (head === undefined || pinned === undefined) return undefined;
  return head === pinned;
}

// Human-readable position of a checkout for messages: nearest tag, or the commit.
function describeCheckout(dir) {
  return gitOutput(dir, ['describe', '--tags', '--always']) ?? 'an unknown commit';
}

// The generated banner is stamped with the pinned tag, so a `--from` header must hold
// that version. When the file sits inside a QuickFIX git checkout, require that
// checkout to be at the pinned tag and abort otherwise; a loose copy has nothing to
// compare against, so say so instead of letting the banner claim a version nobody
// verified.
function verifyFromTag(file, headerName, tag) {
  const top = gitOutput(dirname(file), ['rev-parse', '--show-toplevel']);
  const isQuickfix = top !== undefined && existsSync(join(top, 'src', 'C++', headerName));
  if (!isQuickfix) {
    console.warn(
      `--from: cannot tell which QuickFIX version ${file} belongs to; ` +
        `the generated file will claim the pinned ${tag}`,
    );
    return;
  }
  const atTag = checkoutIsAt(top, tag);
  if (atTag === undefined) {
    throw new Error(
      `--from: ${top} does not know the pinned tag ${tag}, so ${file} cannot be ` +
        `verified against it (run \`git -C ${top} fetch --tags\`)`,
    );
  }
  if (!atTag) {
    throw new Error(
      `--from: ${file} is from QuickFIX ${describeCheckout(top)} but CMakeLists.txt ` +
        `pins ${tag}; check out ${tag} there, or move GIT_TAG first so the generated ` +
        'file is stamped with the version it holds',
    );
  }
}

// Load `src/C++/<headerName>` of the pinned QuickFIX: `{ text, origin, tag }`.
export async function loadHeader(headerName, { fromPath } = {}) {
  const tag = pinnedTag();
  if (fromPath) {
    const file = resolve(fromPath);
    verifyFromTag(file, headerName, tag);
    return { text: readFileSync(file, 'utf8'), origin: fromPath, tag };
  }
  const fetched = join(FETCHED_DIR, 'src', 'C++', headerName);
  if (existsSync(fetched)) {
    if (checkoutIsAt(FETCHED_DIR, tag) === true) {
      return { text: readFileSync(fetched, 'utf8'), origin: 'build/_deps/quickfix-src', tag };
    }
    console.warn(
      `build/_deps/quickfix-src is at ${describeCheckout(FETCHED_DIR)}, not the pinned ${tag}; ` +
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
