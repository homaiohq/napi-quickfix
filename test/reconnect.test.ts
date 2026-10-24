import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

import {
  Acceptor,
  Initiator,
  FixReject,
  MapMessageStore,
  SessionSettings,
  SessionID,
  createMessage,
  sendToTarget,
  FIELD,
  MsgType,
  type Message,
  type MessageStoreAdapter,
} from '../dist/esm/index.js';
import { freePort, waitUntil } from './helpers.js';

// Two sessions on one SocketInitiator. Session B is disconnected while its
// inbound data is handled (Session::disconnect() -> SocketConnection::disconnect()
// -> SocketMonitor::drop(fd), which queues onDisconnect(fd) for the NEXT
// block()), and in the onTimeout() that SocketInitiator::onStart() runs right
// after that block(), session A's reconnect is due. Upstream, drop() closed the
// fd at once, so A's connect() got B's fd number and filed it in
// m_pendingConnections; the queued onDisconnect(fd) then tore A's new
// connection down and never called setDisconnected(B): B stayed in
// Initiator::m_connected, which connect() never redials, so B was never
// reconnected and its sends were stored, never delivered. The build defers
// the close until block() has delivered the drop (CMakeLists.txt).
//
// The stall that makes A's reconnect due inside B's pass (> ReconnectInterval
// on the network thread) comes from a slow handler in the first test, with
// QuickFIX's own MemoryStore on both sides: the bug is upstream. The second
// test gets the same stall and disconnect from a JS store whose setSeqNums
// times out, the way a MessageStoreAdapter hits it.

// B must sort before A: Initiator::connect() dials std::set<SessionID> order, so B gets
// the lower fd, and socket() returns the lowest free fd -- B's, once both are closed.
const A = new SessionID('FIX.4.4', 'CLIENT_R', 'SERVER'); // reconnecting
const B = new SessionID('FIX.4.4', 'CLIENT_D', 'SERVER'); // disconnected in onData
const ACC_A = new SessionID('FIX.4.4', 'SERVER', 'CLIENT_R');
const ACC_B = new SessionID('FIX.4.4', 'SERVER', 'CLIENT_D');
const STALL_MS = 1500; // > ReconnectInterval=1

function cfg(kind: 'acceptor' | 'initiator', port: number): SessionSettings {
  const conn = kind === 'acceptor' ? `SocketAcceptPort=${port}` : `SocketConnectHost=127.0.0.1\nSocketConnectPort=${port}`;
  const sessions = (kind === 'acceptor' ? [ACC_B, ACC_A] : [B, A])
    .map((s) => `[SESSION]\nBeginString=FIX.4.4\nSenderCompID=${s.senderCompID}\nTargetCompID=${s.targetCompID}\n`)
    .join('\n');
  return SessionSettings.fromString(`[DEFAULT]
ConnectionType=${kind}
${conn}
HeartBtInt=30
ReconnectInterval=1
LogonTimeout=5
UseDataDictionary=N
StartTime=00:00:00
EndTime=00:00:00
ResetOnLogon=Y

${sessions}`);
}

const allUp = (acc: Acceptor, ini: Initiator) =>
  ini.isLoggedOn(A) && ini.isLoggedOn(B) && acc.isLoggedOn(ACC_A) && acc.isLoggedOn(ACC_B);

/** Log A out from the acceptor (A's reconnect becomes due within 1 s), then let it back in. */
async function dropA(acc: Acceptor, ini: Initiator) {
  await acc.getSession(ACC_A)!.logout('cycle');
  assert.ok(await waitUntil(() => !ini.isLoggedOn(A), 5000), 'A logged out');
  void acc.getSession(ACC_A)!.logon(); // an acceptor-side logout() disables the session
}

async function run(ini: Initiator, acc: Acceptor, trigger: () => Promise<void>) {
  try {
    await acc.start();
    await ini.start();
    assert.ok(await waitUntil(() => allUp(acc, ini), 10_000), 'both sessions up');
    await sleep(300);
    await dropA(acc, ini);
    await trigger(); // B's network-thread stall + disconnect, while A's reconnect is due
    await sleep(STALL_MS + 200);
    const back = await waitUntil(() => ini.isLoggedOn(B) && acc.isLoggedOn(ACC_B), 8000);
    assert.ok(back, 'B reconnected and logged on again after its disconnect');
    assert.ok(await waitUntil(() => ini.isLoggedOn(A), 8000), 'A is back too');
  } finally {
    await ini.stop(true).catch(() => {});
    await acc.stop(true).catch(() => {});
  }
}

// Both tests reproduce through POSIX's lowest-free-fd rule; on Windows, where
// Winsock does not hand out the lowest free handle, they pass either way.
const opts = { timeout: 40_000 };

describe('SocketInitiator: a disconnect while handling data, as another session reconnects', () => {
  test('stock MemoryStore, slow fromAdmin then RejectLogon on B: B reconnects', opts, async () => {
    const port = await freePort();
    let armed = false;
    const acc = await Acceptor.create({ settings: cfg('acceptor', port), store: 'memory', log: 'none' });
    const ini = await Initiator.create({
      settings: cfg('initiator', port),
      store: 'memory',
      log: 'none',
      handlers: {
        fromAdmin(msg: Message, id: SessionID) {
          if (armed && id.senderCompID === B.senderCompID && msg.getMsgType() === MsgType.TestRequest) {
            armed = false;
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, STALL_MS); // a slow handler
            throw new FixReject('RejectLogon', 'slow handler, then reject'); // Session.cpp catch (RejectLogon&): disconnect()
          }
        },
      },
    });
    await run(ini, acc, async () => {
      armed = true;
      await sendToTarget(createMessage().setField(FIELD.MsgType, MsgType.TestRequest).setField(FIELD.TestReqID, 't'), ACC_B);
    });
  });

  test('JS store, an inbound setSeqNums on B that times out: B reconnects', opts, async () => {
    const port = await freePort();
    const map = new MapMessageStore();
    let hangB = false;
    let release: (() => void) | undefined;
    const store: MessageStoreAdapter = {
      load: (id) => map.load(id),
      create: (id, s) => map.create(id, s),
      setSeqNums: async (id, a, b) => {
        if (hangB && id.senderCompID === B.senderCompID) {
          hangB = false;
          await new Promise<void>((r) => (release = r));
        }
        return map.setSeqNums(id, a, b);
      },
      setMessage: (id, n, m) => map.setMessage(id, n, m),
      getMessages: (id, b, e) => map.getMessages(id, b, e),
      reset: (id, s) => map.reset(id, s),
    };
    const acc = await Acceptor.create({ settings: cfg('acceptor', port), store: 'memory', log: 'none' });
    const ini = await Initiator.create({ settings: cfg('initiator', port), store, storeTimeoutMs: STALL_MS, log: 'none' });
    await run(ini, acc, async () => {
      hangB = true;
      await sendToTarget(createMessage().setField(FIELD.MsgType, MsgType.TestRequest).setField(FIELD.TestReqID, 't'), ACC_B);
      setTimeout(() => release?.(), STALL_MS + 100).unref();
    });
  });
});
