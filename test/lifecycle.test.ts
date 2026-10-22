import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextMacrotask } from 'node:timers/promises';
import v8 from 'node:v8';
import vm from 'node:vm';
import { Worker } from 'node:worker_threads';

import {
  Acceptor,
  Initiator,
  SessionSettings,
  SessionID,
  createMessage,
  FIELD,
  MsgType,
  type ApplicationHandlers,
  type Engine,
} from '../dist/esm/index.js';

// Lifecycle smoke tests use engines with NO counterparty, so nothing logs on and
// stop() tears down cleanly. A live logged-on session (with a real send -> fromApp
// round-trip) is exercised separately, in-process, in loopback.test.ts.

const ACCEPTOR_CFG = `[DEFAULT]
ConnectionType=acceptor
SocketAcceptPort=47801
UseDataDictionary=N
StartTime=00:00:00
EndTime=00:00:00

[SESSION]
BeginString=FIX.4.4
SenderCompID=SERVER
TargetCompID=CLIENT
`;

// Initiator pointed at a port with no listener: it will keep retrying but never
// log on, so teardown stays deadlock-free.
const INITIATOR_CFG = `[DEFAULT]
ConnectionType=initiator
SocketConnectHost=127.0.0.1
SocketConnectPort=47802
HeartBtInt=5
UseDataDictionary=N
StartTime=00:00:00
EndTime=00:00:00

[SESSION]
BeginString=FIX.4.4
SenderCompID=CLIENT
TargetCompID=SERVER
`;

const tick = () => new Promise((r) => setImmediate(r));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Engine lifecycle (no counterparty)', () => {
  test('Acceptor: onCreate fires via handler AND event; isLoggedOn stays false; clean stop', async () => {
    const settings = SessionSettings.fromString(ACCEPTOR_CFG);

    let handlerSid: SessionID | undefined;
    const acc = new Acceptor({
      settings,
      store: 'memory',
      log: 'none',
      handlers: {
        onCreate(sid) {
          handlerSid = sid;
        },
      },
    });

    const eventSids: SessionID[] = [];
    acc.on('create', (sid) => eventSids.push(sid));

    // isLoggedOn is false before start.
    assert.equal(acc.isLoggedOn(), false);

    acc.unref();
    await acc.start();
    // onCreate fires asynchronously — give the engine a moment.
    await wait(200);
    await tick();

    assert.ok(handlerSid, 'onCreate handler should have fired');
    assert.equal(handlerSid!.toString(), 'FIX.4.4:SERVER->CLIENT');
    assert.equal(eventSids.length, 1, "'create' event should have fired once");
    assert.equal(eventSids[0].toString(), 'FIX.4.4:SERVER->CLIENT');

    // No counterparty => never logged on.
    assert.equal(acc.isLoggedOn(), false);

    // Clean teardown (no live session => no deadlock).
    await acc.stop();
    // Double-stop must be a safe no-op.
    await assert.doesNotReject(() => acc.stop());
  });

  test('Initiator: constructs, starts, never logs on, stops cleanly', async () => {
    const settings = SessionSettings.fromString(INITIATOR_CFG);

    let created = false;
    const ini = new Initiator({
      settings,
      store: 'memory',
      log: 'none',
      handlers: {
        onCreate() {
          created = true;
        },
      },
    });

    assert.equal(ini.isLoggedOn(), false);

    ini.unref();
    await ini.start();
    await wait(200);
    await tick();

    assert.ok(created, 'onCreate should have fired for the initiator session');
    assert.equal(ini.isLoggedOn(), false);

    await ini.stop();
    await assert.doesNotReject(() => ini.stop());
  });
});

// A full GC on demand, without `--expose-gc` on the command line: the flag only
// installs `gc` in contexts created after it is set, so take it from a fresh one.
v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc') as () => void;

/**
 * Build an engine whose handlers and listeners close over it, as an application's
 * typically do (the Engine's own native handlers close over it in any case). It is
 * the bridge's reference to those handlers that used to make every engine immortal.
 */
function buildEngine(make: (handlers: ApplicationHandlers) => Engine): Engine {
  let engine: Engine | undefined;
  const handlers: ApplicationHandlers = {
    onLogon() {
      engine!.isLoggedOn();
    },
  };
  engine = make(handlers);
  engine.on('logout', () => engine!.getSessions());
  return engine;
}

/**
 * Create, (optionally start,) stop and drop `n` engines one after the other, in a
 * frame of their own so no slot of the test body keeps the last one reachable.
 * Sequential so each stop() has destroyed its sessions before the next engine
 * claims the same SessionID.
 */
async function churnEngines(
  n: number,
  registry: FinalizationRegistry<number>,
  make: (handlers: ApplicationHandlers) => Engine,
  { start, force }: { start: boolean; force: boolean },
): Promise<void> {
  for (let i = 0; i < n; i++) {
    const engine = buildEngine(make);
    registry.register(engine, i);
    if (start) {
      engine.unref();
      await engine.start();
      await wait(50);
    }
    await engine.stop(force);
  }
}

/** GC repeatedly until `count()` reaches `want` or the attempts run out. */
async function collectUntil(count: () => number, want: number): Promise<number> {
  for (let i = 0; i < 100 && count() < want; i++) {
    gc();
    // FinalizationRegistry callbacks run as tasks after the GC that cleared the target.
    await nextMacrotask();
  }
  return count();
}

