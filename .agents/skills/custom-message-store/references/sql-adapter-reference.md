# Worked example: the generic SQL adapter (abridged: DDL elided)

This is `src/store/sql.ts` of `@homaiohq/napi-quickfix`, the adapter the
package ships as `@homaiohq/napi-quickfix/store/sql` (`createSqlMessageStore`,
`sqlSchema`; PR #33). It is unchanged since commit `f802818` (PR #31;
introduced by commit `6b8caa0` "feat: generic SQL message-store adapter").
Permalinks at that commit, readable without a checkout:

- the adapter: https://github.com/homaiohq/napi-quickfix/blob/f802818ad6d0fc92be3ab61bb81b1b99521d4a49/src/store/sql.ts
- its test: https://github.com/homaiohq/napi-quickfix/blob/f802818ad6d0fc92be3ab61bb81b1b99521d4a49/test/store-sql.test.ts
- its DDL: https://github.com/homaiohq/napi-quickfix/tree/f802818ad6d0fc92be3ab61bb81b1b99521d4a49/sql

It is reproduced here, abridged (the body of `sqlSchema()` is elided: this skill links to schemas, it
does not copy them, see `upstream-schemas.md` section 5), as the executable
form of the contract in `contract.md`, because it passed `test/store-sql.test.ts` (the
`contract()` function, a subset of section 1 of `test-checklist.md`, which
adds begin > end, gaps and numeric order, seqnums at 2^40; and a loopback
restart) against `node:sqlite` and PostgreSQL. Run the full section 1 against
anything you derive from it. The DDL ships in the package's `sql/`
directory (`sql/postgres.sql`, `sql/mysql.sql`, `sql/sqlite.sql`), the same
statements `sqlSchema(dialect)` returns. The "Known defects" below apply to
the shipped adapter as well: use it as is only where none of them bites.

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
`node:sqlite`, ...) and has no driver dependency. Not over an ORM's raw-query
API: Prisma's `$queryRawUnsafe`, for one, reports no row count (C3) and no
backend to end on an unknown outcome (I2); see "Through an ORM" below.

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

