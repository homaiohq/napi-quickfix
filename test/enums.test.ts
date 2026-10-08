import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FIELD,
  VALUES,
  MsgType,
  Side,
  OrdType,
  TimeInForce,
  enums,
  type EnumGroup,
  type ValueGroupName,
} from '../dist/esm/index.js';
// Resolved through the package's own `exports` map (Node self-reference), so a
// broken `./values` entry fails here rather than only for consumers.
import {
  ExecType,
  OrdStatus,
  SecurityType,
  EncryptMethod,
  PossDupFlag,
  SecurityIDSource,
  MDEntryType,
  ApplVerID,
  Side as SideFromValues,
  VALUES as ValuesFromSubpath,
} from '@homaiohq/napi-quickfix/values';

const require = createRequire(import.meta.url);
// Package self-reference (`@homaiohq/napi-quickfix/...`) resolves from inside the
// package, so child processes run from its root.
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('enums', () => {
  test('FIELD maps names to tag numbers', () => {
    assert.equal(FIELD.MsgType, 35);
    assert.equal(FIELD.Username, 553);
    assert.equal(FIELD.Password, 554);
  });

  test('FIELD covers the full QuickFIX FixFieldNumbers.h table', () => {
    // v1.16.0 declares 6107 names. The floor guards against a half-parsed header; lower
    // it only on a QuickFIX bump that removes fields (a breaking change, see
    // .agents/skills/upgrade-quickfix).
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
    // Acronyms and version tokens are lower-cased like any other word. This is the
    // permanent rule (see scripts/gen-values.mjs), and these keys are public API.
    assert.equal(SecurityIDSource.IsinNumber, '4');
    assert.equal(SecurityIDSource.Cusip, '1');
    assert.equal(MDEntryType.Vwap, '9');
    assert.equal(ApplVerID.Fix50Sp2, '9');
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
    // v1.16.0 declares 690 groups / 5781 values. The floor guards against a half-parsed
    // header; lower it only on a QuickFIX bump that removes constants (a breaking
    // change, see .agents/skills/upgrade-quickfix).
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

  test('EnumGroup widens any group for lookups by a string key', () => {
    // Type-level: the migration path for code that indexed the former string-indexed
    // `MsgType` / `Side` / `enums` with a `string` key (see CHANGELOG).
    const groupName: string = 'Side';
    const valueName: string = 'Buy';
    const widened: EnumGroup = enums[groupName as ValueGroupName];
    assert.equal(widened[valueName], '1');
    const msgTypes: EnumGroup = MsgType;
    assert.equal(msgTypes['Logon'], 'A');
    const tags: EnumGroup = FIELD;
    assert.equal(tags['MsgType'], 35);
    // @ts-expect-error — the literally-typed group itself has no string index signature.
    assert.equal(Side[valueName], '1');
  });

  test('the `values` subpath exposes the same objects', () => {
    assert.equal(SideFromValues, Side);
    assert.equal(ValuesFromSubpath, VALUES);
  });

  test('the `values` subpath does not load the native addon', () => {
    // This file already imported the main entry (and so the addon) above, so the
    // check has to happen in a fresh process: import only the subpath and assert the
    // native loader never entered the module cache. Both builds, since the CJS one
    // is what `require` consumers get.
    for (const [label, load] of [
      ['import', "await import('@homaiohq/napi-quickfix/values')"],
      ['require', "createRequire(import.meta.url)('@homaiohq/napi-quickfix/values')"],
    ]) {
      const script = [
        "import { createRequire } from 'node:module';",
        `${load};`,
        'const loaded = Object.keys(createRequire(import.meta.url).cache);',
        "console.log(JSON.stringify(loaded.filter((f) => /load-native|\\.node$/.test(f))));",
      ].join('\n');
      const { status, stdout, stderr } = spawnSync(
        process.execPath,
        ['--input-type=module', '-e', script],
        { cwd: packageRoot, encoding: 'utf8' },
      );
      assert.equal(status, 0, `${label}: ${stderr}`);
      assert.deepEqual(JSON.parse(stdout), [], `${label}: native loader was loaded`);
    }
    // And the built modules carry no import at all, so a bundler cannot pull it in
    // either.
    for (const built of ['dist/esm/generated/values.js', 'dist/cjs/generated/values.js']) {
      const js = readFileSync(join(packageRoot, built), 'utf8');
      assert.doesNotMatch(js, /^\s*(import\b|export\s.*\sfrom\s)|\brequire\(/m, built);
    }
  });

  test('the `values` subpath resolves under the `require` condition too', () => {
    // The CJS build is a separate module instance, so compare by value.
    const cjs = require('@homaiohq/napi-quickfix/values') as typeof import('@homaiohq/napi-quickfix/values');
    assert.equal(cjs.Side.Buy, '1');
    assert.deepEqual(Object.keys(cjs.VALUES), Object.keys(VALUES));
    assert.deepEqual(cjs.ExecType, ExecType);
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
