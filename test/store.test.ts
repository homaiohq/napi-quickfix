import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep, setImmediate as nextMacrotask } from 'node:timers/promises';
import { promisify } from 'node:util';
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
  type Engine,
  type Message,
  type MessageStoreAdapter,
  type MessageStoreMethod,
  type QuickFixError,
} from '../dist/esm/index.js';
import { acceptorCfg, initiatorCfg, freePort, waitForEvent, waitUntil } from './helpers.js';
import { ControlledStore, RecordingMapStore, utcClock, withSettings } from './store-adapters.js';

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
  });
  for (const engine of [acc, ini]) {
    engine.on('storeError', (_id, method, err, poisoned) => {
      storeErrors.push({ method, message: err.message, poisoned });
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
    await assert.rejects(
      () => Initiator.create({ settings, store: new MapMessageStore(), storeTimeoutMs: -1, log: 'none' }),
      RangeError,
    );
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
    // (ReadSeq() in native guards the same bound on the reload paths).
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
    assert.equal(doesSessionExist(ACC_ID), false, 'the engine was torn down');

    // A hanging close(): stop() still settles, and reports it.
    const hangClose = new ControlledStore();
    hangClose.set('close', 'hang');
    const ini = await Initiator.create({ settings: SessionSettings.fromString(initiatorCfg(port)), store: hangClose, storeTimeoutMs: 300, log: 'none' });
    const errors: Array<{ method: string; message: string; poisoned: boolean }> = [];
    ini.on('storeError', (_id, method, err, poisoned) => errors.push({ method, message: err.message, poisoned }));
    const t0 = Date.now();
    await ini.stop();
    assert.ok(Date.now() - t0 < 5_000, 'stop() is bounded by the timeout');
    assert.deepEqual(errors, [{ method: 'close', message: 'message store close: timed out after 300 ms', poisoned: false }]);
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
    const { acc, ini } = await makePair(port, { iniStore, storeTimeoutMs: 20_000 });
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
    } finally {
      await stopBoth(acc, ini, true);
    }
  });

  test('a never-settling store call: graceful stop() settles once the timeout released it and the process exits on its own', { timeout: 40_000 }, async () => {
    const { result, ms } = await runChild('graceful-stop-hang', 30_000);
    assert.equal(result.parked, 1, 'the store call was parked when stop() was called');
    // One call hangs; the Logout the stop sends persists normally once the
    // timeout (500 ms) has released the parked thread.
    assert.ok((result.stopMs as number) < 500 + 4000, `graceful stop() settled in ${result.stopMs} ms (timeout 500)`);
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
      // each read a getter whose Gate() retries the pending reset on its own.
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
      ini.on('storeError', (_id, method, err, poisoned) => storeErrors.push({ method, message: err.message, poisoned }));
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

  test('setMessage timeout: not fatal; the late settlement is discarded', { timeout: 30_000 }, async () => {
    const port = await freePort();
    const iniStore = new ControlledStore();
    const { acc, ini, received, storeErrors } = await makePair(port, { iniStore, storeTimeoutMs: 300 });
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
      // The write lands late: an upsert of a row the next send rewrites.
      iniStore.parked.shift()!.resolve();
      iniStore.mode = () => 'ok';
      assert.equal(await sendToTarget(newOrder('next'), INI_ID), true);
      assert.ok(await waitUntil(() => received.length === 1, T));
      assert.equal(received[0].seq, before);
      assert.equal(iniStore.row(INI_ID).messages.get(before)?.includes('11=next'), true, 'the upsert replaced the late row');
      assert.equal(storeErrors.length, 1, 'a late setMessage is not reported');
    } finally {
      await stopBoth(acc, ini);
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
      assert.ok(await waitUntil(() => storeErrors.some((e) => e.method === 'setSeqNums' && e.message.includes('late')), T));
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
    const { acc, ini, received, storeErrors } = await makePair(port, { iniStore });
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

  test('poisoned store with a dead adapter: calls fail immediately, one reload attempt per timeout', { timeout: 60_000 }, async () => {
    const port = await freePort();
    const iniStore = new ControlledStore();
    const { acc, ini, storeErrors } = await makePair(port, { iniStore, storeTimeoutMs: 500 });
    try {
      await logonBoth(acc, ini);
      const session = ini.getSession(INI_ID)!;
      // Poison through a rejection (settled: the poison may lift), then
      // make every reload hang.
      iniStore.set('setSeqNums', 'reject');
      assert.equal(await sendToTarget(newOrder('p'), INI_ID), false);
      assert.ok(await waitUntil(() => storeErrors.some((e) => e.method === 'setSeqNums' && e.poisoned), T));
      iniStore.mode = (m) => (m === 'load' ? 'hang' : 'ok');
      const loadsBefore = iniStore.count('load');
      const t0 = Date.now();
      // The network thread's ticks and the reconnects each hit the store:
      // only one reload can be in flight, so over this window the adapter
      // sees about one load() per timeout, not one per call.
      await sleep(3000);
      const loads = iniStore.count('load') - loadsBefore;
      assert.ok(loads >= 2 && loads <= 8, `reload attempts in 3 s with a 500 ms timeout: ${loads}`);
      assert.throws(() => session.getExpectedSenderNum(), isIOException);
      // A setter from JS runs on a worker that waits for the session-state
      // mutex, then runs its own reload attempt under it (one timeout; the
      // "reload in flight" fast-fail cannot apply to a thread that holds the
      // mutex, since every reload runs under it). The wait is longer than
      // the one attempt in flight at t1: the network thread makes several
      // store calls back to back per pass -- on a reconnect, setResponder()
      // -> checkSessionTime() -> getCreationTime(), next() -> checkSessionTime()
      // again, generateLogon() -> reset() (ResetOnLogon=Y), shouldSendReset()
      // -> getExpectedSenderNum() (throws) -- each a full-timeout attempt that
      // re-takes the mutex within microseconds, and std::mutex is not FIFO,
      // so the worker loses that handoff k times (measured: k = 0 or 2). The
      // bound is therefore per attempt, not a fixed count: the remainder of
      // the attempt in flight at t1 (at most one timeout; it was counted
      // before t1), plus one timeout for every load() the adapter saw while
      // the setter was pending (the k barged attempts and the setter's own),
      // plus slop for the timer and thread wake-ups. The absolute cap is the
      // 10 s check below.
      const t1 = Date.now();
      const loadsAtT1 = iniStore.count('load');
      await assert.rejects(() => session.setNextTargetMsgSeqNum(5), isIOException);
      const setterMs = Date.now() - t1;
      const loadsWhilePending = iniStore.count('load') - loadsAtT1;
      assert.ok(loadsWhilePending >= 1, 'the setter ran a reload attempt of its own');
      assert.ok(
        setterMs < (1 + loadsWhilePending) * 500 + 500,
        `setter settled in ${setterMs} ms with ${loadsWhilePending} reload attempt(s) while pending (500 ms timeout)`,
      );
      assert.ok(storeErrors.filter((e) => e.method === 'load').length >= 1, 'reload failures are reported');
      assert.ok(Date.now() - t0 < 10_000);
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
