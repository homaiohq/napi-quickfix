import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  Acceptor,
  Engine,
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

// The CJS build of the same package: a distinct `SessionID` class over the
// same native addon, as a consumer mixing `import` and `require` would get.
const cjs = createRequire(import.meta.url)('../dist/cjs/index.js') as typeof import('../dist/esm/index.js');

// Per-session lookup, sequence numbers and logon control, exercised against a
// real in-process loopback (Acceptor + Initiator over localhost). Same harness
// as loopback.test.ts; the logon handshake and a logout/logon cycle each cost
// ~1-2s (ReconnectInterval=1), hence the generous timeouts.

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
    'lookup, state, seq nums, logout/logon, setNextSenderMsgSeqNum, options, stop',
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

      // Queue sends, then stop WITHOUT awaiting them. The engine must outlive
      // the sends (they hold raw FIX::Session pointers on a worker thread);
      // each then either completes or, if it had not yet resolved its session
      // when the engine went away, rejects SessionNotFound.
      accSession.logout('stopping');
      iniSession.refresh();
      const pending = [
        settles(sendToTarget(newOrder(), INI_ID)),
        settles(sendToTarget(newOrder(), ACC_ID)),
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
    // construction, so a send can be in flight when stop() destroys them.
    const idle = new Acceptor({ settings: SessionSettings.fromString(acceptorCfg(port)), store: 'memory', log: 'none' });
    assert.ok(lookupSession(ACC_ID));
    const idleOps = [settles(sendToTarget(newOrder(), ACC_ID)), settles(sendToTarget(newOrder(), ACC_ID))];
    await idle.stop();
    assert.equal((await Promise.all(idleOps)).length, 2);
    assert.equal(lookupSession(ACC_ID), undefined);
  });

  test('a second stop() while one is in flight settles with it, not before', { timeout: 30_000 }, async () => {
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

      // The 'logout' listener fired by a graceful stop runs BEFORE that stop
      // settles (the engine is destroyed behind the queued events). A stop()
      // issued from there used to resolve immediately -- `stopped_` was already
      // set -- while the sessions were still alive.
      let fromListener: Promise<void> | undefined;
      let sessionGoneWhenSettled: boolean | undefined;
      ini.once('logout', () => {
        fromListener = ini.stop();
        void fromListener.then(() => {
          sessionGoneWhenSettled = ini.getSession(INI_ID) === undefined;
        });
      });

      const first = ini.stop();
      // Synchronously after: the worker is running, a second call joins it
      // (the first call's `force` applies; it is not restarted as a force stop).
      assert.strictEqual(ini.stop(true), first, 'a concurrent stop() returns the in-flight promise');
      await first;

      assert.ok(fromListener, "the 'logout' listener ran and called stop()");
      assert.strictEqual(fromListener, first, "stop() from the 'logout' listener joined the in-flight stop");
      await fromListener;
      assert.equal(sessionGoneWhenSettled, true, 'when the joined promise settled the sessions were gone');
      assert.equal(ini.getSession(INI_ID), undefined);

      // Once settled, stop() is a fresh, immediately-resolved no-op again.
      const again = ini.stop();
      assert.notStrictEqual(again, first);
      await again;
    } finally {
      await ini.stop().catch(() => {});
      await acc.stop().catch(() => {});
    }

    // Never-started engine: same joining while its (async) stop() is pending.
    const idle = new Acceptor({ settings: SessionSettings.fromString(acceptorCfg(port)), store: 'memory', log: 'none' });
    const a = idle.stop();
    const b = idle.stop();
    assert.strictEqual(b, a);
    await a;
    assert.equal(lookupSession(ACC_ID), undefined);
  });

  test('a constructor that fails on a later [SESSION] leaves no orphaned session behind', { timeout: 20_000 }, async () => {
    // QuickFIX's Initiator/Acceptor::initialize() creates the sessions one by
    // one and, if a later [SESSION] is misconfigured, throws without deleting
    // the ones already created: they would stay in the process-wide registry
    // with no owner, locking their ids out of every later engine ("Duplicate
    // Session") and resolvable through lookupSession(). The wraps clean them
    // up. The valid session is named to sort FIRST (std::set<SessionID>
    // iterates in order) so that it is the one created before the throw.
    const port = await freePort();
    const good = new SessionID('FIX.4.4', 'AAA', 'SERVER');
    const cases: Array<[string, string, RegExp, () => Engine]> = [
      [
        'Initiator',
        `${initiatorCfg(port).replace('SenderCompID=CLIENT', 'SenderCompID=AAA')}
[SESSION]
BeginString=FIX.4.4
SenderCompID=ZZZ
TargetCompID=SERVER
HeartBtInt=0
`,
        /Heartbeat must be greater than zero/,
        () => new Initiator({ settings: SessionSettings.fromString(initiatorCfg(port).replace('SenderCompID=CLIENT', 'SenderCompID=AAA')), store: 'memory', log: 'none' }),
      ],
      [
        'Acceptor',
        `${acceptorCfg(port).replace('SenderCompID=SERVER\nTargetCompID=CLIENT', 'SenderCompID=AAA\nTargetCompID=SERVER')}
[SESSION]
BeginString=FIX.4.4
SenderCompID=ZZZ
TargetCompID=SERVER
StartDay=Monday
`,
        /StartDay used without EndDay/,
        () => new Acceptor({ settings: SessionSettings.fromString(acceptorCfg(port).replace('SenderCompID=SERVER\nTargetCompID=CLIENT', 'SenderCompID=AAA\nTargetCompID=SERVER')), store: 'memory', log: 'none' }),
      ],
    ];
    for (const [kind, cfg, reason, retryWithGoodOnly] of cases) {
      const settings = SessionSettings.fromString(cfg);
      assert.ok(settings.getSessions().length === 2, `${kind}: both [SESSION]s parsed`);
      const Ctor = kind === 'Initiator' ? Initiator : Acceptor;
      const isThatConfigError = (err: unknown) => {
        const e = err as { name?: string; fixErrorName?: string; message?: string };
        assert.equal(e.name, 'QuickFixError');
        assert.equal(e.fixErrorName, 'ConfigError');
        assert.match(e.message ?? '', reason);
        return true;
      };
      assert.throws(() => new Ctor({ settings, store: 'memory', log: 'none' }), isThatConfigError, `${kind}: rejected`);
      assert.equal(doesSessionExist(good), false, `${kind}: the session created before the throw is gone`);
      assert.equal(lookupSession(good), undefined);
      // Retrying is the same ConfigError, not "Duplicate Session".
      assert.throws(() => new Ctor({ settings, store: 'memory', log: 'none' }), isThatConfigError, `${kind}: retry`);
      // And the id is free for a correct engine.
      const engine = retryWithGoodOnly();
      assert.ok(engine.getSession(good), `${kind}: a valid engine can use the id afterwards`);
      await engine.stop();
    }
  });

  test('SessionID arguments are validated, never silently reinterpreted', async () => {
    const port = await freePort();
    const engine = new Acceptor({ settings: SessionSettings.fromString(acceptorCfg(port)), store: 'memory', log: 'none' });
    try {
      const session = engine.getSession(ACC_ID)!;
      // sendToTarget: a bad target must not fall through to the "route by the
      // message header" form; it is a synchronous TypeError, as on the native
      // layer.
      assert.throws(() => sendToTarget(newOrder(), {} as unknown as SessionID), TypeError);
      assert.throws(() => sendToTarget(newOrder(), null as unknown as SessionID), TypeError);
      assert.throws(() => sendToTarget(newOrder(), { nativeHandle: undefined } as unknown as SessionID), TypeError);
      assert.throws(() => sendToTarget(newOrder(), session as unknown as SessionID), TypeError);
      // engine.isLoggedOn: a bad id must not degrade to the engine-wide form.
      assert.throws(() => engine.isLoggedOn({} as unknown as SessionID), TypeError);
      assert.throws(() => engine.isLoggedOn(null as unknown as SessionID), TypeError);
      assert.throws(() => engine.isLoggedOn(session as unknown as SessionID), TypeError);
      assert.equal(engine.isLoggedOn(undefined), false, 'an explicit undefined is the engine-wide form');
      assert.equal(engine.isLoggedOn(ACC_ID), false);
      // Same for the other SessionID-taking entry points.
      assert.throws(() => engine.getSession({} as unknown as SessionID), TypeError);
      assert.throws(() => lookupSession(null as unknown as SessionID), TypeError);
      assert.throws(() => doesSessionExist(session as unknown as SessionID), TypeError);
    } finally {
      await engine.stop();
    }
  });

  test('a stopped engine releases its SessionIDs for a new engine', { timeout: 20_000 }, async () => {
    const port = await freePort();
    const settings = SessionSettings.fromString(acceptorCfg(port));
    const first = new Acceptor({ settings, store: 'memory', log: 'none' });
    assert.ok(doesSessionExist(ACC_ID), 'constructing an engine registers its sessions');
    await first.stop(); // never started
    assert.equal(doesSessionExist(ACC_ID), false, 'stop() unregisters them, even if never started');

    // Had `first` still been alive this would have thrown ConfigError ("Duplicate
    // Session"); it is stop() settling -- not GC -- that releases the ids.
    const second = new Acceptor({ settings, store: 'memory', log: 'none' });
    assert.ok(second.getSession(ACC_ID));
    assert.equal(second.getSession(ACC_ID)!.isAcceptor(), true);
    await second.stop();
    assert.equal(second.getSession(ACC_ID), undefined);
  });

  test('two live engines cannot share a SessionID', { timeout: 20_000 }, async () => {
    // QuickFIX itself would silently let a second engine shadow the first in
    // its process-wide session registry; the binding rejects it up front.
    const port = await freePort();
    const settings = SessionSettings.fromString(acceptorCfg(port));
    const first = new Acceptor({ settings, store: 'memory', log: 'none' });
    try {
      assert.throws(
        () => new Acceptor({ settings: SessionSettings.fromString(acceptorCfg(port)), store: 'memory', log: 'none' }),
        (err: unknown) => {
          const e = err as { name?: string; fixErrorName?: string; message?: string };
          assert.equal(e.name, 'QuickFixError');
          assert.equal(e.fixErrorName, 'ConfigError');
          assert.match(e.message ?? '', /Duplicate Session/);
          return true;
        },
      );
      // The first engine is untouched by the rejected construction.
      assert.ok(first.getSession(ACC_ID));
      assert.ok(doesSessionExist(ACC_ID));
    } finally {
      await first.stop();
    }
    // Released by stop(): the same ids can be used again.
    const second = new Acceptor({ settings, store: 'memory', log: 'none' });
    assert.ok(second.getSession(ACC_ID));
    await second.stop();
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

  test('SessionID arguments from the other build of the package are accepted', async () => {
    // The ESM and CJS builds each have their own SessionID class, so
    // `instanceof SessionID` across them is false; what they share is the
    // native addon, whose SessionIDWrap the argument check keys on.
    assert.notStrictEqual(cjs.SessionID, SessionID, 'the two builds really are distinct classes');
    const foreign = new cjs.SessionID('FIX.4.4', 'SERVER', 'CLIENT') as unknown as SessionID;
    assert.ok(!(foreign instanceof SessionID));

    const port = await freePort();
    const engine = new Acceptor({ settings: SessionSettings.fromString(acceptorCfg(port)), store: 'memory', log: 'none' });
    try {
      // Not logged on, so the engine queues the message and reports false --
      // the point is that it is routed, not rejected with a TypeError.
      assert.equal(await sendToTarget(newOrder(), foreign), false);
      assert.equal(engine.isLoggedOn(foreign), false);
      assert.ok(engine.getSession(foreign));
      assert.ok(lookupSession(foreign));
      assert.equal(doesSessionExist(foreign), true);
      // And the other way round: this build's id into the CJS build's API.
      assert.equal(cjs.doesSessionExist(ACC_ID as unknown as Parameters<typeof cjs.doesSessionExist>[0]), true);
      await assert.rejects(
        () => sendToTarget(newOrder(), new cjs.SessionID('FIX.4.4', 'NOPE', 'NADA') as unknown as SessionID),
        isSessionNotFound,
      );
    } finally {
      await engine.stop();
    }
  });
});
