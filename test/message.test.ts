import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  Message,
  Group,
  createMessage,
  parseMessage,
  FIELD,
  MsgType,
  Side,
} from '../dist/esm/index.js';
import { loadFix44Mini } from './fixtures/dictionary.js';

const SOH = '\x01';

describe('Message', () => {
  test('constructs empty and round-trips a body field (string)', () => {
    const msg = new Message();
    msg.setField(55, 'AAPL');
    assert.equal(msg.getField(55), 'AAPL');
  });

  test('coerces numeric field values to strings on the wire', () => {
    const msg = new Message();
    msg.setField(FIELD.OrderQty ?? 38, 100);
    // FIX is string-on-the-wire; numbers are stringified.
    assert.equal(msg.getField(FIELD.OrderQty ?? 38), '100');
  });

  test('setField is chainable (returns this)', () => {
    const msg = new Message();
    const ret = msg.setField(55, 'AAPL').setField(38, 10);
    assert.equal(ret, msg);
    assert.equal(msg.getField(55), 'AAPL');
    assert.equal(msg.getField(38), '10');
  });

  test('auto-routes MsgType (tag 35) to the header', () => {
    const msg = createMessage().setField(FIELD.MsgType, MsgType.NewOrderSingle);
    // Readable both via getMsgType() and getHeaderField(35).
    assert.equal(msg.getMsgType(), MsgType.NewOrderSingle);
    assert.equal(msg.getHeaderField(FIELD.MsgType), MsgType.NewOrderSingle);
  });

  test('auto-routes BeginString / CompID header fields', () => {
    const msg = createMessage()
      .setField(FIELD.BeginString ?? 8, 'FIX.4.4')
      .setField(FIELD.SenderCompID ?? 49, 'SENDER')
      .setField(FIELD.TargetCompID ?? 56, 'TARGET');
    assert.equal(msg.getHeaderField(FIELD.BeginString ?? 8), 'FIX.4.4');
    assert.equal(msg.getHeaderField(FIELD.SenderCompID ?? 49), 'SENDER');
    assert.equal(msg.getHeaderField(FIELD.TargetCompID ?? 56), 'TARGET');
  });

  test('keeps body fields in the body', () => {
    const msg = createMessage()
      .setField(FIELD.MsgType, MsgType.NewOrderSingle)
      .setField(55, 'AAPL')
      .setField(54, Side.Buy)
      .setField(38, 100);
    assert.equal(msg.getField(55), 'AAPL');
    assert.equal(msg.getField(54), Side.Buy);
    assert.equal(msg.getField(38), '100');
  });

  test('toString() emits a SOH-delimited wire string with BodyLength + CheckSum', () => {
    const msg = createMessage()
      .setField(FIELD.MsgType, MsgType.NewOrderSingle)
      .setField(55, 'AAPL')
      .setField(38, 100);
    const raw = msg.toString();
    assert.ok(raw.includes(SOH), 'expected SOH separators');
    // BodyLength (tag 9) and CheckSum (tag 10) are recomputed by the engine.
    assert.match(raw, new RegExp(`9=\\d+${SOH}`), 'expected recomputed BodyLength');
    assert.match(raw, new RegExp(`${SOH}10=\\d{3}${SOH}$`), 'expected 3-digit CheckSum trailer');
  });

  test('toPretty() renders SOH as "|"', () => {
    const msg = createMessage().setField(FIELD.MsgType, MsgType.Heartbeat).setField(112, 'x');
    const pretty = msg.toPretty();
    assert.ok(pretty.includes('|'), 'expected | separators');
    assert.ok(!pretty.includes(SOH), 'pretty output must not contain raw SOH');
    assert.ok(pretty.includes('35=0'), 'expected MsgType rendered');
  });

  test('Message.parse extracts fields from a raw FIX string', () => {
    const source = createMessage()
      .setField(FIELD.BeginString ?? 8, 'FIX.4.4')
      .setField(FIELD.MsgType, MsgType.NewOrderSingle)
      .setField(FIELD.SenderCompID ?? 49, 'S')
      .setField(FIELD.TargetCompID ?? 56, 'T')
      .setField(34, 1)
      .setField(52, '20260101-00:00:00')
      .setField(55, 'AAPL')
      .setField(38, 100);
    const raw = source.toString();

    const parsed = Message.parse(raw);
    assert.equal(parsed.getMsgType(), MsgType.NewOrderSingle);
    assert.equal(parsed.getField(55), 'AAPL');
    assert.equal(parsed.getField(38), '100');
    assert.equal(parsed.getHeaderField(FIELD.SenderCompID ?? 49), 'S');
  });

  test('parse -> toString -> parse round-trips field values', () => {
    const original = createMessage()
      .setField(FIELD.BeginString ?? 8, 'FIX.4.4')
      .setField(FIELD.MsgType, MsgType.NewOrderSingle)
      .setField(FIELD.SenderCompID ?? 49, 'S')
      .setField(FIELD.TargetCompID ?? 56, 'T')
      .setField(34, 7)
      .setField(52, '20260101-12:34:56')
      .setField(55, 'MSFT')
      .setField(38, 42);
    const raw1 = original.toString();
    const round = Message.parse(Message.parse(raw1).toString());
    assert.equal(round.getMsgType(), MsgType.NewOrderSingle);
    assert.equal(round.getField(55), 'MSFT');
    assert.equal(round.getField(38), '42');
    assert.equal(round.getHeaderField(34), '7');
  });

  test('createMessage pre-populates body fields from a map', () => {
    const msg = createMessage({ 55: 'AAPL', 38: 100, [FIELD.MsgType]: MsgType.NewOrderSingle });
    assert.equal(msg.getField(55), 'AAPL');
    assert.equal(msg.getField(38), '100');
    assert.equal(msg.getMsgType(), MsgType.NewOrderSingle);
  });

  test('parseMessage helper is equivalent to Message.parse', () => {
    const raw = createMessage()
      .setField(FIELD.MsgType, MsgType.Heartbeat)
      .setField(112, 'ping')
      .toString();
    const a = parseMessage(raw);
    assert.equal(a.getMsgType(), MsgType.Heartbeat);
    assert.equal(a.getField(112), 'ping');
  });

  test('toJSON() returns { msgType, raw } with a matching raw string', () => {
    const msg = createMessage().setField(FIELD.MsgType, MsgType.NewOrderSingle).setField(55, 'AAPL');
    const json = msg.toJSON();
    assert.equal(json.msgType, MsgType.NewOrderSingle);
    assert.equal(json.raw, msg.toString());
    assert.ok(json.raw.includes(SOH));
  });
});

