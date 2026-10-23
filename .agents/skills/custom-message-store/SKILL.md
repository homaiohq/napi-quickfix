---
name: custom-message-store
description: Implement a custom MessageStoreAdapter for the napi-quickfix binding (@homaiohq/napi-quickfix) so FIX session state (next sequence numbers, creation time, sent messages for resends) is persisted in the user's own backend. Use whenever the user wants to "implement a message store", "write a MessageStoreAdapter", "persist FIX session state / sequence numbers in Postgres / MySQL / MariaDB / SQL Server / SQLite / MongoDB / Redis / DynamoDB / any database", "reuse / migrate from a QuickFIX C++ database" (the tables of its PostgreSQLStore, MySQLStore or OdbcStore), share those tables with a C++ engine during a cutover or as a standby, or asks what load / create / setSeqNums / setMessage / getMessages / reset / close must do, or how upserts, gaps, write ordering, late or timed-out writes on a connection pool, poison or close() behave; also when reviewing an existing adapter, or debugging resends that deliver the wrong message, lose messages or reuse sequence numbers. Self-contained: the store contract as sourced rules, the upstream column mapping (DDL linked, not copied), per-backend guidance checked against upstream's own stores, a worked SQL adapter, and a test checklist.
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

**Sources and versions.** The binding at `@homaiohq/napi-quickfix` 0.3.1, branch
`feat/js-message-store` @ `f802818` (`src/store.ts`, `cpp/js_message_store.{h,cpp}`,
`README.md` "Message store", `ARCHITECTURE.md` §4b/§5, `test/store.test.ts`,
`test/store-adapters.ts`, and that revision's SQL adapter test, whose `contract()`
is reproduced as section 1 of `references/test-checklist.md`), and QuickFIX C++
**v1.16.0**
(the tag `CMakeLists.txt` pins). Every rule in the references cites one of them;
when the skill and a newer repository disagree, the repository wins: re-read the
cited file. The interop guidance was also checked by running upstream's own
`PostgreSQLStore`/`MySQLStore`/`OdbcStore` against PostgreSQL 16, MySQL 8.4 and
SQL Server 2022 (`upstream-schemas.md` "Verification").

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
   processes; expected message rate. For an existing SQL deployment also
   find out, or check yourself: the server version, the key columns'
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
   (the logic checks), 3.3 (bounded hang) or 3.6 (late write ordering).
7. **Review** against the pitfalls list at the end of this file.

## The interface (from `src/store.ts`)

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
the state, creating the row when missing. Read it (`src/store.ts`) when a rule
is unclear: it is the oracle the test checklist compares against.

## Lifecycle: who calls what, when, on which thread

| Moment | Adapter calls | Thread | Notes |
| --- | --- | --- | --- |
| `Initiator.create()` / `Acceptor.create()` | `load(id)` for every session the engine will own; `create(id, {now, 1, 1})` when `load` returned `null` | JS (awaited in TS before the engine exists) | A rejection or a malformed `load` result rejects `create()`; no engine is built |
| engine constructor, session outside its `StartTime`/`EndTime` window | `reset(id, {now, 1, 1})` | JS (direct call; its Promise is awaited by `create()`) | The only engine-driven store call made on the JS thread |
| each outbound message | `setMessage(id, n, wire)` then `setSeqNums(id, n+1, target)` **then** the bytes go out | the engine's network thread or a `sendToTarget()` worker, holding the session-state mutex | Write-through: your ack precedes the wire |
| each inbound message | `setSeqNums(id, sender, target+1)` | network thread | After your `fromApp` handler ran |
| peer's ResendRequest | `getMessages(id, begin, end)` | network thread | Range already bounded by the engine |
| `ResetOnLogon=Y`, `ResetOnLogout=Y`, `ResetOnDisconnect=Y`, a Logon sent or received with `ResetSeqNumFlag=Y`, session-time rollover (there is no JS-side `reset()`: `setNextSenderMsgSeqNum()` / `setNextTargetMsgSeqNum()` reach the adapter as `setSeqNums`) | `reset(id, {now, 1, 1})` | network thread (a `sendToTarget()` worker only if the application itself sends a Logon carrying `ResetSeqNumFlag=Y`, `Session.cpp:559-567`) | Never fatal to QuickFIX; failure poisons |
| `RefreshOnLogon=Y`, `session.refresh()`, and the reload that lifts a poisoned store | `load(id)` | network thread / worker | `null` means "nothing to apply" |
| `await engine.stop()` | `close(id)` once per session, after the sessions are destroyed | JS | Not called when the engine is dropped without `stop()` |

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
  never creates; it is also the refresh and the recovery read. `create` inserts.
  A malformed state is a `TypeError` at startup, an `IOException` later.
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
  none (also when `begin > end` or `begin` is 0), strings only. Order and
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
  QuickFIX.
