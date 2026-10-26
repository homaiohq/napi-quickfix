import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep, setImmediate as nextMacrotask } from 'node:timers/promises';
import { promisify } from 'node:util';
import { Worker } from 'node:worker_threads';
import v8 from 'node:v8';
import vm from 'node:vm';

import {
  Acceptor,
  Initiator,
  MapMessageStore,
  SessionSettings,
  SessionID,
  createMessage,
  doesSessionExist,
  sendToTarget,
  FIELD,
  MsgType,
  Side,
  type ApplicationHandlers,
  type Engine,
  type Message,
  type MessageStoreAdapter,
  type MessageStoreMethod,
  type MessageStoreState,
  type QuickFixError,
} from '../dist/esm/index.js';
import { acceptorCfg, initiatorCfg, freePort, waitForEvent, waitUntil } from './helpers.js';
import { StoreBinding } from '../dist/esm/store.js';
import { ControlledStore, RecordingMapStore, fifo, utcClock, withSettings } from './store-adapters.js';

// The JS message store (MessageStoreAdapter) through the loopback harness:
// an Acceptor and an Initiator over localhost, one or both persisting through
// an adapter. The failure-policy tests inject rejections, hangs and parked
// (deferred) calls per method; see store-adapters.ts. Scenarios that must
// observe the process exiting run in a child (fixtures/store-child.ts).

const T = 10_000;
const INI_ID = new SessionID('FIX.4.4', 'CLIENT', 'SERVER');
const ACC_ID = new SessionID('FIX.4.4', 'SERVER', 'CLIENT');

interface Received {
  seq: number;
  possDup: string;
  clOrdID: string;
  text: string;
}

interface StoreErrorSeen {
  method: MessageStoreMethod;
  message: string;
  poisoned: boolean;
  late: boolean;
}

function newOrder(tag = 'x', text?: string) {
  const m = createMessage()
    .setField(FIELD.MsgType, MsgType.NewOrderSingle)
    .setField(FIELD.ClOrdID, tag)
    .setField(FIELD.Symbol, 'STO')
    .setField(FIELD.Side, Side.Buy)
    .setField(FIELD.OrderQty, 1);
  if (text !== undefined) m.setField(FIELD.Text, text);
  return m;
}

function safeHeader(msg: Message, tag: number): string {
  try {
    return msg.getHeaderField(tag);
  } catch {
    return '';
  }
}

function isIOException(err: unknown): boolean {
  const e = err as QuickFixError;
  assert.equal(e.name, 'QuickFixError');
  assert.equal(e.fixErrorName, 'IOException');
  return true;
}

interface PairOptions {
  accStore?: 'memory' | MessageStoreAdapter;
  iniStore?: 'memory' | MessageStoreAdapter;
  acc?: Record<string, string>;
  ini?: Record<string, string>;
  iniHandlers?: ApplicationHandlers;
  storeTimeoutMs?: number;
}

/** An Acceptor + Initiator pair, built through create(), not started. */
async function makePair(port: number, o: PairOptions = {}) {
  const received: Received[] = [];
  const storeErrors: StoreErrorSeen[] = [];
  const acc = await Acceptor.create({
    settings: SessionSettings.fromString(withSettings(acceptorCfg(port), o.acc ?? {})),
    store: o.accStore ?? 'memory',
    storeTimeoutMs: typeof o.accStore === 'object' ? o.storeTimeoutMs : undefined,
    log: 'none',
    handlers: {
      fromApp(msg: Message) {
        received.push({
          seq: Number(msg.getHeaderField(FIELD.MsgSeqNum)),
          possDup: safeHeader(msg, FIELD.PossDupFlag),
          clOrdID: msg.getFieldIfSet(FIELD.ClOrdID) ?? '',
          text: msg.getFieldIfSet(FIELD.Text) ?? '',
        });
      },
    },
  });
  const ini = await Initiator.create({
    settings: SessionSettings.fromString(withSettings(initiatorCfg(port), o.ini ?? {})),
    store: o.iniStore ?? 'memory',
    storeTimeoutMs: typeof o.iniStore === 'object' ? o.storeTimeoutMs : undefined,
    log: 'none',
    handlers: o.iniHandlers,
  });
  for (const engine of [acc, ini]) {
    engine.on('storeError', (_id, method, err, poisoned, late) => {
      storeErrors.push({ method, message: err.message, poisoned, late });
    });
  }
  return { acc, ini, received, storeErrors };
}

async function logonBoth(acc: Acceptor, ini: Initiator) {
  const logons = Promise.all([
    waitForEvent(acc, 'logon', 'acceptor logon', T),
    waitForEvent(ini, 'logon', 'initiator logon', T),
  ]);
  await acc.start();
  await ini.start();
  await logons;
}

async function stopBoth(acc: Engine, ini: Engine, force = false) {
  await ini.stop(force).catch(() => {});
  await acc.stop(force).catch(() => {});
}

const CHILD = fileURLToPath(new URL('./fixtures/store-child.ts', import.meta.url));
const execFileAsync = promisify(execFile);

async function runChild(mode: string, timeoutMs: number) {
  const t0 = Date.now();
  const { stdout, stderr } = await execFileAsync(process.execPath, ['--import', 'tsx', CHILD, mode], {
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
  });
  const line = stdout.split('\n').find((l) => l.startsWith('result '));
  assert.ok(line, `child printed a result (stdout: ${stdout}, stderr: ${stderr})`);
  return { result: JSON.parse(line.slice('result '.length)) as Record<string, unknown>, ms: Date.now() - t0 };
}

describe('MapMessageStore', () => {
  test('getMessages returns the stored messages of the range in order, skipping gaps, however wide the range', () => {
    const store = new MapMessageStore();
    store.create(INI_ID, { creationTime: new Date(), nextSenderMsgSeqNum: 1, nextTargetMsgSeqNum: 1 });
    for (const seq of [5, 1, 3, 2]) store.setMessage(INI_ID, seq, `m${seq}`);
    assert.deepEqual(store.getMessages(INI_ID, 2, 3), ['m2', 'm3']); // narrower than the map
    assert.deepEqual(store.getMessages(INI_ID, 2, 4), ['m2', 'm3']);
    assert.deepEqual(store.getMessages(INI_ID, 1, 5), ['m1', 'm2', 'm3', 'm5']); // as wide as the map
    assert.deepEqual(store.getMessages(INI_ID, 0, 1e9), ['m1', 'm2', 'm3', 'm5']);
    assert.deepEqual(store.getMessages(INI_ID, 6, 9), []);
    assert.deepEqual(store.getMessages(INI_ID, 3, 2), []);
  });
});

