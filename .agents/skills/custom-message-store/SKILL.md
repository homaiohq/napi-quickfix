---
name: custom-message-store
description: >-
  Implement a custom MessageStoreAdapter for the napi-quickfix binding (@homaiohq/napi-quickfix) so FIX session state (next sequence numbers, creation time, sent messages for resends) is persisted in the user's own backend. Use whenever the user wants to "implement a message store", "write a MessageStoreAdapter", "persist FIX session state / sequence numbers in Postgres / MySQL / MariaDB / SQL Server / SQLite / MongoDB / Redis / DynamoDB / any database", or through an ORM (Prisma, Drizzle, TypeORM, Sequelize, Knex), "reuse / migrate from a QuickFIX C++ database" (the tables of its PostgreSQLStore, MySQLStore or OdbcStore), share those tables with a C++ engine during a cutover or as a standby, or asks what load / create / setSeqNums / setMessage / getMessages / reset / close must do, or how upserts, gaps, write ordering, late or timed-out writes on a connection pool, poison or close() behave; also when reviewing an existing adapter, or debugging resends that deliver the wrong message, lose messages or reuse sequence numbers. Self-contained: the store contract as sourced rules, the upstream column mapping (DDL linked, not copied), per-backend guidance checked against upstream's own stores, a worked SQL adapter, and a test checklist.
---

# Custom message store for napi-quickfix

A FIX engine must remember, per session and across restarts, the next outbound
and expected inbound `MsgSeqNum`, when the numbering started, and every message
it sent (to answer resend requests). `@homaiohq/napi-quickfix` lets you keep
that in any backend through a **`MessageStoreAdapter`**: seven plain methods
the engine calls with plain values. The difficult part is not the database
code, it is the semantics: which call must be an upsert, what "inclusive
ascending range with gaps omitted" means, when a write must already be durable,
which failures the engine tolerates and which poison the session, and what the
upstream tables' columns really mean. This skill is that knowledge, sourced.

**Sources and versions.** The binding at the revision that carries this skill
(`@homaiohq/napi-quickfix`, unreleased after 0.3.1: CHANGELOG `[Unreleased]`,
PR #32), and QuickFIX C++ **v1.16.0** (the tag the binding's `CMakeLists.txt`
pins). Where to read each cited file:

- **In the installed package** (`node_modules/@homaiohq/napi-quickfix/`):
  `README.md` ("Message store"), the typings and compiled code under `dist/`
  (`dist/esm/store.d.ts` and `store.js`: the interface and `MapMessageStore`),
  and the native bridge `cpp/js_message_store.{h,cpp}`.
- **In the repository only** (public:
  https://github.com/homaiohq/napi-quickfix): `src/store.ts` (the TypeScript
  source of `dist/esm/store.js`), `ARCHITECTURE.md` §4b/§5,
  `test/store.test.ts`, `test/store-adapters.ts`. Open them at the tag of the
  version you installed (`/blob/v<version>/<path>`); until the store ships in a
  release, at `main` once PR #32 is merged, else on branch
  `feat/message-store-adapter`.
