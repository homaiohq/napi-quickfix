import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import {
  Message,
  Group,
  DataDictionary,
  createMessage,
  FIELD,
  MsgType,
  type QuickFixError,
} from '../dist/esm/index.js';

const SOH = '\x01';
const DICT_PATH = fileURLToPath(new URL('./fixtures/fix44-groups.xml', import.meta.url));

/** The body of a wire string: everything between the MsgType and the CheckSum. */
function body(raw: string): string {
  const start = raw.indexOf(`${SOH}35=`);
  const end = raw.lastIndexOf(`${SOH}10=`);
  assert.ok(start >= 0 && end > start, `unexpected wire string ${JSON.stringify(raw)}`);
  // Skip past "35=X<SOH>".
  const afterMsgType = raw.indexOf(SOH, start + 1) + 1;
  return raw.slice(afterMsgType, end + 1);
}

/** Build a NewOrderSingle whose body fields are deliberately NOT in numeric order. */
function orderWithoutGroups(): Message {
  return createMessage()
    .setField(FIELD.MsgType, MsgType.NewOrderSingle)
    .setField(FIELD.Symbol, 'AAPL')
    .setField(FIELD.OrderQty, 100)
    .setField(FIELD.Side, '1')
    .setField(FIELD.ClOrdID, 'ord-1')
    .setField(FIELD.OrdType, '2');
}

describe('Message body field order', () => {
  test('body fields go on the wire in the order they were set, never sorted', () => {
    const raw = orderWithoutGroups().toString();
    assert.equal(body(raw), `55=AAPL${SOH}38=100${SOH}54=1${SOH}11=ord-1${SOH}40=2${SOH}`);
  });

  test('overwriting an existing field keeps its position', () => {
    const msg = orderWithoutGroups().setField(FIELD.OrderQty, 250);
    assert.equal(body(msg.toString()), `55=AAPL${SOH}38=250${SOH}54=1${SOH}11=ord-1${SOH}40=2${SOH}`);
  });

  test('header fields still follow the FIX-mandated layout', () => {
    const raw = createMessage()
      .setField(FIELD.MsgType, MsgType.NewOrderSingle)
      .setField(FIELD.Symbol, 'AAPL')
      .setField(FIELD.TargetCompID, 'T')
      .setField(FIELD.BeginString, 'FIX.4.4')
      .setField(FIELD.SenderCompID, 'S')
      .toString();
    assert.match(raw, new RegExp(`^8=FIX.4.4${SOH}9=\\d+${SOH}35=D${SOH}49=S${SOH}56=T${SOH}55=AAPL${SOH}10=\\d{3}${SOH}$`));
  });

  test('a parsed message carries QuickFIX parse order; a new field is appended after it', () => {
    const parsed = Message.parse(orderWithoutGroups().toString());
    parsed.setField(FIELD.Text, 'late');
    // QuickFIX sorts a parsed body numerically (11, 38, 40, 54, 55); the field
    // set afterwards must come last rather than being slotted in by number.
    assert.equal(
      body(parsed.toString()),
      `11=ord-1${SOH}38=100${SOH}40=2${SOH}54=1${SOH}55=AAPL${SOH}58=late${SOH}`,
    );
  });

  test('hasField reports body, header and trailer fields', () => {
    const msg = orderWithoutGroups();
    assert.equal(msg.hasField(FIELD.Symbol), true);
    assert.equal(msg.hasField(FIELD.MsgType), true);
    assert.equal(msg.hasField(FIELD.Text), false);
  });

  test('setField rejects a tag outside 1..100000; reads accept any integer', () => {
    const msg = createMessage();
    assert.throws(() => msg.setField(0, 'x'), TypeError);
    assert.throws(() => msg.setField(1.5, 'x'), TypeError);
    assert.throws(() => msg.setField(100001, 'x'), TypeError);
    assert.throws(() => msg.setHeaderField(-1, 'x'), TypeError);
    // Reads keep the QuickFIX contract: an absent tag is FieldNotFound, not a TypeError.
    const isFieldNotFound = (err: unknown) => (err as QuickFixError).fixErrorName === 'FieldNotFound';
    assert.throws(() => msg.getField(0), isFieldNotFound);
    assert.throws(() => msg.getField(2000000), isFieldNotFound);
    assert.equal(msg.hasField(0), false);
    assert.equal(msg.hasField(2000000), false);
    assert.throws(() => msg.getField(1.5), TypeError);
  });

  test('a message with 16+ fields (binary-search lookups) keeps order and answers lookups', () => {
    // QuickFIX switches from a linear scan to lower_bound with the sorter at
    // 16 fields, so the custom order must stay a strict total order.
    const tags = [55, 38, 54, 11, 40, 60, 1, 21, 100, 59, 15, 44, 18, 110, 111, 58, 526];
    const msg = createMessage().setField(FIELD.MsgType, MsgType.NewOrderSingle);
    tags.forEach((tag, i) => msg.setField(tag, `v${i}`));
    assert.equal(body(msg.toString()), tags.map((tag, i) => `${tag}=v${i}${SOH}`).join(''));
    tags.forEach((tag, i) => {
      assert.equal(msg.hasField(tag), true);
      assert.equal(msg.getField(tag), `v${i}`);
    });
    // Tags not in the order array: one below the largest listed, one above.
    assert.equal(msg.hasField(2), false);
    assert.equal(msg.hasField(9000), false);
    msg.setField(44, 'again').setField(2, 'late');
    assert.match(body(msg.toString()), new RegExp(`44=again${SOH}18=v12${SOH}.*526=v16${SOH}2=late${SOH}$`));
  });
});