describe('MessageStoreAdapter: construction', () => {
  test('new Initiator({ store: adapter }) is a TypeError pointing at create(); create() accepts the built-ins too', async () => {
    const port = await freePort();
    const settings = SessionSettings.fromString(initiatorCfg(port));
    assert.throws(() => new Initiator({ settings, store: new MapMessageStore() as unknown as 'memory', log: 'none' }), {
      name: 'TypeError',
      message: /Initiator\.create\(\)/,
    });
    assert.throws(() => new Acceptor({ settings, store: {} as unknown as 'memory', log: 'none' }), TypeError);
    await assert.rejects(() => Initiator.create({ settings, store: 'memory', storeTimeoutMs: 1, log: 'none' }), TypeError);
    for (const storeTimeoutMs of [-1, 1.5, 2_147_483_648]) {
      await assert.rejects(
        () => Initiator.create({ settings, store: new MapMessageStore(), storeTimeoutMs, log: 'none' }),
        RangeError,
        `storeTimeoutMs ${storeTimeoutMs}`,
      );
    }
    const ini = await Initiator.create({ settings, store: 'memory', log: 'none' });
    assert.ok(ini instanceof Initiator);
    assert.ok(ini.getSession(INI_ID));
    await ini.stop();
  });

  test('SessionSettings.getSessions(connectionType) applies the [DEFAULT] merge and filters by type', async () => {
    const cfg = `[DEFAULT]
ConnectionType=acceptor
SocketAcceptPort=47999
UseDataDictionary=N
StartTime=00:00:00
EndTime=00:00:00

[SESSION]
BeginString=FIX.4.4
SenderCompID=A
TargetCompID=B

[SESSION]
BeginString=FIX.4.4
SenderCompID=C
TargetCompID=D
ConnectionType=initiator
SocketConnectHost=127.0.0.1
SocketConnectPort=47998
HeartBtInt=30
`;
    const settings = SessionSettings.fromString(cfg);
    const all = settings.getSessions().map((s) => s.toString());
    assert.deepEqual(all, ['FIX.4.4:A->B', 'FIX.4.4:C->D']);
    assert.deepEqual(settings.getSessions('acceptor').map((s) => s.toString()), ['FIX.4.4:A->B']);
    assert.deepEqual(settings.getSessions('initiator').map((s) => s.toString()), ['FIX.4.4:C->D']);
    assert.throws(() => settings.getSessions('other' as 'acceptor'), TypeError);
  });

  test('create() preloads exactly the sessions the engine owns: load(), then create() for a missing row', async () => {
    const port = await freePort();
    const store = new RecordingMapStore();
    const ini = await Initiator.create({ settings: SessionSettings.fromString(initiatorCfg(port)), store, log: 'none' });
    try {
      assert.deepEqual(store.calls, ['load', 'create']);
      assert.deepEqual([...store.rows.keys()], [INI_ID.toString()]);
      const row = store.rows.get(INI_ID.toString())!;
      assert.equal(row.state.nextSenderMsgSeqNum, 1);
      assert.equal(row.state.nextTargetMsgSeqNum, 1);
      assert.ok(row.state.creationTime instanceof Date);
      // The getters read the store's cache, seeded from the preload.
      const session = ini.getSession(INI_ID)!;
      assert.equal(session.getExpectedSenderNum(), 1);
      assert.equal(session.getExpectedTargetNum(), 1);
    } finally {
      await ini.stop();
    }
    assert.equal(store.calls.at(-1), 'close', 'stop() reached close()');

    // A row that exists is loaded, not created, and seeds the cache.
    const row = store.rows.get(INI_ID.toString())!;
    row.state.nextSenderMsgSeqNum = 42;
    row.state.nextTargetMsgSeqNum = 7;
    store.calls.length = 0;
    const again = await Initiator.create({ settings: SessionSettings.fromString(initiatorCfg(port)), store, log: 'none' });
    try {
      assert.deepEqual(store.calls, ['load']);
      assert.equal(again.getSession(INI_ID)!.getExpectedSenderNum(), 42);
      assert.equal(again.getSession(INI_ID)!.getExpectedTargetNum(), 7);
    } finally {
      await again.stop();
    }
  });

  test('create() rejects on a load()/create() failure with no native object behind it', async () => {
    const port = await freePort();
    const store = new ControlledStore();
    store.set('load', 'reject');
    await assert.rejects(
      () => Initiator.create({ settings: SessionSettings.fromString(initiatorCfg(port)), store, log: 'none' }),
      /injected load rejection/,
    );
    assert.equal(doesSessionExist(INI_ID), false, 'no session was created');
    store.mode = () => 'ok';
    store.set('create', 'reject');
    await assert.rejects(
      () => Initiator.create({ settings: SessionSettings.fromString(initiatorCfg(port)), store, log: 'none' }),
      /injected create rejection/,
    );
    assert.equal(doesSessionExist(INI_ID), false);
    // A malformed load() result is refused before the engine exists too.
    const bad: MessageStoreAdapter = {
      ...new MapMessageStore(),
      load: () => ({ creationTime: new Date(), nextSenderMsgSeqNum: 0, nextTargetMsgSeqNum: 1 }),
      create: () => {},
      setSeqNums: () => {},
      setMessage: () => {},
      getMessages: () => [],
      reset: () => {},
    };
    await assert.rejects(
      () => Acceptor.create({ settings: SessionSettings.fromString(acceptorCfg(port)), store: bad, log: 'none' }),
      TypeError,
    );
    assert.equal(doesSessionExist(ACC_ID), false);
  });

  test('create() rejects with TypeError when load() returns a seqnum at or above 2^53', async () => {
    // Refused by validState() in the TS preload, like the `0` case above
    // (the bridge applies it to reloads too, see the next test).
    const port = await freePort();
    for (const state of [
      { creationTime: new Date(), nextSenderMsgSeqNum: 2 ** 53, nextTargetMsgSeqNum: 1 },
      { creationTime: new Date(), nextSenderMsgSeqNum: 1, nextTargetMsgSeqNum: 2 ** 53 },
    ]) {
      const bad: MessageStoreAdapter = {
        load: () => state,
        create: () => {},
        setSeqNums: () => {},
        setMessage: () => {},
        getMessages: () => [],
        reset: () => {},
      };
      await assert.rejects(
        () => Initiator.create({ settings: SessionSettings.fromString(initiatorCfg(port)), store: bad, log: 'none' }),
        { name: 'TypeError', message: /must be a positive safe integer/ },
      );
      assert.equal(doesSessionExist(INI_ID), false);
    }
  });

  test('a malformed load() result on a reload is an adapter failure: IOException, poisoned storeError, lifted by the next good reload', async () => {
    const port = await freePort();
    const inner = new MapMessageStore();
    let malformed: unknown;
    const adapter: MessageStoreAdapter = {
      load: (id) => (malformed !== undefined ? (malformed as null) : inner.load(id)),
      create: (id, s) => inner.create(id, s),
      setSeqNums: (id, s, t) => inner.setSeqNums(id, s, t),
      setMessage: (id, n, m) => inner.setMessage(id, n, m),
      getMessages: (id, b, e) => inner.getMessages(id, b, e),
      reset: (id, s) => inner.reset(id, s),
    };
    const ini = await Initiator.create({ settings: SessionSettings.fromString(initiatorCfg(port)), store: adapter, log: 'none' });
    const errors: StoreErrorSeen[] = [];
    ini.on('storeError', (_id, method, err, poisoned, late) => errors.push({ method, message: err.message, poisoned, late }));
    try {
      const session = ini.getSession(INI_ID)!;
      for (const [bad, why] of [
        [{ creationTime: new Date(), nextSenderMsgSeqNum: 0, nextTargetMsgSeqNum: 1 }, /nextSenderMsgSeqNum must be a positive safe integer/],
        [{ creationTime: new Date(), nextSenderMsgSeqNum: 1, nextTargetMsgSeqNum: 2 ** 53 }, /nextTargetMsgSeqNum must be a positive safe integer/],
        [{ creationTime: Date.now(), nextSenderMsgSeqNum: 1, nextTargetMsgSeqNum: 1 }, /creationTime must be a valid Date/],
        [42, /must return a MessageStoreState/],
      ] as const) {
        malformed = bad;
        errors.length = 0;
        await assert.rejects(() => session.refresh(), isIOException);
        assert.ok(await waitUntil(() => errors.length > 0, T));
        assert.equal(errors[0].method, 'load');
        assert.ok(errors[0].poisoned && !errors[0].late);
        assert.match(errors[0].message, why);
        assert.throws(() => session.getExpectedSenderNum(), isIOException);
        malformed = undefined;
        await session.refresh();
        assert.equal(session.getExpectedSenderNum(), 1);
      }
    } finally {
      await ini.stop();
    }
  });

  test('the bridge refuses a malformed getMessages() result with a TypeError (the engine sees an adapter failure)', async () => {
    const { StoreBinding } = await import('../dist/esm/store.js');
    for (const [result, why] of [
      [{ length: 0 }, /must return string\[\]/],
      [['8=FIX.4.4', null], /entries must be strings/],
      [[Buffer.from('8=FIX.4.4')], /entries must be strings/],
    ] as const) {
      const adapter = { ...new MapMessageStore(), load: () => null, create() {}, setSeqNums() {}, setMessage() {}, reset() {}, getMessages: () => result as unknown as string[] };
      const binding = new StoreBinding(adapter, 0, []);
      await assert.rejects(binding.bridge.getMessages(INI_ID.nativeHandle, 1, 2), { name: 'TypeError', message: why });
    }
  });

  test('the preload loads the sessions concurrently; it waits for all of them and reports the first failure in session order', async () => {
    const { StoreBinding } = await import('../dist/esm/store.js');
    const ids = ['PRE-A', 'PRE-B', 'PRE-C'].map((s) => new SessionID('FIX.4.4', s, 'PRE-T'));
    const gates = new Map<string, { resolve: (v: MessageStoreState | null) => void; reject: (e: Error) => void }>();
    const started: string[] = [];
    const created: string[] = [];
    const adapter: MessageStoreAdapter = {
      load: (id) =>
        new Promise((resolve, reject) => {
          started.push(id.senderCompID);
          gates.set(id.senderCompID, { resolve, reject });
        }),
      create: (id) => void created.push(id.senderCompID),
      setSeqNums: () => {},
      setMessage: () => {},
      getMessages: () => [],
      reset: () => {},
    };
    const state = (n: number) => ({ creationTime: new Date(), nextSenderMsgSeqNum: n, nextTargetMsgSeqNum: n });

    // Every load() is in flight before any settles; the states come back in
    // session order whatever the settlement order.
    let preload = StoreBinding.preload(adapter, ids, 0);
    await nextMacrotask();
    assert.deepEqual(started, ['PRE-A', 'PRE-B', 'PRE-C']);
    gates.get('PRE-C')!.resolve(state(3));
    gates.get('PRE-B')!.resolve(null);
    gates.get('PRE-A')!.resolve(state(1));
    const states = await preload;
    assert.deepEqual(states.map((s) => s.nextSenderMsgSeqNum), [1, 1, 3]);
    assert.deepEqual(created, ['PRE-B']);

    // C fails first, then B; A is still loading: the preload waits for A and
    // rejects with B's error (the first failure in session order).
    started.length = 0;
    preload = StoreBinding.preload(adapter, ids, 0);
    let settled = false;
    preload.then(
      () => (settled = true),
      () => (settled = true),
    );
    await nextMacrotask();
    gates.get('PRE-C')!.reject(new Error('C failed'));
    await nextMacrotask();
    gates.get('PRE-B')!.reject(new Error('B failed'));
    await sleep(20);
    assert.equal(settled, false, 'still waiting for A');
    gates.get('PRE-A')!.resolve(state(1));
    await assert.rejects(preload, /B failed/);
  });

  test('a session constructed outside its session time resets through the adapter on the JS thread; create() awaits it', async () => {
    const port = await freePort();
    // A one-hour window starting two hours from now: "now" is outside it.
    const outside = { StartTime: utcClock(2), EndTime: utcClock(3) };
    const store = new ControlledStore();
    const row0 = { creationTime: new Date(Date.now() - 86_400_000), nextSenderMsgSeqNum: 9, nextTargetMsgSeqNum: 9 };
    store.inner.create(ACC_ID, row0);
    const acc = await Acceptor.create({
      settings: SessionSettings.fromString(withSettings(acceptorCfg(port), outside)),
      store,
      log: 'none',
    });
    try {
      // The constructor's reset() was dispatched directly (the only store
      // call ever made on the JS thread) and had settled before create()
      // resolved: the row is reset, and so is the cache the getters read.
      assert.deepEqual(store.calls, ['load', 'reset']);
      assert.equal(store.inflight, 0);
      assert.equal(store.row(ACC_ID).state.nextSenderMsgSeqNum, 1);
      assert.equal(acc.getSession(ACC_ID)!.getExpectedSenderNum(), 1);
      assert.equal(acc.getSession(ACC_ID)!.getExpectedTargetNum(), 1);
    } finally {
      await acc.stop();
    }

    // The same constructor-time reset() rejecting: create() rejects and the
    // fully built engine has been torn down (its session is gone).
    const failing = new ControlledStore();
    failing.inner.create(ACC_ID, row0);
    failing.set('reset', 'reject');
    await assert.rejects(
      () =>
        Acceptor.create({
          settings: SessionSettings.fromString(withSettings(acceptorCfg(port), outside)),
          store: failing,
          log: 'none',
        }),
      /injected reset rejection/,
    );
    assert.equal(doesSessionExist(ACC_ID), false, 'the engine was torn down');
    assert.ok(failing.calls.includes('close'), 'teardown reached close()');
  });

  test('storeTimeoutMs bounds the calls create() and stop() await: preload load()/create(), the constructor reset(), close()', { timeout: 30_000 }, async () => {
    const port = await freePort();
    const timedOut = (method: string) => (err: unknown) =>
      isIOException(err) && (err as Error).message === `message store ${method}: timed out after 300 ms`;
    for (const method of ['load', 'create'] as const) {
      const store = new ControlledStore();
      store.set(method, 'hang');
      const t0 = Date.now();
      await assert.rejects(
        () => Initiator.create({ settings: SessionSettings.fromString(initiatorCfg(port)), store, storeTimeoutMs: 300, log: 'none' }),
        timedOut(method),
      );
      assert.ok(Date.now() - t0 < 5_000, `${method}: bounded by the timeout`);
      assert.equal(doesSessionExist(INI_ID), false, `${method}: no session was created`);
      if (method === 'create') {
        // The hung create() may still write: the session's next create()
        // waits for it (a hung read is not waited for), then rejects.
        await assert.rejects(
          () => Initiator.create({ settings: SessionSettings.fromString(initiatorCfg(port)), store: new ControlledStore(), storeTimeoutMs: 300, log: 'none' }),
          (err: unknown) =>
            isIOException(err) &&
            (err as Error).message ===
              `message store create: ${INI_ID.toString()}: a create() from an earlier engine of this session is still pending after 300 ms; not loading the session while it may still write`,
        );
      }
      store.release();
    }

    // The constructor-time reset() (a session constructed outside its
    // session time) hanging: create() rejects and the engine is torn down.
    const outside = { StartTime: utcClock(2), EndTime: utcClock(3) };
    const hangReset = new ControlledStore();
    hangReset.inner.create(ACC_ID, { creationTime: new Date(Date.now() - 86_400_000), nextSenderMsgSeqNum: 9, nextTargetMsgSeqNum: 9 });
    hangReset.set('reset', 'hang');
    await assert.rejects(
      () =>
        Acceptor.create({
          settings: SessionSettings.fromString(withSettings(acceptorCfg(port), outside)),
          store: hangReset,
          storeTimeoutMs: 300,
          log: 'none',
        }),
      timedOut('reset'),
    );
    hangReset.release();
    assert.equal(doesSessionExist(ACC_ID), false, 'the engine was torn down');

    // A hanging close(): stop() still settles, and reports it.
    const hangClose = new ControlledStore();
    hangClose.set('close', 'hang');
    const ini = await Initiator.create({ settings: SessionSettings.fromString(initiatorCfg(port)), store: hangClose, storeTimeoutMs: 300, log: 'none' });
    const errors: StoreErrorSeen[] = [];
    ini.on('storeError', (_id, method, err, poisoned, late) => errors.push({ method, message: err.message, poisoned, late }));
    const t0 = Date.now();
    await ini.stop();
    assert.ok(Date.now() - t0 < 5_000, 'stop() is bounded by the timeout');
    assert.deepEqual(errors, [{ method: 'close', message: 'message store close: timed out after 300 ms', poisoned: false, late: false }]);
  });

  test('await stop(); await create({ store: same }) sees close() before load()', async () => {
    const port = await freePort();
    const store = new ControlledStore(undefined, 5);
    const first = await Initiator.create({ settings: SessionSettings.fromString(initiatorCfg(port)), store, log: 'none' });
    await first.stop();
    const marker = store.calls.length;
    assert.equal(store.calls[marker - 1], 'close');
    const second = await Initiator.create({ settings: SessionSettings.fromString(initiatorCfg(port)), store, log: 'none' });
    assert.deepEqual(store.calls.slice(marker), ['load']);
    await second.stop();
    assert.equal(store.calls.at(-1), 'close');
    assert.equal(store.closed.length, 2);
  });
});

