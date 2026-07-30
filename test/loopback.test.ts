import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';

import {
  Acceptor,
  Initiator,
  SessionSettings,
  SessionID,
  createMessage,
  sendToTarget,
  FIELD,
  MsgType,
  Side,
} from '../dist/esm/index.js';

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
    async () => {
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
        assert.ok(
          microTails.some((tail) => /[1-9]/.test(tail)),
          `every SendingTime had a zero microsecond tail (${sendingTimes.join(', ')}) -- ` +
            'QuickFIX is compiled against ftime() rather than gettimeofday(), so the ' +
            'clock is only millisecond-accurate; check the HAVE_GETTIMEOFDAY ' +
            'definition in CMakeLists.txt',
        );
      } finally {
        // Tear down both live sessions; awaiting stop() must not hang.
        await ini.stop().catch(() => {});
        await acc.stop().catch(() => {});
      }
    },
  );
});
