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
const isFieldNotFound = (err: unknown) => (err as QuickFixError).fixErrorName === 'FieldNotFound';

/** The body of a wire string: everything between the MsgType and the CheckSum. */
function body(raw: string): string {
  const start = raw.indexOf(`${SOH}35=`);
  const end = raw.lastIndexOf(`${SOH}10=`);
  assert.ok(start >= 0 && end > start, `unexpected wire string ${JSON.stringify(raw)}`);
  const afterMsgType = raw.indexOf(SOH, start + 1) + 1;
  return raw.slice(afterMsgType, end + 1);
}

/** Set the same body fields in a non-numeric sequence on `msg`. */
function fillOrder(msg: Message): Message {
  return msg
    .setField(FIELD.MsgType, MsgType.NewOrderSingle)
    .setField(FIELD.Symbol, 'AAPL')
    .setField(FIELD.OrderQty, 100)
    .setField(FIELD.Side, '1')
    .setField(FIELD.ClOrdID, 'ord-1')
    .setField(FIELD.OrdType, '2');
}

const CUSTOM_ORDER = [FIELD.Symbol, FIELD.OrderQty, FIELD.Side, FIELD.ClOrdID, FIELD.OrdType];

describe('Message body field order', () => {
  test('without an order the body sorts numerically (QuickFIX default)', () => {
    assert.equal(
      body(fillOrder(createMessage()).toString()),
      `11=ord-1${SOH}38=100${SOH}40=2${SOH}54=1${SOH}55=AAPL${SOH}`,
    );
  });

  test('an explicit order is followed, like FIX::Message(hdrOrder, trlOrder, order)', () => {
    const msg = fillOrder(createMessage(undefined, { order: CUSTOM_ORDER }));
    assert.equal(body(msg.toString()), `55=AAPL${SOH}38=100${SOH}54=1${SOH}11=ord-1${SOH}40=2${SOH}`);
    // Overwriting keeps the slot; tags outside the order follow it numerically.
    msg.setField(FIELD.OrderQty, 250).setField(FIELD.Text, 't').setField(FIELD.TransactTime, 'x');
    assert.equal(
      body(msg.toString()),
      `55=AAPL${SOH}38=250${SOH}54=1${SOH}11=ord-1${SOH}40=2${SOH}58=t${SOH}60=x${SOH}`,
    );
  });

  test('createMessage applies the order to pre-populated fields', () => {
    const msg = createMessage(
      { 55: 'AAPL', 38: 100, 11: 'a', [FIELD.MsgType]: MsgType.NewOrderSingle },
      { order: [55, 38, 11] },
    );
    assert.equal(body(msg.toString()), `55=AAPL${SOH}38=100${SOH}11=a${SOH}`);
  });

  test('an order also applies when parsing a raw string', () => {
    const raw = fillOrder(createMessage()).toString();
    const parsed = Message.parse(raw, { order: CUSTOM_ORDER });
    assert.equal(body(parsed.toString()), `55=AAPL${SOH}38=100${SOH}54=1${SOH}11=ord-1${SOH}40=2${SOH}`);
  });

  test('header fields keep the FIX layout regardless of the body order', () => {
    const raw = createMessage(undefined, { order: [55] })
      .setField(FIELD.MsgType, MsgType.NewOrderSingle)
      .setField(FIELD.Symbol, 'AAPL')
      .setField(FIELD.TargetCompID, 'T')
      .setField(FIELD.BeginString, 'FIX.4.4')
      .setField(FIELD.SenderCompID, 'S')
      .toString();
    assert.match(raw, new RegExp(`^8=FIX.4.4${SOH}9=\\d+${SOH}35=D${SOH}49=S${SOH}56=T${SOH}55=AAPL${SOH}10=\\d{3}${SOH}$`));
  });

  test('an ordered message with 16+ fields (binary-search lookups) answers lookups', () => {
    // QuickFIX switches from a linear scan to lower_bound with the sorter at
    // 16 fields, so lookups must agree with the explicit order.
    const tags = [55, 38, 54, 11, 40, 60, 1, 21, 100, 59, 15, 44, 18, 110, 111, 58, 526];
    const msg = createMessage(undefined, { order: tags }).setField(FIELD.MsgType, MsgType.NewOrderSingle);
    tags.forEach((tag, i) => msg.setField(tag, `v${i}`));
    assert.equal(body(msg.toString()), tags.map((tag, i) => `${tag}=v${i}${SOH}`).join(''));
    tags.forEach((tag, i) => {
      assert.equal(msg.hasField(tag), true);
      assert.equal(msg.getField(tag), `v${i}`);
    });
    assert.equal(msg.hasField(2), false); // unlisted, below the largest listed tag
    assert.equal(msg.hasField(9000), false); // unlisted, above it
    msg.setField(44, 'again').setField(2, 'late').setField(9000, 'later');
    assert.match(body(msg.toString()), new RegExp(`44=again${SOH}18=v12${SOH}.*526=v16${SOH}2=late${SOH}9000=later${SOH}$`));
  });

  test('hasField reports body, header and trailer fields', () => {
    const msg = fillOrder(createMessage());
    assert.equal(msg.hasField(FIELD.Symbol), true);
    assert.equal(msg.hasField(FIELD.MsgType), true);
    assert.equal(msg.hasField(FIELD.Text), false);
  });

  test('tag validation: sets need a positive integer, reads accept any integer', () => {
    const msg = createMessage();
    assert.throws(() => msg.setField(0, 'x'), TypeError);
    assert.throws(() => msg.setField(1.5, 'x'), TypeError);
    assert.throws(() => msg.setHeaderField(-1, 'x'), TypeError);
    assert.throws(() => msg.getField(0), isFieldNotFound);
    assert.throws(() => msg.getField(2000000), isFieldNotFound);
    assert.equal(msg.hasField(-5), false);
    assert.throws(() => msg.getField(1.5), TypeError);
  });

  test('order validation: integers in 1..100000, no non-arrays', () => {
    assert.throws(() => createMessage(undefined, { order: [0] }), TypeError);
    assert.throws(() => createMessage(undefined, { order: [100001] }), TypeError);
    assert.throws(() => createMessage(undefined, { order: [1.5] }), TypeError);
    assert.throws(() => createMessage(undefined, { order: 'x' as unknown as number[] }), TypeError);
  });

  test('a parsed message keeps repeated flat tags (group parsed without a dictionary)', () => {
    const raw = `8=FIX.4.4${SOH}9=0${SOH}35=D${SOH}11=A${SOH}453=2${SOH}448=P1${SOH}452=1${SOH}448=P2${SOH}452=3${SOH}10=000${SOH}`;
    const parsed = Message.parse(raw).setField(FIELD.Text, 'hi');
    const out = body(parsed.toString());
    assert.equal((out.match(/448=/g) ?? []).length, 2);
    assert.ok(out.includes('448=P1') && out.includes('448=P2'));
    assert.equal(parsed.groupCount(FIELD.NoPartyIDs), 0);
  });
});