- **The generic SQL adapter** (its source, its test, whose `contract()` section 1
  of `references/test-checklist.md` extends, and its README section) is in no
  release yet (PR #33); it is cited at commit `f802818`, permalinks in
  `references/sql-adapter-reference.md`.
- **QuickFIX C++**: https://github.com/quickfix/quickfix/tree/v1.16.0, paths
  under `src/C++/`.

Every rule in the references cites one of them; when the skill and a newer
revision disagree, the newer file wins: re-read it. The interop guidance was
also checked by running upstream's own `PostgreSQLStore`/`MySQLStore`/
`OdbcStore` against PostgreSQL 16, MySQL 8.4 and SQL Server 2022
(`upstream-schemas.md` "Verification"), and the adapter guidance by a
PostgreSQL adapter written from this skill alone and run against a live
counterparty and injected faults (issue #35 on the repository), then by a
second one written through Prisma 7 (issue #36).

Reference files next to this one:

| File | Read it when |
| --- | --- |
| `references/contract.md` | always: the rules (A-K), each with its source |
| `references/upstream-schemas.md` | the backend is SQL, or the data must interoperate with a QuickFIX C++ deployment: the column mapping, the statements upstream issues, timestamps, gotchas, **section 7: per backend (PostgreSQL, MySQL/MariaDB, SQL Server) statements, column limits, collations, encodings and upstream's own defects**, section 8: sharing tables with a C++ engine, and where to fetch the upstream DDL (linked, not reproduced) |
| `references/sql-adapter-reference.md` | you want a worked, tested SQL implementation to adapt (a reference SQL adapter, reproduced abridged: its `sqlSchema()` DDL is elided; a packaged version is planned as a follow-up). Read its "Known defects" before copying: its PostgreSQL timestamp read is DateStyle-dependent and it has no SQL Server dialect |
| `references/test-checklist.md` | always, before declaring the adapter done: differential tests against `MapMessageStore`, engine-level scenarios, failure injection |

## Workflow

1. **Clarify** (ask only what changes the design): the backend and driver;
   whether the tables must stay compatible with an existing QuickFIX C++
   deployment (then the layout, column names and timestamp format are fixed,
   see `upstream-schemas.md`); whether the driver is synchronous (embedded
   SQLite) or socket-based; whether one adapter serves several engines or
   processes; whether the application reaches the database through an ORM
   (Prisma: see "Through an ORM" below) or a pooler (PgBouncer: the store
   must bypass it, contract I2); expected message rate. For an existing SQL
   deployment also find out, or check yourself: the server version, the key columns'
   collation (can CompIDs differ only by case?), the largest message, whether
   messages carry non-ASCII text, PostgreSQL's `DateStyle`, and whether a C++
   engine keeps using the tables (cutover, standby). Each of these changes the
   adapter or the schema (`upstream-schemas.md` section 7).
2. **Read `references/contract.md`** in full. Then the schema file if SQL or
   interop is involved, including the section 7 subsection for your backend.
3. **Design the data model**: one record per session for the state, one record
   per `(session, seqNum)` for the messages, keyed by the four session-id fields
   (section "Data model" below).
4. **Implement** against the interface below; start from the SQL worked example
   or the KV skeleton. Parameterise everything; never interpolate a message or a
   CompID into a statement.
5. **Wire it in** through `Initiator.create()` / `Acceptor.create()` (never
   `new Initiator({ store })`, which throws), set `storeTimeoutMs`, subscribe to
   `'storeError'`, and apply the operational rules (section "Wiring").
6. **Verify** with `references/test-checklist.md`: the differential script
   against `MapMessageStore`, then the loopback scenarios, then failure
   injection. Do not skip 1.6 (gap and ordering), 1.11 (time zone), 1.15-1.18
   (the logic checks), 3.3 (bounded hang), 3.6-3.7 (late write ordering, late
   commits; with the production connection string) or, for a socket driver,
   3.8-3.12 (connections ended by the server, threadpool, shutdown, a lost
   lock, a deleted row across a restart).
7. **Review** against the pitfalls list at the end of this file.

## The interface (`dist/esm/store.d.ts` in the package, `src/store.ts` in the repository)

```ts
import type { SessionID } from '@homaiohq/napi-quickfix';

/** A value or a Promise of it: every adapter method may be sync or async. */
export type Awaitable<T> = T | Promise<T>;

/** The per-session state a MessageStoreAdapter persists next to the messages. */
export interface MessageStoreState {
  /** When the session's numbering was last (re)started. */
  creationTime: Date;
  /** The MsgSeqNum (tag 34) the next outbound message will carry. */
  nextSenderMsgSeqNum: number;
  /** The MsgSeqNum expected on the next inbound message. */
  nextTargetMsgSeqNum: number;
}

/**
 * One adapter object serves every session of an engine; each method receives
 * the session's id. Every method may return a value or a Promise. A rejection
 * (or a synchronous throw) surfaces to the engine as an IOException. Calls
 * made from the engine's threads block that thread, not the event loop, until
 * the Promise settles, bounded by `storeTimeoutMs`.
 * Sequence numbers cross as `number`; values above 2^53-1 are refused in both directions.
 */
export interface MessageStoreAdapter {
  /** The persisted state of `sessionID`, or `null` if the session has never been seen. */
  load(sessionID: SessionID): Awaitable<MessageStoreState | null>;
  /** Persist the initial `state` of a session `load` returned `null` for. */
  create(sessionID: SessionID, state: MessageStoreState): Awaitable<void>;
  /** Persist both sequence numbers (the engine writes them together). */
  setSeqNums(sessionID: SessionID, nextSender: number, nextTarget: number): Awaitable<void>;
  /** Persist an outbound message under its MsgSeqNum. Must be an upsert. */
  setMessage(sessionID: SessionID, seqNum: number, message: string): Awaitable<void>;
  /** Messages with begin <= seqNum <= end, ascending, missing seqnums omitted (never padded). */
  getMessages(sessionID: SessionID, begin: number, end: number): Awaitable<string[]>;
  /** Delete every message of the session and persist `state`, in one transaction where the backend allows. */
  reset(sessionID: SessionID, state: MessageStoreState): Awaitable<void>;
  /** Optional. Once per session after Engine.stop() destroyed the sessions, before stop() settles. */
  close?(sessionID: SessionID): Awaitable<void>;
}
```

`SessionID` exposes `beginString`, `senderCompID`, `targetCompID`,
`sessionQualifier` (`''` when none) and `toString()` →
`FIX.4.4:SENDER->TARGET[:QUALIFIER]`. `MapMessageStore` (exported) is the
reference implementation: a `Map` keyed by `sessionID.toString()`, each row
`{ state, messages: Map<number, string> }`; its `getMessages` sorts numerically
and filters the inclusive range; its `reset` clears the messages and replaces
the state, creating the row when missing. Read it (`dist/esm/store.js` in the
installed package, `src/store.ts` in the repository) when a rule is unclear: it
is the oracle the test checklist compares against.

## Lifecycle: who calls what, when, on which thread

| Moment | Adapter calls | Thread | Notes |
| --- | --- | --- | --- |
| `Initiator.create()` / `Acceptor.create()` | `load(id)` for every session the engine will own; `create(id, {now, 1, 1})` when `load` returned `null` | JS (awaited in TS before the engine exists) | A rejection or a malformed `load` result rejects `create()`; no engine is built |
| engine constructor, session outside its `StartTime`/`EndTime` window | `reset(id, {now, 1, 1})` | JS (direct call; its Promise is awaited by `create()`) | The only engine-driven store call made on the JS thread |
| each outbound message | `setMessage(id, n, wire)` then `setSeqNums(id, n+1, target)` **then** the bytes go out | the engine's network thread or a `sendToTarget()` worker, holding the session-state mutex | Write-through: your ack precedes the wire |
| each inbound message | `setSeqNums(id, sender, target+1)` | network thread | After your `fromApp` handler ran |
| peer's ResendRequest | `getMessages(id, begin, end)` | network thread | Range already bounded by the engine |
| `ResetOnLogon=Y`, `ResetOnLogout=Y`, `ResetOnDisconnect=Y`, a Logon sent or received with `ResetSeqNumFlag=Y`, session-time rollover (there is no JS-side `reset()`: `setNextSenderMsgSeqNum()` / `setNextTargetMsgSeqNum()` reach the adapter as `setSeqNums`) | `reset(id, {now, 1, 1})` | network thread (a `sendToTarget()` worker only if the application itself sends a Logon carrying `ResetSeqNumFlag=Y`, `Session.cpp:559-567`) | Never fatal to QuickFIX; failure poisons, and that `reset` (with its `creationTime`; a later failing `reset` replaces it) is retried by every later call until it succeeds |
| `RefreshOnLogon=Y`, `session.refresh()`, and the reload that lifts a poisoned store | `load(id)`, then `create(id, {now, 1, 1})` if it returned `null` | network thread / worker | `null` means the row is gone: the numbering restarts at `1/1`, as upstream's `refresh()` does |
| `await engine.stop()` | `close(id)` once per session, after the sessions are destroyed | JS | Also when `create()` rejects after building the engine (constructor-time `reset()` failed); not when the engine is dropped without `stop()` |

For one session the engine never overlaps two calls (it holds
`SessionState::m_mutex` across each); different sessions and engines run
concurrently. The single exception is a call that timed out and settles later.

## The contract in brief

Numbered rules with sources are in `references/contract.md`; this is the index.

- **Keys and model (A).** Key = `(beginString, senderCompID, targetCompID,
  sessionQualifier)`; no SubID/LocationID exist. State = `creationTime` +
  two **next** (not last-used) sequence numbers, positive safe integers, `1/1`
  for a new session. Messages = outbound only, the raw FIX string with SOH
  (`\x01`) delimiters, stored byte-exact; may contain quotes, backslashes,
  any UTF-8. Byte-exact is load-bearing: the engine re-checks BodyLength and
  CheckSum on every resend, and one changed byte aborts the resend of the
  whole range and wedges the session (A8). Sessions are independent.
- **`load` / `create` (B).** `load` returns `null` for an unknown session and
  never creates; it is also the refresh and the recovery read, where `null`
  (row gone) makes the engine `create` a `1/1` row. `create` inserts.
  A malformed state is a `TypeError` at startup, an `IOException` later; a
  preload rejection reaches the `create()` caller as your own error object.
  A renumbering after a vanished row loses every message stored while
  logged out: alarm on it (rate-limited), and consider rejecting a later
  `load()` that finds no row for a session the adapter has already seen, and
  a first `load()` that finds no row but finds messages, which is the same
  deletion seen across a restart (B3).
- **`setSeqNums` (C).** Both numbers, every call, one write by primary key;
  fatal on failure (poison). Resolve after commit. **No monotonic guard**: the
  numbers go down too (`reset`, `session.setNext*()`); last write wins (C6).
- **`setMessage` (D).** An upsert: the same seqnum is rewritten after a failed
  or timed-out send, after a crash between the two writes, after a lowered
  sender number. Never fatal. Called before the message hits the wire, so no
  batching or deferral. **Per-session writes must land in call order, even
  one the engine already timed out**: on a pool, a late `setMessage(n, A)` can
  commit after the retry's `setMessage(n, B)`, and a resend then delivers A,
  a message the application saw fail (D7; fix: the FIFO wrapper in "Wiring").
  Store every message (admin ones too, unsent ones too) under exactly the
  number given; the engine trusts tag 34 inside the string (D8).
- **`getMessages` (E).** Inclusive `[begin, end]`, ascending **numerically**,
  gaps omitted, **exactly one entry per seqnum (the last written)**, `[]` when
  none (also when `begin > end`), strings only; never throw on `begin = 0`,
  answer it as `[1, end]`. Order and
  uniqueness are load-bearing: the engine gap-fills between consecutive
  entries, so a reversed list silently drops every message in the range and a
  duplicate produces backwards `SequenceReset`s (E2, E10). An append-only or
  versioned backend must collapse to the latest write. Do not copy upstream
  `MemoryStore::get()` (returns nothing when `begin` is absent). Never fatal
  (the engine disconnects and the peer re-requests).
- **`reset` (F).** Delete ALL the session's messages (no seqnum range: rows
  above the old next number too) and write the given state (upsert the session
  row); one transaction where possible, else DELETE first. Persist the
  `creationTime` you are given. Fatal on failure, but never thrown into
  QuickFIX; a failed reset is retried with the same state until it succeeds,
  so it must be idempotent.
- **Durability (G).** Return only once durable: no write-behind, no cache
  standing in for the database; the engine advances its cached numbers after
  your ack and sends after that. Upstream's floor is "survives a process
  crash" (`fflush`, no `fsync`); surviving a host crash depends on the
  server's flush settings (`synchronous_commit`, `innodb_flush_log_at_trx_commit`,
  `appendfsync`), a deliberate trade; a synchronous standby also makes every
  commit wait for it, with no timeout. Sync methods are allowed. One engine per
  session row: a per-session advisory lock on a dedicated, warmed lock
  connection, taken at the preload, re-taken from the event loop the moment
  that connection drops, every write refused while it is not held (a
  healthy session never reloads, so "re-take at the next `load()`" never
  runs), and a key format shared by every adapter on the tables (G3).
  Inbound processing stays at-least-once whatever you do
  (`fromApp` runs before the number is written): dedupe in the app (G5).
- **Threads (H).** Per-session calls are serialised by the engine, except a
  call that timed out (D7); your method runs on the event loop while an engine
  thread waits. The hot path must not need a libuv threadpool slot
  (`fs.promises`, `dns.lookup`, `zlib`, async `crypto`), and a reconnect
  does: `dns.lookup`, and `pg`'s SCRAM-SHA-256 authentication (WebCrypto)
  takes several slots per connection while every parked send holds one. Size
  `UV_THREADPOOL_SIZE` above your maximum in-flight sends plus a reconnect
  margin, and bound the sends below it: with the default 4 slots, 6 sends in
  flight across a database restart never recovered (H4). The kill and lock
  connections count too: open them at warm-up and keep them. Never await an
  engine operation on the same session from inside a store method.
- **Errors (I).** Throw or reject as soon as the outcome is known; never
  settle an unknown one (below). `storeTimeoutMs` (default 30 s)
  bounds every call (`0` disables it); a timed-out `setSeqNums`/`reset` blocks
  recovery until it settles (never settles: poisoned until `stop()`), so give
  the driver shorter timeouts than `storeTimeoutMs`, enforced by the server
  (`statement_timeout`, `lock_timeout`). **Settle only a final outcome**: reject
  at once when nothing was sent or the server answered with an error; when a
  statement was sent and no answer came (a client-side timeout, a dropped
  connection, a socket destroyed at shutdown), its outcome is unknown and it
  can still commit: end the backend from another connection and confirm it is
  gone before rejecting, and stay pending while the server is unreachable
  (I2). A client-side query timeout "above the server's, as a backstop" is
  exactly the bug: against a frozen server it rejects, and the statement
  commits after the thaw. The kill-and-confirm step fails open when it
  matches nothing: key it on the backend's `(pid, backend_start)` read from
  the server, no other predicate, never through a pooler (which rewrites the
  pid), and read the effective timeouts back at connect (a URL's `options=`
  replaces yours). Nothing bounds a COMMIT waiting for a synchronous
  standby; budget every round trip of a call, not every statement.
  Poison = the session's writes fail until the next call after all late
  writes settled has reloaded through `load()`. A reload that succeeds at once
  (a plain rejection) lifts it with the session still up; while it cannot, the
  engine disconnects the session at its next inbound message and QuickFIX
  reconciles with the peer at the next logon.
- **Credentials (I10).** Stored Logons carry the password in clear: restrict
  access to the messages table and keep statement logging off on its
  database.
- **`close` (J).** Optional, per session, after `stop()` (and when `create()`
  rejects after building the engine); not a durability hook; do not close a
  pool shared with other engines from it.

## Data model: SQL and non-SQL

Two records per session kind, both addressed by the four-field key:

```
session state : key(begin, sender, target, qualifier) -> { creationTime, nextSender, nextTarget }
messages      : key(begin, sender, target, qualifier, seqNum) -> wireString
```

**SQL.** Use the upstream layout (tables `sessions` and `messages`,
`references/upstream-schemas.md` section 5 links to the upstream DDL) unless you have a reason not
to; it is proven and interoperable. Statements, in PostgreSQL syntax (the
worked example in `sql-adapter-reference.md` covers PostgreSQL, MySQL and
SQLite; no SQL Server):

| Method | Statement |
| --- | --- |
| `load` | `SELECT to_char(creation_time, 'YYYY-MM-DD HH24:MI:SS.MS') AS creation_time, incoming_seqnum, outgoing_seqnum FROM sessions WHERE beginstring=$1 AND sendercompid=$2 AND targetcompid=$3 AND session_qualifier=$4` → `null` for no row; `nextTargetMsgSeqNum = incoming_seqnum`, `nextSenderMsgSeqNum = outgoing_seqnum` |
| `create` | `INSERT INTO sessions (beginstring, sendercompid, targetcompid, session_qualifier, creation_time, incoming_seqnum, outgoing_seqnum) VALUES ($1,$2,$3,$4,$5,$6,$7)` with `$5 = 'YYYY-MM-DD HH:MM:SS'` in UTC, whole seconds, `$6 = nextTarget`, `$7 = nextSender` |
| `setSeqNums` | `UPDATE sessions SET outgoing_seqnum=$1, incoming_seqnum=$2 WHERE <key>` (`$1 = nextSender`, `$2 = nextTarget`) |
| `setMessage` | `INSERT INTO messages (<key cols>, msgseqnum, message) VALUES (...) ON CONFLICT (<key cols>, msgseqnum) DO UPDATE SET message = EXCLUDED.message` |
| `getMessages` | `SELECT message FROM messages WHERE <key> AND msgseqnum >= $5 AND msgseqnum <= $6 ORDER BY msgseqnum ASC` |
| `reset` | ONE statement, a data-modifying CTE: `WITH gone AS (DELETE FROM messages WHERE <key>) INSERT INTO sessions (...) VALUES (...) ON CONFLICT (<key cols>) DO UPDATE SET creation_time=EXCLUDED.creation_time, incoming_seqnum=EXCLUDED.incoming_seqnum, outgoing_seqnum=EXCLUDED.outgoing_seqnum`. Atomic, one `statement_timeout` bounds it, no transaction held open on a client. (`BEGIN`/`DELETE`/upsert/`COMMIT` is four statements on a held client: each is bounded, the whole is not before PostgreSQL 17's `transaction_timeout`, and it leaves an idle-in-transaction window) |

Read `creation_time` through a fixed format and parse it strictly as UTC: `pg`
otherwise builds a local-time `Date` from a `TIMESTAMP` column, and
`creation_time::text` follows the server's `DateStyle` (under `'SQL, DMY'` it
is `22/10/2026 ...`). Write whole seconds as UTC text, never a JS `Date`
through raw `pg` (which formats it in the process's time zone; an ORM such
as Prisma formats it in UTC, and then only the whole seconds matter).
Convert `NUMERIC`/`BIGINT` results back to `number` and validate. MySQL/MariaDB
and SQL Server need different statements, column-size and collation checks,
and (SQL Server) a byte-preserving message encoding: `upstream-schemas.md`
sections 7.2 and 7.3.

**Document / key-value stores** (design guidance derived from the contract, not
from a shipped implementation; validate with the checklist):

- *State record*: one document/hash per session, id = the canonical string
  `sessionID.toString()` (or a composite key). `load` = get → `null` when
  absent. `setSeqNums` = one atomic update of both fields (`HSET` with two
  fields, `updateOne` with `$set` of both). `create` = insert; `reset`'s state
  write = upsert.
- *Message records*: one item per `(session, seqNum)`, with a key or index that
  **sorts numerically** on `seqNum`. If the sort key is a string (Redis members,
  DynamoDB sort keys, Mongo string `_id`s), zero-pad to a fixed width (20
  digits covers 64 bits) or use a numeric field with an index. `setMessage` =
  put/upsert on that key. `getMessages` = one range query
  (`ZRANGEBYSCORE`, `BETWEEN`, `$gte/$lte` + `sort({seq: 1})`), map to the
  strings, drop nothing but genuinely missing keys. One entry per `seqNum`:
  if the backend keeps history (an append-only log or stream, versioned
  items, a table without a unique `(session, seqNum)` key), collapse to the
  latest write before returning (contract E10), as upstream's `FileStore`
  does with its append-only body file.
- *Reset*: a transaction when the store has one (Mongo on a replica set, Redis
  `MULTI/EXEC`, DynamoDB `TransactWriteItems` within its item limit); otherwise
  delete the messages first, then write the state. For stores where "delete all
  messages of a session" is a scan (DynamoDB, Redis hashes), an alternative is a
  *generation* number in the state record: `reset` bumps it and writes the
  state atomically, messages are keyed by `(session, generation, seqNum)`, and
  old generations are garbage-collected later. `getMessages` then reads only the
  current generation. (Derived; keeps reset O(1) and atomic.)
- *Durability*: configure the store so that an acknowledged write survives a
  crash of the store process (`appendfsync always` or `WAIT` for replicas in
  Redis, `j: true` / majority write concern in Mongo, conditional on the
  product's own documentation, which this skill does not reproduce). An
  in-memory-only store silently violates rule G1.

Redis sketch (ioredis-style, sync-free, no threadpool use; one connection runs
commands in order, which already satisfies contract D7; over a pool or a
cluster client, wrap it in `serialisePerSession()`):

```ts
const k = (id: SessionID) => `fix:${id.toString()}`;
// MULTI/EXEC resolves even when a queued command fails (one [err, result] per
// command), and null when aborted: check, or a failed write is swallowed (I6).
async function exec(m: ReturnType<typeof redis.multi>): Promise<void> {
  const results = await m.exec();
  if (results === null) throw new Error('transaction aborted');
  for (const [err] of results) if (err) throw err;
}
const adapter: MessageStoreAdapter = {
  async load(id) {
    const h = await redis.hgetall(`${k(id)}:state`);
    if (!h.creationTime) return null;
    return { creationTime: new Date(h.creationTime), nextSenderMsgSeqNum: Number(h.nextSender), nextTargetMsgSeqNum: Number(h.nextTarget) };
  },
  async create(id, s) {
    await redis.hset(`${k(id)}:state`, { creationTime: s.creationTime.toISOString(), nextSender: s.nextSenderMsgSeqNum, nextTarget: s.nextTargetMsgSeqNum });
  },
  async setSeqNums(id, sender, target) {
    // One atomic script, both fields; a missing row is an error (C3), not a
    // partial hash that load() would then report as null.
    const ok = await redis.eval(
      "if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end " +
        "redis.call('HSET', KEYS[1], 'nextSender', ARGV[1], 'nextTarget', ARGV[2]) return 1",
      1, `${k(id)}:state`, sender, target,
    );
    if (ok !== 1) throw new Error(`no state row for ${id.toString()}`);
  },
  async setMessage(id, seq, msg) {
    await exec(redis.multi().hset(`${k(id)}:msgs`, String(seq), msg).zadd(`${k(id)}:idx`, seq, String(seq))); // upsert: HSET overwrites, ZADD re-scores
  },
  async getMessages(id, begin, end) {
    const seqs = await redis.zrangebyscore(`${k(id)}:idx`, begin, end); // numeric score order, inclusive
    if (seqs.length === 0) return [];
    const msgs = await redis.hmget(`${k(id)}:msgs`, ...seqs);
    return msgs.filter((m): m is string => typeof m === 'string');
  },
  async reset(id, s) {
    await exec(
      redis.multi()
        .del(`${k(id)}:msgs`, `${k(id)}:idx`)
        .hset(`${k(id)}:state`, { creationTime: s.creationTime.toISOString(), nextSender: s.nextSenderMsgSeqNum, nextTarget: s.nextTargetMsgSeqNum }),
    );
  },
};
```

## Wiring and operations

```ts
import { Initiator, type MessageStoreAdapter } from '@homaiohq/napi-quickfix';

const engine = await Initiator.create({
  settings,
  store: adapter,           // a MessageStoreAdapter: create() only; `new Initiator({ store: adapter })` throws TypeError
  storeTimeoutMs: 30_000,   // default; 0 disables; TypeError when passed with 'file'/'memory'; RangeError if negative/non-integer
  log: 'none',
});
engine.on('storeError', (sessionID, method, error, poisoned) => {
  // error.name === 'QuickFixError', error.fixErrorName === 'IOException',
  // error.message === `message store ${method}: ...` ('(late)' suffix for a late settlement).
  // poisoned === true: writes fail until a reload through load() succeeds; the session disconnects
  // at its next inbound message unless that reload succeeds first.
  // May arrive after the failed send's Promise settled. A send that resolved `false` was not
  // sent only when the method was 'setMessage'; after a 'setSeqNums' failure the message may
  // still go out later as a PossDupFlag=Y resend: reconcile, do not resubmit blindly (contract I8).
});
```

- Give the driver connect/acquire timeouts and a SERVER-side statement limit
  (`statement_timeout`, `lock_timeout`), so failures are rejections (settled)
  rather than timeouts (unsettled, which delay recovery). They add up: one
  call costs checkout/connect + every round trip it makes (`load()`'s lock
  check included) + the kill-and-confirm step of an unknown outcome, and that
  sum must stay below `storeTimeoutMs` (contract I2 has a worked budget). No
  client-side query timeout as a backstop; on an unknown outcome follow
  contract I2 (PostgreSQL: at connect, read `pid` and `backend_start` (as
  integer microseconds, never a `Date`) from `pg_stat_activity WHERE pid =
  pg_backend_pid()`; on an unknown outcome,
  `pg_terminate_backend` that `(pid, backend_start)` from another, already
  open connection, poll `pg_stat_activity` until it is gone, then reject).
- **Check the connection at connect, refuse to start on a mismatch**:
  `pg_backend_pid()` equals `client.processID` (else a pooler sits in
  between: connect the store directly to PostgreSQL), and the effective
  `statement_timeout`, `lock_timeout`, `DateStyle`, `search_path` equal what
  you configured (an `options=` in the connection URL replaces your
  `options`), contract I2.
- **Threadpool**: set `UV_THREADPOOL_SIZE` above the maximum number of
  in-flight sends plus a margin for reconnects (in the environment, or as the
  first statement of the entry module), and bound in-flight `sendToTarget()`
  calls below it (await them, or a small semaphore): each may be parked in a
  store write on a pool thread, and a reconnect needs pool slots of its own
  (`dns.lookup`; `pg`'s SCRAM authentication), contract H4.
- **Connections**: give the store its own pool, not the application's: the
  short `statement_timeout`/`lock_timeout` the store needs (seconds) would
  cut the application's long queries, and the application's load would delay
  the store's checkouts. Warm it before `Initiator.create()` (hold N clients
  at once, then release them: `pg-pool` reuses an idle client before it
  opens one, so N checkouts in a row open one connection) and keep the
  connections open (`pg-pool`:
  `idleTimeoutMillis: 0`; its default closes idle clients after 10 s, so a
  quiet session reconnects inside a store call, and its `min` opens nothing
  by itself). Servers still drop connections (restart, failover,
  `idle_session_timeout`, PgBouncer): replenish from the event loop, outside
  store calls. Check clients out explicitly rather than through
  `pool.query()`, which destroys the client on any error, a statement
  timeout included (contract H4).
- **Error events**: `pool.on('error', ...)`, AND `client.on('error', ...)` on
  every client you hold checked out (a transaction, a warm-up, a replenish, a
  dedicated connection): `pg-pool` removes its own listener from a client
  while it is checked out, and an unhandled `'error'` is an uncaught exception
  that kills every FIX session of the process (contract I9).
  `pool.on('connect', (c) => c.on('error', ...))` covers every client.
- **Shutdown**: `pg`'s `pool.end()` waits without limit for a frozen server;
  bound it with a grace period and `process.exit()` (contract I7). A
  statement whose socket you destroyed there may still commit after the
  thaw: an unknown outcome, logged, and ended (I2) before the sessions start
  again on the same rows.
- `await engine.stop()` before `Initiator.create({ store: sameAdapter })`
  again; `close()` runs before `stop()` resolves, so the order is guaranteed.
- Let the application own the pool's lifetime; `close()` is per session.
- Unless every session has its own connection, wrap the adapter in a
  per-session FIFO (contract D7). The engine stops overlapping calls for a
  session only until one times out; after that, a pool can commit an older
  write after a newer one. The wrapper below fixes the order whatever the
  backend; it costs nothing while calls are fast, and while one call is stalled
  the session's later calls queue behind it (and time out), which is the
  correct outcome for a session whose store is stuck. The queue is the whole
  fix: do not add fencing tokens, writer ids or clock-based conditions on top
  (one engine per session row, G3, is an operational rule, and fences add
  failure modes of their own):

```ts
import type { MessageStoreAdapter, SessionID } from '@homaiohq/napi-quickfix';

/** Each session's calls run one after another in call order, even past a timeout (contract D7). */
export function serialisePerSession(inner: MessageStoreAdapter): MessageStoreAdapter {
  const tails = new Map<string, Promise<unknown>>();
  function run<T>(id: SessionID, fn: () => T | Promise<T>): Promise<T> {
    const key = id.toString();
    const next = (tails.get(key) ?? Promise.resolve()).then(fn, fn); // after the previous call settled, either way
    tails.set(key, next.catch(() => {}));
    return next;
  }
  return {
    load: (id) => run(id, () => inner.load(id)),
    create: (id, state) => run(id, () => inner.create(id, state)),
    setSeqNums: (id, sender, target) => run(id, () => inner.setSeqNums(id, sender, target)),
    setMessage: (id, seq, msg) => run(id, () => inner.setMessage(id, seq, msg)),
    getMessages: (id, begin, end) => run(id, () => inner.getMessages(id, begin, end)),
    reset: (id, state) => run(id, () => inner.reset(id, state)),
    ...(inner.close && { close: (id: SessionID) => run(id, () => inner.close!(id)) }),
  };
}
```

  The order it enforces is the order your Promises report: settle only when
  the backend is done with the statement (a server answer, or a backend you
  ended and saw gone; contract I2), never on a client-side timeout that
  rejects while the server still commits.

### Through an ORM

An ORM's API hides what contract I2 needs: the connection a statement went
to, and whether the server answered. Through Prisma 7 (issue #36) a lost
connection is P2010 with no SQLSTATE and no pid is reachable, so a store
written only against Prisma's API settles unknown outcomes. Decide first:

- **Recommended: the ORM for the application, plain `pg` for the store**, on
  its own `pg.Pool`, as in this file. The store is seven statements.
- **Or the ORM over a pool you own**: a `pg.Pool` subclass whose `query()`
  implements kill-and-confirm, handed to `new PrismaPg(pool, { schema })`,
  one statement per method, never `$transaction` (it goes through
  `pool.connect()`, around your `query()`, and its `timeout` is no
  deadline), and a startup check that statements really reach your
  `query()`. The lock of G3 still needs a plain `pg.Client`.

Either way own the pool and its error listeners: `PrismaPg` handles pool
errors only between `$connect()` and `$disconnect()`. The table of calls and
the silent traps (schema qualification, `Decimal`, Invalid Date under a
non-ISO `DateStyle`, `update` vs `updateMany`, `upsert` eligibility,
query-shape warm-up) are in `references/sql-adapter-reference.md` "Through
an ORM".

## Pitfalls checklist

Before declaring the adapter done, confirm each of these explicitly:

1. `load()` of an unknown session returns `null`; it never throws, never
   inserts.
2. `setSeqNums` writes BOTH columns; and if the backend is upstream's layout,
   `outgoing_seqnum = nextSender`, `incoming_seqnum = nextTarget` (test 4.1).
3. `setMessage` on an existing seqnum replaces it and does not throw.
4. `getMessages(3, 7)` with 4 and 6 missing returns `[m3, m5, m7]`;
   `getMessages(4, 5)` with 4 missing returns `[m5]`; `getMessages(9, 11)`
   returns 9, 10, 11 in that order; an empty range returns `[]`.
5. The stored message string is byte-identical: SOH present, quotes and
   backslashes intact, nothing escaped twice.
6. `reset()` deletes only that session's messages, upserts its row with the
   given `creationTime`, and is atomic or DELETE-first.
7. `creationTime` round-trips to the same instant under a non-UTC `TZ`, a
   non-UTC database session time zone and (PostgreSQL) a non-ISO `DateStyle`;
   on upstream's tables it is written in whole seconds.
8. Nothing on the hot path touches `fs.promises`, `dns.lookup`, `zlib`, async
   `crypto`, or a pool-using native addon; reconnects (which do, through DNS
   and `pg`'s SCRAM) happen outside store calls where possible, and
   `UV_THREADPOOL_SIZE` exceeds the bound on in-flight sends plus a reconnect
   margin (test 3.9).
9. No store method awaits `session.*()`, `sendToTarget()` on that session, or
   `engine.stop()`.
10. Every method rejects at once when the backend refuses connections or
    answers with an error, within checkout + statement limits that sum below
    `storeTimeoutMs`. A call whose statement was sent and got no answer is
    rejected only after the backend was ended and confirmed gone; while the
    server is unreachable it stays pending (the engine times it out). No
    client-side query timeout settles a call (test 3.7).
11. Seqnums returned from the backend are converted to safe-integer `number`s.
12. `close()` does not tear down a pool another engine or session still uses.
13. Two sessions whose CompIDs differ only by case get two rows (MySQL and
    SQL Server default collations merge them: test 4.6).
14. The largest message you send fits the column, or `setMessage` rejects it;
    nothing is truncated or dropped silently (MySQL `BLOB` = 65,535 bytes:
    test 4.5).
15. Non-ASCII messages come back byte-identical, checked on the raw column
    (SQL Server `TEXT` is a single-byte code page: test 4.7).
16. If a C++ engine shares the tables: its known defects are designed around
    (`upstream-schemas.md` section 8) and only one engine runs a session at a
    time.
17. Nothing guards the numbers' direction: `setSeqNums(50, 60)` then
    `setSeqNums(3, 4)` loads `3/4` (no `GREATEST`, no "only if higher"
    condition, no reject on a decrease: test 1.15).
18. A late write cannot overtake a newer one for the same session: one
    connection per session, or the `serialisePerSession` wrapper, with
    server-side statement timeouts (tests 3.6, 3.7).
19. `getMessages` returns one entry per seqnum, the last written, even after
    many rewrites; `begin = 0` works (test 1.16).
20. `reset` deletes every message of the session, including numbers above the
    old next sender number (test 1.17).
21. Nothing filters, re-keys or renumbers messages: admin messages and
    not-yet-sent ones are stored under exactly the seqnum given.
22. A real message (non-ASCII text, CR/LF inside a field) still passes its own
    BodyLength/CheckSum after the round trip (test 1.18).
23. The pool AND every client held checked out have an `'error'` listener; a
    server ending a connection at any moment never crashes the process
    (test 3.8).
24. The store has its own pool, with idle connections kept open, warmed before
    `create()` by holding N clients at once, replenished from the event loop;
    `pool.end()` cannot hold the process forever, and a statement whose
    socket the shutdown destroyed is treated as an unknown outcome (test
    3.10).
25. On PostgreSQL, `reset` is one statement (a data-modifying CTE), not a
    client-side transaction.
26. The messages table is access-restricted (it holds Logon passwords), and
    the store database does not log statements.
27. A reload whose `load()` finds no row is alarmed on, rate-limited, or
    rejected; if rejected, so is a first `load()` that finds no row but
    finds messages (B3, test 3.12).
28. A second process on the same sessions is refused at startup AND while
    running: the lock connection is opened at warm-up with `keepAlive` and
    `idle_session_timeout = 0`, a lost lock is re-taken from the event loop
    and the session's writes are refused until it is, a reload verifies the
    lock, and the lock key follows G3's convention (test 3.11).
29. Kill-and-confirm cannot match nothing by mistake: `(pid,
    backend_start)` read from the server, no other predicate, no pooler in
    the path, effective timeouts read back at connect (test 3.7 run with the
    production connection string).
30. Through an ORM: no `$transaction`, every write reports a row count, and
    unknown outcomes are handled under the ORM, in a pool you own (or the
    store does not use the ORM at all).
