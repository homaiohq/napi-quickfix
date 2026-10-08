import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';

import {
  Acceptor,
  Initiator,
  Group,
  Message,
  SessionSettings,
  SessionID,
  createMessage,
  sendToTarget,
  FIELD,
  MsgType,
  Side,
} from '../dist/esm/index.js';
import { FIX44_MINI_PATH } from './fixtures/dictionary.js';

// End-to-end loopback integration test — fully IN-PROCESS.
//
// An Acceptor and Initiator connect over a localhost port and perform a real FIX
// logon handshake. Once both sides are logged on, the MAIN thread sends a
// NewOrderSingle from the initiator via `sendToTarget` and we assert the
// acceptor's `fromApp` callback (and `'fromApp'` event) fire with MsgType 'D'.
//
// The engine's blocking ops (start/stop/sendToTarget) are async (return Promises
// resolved off the main thread), so this round-trip — which previously deadlocked
// when driven synchronously from the main thread — now works with both engines in
// the same process. Teardown awaits stop() on both sides and the test process
// exits cleanly.

const HANDSHAKE_TIMEOUT_MS = 8000;

// Grab a free ephemeral loopback port from the OS to avoid collisions in CI.
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/** A promise that resolves when `emitter` fires `event`, or rejects on timeout. */
function waitForEvent(
  emitter: Acceptor | Initiator,
  event: 'logon',
  label: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), timeoutMs);
    emitter.once(event, () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

describe('loopback integration (in-process)', () => {
  test(
    'Acceptor + Initiator log on and a NewOrderSingle round-trips (send -> fromApp)',
    { timeout: HANDSHAKE_TIMEOUT_MS + 6000 },
    async (t) => {
      const port = await freePort();

      const acceptorCfg = `[DEFAULT]
ConnectionType=acceptor
SocketAcceptPort=${port}
UseDataDictionary=N
StartTime=00:00:00
EndTime=00:00:00
ResetOnLogon=Y
# Microsecond SendingTime. Also the lever for the clock-parity assertion at the
# end of this test -- at the default precision of 3 the assertion cannot tell
# gettimeofday from ftime.
TimestampPrecision=6

[SESSION]
BeginString=FIX.4.4
SenderCompID=SERVER
TargetCompID=CLIENT
`;

      const initiatorCfg = `[DEFAULT]
ConnectionType=initiator
SocketConnectHost=127.0.0.1
SocketConnectPort=${port}
HeartBtInt=2
ReconnectInterval=1
UseDataDictionary=N
StartTime=00:00:00
EndTime=00:00:00
ResetOnLogon=Y
# Microsecond SendingTime. Also the lever for the clock-parity assertion at the
# end of this test -- at the default precision of 3 the assertion cannot tell
# gettimeofday from ftime.
TimestampPrecision=6

[SESSION]
BeginString=FIX.4.4
SenderCompID=CLIENT
TargetCompID=SERVER
`;

      // The acceptor records inbound application messages via its handler.
      // sendingTime (header tag 52) is captured to guard the subsecond-clock fix
      // in CMakeLists.txt — see the assertions at the end of this test.
      const received: { msgType: string; symbol: string; sendingTime: string }[] = [];

      const acc = new Acceptor({
        settings: SessionSettings.fromString(acceptorCfg),
        store: 'memory',
        log: 'none',
        handlers: {
          fromApp(msg) {
            let symbol = '?';
            try {
              symbol = msg.getField(FIELD.Symbol ?? 55);
            } catch {
              symbol = '?';
            }
            let sendingTime = '';
            try {
              sendingTime = msg.getHeaderField(FIELD.SendingTime ?? 52);
            } catch {
              sendingTime = '';
            }
            received.push({ msgType: msg.getMsgType(), symbol, sendingTime });
          },
        },
      });

      const ini = new Initiator({
        settings: SessionSettings.fromString(initiatorCfg),
        store: 'memory',
        log: 'none',
      });

      // Also observe the acceptor's 'fromApp' EVENT independently of the handler.
      const eventMsgTypes: string[] = [];
      acc.on('fromApp', (msg) => eventMsgTypes.push(msg.getMsgType()));

      try {
        const accLogon = waitForEvent(acc, 'logon', 'acceptor logon', HANDSHAKE_TIMEOUT_MS);
        const iniLogon = waitForEvent(ini, 'logon', 'initiator logon', HANDSHAKE_TIMEOUT_MS);

        await acc.start();
        await ini.start();

        // Wait for the full logon handshake on both sides.
        await Promise.all([accLogon, iniLogon]);
        assert.equal(acc.isLoggedOn(), true, 'acceptor should be logged on');
        assert.equal(ini.isLoggedOn(), true, 'initiator should be logged on');

        // From the MAIN thread, send an application message from CLIENT -> SERVER.
        // This is the round-trip that previously deadlocked.
        const order = createMessage()
          .setField(FIELD.MsgType, MsgType.NewOrderSingle)
          .setField(FIELD.Symbol ?? 55, 'AAPL')
          .setField(FIELD.Side ?? 54, Side.Buy)
          .setField(FIELD.OrderQty ?? 38, 100);

        const iniSession = new SessionID('FIX.4.4', 'CLIENT', 'SERVER');
        const accepted = await sendToTarget(order, iniSession);
        assert.equal(accepted, true, 'sendToTarget should report the message was accepted');

        // Two more, so the SendingTime assertions below have several samples to
        // look at (see the comment there for why one is not enough).
        const EXTRA_ORDERS = 2;
        for (let i = 0; i < EXTRA_ORDERS; i++) {
          await sendToTarget(
            createMessage()
              .setField(FIELD.MsgType, MsgType.NewOrderSingle)
              .setField(FIELD.Symbol ?? 55, 'AAPL')
              .setField(FIELD.Side ?? 54, Side.Buy)
              .setField(FIELD.OrderQty ?? 38, 100),
            iniSession,
          );
        }

        // Give the messages time to traverse the loopback socket and be delivered
        // to the acceptor's fromApp callback.
        const expected = 1 + EXTRA_ORDERS;
        const deadline = Date.now() + 5000;
        while (received.length < expected && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 50));
        }

        assert.ok(received.length >= 1, 'acceptor fromApp handler should have received a message');
        assert.equal(received[0].msgType, MsgType.NewOrderSingle, 'expected a NewOrderSingle (35=D)');
        assert.equal(received[0].symbol, 'AAPL', 'expected the sent Symbol to round-trip');
        assert.ok(
          eventMsgTypes.includes(MsgType.NewOrderSingle),
          "acceptor 'fromApp' event should also have fired with 35=D",
        );

        // --- SendingTime clock parity across libc -------------------------------
        //
        // Guards the HAVE_GETTIMEOFDAY definition in CMakeLists.txt (see the long
        // comment there). QuickFIX's nowUtc() has two viable branches:
        //   gettimeofday -> real microseconds
        //   ftime        -> milliseconds, zero-padded to the requested precision
        // glibc always takes the first; musl takes the second unless we force
        // HAVE_GETTIMEOFDAY. With TimestampPrecision=6 above, the difference is
        // observable: the ftime path emits .NNN000, always zero in digits 4-6.
        //
        // This is a POSIX-only invariant. MSVC has no gettimeofday() at all, and
        // upstream QuickFIX propagates HAVE_FTIME on Windows (its src/C++/CMakeLists.txt
        // probes for it), so a Windows build is millisecond-capped by design and there
        // is nothing for us to force on. The precision-6 *format* is still checked
        // everywhere; only the microsecond-tail check below is POSIX-gated.
        const sendingTimes = received.slice(0, expected).map((r) => r.sendingTime);
        for (const st of sendingTimes) {
          assert.match(
            st,
            /^\d{8}-\d{2}:\d{2}:\d{2}\.\d{6}$/,
            `expected a 6-digit subsecond SendingTime, got ${JSON.stringify(st)}`,
          );
        }
        // A genuine microsecond clock can land on x000 occasionally, so require only
        // that ONE sample has a non-zero microsecond tail; the ftime path has all
        // three digits zero every single time. False-failure odds ~(1/1000)^3.
        const microTails = sendingTimes.map((st) => st.slice(-3));
        if (process.platform === 'win32') {
          t.diagnostic(
            'SendingTime microsecond-tail check skipped: Windows QuickFIX is ftime()-based ' +
              `(millisecond resolution) -- got ${sendingTimes.join(', ')}`,
          );
        } else {
          assert.ok(
            microTails.some((tail) => /[1-9]/.test(tail)),
            `every SendingTime had a zero microsecond tail (${sendingTimes.join(', ')}) -- ` +
              'QuickFIX is compiled against ftime() rather than gettimeofday(), so the ' +
              'clock is only millisecond-accurate; check the HAVE_GETTIMEOFDAY ' +
              'definition in CMakeLists.txt',
          );
        }
      } finally {
        // Tear down both live sessions; awaiting stop() must not hang.
        await ini.stop().catch(() => {});
        await acc.stop().catch(() => {});
      }
    },
  );
});

