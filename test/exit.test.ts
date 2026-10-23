import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// process.exit() and a fatal exception join the libuv threadpool without
// running the environment cleanup hooks that tear the engines down. A pool
// thread parked on a JS round trip at that instant (a send in toApp or in a
// store call, a stop() joining a network thread that is) used to keep the
// process alive forever. Each scenario runs in a child (fixtures/exit-child.ts)
// that ends itself mid-operation; the child must exit with the code it chose,
// promptly. SIGKILL after HANG_MS is the failure mode being tested for.

const CHILD = fileURLToPath(new URL('./fixtures/exit-child.ts', import.meta.url));
const HANG_MS = 20_000;

async function runChild(how: 'exit' | 'throw', scenario: string) {
  const child = spawn(process.execPath, ['--import', 'tsx', CHILD, how, scenario], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let readyAt = 0;
  child.stdout.on('data', (d: Buffer) => {
    stdout += d;
    if (!readyAt && stdout.includes('ready')) readyAt = Date.now();
  });
  child.stderr.on('data', (d: Buffer) => (stderr += d));
  const killer = setTimeout(() => child.kill('SIGKILL'), HANG_MS);
  const [code, signal] = await new Promise<[number | null, NodeJS.Signals | null]>((resolve) =>
    child.once('exit', (c, s) => resolve([c, s])),
  );
  clearTimeout(killer);
  assert.ok(readyAt, `child reached its exit point (stdout: ${stdout}, stderr: ${stderr})`);
  return { code, signal, exitMs: Date.now() - readyAt, stderr };
}

describe('process exit with an operation parked on the JS thread', () => {
  // [scenario, bound on the time from the exit point to the process being
  // gone]. The graceful stop's bound includes QuickFIX's LogoutTimeout (2 s):
  // the exiting engine refuses to send the Logout, so the session waits that
  // long before it disconnects and lets stop() join its thread.
  const scenarios: Array<[string, number]> = [
    ['send-in-toapp', 3000],
    ['parked-store', 3000],
    ['parked-store-no-timeout', 3000],
    ['graceful-stop', 6000],
    ['send-after-stop-froze', 3000],
  ];
  // From inside the handler: a handler that throws is a generic rejection,
  // not a fatal exception, so this one only exists for process.exit().
  const exitOnly: Array<[string, number]> = [['toapp-exits', 3000]];
  for (const how of ['exit', 'throw'] as const) {
    for (const [scenario, boundMs] of how === 'exit' ? [...scenarios, ...exitOnly] : scenarios) {
      test(`${how === 'exit' ? 'process.exit()' : 'an uncaught exception'}: ${scenario}`, async () => {
        const { code, signal, exitMs, stderr } = await runChild(how, scenario);
        assert.equal(signal, null, `the child hung and was killed (stderr: ${stderr})`);
        assert.equal(code, how === 'exit' ? 3 : 1, stderr);
        if (how === 'throw') assert.match(stderr, /Error: boom/);
        assert.ok(exitMs < boundMs, `exited ${exitMs} ms after its exit point (bound ${boundMs} ms)`);
      });
    }
  }
});