- **Durability (G).** Return only once durable: no write-behind, no cache
  standing in for the database; the engine advances its cached numbers after
  your ack and sends after that. Upstream's floor is "survives a process
  crash" (`fflush`, no `fsync`); surviving a host crash depends on the
  server's flush settings (`synchronous_commit`, `innodb_flush_log_at_trx_commit`,
  `appendfsync`), a deliberate trade. Sync methods are allowed. One engine per
  session row. Inbound processing stays at-least-once whatever you do
  (`fromApp` runs before the number is written): dedupe in the app (G5).
- **Threads (H).** Per-session calls are serialised by the engine, except a
  call that timed out (D7); your method runs on the event loop while an engine
  thread waits. The hot path must not need a libuv threadpool slot
  (`fs.promises`, `dns.lookup`, `zlib`, async `crypto`), or raise
  `UV_THREADPOOL_SIZE`. Never await an engine operation on the same session
  from inside a store method.
- **Errors (I).** Throw or reject; never hang. `storeTimeoutMs` (default 30 s)
  bounds every call; a timed-out `setSeqNums`/`reset` blocks recovery until it
  settles, so give the driver shorter timeouts than `storeTimeoutMs`, enforced
  by the server (`statement_timeout`) rather than the client: a Promise that
  rejects while the statement still commits defeats the engine's ordering.
  Poison = the session's writes fail, the engine disconnects it, and the next
  call after all late writes settled reloads through `load()`; QuickFIX
  reconciles with the peer at the next logon.
- **`close` (J).** Optional, per session, after `stop()`; not a durability
  hook; do not close a pool shared with other engines from it.

## Data model: SQL and non-SQL

Two records per session kind, both addressed by the four-field key:

```
session state : key(begin, sender, target, qualifier) -> { creationTime, nextSender, nextTarget }
messages      : key(begin, sender, target, qualifier, seqNum) -> wireString
```

**SQL.** Use the upstream layout (tables `sessions` and `messages`,
`references/upstream-schemas.md` section 5 links to the upstream DDL) unless you have a reason not
to; it is proven and interoperable. Statements, in PostgreSQL syntax (the
worked example in `sql-adapter-reference.md` has all three dialects):

