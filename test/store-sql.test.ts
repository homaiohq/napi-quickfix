import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  Acceptor,
  Initiator,
  SessionID,
  SessionSettings,
  createMessage,
  sendToTarget,
  FIELD,
  MsgType,
  Side,
  type MessageStoreAdapter,
} from '../dist/esm/index.js';
import { createSqlMessageStore, sqlSchema, type SqlDialect, type SqlExecute } from '../dist/esm/store/sql.js';
import { acceptorCfg, freePort, initiatorCfg, waitForEvent, waitUntil } from './helpers.js';

// The generic SQL adapter: its statements against node:sqlite (in-memory,
// always), and against a real PostgreSQL when PGURL is set (the CI job runs a
// service container; `yarn test:pg` locally). The adapter is exercised both
// directly, through the MessageStoreAdapter contract, and through the engine
// over a loopback.

const T = 10_000;
const INI_ID = new SessionID('FIX.4.4', 'CLIENT', 'SERVER');
const ACC_ID = new SessionID('FIX.4.4', 'SERVER', 'CLIENT');
const QUAL_ID = new SessionID('FIX.4.2', 'A', 'B', 'q1');

interface Backend {
  dialect: SqlDialect;
  execute: SqlExecute;
  transaction?: (fn: (execute: SqlExecute) => Promise<void>) => Promise<void>;
  close(): Promise<void>;
}

async function sqliteBackend(): Promise<Backend | undefined> {
  let mod: typeof import('node:sqlite');
  try {
    mod = await import('node:sqlite');
  } catch {
    return undefined;
  }
  const db = new mod.DatabaseSync(':memory:');
  for (const stmt of sqlSchema('sqlite')) db.exec(stmt);
  const execute: SqlExecute = (sql, params) => db.prepare(sql).all(...(params as (string | number)[]));
  return {
    dialect: 'sqlite',
    execute,
    transaction: async (fn) => {
      db.exec('BEGIN');
      try {
        await fn(execute);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    close: async () => db.close(),
  };
}

async function postgresBackend(): Promise<Backend | undefined> {
  const url = process.env.PGURL;
  if (!url) return undefined;
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: url });
  const prefix = `t${process.pid}_`;
  for (const stmt of sqlSchema('postgres', { tablePrefix: prefix })) await pool.query(stmt);
  const execute: SqlExecute = async (sql, params) => (await pool.query(sql, params)).rows;
  return {
    dialect: 'postgres',
    execute,
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await fn(async (sql, params) => (await client.query(sql, params)).rows);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    close: async () => {
      await pool.query(`DROP TABLE IF EXISTS ${prefix}messages`);
      await pool.query(`DROP TABLE IF EXISTS ${prefix}sessions`);
      await pool.end();
    },
  };
}

function newOrder(tag: string) {
  return createMessage()
    .setField(FIELD.MsgType, MsgType.NewOrderSingle)
    .setField(FIELD.ClOrdID, tag)
    .setField(FIELD.Symbol, 'SQL')
    .setField(FIELD.Side, Side.Buy)
    .setField(FIELD.OrderQty, 1);
}

/** The adapter contract, directly. */
async function contract(store: MessageStoreAdapter) {
  assert.equal(await store.load(QUAL_ID), null, 'no row yet');
  const t0 = new Date('2026-10-22T10:11:12.345Z');
  await store.create(QUAL_ID, { creationTime: t0, nextSenderMsgSeqNum: 1, nextTargetMsgSeqNum: 1 });
  const loaded = await store.load(QUAL_ID);
  assert.ok(loaded);
  assert.equal(loaded.nextSenderMsgSeqNum, 1);
  assert.equal(loaded.nextTargetMsgSeqNum, 1);
  assert.ok(loaded.creationTime instanceof Date);
  assert.ok(Math.abs(loaded.creationTime.getTime() - t0.getTime()) < 1000, `creation time within a second: ${loaded.creationTime.toISOString()}`);

  await store.setSeqNums(QUAL_ID, 10, 20);
  assert.deepEqual(
    [(await store.load(QUAL_ID))!.nextSenderMsgSeqNum, (await store.load(QUAL_ID))!.nextTargetMsgSeqNum],
    [10, 20],
    'outgoing = sender, incoming = target',
  );

  // set / get, the SET_GET and SET_GET_WITH_QUOTE sequences of QuickFIX's own
  // MessageStoreTestCase, plus the upsert.
  const quotes = `8=FIX.4.2\x019=20\x0135=8\x0134=2\x0158='"Some \\ Text"'\x0110=000\x01`;
  await store.setMessage(QUAL_ID, 1, 'm1');
  await store.setMessage(QUAL_ID, 2, quotes);
  await store.setMessage(QUAL_ID, 3, 'm3');
  assert.deepEqual(await store.getMessages(QUAL_ID, 1, 3), ['m1', quotes, 'm3']);
  assert.deepEqual(await store.getMessages(QUAL_ID, 4, 6), []);
  assert.deepEqual(await store.getMessages(QUAL_ID, 2, 6), [quotes, 'm3']);
  await store.setMessage(QUAL_ID, 2, 'm2-again');
  assert.deepEqual(await store.getMessages(QUAL_ID, 2, 2), ['m2-again'], 'setMessage is an upsert');

  // Another session's rows are independent (the key includes the qualifier).
  const other = new SessionID('FIX.4.2', 'A', 'B');
  assert.equal(await store.load(other), null);
  await store.create(other, { creationTime: t0, nextSenderMsgSeqNum: 5, nextTargetMsgSeqNum: 6 });
  await store.setMessage(other, 1, 'other');
  assert.deepEqual(await store.getMessages(QUAL_ID, 1, 1), ['m1']);
  assert.deepEqual(await store.getMessages(other, 1, 9), ['other']);

  // reset: messages gone, state rewritten.
  const t1 = new Date('2026-10-23T00:00:00.000Z');
  await store.reset(QUAL_ID, { creationTime: t1, nextSenderMsgSeqNum: 1, nextTargetMsgSeqNum: 1 });
  assert.deepEqual(await store.getMessages(QUAL_ID, 1, 99), []);
  const afterReset = await store.load(QUAL_ID);
  assert.deepEqual([afterReset!.nextSenderMsgSeqNum, afterReset!.nextTargetMsgSeqNum], [1, 1]);
  assert.ok(Math.abs(afterReset!.creationTime.getTime() - t1.getTime()) < 1000);
  assert.deepEqual(await store.getMessages(other, 1, 9), ['other'], 'reset is per session');
  // reset also (re)creates a row that does not exist.
  const fresh = new SessionID('FIX.4.4', 'X', 'Y');
  await store.reset(fresh, { creationTime: t1, nextSenderMsgSeqNum: 1, nextTargetMsgSeqNum: 1 });
  assert.ok(await store.load(fresh));
}

