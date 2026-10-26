# The MessageStoreAdapter contract, as rules

Every rule below is sourced. `REPO` is the binding's public repository,
https://github.com/homaiohq/napi-quickfix; "same revision" means the revision
that carries this skill (unreleased after 0.3.1, CHANGELOG `[Unreleased]`,
PR #32): open repository-only files at the tag of the version you installed
(`REPO/blob/v<version>/<path>`), or on `main` / branch
`feat/message-store-adapter` until the store is released. The sources, and the
versions they were read at:

| Tag | Meaning |
| --- | --- |
| `[store.ts]` | `src/store.ts` of `@homaiohq/napi-quickfix`, same revision (the TS interface, its JSDoc, `MapMessageStore`, `StoreBinding.preload()`/`closeAll()`, `validState()`). Repository only; the installed package has it compiled as `dist/esm/store.js` + `store.d.ts` |
| `[js_message_store.h]` / `[js_message_store.cpp]` | `cpp/js_message_store.{h,cpp}`, same revision (the native `FIX::MessageStore` over the adapter: dispatch, cache, timeout, poison, `ParseResult`). Shipped in the package (`cpp/`) |
| `[README]` | `README.md` section "Message store", same revision. Shipped in the package |
| `[README@f802818]` | `README.md` section "Generic SQL adapter" at commit `f802818` (`REPO/blob/f802818ad6d0fc92be3ab61bb81b1b99521d4a49/README.md`, PR #31); in no release yet, it ships with the SQL adapter (PR #33) |
| `[ARCH]` | `ARCHITECTURE.md` §4b "The message-store bridge" and §5 "Lock order", same revision. Repository only |
| `[store.test]` | `test/store.test.ts`, same revision; cited by test title. Repository only |
| `[store-sql.test]` | the SQL adapter test at commit `f802818` (`REPO/blob/f802818ad6d0fc92be3ab61bb81b1b99521d4a49/test/store-sql.test.ts`, PR #31; `contract()` identical at `6b8caa0`, the commit that introduced the SQL adapter, and in PR #33): `contract()`, reproduced as section 1 of `test-checklist.md`, and `loopback()`. In no release yet |
| `[QF <file>:<line>]` | QuickFIX C++ **v1.16.0** (the tag pinned by `CMakeLists.txt` `GIT_TAG v1.16.0`, commit `2ce8a60667d95a55cdc57a210f165e19cb757126`), path under `src/C++/`: https://github.com/quickfix/quickfix/tree/v1.16.0/src/C++ |
| `[probe]` | a loopback probe run on 2026-10-23 through the binding at `4dc1231` (PR #32, an ancestor of this revision; later commits changed the poison, reset-retry and reload paths, none of which the probes exercise: the seqnum writes of a healthy store, `setMessage` ordering, `getMessages` parsing): a real `Acceptor` + `Initiator` over 127.0.0.1, the initiator on a test-double adapter. Each probe is reproduced as a scenario in `test-checklist.md` (the rule names it), so you can rerun it against your adapter |
| `[trial]` | issue #35 (`REPO/issues/35`): a PostgreSQL adapter written from this skill alone (`pg` 8.23.1, PostgreSQL 16.15, Node 22) and run against a live counterparty's FIX UAT and through local fault injection (frozen, stopped and restarted server, `pg_terminate_backend`, a TCP proxy holding one connection's bytes, `kill -9`) |
| `[trial2]` | issue #36 (`REPO/issues/36`): the same exercise through an ORM, Prisma 7 (`prisma`/`@prisma/client`/`@prisma/adapter-pg` 7.10.1 over `pg` 8.23.1, PostgreSQL 16, Node 22, the binding at `9225e7a`), against the same counterparty's UAT, through a loopback fault campaign that checks every commit against the adapter call that issued it, and through an independent review. A pooler was simulated by a loopback proxy rewriting `BackendKeyData` as PgBouncer does, not run against a real PgBouncer |

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
`src/session-id.ts` exposes exactly those four getters; `[QF SessionID.h:103-109]`
has exactly those four identity fields (plus an `isFIXT` flag and the frozen
string); the upstream tables' primary key is
`(beginstring, sendercompid, targetcompid, session_qualifier)` (see
`upstream-schemas.md`). The fields compare EXACTLY: QuickFIX orders and
equates session ids by their string form (`[QF SessionID.h:113-119]`), so
`ACME` and `acme` are two sessions. A backend whose key comparison folds case
or accents (MySQL's and SQL Server's default collations) merges them; see
`upstream-schemas.md` gotcha 13 for the fix.

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
replace SOH with `|`, never trim, never re-serialise, never parse (A8 says what
a changed byte costs). Inbound messages never reach the store: one that
arrives ahead of the expected number is queued in memory
(`SessionState::queue()`, `[QF Session.cpp:1130]`) and is lost on a restart,
when the peer is simply asked to resend it.

**A6. Message strings may contain single quotes, double quotes, backslashes and
any UTF-8**, and cross the bridge as JS strings. Sources: `[QF
test/MessageStoreTestCase.h]` `CHECK_MESSAGE_STORE_SET_GET_WITH_QUOTE`;
`[store-sql.test]` `contract()` writes
`` `8=FIX.4.2\x019=20\x0135=8\x0134=2\x0158='"Some \\ Text"'\x0110=000\x01` ``
and reads it back equal; `[store.test]` "ResetOnLogon=N: a restart continues
seqnums from the adapter; a gap is served from getMessages (quotes intact)";
`[js_message_store.cpp]` `Invoke()` passes `Napi::String::New(env, req.msg)`.
Use parameter binding or a binary-safe encoding; never interpolate. The
storage must hold every byte of the UTF-8 encoding and the full length: a
single-byte code-page column (SQL Server `TEXT`) or a size-capped one (MySQL
`BLOB`, 65,535 bytes) does not, unless you encode around it
(`upstream-schemas.md` section 7). Reject rather than store a damaged message
(I6).

**A7. Sessions are independent.** A write, read or reset for one session never
touches another session's rows; two sessions differing only by qualifier are
distinct. Source: `[store-sql.test]` `contract()` ("Another session's rows are
independent (the key includes the qualifier)", "reset is per session").

**A8. One changed byte in one stored message breaks the resend of the whole
range, and the session stays stuck.** On a ResendRequest the engine re-parses
every returned string with BodyLength and CheckSum validation
(`m_validateLengthAndChecksum`, on by default; `[QF Session.cpp:436,452]`) and
nothing inside the loop catches the `InvalidMessage`, so the first damaged
entry aborts `generateRetransmits()`: the messages after it and the closing
gap-fill are never sent (`[QF Session.cpp:402-506]`). The exception is caught
higher up and only logged (`[QF Session.cpp:1289-1290]`), before the
ResendRequest's own sequence number was consumed (`[QF Session.cpp:397-399]`),
so the peer asks again and hits the same row on every attempt. `[probe]`
(`test-checklist.md` 2.9): three orders stored, the middle one changed by one
byte (`11=o2` → `11=oX`, same length); a resend from the first delivered only
the first, and the acceptor stayed at "expecting 3". This is what a lossy
encoding does to a non-ASCII character (SQL Server `TEXT`, a Latin-1 column, a
`Buffer` decoded with the wrong charset) and what CRLF translation, trimming or
re-serialising do. It is why A5/A6 say byte-exact, and why I6 prefers a
rejected write to a damaged one.

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
the factory and no engine is built. The factory rejects with YOUR error as is
(a plain `Error` with `code: 'ECONNREFUSED'`, say), not a `QuickFixError`;
only a timeout is a `QuickFixError` (`IOException`, "timed out after N ms"),
and a malformed state a `TypeError` (B4). Sources: `[store.test]` "create()
rejects on a load()/create() failure with no native object behind it";
`[store.ts]` `preload()`, `settle()`, `withTimeout()`; `[trial]`.

**B3. When `load()` is called**: (a) by `Initiator.create()` / `Acceptor.create()`
for every session the engine will own, before the engine exists, once per
session; (b) by `refresh()` (`RefreshOnLogon=Y`, `session.refresh()`); (c) as
the reload that lifts a poisoned store (see I4). Sources: `[store.ts]` JSDoc of
`load`; `[store.test]` "create() preloads exactly the sessions the engine owns:
load(), then create() for a missing row" (`calls == ['load', 'create']`);
`[js_message_store.cpp]` `refresh()` and `Gate()` both issue `Method::kLoad`
(through `Reload()`).
Consequence: `load()` is on the recovery path; keep it a single indexed read.
At (b) and (c), `null` means the row is gone: as upstream's `refresh()` does
(`m_cache.reset(now)`, then `populateCache()` INSERTs a `1/1` row,
`[QF PostgreSQLStore.cpp:107-127]`), the engine restarts the numbering: it calls
`create(sessionID, { now, 1, 1 })` and the cache takes that state once it
resolved; a failing `create()` poisons the store. So `null` must mean "no row",
never "could not read" (reject for that). Sources: `[js_message_store.cpp]`
`Reload()`; `[store.test]` "refresh() / a reload after the row was deleted
...".

What a `null` at (b) or (c) costs is worth knowing before you allow it.
`[trial]`, the `sessions` row deleted under a live session against a real
counterparty: the engine restarted at `1/1`, the peer answered "MsgSeqNum too
low, expecting 60 but received 1" and the session looped on Logout; meanwhile
51 sends that resolved `true` (logged out, so stored for the resend that
follows the next logon, D8) were stored under the reused numbers 1..59, which
the peer never asks for: silently lost. Recovery came only because those sends
pushed the number past 60. A `TRUNCATE`, or a restore from an older backup,
does the same. So:

- treat a reload that finds no row as an alarm (it is visible as the
  `create()` call that follows a `load()` after startup);
- optionally, make the adapter refuse to renumber: remember, per adapter
  instance, the sessions whose row it has read or written, and REJECT a later
  `load()` of such a session that finds no row ("row vanished"). The store
  stays poisoned and the session goes down instead of renumbering, until an
  operator restores the row or deliberately recreates it. The first `load()`
  of a session in the instance (the preload) must still return `null` for a
  never-seen session (B1, test 1.1 is unchanged); what then differs from
  `MapMessageStore`, by design, is the reload after a deleted row (the
  repository's `[store.test]` "refresh() / a reload after the row was
  deleted ..." expects the `1/1` restart).
- that memory dies with the process: after a RESTART the next `load()` is a
  first load again, returns `null`, and the engine `create()`s a `1/1` row.
  `[trial2]`: an adapter that refused the reload correctly then renumbered
  after a restart; 56-57 messages were stored under reused numbers, 174
  sends resolved `true`, about 50 were never delivered, and the peer
  answered "too low" (3/3). Close that gap from the data: a first `load()`
  that finds no session row but finds messages for the session (`SELECT 1
  FROM messages WHERE <key> LIMIT 1`, in the same statement or right after)
  rejects too, so `Initiator.create()` rejects until an operator restores
  the row (below). A never-seen session has no messages, and `reset()` keeps the
  row while it deletes them, so this only fires after a deletion (3/3 in
  the `[trial2]`). A `TRUNCATE` of both tables, or a restore of both from
  an old backup, still cannot be detected;
- rate-limit the alarm and the log line: the engine retries the reload on
  every store call of the poisoned session, unpaced (I5; `[trial2]`: about
  83 per second per session);
- operator recovery: INSERT the row by hand, `outgoing_seqnum` = the number
  the counterparty says it expects ("MsgSeqNum too low, expecting N"),
  `incoming_seqnum` = the next number you expect from it (its last
  `MsgSeqNum` in your logs + 1), `creation_time` = now in UTC, whole
  seconds (inside the current session window, F4). The session logs back on
  at its next attempt (0.6-6.2 s in the `[trial2]`).
  (Derived; `[trial]`, `[trial2]`.)

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
after `load()` returned `null` for that session (at preload, or at a reload,
B3), with
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

**C6. No monotonic guard: the numbers can go DOWN, and the last write wins.**
The engine owns the numbers; the adapter records them. `reset()` brings both
back to 1, and `session.setNextSenderMsgSeqNum()` /
`setNextTargetMsgSeqNum()` set any value, lower included (`[QF
Session.h:79-80]`, forwarded as `setSeqNums`). An inbound `SequenceReset` only
ever raises the target number (`[QF Session.cpp:356-359]`), which is where the
"it only increases" intuition comes from. So never write
`SET n = GREATEST(n, $1)`, a `WHERE outgoing_seqnum < $1` condition, an
optimistic "only if newer" check, or a reject on a decrease: each one silently
keeps the old number, and the engine's cache (C5) and the store disagree.
`[probe]` (`test-checklist.md` 1.15): two orders, then
`setNextSenderMsgSeqNum(2)`: the adapter saw `[3,2]`, `[4,2]`, then `[2,2]`.
Upstream writes the value unconditionally (`UPDATE sessions SET
outgoing_seqnum=<value>`, `[QF PostgreSQLStore.cpp:238-252]`; `FileStore`
rewrites its seqnums file in place, `[QF FileStore.cpp:335-344]`).

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
timeout: not fatal; the late settlement is reported, not poisoning" ("the
upsert replaced the late row"). The same number also comes back (derived from the same code):
after a crash between `setMessage(n)` and `setSeqNums(n+1)` (two separate
calls, `[QF Session.cpp:661-667]`), the restarted engine still has `n` as its
next number and writes it again; after `session.setNextSenderMsgSeqNum()`
lowered the number (C6), every number from there up is rewritten. Upstream's
own stores all overwrite: SQL `INSERT` with an `UPDATE` fallback (above), and
`FileStore` appends and lets the LAST index entry for a number win
(`[QF FileStore.cpp:183-189,260-264]`).

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
timed-out call may still land in your backend; until its Promise settles, the
engine refuses the next write of the same seqnum (that send resolves `false`
too, with a non-poisoning `'storeError'`), so the late write cannot land after
the retry's (D7). The settlement is reported as late, not poisoned. Sources:
`[README]` "Failure policy"; `[js_message_store.cpp]` `set()` →
`CheckUnsettledSet()`, `Forward(r, /*fatal=*/false)` counts a timed-out
`setMessage` per seqnum, `SettledLate()` balances it; `[store.test]`
"setMessage timeout: not fatal; the late settlement is reported, not
poisoning", "a timed-out setMessage(N) holds back set(N) until it settled: a
resend of N delivers what went out as N".

**D6. With `PersistMessages=N` the engine never calls `setMessage()`** and answers
resend requests with `SequenceReset-GapFill` (`[QF Session.cpp:384-391]`).
Implement it anyway; it is the default.

**D7. A write the engine already gave up on must be over when its Promise
settles; keeping one session's writes in call order is still good practice.**
The engine serialises its calls per session (H1), but a timed-out call can
still be running when the next one starts. On a connection POOL the two run
on different connections and the older one can commit last. For `setMessage`
that would leave the row for `n` holding the wrong message: a resend of `n`
(say the connection dropped right after B was written, and the peer asks for
`n` on reconnect) would deliver A, a message your application saw fail, with
`PossDupFlag=Y`, and B would never be redelivered. The engine prevents it: it
counts a timed-out `setMessage(n)` until its Promise settles and refuses
`set(n)` meanwhile (the retry's send resolves `false` with a non-poisoning
`'storeError'`), so B is written only after A has settled and overwrites it
(D5; `[store.test]` "a timed-out setMessage(N) holds back set(N) ..."). That
protection is only as good as your settlement: a Promise that rejects while
the statement is still alive on the server (a client-side timeout) lets B go
ahead and A commit after it (I2). (Not to be confused with the
documented case where a send that resolved `false` is still delivered later:
a `setSeqNums` that landed after its timeout, `[store.test]` "setSeqNums
timeout then late resolve ...". There the number belongs to that one message
and the store stays consistent with the wire; here two messages share a
number and the store keeps the wrong one.) `[probe]` (`test-checklist.md` 3.6):
`setMessage(2, A)` parked past `storeTimeoutMs: 300` → `send(A)` resolved
`false`; `send(B)` succeeded and B went out as 2; A's write then landed; a
resend from 2 delivered **A** (`PossDupFlag=Y`) to the acceptor's `fromApp`.
That probe predates the engine's refusal of `set(n)`, which now makes it pass
with any adapter that settles honestly. Upsert semantics alone did not prevent
it; ordering did (revisions up to `4dc1231` called a late `setMessage` "simply a
late upsert"). Ordering also covers what the refusal does not: a late write
landing after a later `reset()` or `close()` of the session (below), or after
a new engine took over through the same adapter instance. Any one of these
keeps the order:

- a per-session FIFO in the adapter: each call for a session starts after the
  previous call for that session has settled (a Promise chain keyed by
  `sessionID.toString()`; the SKILL.md "Wiring" section has the 15-line
  wrapper). `[probe]`: with the wrapper, `send(B)` while A was parked also
  failed (it queued behind A and timed out), A then B landed in order, the
  next send `C` succeeded and the row held C: the row always ends as the newest
  write, and a message whose send reported `false` is either overwritten or
  sits at a number `>= nextSender`, which the engine does not serve (E6)
  unless the application jumps the sender number over it (D8);
- one dedicated connection (or one single-connection client such as one
  `ioredis` instance, which runs commands in order) per session.

A version column cannot replace either: `setMessage` receives no generation
to compare. Ordering is also all you need: do not add a fencing token, a
writer id, a wall-clock or counter condition on top of the FIFO. They guard
against two engines owning one session, which G3 already rules out
operationally. (A stopped engine's write still in flight is ordered before the
next engine of the session by the binding itself, within one process, even
across adapter instances: the next `create()` waits for it, I7. A write left
in flight by a process that died is not; no adapter-side rule here closes
that.) Each adds failure modes of its own: a clock behind the
previous writer's refuses every legitimate write (poison), a conditional
`load()` becomes a write. (Observed in this skill's own evaluation runs, where
fences were added unasked; derived.) The FIFO only orders what your Promises
report, so a Promise must settle only once nothing more can land: a server
error is final, but a client-side timeout or a dropped connection after the
statement was sent leaves it alive on the server, and it commits after the
FIFO has moved on (`[trial]`: the probe below happened for real, I2). I2 has
the rule and the per-server recipe (end the backend and confirm before
rejecting; stay pending while the server is unreachable). Where the backend
offers no way to end a request (HTTP APIs such as DynamoDB, which may still
apply a request the client aborted), the outcome of an aborted call is unknown
and the window stays open: set the abort well above the backend's normal
latency so it stays rare, and document the residual window instead of
claiming late writes are impossible. The same reasoning covers a
late `setMessage` landing after a `reset()` of that session (it would leave a
stale old-epoch row): the FIFO runs it before the reset's DELETE, and a
`setSeqNums` whose Promise rejected while its statement kept running (I2).
(Derived from `[js_message_store.cpp]` `OnSettled()` and the probe.)

**D8. Store every message you are given, exactly under the number you are
given, and filter nothing.** The engine trusts the `MsgSeqNum` (tag 34) INSIDE
each stored string, not your key: `generateRetransmits()` reads it from the
parsed message (`[QF Session.cpp:463]`) to decide what to gap-fill. So never
re-key, renumber, compact or shift messages. Admin messages (Logon,
Heartbeat, Logout, ResendRequest, TestRequest, ...) are stored too
(`persist()` runs for both branches of `sendRaw()`, `[QF
Session.cpp:572-574,590-592]`); the engine itself gap-fills them on a resend
(`[QF Session.cpp:470-473]`), so do not drop them to save space. A stored
message has not necessarily been sent: an application message sent while the
session is logged out is persisted and NOT written to the socket
(`[QF Session.cpp:590-596]`; unless the next logon will reset the numbers,
in which case the send is refused outright, `[QF Session.cpp:581-584]`); it
reaches the peer through the resend that follows the next logon. Rows with
numbers `>= nextSenderMsgSeqNum` are normal (a lowered sender number, C6; a
crash between the two writes, D2; a failed send, D7): do not reject them, delete them from `setSeqNums`, or treat them
as corruption. The engine never asks for them (E6) and overwrites each one
when it reaches that number; upstream keeps them the same way. (The one way
such a row gets served is the application jumping the sender number forward
over it with `session.setNextSenderMsgSeqNum()`; that is the application's
call, upstream behaves identically.)

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
keys), use a numeric type or zero-pad to a fixed width. The order is
load-bearing, not cosmetic: `generateRetransmits()` walks the list keeping a
`current` cursor and gap-fills from `current` to each entry's own MsgSeqNum
whenever they differ (`[QF Session.cpp:466-489]`), so an entry that comes
"back in time" makes the engine gap-fill over messages it has not sent yet.
`[probe]` (`test-checklist.md` 2.8): `getMessages(2, 5)` returning `[5, 4, 3,
2]` made the engine send `SequenceReset-GapFill 2→5` first: the three orders
2..4 were never redelivered, silently.

**E3. Missing sequence numbers are OMITTED, never padded** with `null`, `''` or a
placeholder: the engine parses each returned string and gap-fills what is not
there. Sources: `[store.ts]` JSDoc ("missing seqnums omitted (never padded)");
`[QF Session.cpp:402-...]` `generateRetransmits()`; `[js_message_store.cpp]`
`ParseResult(kGetMessages)` rejects any non-string entry
(`"getMessages() entries must be strings"`), which fails the call.

**E4. Return `[]` when nothing matches**, including when `begin > end`; never
`null`/`undefined`. Do not throw on an odd range either: `begin` comes from
the peer's ResendRequest unvalidated, so `0` is possible: answer it as
`[1, end]`, as the SQL stores' range predicate does (`msgseqnum >= 0 AND
msgseqnum <= end`). Upstream `FileStore::get()` does NOT: its loop
`for (i = begin; i <= end && i != 0; ++i)` (`[QF FileStore.cpp:281]`, the
`i != 0` guards the wrap-around at `UINT64_MAX`) returns nothing at all for
`begin = 0`. Sources: `[QF test/MessageStoreTestCase.h]`
`CHECK_MESSAGE_STORE_SET_GET` (`get(4, 6)` → `0` messages; `get(2, 6)` with
1..3 stored → 2 messages); `[store-sql.test]` `contract()`
(`getMessages(4, 6) == []`, `getMessages(2, 6) == [quotes, 'm3']`);
`[js_message_store.cpp]` `ParseResult(kGetMessages)` (`!IsArray()` → error).

**E5. Do NOT copy upstream `MemoryStore::get()`.** It starts at
`m_messages.find(begin)` (`[QF MessageStore.cpp:40]`), so when `begin` itself
is absent it returns nothing at all even if later numbers exist. The SQL stores
(range predicate) and `MapMessageStore` `[store.ts]` are the behaviour to
reproduce; `FileStore::get()` (iterates `begin..end` and pushes what exists,
`[QF FileStore.cpp:278-286]`) too, except for `begin = 0` (E4).

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

**E10. Exactly one entry per sequence number: the last one written.** A
backend that keeps history (an append-only log, an event stream, a table
without a unique key on `(session, seqNum)`, versioned items) must collapse to
the latest write per number before returning, as upstream's `FileStore` does:
it appends every write and keeps only the last index entry per number
(`[QF FileStore.cpp:183-189,260-264]`). Every entry is processed (E2): a
duplicate is resent twice or produces a `SequenceReset` whose `NewSeqNo` is
lower than its own `MsgSeqNum`. `[probe]` (`test-checklist.md` 2.8):
`getMessages(2, 5)` returning each message twice produced
`SequenceReset-GapFill` messages `3→2`, `4→3` and `6→5`, which QuickFIX
tolerated but a stricter counterparty may reject or log out on. Returning an
OLDER write instead of the latest is the D7 failure.

---

## F. `reset()`

**F1. `reset(sessionID, state)` deletes every message of the session and
persists `state`**, which the engine fills with the new `creationTime` and
`nextSenderMsgSeqNum = nextTargetMsgSeqNum = 1`. Sources: `[store.ts]` JSDoc;
`[js_message_store.cpp]` `reset()` builds `r.state = { now, 1, 1 }`; upstream
`reset()` is `DELETE FROM messages WHERE <key>` then `UPDATE sessions SET
creation_time=..., incoming_seqnum=1, outgoing_seqnum=1 WHERE <key>`
(`[QF PostgreSQLStore.cpp:282-318]`). "Every message" means every number,
with no range predicate: including rows at or above the old
`nextSenderMsgSeqNum` (D8); upstream's `DELETE` has only the key in its
`WHERE`, and `FileStore::reset()` unlinks all four files
(`[QF FileStore.cpp:121-126,314-323]`). A range-limited delete
(`msgseqnum < nextSender`) leaves old-numbering rows behind; the first time
the sender number passes one of them without rewriting it (a
`session.setNextSenderMsgSeqNum()` jump), a resend serves a message from
before the reset.

**F2. Atomic where the backend allows (one transaction).** Where it does not,
keep upstream's order: delete the messages FIRST, then write the state.
Rationale (derived): if the second step fails the call rejects, the store is
poisoned and reloaded; the reloaded state still has the old numbers while the
messages are gone, which the engine handles by gap-filling a resend. The reverse
order would leave stale messages under low sequence numbers that a resend
request after the reset could replay as `PossDupFlag=Y` application messages.
Sources: `[store.ts]` JSDoc ("in one transaction where the backend allows");
`[README@f802818]` "Generic SQL adapter" (`reset()` runs its two statements in a
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
With `ResetOnLogon=Y` an initiator's logon calls `reset()` twice: once in
`generateLogon()` (`[QF Session.cpp:680-682]`), and again in `sendRaw()`
after `toAdmin`, because that Logon carries `ResetSeqNumFlag=Y`
(`[QF Session.cpp:559-567]`; observed in the `[trial]`). Keep `reset()` cheap
and idempotent (I4).
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
engine goes on, with the reset pending: every later store call retries it (I4)
before anything else, and the session sends nothing until it succeeded. The
constructor-time `reset()` is the exception: its rejection
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

What "durable" means, concretely. Upstream's floor is "survives the crash of
the PROCESS": `FileStore` calls `fflush` (into the OS page cache), never
`fsync` (`[QF FileStore.cpp:269-275,341-343,352-354]`), and the SQL stores
return after the server acknowledged an autocommit statement. Surviving a crash
of the HOST or the database server depends on the server's own settings, and
an "autocommit" ack is only as good as them: PostgreSQL `synchronous_commit`
(`off` acknowledges before the WAL flush), MySQL/InnoDB
`innodb_flush_log_at_trx_commit` (`0`/`2` flush about once a second), Redis
`appendfsync` (`everysec`/`no`), MongoDB write concern `j`/`w`. A weaker
setting is a deliberate trade: on a host crash it can lose the last
acknowledged writes, i.e. reuse sequence numbers the peer already saw (the
counterparty then rejects them as too low, and the session needs a manual
sequence reset). Pick it knowingly; never get the same effect by
acknowledging before the write was even sent (write-behind). (Derived; the
server settings are those products' documented knobs, not reproduced here.)
The stronger settings cost liveness as well as latency: with synchronous
replication (`synchronous_commit` `on` or above and a
`synchronous_standby_names`), every commit waits for the standby, no
timeout bounds that wait, and a missing standby stalls every store write
until it is back (I2, `[trial2]`).

**G2. You need no read cache.** The engine already caches the three state values
and reads them from its cache; your `load()` is only called at preload, on
`refresh()`, and on recovery (B3). A cache in the adapter that can disagree
with the database (e.g. updated before a failed write) breaks C5. Source:
`[js_message_store.h]` ("The sequence numbers and the creation time are cached
(a MemoryStore, like upstream's PostgreSQLStore)").

**G3. One engine per session row.** Nothing locks the row; upstream treats
duplicate rows as a configuration error (B6). Two engines (two processes, two
nodes) owning the same session id through the same tables corrupt each other.
(Derived from B6 and G2.) `[trial]`: a standby process started with the same
sessions overwrote 14 stored orders per session with its own Logons, silently.

A per-session lock catches that misconfiguration without fencing every write
(which D7 advises against): take an exclusive lock per session when the
adapter first sees it, refuse the session if another process holds it, and
refuse the session's writes for as long as this process does not hold it.
PostgreSQL, with session-level advisory locks:

- **One dedicated lock connection** (a plain `pg.Client`, not a pool client:
  session-level advisory locks belong to the connection), opened during
  warm-up, before `Initiator.create()`. Opening it lazily inside the first
  `load()` puts a connect and a SCRAM handshake inside a store call: a 1 s
  connect stall failed `Initiator.create()` (`storeTimeoutMs` 800 ms) 9/9
  (`[trial2]`). Give it `keepAlive: true` (`pg` defaults to `false`: a
  black-holed lock connection then raises no `'error'` and no `'end'`, and
  the adapter believes it holds locks it lost), `idle_session_timeout = 0`
  in its `options` (it is idle by construction), and its own `'error'` and
  `'end'` listeners (I9). Connect it directly to PostgreSQL, never through
  a pooler (I2).
- **Take**: `SELECT pg_try_advisory_lock(hashtextextended($1, 0))` at the
  session's first `load()` (the preload); `false` → reject, so
  `Initiator.create()` rejects. The key text is this skill's convention, so
  that two adapters on the same tables (a cutover, a standby) exclude each
  other: `'quickfix-store:' + <schema>.<prefix>sessions + ':' +
  sessionID.toString()`, e.g. `quickfix-store:public.sessions:FIX.4.4:CLIENT->SERVER`.
  An adapter that hashes anything else is invisible to one that follows it.
- **Lose**: any server restart, failover, `pg_terminate_backend` or idle
  timeout ends the lock connection, and its locks with it. Nothing tells the
  engine, and a healthy session never reloads, so a rule of the form
  "re-take it before the next `load()`" never runs for it. `[trial2]`: live,
  the locks went from 2 to 0 after a `pg_terminate_backend` and a second
  adapter instance's `load()` then succeeded for both sessions; in loopback,
  a second process took both locks, logged on and overwrote the stored
  messages from seq 37 on, which the first had already sent (3/3), while
  the first saw no error and went on writing (about 70 rows per session in
  4 s).
- **So, on loss** (the lock connection's `'error'` or `'end'`): mark every
  session it held as unlocked, and from then on REJECT every write method of
  those sessions (`setSeqNums` poisons, which is what you want; `setMessage`
  resolves the send `false`). Re-take from the event loop at once (reconnect,
  `pg_try_advisory_lock` per session), not at the next store call; a
  session whose lock someone else took stays refused, and alarm on it.
- **At every reload** (`load()` after startup), verify the lock through the
  lock connection itself, which also proves that connection answers, and
  reject the `load()` when the query returns no row: `WITH k AS (SELECT
  hashtextextended($1, 0) AS key) SELECT 1 FROM pg_locks, k WHERE locktype
  = 'advisory' AND granted AND pid = pg_backend_pid() AND objsubid = 1 AND
  classid = ((key >> 32) & 4294967295)::oid AND objid = (key &
  4294967295)::oid` (a `bigint` key shows as its high half in `classid`,
  its low half in `objid`, `objsubid = 1`). Count that round trip in the
  call's budget (I2).
- **Release** with `pg_advisory_unlock` in `close()`.

The loopback runs of the `[trial2]` passed with all of the above. It guards
only adapters that follow the same convention: a QuickFIX C++ engine on the
same tables takes no lock (section 8 of `upstream-schemas.md`), and two
engines in the SAME process sharing the adapter are not caught either (the
lock is per connection, and reentrant). Behind a transaction-mode pooler it
guards nothing (I2). (Derived; `[trial]`, `[trial2]`.)

**G4. Synchronous methods are allowed**, and are the simplest correct choice for
embedded stores (`node:sqlite`, `better-sqlite3`, an in-memory test double): a
sync return settles within the event-loop turn that served the call. Sources:
`[store.ts]` `Awaitable<T>` ("every adapter method may be sync or async");
`[README]` "Every method may return a value or a Promise"; `[store.test]` "sync
Map adapter on both sides: reset() on logon, seqnums and messages persist,
close() on stop".

**G5. What the store does NOT give you: exactly-once inbound processing.** For
an inbound application message the engine calls your `fromApp` handler first
(`fromCallback()` at the end of `verify()`, `[QF Session.cpp:1032]`) and only
then advances the target number (`[QF Session.cpp:1246-1249]`), which is the
`setSeqNums` write. A crash between the two means the restarted engine still
expects that number and the peer resends the message: inbound processing is
at-least-once. Do not try to fix that inside the adapter (by writing the
number early, for instance); deduplicate in the application, keyed by the
session, the `MsgSeqNum` and the session's `creationTime` (numbers restart
after every reset). (Derived from the cited lines.)

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
the engine refuses the next write of the same seqnum until the late one has
settled (D7), but other calls go ahead; for `setSeqNums`/`reset` the engine
stays poisoned until the late write has settled, then reloads (I4). A call
whose timeout passed while it still waited for the event loop is never
handed to your adapter at all: only a call your method already received can
overlap. Sources: `[store.test]` "setSeqNums timeout then late resolve: poison,
disconnect, reload after settlement, reconnect reconciles with PossDupFlag=Y",
"a call that times out before the adapter was called is never run".

**H3. Your methods run on the JS event loop**; the engine thread that called is
parked (not the loop) until your value or Promise settles, bounded by
`storeTimeoutMs`. Blocking the loop (heavy sync work) stalls the engine too, and
every other engine thread waiting on the loop. Sources: `[README]` "Threads and
latency"; `[ARCH]` §4b "Dispatch rule".

**H4. The hot path must not need a libuv threadpool slot** (`fs.promises`,
`dns.lookup`, `zlib`, async `crypto.*`, or a native addon that queues work on
the pool), or `UV_THREADPOOL_SIZE` must be raised: with every pool slot parked
in a store write, an adapter that needs a slot to finish that write deadlocks
through the pool. Sources: `[README]` "An adapter must not depend on the libuv
threadpool on its hot path"; `[ARCH]` §5 ("an adapter's hot path → never
POOL").

Socket drivers run their queries without the pool, but **(re)connecting uses
it**: the host name goes through `dns.lookup`, and `pg` (8.x) authenticates
SCRAM-SHA-256, PostgreSQL's default since 14, through WebCrypto
(`subtle.importKey`/`sign`/`deriveBits`/`digest`), which Node runs on the
pool: several pool round trips per connection. Each `sendToTarget()` parked in
a store write holds a pool slot meanwhile. `[trial]`, `docker stop`/`start` of
the server with the adapter reconnecting from the event loop, default
`UV_THREADPOOL_SIZE=4`: 3 sends in flight recovered in 0.4-4 s, 5 in 6 s, **6
never recovered** (3/3 runs, > 60 s: every SCRAM handshake hit
`connectionTimeoutMillis` before it got its slots, and every other pool user of
the process starved with it); with `UV_THREADPOOL_SIZE=8`, 0.4-0.7 s. With
`UV_THREADPOOL_SIZE=1` and the pool's connections terminated, every following
send resolved `false`. So, for any driver that connects through the pool:

- size `UV_THREADPOOL_SIZE` above your maximum in-flight sends plus a margin
  for reconnects (it is a liveness requirement, not a tuning knob; set it in
  the environment before Node starts, or as the first statement of the entry
  module, before anything uses the pool), and bound in-flight sends below it
  (H6);
- an adapter that follows I2 and G3 adds connections of its own to the
  recovery path: the pool's replacements, the connection that ends a backend
  of unknown outcome, the lock connection. `[trial2]`, `docker restart` with
  N sends in flight (recovered runs of 3): with 4 slots, 3 sends 3/3, 5 sends
  1/3, 6 sends 0/3; with 8 slots, 3 to 6 sends 3/3 within 0.74 s, 8 sends
  3/3 but in 5.6-23.7 s. Open the kill and lock connections during warm-up
  and keep them, and count every connection the adapter may open at once in
  the margin;
- warming the pool before `Initiator.create()` is necessary but not
  sufficient: servers drop connections (restart, failover,
  `idle_session_timeout`, PgBouncer), so reconnects happen during operation.
  Keep idle connections open (`pg-pool`: `idleTimeoutMillis: 0`; its default
  10 s closes them, and its `min`, where your version has it, opens nothing by
  itself), warm explicitly, and replenish from the event loop (on a client's
  `'error'`/`'end'`, outside any store call) rather than inside a store call.
  Warm by holding N clients AT ONCE, then releasing them: `pg-pool` hands out
  an idle client before it opens a new one, so checking out and releasing N
  times in a row opens one connection. And avoid `pool.query()` on the store
  path: `pg-pool` destroys the client on EVERY error it reports, a
  `statement_timeout` (57014) included, so the next store call reconnects
  (connect + SCRAM) inside its own budget. Check out explicitly and
  `release()` after a server error (the connection is fine), `release(err)`
  only when the connection itself failed (`[trial2]`; `pg-pool` 3.x).
  `idleTimeoutMillis: 0` keeps the process alive while the pool is open;
  `allowExitOnIdle: true` lets it exit, but then a pending `await
  pool.end()` can be abandoned when the loop empties (I7);
- connect by IP, or resolve once at startup, to keep `dns.lookup` off the
  path.

(`[trial]`; the WebCrypto calls are in `pg`'s `lib/crypto/` at 8.23.1.)

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

**I2. Settle a known outcome promptly; never settle an unknown one.** Your
Promise settles as soon as the outcome is final (nothing sent, or the server
answered), and stays pending while it is not (below); `storeTimeoutMs`, not
your driver, is what bounds a pending call. A call that has not settled after `storeTimeoutMs` (default
`30000`; `0` disables) is failed with `"timed out after N ms"`: on an engine
thread (`Call()`), and in the calls the TS layer awaits itself (`load()`/
`create()` at preload, a constructor-time `reset()`, `close()`;
`[store.ts]` `withTimeout()`). For
`setSeqNums`/`reset` a timed-out call is an UNSETTLED write: the store cannot
be reloaded, hence cannot recover, until that Promise settles. So is a
reload's timed-out `load()`: no other reload starts until it settles. Sources:
`[js_message_store.cpp]` `Call()` (`kTimedOut`), `Gate()` (`unsettled_ > 0` →
"a timed-out call has not settled yet"); `[store.test]` "setSeqNums timeout
then late resolve ..." (`'no reload before the late write settled'`),
"poisoned store with a stalled load(): one reload, then calls fail
immediately until it settles".
**Settle only when the outcome is final.** The engine's protection against
late writes (no reload while a timed-out `setSeqNums`/`reset` is unsettled,
I4) and the per-session FIFO (D7) both trust your Promise: once it has
settled, the engine reloads and moves on, the FIFO starts the next call, and a
statement still alive on the server can then commit AFTER newer writes. Sort
every failure by what the server told you:

| Failure | Outcome | What to do |
| --- | --- | --- |
| Nothing was sent: the checkout, the connect or the authentication failed (`ECONNREFUSED`, a pool acquire timeout, a password error) | nothing can land | reject at once |
| The server answered with an error (`pg`: an `instanceof DatabaseError`, e.g. `57014` from `statement_timeout`, `55P03` from `lock_timeout`, a constraint violation) | final: the statement is dead | reject at once |
| The statement was written to the socket and no answer came: a client-side timeout (`pg` `query_timeout`, `mysql2` `timeout`, an `AbortSignal`), `ECONNRESET`, "Connection terminated" | **unknown**: the statement may still be queued or running, and may commit later | do NOT settle yet: destroy the connection, then make the server end its backend and confirm it is gone (below), and only then reject. While the server cannot be reached, leave the Promise pending |

The middle row is why a server-side limit (`statement_timeout`,
`lock_timeout`) is the right timeout: it ends the statement and tells you so.
A client-side timeout "above the server's, as a backstop" is NOT safe: it
fires exactly when the server is unreachable (frozen, paused, black-holed
network), the moment the statement's bytes may sit in a socket buffer, and the
server executes and commits it after the thaw. `[trial]`: against a frozen
server, two `setMessage` INSERTs that the client had rejected committed 9-12 s
later; with one connection's bytes held by a proxy, a rejected
`setMessage(n, A)` committed after `B` went out as `n`, and a resend of `n`
delivered A with `PossDupFlag=Y` (D7, 3/3); a rejected `setSeqNums` UPDATE
committed late and moved the row from `12/4` back to `5/3`, behind the wire,
and after a `kill -9` and restart the peer answered "MsgSeqNum too low,
expecting 12 but received 8" (3/3). Both repros are scenario 3.7 of
`test-checklist.md`.

How to confirm the backend is gone, per server (PostgreSQL was verified in the
`[trial]` on every fault scenario; the others are the same recipe through
their documented commands, derived):

- **PostgreSQL**: identify each connection's backend by `(pid,
  backend_start)`, read FROM THE SERVER once at connect, the start time as
  integer microseconds: `SELECT pid, (extract(epoch FROM backend_start) *
  1000000)::bigint AS started FROM pg_stat_activity WHERE pid =
  pg_backend_pid()` (`pg` returns the `bigint` as a string; keep it as is).
  Never hold it as a JS `Date`: `backend_start` has microseconds, a `Date`
  milliseconds, and the comparison below then never matches. On an unknown
  outcome, destroy the client (`release(err)` for a pool client), then from
  ANOTHER connection run `SELECT pg_terminate_backend(pid) FROM
  pg_stat_activity WHERE pid = $1 AND (extract(epoch FROM backend_start) *
  1000000)::bigint = $2` and poll `SELECT 1 FROM pg_stat_activity WHERE pid =
  $1 AND (extract(epoch FROM backend_start) * 1000000)::bigint = $2` until it
  returns no row; then reject. `backend_start` guards against pid reuse; add
  NO other predicate. Terminating a backend rolls back its open transaction,
  and an autocommit statement either committed before (the row shows it, a
  reload reads it) or never will. The role needs to be the backend's own or a
  member of `pg_signal_backend`. Keep that other connection open from warm-up
  on (H4: opening it at the moment of the kill costs a connect and a SCRAM
  handshake on the recovery path).

  The recipe fails OPEN, and silently: a kill that matches nothing and a
  confirm that sees no row look exactly like "already gone", so the call
  rejects while the statement lives on. Three ways to get there, each seen in
  the `[trial2]` with the write committing after the rejection:
  - **A predicate the server does not hold as you configured it.** The
    adapter added `AND application_name = $3`; the server's value differs
    when the URL carries `?application_name=` (`pg` merges the URL over the
    config), when the name exceeds 63 bytes (truncated) or holds non-ASCII
    (escaped): 5/5 runs committed after the rejection, 0/5 in the
    control. Read
    identifiers back from the server; never compare with your config.
  - **A pooler between you and the server.** `client.processID` comes from
    the `BackendKeyData` message, which PgBouncer rewrites: in the
    simulation the client saw pid 4019940 for server pid 131, the confirm
    reported "gone" 5 ms later and the rejected write committed, with the
    pid-only recipe. In transaction mode even `pg_backend_pid()` names a
    server connection shared with other clients, so a kill hits them, and a
    session advisory lock (G3) means nothing. Connect the store directly to
    PostgreSQL, and at connect refuse to start when `pg_backend_pid()`
    differs from `client.processID`.
  - **Settings the connection string replaced.** An `options=` parameter in
    the URL replaces the `options` the adapter passes (its
    `statement_timeout`, `lock_timeout`, `datestyle`, `search_path`):
    `statement_timeout` went from `2s` to `0` while the adapter's own budget
    check, which read its config, still passed. At connect, read back the
    effective values (`SELECT current_setting('statement_timeout'), ...`)
    and refuse to start on a mismatch.

  Test 3.7 with the production connection string and network path, not a
  loopback default (`[trial2]`).
- **MySQL/MariaDB**: note `connection.threadId`; `KILL <id>` from another
  connection, then poll `SELECT 1 FROM information_schema.PROCESSLIST WHERE
  ID = ?` until empty.
- **SQL Server**: note `@@SPID` at connect; `KILL <spid>`, then poll
  `sys.dm_exec_sessions` for it.

The trade-off, to document for your operators: under a full outage (the
server unreachable, not just slow) the call stays pending until the server can
confirm the kill, so the engine's `storeTimeoutMs` ends it as a timeout, the
session stays poisoned (for `setSeqNums`/`reset`, I4) or queues behind it (the
FIFO, D7) until then. That is the correct outcome: the alternative is a write
that may land under a number the engine has already reused.

Driver limits still go SHORTER than `storeTimeoutMs`, but count them per
call, not per limit: the bound of one call is checkout/connect + every round
trip the method makes (+ the kill-and-confirm step when the outcome is
unknown), and that sum must stay below `storeTimeoutMs`, or a
healthy-but-slow call becomes a timeout. A worked example, `storeTimeoutMs:
5000`, PostgreSQL:

| Step | Limit | Budget |
| --- | --- | --- |
| checkout (a warm pool; a reconnect is a connect + SCRAM) | `connectionTimeoutMillis` | 1000 ms |
| `load()` only: verify the G3 lock on its connection (one round trip) | that connection's `statement_timeout` | 500 ms |
| the statement | `statement_timeout` / `lock_timeout` | 1500 ms |
| unknown outcome only: terminate + confirm, on the warm admin connection | the admin connection's `statement_timeout`, a poll deadline | 1500 ms |
| total | | 4500 ms < 5000 |

The `[trial2]` adapter budgeted per statement, and a `load()` that also
connected the lock connection cost connect + lock query + checkout + SELECT,
about 6 s against a 5 s `storeTimeoutMs`.

What no setting bounds: **COMMIT**. `statement_timeout` does not cover the
wait for a synchronous standby. `[trial2]`, `synchronous_standby_names`
naming an absent standby: `setSeqNums` was still pending at 7 s
(`statement_timeout` 2 s, `storeTimeoutMs` 5 s), its backend in `wait_event =
SyncRep`. Staying pending is correct (the outcome is unknown: the commit is
already durable locally and waits only for the standby; a backend terminated
there has committed, and a reload reads it), so a synchronous standby that
goes away poisons every session until it returns or is removed from
`synchronous_standby_names`. Count that in your availability, not your budget
(G1). (Derived; `[trial]`, `[trial2]`.)

**I3. Severity by method**

| Method | Failure (throw / reject / malformed / timeout) | Settlement after the timeout |
| --- | --- | --- |
| `load` (preload, in `create()`) | `Initiator.create()` / `Acceptor.create()` rejects; no engine | discarded |
| `create` (preload) | same | discarded |
| `load` (refresh / reload) | store poisoned (or stays poisoned), `'storeError'` | discarded |
| `create` (a reload found no row, B3) | **poison** | **poison**, "late" |
| `setSeqNums` | **poison** | **poison**, reported as "late" |
| `setMessage` | not fatal: send resolves `false`, `'storeError'` | reported as "late", not poisoned; until then the next write of that seqnum is refused (D7) |
| `getMessages` | not fatal: engine disconnects, peer re-requests | discarded |
| `reset` | **poison**; never thrown into QuickFIX; constructor-time: `create()` rejects | **poison**, "late" |
| `close` | `'storeError'` only; `stop()` still resolves (a timeout included) | discarded |

Sources: `[README]` "Failure policy" and "`stop()`"; `[js_message_store.cpp]`
`Forward()` (`fatal` flag), `OnSettled()` (late handling for
`kSetSeqNums`/`kReset`/`kCreate` only), `refresh()`, `Reload()`; `[store.ts]` `preload()`,
`closeAll()`; `[store.test]` the "failure policy" describe block.

**I4. What poison means for your users.** While poisoned, every write fails
with `IOException`, so every send fails before it reaches the wire. The engine's
own reads of the sequence numbers fall back to the cache (QuickFIX stamps
messages outside its guards on the connect path and in its `RejectLogon`/
`UnsupportedVersion` handlers), and so does the inbound increment inside those
handlers: the failure is recorded and nothing stamped while poisoned is sent.
A poisoned initiator's Logon fails the same way, after QuickFIX counted it as
sent, so that attempt ends at `LogonTimeout`. Whether the session goes down
depends on the reload below. After a plain rejection (nothing unsettled) the
next store call reloads, the network thread's next tick at the latest; if that
succeeds the poison lifts with the session still up (the send whose write was
rejected resolved `false`). While the poison cannot lift (a timed-out write
still unsettled, or the adapter still failing), every inbound message ends in a
sequence-number write that fails, so the engine disconnects the session at its
next inbound message (a heartbeat at the latest); a failed inbound
sequence-number write disconnects it at once. `'storeError'` fires with
`poisoned: true`; `session.getExpected*()` throw until the poison lifts.
`[store.test]` "a send whose setSeqNums rejects once: poisoned, healed by the
next call's reload, no disconnect, the seqnum is reused".
Poison lifts in two steps: once every timed-out write has settled, the next
store call of any kind first reloads the state through `load()` (a timed-out
`load()` is itself unsettled: no other reload starts until it settles), then
proceeds; QuickFIX reconciles with the peer at the next
logon (resend request, or redelivery with `PossDupFlag=Y`). A failed `reset` is
the exception: that step is the reset itself, retried as `reset(id, {the
creationTime of the latest failed reset, 1, 1})` until it succeeds (a later
`reset()` that fails too replaces the pending one's timestamp, cpp
`reset()`), never a `load()` (which
would bring back the numbers QuickFIX meant to discard). A message stamped
while poisoned, whose sender number the lifting reload then moved, is refused
(non-poisoning `'storeError'`, not sent). A timed-out `setSeqNums`/`reset`, or
reload `load()`, that never settles keeps the session poisoned until the
engine is stopped (I2).
Sources: `[README]` "Failure policy"; `[js_message_store.cpp]` `Gate()`,
`RetryReset()`, `CheckStamp()`; `[store.test]` "ResetOnDisconnect=Y +
rejecting reset() ...", "ResetOnLogon=Y + a reset() that rejects once ..." and
"poisoned store with a stalled load(): one reload, then calls fail
immediately until it settles". For the adapter this means: during an outage, reject fast
every call that reached nothing (a refused connection, a failed checkout) and
keep pending the ones whose outcome is unknown (I2); on
recovery, make `load()` and `reset()` work first; `reset()` must be idempotent
(F3: an upsert), since a timed-out reset that landed late is retried.

**I5. Do not retry for long inside a call.** Internal retries consume
`storeTimeoutMs` while an engine thread is parked, and with one network thread
per engine that freezes heartbeats of EVERY session of that engine. Fail fast
when nothing was sent or the server answered (I2), and let the engine's policy
(I3) do its work. "Fail fast" never means settling an unknown outcome early
(I2). Source: `[README]` "Timeout" ("a longer timeout freezes heartbeats of
*every* session of the engine ... when the adapter stalls"). (Derived
recommendation.)

The reload that lifts a poison runs on the engine's network thread, before the
store call that triggered it, and while a session stays poisoned every store
call of that session tries it again. So a slow failure costs the WHOLE engine:
`[trial]`, a `load()` that failed after 800 ms (a connect timeout) on one
session kept a healthy session of the same engine from processing its inbound
TestRequest until the database came back (measured before the binding's
no-responder Logon guard, `6eccbb6`, removed one extra tick per disconnect;
the per-call cost is unchanged). The stall is roughly `load()` latency ×
store calls per tick × poisoned sessions. Keep the connect timeout of the
reload path (and the checkout timeout) far below `HeartBtInt`, and make
`load()` fail fast when the server refuses connections. A fast failure has the
opposite cost: `[trial]`, 18,000-40,000 `load()` attempts during a 20 s server
stop (about 850/s); the engine does not pace them, so an adapter that opens a
connection per attempt should rate-limit its reconnects (reject at once while
a reconnect is cooling down). That makes each attempt cheap; it does not make
them rarer (`[trial2]`: about 250 `load()` calls per second per poisoned
session behind a 200 ms cooldown), so rate-limit the adapter's own alarms
and log lines as well.

**I6. Never swallow a failed write.** Returning normally after a write that did
not land is the one unrecoverable error: the engine's cache advances (C5) and
the peer sees sequence numbers your store does not hold. The same goes for a
write that landed DIFFERENTLY (truncated, re-encoded, normalised): reject it
rather than return normally (A8).

**I7. Teardown.** `stop(true)` fails every pending store call at once;
a graceful `stop()` lets in-flight writes complete (bounded by the timeout).
Once the engine is deactivated the bridge refuses to START new adapter calls,
but a Promise you already returned may still settle afterwards. The binding
tracks every write Promise until it settles: a session's `close()` runs only
once the engine's own pending writes for it settled (bounded by the timeout;
at the bound it is skipped and reported), and the session's next `create()` in
the process waits for them too (bounded, then it rejects). Your pool shutdown,
which the binding does not see, must still tolerate a statement in flight.
Sources: `[README]` "`stop()`"; `[ARCH]` §4b "Teardown"; `[store.test]` "a
never-settling store call: stop(true) returns at once and the parked send
settles", "MessageStoreAdapter: calls a stopped engine abandoned".

Bound your pool shutdown too: `pg`'s `Client.end()` (and so `pool.end()`)
waits, without a limit, for the server to close the socket, so with a frozen
server a process that ran `await engine.stop(); await pool.end()` cannot exit
until the server thaws (`[trial]`, 3/3). Race `end()` against a grace period
and then end the process with `process.exit()`, which a parked store call does
not hold up at this revision (`[README]` "Process exit"); in a process that
must live on, destroy the sockets of the clients that did not end (for `pg`,
`client.connection.stream`, which is not a public API). Snapshot the pool's
clients BEFORE calling `pool.end()` (`[...pool._clients]`, not public
either): `end()` removes the idle ones from `_clients` before they have
closed, so a list taken after the grace period misses them (`[trial2]`).

A bounded shutdown is not a cancelled one. Destroying a socket, or a call the
adapter rejects with its own `ESHUTDOWN`, does not withdraw a statement the
server has already received: it is an unknown outcome like any other (the
table above). `[trial2]`: `stop()` against a frozen server, then `end(2000)`;
the Logout's `setMessage` calls were rejected, and after the thaw both
INSERTs committed. Harmless there, because the next Logon upserted the same
numbers, but a process restarted on the same rows while such statements are
still queued can see one of them land after its own writes. On an unclean
end, log the `(pid, backend_start)` of every connection that did not close,
and terminate-and-confirm them (I2) before the sessions are started again.

**I8. The `'storeError'` event** is `(sessionID, method, error, poisoned)` with
`error.name === 'QuickFixError'`, `error.fixErrorName === 'IOException'`,
`error.message === 'message store <method>: <your message>'` (suffixed
`(late)` for a late settlement). Observe-only; applications alert on
`poisoned: true`. It travels through the event loop on its own, so it can
arrive AFTER the `sendToTarget()` Promise of the failed send settled; wait for
it, do not assume it already fired. Sources: `[store.ts]` `ioError()`,
`StoreBinding.bridge.storeError`; `src/engine.ts` `EngineEvents.storeError`;
`[trial]`.

What a `sendToTarget()` that resolved `false` means depends on the failed
method: when it was `setMessage`, nothing was stored and nothing was sent
(D2). When it was `setSeqNums` (rejected, or timed out) the message was
already stored under its number, and if the write still committed (a late
settlement, or a rejection whose statement landed anyway) the reload brings
that number back and the message goes out later through the resend path
with `PossDupFlag=Y` (`[trial]`: 2-4 such deliveries per run of a 15 s
server freeze). So: `false` with a `setMessage` `'storeError'` = not sent;
otherwise = unknown, reconcile on the counterparty's answers (ExecutionReports,
by `ClOrdID`) instead of resubmitting blindly. (Derived from D2, D7, I4.)

**I9. Handle the driver's error events, on the pool AND on every client you
hold.** A connection the server ends while your code is not awaiting it
(`pg_terminate_backend`, `idle_session_timeout`, a restart, a failover) is
reported as an `'error'` event; with no listener it is an uncaught exception
that kills the process, and every FIX session in it. `pg-pool` emits an idle
client's error on the pool (`pool.on('error', ...)`), but REMOVES that
listener from a client while it is checked out: a client you hold between two
statements (a transaction wrapper, a warm-up, a replenish, a dedicated
connection for a lock or for the kill step of I2) needs its own
`client.on('error', ...)` for as long as you hold it. `[trial]`: an adapter
with `pool.on('error')` only crashed in 11 of 13 runs when the server ended
its connections during warm-up or replenish. The listener only records the
failure (and schedules a replenish); the call that was using the client
learns of it through its own rejection. Other drivers have the same two
levels (a pool-wide and a per-connection error event); check which one your
driver uses for a connection you hold, and listen on both. A simple way to
cover every client the pool ever opens: `pool.on('connect', (c) =>
c.on('error', record))` next to `pool.on('error', record)`, both attached
when the pool is constructed.

An ORM that wraps the pool does not change this, and may own the listener
only part of the time. `[trial2]`: Prisma's `PrismaPg` attaches its pool
error handler at the first query or `$connect()` and removes it at
`$disconnect()`. A pool warmed before that, or used after it, turned a
server-side kill of an idle connection into an unhandled `57P01` and the
process exited with code 1; while attached, the handler swallows the error
silently unless you pass `onPoolError`. So own the pool (a `pg.Pool` you
construct, with both listeners above) and hand it to the ORM, rather than
letting the ORM build it from a connection string.

**I10. The store holds credentials.** Every outbound message is stored, the
Logon included (D8), so the messages table carries the session's `Password`
(554), and `RawData` (96) when a venue puts its password there, in clear, in
every Logon row. Upstream's stores and its file log do the same. Restrict
access to the table like a credential store, and do not enable statement
logging on the store's database (PostgreSQL `log_statement`,
`log_min_duration_statement`; MySQL's general log), which writes every
`setMessage` parameter to the server log. Never rewrite a stored Logon's bytes
to mask the password: a changed byte fails BodyLength/CheckSum on a resend
(A8). (Derived; `[trial]`.)

---

## J. `close()`

**J1. Optional.** When present it is called once PER SESSION after `stop()` has
destroyed the engine's sessions and the engine's own writes for that session
have settled, before the `stop()` Promise settles; no store call for that
session follows. Exception: after `stop(true)`, a session with a write still
pending is closed once it settled, after `stop()` returned (I7). It is also called when `Initiator.create()` /
`Acceptor.create()` rejects AFTER constructing the engine (a constructor-time
`reset()` failed or timed out: `createEngine()` runs `stop(true)` before
rejecting), so `close()` can run for an engine the application never received.
Not when the preload (`load()`/`create()`) fails: no engine exists then. Sources: `[store.ts]` JSDoc of `close` and
`closeAll()`; `[store.test]` "await stop(); await create({ store: same }) sees
close() before load()" and "create() preloads ..." (`calls.at(-1) == 'close'`).

**J2. Not called for an engine dropped without `stop()`** (torn down at process
exit). Do not rely on it for durability; every write is already durable (G1).
Source: `[store.ts]` JSDoc; `[README]` "`stop()`".

**J3. It is per session, and one adapter object may serve several engines.** Do
not close a shared pool from `close()` unless you reference-count; let the
application own the pool's lifetime. (Derived from J1.)

**J4. A `close()` failure is reported** as `'storeError'` (`method: 'close'`,
`poisoned: false`) and never fails `stop()`; a `close()` that hangs delays it
by `storeTimeoutMs` at most (`0`: indefinitely), on top of up to
`storeTimeoutMs` spent waiting for the session's pending writes (I7). Source: `[store.ts]`
`closeAll()`, `withTimeout()`.

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
