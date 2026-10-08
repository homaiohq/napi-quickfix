import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  Message,
  createMessage,
  parseMessage,
  FIELD,
  MsgType,
  Side,
} from '../dist/esm/index.js';

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

describe('Message.addGroup', () => {
  // Body section of the wire string, '|'-delimited, without 8/9/35/10.
  const body = (msg: Message) =>
    msg
      .toString()
      .split(SOH)
      .filter((f) => f && !/^(8|9|35|10)=/.test(f))
      .join('|');

  test('keeps every entry and writes them after the count tag, in the given order', () => {
    const msg = new Message()
      .setField(FIELD.MsgType, MsgType.MarketDataRequest ?? 'V')
      .setField(262, 'md-1')
      .setField(263, '1')
      .addGroup(267, [[269, '0']])
      .addGroup(267, [[269, '1']])
      .addGroup(146, [
        [55, 'SEME'],
        [48, 'DE000A1DKQ99'],
        [22, '4'],
      ]);

    // 55/48/22 follow 146 in insertion order, not sorted by tag number.
    assert.equal(
      body(msg),
      '146=1|55=SEME|48=DE000A1DKQ99|22=4|262=md-1|263=1|267=2|269=0|269=1',
    );
  });

  test('sets the count tag to the number of entries added', () => {
    const msg = new Message()
      .addGroup(146, [[55, 'A']])
      .addGroup(146, [[55, 'B']])
      .addGroup(146, [[55, 'C']]);
    assert.equal(msg.getField(146), '3');
    assert.equal(body(msg), '146=3|55=A|55=B|55=C');
  });

  test('is chainable and coerces numeric values', () => {
    const msg = new Message();
    const ret = msg.addGroup(267, [[269, 2]]);
    assert.equal(ret, msg);
    assert.equal(body(msg), '267=1|269=2');
  });

  test('keeps working alongside setField on the same message', () => {
    const msg = new Message().addGroup(146, [[55, 'A']]).setField(55, 'TOP');
    assert.equal(msg.getField(55), 'TOP');
    assert.equal(body(msg), '55=TOP|146=1|55=A');
  });

  test('rejects malformed entries with a TypeError', () => {
    const msg = new Message();
    assert.throws(() => msg.addGroup(146, []), TypeError);
    assert.throws(() => msg.addGroup(146, [[55, 'A'], [55, 'B']]), TypeError);
    // @ts-expect-error -- deliberately not a [tag, value] pair
    assert.throws(() => msg.addGroup(146, [[55]]), TypeError);
    // @ts-expect-error -- deliberately not an array
    assert.throws(() => msg.addGroup(146, 'nope'), TypeError);
  });
});