describe('Group', () => {
  test('exposes its count and delimiter tags', () => {
    const g = new Group(FIELD.NoPartyIDs, FIELD.PartyID);
    assert.equal(g.countTag, FIELD.NoPartyIDs);
    assert.equal(g.delimiterTag, FIELD.PartyID);
  });

  test('without an order: delimiter first, then numeric (FIX::Group(field, delim))', () => {
    const g = new Group(FIELD.NoPartyIDs, FIELD.PartyID)
      .setField(FIELD.PartyRole, 11)
      .setField(FIELD.Text, 'x')
      .setField(FIELD.PartyIDSource, 'D')
      .setField(FIELD.PartyID, 'A');
    assert.equal(g.toString(), `448=A${SOH}58=x${SOH}447=D${SOH}452=11${SOH}`);
  });

  test('with an order: listed tags in sequence, others after them numerically', () => {
    const g = new Group(FIELD.NoPartyIDs, FIELD.PartyID, [
      FIELD.PartyID,
      FIELD.PartyRole,
      FIELD.PartyIDSource,
    ])
      .setField(FIELD.PartyIDSource, 'D')
      .setField(FIELD.Text, 'extra')
      .setField(FIELD.PartyID, 'A')
      .setField(FIELD.PartyRole, 11)
      .setField(FIELD.Side, '1');
    assert.equal(g.toString(), `448=A${SOH}452=11${SOH}447=D${SOH}54=1${SOH}58=extra${SOH}`);
  });

  test('an explicit order must start with the delimiter', () => {
    assert.throws(
      () => new Group(FIELD.NoPartyIDs, FIELD.PartyID, [FIELD.PartyRole, FIELD.PartyID]),
      /order must start with the delimiter tag/,
    );
  });

  test('getField on an absent tag throws FieldNotFound', () => {
    const g = new Group(FIELD.NoPartyIDs, FIELD.PartyID);
    assert.throws(() => g.getField(FIELD.PartyID), isFieldNotFound);
    assert.equal(g.hasField(FIELD.PartyID), false);
  });
});

