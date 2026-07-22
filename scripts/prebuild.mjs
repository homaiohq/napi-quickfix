// Produce a prebuilt binary in the layout node-gyp-build resolves at runtime.
//
// prebuildify's build orchestration is node-gyp-oriented and does not drive
// cmake-js correctly (it passes `--target <nodeVersion>` etc. that cmake-js
// forwards to make). Since we build with cmake-js, we compile a Release binary
// and copy it into `prebuilds/<platform>-<arch>/` with an N-API tag so a single
// prebuild serves every supported Node LTS. On Linux we add a libc tag so
// glibc/musl consumers each pick the right binary.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const cmakeJs = process.platform === 'win32' ? 'cmake-js.cmd' : 'cmake-js';

console.log('> building Release binary with cmake-js');
execFileSync(
  cmakeJs,
  ['compile', '--CDCMAKE_BUILD_TYPE=Release', '--CDCMAKE_POLICY_VERSION_MINIMUM=3.5'],
  { stdio: 'inherit', cwd: process.cwd() },
);

// Detect libc on Linux: glibc reports a runtime version in the process report;
// musl does not.
function detectLibc() {
  if (process.platform !== 'linux') return '';
  try {
    const report = process.report?.getReport?.();
    const header = typeof report === 'object' ? report?.header : undefined;
    return header?.glibcVersionRuntime ? 'glibc' : 'musl';
  } catch {
    return 'glibc';
  }
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
