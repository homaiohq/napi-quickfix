import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  Message,
  createMessage,
  sendToTarget,
  SessionID,
  SessionSettings,
  Acceptor,
  FIELD,
  MsgType,
} from '../dist/esm/index.js';

describe('error mapping (C++ FIX::Exception -> JS QuickFixError)', () => {
  test('parsing garbage with { validate: true } throws InvalidMessage', () => {
    assert.throws(
      () => Message.parse('this-is-not-fix', { validate: true }),
      (err: any) => {
        assert.equal(err.name, 'QuickFixError');
        assert.equal(err.fixErrorName, 'InvalidMessage');
        return true;
      },
    );
  });

  test('getField on an absent tag throws FieldNotFound', () => {
    const msg = createMessage().setField(FIELD.MsgType, MsgType.Heartbeat);
    assert.throws(
      () => msg.getField(9999),
      (err: any) => {
        assert.equal(err.name, 'QuickFixError');
        assert.equal(err.fixErrorName, 'FieldNotFound');
        return true;
      },
    );
  });

  test('sendToTarget on a non-existent session rejects with SessionNotFound', async () => {
    const msg = createMessage().setField(FIELD.MsgType, MsgType.NewOrderSingle);
    const id = new SessionID('FIX.4.4', 'NOPE', 'NADA');
    await assert.rejects(
      () => sendToTarget(msg, id),
      (err: any) => {
        assert.equal(err.name, 'QuickFixError');
        assert.equal(err.fixErrorName, 'SessionNotFound');
        return true;
      },
    );
  });

  test('constructing an engine with a bad config throws ConfigError', () => {
    // Missing UseDataDictionary (and no DataDictionary path) => QuickFIX rejects
    // the configuration at construction time.
    const badCfg = `[DEFAULT]
ConnectionType=acceptor
[SESSION]
BeginString=FIX.4.4
SenderCompID=SERVER
TargetCompID=CLIENT
`;
    const settings = SessionSettings.fromString(badCfg);
    assert.throws(
      () => new Acceptor({ settings, store: 'memory', log: 'none' }),
      (err: any) => {
        assert.equal(err.name, 'QuickFixError');
        assert.equal(err.fixErrorName, 'ConfigError');
        return true;
      },
    );
  });
});