describe('Message repeating groups', () => {
  const PARTY_ORDER = [FIELD.PartyID, FIELD.PartyRole, FIELD.PartyIDSource];

  function orderWithParties(): Message {
    const msg = fillOrder(createMessage(undefined, { order: [...CUSTOM_ORDER, FIELD.NoPartyIDs] }));
    const party = new Group(FIELD.NoPartyIDs, FIELD.PartyID, PARTY_ORDER);
    party.setField(FIELD.PartyID, 'A').setField(FIELD.PartyRole, 1).setField(FIELD.PartyIDSource, 'D');
    msg.addGroup(party);
    // Reuse the same Group object: addGroup copied the first instance.
    party.setField(FIELD.PartyID, 'B').setField(FIELD.PartyRole, 11);
    msg.addGroup(party);
    return msg;
  }

  test('addGroup sets the count tag and emits each instance after it', () => {
    const msg = orderWithParties().setField(FIELD.TransactTime, '20260101-00:00:00');
    assert.equal(
      body(msg.toString()),
      `55=AAPL${SOH}38=100${SOH}54=1${SOH}11=ord-1${SOH}40=2${SOH}` +
        `453=2${SOH}448=A${SOH}452=1${SOH}447=D${SOH}448=B${SOH}452=11${SOH}447=D${SOH}` +
        `60=20260101-00:00:00${SOH}`,
    );
  });

  test('without a body order the count tag sorts numerically with the rest', () => {
    const msg = createMessage()
      .setField(FIELD.MsgType, MsgType.NewOrderSingle)
      .setField(FIELD.Symbol, 'AAPL')
      .addGroup(new Group(FIELD.NoPartyIDs, FIELD.PartyID).setField(FIELD.PartyID, 'A'))
      .setField(FIELD.Text, 't');
    assert.equal(body(msg.toString()), `55=AAPL${SOH}58=t${SOH}453=1${SOH}448=A${SOH}`);
  });

  test('groupCount and getGroup read instances back (1-based)', () => {
    const msg = orderWithParties();
    assert.equal(msg.groupCount(FIELD.NoPartyIDs), 2);
    assert.equal(msg.getField(FIELD.NoPartyIDs), '2');
    const second = msg.getGroup(2, FIELD.NoPartyIDs);
    assert.equal(second.countTag, FIELD.NoPartyIDs);
    assert.equal(second.delimiterTag, FIELD.PartyID);
    assert.equal(second.getField(FIELD.PartyID), 'B');
    assert.equal(second.toString(), `448=B${SOH}452=11${SOH}447=D${SOH}`);
  });

  test('getGroup reports the right delimiter even when it was not set', () => {
    const noDelim = new Group(FIELD.NoPartyIDs, FIELD.PartyID).setField(FIELD.PartyRole, 1);
    const copy = createMessage().addGroup(noDelim).getGroup(1, FIELD.NoPartyIDs);
    assert.equal(copy.delimiterTag, FIELD.PartyID);
    copy.setField(FIELD.PartyID, 'A');
    assert.equal(copy.toString(), `448=A${SOH}452=1${SOH}`);
  });

  test('getGroup returns a copy; editing it does not touch the message', () => {
    const msg = orderWithParties();
    msg.getGroup(1, FIELD.NoPartyIDs).setField(FIELD.PartyID, 'changed');
    assert.equal(msg.getGroup(1, FIELD.NoPartyIDs).getField(FIELD.PartyID), 'A');
  });

  test('getGroup out of range / on a missing group throws FieldNotFound; index must be an integer', () => {
    const msg = orderWithParties();
    assert.throws(() => msg.getGroup(3, FIELD.NoPartyIDs), isFieldNotFound);
    assert.throws(() => msg.getGroup(0, FIELD.NoPartyIDs), isFieldNotFound);
    assert.throws(() => msg.getGroup(1, FIELD.NoPartySubIDs), isFieldNotFound);
    assert.equal(msg.groupCount(FIELD.NoPartySubIDs), 0);
    assert.throws(() => msg.getGroup(1.5, FIELD.NoPartyIDs), TypeError);
    assert.throws(() => msg.getGroup(Number.NaN, FIELD.NoPartyIDs), TypeError);
  });

  test('groups nest', () => {
    const sub = new Group(FIELD.NoPartySubIDs, FIELD.PartySubID)
      .setField(FIELD.PartySubID, 'desk-1')
      .setField(FIELD.PartySubIDType, 1);
    const party = new Group(FIELD.NoPartyIDs, FIELD.PartyID, [FIELD.PartyID, FIELD.NoPartySubIDs, FIELD.PartyRole])
      .setField(FIELD.PartyID, 'A')
      .addGroup(sub)
      .setField(FIELD.PartyRole, 1);
    const msg = createMessage().setField(FIELD.MsgType, MsgType.NewOrderSingle).addGroup(party);
    assert.equal(body(msg.toString()), `453=1${SOH}448=A${SOH}802=1${SOH}523=desk-1${SOH}803=1${SOH}452=1${SOH}`);
    const inner = msg.getGroup(1, FIELD.NoPartyIDs).getGroup(1, FIELD.NoPartySubIDs);
    assert.equal(inner.getField(FIELD.PartySubID), 'desk-1');
    assert.equal(inner.delimiterTag, FIELD.PartySubID);
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
    assert.match(msg.toString(), new RegExp(`35=D${SOH}627=1${SOH}628=HOP-1${SOH}55=AAPL${SOH}`));
  });

  test('addGroup rejects a non-Group argument', () => {
    assert.throws(() => createMessage().addGroup({} as unknown as Group), TypeError);
  });
});

