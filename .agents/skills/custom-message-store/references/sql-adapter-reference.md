# Worked example: the generic SQL adapter (abridged: DDL elided)

This is `src/store/sql.ts` of `@homaiohq/napi-quickfix` at commit `f802818`
(PR #31; introduced by commit `6b8caa0` "feat: generic SQL message-store
adapter"; in no release yet, it ships with PR #33). Permalinks, readable
without a checkout:

- the adapter: https://github.com/homaiohq/napi-quickfix/blob/f802818ad6d0fc92be3ab61bb81b1b99521d4a49/src/store/sql.ts
- its test: https://github.com/homaiohq/napi-quickfix/blob/f802818ad6d0fc92be3ab61bb81b1b99521d4a49/test/store-sql.test.ts
- its DDL: https://github.com/homaiohq/napi-quickfix/tree/f802818ad6d0fc92be3ab61bb81b1b99521d4a49/sql

It was removed from PR #31 to be shipped separately; it is reproduced here,
abridged (the body of `sqlSchema()` is elided: this skill links to schemas, it
does not copy them, see `upstream-schemas.md` section 5), as the executable
form of the contract in `contract.md`, because it passed `test/store-sql.test.ts` (the
`contract()` function, a subset of section 1 of `test-checklist.md`, which
adds begin > end, gaps and numeric order, seqnums at 2^40; and a loopback
restart) against `node:sqlite` and PostgreSQL. Run the full section 1 against
anything you derive from it. A packaged version is
planned as a follow-up: the doc comments below that mention the
`@homaiohq/napi-quickfix/store/sql` subpath export and the package's `sql/`
directory describe that packaged form, which this package does not ship yet.

What to copy from it, in order of importance:

1. `load` reads the timestamp **as text** and parses it as UTC; it returns
   `null` for zero rows; it converts `NUMERIC`/`BIGINT` results with `toSeq()`
   and validates them. Do NOT copy its PostgreSQL expression
   (`creation_time::text`) or `fromSqlTime()`'s `new Date(v)` fallback: see
   "Known defects" at the end of this file.
2. `setSeqNums` is ONE `UPDATE` of both columns; note the parameter order
   (`outgoing_seqnum = $sender, incoming_seqnum = $target`).
3. `setMessage` is a native upsert (`ON CONFLICT ... DO UPDATE` /
   `ON DUPLICATE KEY UPDATE`).
4. `getMessages` is a range predicate with `ORDER BY msgseqnum ASC`, and
   decodes `BLOB` bytes to UTF-8.
5. `reset` is DELETE then an upsert of the session row, inside the caller's
   `transaction` when one is given.
6. Everything is parameterised; nothing is interpolated except the table names
   and the placeholder syntax.

It takes an `execute(sql, params)` over any driver (`pg`, `mysql2`,
`node:sqlite`, Prisma `$queryRawUnsafe`, ...) and has no driver dependency.

```ts
/**
 * A generic SQL {@link MessageStoreAdapter}: give it an `execute(sql, params)`
 * over your own driver / pool and a dialect, and it persists session state in
 * the table layout of QuickFIX's own PostgreSQL / MySQL stores (`sessions`,
 * `messages`, optional table prefix), so an existing QuickFIX C++ deployment
 * interoperates. Schema files for each dialect live in the package's `sql/`
 * directory; {@link sqlSchema} returns the same statements.
 *
 * Subpath export: `@homaiohq/napi-quickfix/store/sql`. No driver dependency.
 */
import type { Awaitable, MessageStoreAdapter, MessageStoreState } from '../store.js';
import type { SessionID } from '../session-id.js';

export type SqlDialect = 'postgres' | 'mysql' | 'sqlite';

/** A result row, as drivers return them (column name → value). */
export type SqlRow = Record<string, unknown>;

/**
 * Run one statement with positional parameters and return its rows (anything
 * array-like of rows; for statements without a result set the return value is
 * ignored). Placeholders are `$1..$n` for `postgres`, `?` otherwise.
 */
export type SqlExecute = (sql: string, params: unknown[]) => Awaitable<SqlRow[] | unknown>;

export interface SqlMessageStoreOptions {
  dialect: SqlDialect;
  execute: SqlExecute;
  /**
   * Run `fn` inside a transaction, handing it an `execute` bound to it. Used
   * by `reset()` (delete the messages + rewrite the session row); without it
   * the two statements run back to back on `execute`.
   */
  transaction?: (fn: (execute: SqlExecute) => Promise<void>) => Promise<void>;
  /** Prepended to both table names (`sessions`, `messages`). Default `''`. */
  tablePrefix?: string;
}

const KEY_COLUMNS = ['beginstring', 'sendercompid', 'targetcompid', 'session_qualifier'] as const;

function key(id: SessionID): [string, string, string, string] {
  return [id.beginString, id.senderCompID, id.targetCompID, id.sessionQualifier];
}

function placeholders(dialect: SqlDialect, from: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => (dialect === 'postgres' ? `$${from + i}` : '?'));
}

/** `YYYY-MM-DD HH:MM:SS.mmm` in UTC, what upstream writes (at second precision). */
function toSqlTime(d: Date): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new TypeError('creationTime must be a valid Date');
  }
  return d.toISOString().replace('T', ' ').replace('Z', '');
}

/** Parse what the driver gave back for a timestamp column read as text. */
function fromSqlTime(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    // "YYYY-MM-DD HH:MM:SS[.ffffff][+00]" (no zone = UTC, as written).
    const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(v.trim());
    if (m) {
      const frac = m[3] ? m[3].slice(0, 4) : '';
      const zone = m[4] ? (m[4] === 'Z' ? 'Z' : m[4].length === 3 ? `${m[4]}:00` : m[4].replace(/(\d{2})(\d{2})$/, '$1:$2')) : 'Z';
      const d = new Date(`${m[1]}T${m[2]}${frac}${zone}`);
      if (!Number.isNaN(d.getTime())) return d;
    }
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  throw new TypeError(`sql message store: cannot read creation_time ${String(v)}`);
}

function toSeq(v: unknown, what: string): number {
  const n = typeof v === 'bigint' ? Number(v) : typeof v === 'string' ? Number(v) : (v as number);
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new TypeError(`sql message store: ${what} is not a positive safe integer (${String(v)})`);
  }
  return n;
}

function rows(result: unknown): SqlRow[] {
  if (Array.isArray(result)) return result as SqlRow[];
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: SqlRow[] }).rows; // a pg Result passed through as is
  }
  return [];
}

/**
 * The table-creation statements for `dialect` (one per table), as in the
 * package's `sql/` files.
 */
export function sqlSchema(dialect: SqlDialect, options: { tablePrefix?: string } = {}): string[] {
  const p = options.tablePrefix ?? '';
  const pk = `PRIMARY KEY (${KEY_COLUMNS.join(', ')}`;
  switch (dialect) {
    case 'postgres':
    case 'mysql':
    case 'sqlite':
      // DDL elided from this reproduction: the tables follow QuickFIX's own
      // layout, see https://github.com/quickfix/quickfix/tree/master/src/sql
      // (and `sql/*.sql` in this package on the branch that ships the adapter).
      // Per dialect the real function returns two statements, one creating
      // `${p}sessions` (the four key columns, creation_time, incoming_seqnum,
      // outgoing_seqnum, `${pk})`) and one creating `${p}messages` (the four
      // key columns, msgseqnum, message, `${pk}, msgseqnum)`), both
      // `IF NOT EXISTS`; MySQL uses DATETIME(3) for creation_time and BLOB for
      // message, SQLite plain TEXT/INTEGER columns.
      return [`-- ${p}sessions: see sql/${dialect}.sql`, `-- ${p}messages: see sql/${dialect}.sql`];
    default:
      throw new TypeError(`sql message store: unknown dialect ${String(dialect)}`);
  }
}

/**
 * Build a {@link MessageStoreAdapter} over `execute`. Column mapping follows
 * upstream: `outgoing_seqnum` is the next sender number, `incoming_seqnum` the
 * next target number; timestamps are written and read as UTC text.
 */
export function createSqlMessageStore(options: SqlMessageStoreOptions): MessageStoreAdapter {
  const { dialect, execute, transaction } = options;
  if (dialect !== 'postgres' && dialect !== 'mysql' && dialect !== 'sqlite') {
    throw new TypeError(`sql message store: unknown dialect ${String(dialect)}`);
  }
  if (typeof execute !== 'function') {
    throw new TypeError('sql message store: execute must be a function');
  }
  const p = options.tablePrefix ?? '';
  const sessions = `${p}sessions`;
  const messages = `${p}messages`;
  const ph = (from: number, count: number) => placeholders(dialect, from, count);
  const where = (from: number) => KEY_COLUMNS.map((c, i) => `${c} = ${ph(from + i, 1)[0]}`).join(' AND ');
  const timeText =
    dialect === 'postgres'
      ? 'creation_time::text AS creation_time'
      : dialect === 'mysql'
        ? 'CAST(creation_time AS CHAR) AS creation_time'
        : 'creation_time';

  const sql = {
    load: `SELECT ${timeText}, incoming_seqnum, outgoing_seqnum FROM ${sessions} WHERE ${where(1)}`,
    create: `INSERT INTO ${sessions} (${KEY_COLUMNS.join(', ')}, creation_time, incoming_seqnum, outgoing_seqnum) VALUES (${ph(1, 7).join(', ')})`,
    setSeqNums: `UPDATE ${sessions} SET outgoing_seqnum = ${ph(1, 1)[0]}, incoming_seqnum = ${ph(2, 1)[0]} WHERE ${where(3)}`,
    setMessage:
      dialect === 'mysql'
        ? `INSERT INTO ${messages} (${KEY_COLUMNS.join(', ')}, msgseqnum, message) VALUES (${ph(1, 6).join(', ')}) ON DUPLICATE KEY UPDATE message = VALUES(message)`
        : `INSERT INTO ${messages} (${KEY_COLUMNS.join(', ')}, msgseqnum, message) VALUES (${ph(1, 6).join(', ')}) ON CONFLICT (${KEY_COLUMNS.join(', ')}, msgseqnum) DO UPDATE SET message = ${dialect === 'postgres' ? 'EXCLUDED' : 'excluded'}.message`,
    getMessages: `SELECT message FROM ${messages} WHERE ${where(1)} AND msgseqnum >= ${ph(5, 1)[0]} AND msgseqnum <= ${ph(6, 1)[0]} ORDER BY msgseqnum ASC`,
    deleteMessages: `DELETE FROM ${messages} WHERE ${where(1)}`,
    resetSession:
      dialect === 'mysql'
        ? `INSERT INTO ${sessions} (${KEY_COLUMNS.join(', ')}, creation_time, incoming_seqnum, outgoing_seqnum) VALUES (${ph(1, 7).join(', ')}) ON DUPLICATE KEY UPDATE creation_time = VALUES(creation_time), incoming_seqnum = VALUES(incoming_seqnum), outgoing_seqnum = VALUES(outgoing_seqnum)`
        : `INSERT INTO ${sessions} (${KEY_COLUMNS.join(', ')}, creation_time, incoming_seqnum, outgoing_seqnum) VALUES (${ph(1, 7).join(', ')}) ON CONFLICT (${KEY_COLUMNS.join(', ')}) DO UPDATE SET creation_time = ${dialect === 'postgres' ? 'EXCLUDED' : 'excluded'}.creation_time, incoming_seqnum = ${dialect === 'postgres' ? 'EXCLUDED' : 'excluded'}.incoming_seqnum, outgoing_seqnum = ${dialect === 'postgres' ? 'EXCLUDED' : 'excluded'}.outgoing_seqnum`,
  };

  const resetWith = async (run: SqlExecute, id: SessionID, state: MessageStoreState) => {
    await run(sql.deleteMessages, key(id));
    await run(sql.resetSession, [...key(id), toSqlTime(state.creationTime), state.nextTargetMsgSeqNum, state.nextSenderMsgSeqNum]);
  };

  return {
    async load(id) {
      const r = rows(await execute(sql.load, key(id)));
      if (r.length === 0) return null;
      const row = r[0];
      return {
        creationTime: fromSqlTime(row.creation_time),
        nextSenderMsgSeqNum: toSeq(row.outgoing_seqnum, 'outgoing_seqnum'),
        nextTargetMsgSeqNum: toSeq(row.incoming_seqnum, 'incoming_seqnum'),
      };
    },
    async create(id, state) {
      await execute(sql.create, [...key(id), toSqlTime(state.creationTime), state.nextTargetMsgSeqNum, state.nextSenderMsgSeqNum]);
    },
    async setSeqNums(id, nextSender, nextTarget) {
      await execute(sql.setSeqNums, [nextSender, nextTarget, ...key(id)]);
    },
    async setMessage(id, seqNum, message) {
      await execute(sql.setMessage, [...key(id), seqNum, message]);
    },
    async getMessages(id, begin, end) {
      const r = rows(await execute(sql.getMessages, [...key(id), begin, end]));
      return r.map((row) => {
        const m = row.message;
        if (typeof m === 'string') return m;
        if (m instanceof Uint8Array) return Buffer.from(m).toString('utf8');
        throw new TypeError('sql message store: message column is neither text nor bytes');
      });
    },
    async reset(id, state) {
      if (transaction) {
        await transaction((run) => resetWith(run, id, state));
      } else {
        await resetWith(execute, id, state);
      }
    },
  };
}
```

## How to wire it to real drivers (adapted from the README and test of the same revision)

Give every wiring a `transaction`: without one, `reset()` runs its DELETE and
its UPSERT as two autocommitted statements (on a pool, possibly on two
connections), and a crash or a failure between them leaves the messages gone
with the old numbers still in the row (contract F2, SKILL.md "reset (F)": one
transaction).

```ts
// pg (`import pg from 'pg'`): the store's own pool (contract H4, I2, I9)
const pool = new pg.Pool({
  // ...connection settings
  options: '-c statement_timeout=3000 -c lock_timeout=2000',
  connectionTimeoutMillis: 2000,
  idleTimeoutMillis: 0, // keep warm connections; reconnect outside store calls
});
pool.on('error', (err) => console.warn('idle store connection lost', err)); // idle clients only
const store = createSqlMessageStore({
  dialect: 'postgres',
  execute: async (sql, params) => (await pool.query(sql, params)).rows,
  transaction: async (fn) => {
    const client = await pool.connect();
    // pg-pool removes its 'error' listener while a client is checked out: an
    // error between two statements would otherwise be an uncaught exception.
    let lost: Error | undefined;
    const onError = (err: Error) => {
      lost = err;
    };
    client.on('error', onError);
    // A client whose ROLLBACK failed is in an unknown state: release(err)
    // destroys it instead of returning it to the pool.
    let broken: Error | undefined;
    try {
      await client.query('BEGIN');
      await fn(async (sql, params) => (await client.query(sql, params)).rows);
      await client.query('COMMIT');
    } catch (err) {
      // Keep the original error: a failing ROLLBACK must not replace it.
      await client.query('ROLLBACK').catch((e: Error) => {
        broken = e;
      });
      throw err;
    } finally {
      client.off('error', onError);
      client.release(broken ?? lost);
    }
  },
});
// mysql2 (promise API)
const store = createSqlMessageStore({
  dialect: 'mysql',
  execute: async (sql, params) => (await pool.execute(sql, params))[0] as Record<string, unknown>[],
  transaction: async (fn) => {
    const conn = await pool.getConnection();
    let broken = false;
    try {
      await conn.beginTransaction();
      await fn(async (sql, params) => (await conn.execute(sql, params))[0] as Record<string, unknown>[]);
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {
        broken = true;
      });
      throw err;
    } finally {
      // destroy() closes a connection whose ROLLBACK failed; release() would
      // hand it back to the pool mid-transaction.
      if (broken) conn.destroy();
      else conn.release();
    }
  },
});
// node:sqlite (synchronous driver; the adapter still returns Promises, which is fine)
const execute: SqlExecute = (sql, params) => db.prepare(sql).all(...(params as (string | number)[]));
const store = createSqlMessageStore({
  dialect: 'sqlite',
  execute,
  transaction: async (fn) => {
    db.exec('BEGIN');
    try {
      await fn(execute);
      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // Keep the original error (SQLite may already have rolled back).
      }
      throw err;
    }
  },
});
// Prisma (interactive transaction; its default 5 s timeout must exceed the
// reset's own latency, and stay below storeTimeoutMs)
const store = createSqlMessageStore({
  dialect: 'postgres',
  execute: (sql, params) => prisma.$queryRawUnsafe(sql, ...params),
  transaction: (fn) => prisma.$transaction((tx) => fn((sql, params) => tx.$queryRawUnsafe(sql, ...params))),
});
```

(The pg and node:sqlite `transaction` wrappers are adapted from those of
`test/store-sql.test.ts` `postgresBackend()` / `sqliteBackend()`, which let a
failing ROLLBACK replace the original error, returned a pg client to the
pool whatever its state, and attached no `'error'` listener to the checked-out
client. The pool settings and listeners of the pg wiring come from the
`[trial]` of `contract.md`. The mysql2 and Prisma wirings in the README of that
revision passed no `transaction`; give their pools and held connections the
same error listeners.)

What these wirings still do NOT do: settle only a final outcome (contract I2).
A connection dropped after a statement was sent rejects `pool.query()` with
"Connection terminated" while the statement may still commit; a production
`execute` notes `client.processID`, and on such a rejection ends that backend
from another connection and waits until `pg_stat_activity` no longer lists it
before rethrowing (stays pending while the server is unreachable).

Two things the adapter did NOT do, which a production copy should consider:

- It did not reject a `setSeqNums` that updated zero rows (contract C3). With
  `pg`, `result.rowCount === 0` is available; with `mysql2`,
  `result.affectedRows`.
- It did not set timeouts (contract I2); do that on the store's pool
  (`statement_timeout`, `lock_timeout` and `connectionTimeoutMillis` for
  PostgreSQL; `connectTimeout` and `innodb_lock_wait_timeout` for MySQL, whose
  `max_execution_time` covers `SELECT`s only), checkout + statement together
  shorter than `storeTimeoutMs`. And it settles whatever `execute` reports: an
  `execute` built on a client-side query timeout rejects while the statement
  may still commit. Settle only a final outcome (contract I2: end the backend
  and confirm it gone before rejecting an unanswered statement).

## Known defects (found by running it against upstream's stores, 2026-10-23)

The code above is kept as it was at `f802818`. Challenged against QuickFIX
v1.16.0's own `PostgreSQLStore`/`MySQLStore`/`OdbcStore` and real servers
(see "Verification" in `upstream-schemas.md`), it has these defects; fix them
in any copy:

1. **`creation_time::text` depends on `DateStyle`.** Under `'SQL, DMY'` the
   text is `22/10/2026 10:11:12.345`: the regex misses, `new Date(v)` is
   `Invalid Date`, `load()` throws, `Initiator.create()` rejects. Under
   `'Postgres'` style `new Date(v)` parses `Thu Oct 22 10:11:12.345 2026` as
   LOCAL time: a silent shift. Use
   `to_char(creation_time, 'YYYY-MM-DD HH24:MI:SS.MS')`, and make
   `fromSqlTime()` strict (no `new Date(v)` fallback for strings: reject what
   the regex does not match).
2. **`toSqlTime()` writes milliseconds.** MySQL `DATETIME` rounds them (`.999`
   becomes the next second) and upstream's `OdbcStore` misreads any fraction
   (`upstream-schemas.md` section 3). On upstream's tables write whole seconds:
   `d.toISOString().slice(0, 19).replace('T', ' ')`.
3. **The MySQL upsert uses `VALUES(col)`**, deprecated since MySQL 8.0.20
   (warning 1287 on 8.4). On MySQL use the row alias (`... VALUES (...) AS new
   ON DUPLICATE KEY UPDATE message = new.message`); keep `VALUES()` for MariaDB.
4. **No SQL Server dialect**, although SQL Server is upstream's third backend
   (via `OdbcStore`). `upstream-schemas.md` section 7.3 has the statements,
   the parameter types and the byte-preserving message encoding.
5. **Nothing guards the stock column limits.** On upstream's MySQL table a
   message over 65,535 bytes is rejected (strict mode) or truncated (non-strict)
   by the server; the adapter neither checks the size nor pins `sql_mode`
   (`upstream-schemas.md` section 7.2).
6. (Listed above, after the wiring examples) no zero-row check on
   `setSeqNums`, no driver timeouts.
7. **No per-session ordering on a pool.** Wired as above to `pool.query()` /
   `pool.execute()`, each statement may take a different connection, so a
   `setMessage` the engine already timed out can commit after the retry's
   `setMessage` for the same seqnum, and the row then holds a message that
   never went out under that number (contract D7). Wrap the returned adapter
   in `serialisePerSession()` (SKILL.md "Wiring"), or give each session its
   own connection. The `node:sqlite` wiring is synchronous and therefore
   already ordered.
