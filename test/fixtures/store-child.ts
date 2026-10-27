// Child-process scenarios for store.test.ts: each must END ON ITS OWN (no
// process.exit), so the parent can assert the process exits, and how fast.
//
//   node --import tsx test/fixtures/store-child.ts <mode>
//
// Prints `result <json>` on stdout for the parent to parse.
import { createServer } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

import {
  Acceptor,
  Initiator,
  SessionID,
  SessionSettings,
  createMessage,
  fixReject,
  sendToTarget,
  FIELD,
  MsgType,
  Side,
} from '../../dist/esm/index.js';
import { acceptorCfg, initiatorCfg } from '../helpers.js';
import { ControlledStore, utcClock, withSettings } from '../store-adapters.js';

const INI_ID = new SessionID('FIX.4.4', 'CLIENT', 'SERVER');
const ACC_ID = new SessionID('FIX.4.4', 'SERVER', 'CLIENT');
const TIMEOUT_MS = 500;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(() => resolve(typeof addr === 'object' && addr ? addr.port : 0));
    });
  });
}

function order(tag: string) {
  return createMessage()
    .setField(FIELD.MsgType, MsgType.NewOrderSingle)
    .setField(FIELD.ClOrdID, tag)
    .setField(FIELD.Symbol, 'CHLD')
    .setField(FIELD.Side, Side.Buy)
    .setField(FIELD.OrderQty, 1);
}

async function loggedOnPair(iniSettings: Record<string, string> = {}) {
  const port = await freePort();
  const store = new ControlledStore();
  const acc = await Acceptor.create({ settings: SessionSettings.fromString(acceptorCfg(port)), store: 'memory', log: 'none' });
  const ini = await Initiator.create({
    settings: SessionSettings.fromString(withSettings(initiatorCfg(port), iniSettings)),
    store,
    storeTimeoutMs: TIMEOUT_MS,
    log: 'none',
  });
  const logon = new Promise<void>((r) => ini.once('logon', () => r()));
  await acc.start();
  await ini.start();
  await logon;
  return { acc, ini, store };
}

// Wait (up to 2 s) until the adapter has been called: a send reaches the
// store after a libuv worker picks it up, which a fixed sleep cannot bound on
// a loaded or sanitized run. A 'hang' call stays counted in `inflight` after
// its timeout released the thread, so this cannot miss it.
async function parked(store: ControlledStore): Promise<number> {
  for (let i = 0; i < 100 && store.inflight === 0; i++) await sleep(20);
  return store.inflight;
}

const mode = process.argv[2];
const t0 = Date.now();

