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
  sendToTarget,
  FIELD,
  MsgType,
  Side,
} from '../../dist/esm/index.js';
import { acceptorCfg, initiatorCfg } from '../helpers.js';
import { ControlledStore, withSettings } from '../store-adapters.js';

const INI_ID = new SessionID('FIX.4.4', 'CLIENT', 'SERVER');
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

const mode = process.argv[2];
const t0 = Date.now();

if (mode === 'graceful-stop-hang' || mode === 'graceful-stop-dead') {
  // A store call that never settles must not stall a graceful stop() beyond
  // the per-call timeout, nor keep the process alive afterwards. 'dead':
  // EVERY call hangs, so the Logout the stop sends cannot be persisted
  // either and QuickFIX's own 10 s logout grace is what bounds the stop.
  const { acc, ini, store } = await loggedOnPair();
  let hung = 0;
  store.set('setMessage', 'hang', () => mode === 'graceful-stop-dead' || hung++ === 0);
  void sendToTarget(order('park'), INI_ID).catch(() => {});
  await sleep(100);
  const parked = store.inflight;
  const stopStart = Date.now();
  await ini.stop();
  const stopMs = Date.now() - stopStart;
  await acc.stop();
  console.log(`result ${JSON.stringify({ parked, stopMs })}`);
} else if (mode === 'gc-no-stop-parked') {
  // Engines dropped without stop() (unref'd) while a store call is parked:
  // the timeout releases the parked worker, the loop drains, the environment
  // cleanup hook tears the engines down and the process exits.
  const { acc, ini, store } = await loggedOnPair();
  acc.unref();
  ini.unref();
  store.set('setMessage', 'hang');
  void sendToTarget(order('park'), INI_ID).catch(() => {});
  await sleep(100);
  console.log(`result ${JSON.stringify({ parked: store.inflight })}`);
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
  for (let i = 0; i < 100 && store.inflight === 0; i++) await sleep(20);
  const parkedReset = store.inflight;
  await ini.stop(true);
  await acc.stop(true);
  console.log(`result ${JSON.stringify({ parkedReset, errors })}`);
} else {
  throw new Error(`unknown mode ${mode}`);
}
console.log(`elapsed ${Date.now() - t0}`);
