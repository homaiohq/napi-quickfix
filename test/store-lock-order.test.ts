import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextMacrotask } from 'node:timers/promises';

import { Initiator, SessionSettings, type MessageStoreMethod } from '../dist/esm/index.js';
import { initiatorCfg, freePort, waitUntil } from './helpers.js';
import { ControlledStore, withSettings } from './store-adapters.js';

// Lock order between the JS thread and the engine's own mutex. On the
// initiator's connect path the network thread holds Initiator::m_mutex
// (Initiator::connect()) across SocketConnection's getSession() ->
// Session::setResponder(), whose refresh() (RefreshOnLogon=Y) waits on the
// event loop with a JS store. Anything the JS thread does that takes that
// mutex closes the cycle LOOP -> Initiator::m_mutex -> LOOP: the loop freezes
// until the store call times out (forever with storeTimeoutMs: 0) and the
// session comes up poisoned. engine.isLoggedOn() with no argument used to be
// such a call (FIX::Initiator::isLoggedOn()).

const T = 10_000;
// A JS-thread call that waits on the network thread lasts a full
// storeTimeoutMs (1-2 s below); one that does not is well under a millisecond.
const STALL_MS = 250;

/** An initiator dialling a port nobody listens on: it reconnects every ReconnectInterval (1 s), and each
 * attempt runs setResponder() -> refresh() -> load() under Initiator::m_mutex. */
async function makeReconnectingInitiator(store: ControlledStore, storeTimeoutMs: number) {
  const port = await freePort();
  const ini = await Initiator.create({
    settings: SessionSettings.fromString(withSettings(initiatorCfg(port), { RefreshOnLogon: 'Y' })),
    store,
    storeTimeoutMs,
    log: 'none',
  });
  const storeErrors: Array<{ method: MessageStoreMethod; poisoned: boolean }> = [];
  ini.on('storeError', (_id, method, _err, poisoned) => storeErrors.push({ method, poisoned }));
  return { ini, storeErrors };
}

describe('MessageStoreAdapter: the JS thread never takes the engine mutex', () => {
  test('isLoggedOn() while setResponder()\'s refresh() is parked on the loop returns at once', { timeout: 30_000 }, async () => {
    const store = new ControlledStore();
    const timeoutMs = 2000;
    const { ini } = await makeReconnectingInitiator(store, timeoutMs);
    try {
      store.set('load', 'defer'); // after the preload: the connect-time refresh() parks
      await ini.start();
      assert.ok(await waitUntil(() => store.parked.some((p) => p.method === 'load'), T), 'connect-time load() parked');
      const t0 = performance.now();
      const loggedOn = ini.isLoggedOn();
      const ms = performance.now() - t0;
      assert.equal(loggedOn, false);
      assert.ok(ms < STALL_MS, `isLoggedOn() blocked the JS thread for ${Math.round(ms)} ms (storeTimeoutMs ${timeoutMs})`);
    } finally {
      await ini.stop(true).catch(() => {});
      for (const p of store.parked) p.reject();
    }
  });

  test('polling isLoggedOn() across reconnects with a healthy adapter never stalls the loop, and the refreshes succeed', { timeout: 30_000 }, async () => {
    const store = new ControlledStore(undefined, 2);
    const timeoutMs = 1000;
    const { ini, storeErrors } = await makeReconnectingInitiator(store, timeoutMs);
    try {
      const preloads = store.count('load');
      await ini.start();
      let calls = 0;
      let stalls = 0;
      let maxMs = 0;
      const end = Date.now() + 3000; // three connect attempts at ReconnectInterval=1
      while (Date.now() < end) {
        const t0 = performance.now();
        ini.isLoggedOn();
        const ms = performance.now() - t0;
        calls++;
        maxMs = Math.max(maxMs, ms);
        if (ms >= STALL_MS) stalls++;
        await nextMacrotask();
      }
      assert.equal(stalls, 0, `${stalls} of ${calls} isLoggedOn() calls stalled (max ${Math.round(maxMs)} ms, storeTimeoutMs ${timeoutMs})`);
      // The window was exercised: connect attempts reached the adapter.
      assert.ok(store.count('load') - preloads >= 1, 'a connect-time refresh() reached the adapter');
      assert.deepEqual(storeErrors, [], 'no connect-time refresh() timed out');
    } finally {
      await ini.stop(true).catch(() => {});
    }
  });
});