// Builds a complete NewOrderSingle (with every field the mini dictionary
// requires) so the serialized form can be parsed back structurally.
function newOrderSingle(): Message {
  return createMessage()
    .setField(FIELD.BeginString, 'FIX.4.4')
    .setField(FIELD.MsgType, MsgType.NewOrderSingle)
    .setField(FIELD.SenderCompID, 'S')
    .setField(FIELD.TargetCompID, 'T')
    .setField(FIELD.MsgSeqNum, 1)
    .setField(FIELD.SendingTime, '20260101-00:00:00')
    .setField(FIELD.ClOrdID, 'order-1')
    .setField(FIELD.Symbol, 'AAPL')
    .setField(FIELD.Side, Side.Buy)
    .setField(FIELD.TransactTime, '20260101-00:00:00')
    .setField(FIELD.OrdType, '1');
}

function party(id: string, role: number): Group {
  return new Group(FIELD.NoPartyIDs, FIELD.PartyID)
    .setField(FIELD.PartyID, id)
    .setField(FIELD.PartyIDSource, 'D')
    .setField(FIELD.PartyRole, role);
}

const isFieldNotFound = (err: any) => {
  assert.equal(err.name, 'QuickFixError');
  assert.equal(err.fixErrorName, 'FieldNotFound');
  return true;
};

