import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SessionSettings, SessionID } from '../dist/esm/index.js';

const CFG = `[DEFAULT]
ConnectionType=acceptor
SocketAcceptPort=45001
UseDataDictionary=N
StartTime=00:00:00
EndTime=00:00:00

[SESSION]
BeginString=FIX.4.4
SenderCompID=SERVER
TargetCompID=CLIENT
`;

const CFG_TWO = `[DEFAULT]
ConnectionType=acceptor
SocketAcceptPort=45001
UseDataDictionary=N
StartTime=00:00:00
EndTime=00:00:00

[SESSION]
BeginString=FIX.4.4
SenderCompID=SERVER
TargetCompID=CLIENT_A

[SESSION]
BeginString=FIX.4.4
SenderCompID=SERVER
TargetCompID=CLIENT_B
`;

describe('SessionSettings', () => {
  test('fromString parses [DEFAULT]+[SESSION] and returns the declared session', () => {
    const settings = SessionSettings.fromString(CFG);
    const sessions = settings.getSessions();
    assert.equal(sessions.length, 1);
    assert.ok(sessions[0] instanceof SessionID);
    assert.equal(sessions[0].toString(), 'FIX.4.4:SERVER->CLIENT');
  });

  test('fromString returns all declared sessions', () => {
    const settings = SessionSettings.fromString(CFG_TWO);
    const ids = settings
      .getSessions()
      .map((s) => s.toString())
      .sort();
    assert.deepEqual(ids, ['FIX.4.4:SERVER->CLIENT_A', 'FIX.4.4:SERVER->CLIENT_B']);
  });

  test('fromFile reads settings from disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'napi-qf-settings-'));
    const file = join(dir, 'acceptor.cfg');
    writeFileSync(file, CFG, 'utf8');
    after(() => rmSync(dir, { recursive: true, force: true }));

    const settings = SessionSettings.fromFile(file);
    const sessions = settings.getSessions();
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].toString(), 'FIX.4.4:SERVER->CLIENT');
  });
});
