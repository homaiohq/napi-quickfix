# The MessageStoreAdapter contract, as rules

Every rule below is sourced. The sources, and the versions they were read at:

| Tag | Meaning |
| --- | --- |
| `[store.ts]` | `src/store.ts` of `@homaiohq/napi-quickfix` 0.3.1, branch `feat/js-message-store` @ `f802818` (the TS interface, its JSDoc, `MapMessageStore`, `StoreBinding.preload()`/`closeAll()`, `validState()`) |
| `[js_message_store.h]` / `[js_message_store.cpp]` | `cpp/js_message_store.{h,cpp}`, same revision (the native `FIX::MessageStore` over the adapter: dispatch, cache, timeout, poison, `ParseResult`) |
| `[README]` | `README.md` section "Message store", same revision |
| `[ARCH]` | `ARCHITECTURE.md` §4b "The message-store bridge" and §5 "Lock order", same revision |
| `[store.test]` | `test/store.test.ts`, same revision; cited by test title |
| `[store-sql.test]` | the SQL adapter test, `test/store-sql.test.ts` at the same revision (identical at `6b8caa0`, the commit that introduced the SQL adapter): `contract()`, reproduced as section 1 of `test-checklist.md`, and `loopback()`. Not part of every checkout that carries this skill |
| `[QF <file>:<line>]` | QuickFIX C++ **v1.16.0** (the tag pinned by `CMakeLists.txt` `GIT_TAG v1.16.0`; FetchContent checkout `2ce8a60667d95a55cdc57a210f165e19cb757126`), path under `src/C++/` |

Where a rule is *derived* (a consequence of sourced facts rather than a
sentence in a source) it says so.

Vocabulary: "the engine" is the `Initiator`/`Acceptor`; "an engine thread" is
QuickFIX's network thread or a libuv worker running a session operation; "SS" is
`SessionState::m_mutex`, which QuickFIX holds across every store call.

---

## A. Data model and keys

**A1. The key of everything is the session id's four fields**:
`beginString`, `senderCompID`, `targetCompID`, `sessionQualifier` (the empty
string when there is none). There is no SenderSubID/LocationID in a QuickFIX
C++ session id. Sources: `[store.ts]` every method takes `sessionID: SessionID`;
`src/session-id.ts` exposes exactly those four getters; `[QF SessionID.h:33-52]`
has exactly those four identity fields (plus an `isFIXT` flag and the frozen
string); the upstream tables' primary key is
`(beginstring, sendercompid, targetcompid, session_qualifier)` (see
`upstream-schemas.md`).

**A2. The canonical string form is `BEGIN:SENDER->TARGET` plus `:QUALIFIER` when
set** (`FIX.4.4:CLIENT->BROKER`, `FIX.4.4:CLIENT->BROKER:Q1`). Sources:
`[QF SessionID.h:85-91]`; `test/session-id.test.ts` "toString() uses the
canonical FIX.x.y:SENDER->TARGET format" / "supports an optional session
qualifier"; `MapMessageStore` keys its `Map` by `sessionID.toString()`
`[store.ts]`. A composite key of the four fields is safer than the string when
your backend supports one (a CompID may legally contain `:`); the string is fine
as a KV key when CompIDs are plain identifiers.

**A3. The per-session state is three values**:
`creationTime: Date`, `nextSenderMsgSeqNum: number`, `nextTargetMsgSeqNum:
number`. Sequence numbers are positive safe integers (`1 <= n <= 2^53-1`);
values at or above `2^53` are not supported by the binding. Sources:
`[store.ts]` `MessageStoreState`, `validState()`; `[js_message_store.cpp]`
`ReadSeq()` (`d < 1 || floor(d) != d || d > 2^53-1` → error). The bridge
refuses outbound values above the limit too, so your adapter is never asked to
write one: `[js_message_store.cpp]` `CheckSafeSeq()` (`n > 9007199254740991` →
non-poisoning `storeError` + `IOException` before `Forward()`, from `set()`,
`setNextSenderMsgSeqNum()`, `setNextTargetMsgSeqNum()` and hence `incrNext*()`;
a counterparty's `SequenceReset` with such a `NewSeqNo` disconnects the session
instead of persisting a rounded number). Upstream's
`SEQNUM` is a 64-bit unsigned and its test case exercises `uint64 max`
(`[QF test/MessageStoreTestCase.h]` `CHECK_MESSAGE_STORE_SET_GET_UINT64`), so
use a 64-bit-capable column/field even though the binding stops at `2^53-1`.

