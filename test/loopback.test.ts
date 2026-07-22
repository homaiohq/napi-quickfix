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

[SESSION]
BeginString=FIX.4.4
SenderCompID=CLIENT
TargetCompID=SERVER
`;

      // The acceptor records inbound application messages via its handler.
      const received: { msgType: string; symbol: string }[] = [];

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
            received.push({ msgType: msg.getMsgType(), symbol });
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

        // Give the message time to traverse the loopback socket and be delivered
        // to the acceptor's fromApp callback.
        const deadline = Date.now() + 5000;
        while (received.length === 0 && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 50));
        }

        assert.ok(received.length >= 1, 'acceptor fromApp handler should have received a message');
        assert.equal(received[0].msgType, MsgType.NewOrderSingle, 'expected a NewOrderSingle (35=D)');
        assert.equal(received[0].symbol, 'AAPL', 'expected the sent Symbol to round-trip');
        assert.ok(
          eventMsgTypes.includes(MsgType.NewOrderSingle),
          "acceptor 'fromApp' event should also have fired with 35=D",
        );
      } finally {
        // Tear down both live sessions; awaiting stop() must not hang.
        await ini.stop().catch(() => {});
        await acc.stop().catch(() => {});
      }
    },
  );
});