// Repeating groups across the engine. Both sessions use a data dictionary, so
// QuickFIX parses inbound messages structurally and the bridge must hand the
// structured message (not a flat re-parse of its wire string) to the handlers.
//
// The CompIDs differ from the test above on purpose: QuickFIX keys its
// process-wide session registry by SessionID, and the engines of the previous
// test stay registered until they are garbage-collected, so reusing
// CLIENT/SERVER here would route sendToTarget to the stale session.
describe('loopback integration: repeating groups', () => {
  function party(id: string, role: number): Group {
    return new Group(FIELD.NoPartyIDs, FIELD.PartyID)
      .setField(FIELD.PartyID, id)
      .setField(FIELD.PartyIDSource, 'D')
      .setField(FIELD.PartyRole, role);
  }

  test(
    'a NewOrderSingle with NoPartyIDs round-trips through the engine with its groups intact',
    { timeout: HANDSHAKE_TIMEOUT_MS + 6000 },
    async () => {
      const port = await freePort();

      const common = `UseDataDictionary=Y
DataDictionary=${FIX44_MINI_PATH}
StartTime=00:00:00
EndTime=00:00:00
ResetOnLogon=Y
`;
      const acceptorCfg = `[DEFAULT]
ConnectionType=acceptor
SocketAcceptPort=${port}
${common}
[SESSION]
BeginString=FIX.4.4
SenderCompID=GRP-SERVER
TargetCompID=GRP-CLIENT
`;
      const initiatorCfg = `[DEFAULT]
ConnectionType=initiator
SocketConnectHost=127.0.0.1
SocketConnectPort=${port}
HeartBtInt=2
ReconnectInterval=1
${common}
[SESSION]
BeginString=FIX.4.4
SenderCompID=GRP-CLIENT
TargetCompID=GRP-SERVER
`;

      interface Seen {
        partyCount: number;
        parties: { id: string; role: string; subIDs: string[] }[];
        text: string | undefined;
        raw: string;
      }
      const snapshot = (msg: Message): Seen => {
        const partyCount = msg.groupCount(FIELD.NoPartyIDs);
        const parties: Seen['parties'] = [];
        for (let i = 1; i <= partyCount; i++) {
          const p = msg.getGroup(i, FIELD.NoPartyIDs);
          const subIDs: string[] = [];
          for (let j = 1; j <= p.groupCount(FIELD.NoPartySubIDs); j++) {
            subIDs.push(p.getGroup(j, FIELD.NoPartySubIDs).getField(FIELD.PartySubID));
          }
          parties.push({ id: p.getField(FIELD.PartyID), role: p.getField(FIELD.PartyRole), subIDs });
        }
        return { partyCount, parties, text: msg.getFieldIfSet(FIELD.Text), raw: msg.toString() };
      };

      // The acceptor's handler and event see the inbound message with groups.
      const received: Seen[] = [];
      const acc = new Acceptor({
        settings: SessionSettings.fromString(acceptorCfg),
        store: 'memory',
        log: 'none',
        handlers: {
          fromApp(msg) {
            received.push(snapshot(msg));
          },
        },
      });
      const eventSeen: Seen[] = [];
      acc.on('fromApp', (msg) => eventSeen.push(snapshot(msg)));

      // The initiator's toApp sees the OUTBOUND message with groups and may
      // mutate it: a party added here and a plain field set here must both
      // reach the acceptor.
      const outbound: Seen[] = [];
      const ini = new Initiator({
        settings: SessionSettings.fromString(initiatorCfg),
        store: 'memory',
        log: 'none',
        handlers: {
          toApp(msg) {
            outbound.push(snapshot(msg));
            msg.addGroup(party('ADDED-IN-TOAPP', 3)).setField(FIELD.Text, 'edited-in-toApp');
          },
        },
      });

      try {
        const accLogon = waitForEvent(acc, 'logon', 'acceptor logon', HANDSHAKE_TIMEOUT_MS);
        const iniLogon = waitForEvent(ini, 'logon', 'initiator logon', HANDSHAKE_TIMEOUT_MS);
        await acc.start();
        await ini.start();
        await Promise.all([accLogon, iniLogon]);

        const order = createMessage()
          .setField(FIELD.MsgType, MsgType.NewOrderSingle)
          .setField(FIELD.ClOrdID, 'grp-1')
          .setField(FIELD.Symbol, 'AAPL')
          .setField(FIELD.Side, Side.Buy)
          .setField(FIELD.TransactTime, '20260101-00:00:00')
          .setField(FIELD.OrdType, '1')
          .addGroup(party('TRADER-1', 11))
          .addGroup(
            party('FIRM-7', 1).addGroup(
              new Group(FIELD.NoPartySubIDs, FIELD.PartySubID)
                .setField(FIELD.PartySubID, 'desk-7')
                .setField(FIELD.PartySubIDType, 2),
            ),
          );

        const accepted = await sendToTarget(order, new SessionID('FIX.4.4', 'GRP-CLIENT', 'GRP-SERVER'));
        assert.equal(accepted, true);

        const deadline = Date.now() + 5000;
        while (received.length < 1 && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 50));
        }
        assert.equal(received.length, 1, 'acceptor fromApp should have received the order');

        // Outbound: toApp saw the two parties we built, structurally, and no
        // Text yet.
        assert.equal(outbound.length, 1);
        assert.equal(outbound[0].partyCount, 2);
        assert.deepEqual(
          outbound[0].parties.map((p) => p.id),
          ['TRADER-1', 'FIRM-7'],
        );
        assert.equal(outbound[0].text, undefined);

        // Inbound: the acceptor sees all three parties (two built + one added
        // in toApp), each with its fields and the nested sub-ID group.
        const seen = received[0];
        assert.equal(seen.partyCount, 3);
        assert.equal(seen.text, 'edited-in-toApp', 'the plain-field edit in toApp reached the wire too');
        assert.deepEqual(seen.parties, [
          { id: 'TRADER-1', role: '11', subIDs: [] },
          { id: 'FIRM-7', role: '1', subIDs: ['desk-7'] },
          { id: 'ADDED-IN-TOAPP', role: '3', subIDs: [] },
        ]);
        assert.ok(
          seen.raw.includes(
            '\x01453=3\x01448=TRADER-1\x01447=D\x01452=11\x01448=FIRM-7\x01447=D\x01452=1\x01802=1\x01523=desk-7\x01803=2\x01448=ADDED-IN-TOAPP\x01447=D\x01452=3\x01',
          ),
          `expected the group block contiguous on the wire, got ${seen.raw.replace(/\x01/g, '|')}`,
        );
        // The observe-only event got the same structured message.
        assert.deepEqual(eventSeen, received);
      } finally {
        await ini.stop().catch(() => {});
        await acc.stop().catch(() => {});
      }
    },
  );
});