describe('Message field-map API', () => {
  test('isSetField / getFieldIfSet / removeField with header auto-routing', () => {
    const msg = createMessage().setField(FIELD.MsgType, MsgType.Heartbeat).setField(112, 'ping');
    assert.equal(msg.isSetField(112), true);
    assert.equal(msg.isSetField(FIELD.MsgType), true, 'routed to the header');
    assert.equal(msg.isSetField(58), false);
    assert.equal(msg.getFieldIfSet(112), 'ping');
    assert.equal(msg.getFieldIfSet(58), undefined);

    msg.removeField(112);
    assert.equal(msg.isSetField(112), false);
    assert.doesNotThrow(() => msg.removeField(112), 'removing an absent field is a no-op');
    msg.removeField(FIELD.MsgType);
    assert.equal(msg.isSetField(FIELD.MsgType), false, 'header removal is routed too');
  });

  test('tag validation: sets need a positive integer, reads accept any integer', () => {
    const msg = createMessage();
    assert.throws(() => msg.setField(0, 'x'), TypeError);
    assert.throws(() => msg.setField(1.5, 'x'), TypeError);
    assert.throws(() => msg.setHeaderField(-1, 'x'), TypeError);
    assert.throws(() => msg.setTrailerField(Number.NaN, 'x'), TypeError);
    assert.equal(msg.isEmpty(), true);
    assert.deepEqual(msg.headerFields(), []);

    assert.throws(() => msg.getField(0), isFieldNotFound);
    assert.throws(() => msg.getField(2000000), isFieldNotFound);
    assert.equal(msg.isSetField(-5), false);
    assert.throws(() => msg.getField(1.5), TypeError);
    assert.throws(() => msg.getHeaderField('35' as unknown as number), TypeError);
  });

  test('isEmpty / totalFields / fields / iteration / headerFields / trailerFields / clear', () => {
    const msg = createMessage();
    assert.equal(msg.isEmpty(), true);
    msg.setField(FIELD.MsgType, MsgType.NewOrderSingle).setField(55, 'AAPL').setField(38, 100);
    assert.equal(msg.isEmpty(), false);
    assert.equal(msg.totalFields(), 2, 'body fields only');
    assert.deepEqual(msg.fields(), [
      [38, '100'],
      [55, 'AAPL'],
    ]);
    assert.deepEqual([...msg], msg.fields());
    assert.deepEqual(msg.headerFields(), [[35, 'D']]);
    assert.deepEqual(msg.trailerFields(), []);

    msg.clear();
    assert.equal(msg.isEmpty(), true);
    assert.deepEqual(msg.headerFields(), []);
  });
});

