import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DataDictionary,
  Message,
  createMessage,
  FIELD,
  MsgType,
} from '../dist/esm/index.js';

// A minimal, self-contained FIX 4.4-shaped dictionary (no network / no FIX44.xml).
// It defines only the header/trailer plus a single Heartbeat message that allows
// an optional TestReqID (112) and nothing else in the body.
const DICT = `<fix major="4" minor="4">
 <header>
  <field name="BeginString" required="Y"/>
  <field name="BodyLength" required="Y"/>
  <field name="MsgType" required="Y"/>
  <field name="SenderCompID" required="Y"/>
  <field name="TargetCompID" required="Y"/>
  <field name="MsgSeqNum" required="Y"/>
  <field name="SendingTime" required="Y"/>
 </header>
 <trailer>
  <field name="CheckSum" required="Y"/>
 </trailer>
 <messages>
  <message name="Heartbeat" msgtype="0" msgcat="admin">
   <field name="TestReqID" required="N"/>
  </message>
 </messages>
 <fields>
  <field number="8" name="BeginString" type="STRING"/>
  <field number="9" name="BodyLength" type="INT"/>
  <field number="35" name="MsgType" type="STRING"/>
  <field number="49" name="SenderCompID" type="STRING"/>
  <field number="56" name="TargetCompID" type="STRING"/>
  <field number="34" name="MsgSeqNum" type="INT"/>
  <field number="52" name="SendingTime" type="UTCTIMESTAMP"/>
  <field number="112" name="TestReqID" type="STRING"/>
  <field number="10" name="CheckSum" type="STRING"/>
 </fields>
</fix>`;

// Build a fully-formed Heartbeat, then re-parse the serialized form so that
// BodyLength (9) and CheckSum (10) are populated — DataDictionary.validate
// requires those header/trailer fields to be present.
function heartbeat(extra?: (m: Message) => void): Message {
  const m = createMessage()
    .setField(FIELD.BeginString ?? 8, 'FIX.4.4')
    .setField(FIELD.MsgType, MsgType.Heartbeat)
    .setField(FIELD.SenderCompID ?? 49, 'SENDER')
    .setField(FIELD.TargetCompID ?? 56, 'TARGET')
    .setField(34, 1)
    .setField(52, '20260101-00:00:00');
  extra?.(m);
  return Message.parse(m.toString());
}

describe('DataDictionary', () => {
  test('fromString loads an inline dictionary', () => {
    const dd = DataDictionary.fromString(DICT);
    assert.ok(dd instanceof DataDictionary);
  });

  test('validate() accepts a well-formed message', () => {
    const dd = DataDictionary.fromString(DICT);
    assert.doesNotThrow(() => dd.validate(heartbeat()));
  });

  test('validate() accepts an allowed optional field', () => {
    const dd = DataDictionary.fromString(DICT);
    assert.doesNotThrow(() => dd.validate(heartbeat((m) => m.setField(112, 'ping'))));
  });

  test('validate() throws QuickFixError on an undefined tag for the msg type', () => {
    const dd = DataDictionary.fromString(DICT);
    // Symbol (55) is not defined at all in this dictionary.
    const bad = heartbeat((m) => m.setField(55, 'AAPL'));
    assert.throws(
      () => dd.validate(bad),
      (err: any) => {
        assert.equal(err.name, 'QuickFixError');
        assert.equal(err.fixErrorName, 'InvalidTagNumber');
        return true;
      },
    );
  });
});
