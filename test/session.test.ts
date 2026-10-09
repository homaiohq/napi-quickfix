import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  Acceptor,
  Initiator,
  Session,
  SessionSettings,
  SessionID,
  createMessage,
  sendToTarget,
  lookupSession,
  doesSessionExist,
  getSessions,
  numSessions,
  FIELD,
  MsgType,
  Side,
} from '../dist/esm/index.js';
import { acceptorCfg, freePort, initiatorCfg, waitForEvent, waitUntil } from './helpers.js';

// Per-session lookup, sequence numbers and logon control, exercised against a
// real in-process loopback (Acceptor + Initiator over localhost). Same harness
// as loopback.test.ts; the logon handshake, a logout/logon cycle and a reset
// each cost ~1-2s (ReconnectInterval=1), hence the generous timeouts.

const HANDSHAKE_TIMEOUT_MS = 8000;
const DELIVERY_TIMEOUT_MS = 5000;

const INI_ID = new SessionID('FIX.4.4', 'CLIENT', 'SERVER');
const ACC_ID = new SessionID('FIX.4.4', 'SERVER', 'CLIENT');

function isSessionNotFound(err: unknown): boolean {
  const e = err as { name?: string; fixErrorName?: string };
  assert.equal(e.name, 'QuickFixError');
  assert.equal(e.fixErrorName, 'SessionNotFound');
  return true;
}

function newOrder() {
  return createMessage()
    .setField(FIELD.MsgType, MsgType.NewOrderSingle)
    .setField(FIELD.Symbol, 'AAPL')
    .setField(FIELD.Side, Side.Buy)
    .setField(FIELD.OrderQty, 100);
}

describe('Session lookup without an engine', () => {
  test('lookupSession / doesSessionExist on an unknown id', () => {
    const id = new SessionID('FIX.4.4', 'NOPE', 'NADA');
    assert.equal(lookupSession(id), undefined);
    assert.equal(doesSessionExist(id), false);
    assert.ok(!getSessions().some((s) => s.toString() === id.toString()));
    assert.equal(typeof numSessions(), 'number');
  });
});

