import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, connect, type Socket } from 'node:net';
import { fileURLToPath } from 'node:url';

import {
  Acceptor,
  Initiator,
  Group,
  SessionSettings,
  SessionID,
  createMessage,
  sendToTarget,
  FIELD,
  MsgType,
  type Message,
} from '../dist/esm/index.js';

// Repeating groups and body field order through a live session.
//
// Same in-process Acceptor + Initiator setup as loopback.test.ts, with two
// differences: both sides load a data dictionary (so inbound groups are parsed
// as groups), and the initiator's bytes reach the acceptor through a recording
// TCP proxy, so the test can assert on the exact wire order. The parsed message
// on the acceptor side cannot show that: QuickFIX sorts a parsed body.
//
// The initiator registers a toApp handler that edits the outbound order. That
// exercises the bridge's mutate path, which used to re-parse the message from
// a string without a dictionary and flatten every group.

const SOH = '\x01';
const HANDSHAKE_TIMEOUT_MS = 8000;
const DICT_PATH = fileURLToPath(new URL('./fixtures/fix44-groups.xml', import.meta.url));

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

/** A TCP proxy that records everything the client sends to the upstream. */
function recordingProxy(upstreamPort: number): Promise<{
  port: number;
  clientBytes: Buffer[];
  close(): Promise<void>;
}> {
  const clientBytes: Buffer[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((client) => {
    const upstream = connect(upstreamPort, '127.0.0.1');
    sockets.add(client).add(upstream);
    client.on('data', (chunk) => {
      clientBytes.push(Buffer.from(chunk));
      upstream.write(chunk);
    });
    upstream.on('data', (chunk) => client.write(chunk));
    const drop = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on('close', drop).on('error', drop);
    upstream.on('close', drop).on('error', drop);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        port,
        clientBytes,
        close: () =>
          new Promise((done) => {
            for (const s of sockets) s.destroy();
            server.close(() => done());
          }),
      });
    });
  });
}

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

