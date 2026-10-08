import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { FIELD, MsgType, Side, enums } from '../dist/esm/index.js';

describe('enums', () => {
  test('FIELD maps names to tag numbers', () => {
    assert.equal(FIELD.MsgType, 35);
    assert.equal(FIELD.Username, 553);
    assert.equal(FIELD.Password, 554);
  });

  test('FIELD covers the full QuickFIX FixFieldNumbers.h table', () => {
    // v1.16.0 declares 6107 names; a future QuickFIX may add more, never fewer.
    const names = Object.keys(FIELD);
    assert.ok(names.length >= 6107, `expected >= 6107 field names, got ${names.length}`);
    // Aliases: several tags carry more than one name across FIX versions.
    assert.equal(FIELD.NoUsernames, 809);
    assert.equal(FIELD.EncryptedPassword, 1402);
    for (const name of names) {
      assert.equal(typeof FIELD[name as keyof typeof FIELD], 'number');
    }
  });

  test('FIELD values are typed as literals', () => {
    // Type-level: a literal `554`, not `number`.
    const tag: 554 = FIELD.Password;
    assert.equal(tag, 554);
    // @ts-expect-error — a misspelt field name is a compile error.
    assert.equal(FIELD.Pasword, undefined);
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