describe('Session control over a loopback (in-process)', () => {
  test(
    'lookup, state, seq nums, logout/logon, setNextSenderMsgSeqNum, reset, options, stop',
    { timeout: 60_000 },
    async () => {
      const port = await freePort();

      // What the acceptor receives (fromApp) and what the initiator sends (toApp),
      // with MsgSeqNum (tag 34) so sequence-number control is observable.
      const received: { msgType: string; seqNum: string }[] = [];
      const sentSeqNums: string[] = [];

      const acc = new Acceptor({
        settings: SessionSettings.fromString(acceptorCfg(port)),
        store: 'memory',
        log: 'none',
        handlers: {
          fromApp(msg) {
            received.push({ msgType: msg.getMsgType(), seqNum: msg.getHeaderField(FIELD.MsgSeqNum) });
          },
        },
      });
      const ini = new Initiator({
        settings: SessionSettings.fromString(initiatorCfg(port)),
        store: 'memory',
        log: 'none',
        handlers: {
          toApp(msg) {
            sentSeqNums.push(msg.getHeaderField(FIELD.MsgSeqNum));
          },
        },
      });

      // --- engine.getSessions() answers before start -----------------------------
      assert.deepEqual(
        ini.getSessions().map((s) => s.toString()),
        [INI_ID.toString()],
      );
      assert.deepEqual(
        acc.getSessions().map((s) => s.toString()),
        [ACC_ID.toString()],
      );
      assert.equal(ini.isLoggedOn(), false);
      assert.equal(ini.isLoggedOn(INI_ID), false);

      let iniSession: Session | undefined;
      let accSession: Session | undefined;
      try {
        const logons = Promise.all([
          waitForEvent(acc, 'logon', 'acceptor logon', HANDSHAKE_TIMEOUT_MS),
          waitForEvent(ini, 'logon', 'initiator logon', HANDSHAKE_TIMEOUT_MS),
        ]);
        await acc.start();
        await ini.start();
        await logons;

        // --- lookup both sides ------------------------------------------------------
        iniSession = lookupSession(INI_ID);
        accSession = lookupSession(ACC_ID);
        assert.ok(iniSession, 'lookupSession should find the initiator session');
        assert.ok(accSession, 'lookupSession should find the acceptor session');
        assert.ok(iniSession instanceof Session);
        assert.equal(iniSession.sessionID.toString(), INI_ID.toString());
        assert.equal(accSession.sessionID.toString(), ACC_ID.toString());

        assert.equal(doesSessionExist(INI_ID), true);
        assert.equal(doesSessionExist(ACC_ID), true);
        const all = getSessions().map((s) => s.toString());
        assert.ok(all.includes(INI_ID.toString()) && all.includes(ACC_ID.toString()));
        assert.ok(numSessions() >= 2);

        // Engine-scoped lookup: each engine only knows its own session.
        assert.ok(ini.getSession(INI_ID));
        assert.equal(ini.getSession(ACC_ID), undefined);
        assert.ok(acc.getSession(ACC_ID));
        assert.equal(acc.getSession(INI_ID), undefined);
        assert.equal(ini.getSession(INI_ID)!.sessionID.toString(), INI_ID.toString());

        // --- state --------------------------------------------------------------------
        assert.equal(iniSession.isLoggedOn(), true);
        assert.equal(accSession.isLoggedOn(), true);
        assert.equal(ini.isLoggedOn(), true);
        assert.equal(ini.isLoggedOn(INI_ID), true);
        assert.equal(ini.isLoggedOn(ACC_ID), false, 'foreign id is not logged on *on this engine*');
        assert.equal(acc.isLoggedOn(ACC_ID), true);

        assert.equal(iniSession.isEnabled(), true);
        assert.equal(iniSession.sentLogon(), true);
        assert.equal(iniSession.receivedLogon(), true);
        assert.equal(iniSession.sentLogout(), false);
        assert.equal(iniSession.isInitiator(), true);
        assert.equal(iniSession.isAcceptor(), false);
        assert.equal(accSession.isInitiator(), false);
        assert.equal(accSession.isAcceptor(), true);

        // StartTime=EndTime=00:00:00 => always in session; no LogonTime => same window.
        assert.equal(iniSession.isSessionTime(), true);
        assert.equal(iniSession.isSessionTime(new Date()), true);
        assert.equal(iniSession.isLogonTime(), true);
        assert.equal(iniSession.isLogonTime(new Date(Date.now() - 86_400_000)), true);

        // --- sequence numbers advance after a send -----------------------------------
        const senderBefore = iniSession.getExpectedSenderNum();
        const targetBefore = accSession.getExpectedTargetNum();
        assert.equal(
          senderBefore,
          targetBefore,
          'after logon both sides agree on the next CLIENT->SERVER seq num',
        );
        assert.ok(senderBefore >= 2, 'the Logon itself consumed seq num 1');

        assert.equal(await sendToTarget(newOrder(), INI_ID), true);
        assert.ok(await waitUntil(() => received.length >= 1, DELIVERY_TIMEOUT_MS), 'order delivered');
        assert.equal(received[0].msgType, MsgType.NewOrderSingle);
        assert.equal(received[0].seqNum, String(senderBefore));
        assert.equal(iniSession.getExpectedSenderNum(), senderBefore + 1);
        assert.equal(accSession.getExpectedTargetNum(), targetBefore + 1);

        // --- sendToTarget(message, qualifier?) resolves the session from the header --
        const byHeader = newOrder()
          .setField(FIELD.BeginString, 'FIX.4.4')
          .setField(FIELD.SenderCompID, 'CLIENT')
          .setField(FIELD.TargetCompID, 'SERVER');
        assert.equal(await sendToTarget(byHeader), true);
        assert.ok(await waitUntil(() => received.length >= 2, DELIVERY_TIMEOUT_MS), 'second order delivered');
        assert.equal(received[1].seqNum, String(senderBefore + 1));
        // A message whose header names no session rejects with SessionNotFound.
        await assert.rejects(
          () => sendToTarget(newOrder().setField(FIELD.SenderCompID, 'NOPE').setField(FIELD.TargetCompID, 'NADA')),
          isSessionNotFound,
        );

        // --- logout() -> 'logout' event -> isLoggedOn === false -----------------------
        const logouts = Promise.all([
          waitForEvent(ini, 'logout', 'initiator logout', HANDSHAKE_TIMEOUT_MS),
          waitForEvent(acc, 'logout', 'acceptor logout', HANDSHAKE_TIMEOUT_MS),
        ]);
        iniSession.logout('test logout');
        assert.equal(iniSession.isEnabled(), false, 'logout() disables the session immediately');
        await logouts;
        assert.ok(await waitUntil(() => !iniSession!.isLoggedOn(), DELIVERY_TIMEOUT_MS));
        assert.equal(iniSession.isLoggedOn(), false);
        assert.equal(ini.isLoggedOn(), false);
        assert.equal(ini.isLoggedOn(INI_ID), false);
        // The session object is still alive -- only its connection is gone.
        assert.ok(lookupSession(INI_ID));

        // --- logon() re-establishes ------------------------------------------------------
        const relogons = Promise.all([
          waitForEvent(ini, 'logon', 'initiator re-logon', HANDSHAKE_TIMEOUT_MS),
          waitForEvent(acc, 'logon', 'acceptor re-logon', HANDSHAKE_TIMEOUT_MS),
        ]);
        iniSession.logon();
        assert.equal(iniSession.isEnabled(), true);
        await relogons;
        assert.equal(iniSession.isLoggedOn(), true);
        assert.equal(accSession.isLoggedOn(), true);

        // --- setNextSenderMsgSeqNum / setNextTargetMsgSeqNum take effect ---------------
        // ResetOnLogon=Y, so both sides restarted at 1; jump CLIENT->SERVER to 50 on
        // both ends so the next order carries 34=50 and the acceptor accepts it
        // without a resend dance.
        iniSession.setNextSenderMsgSeqNum(50);
        accSession.setNextTargetMsgSeqNum(50);
        assert.equal(iniSession.getExpectedSenderNum(), 50);
        assert.equal(accSession.getExpectedTargetNum(), 50);
        const sentBefore = sentSeqNums.length;
        const receivedBefore = received.length;
        assert.equal(await sendToTarget(newOrder(), INI_ID), true);
        assert.ok(await waitUntil(() => received.length > receivedBefore, DELIVERY_TIMEOUT_MS));
        assert.equal(sentSeqNums[sentBefore], '50', 'toApp saw MsgSeqNum 50 on the outbound order');
        assert.equal(received[receivedBefore].seqNum, '50', 'acceptor received MsgSeqNum 50');
        assert.equal(iniSession.getExpectedSenderNum(), 51);
        assert.equal(accSession.getExpectedTargetNum(), 51);

        assert.throws(() => iniSession!.setNextSenderMsgSeqNum(-1), RangeError);
        assert.throws(() => iniSession!.setNextTargetMsgSeqNum(1.5), RangeError);

        // --- reset(): Logout + disconnect + store reset, then auto-reconnect ------------
        const resetLogout = waitForEvent(ini, 'logout', 'initiator logout (reset)', HANDSHAKE_TIMEOUT_MS);
        const resetLogon = waitForEvent(ini, 'logon', 'initiator logon (after reset)', HANDSHAKE_TIMEOUT_MS);
        await iniSession.reset();
        await resetLogout;
        assert.equal(iniSession.isEnabled(), true, 'reset() leaves the session enabled');
        await resetLogon;
        assert.equal(iniSession.isLoggedOn(), true);
        assert.ok(iniSession.getExpectedSenderNum() < 50, 'reset() cleared the store');

        // --- refresh() is sync and does not throw ------------------------------------------
        assert.doesNotThrow(() => iniSession!.refresh());

        // --- runtime option getters/setters round-trip ----------------------------------
        assert.equal(iniSession.getResetOnLogon(), true, 'ResetOnLogon=Y from the config');
        const boolOptions = [
          ['getResetOnLogon', 'setResetOnLogon'],
          ['getResetOnLogout', 'setResetOnLogout'],
          ['getResetOnDisconnect', 'setResetOnDisconnect'],
          ['getRefreshOnLogon', 'setRefreshOnLogon'],
          ['getCheckCompId', 'setCheckCompId'],
          ['getCheckLatency', 'setCheckLatency'],
          ['getPersistMessages', 'setPersistMessages'],
          ['getSendRedundantResendRequests', 'setSendRedundantResendRequests'],
          ['getValidateLengthAndChecksum', 'setValidateLengthAndChecksum'],
          ['getSendNextExpectedMsgSeqNum', 'setSendNextExpectedMsgSeqNum'],
          ['getIsNonStopSession', 'setIsNonStopSession'],
        ] as const;
        for (const [get, set] of boolOptions) {
          const original: boolean = iniSession[get]();
          assert.equal(typeof original, 'boolean', get);
          iniSession[set](!original);
          assert.equal(iniSession[get](), !original, `${set} should flip ${get}`);
          iniSession[set](original);
          assert.equal(iniSession[get](), original, `${set} should restore ${get}`);
        }
        const intOptions = [
          ['getLogonTimeout', 'setLogonTimeout'],
          ['getLogoutTimeout', 'setLogoutTimeout'],
          ['getMaxLatency', 'setMaxLatency'],
        ] as const;
        for (const [get, set] of intOptions) {
          const original: number = iniSession[get]();
          assert.equal(typeof original, 'number', get);
          iniSession[set](original + 7);
          assert.equal(iniSession[get](), original + 7, `${set} should change ${get}`);
          iniSession[set](original);
        }
        assert.equal(iniSession.getTimestampPrecision(), 6, 'TimestampPrecision=6 from the config');
        iniSession.setTimestampPrecision(3);
        assert.equal(iniSession.getTimestampPrecision(), 3);
        iniSession.setTimestampPrecision(6);
        assert.throws(() => iniSession!.setTimestampPrecision(10), RangeError);
        assert.throws(() => iniSession!.setTimestampPrecision(-1), RangeError);
        // Int options: non-integers and values outside int32 are RangeErrors
        // (QuickFIX takes a plain `int`), non-numbers are TypeErrors.
        assert.throws(() => iniSession!.setLogonTimeout(1.5), RangeError);
        assert.throws(() => iniSession!.setMaxLatency(2 ** 40), RangeError);
        assert.throws(() => iniSession!.setLogoutTimeout(-(2 ** 31) - 1), RangeError);
        assert.throws(() => iniSession!.setMaxLatency(Number.NaN), RangeError);
        assert.throws(() => (iniSession as any).setLogonTimeout('5'), TypeError);
        assert.throws(() => (iniSession as any).setResetOnLogon('yes'), TypeError);
      } finally {
        await ini.stop().catch(() => {});
        await acc.stop().catch(() => {});
      }

      // --- after stop(): sessions are gone, handles throw / reject SessionNotFound ----
      assert.ok(iniSession && accSession);
      assert.equal(lookupSession(INI_ID), undefined);
      assert.equal(lookupSession(ACC_ID), undefined);
      assert.equal(doesSessionExist(INI_ID), false);
      assert.equal(ini.getSession(INI_ID), undefined);
      assert.equal(acc.getSession(ACC_ID), undefined);
      assert.equal(ini.isLoggedOn(INI_ID), false);
      // The configured ids are still reported.
      assert.deepEqual(ini.getSessions().map((s) => s.toString()), [INI_ID.toString()]);
      // The stale handle keeps its id but every operation reports SessionNotFound.
      assert.equal(iniSession.sessionID.toString(), INI_ID.toString());
      assert.throws(() => iniSession!.isLoggedOn(), isSessionNotFound);
      assert.throws(() => accSession!.getExpectedSenderNum(), isSessionNotFound);
      assert.throws(() => iniSession!.setNextSenderMsgSeqNum(1), isSessionNotFound);
      assert.throws(() => iniSession!.getResetOnLogon(), isSessionNotFound);
      assert.throws(() => iniSession!.logout(), isSessionNotFound);
      assert.throws(() => iniSession!.logon(), isSessionNotFound);
      assert.throws(() => accSession!.refresh(), isSessionNotFound);
      await assert.rejects(() => iniSession!.reset(), isSessionNotFound);
      await assert.rejects(() => accSession!.disconnect(), isSessionNotFound);
    },
  );

  test('getSession / isLoggedOn stay live while a graceful stop() is in progress', { timeout: 30_000 }, async () => {
    const port = await freePort();
    const acc = new Acceptor({ settings: SessionSettings.fromString(acceptorCfg(port)), store: 'memory', log: 'none' });
    const ini = new Initiator({ settings: SessionSettings.fromString(initiatorCfg(port)), store: 'memory', log: 'none' });
    try {
      const logons = Promise.all([
        waitForEvent(acc, 'logon', 'acceptor logon', HANDSHAKE_TIMEOUT_MS),
        waitForEvent(ini, 'logon', 'initiator logon', HANDSHAKE_TIMEOUT_MS),
      ]);
      await acc.start();
      await ini.start();
      await logons;

      // A 'logout' listener fired by the graceful stop can still reach the
      // session (the engine is destroyed only once stop() settles).
      let seqNumAtLogout: number | undefined;
      ini.once('logout', (id) => {
        seqNumAtLogout = ini.getSession(id)?.getExpectedSenderNum();
      });

      const stopping = ini.stop();
      // Synchronously after calling stop(): still alive and logged on.
      assert.ok(ini.getSession(INI_ID), 'getSession() answers while stop() is in progress');
      assert.equal(ini.isLoggedOn(INI_ID), true, 'isLoggedOn(id) answers while stop() is in progress');
      assert.equal(ini.isLoggedOn(), true);
      await stopping;

      assert.equal(typeof seqNumAtLogout, 'number', "the 'logout' listener could read the final seq num");
      assert.equal(ini.getSession(INI_ID), undefined, 'gone once stop() has settled');
      assert.equal(ini.isLoggedOn(INI_ID), false);
      assert.equal(ini.isLoggedOn(), false);
    } finally {
      await ini.stop().catch(() => {});
      await acc.stop().catch(() => {});
    }
  });

  test('stop() while session operations are in flight neither crashes nor hangs', { timeout: 30_000 }, async () => {
    const port = await freePort();
    const acc = new Acceptor({ settings: SessionSettings.fromString(acceptorCfg(port)), store: 'memory', log: 'none' });
    const ini = new Initiator({ settings: SessionSettings.fromString(initiatorCfg(port)), store: 'memory', log: 'none' });
    const settles = (p: Promise<unknown>) => p.then(() => 'resolved', (e) => (isSessionNotFound(e), 'rejected'));
    try {
      const logons = Promise.all([
        waitForEvent(acc, 'logon', 'acceptor logon', HANDSHAKE_TIMEOUT_MS),
        waitForEvent(ini, 'logon', 'initiator logon', HANDSHAKE_TIMEOUT_MS),
      ]);
      await acc.start();
      await ini.start();
      await logons;
      const iniSession = lookupSession(INI_ID)!;
      const accSession = lookupSession(ACC_ID)!;

      // Queue async session ops and a send, then stop WITHOUT awaiting them.
      // The engine must outlive the ops (they hold raw FIX::Session pointers on
      // a worker thread); each op then either completes or, if it had not yet
      // resolved its session when the engine went away, rejects SessionNotFound.
      accSession.logout('stopping');
      iniSession.refresh();
      const pending = [
        settles(iniSession.reset()),
        settles(iniSession.disconnect()),
        settles(sendToTarget(newOrder(), INI_ID)),
      ];
      await ini.stop();
      await acc.stop();
      const outcomes = await Promise.all(pending);
      assert.equal(outcomes.length, 3);
      assert.equal(lookupSession(INI_ID), undefined);
      assert.equal(lookupSession(ACC_ID), undefined);
    } finally {
      await ini.stop().catch(() => {});
      await acc.stop().catch(() => {});
    }

    // Same race against a never-started engine: its sessions exist from
    // construction, so a session op can be in flight when stop() destroys them.
    const idle = new Acceptor({ settings: SessionSettings.fromString(acceptorCfg(port)), store: 'memory', log: 'none' });
    const idleSession = lookupSession(ACC_ID);
    assert.ok(idleSession);
    const idleOps = [settles(idleSession.reset()), settles(idleSession.disconnect())];
    await idle.stop();
    assert.equal((await Promise.all(idleOps)).length, 2);
    assert.equal(lookupSession(ACC_ID), undefined);
  });

  test('a stopped engine releases its SessionIDs for a new engine', { timeout: 20_000 }, async () => {
    const port = await freePort();
    const settings = SessionSettings.fromString(acceptorCfg(port));
    const first = new Acceptor({ settings, store: 'memory', log: 'none' });
    assert.ok(doesSessionExist(ACC_ID), 'constructing an engine registers its sessions');
    await first.stop(); // never started
    assert.equal(doesSessionExist(ACC_ID), false, 'stop() unregisters them, even if never started');

    // Previously this threw ConfigError ("Duplicate Session") until `first` was GC'd.
    const second = new Acceptor({ settings, store: 'memory', log: 'none' });
    assert.ok(second.getSession(ACC_ID));
    assert.equal(second.getSession(ACC_ID)!.isAcceptor(), true);
    await second.stop();
    assert.equal(second.getSession(ACC_ID), undefined);
  });

  test('logon() / logout() / refresh() are synchronous and take effect in program order', async () => {
    // A never-started engine has live sessions and no network thread, so the
    // enabled flag is only ever touched by these calls.
    const port = await freePort();
    const engine = new Acceptor({ settings: SessionSettings.fromString(acceptorCfg(port)), store: 'memory', log: 'none' });
    try {
      const session = engine.getSession(ACC_ID);
      assert.ok(session);
      assert.equal(session.isEnabled(), true);
      // As AsyncWorkers these could land on two pool threads in either order.
      session.logout('flip');
      session.logon();
      assert.equal(session.isEnabled(), true, 'logout(); logon(); ends enabled');
      session.logon();
      session.logout('flop');
      assert.equal(session.isEnabled(), false, 'logon(); logout(); ends disabled');
      assert.equal(session.refresh(), undefined);
      assert.equal(session.logon(), undefined);
    } finally {
      await engine.stop();
    }
  });

  test('sendToTarget accepts a SessionID from another copy of the package', async () => {
    // An ESM and a CJS build of this package each have their own SessionID
    // class; `instanceof` across them is false. Only the shape must matter.
    const port = await freePort();
    const engine = new Acceptor({ settings: SessionSettings.fromString(acceptorCfg(port)), store: 'memory', log: 'none' });
    try {
      const foreign = { nativeHandle: ACC_ID.nativeHandle } as unknown as SessionID;
      // Not logged on, so the engine queues the message and reports false --
      // the point is that it is routed, not rejected with a TypeError.
      assert.equal(await sendToTarget(newOrder(), foreign), false);
      await assert.rejects(
        () => sendToTarget(newOrder(), { nativeHandle: new SessionID('FIX.4.4', 'NOPE', 'NADA').nativeHandle } as unknown as SessionID),
        isSessionNotFound,
      );
    } finally {
      await engine.stop();
    }
  });
});