**A4. The numbers are the NEXT sequence numbers, not the last used.**
`nextSenderMsgSeqNum` is the `MsgSeqNum` (tag 34) the next outbound message will
carry; `nextTargetMsgSeqNum` is the one expected on the next inbound message. A
brand-new session is `1 / 1`. Sources: `[store.ts]` JSDoc of
`MessageStoreState`; `[QF MessageStore.h]` `MemoryStore` constructor
(`m_nextSenderMsgSeqNum(1), m_nextTargetMsgSeqNum(1)`) and `reset()`
(`= 1; = 1`); `[store.ts]` `preload()` creates
`{ creationTime: new Date(), nextSenderMsgSeqNum: 1, nextTargetMsgSeqNum: 1 }`.

**A5. Messages are a map `(session, seqNum) -> string` of OUTBOUND messages,
stored as the raw FIX wire string with SOH (`0x01`) delimiters.** Sources:
`[QF Session.cpp:661-667]` `persist()` is called with the string
`message.toString()` produced at `:570`, for outbound messages only;
`[QF Field.h:183]` `encodeTo()` terminates each field with `'\001'`;
`[QF Session.cpp:420]` `generateRetransmits()` locates the message type in a
stored string by searching for `"\00135="`. Store the string byte-exact: never
replace SOH with `|`, never trim, never re-serialise, never parse.

**A6. Message strings may contain single quotes, double quotes, backslashes and
any UTF-8**, and cross the bridge as JS strings. Sources: `[QF
test/MessageStoreTestCase.h]` `CHECK_MESSAGE_STORE_SET_GET_WITH_QUOTE`;
`[store-sql.test]` `contract()` writes
`` `8=FIX.4.2\x019=20\x0135=8\x0134=2\x0158='"Some \\ Text"'\x0110=000\x01` ``
and reads it back equal; `[store.test]` "ResetOnLogon=N: a restart continues
seqnums from the adapter; a gap is served from getMessages (quotes intact)";
`[js_message_store.cpp]` `Invoke()` passes `Napi::String::New(env, req.msg)`.
Use parameter binding or a binary-safe encoding; never interpolate.

**A7. Sessions are independent.** A write, read or reset for one session never
touches another session's rows; two sessions differing only by qualifier are
distinct. Source: `[store-sql.test]` `contract()` ("Another session's rows are
independent (the key includes the qualifier)", "reset is per session").

---

## B. `load()` and `create()`

**B1. `load(sessionID)` returns the persisted state, or `null` when the session
has never been seen.** `undefined` is accepted as `null`. `load()` must not
create anything. Sources: `[store.ts]` JSDoc ("or `null` if the session has
never been seen") and `preload()` (`state === null || state === undefined` →
`create()`); `[js_message_store.cpp]` `ParseResult(kLoad)`
(`IsNull() || IsUndefined()` → `present = false`).

**B2. `load()` of an unknown session must not throw**: a throw or rejection is a
failure, and during `Initiator.create()` / `Acceptor.create()` a failure rejects
the factory and no engine is built. Source: `[store.test]` "create() rejects on a
load()/create() failure with no native object behind it".

**B3. When `load()` is called**: (a) by `Initiator.create()` / `Acceptor.create()`
for every session the engine will own, before the engine exists, once per
session; (b) by `refresh()` (`RefreshOnLogon=Y`, `session.refresh()`); (c) as
the reload that lifts a poisoned store (see I4). Sources: `[store.ts]` JSDoc of
`load`; `[store.test]` "create() preloads exactly the sessions the engine owns:
load(), then create() for a missing row" (`calls == ['load', 'create']`);
`[js_message_store.cpp]` `refresh()` and `Gate()` both issue `Method::kLoad`.
Consequence: `load()` is on the recovery path; keep it a single indexed read.

**B4. The returned object must satisfy A3** (a valid `Date`, two positive safe
integers). A malformed object is a `TypeError` from `create()` at preload time,
and an `IOException` that keeps the store poisoned at reload time. Sources:
`[store.ts]` `validState()`; `[store.test]` "create() rejects on a load()/create()
failure with no native object behind it" (its last step, commented "A malformed
load() result is refused before the engine exists too": `nextSenderMsgSeqNum: 0`
→ `TypeError`);
`[js_message_store.cpp]` `ParseResult(kLoad)` → `"load() must return an object
or null"`, `ReadSeq()`, `FromDate()`. Return a fresh object each time
(`MapMessageStore` returns `{ ...row.state }`).

