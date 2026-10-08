import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  FIELD,
  VALUES,
  MsgType,
  Side,
  OrdType,
  TimeInForce,
  enums,
} from '../dist/esm/index.js';
import {
  ExecType,
  OrdStatus,
  SecurityType,
  EncryptMethod,
  PossDupFlag,
  Side as SideFromValues,
  VALUES as ValuesFromSubpath,
} from '../dist/esm/generated/values.js';

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

  test('the curated names of the former native enums still resolve identically', () => {
    // These 23 keys/values were hand-written in cpp/enums.cpp before the groups were
    // generated from FixValues.h. They are public API and must never move.
    const curated = {
      MsgType: {
        Heartbeat: '0',
        TestRequest: '1',
        ResendRequest: '2',
        Reject: '3',
        SequenceReset: '4',
        Logout: '5',
        Logon: 'A',
        NewOrderSingle: 'D',
        ExecutionReport: '8',
        OrderCancelRequest: 'F',
        OrderCancelReplaceRequest: 'G',
        OrderCancelReject: '9',
      },
      Side: { Buy: '1', Sell: '2', SellShort: '5' },
      OrdType: { Market: '1', Limit: '2', Stop: '3', StopLimit: '4' },
      TimeInForce: { Day: '0', GoodTillCancel: '1', ImmediateOrCancel: '3', FillOrKill: '4' },
    } as const;
    const named = { MsgType, Side, OrdType, TimeInForce } as const;
    let checked = 0;
    for (const [group, members] of Object.entries(curated)) {
      for (const [name, value] of Object.entries(members)) {
        const g = group as keyof typeof curated;
        assert.equal((named[g] as Record<string, string>)[name], value, `${group}.${name}`);
        assert.equal((enums[g] as Record<string, string>)[name], value, `enums.${group}.${name}`);
        checked++;
      }
    }
    assert.equal(checked, 23);
  });

  test('generated groups follow the naming rule', () => {
    // SCREAMING_SNAKE suffixes become PascalCase.
    assert.equal(Side.SellShort, '5');
    assert.equal(Side.SellShortExempt, '6');
    assert.equal(ExecType.Fill, '2');
    assert.equal(ExecType.Trade, 'F');
    assert.equal(ExecType.DoneForDay, '3');
    assert.equal(OrdStatus.New, '0');
    assert.equal(OrdStatus.PartiallyFilled, '1');
    assert.equal(SecurityType.CommonStock, 'CS');
    assert.equal(SecurityType.BankersAcceptance, 'BA');
    // MsgType is already mixed-case upstream and is kept verbatim, all-caps included.
    assert.equal(MsgType.IOI, '6');
    assert.equal(MsgType.XMLnonFIX, 'n');
    assert.equal(MsgType.MarketDataSnapshotFullRefresh, 'W');
    // Every C++ declaration form lands as a string: `const int`, `const char`, `const char[]`.
    assert.equal(EncryptMethod.None, '0');
    assert.equal(EncryptMethod.NoneOther, '0');
    assert.equal(PossDupFlag.Yes, 'Y');
    assert.equal(PossDupFlag.No, 'N');
  });

  test('VALUES covers the full QuickFIX FixValues.h table', () => {
    // v1.16.0 declares 690 groups / 5781 values; a future QuickFIX may add more, never fewer.
    const groups = Object.keys(VALUES);
    assert.ok(groups.length >= 690, `expected >= 690 value groups, got ${groups.length}`);
    let total = 0;
    for (const group of groups) {
      const members = VALUES[group as keyof typeof VALUES] as Record<string, string>;
      assert.ok(Object.isFrozen(members), `${group} is frozen`);
      const names = Object.keys(members);
      assert.ok(names.length > 0, `${group} is non-empty`);
      for (const name of names) {
        assert.equal(typeof members[name], 'string', `${group}.${name} is a string`);
        assert.match(name, /^[A-Za-z_][A-Za-z0-9_]*$/, `${group}.${name} is an identifier`);
      }
      total += names.length;
    }
    assert.ok(total >= 5781, `expected >= 5781 values, got ${total}`);
    // The named exports are the very same objects as the tree members.
    assert.equal(VALUES.Side, Side);
    assert.equal(VALUES.MsgType, MsgType);
    assert.equal(VALUES.ExecType, ExecType);
  });

  test('value constants are typed as literals', () => {
    // Type-level: a literal `'1'`, not `string`.
    const side: '1' = Side.Buy;
    assert.equal(side, '1');
    const exec: 'F' = VALUES.ExecType.Trade;
    assert.equal(exec, 'F');
    // @ts-expect-error — a misspelt value name is a compile error.
    assert.equal(Side.Bye, undefined);
    // @ts-expect-error — so is a misspelt group name.
    assert.equal(VALUES.Sides, undefined);
  });

  test('the `values` subpath exposes the same objects without the native addon', () => {
    assert.equal(SideFromValues, Side);
    assert.equal(ValuesFromSubpath, VALUES);
  });

  test('the aggregate `enums` tree exposes the same groups', () => {
    assert.equal(enums.FIELD.MsgType, 35);
    assert.equal(enums.MsgType.Logon, 'A');
    assert.equal(enums.Side.Buy, '1');
    assert.equal(enums.OrdType.Limit, '2');
    assert.equal(enums.TimeInForce.Day, '0');
    assert.equal(enums.ExecType.Fill, '2');
    assert.equal(enums.FIELD, FIELD);
    for (const group of Object.keys(VALUES)) {
      assert.equal(
        enums[group as keyof typeof VALUES],
        VALUES[group as keyof typeof VALUES],
        `enums.${group}`,
      );
    }
    assert.equal(Object.keys(enums).length, Object.keys(VALUES).length + 1);
  });

  test('enum groups are frozen (immutable)', () => {
    assert.ok(Object.isFrozen(FIELD));
    assert.ok(Object.isFrozen(MsgType));
    assert.ok(Object.isFrozen(Side));
    assert.ok(Object.isFrozen(VALUES));
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