describe('Message.parse with a dictionary', () => {
  const wire = () =>
    fillOrder(createMessage())
      .setField(FIELD.BeginString, 'FIX.4.4')
      .setField(FIELD.SenderCompID, 'S')
      .setField(FIELD.TargetCompID, 'T')
      .setField(FIELD.MsgSeqNum, 1)
      .setField(FIELD.SendingTime, '20260101-00:00:00')
      .setField(FIELD.TransactTime, '20260101-00:00:00')
      .addGroup(
        new Group(FIELD.NoPartyIDs, FIELD.PartyID, [FIELD.PartyID, FIELD.PartyRole, FIELD.PartyIDSource])
          .setField(FIELD.PartyID, 'A')
          .setField(FIELD.PartyRole, 1)
          .setField(FIELD.PartyIDSource, 'D')
          .addGroup(new Group(FIELD.NoPartySubIDs, FIELD.PartySubID).setField(FIELD.PartySubID, 'sub')),
      )
      .addGroup(new Group(FIELD.NoPartyIDs, FIELD.PartyID).setField(FIELD.PartyID, 'B'))
      .toString();

  test('recognises repeating groups and re-emits them in dictionary order', () => {
    const dictionary = DataDictionary.fromFile(DICT_PATH);
    const parsed = Message.parse(wire(), { dictionary });
    assert.equal(parsed.groupCount(FIELD.NoPartyIDs), 2);
    const first = parsed.getGroup(1, FIELD.NoPartyIDs);
    assert.equal(first.getField(FIELD.PartyRole), '1');
    assert.equal(first.delimiterTag, FIELD.PartyID);
    assert.equal(first.groupCount(FIELD.NoPartySubIDs), 1);
    assert.equal(first.getGroup(1, FIELD.NoPartySubIDs).getField(FIELD.PartySubID), 'sub');
    assert.equal(parsed.getGroup(2, FIELD.NoPartyIDs).getField(FIELD.PartyID), 'B');
    // The dictionary lists 448, 447, 452 then the sub group: parsed instances
    // carry that sorter, whatever order the wire had.
    assert.match(
      parsed.toString(),
      new RegExp(`453=2${SOH}448=A${SOH}447=D${SOH}452=1${SOH}802=1${SOH}523=sub${SOH}448=B${SOH}`),
    );
    dictionary.validate(parsed);
  });

  test('a copied dictionary-parsed group keeps the dictionary sorter for new fields', () => {
    const dictionary = DataDictionary.fromFile(DICT_PATH);
    const party = Message.parse(wire(), { dictionary }).getGroup(2, FIELD.NoPartyIDs);
    party.setField(FIELD.PartyRole, 7).setField(FIELD.PartyIDSource, 'D');
    assert.equal(party.toString(), `448=B${SOH}447=D${SOH}452=7${SOH}`);
  });

  test('without a dictionary the repeated tags are not grouped (QuickFIX behaviour)', () => {
    const parsed = Message.parse(wire());
    assert.equal(parsed.groupCount(FIELD.NoPartyIDs), 0);
    assert.equal(parsed.getField(FIELD.NoPartyIDs), '2');
  });

  test('rejects a dictionary option that is not a DataDictionary', () => {
    assert.throws(
      () => Message.parse(wire(), { dictionary: { nativeHandle: {} } as unknown as DataDictionary }),
      TypeError,
    );
  });
});
