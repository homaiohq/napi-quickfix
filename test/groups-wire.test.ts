import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Socket } from 'node:net';

import {
  Initiator,
  Message,
  SessionSettings,
  SessionID,
  sendToTarget,
} from '../dist/esm/index.js';

// Wire-level check that repeating groups built with Message.addGroup survive a
// real session send. The counterparty is a raw TCP server, not a QuickFIX
// acceptor: a dictionary-less acceptor re-parses inbound messages and sorts the
// body by tag, which would hide the very ordering this test checks.

const SOH = '\x01';
const TIMEOUT_MS = 8000;

// A FIX UTCTimestamp for "now", e.g. 20261008-13:04:05.063.
function utcNow(): string {
  const iso = new Date().toISOString(); // 2026-10-08T13:04:05.063Z
  return `${iso.slice(0, 10).replaceAll('-', '')}-${iso.slice(11, 23)}`;
}

/**
 * Start a fake acceptor. It answers the initiator's Logon and records every
 * byte it receives, so tests can wait for and inspect raw outbound messages.
 */
async function fakeAcceptor(sender: string): Promise<{
  close(): Promise<void>;
  port: number;
  waitFor(msgType: string): Promise<string>;
}> {
  let received = '';
  const waiters: Array<() => void> = [];
  let seq = 1;

  const sockets = new Set<Socket>();
  const reply = (sock: Socket, msgType: string, extra: Array<[number, string | number]> = []) => {
    const msg = new Message()
      .setField(8, 'FIX.4.4')
      .setField(35, msgType)
      .setField(49, 'SERVER')
      .setField(56, sender)
      .setField(34, seq++)
      .setField(52, utcNow());
    for (const [tag, value] of extra) msg.setField(tag, value);
    sock.write(msg.toString());
  };

  const server = createServer((sock: Socket) => {
    sockets.add(sock);
    sock.on('close', () => sockets.delete(sock));
    sock.on('error', () => {});
    sock.on('data', (chunk) => {
      const text = chunk.toString('latin1');
      received += text;
      if (text.includes(`${SOH}35=A${SOH}`)) {
        reply(sock, 'A', [
          [98, 0],
          [108, 30],
        ]);
      } else if (text.includes(`${SOH}35=5${SOH}`)) {
        reply(sock, '5');
        sock.end();
      }
      waiters.splice(0).forEach((wake) => wake());
    });
  });
  // Close any connection still open so the test process can exit.
  const close = () =>
    new Promise<void>((resolve) => {
      sockets.forEach((sock) => sock.destroy());
      server.close(() => resolve());
    });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  // Resolve with the first complete message of the given type.
  const waitFor = (msgType: string) =>
    new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for 35=${msgType}; received: ${received.replaceAll(SOH, "|")}`)), TIMEOUT_MS);
      const check = () => {
        const msg = received
          .split(/(?=8=FIX)/)
          .find((m) => m.includes(`${SOH}35=${msgType}${SOH}`) && /\x0110=\d{3}\x01$/.test(m));
        if (msg) {
          clearTimeout(timer);
          resolve(msg);
        } else {
          waiters.push(check);
        }
      };
      check();
    });

  return { close, port, waitFor };
}

function initiatorSettings(port: number, sender: string): SessionSettings {
  return SessionSettings.fromString(`[DEFAULT]
ConnectionType=initiator
SocketConnectHost=127.0.0.1
SocketConnectPort=${port}
HeartBtInt=30
ReconnectInterval=1
UseDataDictionary=N
StartTime=00:00:00
EndTime=00:00:00
ResetOnLogon=Y

[SESSION]
BeginString=FIX.4.4
SenderCompID=${sender}
TargetCompID=SERVER
`);
}

function marketDataRequest(): Message {
  return new Message()
    .setField(35, 'V')
    .setField(262, 'md-1')
    .setField(263, '0')
    .addGroup(267, [[269, '0']])
    .addGroup(267, [[269, '1']])
    .addGroup(146, [
      [55, 'SEME'],
      [48, '15489453245267683896'],
      [22, '96'],
    ]);
}

// QuickFIX keeps sessions in a process-wide registry, so each test logs on
// with its own SenderCompID to keep sendToTarget off an earlier test's session.
let nextClient = 0;

async function sendAndCapture(
  handlers: ConstructorParameters<typeof Initiator>[0]['handlers'],
): Promise<string> {
  const sender = `CLIENT${++nextClient}`;
  const acceptor = await fakeAcceptor(sender);
  const ini = new Initiator({
    settings: initiatorSettings(acceptor.port, sender),
    store: 'memory',
    log: 'none',
    handlers,
  });
  try {
    const loggedOn = new Promise<void>((resolve) => ini.once('logon', () => resolve()));
    await ini.start();
    await loggedOn;
    const ok = await sendToTarget(marketDataRequest(), new SessionID('FIX.4.4', sender, 'SERVER'));
    assert.equal(ok, true);
    return (await acceptor.waitFor('V')).replaceAll(SOH, '|');
  } finally {
    await ini.stop();
    await acceptor.close();
  }
}

describe('repeating groups on the wire', () => {
  test(
    'addGroup entries reach the socket in order when no toApp handler is set',
    { timeout: TIMEOUT_MS + 4000 },
    async () => {
      const wire = await sendAndCapture(undefined);
      assert.match(wire, /\|146=1\|55=SEME\|48=15489453245267683896\|22=96\|/);
      assert.match(wire, /\|267=2\|269=0\|269=1\|/);
    },
  );

  test(
    'a toApp handler that only reads the message leaves groups intact',
    { timeout: TIMEOUT_MS + 4000 },
    async () => {
      const wire = await sendAndCapture({
        toApp(msg) {
          msg.getMsgType();
        },
      });
      assert.match(wire, /\|146=1\|55=SEME\|48=15489453245267683896\|22=96\|/);
    },
  );

  test(
    'a toApp handler that edits the message still reaches the wire',
    { timeout: TIMEOUT_MS + 4000 },
    async () => {
      const wire = await sendAndCapture({
        toApp(msg) {
          msg.setField(1, 'ACCT-1');
        },
      });
      assert.match(wire, /\|1=ACCT-1\|/);
    },
  );
});