if (mode === 'graceful-stop-hang' || mode === 'graceful-stop-dead') {
  // A store call that never settles must not stall a graceful stop() beyond
  // the per-call timeout plus QuickFIX's own 10 s logout grace, nor keep the
  // process alive afterwards. The Logout the stop sends cannot be persisted:
  // 'dead': EVERY call hangs; 'hang': only the first, but the Logout takes its
  // seqnum, refused while the hung setMessage is unsettled.
  const { acc, ini, store } = await loggedOnPair();
  let hung = 0;
  store.set('setMessage', 'hang', () => mode === 'graceful-stop-dead' || hung++ === 0);
  void sendToTarget(order('park'), INI_ID).catch(() => {});
  const parkedCalls = await parked(store);
  const stopStart = Date.now();
  await ini.stop();
  const stopMs = Date.now() - stopStart;
  await acc.stop();
  console.log(`result ${JSON.stringify({ parked: parkedCalls, stopMs })}`);
} else if (mode === 'gc-no-stop-parked') {
  // Engines dropped without stop() (unref'd) while a store call is parked:
  // the timeout releases the parked worker, the loop drains, the environment
  // cleanup hook tears the engines down and the process exits.
  const { acc, ini, store } = await loggedOnPair();
  acc.unref();
  ini.unref();
  store.set('setMessage', 'hang');
  void sendToTarget(order('park'), INI_ID).catch(() => {});
  console.log(`result ${JSON.stringify({ parked: await parked(store) })}`);
  // Fall off the end: no stop(), no process.exit().
} else if (mode === 'force-stop-reset') {
  // ResetOnDisconnect=Y: disconnect() runs the store's reset() inside
  // QuickFIX's own catch(IOException&) handler. A force stop aborts that
  // parked reset; the store must swallow it rather than let IOException
  // escape (std::terminate, exit 134, observed in the spike).
  const { acc, ini, store } = await loggedOnPair({ ResetOnDisconnect: 'Y' });
  const errors: string[] = [];
  ini.on('storeError', (_id, method, err, poisoned) => errors.push(`${method}:${poisoned}:${err.message}`));
  store.set('reset', 'hang');
  // disconnect() fires onLogout BEFORE it runs the store's reset(): wait for
  // the event, then for the reset to be parked.
  const loggedOut = new Promise<void>((r) => ini.once('logout', () => r()));
  void ini.getSession(INI_ID)!.logout('bye');
  await loggedOut;
  const parkedReset = await parked(store);
  await ini.stop(true);
  await acc.stop(true);
  console.log(`result ${JSON.stringify({ parkedReset, errors })}`);
} else if (mode === 'reject-logon-poisoned') {
  // An acceptor whose database is down (ResetOnLogon=Y: the Logon's reset()
  // poisons, every retry of it fails) and a fromAdmin that rejects the Logon.
  // QuickFIX's catch (RejectLogon&) runs generateLogout(), whose fill()
  // reads the sender seqnum outside any guard: an IOException there escaped
  // the network thread (std::terminate, exit 134).
  const port = await freePort();
  const store = new ControlledStore();
  let rejected = 0;
  const acc = await Acceptor.create({
    settings: SessionSettings.fromString(acceptorCfg(port)),
    store,
    storeTimeoutMs: TIMEOUT_MS,
    log: 'none',
    handlers: {
      fromAdmin(msg) {
        if (msg.getHeaderField(FIELD.MsgType) === MsgType.Logon) {
          rejected++;
          throw fixReject('RejectLogon', 'bad credentials');
        }
      },
    },
  });
  const errors: string[] = [];
  acc.on('storeError', (_id, method, _err, poisoned) => errors.push(`${method}:${poisoned}`));
  const ini = await Initiator.create({ settings: SessionSettings.fromString(initiatorCfg(port)), store: 'memory', log: 'none' });
  for (const m of ['load', 'reset', 'setSeqNums', 'setMessage'] as const) store.set(m, 'reject');
  await acc.start();
  await ini.start();
  // ReconnectInterval=1: let the initiator be rejected twice.
  for (let i = 0; i < 200 && rejected < 2; i++) await sleep(25);
  await sleep(100);
  const accLoggedOn = acc.getSession(ACC_ID)!.isLoggedOn();
  await ini.stop(true);
  await acc.stop(true);
  console.log(`result ${JSON.stringify({ rejected, accLoggedOn, errors: [...new Set(errors)] })}`);
} else if (mode === 'wrong-beginstring-poisoned') {
  // The initiator's store is poisoned without a disconnect (a send whose
  // setSeqNums rejects; load() rejects too, so no reload lifts it), then the
  // peer sends a message with the wrong BeginString. QuickFIX's catch
  // (UnsupportedVersion&) runs generateLogout() and incrNextTargetMsgSeqNum()
  // outside any guard (std::terminate, exit 134, before the fix).
  const port = await freePort();
  let wrongBeginString = false;
  const acc = await Acceptor.create({
    settings: SessionSettings.fromString(acceptorCfg(port)),
    store: 'memory',
    log: 'none',
    handlers: {
      toApp(msg) {
        if (wrongBeginString) msg.setHeaderField(FIELD.BeginString, 'FIX.4.2');
      },
    },
  });
  const store = new ControlledStore();
  const ini = await Initiator.create({
    settings: SessionSettings.fromString(withSettings(initiatorCfg(port), { HeartBtInt: '30', ReconnectInterval: '60' })),
    store,
    storeTimeoutMs: TIMEOUT_MS,
    log: 'none',
  });
  const logon = new Promise<void>((r) => ini.once('logon', () => r()));
  await acc.start();
  await ini.start();
  await logon;
  store.set('setSeqNums', 'reject');
  store.set('load', 'reject');
  const sent = await sendToTarget(order('poison'), INI_ID);
  const stillLoggedOn = ini.getSession(INI_ID)!.isLoggedOn();
  wrongBeginString = true;
  const logout = new Promise<void>((r) => ini.once('logout', () => r()));
  await sendToTarget(order('wrong-begin'), ACC_ID);
  // The handler's Logout could not be persisted, but it set sentLogout():
  // QuickFIX's logout timeout (2 s) disconnects the session.
  const disconnected = await Promise.race([logout.then(() => true), sleep(10_000).then(() => false)]);
  await ini.stop(true);
  await acc.stop(true);
  console.log(`result ${JSON.stringify({ sent, stillLoggedOn, disconnected })}`);
} else if (mode === 'rollover-connect-poisoned') {
  // A connect after the acceptor's session period ended, with the database
  // down (RefreshOnLogon=Y: the connect's refresh() poisons, every reload
  // fails). Session::setResponder() sees checkSessionTime() fail on the
  // cached creation time and runs Session::reset(), whose generateLogout()
  // -> fill() reads the sender seqnum outside any guard; the acceptor's
  // network thread has no handler (std::terminate, exit 134, before the fix).
  // The acceptor ticks connected sessions only, so nothing resets the session
  // between EndTime and the connect.
  const port = await freePort();
  const store = new ControlledStore();
  const window = { StartTime: utcClock(-1), EndTime: utcClock(3 / 3600), RefreshOnLogon: 'Y' };
  const acc = await Acceptor.create({
    settings: SessionSettings.fromString(withSettings(acceptorCfg(port), window)),
    store,
    storeTimeoutMs: TIMEOUT_MS,
    log: 'none',
  });
  const errors: string[] = [];
  acc.on('storeError', (_id, method, _err, poisoned) => errors.push(`${method}:${poisoned}`));
  const ini = await Initiator.create({ settings: SessionSettings.fromString(initiatorCfg(port)), store: 'memory', log: 'none' });
  await acc.start();
  // Past EndTime: the session period of the preloaded creation time is over.
  await sleep(4500);
  for (const m of ['load', 'reset', 'setSeqNums', 'setMessage'] as const) store.set(m, 'reject');
  await ini.start();
  // ReconnectInterval=1: let the initiator connect a few times.
  for (let i = 0; i < 200 && store.count('load') < 3; i++) await sleep(25);
  await sleep(200);
  const accLoggedOn = acc.getSession(ACC_ID)!.isLoggedOn();
  await ini.stop(true);
  await acc.stop(true);
  console.log(`result ${JSON.stringify({ loads: store.count('load'), accLoggedOn, errors: [...new Set(errors)] })}`);
} else if (mode === 'queued-logon-store-failure') {
  // A raw counterparty: its Logon (34=5) is too high, so the initiator queues
  // it and asks for 1..; the GapFill ends exactly at the Logon (36=5). After
  // the SequenceReset, Session::next(Message) runs nextQueued() past its
  // try/catch, which pops the queued Logon and increments the target seqnum
  // to 6 with no handler: the adapter rejects that write (std::terminate,
  // exit 134, before the carried fix).
  const soh = '\x01';
  const fix = (fields: [string, string | number][]) => {
    const body = fields.map(([k, v]) => `${k}=${v}${soh}`).join('');
    const head = `8=FIX.4.4${soh}9=${Buffer.byteLength(body)}${soh}`;
    const sum = [...Buffer.from(head + body)].reduce((a, b) => a + b, 0) % 256;
    return `${head}${body}10=${String(sum).padStart(3, '0')}${soh}`;
  };
  const sendingTime = () => {
    const iso = new Date().toISOString();
    return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}-${iso.slice(11, 23)}`;
  };
  const header = (type: string, seq: number): [string, string | number][] => [
    ['35', type],
    ['34', seq],
    ['49', 'SERVER'],
    ['52', sendingTime()],
    ['56', 'CLIENT'],
  ];
  const peer = createServer((sock) => {
    let buf = '';
    sock.on('error', () => {});
    sock.on('data', (d) => {
      buf += d.toString('latin1');
      for (let m; (m = /8=FIX[^\x01]*\x01.*?\x0110=\d{3}\x01/s.exec(buf)); ) {
        buf = buf.slice(m.index + m[0].length);
        const type = /\x0135=([^\x01]+)/.exec(m[0])?.[1];
        if (type === 'A') sock.write(fix([...header('A', 5), ['98', 0], ['108', 30]]));
        if (type === '2') {
          sock.write(fix([...header('4', 1), ['43', 'Y'], ['122', sendingTime()], ['123', 'Y'], ['36', 5]]));
        }
      }
    });
  });
  await new Promise<void>((r) => peer.listen(0, '127.0.0.1', r));
  const port = (peer.address() as { port: number }).port;
  const store = new ControlledStore();
  store.set('setSeqNums', 'reject', (args) => args[2] === 6);
  const ini = await Initiator.create({
    settings: SessionSettings.fromString(
      withSettings(initiatorCfg(port), { ResetOnLogon: 'N', HeartBtInt: '30', ReconnectInterval: '60' }),
    ),
    store,
    storeTimeoutMs: TIMEOUT_MS,
    log: 'none',
  });
  const errors: string[] = [];
  ini.on('storeError', (_id, method, _err, poisoned) => errors.push(`${method}:${poisoned}`));
  const logout = new Promise<void>((r) => ini.once('logout', () => r()));
  await ini.start();
  const disconnected = await Promise.race([logout.then(() => true), sleep(10_000).then(() => false)]);
  await ini.stop(true);
  peer.close();
  console.log(`result ${JSON.stringify({ disconnected, errors: [...new Set(errors)] })}`);
} else {
  throw new Error(`unknown mode ${mode}`);
}
console.log(`elapsed ${Date.now() - t0}`);
