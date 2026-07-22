import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { SessionID } from '../dist/esm/index.js';

describe('SessionID', () => {
  test('exposes constructor arguments via readonly getters', () => {
    const id = new SessionID('FIX.4.4', 'CLIENT', 'BROKER');
    assert.equal(id.beginString, 'FIX.4.4');
    assert.equal(id.senderCompID, 'CLIENT');
    assert.equal(id.targetCompID, 'BROKER');
    assert.equal(id.sessionQualifier, '');
  });

  test('toString() uses the canonical FIX.x.y:SENDER->TARGET format', () => {
    const id = new SessionID('FIX.4.4', 'CLIENT', 'BROKER');
    assert.equal(id.toString(), 'FIX.4.4:CLIENT->BROKER');
  });

  test('supports an optional session qualifier', () => {
    const id = new SessionID('FIX.4.4', 'CLIENT', 'BROKER', 'Q1');
    assert.equal(id.sessionQualifier, 'Q1');
    assert.equal(id.toString(), 'FIX.4.4:CLIENT->BROKER:Q1');
  });
});