describe('Messages that cannot be reordered fall back to QuickFIX insertion', () => {
  /** Raw wire string with a lenient parse (no checksum / body-length check). */
  const raw = (bodyFields: string) =>
    `8=FIX.4.4${SOH}9=0${SOH}35=D${SOH}${bodyFields}10=000${SOH}`;

  test('repeated flat tags (group parsed without a dictionary) are all kept', () => {
    const parsed = Message.parse(
      raw(`11=A${SOH}55=X${SOH}453=2${SOH}448=P1${SOH}452=1${SOH}448=P2${SOH}452=3${SOH}`),
    );
    parsed.setField(FIELD.Text, 'hi');
    const out = body(parsed.toString());
    assert.equal((out.match(/448=/g) ?? []).length, 2, 'both PartyID occurrences must survive');
    assert.equal((out.match(/452=/g) ?? []).length, 2, 'both PartyRole occurrences must survive');
    assert.ok(out.includes('448=P1'), 'first party must survive');
    assert.ok(out.includes('448=P2'), 'second party must survive');
    assert.ok(out.includes(`58=hi${SOH}`));
    assert.equal(parsed.getField(FIELD.NoPartyIDs), '2');
  });

  test('a negative parsed tag does not corrupt memory on the next setField', () => {
    const parsed = Message.parse(raw(`-40=x${SOH}55=IBM${SOH}`));
    assert.equal(parsed.getField(-40), 'x');
    parsed.setField(FIELD.ClOrdID, 'a').setField(FIELD.Text, 'b');
    assert.equal(parsed.getField(FIELD.ClOrdID), 'a');
    assert.equal(parsed.getField(FIELD.Text), 'b');
    assert.equal(parsed.getField(55), 'IBM');
    assert.ok(body(parsed.toString()).includes('-40=x'));
  });

  test('a huge parsed tag does not trigger a giant order allocation', () => {
    const parsed = Message.parse(raw(`2000000000=big${SOH}55=IBM${SOH}`));
    const before = process.memoryUsage().rss;
    for (let i = 0; i < 20; i++) parsed.setField(100 + i, 'v');
    const grown = process.memoryUsage().rss - before;
    assert.ok(grown < 64 * 1024 * 1024, `rss grew by ${grown} bytes`);
    assert.equal(parsed.getField(2000000000), 'big');
    assert.equal(parsed.getField(119), 'v');
  });
});