| Method | Statement |
| --- | --- |
| `load` | `SELECT to_char(creation_time, 'YYYY-MM-DD HH24:MI:SS.MS') AS creation_time, incoming_seqnum, outgoing_seqnum FROM sessions WHERE beginstring=$1 AND sendercompid=$2 AND targetcompid=$3 AND session_qualifier=$4` → `null` for no row; `nextTargetMsgSeqNum = incoming_seqnum`, `nextSenderMsgSeqNum = outgoing_seqnum` |
| `create` | `INSERT INTO sessions (beginstring, sendercompid, targetcompid, session_qualifier, creation_time, incoming_seqnum, outgoing_seqnum) VALUES ($1,$2,$3,$4,$5,$6,$7)` with `$5 = 'YYYY-MM-DD HH:MM:SS'` in UTC, whole seconds, `$6 = nextTarget`, `$7 = nextSender` |
| `setSeqNums` | `UPDATE sessions SET outgoing_seqnum=$1, incoming_seqnum=$2 WHERE <key>` (`$1 = nextSender`, `$2 = nextTarget`) |
| `setMessage` | `INSERT INTO messages (<key cols>, msgseqnum, message) VALUES (...) ON CONFLICT (<key cols>, msgseqnum) DO UPDATE SET message = EXCLUDED.message` |
| `getMessages` | `SELECT message FROM messages WHERE <key> AND msgseqnum >= $5 AND msgseqnum <= $6 ORDER BY msgseqnum ASC` |
| `reset` | in one transaction: `DELETE FROM messages WHERE <key>`; then `INSERT INTO sessions (...) VALUES (...) ON CONFLICT (<key cols>) DO UPDATE SET creation_time=EXCLUDED.creation_time, incoming_seqnum=EXCLUDED.incoming_seqnum, outgoing_seqnum=EXCLUDED.outgoing_seqnum` |

Read `creation_time` through a fixed format and parse it strictly as UTC: `pg`
otherwise builds a local-time `Date` from a `TIMESTAMP` column, and
`creation_time::text` follows the server's `DateStyle` (under `'SQL, DMY'` it
is `22/10/2026 ...`). Write whole seconds as UTC text, never a JS `Date`.
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
    await redis.hset(`${k(id)}:state`, { nextSender: sender, nextTarget: target }); // one command, both fields
  },
  async setMessage(id, seq, msg) {
    await redis.multi().hset(`${k(id)}:msgs`, String(seq), msg).zadd(`${k(id)}:idx`, seq, String(seq)).exec(); // upsert: HSET overwrites, ZADD re-scores
  },
  async getMessages(id, begin, end) {
    const seqs = await redis.zrangebyscore(`${k(id)}:idx`, begin, end); // numeric score order, inclusive
    if (seqs.length === 0) return [];
    const msgs = await redis.hmget(`${k(id)}:msgs`, ...seqs);
    return msgs.filter((m): m is string => typeof m === 'string');
  },
  async reset(id, s) {
    await redis.multi()
      .del(`${k(id)}:msgs`, `${k(id)}:idx`)
      .hset(`${k(id)}:state`, { creationTime: s.creationTime.toISOString(), nextSender: s.nextSenderMsgSeqNum, nextTarget: s.nextTargetMsgSeqNum })
      .exec();
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
  // poisoned === true: the session will disconnect and reload through load() when the adapter is back.
});
```

- Give the driver connect/acquire/statement timeouts shorter than
  `storeTimeoutMs`, so failures are rejections (settled) rather than timeouts
  (unsettled, which delay recovery).
- Warm the connection pool before `Initiator.create()` and keep a minimum pool
  size: a reconnect inside a store call needs `dns.lookup`, which needs a libuv
  threadpool slot that may be parked in another store write.
- Bound in-flight `sendToTarget()` calls (await them, or a small semaphore);
  each may be parked in a store write on a pool thread.
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
  the backend is done with the statement (server-side `statement_timeout`,
  not a client-side query timeout that rejects while the server still
  commits).

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
   `crypto`, or a pool-using native addon.
9. No store method awaits `session.*()`, `sendToTarget()` on that session, or
   `engine.stop()`.
10. Every method rejects within the driver timeout when the backend is down;
    none hangs past `storeTimeoutMs`.
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
    server-side statement timeouts (test 3.6).
19. `getMessages` returns one entry per seqnum, the last written, even after
    many rewrites; `begin = 0` works (test 1.16).
20. `reset` deletes every message of the session, including numbers above the
    old next sender number (test 1.17).
21. Nothing filters, re-keys or renumbers messages: admin messages and
    not-yet-sent ones are stored under exactly the seqnum given.
22. A real message (non-ASCII text, CR/LF inside a field) still passes its own
    BodyLength/CheckSum after the round trip (test 1.18).