describe('MessageStoreAdapter: write-through over a loopback', () => {
  test('sync Map adapter on both sides: reset() on logon, seqnums and messages persist, close() on stop', { timeout: 30_000 }, async () => {
    const port = await freePort();
    const accStore = new RecordingMapStore();
    const iniStore = new RecordingMapStore();
    const { acc, ini, received, storeErrors } = await makePair(port, { accStore, iniStore });
    try {
      await logonBoth(acc, ini);
      assert.ok(iniStore.calls.includes('reset'), 'ResetOnLogon=Y: reset() went through the adapter');
      assert.equal(await sendToTarget(newOrder('a'), INI_ID), true);
      assert.equal(await sendToTarget(newOrder('b'), INI_ID), true);
      assert.ok(await waitUntil(() => received.length === 2, T));
      const session = ini.getSession(INI_ID)!;
      const row = iniStore.rows.get(INI_ID.toString())!;
      assert.equal(row.state.nextSenderMsgSeqNum, session.getExpectedSenderNum(), 'adapter row == cache');
      assert.equal(row.state.nextTargetMsgSeqNum, session.getExpectedTargetNum());
      assert.ok(row.messages.has(2) && row.messages.has(3), 'orders 2 and 3 persisted (Logon was 1)');
      // Every outbound message = setMessage + setSeqNums, as upstream.
      assert.ok(iniStore.calls.filter((c) => c === 'setMessage').length >= 3);
      assert.deepEqual(storeErrors, []);
    } finally {
      await stopBoth(acc, ini);
    }
    assert.equal(iniStore.calls.at(-1), 'close');
    assert.equal(accStore.calls.at(-1), 'close');
  });

  test('async (sleeping) adapter both sides: 20 messages in order, acceptor store calls never overlap', { timeout: 40_000 }, async () => {
    const port = await freePort();
    const accStore = new ControlledStore(undefined, 1);
    const iniStore = new ControlledStore(undefined, 1);
    const { acc, ini, received } = await makePair(port, { accStore, iniStore });
    try {
      await logonBoth(acc, ini);
      const results = await Promise.all(Array.from({ length: 20 }, (_, i) => sendToTarget(newOrder(`o${i}`), INI_ID)));
      assert.ok(results.every(Boolean));
      assert.ok(await waitUntil(() => received.length === 20, T), `received ${received.length}`);
      const seqs = received.map((r) => r.seq);
      assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), 'in order');
      assert.equal(accStore.maxInflight, 1, 'one network thread: acceptor store calls never overlap');
      assert.equal(iniStore.row(INI_ID).state.nextSenderMsgSeqNum, ini.getSession(INI_ID)!.getExpectedSenderNum());
    } finally {
      await stopBoth(acc, ini);
    }
  });

  test('setMessage rejection: send reports false, seqnum unchanged, session survives, retry reuses the seqnum', { timeout: 30_000 }, async () => {
    const port = await freePort();
    const iniStore = new ControlledStore(undefined, 1);
    const { acc, ini, received, storeErrors } = await makePair(port, { iniStore });
    try {
      await logonBoth(acc, ini);
      const session = ini.getSession(INI_ID)!;
      const before = session.getExpectedSenderNum();
      iniStore.set('setMessage', 'reject');
      assert.equal(await sendToTarget(newOrder('fail'), INI_ID), false, 'IOException in persist -> sendRaw returns false');
      iniStore.mode = () => 'ok';
      assert.equal(session.getExpectedSenderNum(), before, 'cache not advanced');
      assert.equal(session.isLoggedOn(), true, 'an outbound store failure is not fatal');
      // The report crosses the bridge on its own (a non-blocking TSFN item)
      // while the send settles through the worker's completion: the two
      // reach the loop in either order, so wait for the report.
      assert.ok(await waitUntil(() => storeErrors.length >= 1, T));
      assert.deepEqual(
        storeErrors.map((e) => [e.method, e.poisoned]),
        [['setMessage', false]],
        'reported, not poisoned',
      );
      assert.equal(await sendToTarget(newOrder('ok'), INI_ID), true);
      assert.ok(await waitUntil(() => received.length === 1, T));
      assert.equal(received[0].seq, before, 'the retry took the seqnum the failed send did not consume');
      assert.equal(received[0].clOrdID, 'ok');
    } finally {
      await stopBoth(acc, ini);
    }
  });

  test('ResetOnLogon=N: a restart continues seqnums from the adapter; a gap is served from getMessages (quotes intact)', { timeout: 60_000 }, async () => {
    const port = await freePort();
    const accStore = new RecordingMapStore();
    const iniStore = new ControlledStore(undefined, 1);
    const noReset = { ResetOnLogon: 'N' };
    const text = `'"quoted" \\back\\slash'`;
    {
      const { acc, ini, received } = await makePair(port, { accStore, iniStore, acc: noReset, ini: noReset });
      await logonBoth(acc, ini);
      assert.equal(await sendToTarget(newOrder('r1a'), INI_ID), true);
      assert.equal(await sendToTarget(newOrder('r1b', text), INI_ID), true);
      assert.ok(await waitUntil(() => received.length === 2, T));
      assert.equal(ini.getSession(INI_ID)!.getExpectedSenderNum(), 4, 'Logon=1, orders=2,3 -> next 4');
      await stopBoth(acc, ini); // Logout (seq 4) -> next 5
    }
    const iniRow = iniStore.row(INI_ID);
    assert.equal(iniRow.state.nextSenderMsgSeqNum, 5, 'the adapter holds the post-Logout seqnum');
    assert.deepEqual([...iniRow.messages.keys()].sort(), [1, 2, 3, 4]);
    const accRow = accStore.rows.get(ACC_ID.toString())!;
    assert.equal(accRow.state.nextTargetMsgSeqNum, 5);

    // Run 2, same adapters. Open a gap on the acceptor: its first inbound
    // (Logon seq 5) is too high, so it asks for a resend from 3.
    accRow.state.nextTargetMsgSeqNum = 3;
    {
      const { acc, ini, received } = await makePair(port, { accStore, iniStore, acc: noReset, ini: noReset });
      try {
        assert.equal(ini.getSession(INI_ID)!.getExpectedSenderNum(), 5, 'loaded from the adapter, no reset');
        const accSession = acc.getSession(ACC_ID)!;
        assert.equal(accSession.getExpectedTargetNum(), 3);
        await logonBoth(acc, ini);
        // Order 3 is resent with PossDupFlag=Y through fromApp; 4 (Logout) and
        // 5 (Logon) are admin -> SequenceReset-GapFill.
        assert.ok(await waitUntil(() => received.length >= 1, T), 'the resent order arrived');
        assert.equal(received[0].seq, 3);
        assert.equal(received[0].possDup, 'Y');
        assert.equal(received[0].clOrdID, 'r1b');
        assert.equal(received[0].text, text, 'quotes and backslashes survived the store round trip');
        assert.ok(iniStore.calls.includes('getMessages'), 'the resend was served from the adapter');
        assert.ok(await waitUntil(() => accSession.getExpectedTargetNum() === 6, T));
        assert.equal(await sendToTarget(newOrder('r2a'), INI_ID), true);
        assert.ok(await waitUntil(() => received.length === 2, T));
        assert.equal(received[1].seq, 6, 'numbering continued across the restart');
        // refresh() re-reads the row; a setNext* writes it.
        await ini.getSession(INI_ID)!.refresh();
        assert.equal(ini.getSession(INI_ID)!.getExpectedSenderNum(), 7);
        iniRow.state.nextSenderMsgSeqNum = 70;
        await ini.getSession(INI_ID)!.refresh();
        assert.equal(ini.getSession(INI_ID)!.getExpectedSenderNum(), 70, 'refresh() reloaded from the adapter');
        await ini.getSession(INI_ID)!.setNextSenderMsgSeqNum(7);
        assert.equal(iniRow.state.nextSenderMsgSeqNum, 7, 'setNext* wrote through');
      } finally {
        await stopBoth(acc, ini);
      }
    }
  });

  test('incr* writes the other seqnum back unchanged on every setSeqNums call (upstream CHECK_MESSAGE_STORE_OTHER)', { timeout: 30_000 }, async () => {
    // The adapter has no incr: JsMessageStore::incrNext*() compute the new
    // value from the cache and write BOTH numbers through setSeqNums, so the
    // number not being incremented must come back unchanged on every call.
    // Checked per call on the recorded argument pairs, not on the final row
    // (a wrong intermediate write overwritten later would pass that).
    const port = await freePort();
    const iniStore = new RecordingMapStore();
    const noReset = { ResetOnLogon: 'N' };
    // HeartBtInt=60: no heartbeat write can interleave with the steps below.
    const { acc, ini, received } = await makePair(port, { iniStore, acc: noReset, ini: { ...noReset, HeartBtInt: '60' } });
    try {
      const session = ini.getSession(INI_ID)!;
      // Step 1: the setters, before any traffic (the row starts at 1/1).
      await session.setNextSenderMsgSeqNum(10);
      await session.setNextTargetMsgSeqNum(20);
      assert.deepEqual(iniStore.seqNumWrites, [
        [10, 1],
        [10, 20],
      ]);
      // Line the acceptor up (memory store) so neither side sees a gap.
      const accSession = acc.getSession(ACC_ID)!;
      await accSession.setNextTargetMsgSeqNum(10);
      await accSession.setNextSenderMsgSeqNum(20);
      // Step 2 / step 3 through the logon itself: the initiator's Logon is an
      // outbound message (sender 10 -> 11, target still 20), the acceptor's
      // Logon reply an inbound one (target 20 -> 21, sender still 11).
      await logonBoth(acc, ini);
      assert.ok(await waitUntil(() => iniStore.seqNumWrites.length >= 4, T));
      assert.deepEqual(iniStore.seqNumWrites.slice(2), [
        [11, 20],
        [11, 21],
      ]);
      // Step 2 again with an application message out...
      assert.equal(await sendToTarget(newOrder('out'), INI_ID), true);
      assert.ok(await waitUntil(() => received.length === 1, T));
      assert.deepEqual(iniStore.seqNumWrites.slice(4), [[12, 21]]);
      // ...and step 3 with one in.
      assert.equal(await sendToTarget(newOrder('in'), ACC_ID), true);
      assert.ok(await waitUntil(() => iniStore.seqNumWrites.length >= 6, T));
      assert.deepEqual(iniStore.seqNumWrites.slice(5), [[12, 22]]);
      assert.equal(session.getExpectedSenderNum(), 12);
      assert.equal(session.getExpectedTargetNum(), 22);
      assert.deepEqual(iniStore.rows.get(INI_ID.toString())!.state.nextTargetMsgSeqNum, 22);
    } finally {
      await stopBoth(acc, ini);
    }
  });

  test('stress: bounded sends through a slow adapter while the JS thread hammers the session ops, with a latency bound', { timeout: 60_000 }, async () => {
    const port = await freePort();
    const iniStore = new ControlledStore(undefined, 2);
    const { acc, ini, received } = await makePair(port, { iniStore });
    try {
      await logonBoth(acc, ini);
      const session = ini.getSession(INI_ID)!;
      const deadline = Date.now() + 3000;
      let sent = 0;
      let ops = 0;
      let maxOpMs = 0;
      const sender = async () => {
        while (Date.now() < deadline) {
          // Two sends in flight at most (each pins a pool thread while parked).
          await Promise.all([sendToTarget(newOrder(`s${sent++}`), INI_ID), sendToTarget(newOrder(`s${sent++}`), INI_ID)]);
        }
      };
      const hammer = async () => {
        while (Date.now() < deadline) {
          const t0 = Date.now();
          await session.logout('x');
          await session.logon();
          await session.setNextTargetMsgSeqNum(session.getExpectedTargetNum());
          session.getExpectedSenderNum();
          maxOpMs = Math.max(maxOpMs, Date.now() - t0);
          ops++;
        }
      };
      await Promise.all([sender(), sender(), hammer()]);
      assert.ok(ops > 10, `ops completed: ${ops}`);
      assert.ok(sent > 20, `sends completed: ${sent}`);
      assert.ok(maxOpMs < 2000, `max op triple latency ${maxOpMs} ms`);
      assert.ok(received.length > 0);
    } finally {
      await stopBoth(acc, ini, true);
    }
  });
});