describe('Engine garbage collection', () => {
  // Stopping a started engine joins its network thread, up to its 1 s poll
  // timeout: keep the started cases short.
  const N_IDLE = 5;
  const N_STARTED = 2;
  const initiator = (handlers: ApplicationHandlers) =>
    new Initiator({
      settings: SessionSettings.fromString(INITIATOR_CFG),
      store: 'memory',
      log: 'none',
      handlers,
    });
  const acceptor = (handlers: ApplicationHandlers) =>
    new Acceptor({
      settings: SessionSettings.fromString(ACCEPTOR_CFG),
      store: 'memory',
      log: 'none',
      handlers,
    });

  const cases: Array<[string, (h: ApplicationHandlers) => Engine, boolean, boolean]> = [
    ['Initiator, never started, stop()', initiator, false, false],
    ['Acceptor, never started, stop()', acceptor, false, false],
    ['Initiator, started, stop()', initiator, true, false],
    ['Initiator, started, stop(true)', initiator, true, true],
    ['Acceptor, started, stop()', acceptor, true, false],
  ];

  for (const [label, make, start, force] of cases) {
    test(`${label}: dropped engines are collected`, async () => {
      const n = start ? N_STARTED : N_IDLE;
      let finalized = 0;
      const registry = new FinalizationRegistry<number>(() => finalized++);
      await churnEngines(n, registry, make, { start, force });
      assert.equal(await collectUntil(() => finalized, n), n);
    });
  }
});

// --- regression: resources that must not accumulate per engine ---------------

/**
 * The number of `Promise` objects in the heap, after a full GC. Counted from a
 * heap snapshot, so a Promise kept alive from native memory (a `napi_deferred`
 * that is never settled) is seen even though nothing in JS can reach it.
 */
async function countPromises(): Promise<number> {
  // Two full GCs with a macrotask between: the first clears, the second
  // collects what the first's finalizers released.
  for (let i = 0; i < 2; i++) {
    gc();
    await nextMacrotask();
  }
  const chunks: Buffer[] = [];
  for await (const chunk of v8.getHeapSnapshot()) chunks.push(chunk as Buffer);
  const snapshot = JSON.parse(Buffer.concat(chunks).toString()) as {
    snapshot: { meta: { node_fields: string[]; node_types: string[][] } };
    nodes: number[];
    strings: string[];
  };
  const fields = snapshot.snapshot.meta.node_fields;
  const stride = fields.length;
  const typeIndex = fields.indexOf('type');
  const nameIndex = fields.indexOf('name');
  const types = snapshot.snapshot.meta.node_types[typeIndex];
  let count = 0;
  for (let i = 0; i < snapshot.nodes.length; i += stride) {
    if (
      types[snapshot.nodes[i + typeIndex]] === 'object' &&
      snapshot.strings[snapshot.nodes[i + nameIndex]] === 'Promise'
    ) {
      count++;
    }
  }
  return count;
}

describe('Engine resource regressions', () => {
  // start() and stop() used to create a Promise deferred up front and leave it
  // unsettled on the path that hands the work to an AsyncWorker: one Promise
  // rooted from native memory for the rest of the process, per call.
  test('start()/stop() do not root a Promise per call', { timeout: 60000 }, async () => {
    // Stopping a started engine joins its network thread (up to its 1 s poll
    // timeout), so only the first cycles start one; the rest stop never-started
    // engines, which take the same worker path.
    const churn = async (n: number, started: number) => {
      for (let i = 0; i < n; i++) {
        const ini = new Initiator({ settings: SessionSettings.fromString(INITIATOR_CFG), store: 'memory', log: 'none' });
        if (i < started) {
          ini.unref();
          await ini.start();
        }
        await ini.stop();
        const acc = new Acceptor({ settings: SessionSettings.fromString(ACCEPTOR_CFG), store: 'memory', log: 'none' });
        await acc.stop();
      }
    };
    // First calls populate lazily created state: measure from a warm process.
    await churn(2, 1);
    const before = await countPromises();
    const N = 20; // at least 2 stop() calls per cycle
    await churn(N, 2);
    const retained = (await countPromises()) - before;
    assert.ok(retained < N, `${retained} Promises retained after ${N} engines were stopped`);
  });

  // The constructors of the exported classes were module statics shared by
  // every environment the addon was loaded in. Each Worker overwrote them,
  // deleting the previous environment's references from the wrong thread, and
  // the main thread was left building its instances from a dead one.
  describe('worker_threads', () => {
    const WORKER = new URL('./fixtures/worker-load.mjs', import.meta.url);
    const runWorker = (mode: string, until: 'exit' | 'message'): Promise<Worker> =>
      new Promise((resolve, reject) => {
        const worker = new Worker(WORKER, { workerData: { mode } });
        worker.on('error', reject);
        if (until === 'exit') {
          worker.on('exit', (code) =>
            code === 0 ? resolve(worker) : reject(new Error(`worker exited with ${code}`)),
          );
        } else {
          worker.once('message', () => resolve(worker));
        }
      });

    test('Workers that load the addon leave the main thread and each other intact', { timeout: 60000 }, async () => {
      for (let i = 0; i < 3; i++) {
        await runWorker('churn', 'exit');
        // The main thread's constructors must still be the main thread's.
        const ini = new Initiator({ settings: SessionSettings.fromString(INITIATOR_CFG), store: 'memory', log: 'none' });
        assert.equal(ini.getSessions().length, 1);
        await ini.stop();
        assert.equal(createMessage({ [FIELD.MsgType]: MsgType.NewOrderSingle }).getMsgType(), MsgType.NewOrderSingle);
      }
    });

    test('terminate() while a callback is being dispatched does not abort the process', { timeout: 60000 }, async () => {
      for (let i = 0; i < 3; i++) {
        const worker = await runWorker('terminate', 'message');
        await worker.terminate();
      }
    });
  });
});
