// Worker body for the worker_threads regression tests in lifecycle.test.ts.
// Plain JS (no loader needed in a Worker); imports the built ESM entry.
//
//   mode 'churn':     load the addon, build a message with a group, construct
//                     and stop an engine, exit.
//   mode 'terminate': construct an engine with two sessions, so two 'create'
//                     callbacks are queued back to back, and block inside the
//                     first one's handler after telling the parent, which
//                     terminates the Worker meanwhile. The second callback is
//                     then dispatched into an environment that can no longer
//                     call into JS.
import { parentPort, workerData } from 'node:worker_threads';

const { Initiator, SessionSettings, createMessage, Group, FIELD, MsgType } = await import('../../dist/esm/index.js');

// SessionIDs of their own: QuickFIX's session registry is process-wide, so a
// Worker's sessions must not collide with the main thread's.
const cfg = (sessions) => `[DEFAULT]
ConnectionType=initiator
SocketConnectHost=127.0.0.1
SocketConnectPort=47803
HeartBtInt=5
UseDataDictionary=N
StartTime=00:00:00
EndTime=00:00:00
${sessions
  .map(
    (n) => `
[SESSION]
BeginString=FIX.4.4
SenderCompID=W-CLIENT-${n}
TargetCompID=W-SERVER-${n}
`,
  )
  .join('')}`;

if (workerData.mode === 'churn') {
  const ini = new Initiator({ settings: SessionSettings.fromString(cfg([1])), store: 'memory', log: 'none' });
  const msg = createMessage({ [FIELD.MsgType]: MsgType.NewOrderSingle }).addGroup(
    new Group(FIELD.NoPartyIDs, FIELD.PartyID).setField(FIELD.PartyID, 'P'),
  );
  if (msg.groupCount(FIELD.NoPartyIDs) !== 1) throw new Error('group lost');
  await ini.stop();
} else {
  const sab = new Int32Array(new SharedArrayBuffer(4));
  let first = true;
  const ini = new Initiator({
    settings: SessionSettings.fromString(cfg([1, 2])),
    store: 'memory',
    log: 'none',
    handlers: {
      onCreate() {
        if (!first) return;
        first = false;
        parentPort.postMessage('in-handler');
        // Hold the dispatch until the parent has called terminate().
        Atomics.wait(sab, 0, 0, 1000);
      },
    },
  });
  ini.unref();
  // Never exits on its own: the parent terminates it.
  await new Promise(() => {});
}
