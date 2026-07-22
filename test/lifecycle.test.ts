import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Acceptor, Initiator, SessionSettings, SessionID } from '../dist/esm/index.js';

// Lifecycle smoke tests use engines with NO counterparty, so nothing logs on and
// stop() tears down cleanly. A live logged-on session (with a real send -> fromApp
// round-trip) is exercised separately, in-process, in loopback.test.ts.

const ACCEPTOR_CFG = `[DEFAULT]
ConnectionType=acceptor
SocketAcceptPort=47801
UseDataDictionary=N
StartTime=00:00:00
EndTime=00:00:00

[SESSION]
BeginString=FIX.4.4
SenderCompID=SERVER
TargetCompID=CLIENT
`;

// Initiator pointed at a port with no listener: it will keep retrying but never
// log on, so teardown stays deadlock-free.
const INITIATOR_CFG = `[DEFAULT]
ConnectionType=initiator
SocketConnectHost=127.0.0.1
SocketConnectPort=47802
HeartBtInt=5
UseDataDictionary=N
StartTime=00:00:00
EndTime=00:00:00

[SESSION]
BeginString=FIX.4.4
SenderCompID=CLIENT
TargetCompID=SERVER
`;

const tick = () => new Promise((r) => setImmediate(r));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Engine lifecycle (no counterparty)', () => {
  test('Acceptor: onCreate fires via handler AND event; isLoggedOn stays false; clean stop', async () => {
    const settings = SessionSettings.fromString(ACCEPTOR_CFG);

    let handlerSid: SessionID | undefined;
    const acc = new Acceptor({
      settings,
      store: 'memory',
      log: 'none',
      handlers: {
        onCreate(sid) {
          handlerSid = sid;
        },
      },
    });

    const eventSids: SessionID[] = [];
    acc.on('create', (sid) => eventSids.push(sid));

    // isLoggedOn is false before start.
    assert.equal(acc.isLoggedOn(), false);

    acc.unref();
    await acc.start();
    // onCreate fires asynchronously — give the engine a moment.
    await wait(200);
    await tick();

    assert.ok(handlerSid, 'onCreate handler should have fired');
    assert.equal(handlerSid!.toString(), 'FIX.4.4:SERVER->CLIENT');
    assert.equal(eventSids.length, 1, "'create' event should have fired once");
    assert.equal(eventSids[0].toString(), 'FIX.4.4:SERVER->CLIENT');

    // No counterparty => never logged on.
    assert.equal(acc.isLoggedOn(), false);

    // Clean teardown (no live session => no deadlock).
    await acc.stop();
    // Double-stop must be a safe no-op.
    await assert.doesNotReject(() => acc.stop());
  });

  test('Initiator: constructs, starts, never logs on, stops cleanly', async () => {
    const settings = SessionSettings.fromString(INITIATOR_CFG);

    let created = false;
    const ini = new Initiator({
      settings,
      store: 'memory',
      log: 'none',
      handlers: {
        onCreate() {
          created = true;
        },
      },
    });

    assert.equal(ini.isLoggedOn(), false);

    ini.unref();
    await ini.start();
    await wait(200);
    await tick();

    assert.ok(created, 'onCreate should have fired for the initiator session');
    assert.equal(ini.isLoggedOn(), false);

    await ini.stop();
    await assert.doesNotReject(() => ini.stop());
  });
});
