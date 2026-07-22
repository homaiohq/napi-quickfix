import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { FIELD, MsgType, Side, enums } from '../dist/esm/index.js';

describe('enums', () => {
  test('FIELD maps names to tag numbers', () => {
    assert.equal(FIELD.MsgType, 35);
  });

  test('MsgType values match the FIX spec', () => {
    assert.equal(MsgType.Logon, 'A');
    assert.equal(MsgType.NewOrderSingle, 'D');
    assert.equal(MsgType.Heartbeat, '0');
  });

  test('Side values match the FIX spec', () => {
    assert.equal(Side.Buy, '1');
  });

  test('the aggregate `enums` tree exposes the same groups', () => {
    assert.equal(enums.FIELD.MsgType, 35);
    assert.equal(enums.MsgType.Logon, 'A');
    assert.equal(enums.Side.Buy, '1');
  });

  test('enum groups are frozen (immutable)', () => {
    assert.ok(Object.isFrozen(FIELD));
    assert.ok(Object.isFrozen(MsgType));
    assert.ok(Object.isFrozen(Side));
    assert.ok(Object.isFrozen(enums));
    // Attempting to mutate a frozen object silently no-ops (or throws in strict
    // mode) — either way the value must not change.
    assert.throws(() => {
      'use strict';
      (MsgType as any).Logon = 'ZZZ';
    });
    assert.equal(MsgType.Logon, 'A');
  });
});