describe('Group', () => {
  test('exposes its count and delimiter tags', () => {
    const g = new Group(FIELD.NoPartyIDs, FIELD.PartyID);
    assert.equal(g.countTag, FIELD.NoPartyIDs);
    assert.equal(g.delimiterTag, FIELD.PartyID);
  });

  test('fields are emitted in the order they were set', () => {
    const g = new Group(FIELD.NoPartyIDs, FIELD.PartyID)
      .setField(FIELD.PartyID, 'A')
      .setField(FIELD.PartyRole, 11)
      .setField(FIELD.PartyIDSource, 'D');
    assert.equal(g.toString(), `448=A${SOH}452=11${SOH}447=D${SOH}`);
  });

  test('the delimiter always comes first, even when set last', () => {
    const g = new Group(FIELD.NoPartyIDs, FIELD.PartyID)
      .setField(FIELD.PartyRole, 11)
      .setField(FIELD.PartyIDSource, 'D')
      .setField(FIELD.PartyID, 'A');
    assert.equal(g.toString(), `448=A${SOH}452=11${SOH}447=D${SOH}`);
  });

  test('an explicit order pins listed tags; unlisted ones follow in set order', () => {
    const g = new Group(FIELD.NoPartyIDs, FIELD.PartyID, [
      FIELD.PartyID,
      FIELD.PartyIDSource,
      FIELD.PartyRole,
    ])
      .setField(FIELD.PartyRole, 11)
      .setField(FIELD.Text, 'extra')
      .setField(FIELD.PartyID, 'A')
      .setField(FIELD.PartyIDSource, 'D');
    assert.equal(g.toString(), `448=A${SOH}447=D${SOH}452=11${SOH}58=extra${SOH}`);
  });

  test('an explicit order must start with the delimiter', () => {
    assert.throws(
      () => new Group(FIELD.NoPartyIDs, FIELD.PartyID, [FIELD.PartyRole, FIELD.PartyID]),
      /order must start with the delimiter tag/,
    );
  });

  test('getGroup index must be an integer', () => {
    const msg = createMessage().addGroup(
      new Group(FIELD.NoPartyIDs, FIELD.PartyID).setField(FIELD.PartyID, 'A'),
    );
    assert.throws(() => msg.getGroup(1.5, FIELD.NoPartyIDs), TypeError);
    assert.throws(() => msg.getGroup(Number.NaN, FIELD.NoPartyIDs), TypeError);
    assert.equal(msg.getGroup(1, FIELD.NoPartyIDs).getField(FIELD.PartyID), 'A');
  });

  test('a group without its delimiter set cannot be added', () => {
    const noDelim = new Group(FIELD.NoPartyIDs, FIELD.PartyID).setField(FIELD.PartyRole, 1);
    assert.throws(() => createMessage().addGroup(noDelim), /delimiter field 448 must be set/);
    assert.throws(
      () => new Group(FIELD.NoPartyIDs, FIELD.PartyID).setField(FIELD.PartyID, 'A').addGroup(noDelim),
      /delimiter field 448 must be set/,
    );
    noDelim.setField(FIELD.PartyID, 'A');
    const msg = createMessage().addGroup(noDelim);
    const copy = msg.getGroup(1, FIELD.NoPartyIDs);
    assert.equal(copy.delimiterTag, FIELD.PartyID);
    assert.equal(copy.toString(), `448=A${SOH}452=1${SOH}`);
  });

  test('header groups (NoHops) are routed to the header', () => {
    const hop = new Group(FIELD.NoHops, FIELD.HopCompID).setField(FIELD.HopCompID, 'HOP-1');
    const msg = createMessage()
      .setField(FIELD.MsgType, MsgType.NewOrderSingle)
      .setField(FIELD.Symbol, 'AAPL')
      .addGroup(hop);
    assert.equal(msg.groupCount(FIELD.NoHops), 1);
    assert.equal(msg.hasField(FIELD.NoHops), true);
    assert.equal(msg.getGroup(1, FIELD.NoHops).getField(FIELD.HopCompID), 'HOP-1');
    assert.equal(msg.getHeaderField(FIELD.NoHops), '1');
    // The hop group sits in the header, before the body.
    assert.match(msg.toString(), new RegExp(`35=D${SOH}627=1${SOH}628=HOP-1${SOH}55=AAPL${SOH}`));
  });

  test('getField on an absent tag throws FieldNotFound', () => {
    const g = new Group(FIELD.NoPartyIDs, FIELD.PartyID);
    assert.throws(
      () => g.getField(FIELD.PartyID),
      (err: unknown) => (err as QuickFixError).fixErrorName === 'FieldNotFound',
    );
    assert.equal(g.hasField(FIELD.PartyID), false);
  });
});

