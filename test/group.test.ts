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

const isFieldNotFound = (err: any) => {
  assert.equal(err.name, 'QuickFixError');
  assert.equal(err.fixErrorName, 'FieldNotFound');
  return true;
};

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
    assert.throws(() => new Group(0, 448), TypeError, 'count tag must be positive');
    assert.throws(() => new Group(453, 1.5), TypeError, 'delimiter must be an integer');
    assert.throws(() => new Group(453, 448, [447, 448]), /must start with the delimiter/);
    assert.throws(() => new Group(453, 448, [448, 0]), /positive integer/);
    assert.throws(() => new Group(453, 448, [448, -1]), /positive integer/);
    assert.throws(() => new Group(453, 448, [448, 1.5]), /positive integer/);
    assert.throws(() => new Group(453, 448, [448, 'x' as unknown as number]), /positive integer/);
    assert.throws(() => new Group(453, 448, 'x' as unknown as number[]), /must be an array/);
    // An empty order means "no order": delimiter first, then by tag number.
    assert.equal(new Group(453, 448, []).setField(452, 1).setField(448, 'A').toString(), `448=A${SOH}452=1${SOH}`);
  });

  test('tag validation: sets need a positive integer, reads accept any integer', () => {
    const g = new Group(NoPartyIDs, PartyID);
    assert.throws(() => g.setField(0, 'x'), TypeError, 'tag 0 would emit "0=x" on the wire');
    assert.throws(() => g.setField(-1, 'x'), TypeError);
    assert.throws(() => g.setField(1.5, 'x'), TypeError, 'a fraction must not silently truncate');
    assert.throws(() => g.setField('448' as unknown as number, 'x'), TypeError);
    assert.equal(g.isEmpty(), true, 'nothing was written');

    assert.throws(() => g.getField(0), isFieldNotFound);
    assert.throws(() => g.getField(-5), isFieldNotFound);
    assert.equal(g.isSetField(-5), false);
    assert.equal(g.getFieldIfSet(0), undefined);
    assert.throws(() => g.getField(1.5), TypeError);
    assert.throws(() => g.isSetField(Number.NaN), TypeError);
    assert.throws(() => g.isSetField(Number.POSITIVE_INFINITY), TypeError);
    assert.throws(() => g.setField(2 ** 40, 'x'), TypeError, 'beyond the int range of a tag');
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
    assert.throws(() => g.getField(PartyRole), isFieldNotFound);
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

  test('without an order, every non-delimiter tag sorts by number, even one below the delimiter', () => {
    const g = new Group(NoPartyIDs, PartyID)
      .setField(PartyRole, 11)
      .setField(FIELD.Text, 'x')
      .setField(PartyIDSource, 'D')
      .setField(PartyID, 'A');
    assert.equal(g.toString(), `448=A${SOH}58=x${SOH}447=D${SOH}452=11${SOH}`);
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

  test('tags outside an explicit order follow the listed ones, by tag number', () => {
    const g = new Group(NoPartyIDs, PartyID, [448, 452, 447])
      .setField(PartyIDSource, 'D')
      .setField(FIELD.Text, 'extra') // 58: below every listed tag, still after them
      .setField(PartyID, 'A')
      .setField(PartyRole, 11)
      .setField(FIELD.Side, '1') // 54
      .setField(PartySubIDType, 2); // 803: above every listed tag
    assert.equal(g.toString(), `448=A${SOH}452=11${SOH}447=D${SOH}54=1${SOH}58=extra${SOH}803=2${SOH}`);
    assert.deepEqual(
      g.fields().map(([tag]) => tag),
      [448, 452, 447, 54, 58, 803],
      'fields() follows the same order',
    );
  });

  test('an explicit order places a nested group at the slot of its count tag', () => {
    // Without an order, nested groups are emitted after the entry's own fields
    // (see below). Listing the count tag mid-order moves the whole nested block
    // there, as the FIX 4.4 dictionary does for NoPartySubIDs inside Parties.
    const g = new Group(NoPartyIDs, PartyID, [448, 802, 452])
      .setField(PartyID, 'A')
      .addGroup(new Group(NoPartySubIDs, PartySubID).setField(PartySubID, 'desk-1').setField(PartySubIDType, 1))
      .setField(PartyRole, 1);
    assert.equal(g.toString(), `448=A${SOH}802=1${SOH}523=desk-1${SOH}803=1${SOH}452=1${SOH}`);
    assert.deepEqual(g.fields(), [
      [448, 'A'],
      [802, '1'],
      [452, '1'],
    ]);
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

  test('addGroup stores a copy: reusing the same Group object yields independent entries', () => {
    const entry = new Group(NoPartySubIDs, PartySubID).setField(PartySubID, 'desk-1');
    const g = party('A', 1).addGroup(entry);
    entry.setField(PartySubID, 'desk-2').setField(PartySubIDType, 2);
    g.addGroup(entry);
    entry.clear();

    assert.equal(g.groupCount(NoPartySubIDs), 2);
    assert.equal(g.getGroup(1, NoPartySubIDs).toString(), `523=desk-1${SOH}`);
    assert.equal(g.getGroup(2, NoPartySubIDs).toString(), `523=desk-2${SOH}803=2${SOH}`);
  });

  test('addGroup / replaceGroup reject anything that is not a Group', () => {
    const g = party('A', 1);
    assert.throws(() => g.addGroup({} as unknown as Group), TypeError);
    assert.throws(() => g.addGroup({ field: 802, delim: 523 } as unknown as Group), TypeError);
    assert.throws(() => g.replaceGroup(1, {} as unknown as Group), TypeError);
    assert.equal(g.hasGroup(NoPartySubIDs), false, 'nothing was added');
  });

  test('getGroup reports the delimiter and keeps the field order, even when the delimiter was not set', () => {
    // A stored entry that lacks its delimiter field: the snapshot must still
    // know the delimiter (so a later setField sorts it first) and keep the
    // explicit order the entry was built with.
    const g = party('A', 1)
      .addGroup(new Group(NoPartySubIDs, PartySubID).setField(PartySubIDType, 2))
      .addGroup(new Group(NoPartySubIDs, PartySubID, [523, 803]))
      .addGroup(new Group(NoPartyIDs, PartyID, [448, 452, 447]).setField(PartyRole, 7).setField(PartyIDSource, 'D'));

    const noDelim = g.getGroup(1, NoPartySubIDs);
    assert.equal(noDelim.delim, PartySubID);
    assert.equal(noDelim.setField(PartySubID, 'late').toString(), `523=late${SOH}803=2${SOH}`);

    const empty = g.getGroup(2, NoPartySubIDs);
    assert.equal(empty.isEmpty(), true);
    assert.equal(empty.field, NoPartySubIDs);
    assert.equal(empty.delim, PartySubID);

    const ordered = g.getGroup(1, NoPartyIDs);
    assert.equal(ordered.delim, PartyID);
    assert.equal(ordered.setField(PartyID, 'B').toString(), `448=B${SOH}452=7${SOH}447=D${SOH}`, 'order survives');
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
    assert.throws(() => g.getGroup(1, NoPartySubIDs), isFieldNotFound, 'no such group at all');

    g.addGroup(new Group(NoPartySubIDs, PartySubID).setField(PartySubID, 'x'));
    assert.throws(() => g.getGroup(2, NoPartySubIDs), isFieldNotFound, 'index out of range');
    assert.throws(() => g.getGroup(0, NoPartySubIDs), isFieldNotFound, 'indices are 1-based');
    assert.throws(() => g.getGroup(-1, NoPartySubIDs), isFieldNotFound);
    assert.throws(
      () => g.replaceGroup(2, new Group(NoPartySubIDs, PartySubID).setField(PartySubID, 'y')),
      isFieldNotFound,
    );
    assert.throws(
      () => g.replaceGroup(1, new Group(NoPartyIDs, PartyID).setField(PartyID, 'y')),
      isFieldNotFound,
      'the slot is looked up under the replacement\'s own count tag',
    );
  });

  test('group indices must be integers', () => {
    const g = party('A', 1).addGroup(new Group(NoPartySubIDs, PartySubID).setField(PartySubID, 'x'));
    assert.throws(() => g.getGroup(1.5, NoPartySubIDs), TypeError, 'must not silently read entry 1');
    assert.throws(() => g.getGroup(Number.NaN, NoPartySubIDs), TypeError);
    assert.throws(() => g.getGroup('1' as unknown as number, NoPartySubIDs), TypeError);
    assert.throws(() => g.hasGroup(1.5, NoPartySubIDs), TypeError);
    assert.throws(() => g.removeGroup(1.5, NoPartySubIDs), TypeError);
    assert.throws(() => g.replaceGroup(1.5, new Group(NoPartySubIDs, PartySubID)), TypeError);
    assert.equal(g.groupCount(NoPartySubIDs), 1, 'nothing changed');
    assert.doesNotThrow(() => g.removeGroup(0, NoPartySubIDs), 'an out-of-range index is a no-op, as in QuickFIX');
    assert.equal(g.groupCount(NoPartySubIDs), 1);
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