describe('Message repeating groups', () => {
  test('addGroup emits entries after the count field, in insertion order', () => {
    const msg = newOrderSingle().addGroup(party('A', 1)).addGroup(party('B', 11));
    assert.equal(msg.groupCount(FIELD.NoPartyIDs), 2);
    assert.equal(msg.hasGroup(FIELD.NoPartyIDs), true);
    assert.equal(msg.hasGroup(2, FIELD.NoPartyIDs), true);
    assert.equal(msg.hasGroup(3, FIELD.NoPartyIDs), false);
    assert.equal(msg.getField(FIELD.NoPartyIDs), '2', 'count field is maintained');

    const raw = msg.toString();
    assert.ok(
      raw.includes(`${SOH}453=2${SOH}448=A${SOH}447=D${SOH}452=1${SOH}448=B${SOH}447=D${SOH}452=11${SOH}`),
      `expected the group block in wire order, got ${msg.toPretty()}`,
    );
    assert.equal(msg.totalFields(), 5 + 1 + 6, 'body fields + count + every entry field');
  });

  test('getGroup returns a snapshot; replaceGroup writes it back; removeGroup', () => {
    const msg = newOrderSingle().addGroup(party('A', 1)).addGroup(party('B', 11));

    const first = msg.getGroup(1, FIELD.NoPartyIDs);
    assert.equal(first.field, 453);
    assert.equal(first.delim, 448);
    assert.equal(first.getField(FIELD.PartyID), 'A');
    first.setField(FIELD.PartyID, 'Z');
    assert.equal(msg.getGroup(1, FIELD.NoPartyIDs).getField(FIELD.PartyID), 'A', 'snapshot is detached');

    msg.replaceGroup(1, first);
    assert.equal(msg.getGroup(1, FIELD.NoPartyIDs).getField(FIELD.PartyID), 'Z');

    msg.removeGroup(1, FIELD.NoPartyIDs);
    assert.equal(msg.groupCount(FIELD.NoPartyIDs), 1);
    assert.equal(msg.getGroup(1, FIELD.NoPartyIDs).getField(FIELD.PartyID), 'B');
    msg.removeGroup(FIELD.NoPartyIDs);
    assert.equal(msg.hasGroup(FIELD.NoPartyIDs), false);
    assert.equal(msg.isSetField(FIELD.NoPartyIDs), false, 'the count field goes with the last entry');
  });

  test('header groups (NoHops) route to the header, like header fields', () => {
    const hop = (id: string) => new Group(FIELD.NoHops, FIELD.HopCompID).setField(FIELD.HopCompID, id);
    const msg = newOrderSingle().addGroup(hop('HOP-1')).addGroup(hop('HOP-2'));
    assert.equal(msg.groupCount(FIELD.NoHops), 2);
    assert.equal(msg.hasGroup(FIELD.NoHops), true);
    assert.equal(msg.getHeaderField(FIELD.NoHops), '2', 'the count field lives in the header');
    assert.equal(msg.getField(FIELD.NoHops), '2', 'and auto-routes');
    assert.equal(msg.getGroup(2, FIELD.NoHops).getField(FIELD.HopCompID), 'HOP-2');
    assert.deepEqual(msg.fields().map(([tag]) => tag).includes(FIELD.NoHops), false, 'not a body field');
    assert.ok(
      msg.toString().includes(`${SOH}56=T${SOH}627=2${SOH}628=HOP-1${SOH}628=HOP-2${SOH}11=order-1${SOH}`),
      `expected the hops after the header fields, got ${msg.toPretty()}`,
    );
    msg.removeGroup(FIELD.NoHops);
    assert.equal(msg.isSetField(FIELD.NoHops), false);
  });

  test('addGroup / replaceGroup reject anything that is not a Group', () => {
    const msg = newOrderSingle().addGroup(party('A', 1));
    assert.throws(() => msg.addGroup({} as unknown as Group), TypeError);
    assert.throws(() => msg.addGroup({ field: 453, delim: 448 } as unknown as Group), TypeError);
    assert.throws(() => msg.replaceGroup(1, {} as unknown as Group), TypeError);
    assert.equal(msg.groupCount(FIELD.NoPartyIDs), 1);
  });

  test('getGroup on a missing group throws QuickFixError FieldNotFound', () => {
    const msg = newOrderSingle();
    assert.throws(() => msg.getGroup(1, FIELD.NoPartyIDs), isFieldNotFound, 'no such group');
    msg.addGroup(party('A', 1));
    assert.throws(() => msg.getGroup(2, FIELD.NoPartyIDs), isFieldNotFound, 'index out of range');
    assert.throws(() => msg.replaceGroup(2, party('C', 1)), isFieldNotFound, 'replace out of range');
  });

  test('parse with a dictionary reads each group back, nested groups included', () => {
    const dd = loadFix44Mini();
    const source = newOrderSingle()
      .addGroup(party('A', 1))
      .addGroup(
        party('B', 11).addGroup(
          new Group(FIELD.NoPartySubIDs, FIELD.PartySubID)
            .setField(FIELD.PartySubID, 'desk-7')
            .setField(FIELD.PartySubIDType, 2),
        ),
      );
    const raw = source.toString();

    const parsed = Message.parse(raw, { dictionary: dd });
    assert.equal(parsed.groupCount(FIELD.NoPartyIDs), 2);
    const a = parsed.getGroup(1, FIELD.NoPartyIDs);
    assert.equal(a.getField(FIELD.PartyID), 'A');
    assert.equal(a.getField(FIELD.PartyRole), '1');
    assert.equal(a.delim, FIELD.PartyID, 'delimiter recovered from the dictionary');
    assert.deepEqual(a.fields(), [
      [448, 'A'],
      [447, 'D'],
      [452, '1'],
    ]);
    const b = parsed.getGroup(2, FIELD.NoPartyIDs);
    assert.equal(b.getField(FIELD.PartyID), 'B');
    assert.equal(b.groupCount(FIELD.NoPartySubIDs), 1);
    assert.equal(b.getGroup(1, FIELD.NoPartySubIDs).getField(FIELD.PartySubID), 'desk-7');

    // Structural parse is lossless on the wire and validates.
    assert.equal(parsed.toString(), raw);
    assert.doesNotThrow(() => dd.validate(parsed));
    assert.equal(parsed.getField(FIELD.Symbol), 'AAPL', 'plain fields still readable');
  });

  test('parse with a dictionary re-emits entries in dictionary order, whatever the wire order', () => {
    const dd = loadFix44Mini();
    // Built with an explicit order that puts PartyRole before PartyIDSource,
    // the opposite of the dictionary (448, 447, 452, then the sub group).
    const raw = newOrderSingle()
      .addGroup(
        new Group(FIELD.NoPartyIDs, FIELD.PartyID, [448, 452, 447])
          .setField(FIELD.PartyID, 'A')
          .setField(FIELD.PartyRole, 1)
          .setField(FIELD.PartyIDSource, 'D')
          .addGroup(new Group(FIELD.NoPartySubIDs, FIELD.PartySubID).setField(FIELD.PartySubID, 'sub')),
      )
      .addGroup(new Group(FIELD.NoPartyIDs, FIELD.PartyID).setField(FIELD.PartyID, 'B'))
      .toString();
    assert.ok(raw.includes(`448=A${SOH}452=1${SOH}447=D${SOH}802=1${SOH}`), 'the wire has the custom order');

    const parsed = Message.parse(raw, { dictionary: dd });
    assert.ok(
      parsed.toString().includes(`${SOH}453=2${SOH}448=A${SOH}447=D${SOH}452=1${SOH}802=1${SOH}523=sub${SOH}448=B${SOH}10=`),
      `expected dictionary order, got ${parsed.toPretty()}`,
    );
    assert.deepEqual(parsed.getGroup(1, FIELD.NoPartyIDs).fields(), [
      [448, 'A'],
      [447, 'D'],
      [452, '1'],
      [802, '1'],
    ]);

    // A snapshot of a parsed entry keeps the dictionary order for fields added
    // afterwards, so it can be edited and written back without reordering.
    const b = parsed.getGroup(2, FIELD.NoPartyIDs).setField(FIELD.PartyRole, 7).setField(FIELD.PartyIDSource, 'D');
    assert.equal(b.delim, FIELD.PartyID);
    assert.equal(b.toString(), `448=B${SOH}447=D${SOH}452=7${SOH}`);
    parsed.replaceGroup(2, b);
    assert.ok(parsed.toString().includes(`448=B${SOH}447=D${SOH}452=7${SOH}10=`));
    assert.doesNotThrow(() => dd.validate(parsed));
  });

  test('parse with a session/application dictionary pair (and validate: true)', () => {
    const dd = loadFix44Mini();
    const raw = newOrderSingle().addGroup(party('A', 1)).toString();
    const parsed = Message.parse(raw, {
      validate: true,
      sessionDictionary: dd,
      applicationDictionary: dd,
    });
    assert.equal(parsed.groupCount(FIELD.NoPartyIDs), 1);
    assert.equal(parsed.getGroup(1, FIELD.NoPartyIDs).getField(FIELD.PartyID), 'A');
  });

  test('a flat parse (no dictionary) behaves as before: no groups, fields kept flat', () => {
    const raw = newOrderSingle().addGroup(party('A', 1)).addGroup(party('B', 11)).toString();
    const flat = Message.parse(raw);
    assert.equal(flat.hasGroup(FIELD.NoPartyIDs), false);
    assert.equal(flat.groupCount(FIELD.NoPartyIDs), 0);
    assert.equal(flat.getField(FIELD.NoPartyIDs), '2', 'the count is just a body field');
    assert.equal(flat.isSetField(FIELD.PartyID), true, 'group fields are plain body fields');
    assert.equal(flat.getField(FIELD.Symbol), 'AAPL');
    assert.throws(() => flat.getGroup(1, FIELD.NoPartyIDs), isFieldNotFound);

    // The repeated tags are all kept (QuickFIX keeps duplicates on a flat
    // parse) and survive an edit + re-serialisation, sorted by tag number.
    const tags = flat.fields().map(([tag]) => tag);
    assert.deepEqual(
      tags.filter((t) => t === FIELD.PartyID),
      [448, 448],
      'both PartyIDs are there',
    );
    assert.equal(flat.totalFields(), 5 + 1 + 6, 'the same number of fields as the structured message');
    const out = flat.setField(FIELD.Text, 'hi').toString();
    assert.ok(out.includes(`447=D${SOH}448=A${SOH}448=B${SOH}452=1${SOH}452=11${SOH}453=2${SOH}`), `got ${flat.toPretty()}`);
  });
});