describe('Message repeating groups', () => {
  function orderWithParties(): Message {
    const msg = orderWithoutGroups();
    const party = new Group(FIELD.NoPartyIDs, FIELD.PartyID);
    party.setField(FIELD.PartyID, 'A').setField(FIELD.PartyRole, 1).setField(FIELD.PartyIDSource, 'D');
    msg.addGroup(party);
    // Reuse the same Group object: addGroup copied the first instance.
    party.setField(FIELD.PartyID, 'B').setField(FIELD.PartyRole, 11);
    msg.addGroup(party);
    return msg;
  }

  test('addGroup places the count tag where it was added and emits each instance in order', () => {
    const msg = orderWithParties().setField(FIELD.TransactTime, '20260101-00:00:00');
    assert.equal(
      body(msg.toString()),
      `55=AAPL${SOH}38=100${SOH}54=1${SOH}11=ord-1${SOH}40=2${SOH}` +
        `453=2${SOH}448=A${SOH}452=1${SOH}447=D${SOH}448=B${SOH}452=11${SOH}447=D${SOH}` +
        `60=20260101-00:00:00${SOH}`,
    );
  });

  test('groupCount and getGroup read instances back (1-based)', () => {
    const msg = orderWithParties();
    assert.equal(msg.groupCount(FIELD.NoPartyIDs), 2);
    assert.equal(msg.getField(FIELD.NoPartyIDs), '2');
    const second = msg.getGroup(2, FIELD.NoPartyIDs);
    assert.equal(second.countTag, FIELD.NoPartyIDs);
    assert.equal(second.delimiterTag, FIELD.PartyID);
    assert.equal(second.getField(FIELD.PartyID), 'B');
    assert.equal(second.getField(FIELD.PartyRole), '11');
    assert.equal(second.toString(), `448=B${SOH}452=11${SOH}447=D${SOH}`);
  });

  test('getGroup returns a copy; editing it does not touch the message', () => {
    const msg = orderWithParties();
    msg.getGroup(1, FIELD.NoPartyIDs).setField(FIELD.PartyID, 'changed');
    assert.equal(msg.getGroup(1, FIELD.NoPartyIDs).getField(FIELD.PartyID), 'A');
  });

  test('getGroup out of range / on a missing group throws FieldNotFound', () => {
    const msg = orderWithParties();
    const isFieldNotFound = (err: unknown) => (err as QuickFixError).fixErrorName === 'FieldNotFound';
    assert.throws(() => msg.getGroup(3, FIELD.NoPartyIDs), isFieldNotFound);
    assert.throws(() => msg.getGroup(0, FIELD.NoPartyIDs), isFieldNotFound);
    assert.throws(() => msg.getGroup(1, FIELD.NoPartySubIDs), isFieldNotFound);
    assert.equal(msg.groupCount(FIELD.NoPartySubIDs), 0);
  });

  test('groups nest', () => {
    const sub = new Group(FIELD.NoPartySubIDs, FIELD.PartySubID)
      .setField(FIELD.PartySubID, 'desk-1')
      .setField(FIELD.PartySubIDType, 1);
    const party = new Group(FIELD.NoPartyIDs, FIELD.PartyID)
      .setField(FIELD.PartyID, 'A')
      .addGroup(sub)
      .setField(FIELD.PartyRole, 1);
    const msg = createMessage().setField(FIELD.MsgType, MsgType.NewOrderSingle).addGroup(party);

    assert.equal(
      body(msg.toString()),
      `453=1${SOH}448=A${SOH}802=1${SOH}523=desk-1${SOH}803=1${SOH}452=1${SOH}`,
    );
    const inner = msg.getGroup(1, FIELD.NoPartyIDs).getGroup(1, FIELD.NoPartySubIDs);
    assert.equal(inner.getField(FIELD.PartySubID), 'desk-1');
  });

  test('addGroup rejects a non-Group argument', () => {
    const msg = createMessage();
    assert.throws(() => msg.addGroup({} as unknown as Group), TypeError);
  });
});