describe('loopback integration: repeating groups and field order', () => {
  test(
    'a NewOrderSingle with nested party groups crosses toApp and arrives in the explicit order',
    { timeout: HANDSHAKE_TIMEOUT_MS + 6000 },
    async () => {
      const acceptorPort = await freePort();
      const proxy = await recordingProxy(acceptorPort);

      const acceptorCfg = `[DEFAULT]
ConnectionType=acceptor
SocketAcceptPort=${acceptorPort}
UseDataDictionary=Y
DataDictionary=${DICT_PATH}
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
SocketConnectPort=${proxy.port}
HeartBtInt=2
ReconnectInterval=1
UseDataDictionary=Y
DataDictionary=${DICT_PATH}
StartTime=00:00:00
EndTime=00:00:00
ResetOnLogon=Y

[SESSION]
BeginString=FIX.4.4
SenderCompID=CLIENT
TargetCompID=SERVER
`;

      // What the acceptor's fromApp handler observed on the parsed message.
      const received: {
        parties: number;
        first: { id: string; role: string; source: string; subs: number; subId: string; subDelim: number };
        second: { id: string; role: string };
        text: string;
      }[] = [];

      const acc = new Acceptor({
        settings: SessionSettings.fromString(acceptorCfg),
        store: 'memory',
        log: 'none',
        handlers: {
          fromApp(msg: Message) {
            const first = msg.getGroup(1, FIELD.NoPartyIDs);
            const second = msg.getGroup(2, FIELD.NoPartyIDs);
            received.push({
              parties: msg.groupCount(FIELD.NoPartyIDs),
              first: {
                id: first.getField(FIELD.PartyID),
                role: first.getField(FIELD.PartyRole),
                source: first.getField(FIELD.PartyIDSource),
                subs: first.groupCount(FIELD.NoPartySubIDs),
                subId: first.getGroup(1, FIELD.NoPartySubIDs).getField(FIELD.PartySubID),
                // A nested instance read through the bridge's copy still
                // reports its delimiter.
                subDelim: first.getGroup(1, FIELD.NoPartySubIDs).delimiterTag,
              },
              second: { id: second.getField(FIELD.PartyID), role: second.getField(FIELD.PartyRole) },
              text: msg.hasField(FIELD.Text) ? msg.getField(FIELD.Text) : '',
            });
          },
        },
      });

      // The initiator edits every outbound application message: the bridge
      // must copy the edited message back WITHOUT losing groups or order.
      const toAppSeen: number[] = [];
      const ini = new Initiator({
        settings: SessionSettings.fromString(initiatorCfg),
        store: 'memory',
        log: 'none',
        handlers: {
          toApp(msg: Message) {
            toAppSeen.push(msg.groupCount(FIELD.NoPartyIDs));
            msg.setField(FIELD.Text, 'edited-in-toApp');
          },
        },
      });

      try {
        const accLogon = waitForEvent(acc, 'logon', 'acceptor logon', HANDSHAKE_TIMEOUT_MS);
        const iniLogon = waitForEvent(ini, 'logon', 'initiator logon', HANDSHAKE_TIMEOUT_MS);
        await acc.start();
        await ini.start();
        await Promise.all([accLogon, iniLogon]);

        // Explicit orders, deliberately not numeric and (for the party group)
        // not the dictionary order 448, 447, 452. The toApp edit adds tag 58,
        // which is not listed and so follows the listed tags.
        const BODY_ORDER = [
          FIELD.ClOrdID, FIELD.Symbol, FIELD.Side, FIELD.OrderQty, FIELD.OrdType,
          FIELD.TransactTime, FIELD.NoPartyIDs,
        ];
        const PARTY_ORDER = [FIELD.PartyID, FIELD.PartyRole, FIELD.PartyIDSource, FIELD.NoPartySubIDs];
        const order = createMessage(undefined, { order: BODY_ORDER })
          .setField(FIELD.MsgType, MsgType.NewOrderSingle)
          .setField(FIELD.ClOrdID, 'ord-1')
          .setField(FIELD.Symbol, 'AAPL')
          .setField(FIELD.Side, '1')
          .setField(FIELD.OrderQty, 100)
          .setField(FIELD.OrdType, '2')
          .setField(FIELD.TransactTime, '20260101-00:00:00');

        const trader = new Group(FIELD.NoPartyIDs, FIELD.PartyID, PARTY_ORDER)
          .setField(FIELD.PartyID, 'TRADER-1')
          .setField(FIELD.PartyRole, 11)
          .setField(FIELD.PartyIDSource, 'D')
          .addGroup(
            new Group(FIELD.NoPartySubIDs, FIELD.PartySubID)
              .setField(FIELD.PartySubID, 'desk-7')
              .setField(FIELD.PartySubIDType, 1),
          );
        const firm = new Group(FIELD.NoPartyIDs, FIELD.PartyID, PARTY_ORDER)
          .setField(FIELD.PartyID, 'FIRM-1')
          .setField(FIELD.PartyRole, 1);
        order.addGroup(trader).addGroup(firm);

        const accepted = await sendToTarget(order, new SessionID('FIX.4.4', 'CLIENT', 'SERVER'));
        assert.equal(accepted, true);

        const deadline = Date.now() + 5000;
        while (received.length < 1 && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 50));
        }

        assert.equal(toAppSeen.length, 1, 'initiator toApp should have run once');
        assert.equal(toAppSeen[0], 2, 'toApp must see the outbound message with its groups');

        assert.equal(received.length, 1, 'acceptor fromApp should have received the order');
        assert.deepEqual(received[0], {
          parties: 2,
          first: { id: 'TRADER-1', role: '11', source: 'D', subs: 1, subId: 'desk-7', subDelim: FIELD.PartySubID },
          second: { id: 'FIRM-1', role: '1' },
          text: 'edited-in-toApp',
        });

        // The exact bytes the initiator put on the wire.
        const stream = Buffer.concat(proxy.clientBytes).toString('latin1');
        const bodyPattern = new RegExp(
          `${SOH}35=D${SOH}(?:\\d+=[^${SOH}]*${SOH})*?` + // header fields (34, 49, 52, 56)
            `11=ord-1${SOH}55=AAPL${SOH}54=1${SOH}38=100${SOH}40=2${SOH}60=20260101-00:00:00${SOH}` +
            `453=2${SOH}` +
            `448=TRADER-1${SOH}452=11${SOH}447=D${SOH}802=1${SOH}523=desk-7${SOH}803=1${SOH}` +
            `448=FIRM-1${SOH}452=1${SOH}` +
            `58=edited-in-toApp${SOH}10=\\d{3}${SOH}`,
        );
        assert.match(stream, bodyPattern, 'wire bytes must follow the explicit orders, keep groups and the toApp edit');
      } finally {
        await ini.stop().catch(() => {});
        await acc.stop().catch(() => {});
        await proxy.close();
      }
    },
  );
});