/** The adapter through the engine: logon, two orders, numbering continued on restart. */
async function loopback(makeStore: () => MessageStoreAdapter) {
  const port = await freePort();
  const noReset = (cfg: string) => cfg.replace('ResetOnLogon=Y', 'ResetOnLogon=N');
  const received: string[] = [];
  const run = async (orders: string[]) => {
    const acc = await Acceptor.create({
      settings: SessionSettings.fromString(noReset(acceptorCfg(port))),
      store: makeStore(),
      log: 'none',
      handlers: { fromApp: (m) => received.push(m.getFieldIfSet(FIELD.ClOrdID) ?? '') },
    });
    const ini = await Initiator.create({ settings: SessionSettings.fromString(noReset(initiatorCfg(port))), store: makeStore(), log: 'none' });
    try {
      const logons = Promise.all([waitForEvent(acc, 'logon', 'acc', T), waitForEvent(ini, 'logon', 'ini', T)]);
      await acc.start();
      await ini.start();
      await logons;
      for (const o of orders) assert.equal(await sendToTarget(newOrder(o), INI_ID), true);
      assert.ok(await waitUntil(() => received.length >= orders.length, T));
      return [ini.getSession(INI_ID)!.getExpectedSenderNum(), acc.getSession(ACC_ID)!.getExpectedTargetNum()];
    } finally {
      await ini.stop();
      await acc.stop();
    }
  };
  const [sender1, target1] = await run(['a', 'b']);
  assert.equal(sender1, 4, 'Logon=1, a=2, b=3 -> 4');
  assert.equal(target1, 4);
  received.length = 0;
  const [sender2] = await run(['c']);
  assert.equal(sender2, 7, 'run 2 continued from the database: Logout=4, Logon=5, c=6 -> next 7');
  assert.deepEqual(received, ['c']);
}

describe('generic SQL message store', () => {
  test('the schema files match sqlSchema()', () => {
    for (const dialect of ['postgres', 'mysql', 'sqlite'] as const) {
      const file = readFileSync(fileURLToPath(new URL(`../sql/${dialect}.sql`, import.meta.url)), 'utf8');
      for (const stmt of sqlSchema(dialect)) assert.ok(file.includes(stmt), `${dialect}.sql holds ${stmt.slice(0, 40)}...`);
    }
    assert.ok(sqlSchema('mysql', { tablePrefix: 'fix_' })[0].includes('fix_sessions'));
    assert.throws(() => sqlSchema('oracle' as SqlDialect), TypeError);
    assert.throws(() => createSqlMessageStore({ dialect: 'oracle' as SqlDialect, execute: () => [] }), TypeError);
  });

  for (const [name, open] of [
    ['node:sqlite', sqliteBackend],
    ['PostgreSQL (PGURL)', postgresBackend],
  ] as const) {
    test(`${name}: adapter contract and loopback`, { timeout: 60_000 }, async (t) => {
      const backend = await open();
      if (!backend) {
        t.skip(`${name} not available`);
        return;
      }
      try {
        const store = createSqlMessageStore({
          dialect: backend.dialect,
          execute: backend.execute,
          transaction: backend.transaction,
          tablePrefix: backend.dialect === 'postgres' ? `t${process.pid}_` : undefined,
        });
        await contract(store);
        await loopback(() => store);
      } finally {
        await backend.close();
      }
    });
  }
});