## How to wire it to real drivers (adapted from the README "Generic SQL adapter" and `test/store-sql.test.ts`)

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
```

(Earlier revisions of this file had a Prisma wiring here, an interactive
`$transaction` over `$queryRawUnsafe`. It was wrong three ways and is gone:
see "Through an ORM" below.)

(The pg and node:sqlite `transaction` wrappers are adapted from those of
`test/store-sql.test.ts` `postgresBackend()` / `sqliteBackend()`, which let a
failing ROLLBACK replace the original error, returned a pg client to the
pool whatever its state, and attached no `'error'` listener to the checked-out
client. The pool settings and listeners of the pg wiring come from the
`[trial]` of `contract.md`. The mysql2 and Prisma wirings in the README of that
revision passed no `transaction`; give the mysql2 pool and its held
connections the same error listeners.)

What these wirings still do NOT do:

- Settle only a final outcome (contract I2). A connection dropped after a
  statement was sent rejects `pool.query()` with "Connection terminated"
  while the statement may still commit; a production `execute` knows each
  connection's `(pid, backend_start)`, read from the server at connect, and
  on such a rejection ends that backend from another connection and waits
  until `pg_stat_activity` no longer lists it before rethrowing (stays
  pending while the server is unreachable).
- Keep a connection after a server error. `pool.query()` destroys its client
  on every error, a `statement_timeout` included, so the next call
  reconnects inside its own budget (contract H4); a production `execute`
  checks out, and `release()`s a client that got a server error.

Two things the adapter does NOT do, which a production copy should consider:

- It does not reject a `setSeqNums` that updated zero rows (contract C3). With
  `pg`, `result.rowCount === 0` is available; with `mysql2`,
  `result.affectedRows`.
- It does not set timeouts (contract I2); do that on the store's pool
  (`statement_timeout`, `lock_timeout` and `connectionTimeoutMillis` for
  PostgreSQL; `connectTimeout` and `innodb_lock_wait_timeout` for MySQL, whose
  `max_execution_time` covers `SELECT`s only), checkout + statement together
  shorter than `storeTimeoutMs`. And it settles whatever `execute` reports: an
  `execute` built on a client-side query timeout rejects while the statement
  may still commit. Settle only a final outcome (contract I2: end the backend
  and confirm it gone before rejecting an unanswered statement).

## Through an ORM (Prisma 7)

`[trial2]` of `contract.md` wrote a store with Prisma 7 (`@prisma/adapter-pg`
7.10.1 over `pg` 8.23.1). What it established:

**Prisma's API cannot carry contract I2.** Settling only a final outcome
needs the backend of the connection a statement went to, and an error that
says whether the server answered. Prisma exposes neither: a connection lost
mid-statement surfaces as P2010 "Server has closed the connection" with no
SQLSTATE, a dead transaction client as a plain `Error`, and no connection or
pid is reachable. The two ways out:

1. **Recommended: Prisma for the application, plain `pg` for the store.**
   The store is seven statements; write them on the store's own `pg.Pool`
   (this file, SKILL.md "Wiring"), on the same tables Prisma's schema maps
   if you want them visible to the application.
2. **Prisma for the store too, with I2 implemented under it.** The trial's
   adapter (about 850 lines, 145 of them through Prisma) owned a `pg.Pool`
   subclass whose `query()` records each statement's client and
   `(pid, backend_start)` and runs kill-and-confirm on an unknown outcome,
   and handed it to `new PrismaPg(pool, { schema })`. This depends on
   adapter-pg 7.10.1 sending every statement outside a transaction through
   `pool.query(config)` (`PgQueryable.performIO`) and on `pg` internals
   (`_clients`, `connection.stream`, `processID`). Anything that goes through
   `pool.connect()`, which is every `$transaction`, bypasses it. Verify the
   routing at startup (run one statement and check your `query()` saw it)
   and refuse to start otherwise: a Prisma upgrade can remove the protection
   without a compile error.

**Never `$transaction` in the store.** The `reset` rule is one statement on
PostgreSQL (SKILL.md "Data model", contract F2 and `upstream-schemas.md` 7.1),
and an interactive transaction runs on a client from `pool.connect()`, outside
whatever implements I2. Its `timeout` option is no deadline either: P2028
arrived at 1543 ms with `timeout: 300`, and with `timeout: 1000` a
`$transaction` was still pending at 8 s, waiting on its COMMIT (`SyncRep`).

**One statement per method**, chosen for what it reports:

| Method | Prisma 7 call | Why |
| --- | --- | --- |
| `load` | `$queryRaw` with `to_char(creation_time, ...)` (or `findUnique`/`findMany` under a pinned ISO `DateStyle`, below) | the model API parses timestamps itself |
| `create` | `createMany` (or `$executeRaw` INSERT) | one statement |
| `setSeqNums` | `updateMany`, then reject when `count === 0` (C3) | `update` throws P2025 on a missing row and adds a `RETURNING` read through the DateStyle-dependent parser |
| `setMessage` | `$executeRaw` `INSERT ... ON CONFLICT ... DO UPDATE` | `upsert` on the composite id is a native single `ON CONFLICT` only while Prisma's eligibility rules hold; pin it with a test that checks the emitted SQL, or use raw SQL |
| `getMessages` | `findMany` with `orderBy: { msgseqnum: 'asc' }`, or `$queryRaw` | numeric column, so numeric order |
| `reset` | `$executeRaw` with the data-modifying CTE | one statement, no transaction held open |

`$queryRawUnsafe` returns rows only, never a count: use `$executeRaw` (it
returns the affected row count) for every write you must check.

**Traps found in the trial**, each silent:

- The model API qualifies table names with the schema from the Prisma
  schema (`"public"` by default) and ignores `search_path`: pass `schema` to
  `PrismaPg` (and keep `search_path` for the raw statements in step).
- `NUMERIC` comes back as a `Decimal`, not a string or a number: convert
  with `Number(d.toString())` and validate (contract K4).
- Under a non-ISO `DateStyle` the model API returns an **Invalid Date**
  without an error; a raw `to_char()` read is immune. Read `creation_time`
  through `to_char` (SKILL.md "Data model"), or pin `datestyle` in the pool's
  `options` and read it back at connect (contract I2: the URL can override
  `options`).
- The advice "never a JS `Date`" in `upstream-schemas.md` 7.1 is for raw
  `pg`, which formats a `Date` in the process's time zone. adapter-pg
  formats a `Date` with the UTC getters, and the model API accepts only a
  `Date`. The constraint that remains on upstream's tables is whole seconds:
  truncate the milliseconds (`new Date(Math.floor(t.getTime() / 1000) *
  1000)`).
- Prisma 7 compiles each query shape on first use (5-18 ms, about 1 ms
  after). Run every statement shape once during warm-up, before
  `Initiator.create()`.
- There is no per-query timeout or cancel outside a transaction: the
  server-side `statement_timeout`/`lock_timeout` in the pool's `options` are
  the only limits (and are right anyway, contract I2).
- `PrismaPg` handles pool errors only between `$connect()` (or the first
  query) and `$disconnect()`: own the pool and attach `pool.on('error')` and
  a per-client listener when you construct it (contract I9).
- The G3 lock needs a dedicated connection, which Prisma cannot give outside
  a transaction: open a plain `pg.Client` for it (contract G3).

Checklist mechanics that assume a hand-written driver layer map like this:
3.6 "wrap its `execute`" means the `pg.Pool` subclass's `query()` (or a
proxy, 3.7); 3.8(c) has no reset transaction to hit when `reset` is one
statement, so run it during warm-up instead; 1.13 and 3.5(a) for an adapter
that connects when constructed: construct it against a healthy server, then
take the server away.

## Known defects (found by running it against upstream's stores, 2026-10-23)

The code above is kept as it was at `f802818`, which is also the shipped
`src/store/sql.ts`. Challenged against QuickFIX
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
   write the engine already timed out can commit after a newer one (the
   engine itself holds back the retry of a timed-out `setMessage`, but not a
   `reset()` or `close()` that follows it; contract D7). Wrap the returned adapter
   in `serialisePerSession()` (SKILL.md "Wiring"), or give each session its
   own connection. The `node:sqlite` wiring is synchronous and therefore
   already ordered.
8. **`reset` is two statements in a client-side transaction.** On PostgreSQL
   that is four round trips on a held client (`BEGIN`, `DELETE`, upsert,
   `COMMIT`): each bounded by `statement_timeout`, the whole unbounded before
   PostgreSQL 17's `transaction_timeout`, with an idle-in-transaction window
   between them. Use one data-modifying CTE, a single statement, instead
   (`upstream-schemas.md` section 7.1, verified on PostgreSQL 16); keep the
   `transaction` for the other dialects.
