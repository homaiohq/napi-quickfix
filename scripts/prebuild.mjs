// Produce a prebuilt binary in the layout node-gyp-build resolves at runtime.
//
// prebuildify's build orchestration is node-gyp-oriented and does not drive
// cmake-js correctly (it passes `--target <nodeVersion>` etc. that cmake-js
// forwards to make). Since we build with cmake-js, we compile a Release binary
// and copy it into `prebuilds/<platform>-<arch>/` with an N-API tag so a single
// prebuild serves every supported Node LTS. On Linux we add a libc tag so
// glibc/musl consumers each pick the right binary.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

// Run cmake-js's JS entry point with the current Node binary rather than the
// `cmake-js` / `cmake-js.cmd` shim from PATH. On Windows the shim is a batch
// file, and Node refuses to spawn .cmd/.bat files without a shell (EINVAL,
// CVE-2024-27980 hardening). Resolving the bin script avoids both the shell and
// any dependence on PATH.
const cmakeJsBin = createRequire(import.meta.url).resolve('cmake-js/bin/cmake-js');

console.log('> building Release binary with cmake-js');
execFileSync(
  process.execPath,
  [cmakeJsBin, 'compile', '--CDCMAKE_BUILD_TYPE=Release', '--CDCMAKE_POLICY_VERSION_MINIMUM=3.5'],
  { stdio: 'inherit', cwd: process.cwd() },
);

// Detect libc on Linux: glibc reports a runtime version in the process report
// (Node emits header.glibcVersionRuntime only under #ifdef __GLIBC__); musl does not.
//
// Never guess here. Mislabelling produces a binary that node-gyp-build hands to the
// wrong libc at runtime -- a load-time crash on a consumer's machine. A failed build
// is strictly better than a poisoned release.
function detectLibc() {
  if (process.platform !== 'linux') return '';

  // Escape hatch for cross-builds, exotic musl distros, or a broken process.report.
  // Must be one of the two tags node-gyp-build parses.
  const override = process.env.PREBUILD_LIBC;
  if (override) {
    if (override !== 'glibc' && override !== 'musl') {
      throw new Error(`PREBUILD_LIBC must be "glibc" or "musl", got "${override}"`);
    }
    return override;
  }

  const report = process.report?.getReport?.();
  const header = typeof report === 'object' ? report?.header : undefined;
  if (!header) {
    throw new Error(
      'cannot determine libc: process.report returned no header; set PREBUILD_LIBC',
    );
  }
  const libc = header.glibcVersionRuntime ? 'glibc' : 'musl';

  // Cross-check against the rule the CONSUMER uses, so we cannot publish a tag that
  // is unreachable on the machine that produced it. node-gyp-build resolves with
  //   process.env.LIBC || (existsSync('/etc/alpine-release') ? 'musl' : 'glibc')
  // i.e. it detects Alpine, not musl in general.
  const resolverLibc = existsSync('/etc/alpine-release') ? 'musl' : 'glibc';
  if (libc !== resolverLibc) {
    throw new Error(
      `libc mismatch: linkage is ${libc} but node-gyp-build would resolve ` +
        `${resolverLibc} here. Build musl prebuilds on Alpine, or set ` +
        `PREBUILD_LIBC=${libc} to override.`,
    );
  }

  return libc;
}

const dir = join('prebuilds', `${process.platform}-${process.arch}`);
mkdirSync(dir, { recursive: true });

// Tags parsed by node-gyp-build: runtime ("node"), "napi" (matches any N-API
// ABI), and optionally libc. Order does not matter to the resolver.
const tags = ['node', 'napi'];
const libc = detectLibc();
if (libc) tags.push(libc);

const dest = join(dir, `${tags.join('.')}.node`);
copyFileSync(join('build', 'Release', 'napi_quickfix.node'), dest);
console.log(`> prebuild written: ${dest}`);
