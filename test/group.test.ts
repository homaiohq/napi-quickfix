import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Group, FIELD } from '../dist/esm/index.js';

const SOH = '\x01';

// Parties repeating group: NoPartyIDs(453) counts entries delimited by
// PartyID(448), each carrying PartyIDSource(447), PartyRole(452) and an
// optional nested NoPartySubIDs(802) group delimited by PartySubID(523).
const NoPartyIDs = FIELD.NoPartyIDs;
const PartyID = FIELD.PartyID;
const PartyIDSource = FIELD.PartyIDSource;
const PartyRole = FIELD.PartyRole;
const NoPartySubIDs = FIELD.NoPartySubIDs;
const PartySubID = FIELD.PartySubID;
const PartySubIDType = FIELD.PartySubIDType;

function party(id: string, role: number): Group {
  return new Group(NoPartyIDs, PartyID)
    .setField(PartyID, id)
    .setField(PartyIDSource, 'D')
    .setField(PartyRole, role);
}

describe('Group', () => {
  test('exposes its count tag and delimiter', () => {
    const g = new Group(NoPartyIDs, PartyID);
    assert.equal(g.field, 453);
    assert.equal(g.delim, 448);
  });

  test('constructor validates its arguments', () => {
    assert.throws(() => new (Group as any)(453), TypeError);
    assert.throws(() => new Group(453, 448, [447, 448]), /must start with the delimiter/);
    assert.throws(() => new Group(453, 448, [448, 0]), /non-zero/);
  });

  test('round-trips fields (string and number), chainable setField', () => {
    const g = new Group(NoPartyIDs, PartyID);
    const ret = g.setField(PartyID, 'TRADER-1').setField(PartyRole, 11);
    assert.equal(ret, g);
    assert.equal(g.getField(PartyID), 'TRADER-1');
    assert.equal(g.getField(PartyRole), '11');
  });

  test('isSetField / getFieldIfSet / removeField / isEmpty / totalFields / clear', () => {
    const g = new Group(NoPartyIDs, PartyID);
    assert.equal(g.isEmpty(), true);
    assert.equal(g.totalFields(), 0);
    assert.equal(g.isSetField(PartyID), false);
    assert.equal(g.getFieldIfSet(PartyID), undefined);

    g.setField(PartyID, 'X').setField(PartyRole, 1);
    assert.equal(g.isEmpty(), false);
    assert.equal(g.totalFields(), 2);
    assert.equal(g.isSetField(PartyID), true);
    assert.equal(g.getFieldIfSet(PartyID), 'X');

    g.removeField(PartyRole);
    assert.equal(g.isSetField(PartyRole), false);
    assert.doesNotThrow(() => g.removeField(PartyRole), 'removing an absent field is a no-op');

    g.clear();
    assert.equal(g.isEmpty(), true);
  });

  test('getField on an absent tag throws QuickFixError FieldNotFound', () => {
    const g = new Group(NoPartyIDs, PartyID);
    assert.throws(
      () => g.getField(PartyRole),
      (err: any) => {
        assert.equal(err.name, 'QuickFixError');
        assert.equal(err.fixErrorName, 'FieldNotFound');
        return true;
      },
    );
  });

  test('fields() and iteration yield [tag, value] pairs delimiter-first', () => {
    // Set out of order on purpose: the delimiter must still come first.
    const g = new Group(NoPartyIDs, PartyID).setField(PartyRole, 1).setField(PartyIDSource, 'D').setField(PartyID, 'A');
    assert.deepEqual(g.fields(), [
      [448, 'A'],
      [447, 'D'],
      [452, '1'],
    ]);
    assert.deepEqual([...g], g.fields());
    assert.equal(g.toString(), `448=A${SOH}447=D${SOH}452=1${SOH}`);
  });

  test('an explicit order controls the wire order of the entry', () => {
    // Without an order, non-delimiter fields sort by tag (447 before 452).
    // The dictionary order for Parties is 448, 447, 452 — but force 452 before
    // 447 to prove the order is honoured.
    const g = new Group(NoPartyIDs, PartyID, [448, 452, 447])
      .setField(PartyIDSource, 'D')
      .setField(PartyRole, 1)
      .setField(PartyID, 'A');
    assert.equal(g.toString(), `448=A${SOH}452=1${SOH}447=D${SOH}`);
  });

  test('nested groups: addGroup / groupCount / hasGroup / getGroup', () => {
    const g = party('A', 1);
    assert.equal(g.hasGroup(NoPartySubIDs), false);
    assert.equal(g.groupCount(NoPartySubIDs), 0);

    g.addGroup(new Group(NoPartySubIDs, PartySubID).setField(PartySubID, 'desk-1').setField(PartySubIDType, 2));
    g.addGroup(new Group(NoPartySubIDs, PartySubID).setField(PartySubID, 'desk-2').setField(PartySubIDType, 2));

    assert.equal(g.hasGroup(NoPartySubIDs), true);
    assert.equal(g.hasGroup(2, NoPartySubIDs), true);
    assert.equal(g.hasGroup(3, NoPartySubIDs), false);
    assert.equal(g.groupCount(NoPartySubIDs), 2);
    assert.equal(g.getField(NoPartySubIDs), '2', 'the count field is maintained');

    const sub = g.getGroup(2, NoPartySubIDs);
    assert.equal(sub.field, 802);
    assert.equal(sub.delim, 523);
    assert.equal(sub.getField(PartySubID), 'desk-2');

    // Nested entries are emitted right after their count field.
    assert.equal(
      g.toString(),
      `448=A${SOH}447=D${SOH}452=1${SOH}802=2${SOH}523=desk-1${SOH}803=2${SOH}523=desk-2${SOH}803=2${SOH}`,
    );
    assert.equal(g.totalFields(), 4 + 4, 'totalFields counts nested entries');
  });

  test('getGroup returns a snapshot; replaceGroup writes it back', () => {
    const g = party('A', 1).addGroup(new Group(NoPartySubIDs, PartySubID).setField(PartySubID, 'desk-1'));
    const sub = g.getGroup(1, NoPartySubIDs);
    sub.setField(PartySubID, 'desk-9');
    assert.equal(g.getGroup(1, NoPartySubIDs).getField(PartySubID), 'desk-1', 'snapshot is detached');

    g.replaceGroup(1, sub);
    assert.equal(g.getGroup(1, NoPartySubIDs).getField(PartySubID), 'desk-9');
  });

  test('getGroup / replaceGroup on a missing entry throw FieldNotFound', () => {
    const g = party('A', 1);
    const isFieldNotFound = (err: any) => {
      assert.equal(err.name, 'QuickFixError');
      assert.equal(err.fixErrorName, 'FieldNotFound');
      return true;
    };
    assert.throws(() => g.getGroup(1, NoPartySubIDs), isFieldNotFound, 'no such group at all');

    g.addGroup(new Group(NoPartySubIDs, PartySubID).setField(PartySubID, 'x'));
    assert.throws(() => g.getGroup(2, NoPartySubIDs), isFieldNotFound, 'index out of range');
    assert.throws(() => g.getGroup(0, NoPartySubIDs), isFieldNotFound, 'indices are 1-based');
    assert.throws(
      () => g.replaceGroup(2, new Group(NoPartySubIDs, PartySubID).setField(PartySubID, 'y')),
      isFieldNotFound,
    );
  });

  test('removeGroup by index and by tag', () => {
    const g = party('A', 1)
      .addGroup(new Group(NoPartySubIDs, PartySubID).setField(PartySubID, 'one'))
      .addGroup(new Group(NoPartySubIDs, PartySubID).setField(PartySubID, 'two'))
      .addGroup(new Group(NoPartySubIDs, PartySubID).setField(PartySubID, 'three'));

    g.removeGroup(2, NoPartySubIDs);
    assert.equal(g.groupCount(NoPartySubIDs), 2);
    assert.equal(g.getField(NoPartySubIDs), '2');
    assert.equal(g.getGroup(2, NoPartySubIDs).getField(PartySubID), 'three');

    g.removeGroup(NoPartySubIDs);
    assert.equal(g.hasGroup(NoPartySubIDs), false);
    assert.equal(g.isSetField(NoPartySubIDs), false, 'the count field goes with the last entry');
    assert.doesNotThrow(() => g.removeGroup(NoPartySubIDs), 'removing an absent group is a no-op');
  });
});