describe('Message.parse with a dictionary', () => {
  const wire = () =>
    orderWithoutGroups()
      .setField(FIELD.BeginString, 'FIX.4.4')
      .setField(FIELD.SenderCompID, 'S')
      .setField(FIELD.TargetCompID, 'T')
      .setField(FIELD.MsgSeqNum, 1)
      .setField(FIELD.SendingTime, '20260101-00:00:00')
      .setField(FIELD.TransactTime, '20260101-00:00:00')
      .addGroup(
        new Group(FIELD.NoPartyIDs, FIELD.PartyID)
          .setField(FIELD.PartyID, 'A')
          .setField(FIELD.PartyRole, 1)
          .setField(FIELD.PartyIDSource, 'D'),
      )
      .addGroup(new Group(FIELD.NoPartyIDs, FIELD.PartyID).setField(FIELD.PartyID, 'B'))
      .toString();

  test('recognises repeating groups and re-emits them intact', () => {
    const dictionary = DataDictionary.fromFile(DICT_PATH);
    const parsed = Message.parse(wire(), { dictionary });
    assert.equal(parsed.groupCount(FIELD.NoPartyIDs), 2);
    assert.equal(parsed.getGroup(1, FIELD.NoPartyIDs).getField(FIELD.PartyRole), '1');
    assert.equal(parsed.getGroup(2, FIELD.NoPartyIDs).getField(FIELD.PartyID), 'B');
    // Parsed instances re-emit in the dictionary's field order (448, 447, 452),
    // not the wire order they arrived in: QuickFIX builds parsed groups with
    // the dictionary sorter. Only messages built here keep insertion order.
    assert.match(
      parsed.toString(),
      new RegExp(`453=2${SOH}448=A${SOH}447=D${SOH}452=1${SOH}448=B${SOH}`),
      'group instances must survive re-serialisation',
    );
    dictionary.validate(parsed);
  });

  test('getGroup on a dictionary-parsed message reports the dictionary delimiter', () => {
    const dictionary = DataDictionary.fromFile(DICT_PATH);
    const parsed = Message.parse(wire(), { dictionary });
    const second = parsed.getGroup(2, FIELD.NoPartyIDs);
    assert.equal(second.delimiterTag, FIELD.PartyID);
    assert.equal(second.countTag, FIELD.NoPartyIDs);
  });

  test('a copied dictionary-parsed group accepts new fields after its existing ones', () => {
    const dictionary = DataDictionary.fromFile(DICT_PATH);
    const nested = orderWithoutGroups()
      .setField(FIELD.BeginString, 'FIX.4.4')
      .addGroup(
        new Group(FIELD.NoPartyIDs, FIELD.PartyID)
          .setField(FIELD.PartyID, 'A')
          .addGroup(new Group(FIELD.NoPartySubIDs, FIELD.PartySubID).setField(FIELD.PartySubID, 'sub')),
      )
      .toString();
    const party = Message.parse(nested, { dictionary }).getGroup(1, FIELD.NoPartyIDs);
    assert.equal(party.groupCount(FIELD.NoPartySubIDs), 1);
    const sub = party.getGroup(1, FIELD.NoPartySubIDs);
    sub.setField(FIELD.PartySubIDType, 2);
    assert.equal(sub.toString(), `523=sub${SOH}803=2${SOH}`);
    party.setField(FIELD.PartyRole, 7).setField(FIELD.PartyIDSource, 'D');
    // Fields set on the copy are appended after the ones it already had.
    assert.equal(party.toString(), `448=A${SOH}802=1${SOH}523=sub${SOH}452=7${SOH}447=D${SOH}`);
  });

  test('without a dictionary the repeated tags are not grouped (QuickFIX behaviour)', () => {
    const parsed = Message.parse(wire());
    assert.equal(parsed.groupCount(FIELD.NoPartyIDs), 0);
    assert.equal(parsed.getField(FIELD.NoPartyIDs), '2');
  });

  test('rejects a dictionary option that is not a DataDictionary', () => {
    assert.throws(
      () =>
        Message.parse(wire(), {
          dictionary: { nativeHandle: {} } as unknown as DataDictionary,
        }),
      TypeError,
    );
  });
});