describe('MessageStoreAdapter: failure policy', () => {
  test('a never-settling store call: stop(true) returns at once and the parked send settles', { timeout: 30_000 }, async () => {
    const port = await freePort();
    const iniStore = new ControlledStore(undefined, 1);
    const { acc, ini, storeErrors } = await makePair(port, { iniStore, storeTimeoutMs: 20_000 });
    try {
      await logonBoth(acc, ini);
      iniStore.set('setMessage', 'hang');
      const parked = sendToTarget(newOrder('park'), INI_ID).then(
        (ok) => `resolved:${ok}`,
        (e: QuickFixError) => `rejected:${e.fixErrorName}`,
      );
      // Until the adapter has been called (a worker must pick the send up
      // first); a 'hang' call stays counted after it was released.
      assert.ok(await waitUntil(() => iniStore.inflight === 1, 2000), 'the store call is parked');
      const t0 = Date.now();
      await ini.stop(true);
      assert.ok(Date.now() - t0 < 5000, 'stop(true) did not wait for the timeout');
      const outcome = await Promise.race([parked, sleep(3000).then(() => 'still-pending')]);
      assert.ok(outcome === 'resolved:false' || outcome.startsWith('rejected:'), outcome);
      // close() is not run under the abandoned write; it runs once that
      // settled, which the stopped engine reports.
      assert.deepEqual(iniStore.closed, [], 'close() waits for the abandoned setMessage');
      iniStore.release();
      assert.ok(await waitUntil(() => iniStore.closed.length === 1, T), 'close() ran once it settled');
      assert.deepEqual(
        storeErrors.filter((e) => e.message.includes('abandoned')),
        [{ method: 'setMessage', message: 'message store setMessage: abandoned at teardown; rejected after stop: hung setMessage released', poisoned: false, late: true }],
      );
    } finally {
      iniStore.release();
      await stopBoth(acc, ini, true);
    }
  });

  test('refresh() racing stop(true): the reload the teardown aborted rejects, it does not resolve as if it had read', { timeout: 30_000 }, async () => {
    const port = await freePort();
    const store = new ControlledStore();
    const engine = await Acceptor.create({ settings: SessionSettings.fromString(acceptorCfg(port)), store, log: 'none' });
    try {
      const session = engine.getSession(ACC_ID)!;
      store.set('load', 'defer');
      const refreshed = session.refresh();
      assert.ok(await waitUntil(() => store.parked.length === 1, T), 'the refresh() reached load()');
      await engine.stop(true);
      await assert.rejects(refreshed, (err) => isIOException(err) && /tearing down/.test((err as Error).message));
    } finally {
      for (const p of store.parked.splice(0)) p.resolve();
      await engine.stop(true).catch(() => {});
    }
  });

  test('a never-settling store call: graceful stop() is bounded by the timeout plus the logout grace and the process exits on its own', { timeout: 40_000 }, async () => {
    const { result, ms } = await runChild('graceful-stop-hang', 30_000);
    assert.equal(result.parked, 1, 'the store call was parked when stop() was called');
    // One setMessage(N) hangs. The Logout the stop sends takes N too, once the
    // timeout (500 ms) has released the parked thread, and set(N) is refused
    // while the hung write could still land over it: as in the 'dead' case
    // below, QuickFIX's 10 s logout grace bounds the stop.
    assert.ok((result.stopMs as number) < 500 + 10_000 + 5000, `graceful stop() settled in ${result.stopMs} ms (timeout 500)`);
    assert.ok(ms < 20_000, `the child exited on its own in ${ms} ms`);
  });

  test('an adapter that never settles anything: graceful stop() is bounded by the timeout plus QuickFIX\'s 10 s logout grace', { timeout: 60_000 }, async () => {
    const { result, ms } = await runChild('graceful-stop-dead', 45_000);
    assert.equal(result.parked, 1);
    // Initiator::stop(): logout() waits on the parked call (<= timeout), then
    // up to 10 s for a Logout that can never be persisted, then joins.
    assert.ok((result.stopMs as number) >= 500 && (result.stopMs as number) < 500 + 10_000 + 5000, `stop() settled in ${result.stopMs} ms`);
    assert.ok(ms < 40_000, `the child exited on its own in ${ms} ms`);
  });

  test('GC without stop() with a parked store call: the process exits once the timeout released it', { timeout: 40_000 }, async () => {
    const { result, ms } = await runChild('gc-no-stop-parked', 30_000);
    assert.equal(result.parked, 1);
    assert.ok(ms < 20_000, `the child exited on its own in ${ms} ms`);
  });

  test('force-stop while disconnect() runs a parked reset() (ResetOnDisconnect=Y): no abort', { timeout: 40_000 }, async () => {
    const { result } = await runChild('force-stop-reset', 30_000);
    assert.equal(result.parkedReset, 1, 'disconnect() was parked in reset()');
  });

  test('ResetOnDisconnect=Y + rejecting reset(): the session disconnects, storeError fires, the process survives', { timeout: 30_000 }, async () => {
    const port = await freePort();
    const iniStore = new ControlledStore(undefined, 1);
    const { acc, ini, storeErrors } = await makePair(port, { iniStore, ini: { ResetOnDisconnect: 'Y' } });
    try {
      await logonBoth(acc, ini);
      iniStore.set('reset', 'reject');
      // A failed reset() stays pending: no reload undoes it (that would bring
      // back the numbers it meant to discard); every later store call
      // retries the reset instead, and fails while the adapter is down.
      const logout = waitForEvent(ini, 'logout', 'initiator logout', T);
      await ini.getSession(INI_ID)!.logout('bye');
      await logout;
      assert.ok(await waitUntil(() => storeErrors.some((e) => e.method === 'reset' && e.poisoned), T));
      assert.equal(ini.getSession(INI_ID)!.isLoggedOn(), false);
      // Poisoned: the JS-thread getters refuse rather than report a number
      // the store may not hold.
      assert.throws(() => ini.getSession(INI_ID)!.getExpectedSenderNum(), isIOException);
      // The poison lifts on the next store call once the adapter is back:
      // logon() -> the engine reconnects -> the reset is retried, not undone.
      const loadsBefore = iniStore.count('load');
      const resetsBefore = iniStore.count('reset');
      iniStore.mode = () => 'ok';
      const relogon = waitForEvent(ini, 'logon', 'initiator re-logon', T);
      await ini.getSession(INI_ID)!.logon();
      await relogon;
      assert.equal(iniStore.count('load'), loadsBefore, 'no reload while the reset was pending');
      assert.ok(iniStore.count('reset') > resetsBefore, 'the reset was retried');
      assert.ok(iniStore.row(INI_ID).state.nextSenderMsgSeqNum <= 3, 'the row was reset before the re-logon');
      assert.doesNotThrow(() => ini.getSession(INI_ID)!.getExpectedSenderNum());
    } finally {
      await stopBoth(acc, ini);
    }
  });

  test('RefreshOnLogon=Y + rejecting refresh() (load): poisoned, the logon fails, the process survives', { timeout: 30_000 }, async () => {
    const port = await freePort();
    const iniStore = new ControlledStore(undefined, 1);
    // ResetOnLogon=N: with a reset on logon, the reset() that follows the
    // failed refresh is retried and its success lifts the poison (the state
    // is then fully known: 1/1), so the logon would go through.
    const { acc, ini, storeErrors } = await makePair(port, {
      iniStore,
      ini: { RefreshOnLogon: 'Y', ResetOnLogon: 'N', LogonTimeout: '1' },
    });
    try {
      const logons = waitForEvent(acc, 'logon', 'acceptor logon', T);
      await acc.start();
      iniStore.set('load', 'reject');
      await ini.start();
      // The initiator's generateLogon() refreshes first; the rejection
      // poisons the store, and the Logon cannot be persisted (sendRaw()
      // fails, LogonTimeout ends the attempt), so no logon completes.
      assert.ok(await waitUntil(() => storeErrors.some((e) => e.method === 'load' && e.poisoned), T));
      assert.equal(ini.isLoggedOn(), false);
      await assert.rejects(() => ini.getSession(INI_ID)!.refresh(), isIOException);
      // Back to normal: the next attempt reloads and logs on.
      iniStore.mode = () => 'ok';
      await logons;
      assert.ok(await waitUntil(() => ini.isLoggedOn(), T), 'logged on once the adapter recovered');
    } finally {
      await stopBoth(acc, ini);
    }
  });

  test('a poisoned acceptor whose fromAdmin rejects the Logon (RejectLogon): the handler\'s Logout does not abort the process', { timeout: 40_000 }, async () => {
    // Before the fix: generateLogout() -> fill() -> getNextSenderMsgSeqNum()
    // threw outside any guard in QuickFIX's catch (RejectLogon&): exit 134.
    // The sender getter now never throws.
    const { result } = await runChild('reject-logon-poisoned', 30_000);
    assert.ok((result.rejected as number) >= 2, 'the Logon was rejected (twice)');
    assert.equal(result.accLoggedOn, false);
    assert.ok((result.errors as string[]).includes('reset:true'), "the Logon's reset() poisoned the store");
    // A failed reset is retried, never undone by a plain reload.
    assert.ok(!(result.errors as string[]).includes('load:true'), 'no reload while the reset is pending');
  });

  test('a poisoned initiator receiving a wrong BeginString (UnsupportedVersion): no abort, the logout timeout disconnects', { timeout: 40_000 }, async () => {
    // Before the fix: QuickFIX's catch (UnsupportedVersion&) runs
    // generateLogout() and incrNextTargetMsgSeqNum() unguarded: exit 134.
    const { result } = await runChild('wrong-beginstring-poisoned', 30_000);
    assert.equal(result.sent, false, 'the poisoning send failed');
    assert.equal(result.stillLoggedOn, true, 'a failed send poisons without disconnecting');
    assert.equal(result.disconnected, true);
  });

  test('a connect after the session period ended, on a poisoned acceptor (RefreshOnLogon=Y): Session::reset() in setResponder() does not abort the process', { timeout: 40_000 }, async () => {
    // Before the fix: setResponder() -> Session::reset() -> generateLogout()
    // -> fill() -> getNextSenderMsgSeqNum() threw with no handler on the
    // acceptor's network thread: exit 134.
    const { result } = await runChild('rollover-connect-poisoned', 30_000);
    assert.ok((result.loads as number) >= 3, 'the initiator connected (each connect refreshes)');
    assert.equal(result.accLoggedOn, false);
    assert.ok((result.errors as string[]).includes('load:true'), 'the refresh poisoned the store');
  });

  for (const rejections of [1, 2, 3, 4]) {
    test(`ResetOnLogon=Y + a reset() that rejects ${rejections}x: every Logon stamped and sent is 34=1 with 141=Y, the reset never undone by a reload`, { timeout: 30_000 }, async () => {
      // generateLogon() resets, then reads the sender seqnum twice: in
      // shouldSendReset() for ResetSeqNumFlag and in fill() for MsgSeqNum,
      // each read a getter that retries the pending reset on its own (the
      // one thing a seqnum getter retries: the cache already holds its numbers).
      // Before the fix, one rejection: the read reloaded the old row and lifted
      // the poison, and the Logon left with 34=57 and no 141=Y. Two or three:
      // the flag was decided on the stale cache (57) and the stamp on the reset
      // one (1), a 34=1 Logon without 141=Y. Four: stamped 34=57 without the
      // flag, refused by CheckStamp(), nothing sent until LogonTimeout.
      const port = await freePort();
      const logons: Array<{ seq: number; reset: string }> = [];
      const acc = await Acceptor.create({
        settings: SessionSettings.fromString(acceptorCfg(port)),
        store: 'memory',
        log: 'none',
        handlers: {
          fromAdmin(msg: Message) {
            if (msg.getHeaderField(FIELD.MsgType) === MsgType.Logon) {
              logons.push({ seq: Number(msg.getHeaderField(FIELD.MsgSeqNum)), reset: msg.getFieldIfSet(FIELD.ResetSeqNumFlag) ?? '' });
            }
          },
        },
      });
      const iniStore = new ControlledStore(undefined, 1);
      iniStore.inner.create(INI_ID, { creationTime: new Date(), nextSenderMsgSeqNum: 57, nextTargetMsgSeqNum: 40 });
      let left = rejections;
      iniStore.set('reset', 'reject', () => left-- > 0);
      // toAdmin runs in sendRaw() after fill(), before persist(): it sees every
      // Logon stamped, including one CheckStamp() then refuses to send.
      const stamped: Array<{ seq: number; reset: string }> = [];
      const ini = await Initiator.create({
        settings: SessionSettings.fromString(initiatorCfg(port)),
        store: iniStore,
        log: 'none',
        handlers: {
          toAdmin(msg: Message) {
            if (msg.getHeaderField(FIELD.MsgType) === MsgType.Logon) {
              stamped.push({ seq: Number(msg.getHeaderField(FIELD.MsgSeqNum)), reset: msg.getFieldIfSet(FIELD.ResetSeqNumFlag) ?? '' });
            }
          },
        },
      });
      const storeErrors: StoreErrorSeen[] = [];
      ini.on('storeError', (_id, method, err, poisoned, late) => storeErrors.push({ method, message: err.message, poisoned, late }));
      try {
        await logonBoth(acc, ini);
        assert.ok(storeErrors.some((e) => e.method === 'reset' && e.poisoned), 'the first reset() was rejected');
        assert.ok(iniStore.count('reset') > rejections, 'the rejected reset was retried until it landed');
        assert.deepEqual(stamped[0], { seq: 1, reset: 'Y' }, 'the first Logon stamped');
        assert.deepEqual(logons[0], { seq: 1, reset: 'Y' }, 'the first Logon received');
        assert.ok(iniStore.row(INI_ID).state.nextSenderMsgSeqNum < 57, 'the row was reset');
        assert.equal(ini.getSession(INI_ID)!.getExpectedSenderNum(), iniStore.row(INI_ID).state.nextSenderMsgSeqNum);
      } finally {
        await stopBoth(acc, ini);
      }
    });
  }

  test('refresh() / a reload after the row was deleted: like upstream, the row is recreated at 1/1 and the cache follows', { timeout: 30_000 }, async () => {
    const port = await freePort();
    const iniStore = new ControlledStore();
    const quiet = { HeartBtInt: '60' };
    const { acc, ini, storeErrors } = await makePair(port, { iniStore, ini: quiet });
    const loadsAndCreates = (from: number) => iniStore.calls.slice(from).filter((c) => c === 'load' || c === 'create');
    try {
      await logonBoth(acc, ini);
      const session = ini.getSession(INI_ID)!;
      assert.ok(session.getExpectedSenderNum() > 1);
      // Upstream's refresh(): m_cache.reset(now), then populateCache()
      // INSERTs a 1/1 row when the SELECT finds none.
      iniStore.inner.rows.delete(INI_ID.toString());
      let marker = iniStore.calls.length;
      await session.refresh();
      assert.deepEqual(loadsAndCreates(marker), ['load', 'create']);
      assert.equal(iniStore.row(INI_ID).state.nextSenderMsgSeqNum, 1);
      assert.equal(iniStore.row(INI_ID).state.nextTargetMsgSeqNum, 1);
      assert.equal(session.getExpectedSenderNum(), 1);
      assert.equal(session.getExpectedTargetNum(), 1);
      assert.equal(storeErrors.length, 0);

      // The recreating create() failing: poisoned, refresh() rejects, the
      // cache is not touched; the poison reload recreates the row later.
      await session.setNextSenderMsgSeqNum(5);
      iniStore.inner.rows.delete(INI_ID.toString());
      iniStore.set('create', 'reject');
      await assert.rejects(() => session.refresh(), isIOException);
      // The report crosses the bridge on its own, after or before the rejection.
      assert.ok(
        await waitUntil(() => storeErrors.some((e) => e.method === 'create' && e.poisoned && /recreating the missing row/.test(e.message)), T),
      );
      assert.throws(() => session.getExpectedSenderNum(), isIOException);
      iniStore.mode = () => 'ok';
      marker = iniStore.calls.length;
      await session.setNextTargetMsgSeqNum(3); // Gate(): reload -> no row -> create(), then the write
      assert.deepEqual(loadsAndCreates(marker), ['load', 'create']);
      assert.equal(session.getExpectedSenderNum(), 1);
      assert.equal(session.getExpectedTargetNum(), 3);
      assert.equal(iniStore.row(INI_ID).state.nextTargetMsgSeqNum, 3);
    } finally {
      await stopBoth(acc, ini, true);
    }
  });

  test('setMessage timeout: not fatal; the late settlement is reported, not poisoning', { timeout: 30_000 }, async () => {
    const port = await freePort();
    const iniStore = new ControlledStore();
    // HeartBtInt=60: no heartbeat can take `before` or hit the deferred setMessage.
    const { acc, ini, received, storeErrors } = await makePair(port, { iniStore, ini: { HeartBtInt: '60' }, storeTimeoutMs: 300 });
    try {
      await logonBoth(acc, ini);
      const session = ini.getSession(INI_ID)!;
      const before = session.getExpectedSenderNum();
      iniStore.set('setMessage', 'defer');
      const t0 = Date.now();
      assert.equal(await sendToTarget(newOrder('slow'), INI_ID), false);
      assert.ok(Date.now() - t0 >= 300, 'released by the timeout');
      // The report crosses the bridge on its own; it may land just after the send settled.
      assert.ok(await waitUntil(() => storeErrors.length >= 1, T));
      assert.deepEqual(storeErrors.map((e) => [e.method, e.poisoned]), [['setMessage', false]]);
      assert.equal(session.getExpectedSenderNum(), before);
      // The write lands late (reported: set(before) is accepted again), before
      // the retry: an upsert of a row the next send rewrites.
      iniStore.parked.shift()!.resolve();
      iniStore.mode = () => 'ok';
      assert.equal(await sendToTarget(newOrder('next'), INI_ID), true);
      assert.ok(await waitUntil(() => received.length === 1, T));
      assert.equal(received[0].seq, before);
      assert.equal(iniStore.row(INI_ID).messages.get(before)?.includes('11=next'), true, 'the upsert replaced the late row');
      assert.deepEqual(storeErrors.map((e) => [e.method, e.poisoned, e.late]), [['setMessage', false, false], ['setMessage', false, true]]);
      assert.match(storeErrors[1].message, /settled after the timeout.*accepted again$/);
    } finally {
      await stopBoth(acc, ini);
    }
  });

  test('a timed-out setMessage(N) holds back set(N) until it settled: a resend of N delivers what went out as N', { timeout: 30_000 }, async () => {
    // ControlledStore keeps no per-session order, like a connection pool: a
    // timed-out setMessage(N, A) can commit after the retry's setMessage(N, B).
    // Row N would then hold A, whose send resolved false, and a resend of N
    // would deliver it instead of B. The engine refuses set(N) until A settled.
    const port = await freePort();
    const iniStore = new ControlledStore();
    // HeartBtInt=60: no heartbeat can take N or hit the parked write.
    const { acc, ini, received, storeErrors } = await makePair(port, { iniStore, ini: { HeartBtInt: '60' }, storeTimeoutMs: 300 });
    try {
      await logonBoth(acc, ini);
      const session = ini.getSession(INI_ID)!;
      const N = session.getExpectedSenderNum();
      iniStore.set('setMessage', 'defer', (args) => String(args[2]).includes('\x0111=A\x01'));
      assert.equal(await sendToTarget(newOrder('A'), INI_ID), false, 'setMessage(N, A) timed out');
      const sentB = await sendToTarget(newOrder('B'), INI_ID);
      // A's write lands after B's attempt; a macrotask later its late
      // settlement has reached the engine.
      iniStore.parked.shift()!.resolve();
      await nextMacrotask();
      if (!sentB) assert.equal(await sendToTarget(newOrder('B'), INI_ID), true, 'set(N) accepted once A settled');
      assert.ok(await waitUntil(() => received.some((r) => r.clOrdID === 'B'), T));
      assert.equal(received.find((r) => r.clOrdID === 'B')!.seq, N, 'B went out as N');
      // The peer asks for N again: lower its expected target, then the next
      // message (N+1) is too high and triggers ResendRequest(N, 0).
      await acc.getSession(ACC_ID)!.setNextTargetMsgSeqNum(N);
      assert.equal(await sendToTarget(newOrder('T'), INI_ID), true);
      assert.ok(await waitUntil(() => received.some((r) => r.clOrdID === 'T'), T));
      const resent = received.filter((r) => r.seq === N && r.possDup === 'Y').map((r) => r.clOrdID);
      assert.deepEqual(resent, ['B'], 'the resend of N delivered B, not the failed A');
      assert.equal(sentB, false, 'set(N) was refused while setMessage(N, A) was unsettled');
      assert.ok(
        storeErrors.some((e) => e.method === 'setMessage' && !e.poisoned && e.message.includes('has not settled')),
        'the refusal is a non-poisoning storeError naming why',
      );
      assert.ok(storeErrors.every((e) => !e.poisoned), 'nothing poisoned the store');
      assert.equal(session.isLoggedOn(), true);
    } finally {
      await stopBoth(acc, ini);
    }
  });

  test('a call that times out before the adapter was called is never run', { timeout: 30_000 }, async () => {
    // Block the event loop past the timeout right after the send's toApp
    // (itself a round trip through the loop) was answered: the store call
    // the send makes next expires in the bridge's queue. Run once the loop
    // frees up, a stale setMessage could commit over a retry's row for the
    // same seqnum; it must be dropped instead. PersistMessages=N makes the
    // send's only write a fatal setSeqNums, whose drop must still count as
    // settled or the poison could never lift.
    const blockLoop = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    const quiet = { HeartBtInt: '60', ReconnectInterval: '60' };
    for (const persist of ['Y', 'N']) {
      const port = await freePort();
      const iniStore = new ControlledStore();
      const { acc, ini, received, storeErrors } = await makePair(port, {
        iniStore,
        ini: { ...quiet, PersistMessages: persist },
        iniHandlers: {
          toApp(msg) {
            // A microtask runs once the trampoline returned, i.e. after
            // toApp's answer reached the waiting send.
            if (msg.getFieldIfSet(FIELD.ClOrdID) === 'stale') queueMicrotask(() => blockLoop(800));
          },
        },
        storeTimeoutMs: 300,
      });
      try {
        await logonBoth(acc, ini);
        const session = ini.getSession(INI_ID)!;
        const seq = session.getExpectedSenderNum();
        const method = persist === 'Y' ? 'setMessage' : 'setSeqNums';
        const calls = iniStore.count(method);
        assert.equal(await sendToTarget(newOrder('stale'), INI_ID), false, `${method} timed out in the queue: the send failed`);
        // The failure report was queued behind the expired call, so once it
        // is in, the call has been through the trampoline.
        assert.ok(await waitUntil(() => storeErrors.some((e) => e.method === method), T));
        assert.equal(iniStore.count(method), calls, `the expired ${method} never reached the adapter`);
        if (persist === 'N') {
          assert.ok(
            await waitUntil(() => storeErrors.some((e) => e.method === 'setSeqNums' && e.late && e.message.includes('not run')), T),
            'the drop is reported as a late settlement',
          );
          // Nothing is left unsettled: the next tick reloads and lifts.
          const lifted = () => {
            try {
              session.getExpectedSenderNum();
              return true;
            } catch {
              return false;
            }
          };
          assert.ok(await waitUntil(lifted, T), 'the poison lifted');
        }
        assert.equal(session.getExpectedSenderNum(), seq, 'the failed send consumed no seqnum');
        assert.equal(await sendToTarget(newOrder('next'), INI_ID), true);
        assert.ok(await waitUntil(() => received.length === 1, T));
        assert.equal(received[0].clOrdID, 'next');
        assert.equal(received[0].seq, seq);
        if (persist === 'Y') {
          assert.equal(iniStore.row(INI_ID).messages.get(seq)?.includes('11=next'), true, 'the row holds the message sent');
        }
        assert.equal(session.isLoggedOn(), true);
      } finally {
        await stopBoth(acc, ini, true);
      }
    }
  });

  test('a bridge result that is not a Promise, returned after the timeout, settles the call as late', { timeout: 30_000 }, async () => {
    // The shipped bridge always returns a Promise (settle()); the native
    // trampoline must not depend on it. A synchronous result that comes back
    // once the waiter's deadline passed is a late settlement like a Promise
    // settling then: unsettled, the poison could never lift. Driven on the
    // internal StoreBinding, since no adapter can make the bridge return
    // anything but a Promise.
    const blockLoop = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    const settings = SessionSettings.fromString(initiatorCfg(await freePort()));
    const timeoutMs = 200;
    const store = new MapMessageStore();
    const binding = new StoreBinding(store, timeoutMs, await StoreBinding.preload(store, settings.getSessions('initiator'), timeoutMs));
    const ini = new Initiator({ settings, store: binding as unknown as 'memory', log: 'none' });
    const storeErrors: StoreErrorSeen[] = [];
    ini.on('storeError', (_id, method, err, poisoned, late) => storeErrors.push({ method, message: err.message, poisoned, late }));
    try {
      const bridge = binding.bridge as unknown as Record<string, unknown>;
      const setSeqNums = bridge.setSeqNums;
      // Runs on the loop, past the waiter's deadline, and returns a plain value.
      bridge.setSeqNums = () => {
        blockLoop(3 * timeoutMs);
        return undefined;
      };
      const session = ini.getSession(INI_ID)!;
      await assert.rejects(session.setNextSenderMsgSeqNum(5), (err) => isIOException(err) && /timed out/.test((err as Error).message));
      bridge.setSeqNums = setSeqNums;
      assert.ok(
        await waitUntil(() => storeErrors.some((e) => e.method === 'setSeqNums' && e.late && e.poisoned), T),
        `the synchronous result is reported as a late settlement (storeErrors: ${JSON.stringify(storeErrors)})`,
      );
      // Nothing is left unsettled: the next write reloads, lifts the poison, and lands.
      await session.setNextSenderMsgSeqNum(7);
      assert.equal(session.getExpectedSenderNum(), 7);
    } finally {
      await ini.stop(true);
    }
  });

  test('setSeqNums timeout then late resolve: poison, disconnect, reload after settlement, reconnect reconciles with PossDupFlag=Y', { timeout: 60_000 }, async () => {
    const port = await freePort();
    const iniStore = new ControlledStore();
    const noReset = { ResetOnLogon: 'N' };
    // A reconnect while poisoned sends a Logon that cannot be persisted, and
    // QuickFIX has already marked it sent: the attempt ends at LogonTimeout.
    const { acc, ini, received, storeErrors } = await makePair(port, {
      iniStore,
      acc: noReset,
      ini: { ...noReset, LogonTimeout: '1' },
      storeTimeoutMs: 300,
    });
    try {
      await logonBoth(acc, ini);
      const session = ini.getSession(INI_ID)!;
      const seq = session.getExpectedSenderNum();
      const loadsBefore = iniStore.count('load'); // the preload
      iniStore.set('setSeqNums', 'defer');
      const logout = waitForEvent(ini, 'logout', 'initiator disconnect', T);
      assert.equal(await sendToTarget(newOrder('late'), INI_ID), false, 'the incr timed out: the send failed');
      assert.ok(await waitUntil(() => storeErrors.some((e) => e.method === 'setSeqNums'), T));
      const poison = storeErrors.find((e) => e.method === 'setSeqNums');
      assert.ok(poison?.poisoned, 'storeError carries poisoned: true');
      assert.equal(poison?.late, false, 'the timeout itself is not late');
      assert.throws(() => session.getExpectedSenderNum(), isIOException);
      // Down at its next inbound message (the peer's heartbeat at the
      // latest): the unsettled write keeps the poison, so the target write
      // that ends every inbound message fails.
      await logout;
      assert.equal(session.isLoggedOn(), false);
      // A send now fails on the poisoned store (persist() cannot write).
      assert.equal(await sendToTarget(newOrder('while-down'), INI_ID), false);
      // Still poisoned while the timed-out write is unsettled: no reload
      // attempt is made, the engine's reconnects fail on the store.
      await sleep(1500);
      assert.equal(iniStore.count('load'), loadsBefore, 'no reload before the late write settled');
      assert.equal(session.isLoggedOn(), false);
      // The write lands: DB nextSender = seq+1 while the peer expects seq.
      iniStore.mode = () => 'ok';
      const relogon = waitForEvent(ini, 'logon', 'initiator re-logon', T);
      iniStore.parked.shift()!.resolve();
      assert.ok(await waitUntil(() => storeErrors.some((e) => e.method === 'setSeqNums' && e.late), T));
      const lateReport = storeErrors.find((e) => e.method === 'setSeqNums' && e.late)!;
      assert.ok(lateReport.poisoned && !lateReport.message.includes('(late)'), 'late is a flag, not a message suffix');
      await relogon;
      assert.ok(iniStore.count('load') > loadsBefore, 'reloaded through load() once settled');
      // The late incr landed (seq+1), then the Logon (seq+2); the heartbeat
      // received while poisoned was never counted either, so the reconnect
      // may also cost the initiator a ResendRequest of its own.
      assert.ok(iniStore.row(INI_ID).state.nextSenderMsgSeqNum >= seq + 2, 'the late incr landed, then the Logon');
      // The peer expected `seq`; the Logon went out as seq+1, so the acceptor
      // asked for a resend and the never-sent order arrived with PossDupFlag=Y.
      assert.ok(await waitUntil(() => received.length === 1, T));
      assert.equal(received[0].seq, seq);
      assert.equal(received[0].possDup, 'Y');
      assert.equal(received[0].clOrdID, 'late');
      assert.doesNotThrow(() => session.getExpectedSenderNum());
    } finally {
      await stopBoth(acc, ini);
    }
  });

  test('a send whose setSeqNums rejects once: poisoned, healed by the next call\'s reload, no disconnect, the seqnum is reused', { timeout: 30_000 }, async () => {
    const port = await freePort();
    // Reject exactly the incr of the order tagged 'fail' (its setMessage
    // arms it): an inbound increment writes the sender number unchanged, so
    // a heartbeat arriving meanwhile cannot take the rejection.
    let armed = 0;
    let rejected = false;
    class ArmedStore extends ControlledStore {
      override setMessage(id: SessionID, seq: number, msg: string): Promise<void> {
        if (msg.includes('\x0111=fail\x01')) armed = seq;
        return super.setMessage(id, seq, msg);
      }
    }
    const iniStore = new ArmedStore();
    iniStore.set('setSeqNums', 'reject', (args) => {
      if (rejected || armed === 0 || args[1] !== armed + 1) return false;
      rejected = true;
      return true;
    });
    // HeartBtInt=60: no heartbeat, out or in, can take a seqnum or arrive poisoned.
    const { acc, ini, received, storeErrors } = await makePair(port, { iniStore, ini: { HeartBtInt: '60' } });
    let logouts = 0;
    ini.on('logout', () => logouts++);
    acc.on('logout', () => logouts++);
    try {
      await logonBoth(acc, ini);
      const session = ini.getSession(INI_ID)!;
      const seq = session.getExpectedSenderNum();
      const loadsBefore = iniStore.count('load'); // the preload
      assert.equal(await sendToTarget(newOrder('fail'), INI_ID), false, 'the incr rejected: the send failed');
      assert.ok(rejected, 'the rejection hit the order\'s incr');
      assert.ok(await waitUntil(() => storeErrors.some((e) => e.method === 'setSeqNums'), T));
      assert.deepEqual(
        storeErrors.map((e) => [e.method, e.poisoned]),
        [['setSeqNums', true]],
      );
      // Nothing is unsettled (a rejection, not a timeout), so the next store
      // call -- the network thread's next tick at the latest -- reloads, the
      // reload succeeds, and the poison lifts with no disconnect.
      const lifted = () => {
        try {
          session.getExpectedSenderNum();
          return true;
        } catch {
          return false;
        }
      };
      assert.ok(await waitUntil(lifted, T), 'the poison lifted');
      assert.ok(iniStore.count('load') > loadsBefore, 'lifted by a reload through load()');
      assert.equal(session.getExpectedSenderNum(), seq, 'the reload kept the number the failed send did not consume');
      assert.equal(await sendToTarget(newOrder('ok'), INI_ID), true);
      assert.ok(await waitUntil(() => received.length === 1, T));
      assert.equal(received[0].clOrdID, 'ok');
      assert.equal(received[0].seq, seq, 'the next send reused the seqnum');
      assert.equal(iniStore.row(INI_ID).state.nextSenderMsgSeqNum, seq + 1);
      assert.equal(logouts, 0, 'neither side disconnected');
      assert.equal(session.isLoggedOn(), true);
    } finally {
      await stopBoth(acc, ini);
    }
  });

  test('a poisoned store: the seqnum getters never reload, so a send costs one load() (its write\'s) and the reads before it agree', { timeout: 30_000 }, async () => {
    const port = await freePort();
    const iniStore = new ControlledStore();
    // NonStopSession=Y: QuickFIX never reads the creation time, the one
    // getter that reloads, so with HeartBtInt=60 the network thread makes no
    // store call at all on the idle session and every load() below is a send's.
    const { acc, ini, received, storeErrors } = await makePair(port, {
      iniStore,
      ini: { HeartBtInt: '60', NonStopSession: 'Y' },
    });
    try {
      await logonBoth(acc, ini);
      const session = ini.getSession(INI_ID)!;
      const seq = session.getExpectedSenderNum();
      iniStore.set('setSeqNums', 'reject', () => !storeErrors.some((e) => e.method === 'setSeqNums'));
      assert.equal(await sendToTarget(newOrder('p'), INI_ID), false);
      assert.ok(await waitUntil(() => storeErrors.some((e) => e.method === 'setSeqNums' && e.poisoned), T));
      iniStore.set('load', 'reject');
      // Each send reads the sender seqnum in fill() (a getter: no reload, the
      // cache), then persist() -> set() reloads once and fails. Before the
      // getters stopped reloading, fill() made a load() of its own: two per send.
      const loadsBefore = iniStore.count('load');
      for (let i = 0; i < 3; i++) {
        assert.equal(await sendToTarget(newOrder(`q${i}`), INI_ID), false);
      }
      assert.equal(iniStore.count('load') - loadsBefore, 3, 'one load() per send: the write\'s, none from the getters');
      assert.throws(() => session.getExpectedSenderNum(), isIOException);
      // Adapter back: the next send's write reloads (one load()), lifts the
      // poison and goes out on the number the failed sends did not consume.
      iniStore.mode = () => 'ok';
      const loadsOk = iniStore.count('load');
      assert.equal(await sendToTarget(newOrder('ok'), INI_ID), true);
      assert.equal(iniStore.count('load') - loadsOk, 1);
      assert.ok(await waitUntil(() => received.length === 1, T));
      assert.deepEqual([received[0].clOrdID, received[0].seq], ['ok', seq]);
      assert.equal(session.isLoggedOn(), true);
    } finally {
      await stopBoth(acc, ini);
    }
  });

  test('a poisoned store whose reload moves the target seqnum under an inbound message: not counted on top of the moved number, no throw, the next message disconnects', { timeout: 30_000 }, async () => {
    const port = await freePort();
    const iniStore = new ControlledStore();
    // NonStopSession=Y: no creation-time read, so the inbound message is
    // verified against the cache (the target getter does not reload) and the
    // first reload is its incrNextTargetMsgSeqNum()'s.
    const { acc, ini, storeErrors } = await makePair(port, {
      iniStore,
      ini: { HeartBtInt: '60', NonStopSession: 'Y', ResetOnLogon: 'N' },
    });
    try {
      await logonBoth(acc, ini);
      const session = ini.getSession(INI_ID)!;
      const target = session.getExpectedTargetNum();
      iniStore.set('setSeqNums', 'reject', () => !storeErrors.some((e) => e.method === 'setSeqNums'));
      assert.equal(await sendToTarget(newOrder('p'), INI_ID), false);
      assert.ok(await waitUntil(() => storeErrors.some((e) => e.method === 'setSeqNums' && e.poisoned), T));
      // The row moves behind the engine (a late write that landed, an
      // operator): the reload will bring target+100.
      const row = iniStore.row(INI_ID).state;
      iniStore.inner.setSeqNums(INI_ID, row.nextSenderMsgSeqNum, target + 100);
      let logouts = 0;
      ini.on('logout', () => logouts++);
      assert.equal(await sendToTarget(newOrder('in'), ACC_ID), true);
      // The increment reloads, sees the moved number and does not count the
      // message: reported, but no throw (nextQueued() makes the same call
      // outside any handler), so the session stays up on the moved number.
      const refused = () => storeErrors.find((e) => /moved the next target seqnum/.test(e.message));
      assert.ok(await waitUntil(() => refused() !== undefined, T), 'the increment was not counted');
      assert.equal(refused()!.poisoned, false);
      assert.equal(logouts, 0);
      assert.doesNotThrow(() => session.getExpectedTargetNum(), 'not poisoned: the reload left cache and row equal');
      assert.equal(session.getExpectedTargetNum(), target + 100, 'the cache keeps the moved number');
      assert.equal(iniStore.row(INI_ID).state.nextTargetMsgSeqNum, target + 100);
      // QuickFIX's own sequence check reconciles: the peer's next message is
      // too low for the moved number, Logout + disconnect.
      const logout = waitForEvent(ini, 'logout', 'initiator disconnect', T);
      assert.equal(await sendToTarget(newOrder('in2'), ACC_ID), true);
      await logout;
      assert.equal(iniStore.row(INI_ID).state.nextTargetMsgSeqNum, target + 100, 'the moved number was kept');
      assert.ok(!iniStore.seqNumWrites.some(([, t]) => t === target + 101), 'never counted on top of it');
    } finally {
      await stopBoth(acc, ini, true);
    }
  });

  test('PersistMessages=N: a message stamped while the store was poisoned is refused, even though its own increment\'s reload lifts the poison', { timeout: 30_000 }, async () => {
    const port = await freePort();
    const iniStore = new ControlledStore();
    // NonStopSession=Y + HeartBtInt=60: no store call on the idle session, so
    // the store is still poisoned when the next send stamps its MsgSeqNum from
    // the cache. With PersistMessages=N that send's only write is
    // incrNextSenderMsgSeqNum(), with no set() whose CheckStamp() could catch it.
    const { acc, ini, received, storeErrors } = await makePair(port, {
      iniStore,
      ini: { HeartBtInt: '60', NonStopSession: 'Y', PersistMessages: 'N' },
    });
    try {
      await logonBoth(acc, ini);
      const session = ini.getSession(INI_ID)!;
      const seq = session.getExpectedSenderNum();
      iniStore.set('setSeqNums', 'reject', () => !storeErrors.some((e) => e.method === 'setSeqNums'));
      assert.equal(await sendToTarget(newOrder('p'), INI_ID), false);
      assert.ok(await waitUntil(() => storeErrors.some((e) => e.method === 'setSeqNums' && e.poisoned), T));
      assert.throws(() => session.getExpectedSenderNum(), isIOException, 'still poisoned');
      const loads = iniStore.count('load');
      assert.equal(await sendToTarget(newOrder('stamped'), INI_ID), false, 'refused, not sent');
      assert.equal(iniStore.count('load') - loads, 1, 'the increment reloaded');
      const refusal = () => storeErrors.find((e) => /stamped while the store was poisoned/.test(e.message));
      assert.ok(await waitUntil(() => refusal() !== undefined, T));
      assert.deepEqual([refusal()!.method, refusal()!.poisoned, refusal()!.late], ['setSeqNums', false, false]);
      assert.equal(session.getExpectedSenderNum(), seq, 'the reload lifted the poison; no seqnum consumed');
      assert.equal(iniStore.row(INI_ID).state.nextSenderMsgSeqNum, seq);
      assert.equal(await sendToTarget(newOrder('ok'), INI_ID), true);
      assert.ok(await waitUntil(() => received.length === 1, T));
      assert.deepEqual([received[0].clOrdID, received[0].seq], ['ok', seq], 'the refused message never went out');
      assert.equal(session.isLoggedOn(), true);
    } finally {
      await stopBoth(acc, ini);
    }
  });

  test('a setNextSenderMsgSeqNum() landing while toApp runs moves the number between the stamp and set(): refused, not sent', { timeout: 30_000 }, async () => {
    // The setter is issued from a Worker: a call from toApp itself only
    // reaches the native setter in a microtask (the per-session chain), i.e.
    // after toApp's answer released the send. From the Worker, the setter's
    // pool thread takes SessionState's mutex (the setter does not take
    // Session's, which sendRaw() holds) and parks in its write on this,
    // blocked, JS thread; the send's set() then waits behind it and sees the
    // moved number.
    const port = await freePort();
    const iniStore = new ControlledStore();
    const jump = 10;
    const issued = new Int32Array(new SharedArrayBuffer(4));
    const worker = new Worker(
      `const { parentPort, workerData } = require('node:worker_threads');
      const qf = require(workerData.cjs);
      parentPort.on('message', (seq) => {
        const moved = qf.lookupSession(new qf.SessionID('FIX.4.4', 'CLIENT', 'SERVER')).setNextSenderMsgSeqNum(seq);
        // Queued after the chain's call into the addon.
        queueMicrotask(() => { Atomics.store(workerData.issued, 0, 1); Atomics.notify(workerData.issued, 0); });
        moved.then(() => parentPort.postMessage('moved'), (err) => parentPort.postMessage(String(err)));
      });`,
      { eval: true, workerData: { cjs: fileURLToPath(new URL('../dist/cjs/index.js', import.meta.url)), issued } },
    );
    const moved = new Promise((resolve) => worker.once('message', resolve));
    let fired = false;
    const { acc, ini, received, storeErrors } = await makePair(port, {
      iniStore,
      ini: { HeartBtInt: '60' },
      iniHandlers: {
        toApp(msg) {
          if (msg.getFieldIfSet(FIELD.ClOrdID) !== 'stamped' || fired) return;
          fired = true;
          worker.postMessage(Number(msg.getHeaderField(FIELD.MsgSeqNum)) + jump);
          assert.equal(Atomics.wait(issued, 0, 0, 5_000), 'ok', 'the Worker issued the setter');
          // Margin for the setter's pool thread to take the mutex.
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
        },
      },
    });
    try {
      await logonBoth(acc, ini);
      const session = ini.getSession(INI_ID)!;
      const seq = session.getExpectedSenderNum();
      assert.equal(await sendToTarget(newOrder('stamped'), INI_ID), false, 'refused, not sent');
      assert.equal(await moved, 'moved');
      const refusal = () => storeErrors.find((e) => /the message was stamped MsgSeqNum=/.test(e.message));
      assert.ok(await waitUntil(() => refusal() !== undefined, T));
      assert.deepEqual([refusal()!.method, refusal()!.poisoned, refusal()!.late], ['setMessage', false, false]);
      assert.match(refusal()!.message, new RegExp(`stamped MsgSeqNum=${seq} but the next sender seqnum is now ${seq + jump}`));
      assert.equal(session.getExpectedSenderNum(), seq + jump, 'the setter\'s number holds');
      assert.equal(iniStore.row(INI_ID).messages.has(seq), false, 'nothing stored under the stamp');
      assert.equal(await sendToTarget(newOrder('after'), INI_ID), true);
      assert.ok(await waitUntil(() => received.some((r) => r.clOrdID === 'after'), T));
      assert.deepEqual(
        received.map((r) => [r.clOrdID, r.seq]),
        [['after', seq + jump]],
        'the refused message never went out; the next one took the moved number',
      );
      assert.equal(session.isLoggedOn(), true);
    } finally {
      await worker.terminate();
      await stopBoth(acc, ini);
    }
  });

  test('poisoned store with a stalled load(): one reload, then calls fail immediately until it settles', { timeout: 60_000 }, async () => {
    const port = await freePort();
    const iniStore = new ControlledStore();
    const { acc, ini, storeErrors } = await makePair(port, { iniStore, storeTimeoutMs: 500 });
    try {
      await logonBoth(acc, ini);
      const session = ini.getSession(INI_ID)!;
      // Poison through a rejection (settled: the poison may lift), then
      // park every reload.
      iniStore.set('setSeqNums', 'reject');
      assert.equal(await sendToTarget(newOrder('p'), INI_ID), false);
      assert.ok(await waitUntil(() => storeErrors.some((e) => e.method === 'setSeqNums' && e.poisoned), T));
      iniStore.mode = (m) => (m === 'load' ? 'defer' : 'ok');
      // A reload is a load(), or the retry of a failed reset (a reconnect's
      // ResetOnLogon=Y reset fails on the poisoned store and is left pending).
      const reloads = () => iniStore.count('load') + iniStore.count('reset');
      const reloadsBefore = reloads();
      // The network thread's ticks and the reconnects each hit the store
      // (getCreationTime() first, then the writes). The first reload times out and stays
      // unsettled: no store call starts another (each would park the
      // network thread, and every other session on it, for a timeout) until
      // the stalled one has settled.
      assert.ok(await waitUntil(() => reloads() > reloadsBefore, T), 'a reload was attempted');
      await sleep(3000);
      assert.equal(reloads() - reloadsBefore, 1, 'one reload attempt while it is unsettled');
      assert.equal(iniStore.parked.length, 1);
      assert.ok(storeErrors.some((e) => e.method === 'load' && e.message.includes('timed out')), 'the timed-out reload is reported');
      assert.throws(() => session.getExpectedSenderNum(), isIOException);
      // A setter from JS runs on a worker under the session-state mutex: it
      // fails at once, no network-thread reload holds that mutex any more.
      const t1 = Date.now();
      await assert.rejects(() => session.setNextTargetMsgSeqNum(5), isIOException);
      const setterMs = Date.now() - t1;
      assert.ok(setterMs < 500, `setter failed in ${setterMs} ms, under one timeout (500 ms)`);
      assert.equal(reloads() - reloadsBefore, 1, 'the setter started no reload');
      // The stalled load() settles (its result is discarded): the next call
      // reloads and the poison lifts.
      iniStore.mode = () => 'ok';
      iniStore.parked.shift()!.resolve();
      const lifted = () => {
        try {
          session.getExpectedSenderNum();
          return true;
        } catch {
          return false;
        }
      };
      assert.ok(await waitUntil(lifted, T), 'the poison lifted');
      assert.equal(reloads() - reloadsBefore, 2, 'lifted by a fresh reload once the stalled one settled');
    } finally {
      await stopBoth(acc, ini, true);
    }
  });

  test('a SequenceReset with NewSeqNo above 2^53 is refused before the adapter: row and cache unchanged, storeError (not poisoned), disconnect', { timeout: 30_000 }, async () => {
    const port = await freePort();
    // Record every seqnum pair the adapter is asked to write: a value above
    // 2^53-1 would arrive rounded (9007199254740993 -> ...992), and either
    // fails Number.isSafeInteger.
    const base = new ControlledStore(undefined, 1);
    const written: Array<[number, number]> = [];
    const iniStore: MessageStoreAdapter = {
      load: (id) => base.load(id),
      create: (id, s) => base.create(id, s),
      setSeqNums: (id, s, t) => {
        written.push([s, t]);
        return base.setSeqNums(id, s, t);
      },
      setMessage: (id, n, m) => base.setMessage(id, n, m),
      getMessages: (id, b, e) => base.getMessages(id, b, e),
      reset: (id, s) => base.reset(id, s),
      close: (id) => base.close(id),
    };
    // No heartbeat and no reconnect inside the test window, so the only
    // write the initiator could make is the one the SequenceReset asks for;
    // ResetOnLogon=N so a reconnect could not rewrite the row either.
    const quiet = { HeartBtInt: '60', ReconnectInterval: '60', ResetOnLogon: 'N' };
    const { acc, ini, storeErrors } = await makePair(port, { iniStore, acc: { ResetOnLogon: 'N' }, ini: quiet });
    try {
      await logonBoth(acc, ini);
      const session = ini.getSession(INI_ID)!;
      const before = base.row(INI_ID).state.nextTargetMsgSeqNum;
      assert.equal(session.getExpectedTargetNum(), before);
      // GapFillFlag=N: QuickFIX skips the seqnum checks and calls
      // setNextTargetMsgSeqNum(NewSeqNo) with the exact 64-bit value. The
      // value is a string: 9007199254740993 has no JS number representation.
      const sequenceReset = createMessage()
        .setField(FIELD.MsgType, MsgType.SequenceReset)
        .setField(FIELD.GapFillFlag, 'N')
        .setField(FIELD.NewSeqNo, '9007199254740993');
      const logout = waitForEvent(ini, 'logout', 'initiator disconnect', T);
      assert.equal(await sendToTarget(sequenceReset, ACC_ID), true);
      // The refusal is an IOException inside Session::next(Message), whose
      // handler disconnects; the report crosses the bridge on its own.
      await logout;
      assert.ok(await waitUntil(() => storeErrors.some((e) => e.method === 'setSeqNums'), T));
      assert.equal(session.isLoggedOn(), false);
      const refusals = storeErrors.filter((e) => e.method === 'setSeqNums');
      assert.equal(refusals.length, 1);
      assert.equal(refusals[0].poisoned, false, 'nothing reached the adapter: cache and row are equal, no poison');
      assert.match(refusals[0].message, /setNextTargetMsgSeqNum\(9007199254740993\)/, 'the exact value reached the guard');
      assert.match(refusals[0].message, /9007199254740991 \(2\^53-1/);
      assert.equal(base.row(INI_ID).state.nextTargetMsgSeqNum, before, 'the row is unchanged');
      assert.equal(session.getExpectedTargetNum(), before, 'so is the cache');
      assert.ok(written.length > 0);
      assert.ok(
        written.every(([s, t]) => Number.isSafeInteger(s) && Number.isSafeInteger(t) && t <= before),
        `no rounded value was ever written: ${JSON.stringify(written)}`,
      );
      assert.doesNotThrow(() => session.getExpectedSenderNum(), 'not poisoned: the getters still answer');
    } finally {
      await stopBoth(acc, ini);
    }
  });

  test('self-deadlock: a store method awaiting an operation on its own session fails with IOException within the timeout', { timeout: 30_000 }, async () => {
    const port = await freePort();
    const base = new ControlledStore();
    let session: ReturnType<Initiator['getSession']>;
    let awaited: Promise<void> | undefined;
    const selfWait: MessageStoreAdapter = {
      load: (id) => base.load(id),
      create: (id, s) => base.create(id, s),
      setMessage: (id, n, m) => base.setMessage(id, n, m),
      getMessages: (id, b, e) => base.getMessages(id, b, e),
      reset: (id, s) => base.reset(id, s),
      close: (id) => base.close(id),
      async setSeqNums(id, s, t) {
        if (session && !awaited) {
          // Waits on the session-state mutex the thread parked in THIS call
          // holds: only the timeout can break the cycle.
          awaited = session.logout('from the store');
          await awaited;
        }
        return base.setSeqNums(id, s, t);
      },
    };
    const { acc, ini, storeErrors } = await makePair(port, { iniStore: selfWait, storeTimeoutMs: 500 });
    try {
      await logonBoth(acc, ini);
      session = ini.getSession(INI_ID)!;
      const t0 = Date.now();
      assert.equal(await sendToTarget(newOrder('self'), INI_ID), false);
      const ms = Date.now() - t0;
      assert.ok(ms >= 500 && ms < 5000, `released by the timeout (${ms} ms)`);
      assert.ok(
        await waitUntil(() => storeErrors.some((e) => e.method === 'setSeqNums' && e.poisoned && e.message.includes('timed out')), T),
      );
      // Once the timeout released the mutex the logout went through, the
      // store call settled (late) and the session is down.
      await awaited;
      assert.ok(await waitUntil(() => !session!.isLoggedOn(), T));
    } finally {
      await stopBoth(acc, ini, true);
    }
  });
});

// A call an engine gave up on (timed out, or aborted by stop()) may still
// commit after the engine is gone. With a fresh adapter instance per engine
// over the same database -- the common `create({ store: new Store(pool) })`
// pattern -- even a per-session FIFO adapter cannot order it before the next
// engine's preload, so the binding does: create() waits for the session's
// stragglers (bounded by storeTimeoutMs), and the stopped engine reports
// each one as it settles.
describe('MessageStoreAdapter: calls a stopped engine abandoned', () => {
  const crossCfg = { ResetOnLogon: 'N', HeartBtInt: '60', LogonTimeout: '2', ReconnectInterval: '1' };

  /** A memory-store acceptor recording the orders and the Logout texts it sends. */
  async function counterparty(port: number) {
    const received: Received[] = [];
    const logoutTexts: string[] = [];
    const acc = await Acceptor.create({
      settings: SessionSettings.fromString(withSettings(acceptorCfg(port), { ResetOnLogon: 'N' })),
      store: 'memory',
      log: 'none',
      handlers: {
        fromApp(msg: Message) {
          received.push({
            seq: Number(msg.getHeaderField(FIELD.MsgSeqNum)),
            possDup: safeHeader(msg, FIELD.PossDupFlag),
            clOrdID: msg.getFieldIfSet(FIELD.ClOrdID) ?? '',
            text: '',
          });
        },
        toAdmin(msg: Message) {
          if (safeHeader(msg, FIELD.MsgType) === MsgType.Logout) logoutTexts.push(msg.getFieldIfSet(FIELD.Text) ?? '');
        },
      },
    });
    await acc.start();
    return { acc, received, logoutTexts };
  }

  /** An initiator over its own FIFO adapter instance on the shared `backing` store. */
  function initiator(port: number, backing: MapMessageStore, storeTimeoutMs: number) {
    const store = new ControlledStore(backing);
    const created = Initiator.create({
      settings: SessionSettings.fromString(withSettings(initiatorCfg(port), crossCfg)),
      store: fifo(store),
      storeTimeoutMs,
      log: 'none',
    });
    return { store, created };
  }

  /** `p`'s state after `ms`: still pending, or how it settled. */
  async function stateAfter(p: Promise<unknown>, ms: number): Promise<string> {
    return Promise.race([
      p.then(
        () => 'resolved',
        () => 'rejected',
      ),
      sleep(ms).then(() => 'pending'),
    ]);
  }

  for (const force of [true, false]) {
    test(`a setSeqNums abandoned by ${force ? 'stop(true)' : 'a graceful stop()'} lands before the next engine loads: the restart is not "MsgSeqNum too low"`, { timeout: 60_000 }, async () => {
      const port = await freePort();
      const { acc, received, logoutTexts } = await counterparty(port);
      const backing = new MapMessageStore();
      const engines: Engine[] = [];
      try {
        // Engine 1: the incr of p1 times out (the store is poisoned) and is
        // still running in the adapter when the engine stops.
        const e1 = initiator(port, backing, 300);
        const ini1 = await e1.created;
        engines.push(ini1);
        const errors1: StoreErrorSeen[] = [];
        ini1.on('storeError', (_id, method, err, poisoned, late) => errors1.push({ method, message: err.message, poisoned, late }));
        await logonBoth(acc, ini1);
        const s0 = ini1.getSession(INI_ID)!.getExpectedSenderNum();
        e1.store.set('setSeqNums', 'defer', (args) => args[1] === s0 + 1);
        assert.equal(await sendToTarget(newOrder('p1'), INI_ID), false, 'the incr timed out');
        assert.ok(await waitUntil(() => e1.store.parked.length === 1, T));
        const p1 = e1.store.parked.shift()!;
        await ini1.stop(force);
        assert.ok(await waitUntil(() => !acc.isLoggedOn(), T));

        // Engine 2, a new adapter instance on the same rows. Engine 1's write
        // lands as late as the binding lets it: during create() if create()
        // waits for it, else once engine 2 has logged on and sent.
        const e2 = initiator(port, backing, 5_000);
        e2.created.then((e) => engines.push(e), () => {});
        const waited = await stateAfter(e2.created, 400);
        const loadsWhileWaiting = e2.store.count('load');
        if (waited === 'pending') p1.resolve();
        const ini2 = await e2.created;
        const loaded = ini2.getSession(INI_ID)!.getExpectedSenderNum();
        await logonBoth(acc, ini2);
        for (const tag of ['a', 'b', 'c']) assert.equal(await sendToTarget(newOrder(tag), INI_ID), true, `send ${tag}`);
        assert.ok(await waitUntil(() => ['a', 'b', 'c'].every((t) => received.some((r) => r.clOrdID === t)), T));
        if (waited !== 'pending') {
          p1.resolve();
          assert.ok(await waitUntil(() => e1.store.inflight === 0, T));
        }
        const next = ini2.getSession(INI_ID)!.getExpectedSenderNum();
        const row = backing.rows.get(INI_ID.toString())!.state.nextSenderMsgSeqNum;

        // Engine 3 restarts from the row after engine 2 crashed (stop(true)).
        await ini2.stop(true);
        assert.ok(await waitUntil(() => !acc.isLoggedOn(), T));
        const texts0 = logoutTexts.length;
        const ini3 = await initiator(port, backing, 300).created;
        engines.push(ini3);
        let loggedOn = false;
        ini3.once('logon', () => (loggedOn = true));
        await ini3.start();
        assert.ok(await waitUntil(() => loggedOn || logoutTexts.length > texts0, T));
        const text = logoutTexts.slice(texts0).join(' | ');
        assert.doesNotMatch(text, /too low/i);
        assert.equal(loggedOn, true, `engine 3 logged on (acceptor Logout: ${text})`);
        assert.equal(row, next, 'the row did not regress under engine 2');

        assert.equal(waited, 'pending', "create() waited for the previous engine's abandoned setSeqNums");
        assert.equal(loadsWhileWaiting, 0, 'nothing was loaded meanwhile');
        assert.equal(loaded, s0 + 1, 'loaded after the late write landed');
        // Engine 1's emitter hears about it (late, not poisoning).
        assert.ok(await waitUntil(() => errors1.some((e) => e.message.includes('abandoned')), T), JSON.stringify(errors1));
        assert.deepEqual(
          errors1.filter((e) => e.message.includes('abandoned')),
          [{ method: 'setSeqNums', message: 'message store setSeqNums: abandoned at teardown; settled after stop', poisoned: false, late: true }],
        );
      } finally {
        for (const e of engines.reverse()) await e.stop(true).catch(() => {});
        await acc.stop(true).catch(() => {});
      }
    });
  }

  test('a stop(true) refused while start() is in flight abandons nothing: the engine\'s writes are not reported', { timeout: 30_000 }, async () => {
    const port = await freePort();
    const iniStore = new ControlledStore(undefined, 1);
    const { acc, ini, storeErrors } = await makePair(port, { iniStore });
    try {
      await acc.start();
      const logon = waitForEvent(ini, 'logon', 'initiator logon', T);
      const started = ini.start();
      await assert.rejects(ini.stop(true), /already in progress/);
      await started;
      await logon;
      assert.equal(await sendToTarget(newOrder('after'), INI_ID), true);
      await sleep(100);
      assert.deepEqual(storeErrors, []);
    } finally {
      await stopBoth(acc, ini, true);
    }
  });

  test('a setMessage abandoned by stop(true) is no ghost order: create() rejects while it is pending, then loads once it landed', { timeout: 60_000 }, async () => {
    const port = await freePort();
    const { acc, received } = await counterparty(port);
    const backing = new MapMessageStore();
    const engines: Engine[] = [];
    try {
      const e1 = initiator(port, backing, 300);
      const ini1 = await e1.created;
      engines.push(ini1);
      await logonBoth(acc, ini1);
      const s0 = ini1.getSession(INI_ID)!.getExpectedSenderNum();
      e1.store.set('setMessage', 'defer', (args) => String(args[2]).includes('\x0111=p1\x01'));
      assert.equal(await sendToTarget(newOrder('p1'), INI_ID), false, 'the setMessage timed out: p1 was not sent');
      assert.ok(await waitUntil(() => e1.store.parked.length === 1, T));
      const p1 = e1.store.parked.shift()!;
      await ini1.stop(true);
      assert.ok(await waitUntil(() => !acc.isLoggedOn(), T));

      // Still pending past storeTimeoutMs: create() rejects.
      const early = await initiator(port, backing, 300).created.then(
        async (e) => {
          await e.stop(true);
          return undefined;
        },
        (err: unknown) => err,
      );
      // As above: engine 1's write lands during create() if it waits, else
      // once engine 2 has logged on and sent.
      const e2 = initiator(port, backing, 5_000);
      e2.created.then((e) => engines.push(e), () => {});
      const waited = await stateAfter(e2.created, 400);
      if (waited === 'pending') p1.resolve();
      const ini2 = await e2.created;
      const loaded = ini2.getSession(INI_ID)!.getExpectedSenderNum();
      await logonBoth(acc, ini2);
      assert.equal(await sendToTarget(newOrder('a'), INI_ID), true);
      assert.ok(await waitUntil(() => received.some((r) => r.clOrdID === 'a'), T));
      if (waited !== 'pending') {
        p1.resolve();
        assert.ok(await waitUntil(() => e1.store.inflight === 0, T));
      }
      // The peer asks for everything from s0 again: with engine 2's Logon
      // stored at s0 (it replaced p1's row), s0 is gap-filled.
      await acc.getSession(ACC_ID)!.setNextTargetMsgSeqNum(s0);
      assert.equal(await sendToTarget(newOrder('trigger'), INI_ID), true);
      assert.ok(await waitUntil(() => received.some((r) => r.clOrdID === 'trigger'), T));
      assert.deepEqual(received.filter((r) => r.clOrdID === 'p1'), [], 'the peer never receives the order whose send failed');

      assert.ok(early !== undefined, 'create() rejected while the setMessage was pending');
      isIOException(early);
      assert.match((early as Error).message, /^message store setMessage: /);
      assert.ok((early as Error).message.includes(INI_ID.toString()), (early as Error).message);
      assert.equal(waited, 'pending', "create() waited for the previous engine's abandoned setMessage");
      assert.equal(loaded, s0);
    } finally {
      for (const e of engines.reverse()) await e.stop(true).catch(() => {});
      await acc.stop(true).catch(() => {});
    }
  });
});

// A full GC on demand (see lifecycle.test.ts).
v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc') as () => void;

describe('MessageStoreAdapter: garbage collection', () => {
  test('an engine whose adapter closes over it is collectable after stop()', { timeout: 30_000 }, async () => {
    const port = await freePort();
    let finalized = 0;
    const registry = new FinalizationRegistry<number>(() => finalized++);
    const N = 3;
    for (let i = 0; i < N; i++) {
      await (async () => {
        let engine: Initiator | undefined;
        const store = new MapMessageStore();
        const adapter: MessageStoreAdapter = {
          ...store,
          load: (id) => store.load(id),
          create: (id, s) => store.create(id, s),
          setSeqNums: (id, s, t) => {
            engine!.isLoggedOn();
            return store.setSeqNums(id, s, t);
          },
          setMessage: (id, n, m) => store.setMessage(id, n, m),
          getMessages: (id, b, e) => store.getMessages(id, b, e),
          reset: (id, s) => store.reset(id, s),
        };
        engine = await Initiator.create({ settings: SessionSettings.fromString(initiatorCfg(port)), store: adapter, log: 'none' });
        engine.on('storeError', () => engine!.getSessions());
        registry.register(engine, i);
        await engine.stop();
      })();
    }
    for (let i = 0; i < 100 && finalized < N; i++) {
      gc();
      await nextMacrotask();
    }
    assert.equal(finalized, N);
  });
});
