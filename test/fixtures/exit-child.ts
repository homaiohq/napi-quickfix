// Child-process scenarios for exit.test.ts: each ENDS THE PROCESS ABRUPTLY,
// with process.exit() or an uncaught exception, while a libuv pool thread is
// parked on a JS round trip. Both paths join the threadpool without running
// the environment cleanup hooks; the parent asserts the process still exits,
// and fast.
//
//   node --import tsx test/fixtures/exit-child.ts <exit|throw> <scenario>
//
// Prints `ready` on stdout right before ending the process.
import { setTimeout as sleep } from 'node:timers/promises';

import {
  type ApplicationHandlers,
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
import { acceptorCfg, freePort, initiatorCfg } from '../helpers.js';
import { ControlledStore } from '../store-adapters.js';

const INI_ID = new SessionID('FIX.4.4', 'CLIENT', 'SERVER');
// exit.test.ts expects it.
const EXIT_CODE = 3;

function order(tag: string) {
  return createMessage()
    .setField(FIELD.MsgType, MsgType.NewOrderSingle)
    .setField(FIELD.ClOrdID, tag)
    .setField(FIELD.Symbol, 'EXIT')
    .setField(FIELD.Side, Side.Buy)
    .setField(FIELD.OrderQty, 1);
}

// Block the JS thread, so that a pool or network thread that needs it parks
// in its BlockingCall instead of being served.
function blockJsThread(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

async function loggedOnPair(store: 'memory' | ControlledStore, storeTimeoutMs?: number, handlers?: ApplicationHandlers) {
  const port = await freePort();
  const acc = await Acceptor.create({ settings: SessionSettings.fromString(acceptorCfg(port)), store: 'memory', log: 'none' });
  const ini = await Initiator.create({
    settings: SessionSettings.fromString(initiatorCfg(port)),
    handlers,
    store,
    storeTimeoutMs,
    log: 'none',
  });
  const logon = new Promise<void>((r) => ini.once('logon', () => r()));
  await acc.start();
  await ini.start();
  await logon;
  return { acc, ini };
}

const [how, scenario] = process.argv.slice(2);
if (how !== 'exit' && how !== 'throw') throw new Error(`unknown way to end ${how}`);

// End the process the way the parent asked for. The throw happens in a
// nextTick callback: an uncaught exception (not a rejected top-level await),
// raised before the event loop gets a turn to serve the parked thread.
function end(): void {
  console.log('ready');
  if (how === 'exit') process.exit(EXIT_CODE);
  process.nextTick(() => {
    throw new Error('boom');
  });
}

if (scenario === 'send-in-toapp') {
  // The built-in memory store, no handlers: the TS layer's own toApp still
  // makes every send a JS round trip, which the blocked thread never serves.
  await loggedOnPair('memory');
  void sendToTarget(order('toapp'), INI_ID);
  blockJsThread(300);
  end();
} else if (scenario === 'toapp-exits') {
  // The exit comes from the handler of the very round trip the pool thread
  // is parked on, mid-dispatch. 'exit' only: a handler that throws does not
  // end the process (a non-FIX throw is a generic rejection, DoNotSend).
  if (how !== 'exit') throw new Error('toapp-exits ends with process.exit()');
  await loggedOnPair('memory', undefined, {
    toApp() {
      end();
    },
  });
  void sendToTarget(order('handler'), INI_ID);
} else if (scenario === 'parked-store') {
  // Two sends parked in store writes that never settle (one in the adapter,
  // the next queued on the session mutex behind it), under the default 30 s
  // store timeout.
  const store = new ControlledStore();
  await loggedOnPair(store);
  store.set('setMessage', 'hang');
  void sendToTarget(order('park-1'), INI_ID);
  void sendToTarget(order('park-2'), INI_ID);
  for (let i = 0; i < 100 && store.inflight === 0; i++) await sleep(20);
  await sleep(100);
  end();
} else if (scenario === 'parked-store-no-timeout') {
  // The same with storeTimeoutMs=0: nothing but the exit releases the call.
  const store = new ControlledStore();
  await loggedOnPair(store, 0);
  store.set('setMessage', 'hang');
  void sendToTarget(order('park'), INI_ID);
  for (let i = 0; i < 100 && store.inflight === 0; i++) await sleep(20);
  end();
} else if (scenario === 'graceful-stop') {
  // A graceful stop() whose worker joins a network thread parked in
  // toAdmin(Logout).
  const { ini } = await loggedOnPair('memory');
  void ini.stop();
  blockJsThread(300);
  end();
} else if (scenario === 'send-after-stop-froze') {
  // A send queued once a graceful stop() has frozen the engine's session
  // operations, before the stop settled: it parks until the engine is
  // destroyed on the JS thread, which an exiting process never does.
  const { ini } = await loggedOnPair('memory');
  ini.once('logout', () => {
    // The stop worker returns once QuickFIX's stop() has joined the network
    // thread (up to ~2 s: its 1 s logout poll plus the thread's 1 s tick),
    // then freezes the gate.
    blockJsThread(3000);
    void sendToTarget(order('frozen'), INI_ID);
    blockJsThread(300);
    end();
  });
  void ini.stop();
} else {
  throw new Error(`unknown scenario ${scenario}`);
}