**B5. `create(sessionID, state)` inserts the session row.** It is only called
after `load()` returned `null` for that session, with
`state = { creationTime: now, nextSenderMsgSeqNum: 1, nextTargetMsgSeqNum: 1 }`.
Source: `[store.ts]` `preload()`. Upstream does the same in one step
(`populateCache()` inserts a `1/1` row when the `SELECT` finds none,
`[QF PostgreSQLStore.cpp:107-127]`).

**B6. One row per key.** Upstream refuses a session that has several rows
(`ConfigError("Multiple entries found for session in database")`,
`[QF PostgreSQLStore.cpp:96-98]`). Enforce the key as a primary/unique key.

**B7. `creationTime` is an absolute instant.** Persist it so that it reads back as
the same instant regardless of the process or database time zone (see
`upstream-schemas.md` "Timestamps" for the interop format and the driver trap).
Source: `[store-sql.test]` `contract()` asserts `|loaded.creationTime - t0| <
1000 ms` after a round trip.

---

## C. `setSeqNums()`

**C1. `setSeqNums(sessionID, nextSender, nextTarget)` persists BOTH numbers, on
every call, even when only one changed.** The engine always sends the pair (the
unchanged one from its cache). Sources: `[store.ts]` JSDoc ("the engine writes
them together"); `[js_message_store.cpp]` `setNextSenderMsgSeqNum()` sends
`r.a = n, r.b = cache.getNextTargetMsgSeqNum()` and `setNextTargetMsgSeqNum()`
the converse; `incrNext*()` call those.

**C2. It is the hottest write**: once per outbound message (`persist()` →
`incrNextSenderMsgSeqNum()`, `[QF Session.cpp:666]`) and once per inbound
message (`incrNextTargetMsgSeqNum()`, e.g. `[QF Session.cpp:265,299,308,...]`),
plus `session.setNext*()` and inbound `SequenceReset` (`[QF Session.cpp:357]`).
Make it one write addressed by the primary key.

**C3. The row exists** (created by `create()` or `reset()`). Upstream's `UPDATE`
silently affects zero rows when it does not (`[QF PostgreSQLStore.cpp:238-252]`);
`MapMessageStore` throws (`[store.ts]` `#row()`). Prefer the latter: if your
driver reports zero rows affected, reject, so a misconfiguration (wrong table,
wrong prefix) surfaces as a `storeError` instead of silently losing state.
(Derived.)

**C4. `setSeqNums` is FATAL on failure**: a rejection, a timeout, or a settlement
after the timeout poisons the session's store (see I3/I4). Sources: `[README]`
"Failure policy"; `[js_message_store.cpp]` `Forward(r, /*fatal=*/true)` in
`setNext*MsgSeqNum()`.

**C5. Resolve only after the write is durable** (G1). The engine's cached numbers
advance only after your ack, so a rejected write leaves cache and database
equal. Source: `[js_message_store.h]` file comment ("updated only AFTER the
adapter acknowledged a write (DB-first; upstream's incr* bump the cache
first)").

---

## D. `setMessage()`

**D1. `setMessage(sessionID, seqNum, message)` is an UPSERT keyed by
`(session, seqNum)`.** A second write to the same `seqNum` replaces the first;
a duplicate key must never be an error. Sources: `[store.ts]` JSDoc ("Must be
an upsert: a seqnum is rewritten when a previous write failed or timed out and
the engine reused the number"); `[README]` ("an UPSERT, never fails on a
duplicate"); `[store-sql.test]` `contract()` ("setMessage is an upsert":
`setMessage(2,'m2-again')` → `getMessages(2,2) == ['m2-again']`); upstream
`set()` is an `INSERT` with an `UPDATE ... WHERE msgseqnum=` fallback when the
insert fails (`[QF PostgreSQLStore.cpp:178-210]`, `[QF MySQLStore.cpp:177-207]`,
`[QF OdbcStore.cpp:158-187]`).

**D2. Why the same seqnum comes back**: `persist()` stores the message and only
then increments the sender number (`[QF Session.cpp:661-667]`); when the store
throws, `sendRaw()` catches the `IOException` and returns `false`
(`[QF Session.cpp:603-606]`), nothing was sent, and the next send reuses the
number. Sources: `[store.test]` "setMessage rejection: send reports false,
seqnum unchanged, session survives, retry reuses the seqnum" and "setMessage
timeout: not fatal; the late settlement is discarded" ("the upsert replaced the
late row").

**D3. Store the string exactly** (A5, A6). Do not validate it, parse it, or
normalise it.

**D4. Order on the send path: `setMessage(n)` → `setSeqNums(n+1, t)` → the bytes
leave the socket.** Sources: `[QF Session.cpp:570-578]` (`toString`, `persist`,
then `send`), `[QF Session.cpp:589-596]` for application messages; `[README]`
"The store is write-through: the engine persists a message and bumps the
sequence number *before* the message hits the wire". Do not batch or defer: a
message on the wire whose row is not durable cannot be resent after a crash.
(Derived.)

**D5. `setMessage` is NEVER fatal.** A failure is reported (`'storeError'` with
`poisoned: false`), the send resolves `false`, the session stays up. A
settlement after the timeout is discarded by the engine (not reported) and
simply lands as an upsert, so plain last-writer-wins semantics suffice; no
versioning is needed. Sources: `[README]` "Failure policy"; `[js_message_store.cpp]`
`set()` → `Forward(r, /*fatal=*/false)`, `OnSettled()` returns early for any
method other than `kSetSeqNums`/`kReset`; `[store.test]` "setMessage timeout:
not fatal; the late settlement is discarded" (`storeErrors.length == 1`, "a
late setMessage is not reported").

**D6. With `PersistMessages=N` the engine never calls `setMessage()`** and answers
resend requests with `SequenceReset-GapFill` (`[QF Session.cpp:384-391]`).
Implement it anyway; it is the default.

---

## E. `getMessages()`

**E1. `getMessages(sessionID, begin, end)` returns the stored messages with
`begin <= seqNum <= end`, both ends inclusive, as an array of strings.**
Sources: `[store.ts]` JSDoc; upstream `msgseqnum>=begin and msgseqnum<=end`
(`[QF PostgreSQLStore.cpp:214-221]`).

**E2. Ascending by `seqNum`, compared NUMERICALLY.** Sources: upstream `ORDER BY
msgseqnum` on a `NUMERIC` / `BIGINT UNSIGNED` column (`[QF
PostgreSQLStore.cpp:221]`, `[QF MySQLStore.cpp:219]`); `MapMessageStore` sorts
`(a, b) => a - b` `[store.ts]`. A lexical order (`"10" < "9"`) is wrong: when
your backend sorts keys as strings (Redis members, Mongo/DynamoDB string sort
keys), use a numeric type or zero-pad to a fixed width.

**E3. Missing sequence numbers are OMITTED, never padded** with `null`, `''` or a
placeholder: the engine parses each returned string and gap-fills what is not
there. Sources: `[store.ts]` JSDoc ("missing seqnums omitted (never padded)");
`[QF Session.cpp:402-...]` `generateRetransmits()`; `[js_message_store.cpp]`
`ParseResult(kGetMessages)` rejects any non-string entry
(`"getMessages() entries must be strings"`), which fails the call.

**E4. Return `[]` when nothing matches**, including when `begin > end`; never
`null`/`undefined`. Sources: `[QF test/MessageStoreTestCase.h]`
`CHECK_MESSAGE_STORE_SET_GET` (`get(4, 6)` → `0` messages; `get(2, 6)` with
1..3 stored → 2 messages); `[store-sql.test]` `contract()`
(`getMessages(4, 6) == []`, `getMessages(2, 6) == [quotes, 'm3']`);
`[js_message_store.cpp]` `ParseResult(kGetMessages)` (`!IsArray()` → error).

**E5. Do NOT copy upstream `MemoryStore::get()`.** It starts at
`m_messages.find(begin)` (`[QF MessageStore.cpp:40]`), so when `begin` itself
is absent it returns nothing at all even if later numbers exist. The SQL stores
(range predicate) and `FileStore::get()` (iterates `begin..end` and pushes what
exists, `[QF FileStore.cpp:278-286]`) are the behaviour to reproduce, and so is
`MapMessageStore` `[store.ts]`.

**E6. The range is bounded before it reaches you.** `EndSeqNo` `0` (FIX >= 4.2),
`999999` (FIX <= 4.2) or anything `>= nextSender` is replaced by
`nextSender - 1` (`[QF Session.cpp:378-382]`). You never see "0 = infinity",
but a range may be wide (a peer asking from 1): serve it with one indexed
range scan, not a per-number loop of round trips. (Derived.)

**E7. Only this session's rows** (A7).

**E8. `getMessages` is NEVER fatal**: on failure the engine disconnects the
session, the peer reconnects and re-requests. A result arriving after the
timeout is discarded. Sources: `[README]` "Failure policy";
`[js_message_store.cpp]` `get()` → `Forward(r, /*fatal=*/false)`.

**E9. Return JS strings.** If your driver hands back bytes (MySQL `BLOB`), decode
as UTF-8 (the removed SQL adapter did `Buffer.from(m).toString('utf8')`, see
`sql-adapter-reference.md`).

---

## F. `reset()`

**F1. `reset(sessionID, state)` deletes every message of the session and
persists `state`**, which the engine fills with the new `creationTime` and
`nextSenderMsgSeqNum = nextTargetMsgSeqNum = 1`. Sources: `[store.ts]` JSDoc;
`[js_message_store.cpp]` `reset()` builds `r.state = { now, 1, 1 }`; upstream
`reset()` is `DELETE FROM messages WHERE <key>` then `UPDATE sessions SET
creation_time=..., incoming_seqnum=1, outgoing_seqnum=1 WHERE <key>`
(`[QF PostgreSQLStore.cpp:282-318]`).

**F2. Atomic where the backend allows (one transaction).** Where it does not,
keep upstream's order: delete the messages FIRST, then write the state.
Rationale (derived): if the second step fails the call rejects, the store is
poisoned and reloaded; the reloaded state still has the old numbers while the
messages are gone, which the engine handles by gap-filling a resend. The reverse
order would leave stale messages under low sequence numbers that a resend
request after the reset could replay as `PossDupFlag=Y` application messages.
Sources: `[store.ts]` JSDoc ("in one transaction where the backend allows");
`[README]` "Generic SQL adapter" (`reset()` runs its two statements in a
transaction when one is provided).

**F3. `reset()` must UPSERT the session row**: resetting a session that has no row
creates it. Sources: `[store-sql.test]` `contract()` ("reset also (re)creates a
row that does not exist": `reset(fresh, ...)` then `load(fresh)` is truthy);
`MapMessageStore.reset()` creates the row when missing `[store.ts]`.

**F4. Persist the `creationTime` you were given, not your own clock.** QuickFIX
compares it with "now" to decide whether the current session window is the one
the numbering belongs to (`checkSessionTime()`, `[QF Session.h:248-254]`), and
resets the session when it is not (`[QF Session.cpp:85-87]` in the
constructor; `[QF Session.cpp:119-124]` and `[QF Session.cpp:1190-1197]` in
`Session::next()` / `next(Message)`). A drifted or time-zone-shifted creation
time causes spurious resets at startup.

**F5. When `reset()` is called**: `ResetOnLogon=Y` (`[QF Session.cpp:680-682]`
in `generateLogon()` for the initiator; `[QF Session.cpp:216-218]` in
`nextLogon()` for the acceptor), `ResetOnDisconnect=Y` (`[QF Session.cpp:638-640]`,
in `disconnect()`), `ResetOnLogout=Y` (`[QF Session.cpp:324-327]`), a Logon
sent with `ResetSeqNumFlag=Y` (`[QF Session.cpp:564]`) or received with it
(`[QF Session.cpp:202-208]`), session-time rollover (`Session::next()` calls
`reset()` when `checkSessionTime(now)` fails, `[QF Session.cpp:119-124]`,
`[QF Session.cpp:1190-1197]`) and, on the JS thread,
the engine constructor when a session is constructed outside its session time
(`[QF Session.cpp:85-87]`; `[store.test]` "a session constructed outside its
session time resets through the adapter on the JS thread; create() awaits it":
`calls == ['load', 'reset']`).
There is no JS-side `reset()`: the binding deliberately does not expose
`Session::reset()` / `disconnect()` (`src/session.ts` class doc: "only safe on
the engine's own network thread"; `cpp/session_wrap.cpp` registers `logon`,
`logout`, `refresh` and the two seqnum setters as the session's only mutators).
`session.setNextSenderMsgSeqNum()` / `setNextTargetMsgSeqNum()` reach the adapter
as `setSeqNums`, not `reset` (`[js_message_store.cpp]` `setNextSenderMsgSeqNum()`
/ `setNextTargetMsgSeqNum()` build a `Method::kSetSeqNums` request). The only
worker-thread path into `reset()` is a `sendToTarget()` of a Logon the
application itself stamped with `ResetSeqNumFlag=Y` (`[QF Session.cpp:559-567]`
in `sendRaw()`); every other trigger runs on the network thread.

**F6. `reset()` is FATAL on failure but never throws into QuickFIX**: a rejection,
timeout or late settlement poisons the store and fires `'storeError'`; the
engine goes on. The constructor-time `reset()` is the exception: its rejection
rejects `create()` and the half-built engine is torn down. Sources: `[README]`
"Failure policy" and "`reset()` and `refresh()` never raise into QuickFIX";
`[js_message_store.cpp]` `reset()` (`catch (const FIX::IOException&) {}` and the
`OnJsThread()` branch); `[store.test]` "ResetOnDisconnect=Y + rejecting reset():
the session disconnects, storeError fires, the process survives" and the
"failing" half of the constructor test.

**F7. Per session only** (A7).

---

## G. Durability

**G1. Return/resolve only once the write is durable** to the degree you need
across a process crash: a committed transaction (autocommit counts), a flushed
file. No write-behind queue, no "ack now, flush later", no in-process map
standing in for the database. The engine advances its cached sequence number
after your ack (C5) and puts the message on the wire after it (D4): an
acknowledged write that is lost means the restarted engine reuses sequence
numbers the peer has already seen. Sources: `[README]` "The store is
write-through"; `[js_message_store.h]` file comment; upstream `FileStore::set()`
`fflush`es both files before returning (`[QF FileStore.cpp:269-275]`).

**G2. You need no read cache.** The engine already caches the three state values
and reads them from its cache; your `load()` is only called at preload, on
`refresh()`, and on recovery (B3). A cache in the adapter that can disagree
with the database (e.g. updated before a failed write) breaks C5. Source:
`[js_message_store.h]` ("The sequence numbers and the creation time are cached
(a MemoryStore, like upstream's PostgreSQLStore)").

**G3. One engine per session row.** Nothing locks the row; upstream treats
duplicate rows as a configuration error (B6). Two engines (two processes, two
nodes) owning the same session id through the same tables corrupt each other.
(Derived from B6 and G2.)

**G4. Synchronous methods are allowed**, and are the simplest correct choice for
embedded stores (`node:sqlite`, `better-sqlite3`, an in-memory test double): a
sync return settles within the event-loop turn that served the call. Sources:
`[store.ts]` `Awaitable<T>` ("every adapter method may be sync or async");
`[README]` "Every method may return a value or a Promise"; `[store.test]` "sync
Map adapter on both sides: reset() on logon, seqnums and messages persist,
close() on stop".

---

## H. Concurrency and threads

**H1. Calls for ONE session never overlap**: QuickFIX holds SS across every store
call, on whichever thread touched the session. Calls for DIFFERENT sessions (and
different engines) may run concurrently, so use a pool if you need throughput,
but do not rely on any cross-session ordering. Sources: `[js_message_store.h]`
("every call runs under SessionState::m_mutex"); `[ARCH]` §5 lock order
(`SS` "held across every message-store call"); `[store.test]` "async (sleeping)
adapter both sides: 20 messages in order, acceptor store calls never overlap"
(`accStore.maxInflight == 1`).

**H2. The one overlap: a late settlement.** A call that timed out may still be
executing when the next call for the same session arrives. For `setMessage`
that is an upsert race the newer write wins (D5); for `setSeqNums`/`reset` the
engine stays poisoned until the late write has settled, then reloads (I4).
Source: `[store.test]` "setSeqNums timeout then late resolve: poison,
disconnect, reload after settlement, reconnect reconciles with PossDupFlag=Y".

**H3. Your methods run on the JS event loop**; the engine thread that called is
parked (not the loop) until your value or Promise settles, bounded by
`storeTimeoutMs`. Blocking the loop (heavy sync work) stalls the engine too, and
every other engine thread waiting on the loop. Sources: `[README]` "Threads and
latency"; `[ARCH]` §4b "Dispatch rule".

**H4. The hot path must not need a libuv threadpool slot** (`fs.promises`,
`dns.lookup`, `zlib`, async `crypto.*`, or a native addon that queues work on
the pool), or `UV_THREADPOOL_SIZE` must be raised: with every pool slot parked
in a store write, an adapter that needs a slot to finish that write deadlocks
through the pool. Socket drivers (`pg`, `mysql2`) do not use the pool. Sources:
`[README]` "An adapter must not depend on the libuv threadpool on its hot
path"; `[ARCH]` §5 ("an adapter's hot path → never POOL"). Derived corollary:
a connection (re)established INSIDE a store call resolves its host through
`dns.lookup` (pool); warm the pool before `Initiator.create()`, keep a minimum
pool size, or connect by IP.

**H5. Never await an engine operation on the same session from inside a store
method** (`session.logout()`, `session.setNext*()`, `sendToTarget(msg,
thatSession)`, `engine.stop()`): it waits on the mutex the thread parked in
your method holds; only the timeout breaks the cycle, and it poisons the store.
Sources: `[README]`; `[store.test]` "self-deadlock: a store method awaiting an
operation on its own session fails with IOException within the timeout".

**H6. Bound in-flight `sendToTarget()` calls at the application level**: each
one may be parked in a store write on a pool thread, and session control calls
queue behind them. Source: `[README]` "Bound your sends"; `[store.test]`
"stress: bounded sends through a slow adapter ...".

---

## I. Errors, timeouts and poison

**I1. Fail by throwing (sync) or rejecting (async)**; both are normalised. The
rejection reason's `.message` becomes the `'storeError'` message. Sources:
`[store.ts]` `settle()`, `ioError()`; `[js_message_store.cpp]` `ErrorMessage()`.

**I2. Never hang.** A call that has not settled after `storeTimeoutMs` (default
`30000`; `0` disables) is failed with `"timed out after N ms"`. For
`setSeqNums`/`reset` a timed-out call is an UNSETTLED write: the store cannot
be reloaded, hence cannot recover, until that Promise settles. Sources:
`[js_message_store.cpp]` `Call()` (`kTimedOut`), `Gate()` (`unsettled_ > 0` →
"a timed-out write has not settled yet"); `[store.test]` "setSeqNums timeout
then late resolve ..." (`'no reload before the late write settled'`).
Recommendation (derived): give your driver statement/connect/acquire timeouts
SHORTER than `storeTimeoutMs`, so you reject instead of timing out: a rejection
is settled, and the poison can lift on the very next call.

**I3. Severity by method**

| Method | Failure (throw / reject / malformed / timeout) | Settlement after the timeout |
| --- | --- | --- |
| `load` (preload, in `create()`) | `Initiator.create()` / `Acceptor.create()` rejects; no engine | n/a (awaited) |
| `create` (preload) | same | n/a |
| `load` (refresh / reload) | store poisoned (or stays poisoned), `'storeError'` | discarded |
| `setSeqNums` | **poison** | **poison**, reported as "late" |
| `setMessage` | not fatal: send resolves `false`, `'storeError'` | discarded (lands as an upsert) |
| `getMessages` | not fatal: engine disconnects, peer re-requests | discarded |
| `reset` | **poison**; never thrown into QuickFIX; constructor-time: `create()` rejects | **poison**, "late" |
| `close` | `'storeError'` only; `stop()` still resolves | n/a |

Sources: `[README]` "Failure policy" and "`stop()`"; `[js_message_store.cpp]`
`Forward()` (`fatal` flag), `OnSettled()` (late handling for
`kSetSeqNums`/`kReset` only), `refresh()`; `[store.ts]` `preload()`,
`closeAll()`; `[store.test]` the "failure policy" describe block.

**I4. What poison means for your users.** While poisoned, every write and every
read of the outbound sequence number fails with `IOException`; every inbound
message ends in a sequence-number write that fails, so the engine disconnects
the session at its next inbound message (a heartbeat at the latest);
`'storeError'` fires with `poisoned: true`; `session.getExpected*()` throw.
Poison lifts in two steps: once every timed-out write has settled, the next
store call of any kind first reloads the state through `load()` (one reload in
flight at a time), then proceeds; QuickFIX reconciles with the peer at the next
logon (resend request, or redelivery with `PossDupFlag=Y`). Sources: `[README]`
"Failure policy"; `[js_message_store.cpp]` `Gate()`; `[store.test]`
"ResetOnDisconnect=Y + rejecting reset() ..." and "poisoned store with a dead
adapter: calls fail immediately, one reload attempt per timeout". For the
adapter this means: during an outage, reject fast; on recovery, make `load()`
work first.

**I5. Do not retry for long inside a call.** Internal retries consume
`storeTimeoutMs` while an engine thread is parked, and with one network thread
per engine that freezes heartbeats of EVERY session of that engine. Fail fast
and let the engine's policy (I3) do its work. Source: `[README]` "Timeout"
("a longer timeout freezes heartbeats of *every* session of the engine ... when
the adapter stalls"). (Derived recommendation.)

**I6. Never swallow a failed write.** Returning normally after a write that did
not land is the one unrecoverable error: the engine's cache advances (C5) and
the peer sees sequence numbers your store does not hold.

**I7. Teardown.** `stop(true)` fails every pending store call at once;
a graceful `stop()` lets in-flight writes complete (bounded by the timeout).
Once the engine is deactivated the bridge refuses to START new adapter calls,
but a Promise you already returned may still settle afterwards: make `close()`
and your pool shutdown tolerant of a statement that is still in flight.
Sources: `[README]` "`stop()`"; `[ARCH]` §4b "Teardown"; `[store.test]` "a
never-settling store call: stop(true) returns at once and the parked send
settles".

**I8. The `'storeError'` event** is `(sessionID, method, error, poisoned)` with
`error.name === 'QuickFixError'`, `error.fixErrorName === 'IOException'`,
`error.message === 'message store <method>: <your message>'` (suffixed
`(late)` for a late settlement). Observe-only; applications alert on
`poisoned: true`. Sources: `[store.ts]` `ioError()`, `StoreBinding.bridge.storeError`;
`src/engine.ts` `EngineEvents.storeError`.

---

## J. `close()`

**J1. Optional.** When present it is called once PER SESSION after `stop()` has
destroyed the engine's sessions, before the `stop()` Promise settles; no store
call for that session follows. Sources: `[store.ts]` JSDoc of `close` and
`closeAll()`; `[store.test]` "await stop(); await create({ store: same }) sees
close() before load()" and "create() preloads ..." (`calls.at(-1) == 'close'`).

**J2. Not called for an engine dropped without `stop()`** (torn down at process
exit). Do not rely on it for durability; every write is already durable (G1).
Source: `[store.ts]` JSDoc; `[README]` "`stop()`".

**J3. It is per session, and one adapter object may serve several engines.** Do
not close a shared pool from `close()` unless you reference-count; let the
application own the pool's lifetime. (Derived from J1.)

**J4. A `close()` failure is reported** as `'storeError'` (`method: 'close'`,
`poisoned: false`) and never blocks `stop()`. Source: `[store.ts]` `closeAll()`.

---

## K. Return-value validation (what a malformed value does)

**K1. `load`**: `null`/`undefined`, or an object with `creationTime` a valid
`Date` (a finite number of ms is also accepted natively), `nextSenderMsgSeqNum`
and `nextTargetMsgSeqNum` positive safe integers. Anything else: `TypeError`
from `create()` at preload; `IOException` + store stays poisoned at reload.
Sources: `[store.ts]` `validState()`; `[js_message_store.cpp]`
`ParseResult(kLoad)`, `FromDate()`, `ReadSeq()`; `[store.test]` "create() rejects
on a load()/create() failure with no native object behind it" (the
malformed-`load()` step at its end).

**K2. `getMessages`**: an `Array` whose every entry is a `string`. A `Buffer`, a
`null` entry, or a non-array result fails the call (`IOException`,
disconnect). Source: `[js_message_store.cpp]` `ParseResult(kGetMessages)`.

**K3. `create`, `setSeqNums`, `setMessage`, `reset`, `close`**: the resolved value
is ignored; a returned Promise is awaited. Source: `[js_message_store.cpp]`
`ParseResult()` `default:` branch; `[store.ts]` bridge.

**K4. Numbers cross as JS `number`s** (doubles holding safe integers). When your
backend returns `string` or `bigint` (PostgreSQL `NUMERIC` through `pg`, MySQL
`BIGINT UNSIGNED` with `supportBigNumbers`), convert with `Number()` and
validate before returning. Source: the removed SQL adapter's `toSeq()`
(`sql-adapter-reference.md`).
