# Test checklist for a custom MessageStoreAdapter

Run the candidate adapter through every scenario below. `MapMessageStore`
(exported by `@homaiohq/napi-quickfix`) is the oracle: for the adapter-level
scenarios, run the same script against a `MapMessageStore` and against the
candidate and compare the outputs. The examples these scenarios are lifted
from: the SQL adapter test of the source revision (`contract()`, which
section 1 below extends with begin > end, gaps and numeric order, seqnums at
2^40 and the safe-integer check, and `loopback()`; see the sources table in `contract.md`),
and, in the repository (not in the npm package; see `contract.md` for where to
open them), `test/store.test.ts` and the test doubles in
`test/store-adapters.ts`. Everything a scenario needs from those files is
spelled out below, so none of them is required: section 3 carries a
self-contained version of the fault-injecting wrapper.

All scenarios use `SessionID` values; build them with
`new SessionID('FIX.4.4', 'A', 'B')` and `new SessionID('FIX.4.2', 'A', 'B', 'q1')`.

## 1. Adapter-level (no engine): a differential script

```ts
import assert from 'node:assert/strict';
import { MapMessageStore, SessionID, type MessageStoreAdapter } from '@homaiohq/napi-quickfix';

const QUAL = new SessionID('FIX.4.2', 'A', 'B', 'q1');
const OTHER = new SessionID('FIX.4.2', 'A', 'B');       // same CompIDs, no qualifier
const FRESH = new SessionID('FIX.4.4', 'X', 'Y');
const SOH = '\x01';
const quotes = `8=FIX.4.2${SOH}9=20${SOH}35=8${SOH}34=2${SOH}58='"Some \\ Text"'${SOH}10=000${SOH}`;

export async function contract(store: MessageStoreAdapter) {
  // 1.1 unknown session: null, not a throw
  assert.equal(await store.load(QUAL), null);

  // 1.2 create + load round trip (creationTime within 1 s, numbers exact)
  const t0 = new Date('2026-10-22T10:11:12.345Z');
  await store.create(QUAL, { creationTime: t0, nextSenderMsgSeqNum: 1, nextTargetMsgSeqNum: 1 });
  const loaded = await store.load(QUAL);
  assert.ok(loaded && loaded.creationTime instanceof Date);
  assert.ok(Math.abs(loaded.creationTime.getTime() - t0.getTime()) < 1000);
  assert.deepEqual([loaded.nextSenderMsgSeqNum, loaded.nextTargetMsgSeqNum], [1, 1]);
  assert.ok(Number.isSafeInteger(loaded.nextSenderMsgSeqNum), 'numbers, not strings/bigints');

  // 1.3 setSeqNums writes both, and in the right slots (sender != target)
  await store.setSeqNums(QUAL, 10, 20);
  const s = (await store.load(QUAL))!;
  assert.deepEqual([s.nextSenderMsgSeqNum, s.nextTargetMsgSeqNum], [10, 20]);

  // 1.4 set/get: inclusive range, ascending, SOH + quotes + backslash intact
  await store.setMessage(QUAL, 1, 'm1');
  await store.setMessage(QUAL, 2, quotes);
  await store.setMessage(QUAL, 3, 'm3');
  assert.deepEqual(await store.getMessages(QUAL, 1, 3), ['m1', quotes, 'm3']);
  assert.deepEqual(await store.getMessages(QUAL, 4, 6), []);          // none -> []
  assert.deepEqual(await store.getMessages(QUAL, 2, 6), [quotes, 'm3']); // end past the last
  assert.deepEqual(await store.getMessages(QUAL, 3, 2), []);          // begin > end -> []

  // 1.5 upsert: rewriting a seqnum replaces it, never throws
  await store.setMessage(QUAL, 2, 'm2-again');
  assert.deepEqual(await store.getMessages(QUAL, 2, 2), ['m2-again']);

  // 1.6 gaps omitted, numeric order (10 after 9, not after 1)
  for (const n of [5, 7, 9, 10, 11]) await store.setMessage(QUAL, n, `m${n}`);
  assert.deepEqual(await store.getMessages(QUAL, 3, 7), ['m3', 'm5', 'm7']);
  assert.deepEqual(await store.getMessages(QUAL, 9, 11), ['m9', 'm10', 'm11']);
  // begin itself missing must NOT empty the result (upstream MemoryStore trap)
  assert.deepEqual(await store.getMessages(QUAL, 4, 5), ['m5']);

  // 1.7 sessions are independent; the qualifier is part of the key
  assert.equal(await store.load(OTHER), null);
  await store.create(OTHER, { creationTime: t0, nextSenderMsgSeqNum: 5, nextTargetMsgSeqNum: 6 });
  await store.setMessage(OTHER, 1, 'other');
  assert.deepEqual(await store.getMessages(QUAL, 1, 1), ['m1']);
  assert.deepEqual(await store.getMessages(OTHER, 1, 9), ['other']);

  // 1.8 reset: messages gone, state rewritten with the GIVEN creationTime, per session
  const t1 = new Date('2026-10-23T00:00:00.000Z');
  await store.reset(QUAL, { creationTime: t1, nextSenderMsgSeqNum: 1, nextTargetMsgSeqNum: 1 });
  assert.deepEqual(await store.getMessages(QUAL, 1, 99), []);
  const r = (await store.load(QUAL))!;
  assert.deepEqual([r.nextSenderMsgSeqNum, r.nextTargetMsgSeqNum], [1, 1]);
  assert.ok(Math.abs(r.creationTime.getTime() - t1.getTime()) < 1000);
  assert.deepEqual(await store.getMessages(OTHER, 1, 9), ['other']);

  // 1.9 reset on a never-seen session creates its row
  await store.reset(FRESH, { creationTime: t1, nextSenderMsgSeqNum: 1, nextTargetMsgSeqNum: 1 });
  assert.ok(await store.load(FRESH));

  // 1.10 large but safe seqnums survive the round trip
  await store.setSeqNums(FRESH, 2 ** 40 + 3, 2 ** 40 + 4);
  const big = (await store.load(FRESH))!;
  assert.deepEqual([big.nextSenderMsgSeqNum, big.nextTargetMsgSeqNum], [2 ** 40 + 3, 2 ** 40 + 4]);
}

await contract(new MapMessageStore()); // the oracle passes by construction
await contract(myAdapter);
```

Scenario → rule in `contract.md`: 1.1 B1/B2; 1.2 A3/B5/B7; 1.3 C1 (+ the
column mapping in `upstream-schemas.md`); 1.4 A5/A6/E1/E4; 1.5 D1; 1.6 E2/E3/E5;
1.7 A1/A7; 1.8 F1/F4/F7; 1.9 F3; 1.10 A3/K4.

Additional adapter-level checks worth a line each:

- **1.11 Time zone.** Run 1.2 with `TZ=Asia/Kolkata` and `TZ=America/New_York`
  in the environment (and, for a SQL backend, with a non-UTC session time
  zone, and for PostgreSQL a non-ISO `DateStyle` such as `'SQL, DMY'` and
  `'Postgres, MDY'`): the loaded `creationTime` must still equal `t0` within a
  second. This catches drivers that parse a naive timestamp as local time and
  text casts that follow the server's date style (B7; see
  `upstream-schemas.md` "Timestamps").
- **1.12 Two adapters, one database.** Create two adapter instances over the
  same backend; what one writes the other loads. (The engine reads only through
  the adapter it was given, but this catches per-instance caches, G2.)
- **1.13 Rejection shape (nothing sent).** Point the adapter at a backend that
  refuses connections (a closed port) or rejects the password: every method
  must reject (or throw) within your connect/checkout timeout, which must be
  shorter than `storeTimeoutMs` (I2). None may hang, none may resolve. If your
  adapter connects when it is constructed, construct it against a healthy
  backend first and stop the backend afterwards; it must still reject per
  call, and recover once the backend is back. (A backend that accepts the
  connection and then stops answering is 3.5 and 3.7, not this.)
- **1.14 Concurrency across sessions.** Fire 50 interleaved `setMessage`/
  `setSeqNums` calls for 5 different sessions concurrently; afterwards each
  session's `load()` and `getMessages()` must match what the oracle holds (H1).

The logic checks below catch designs that pass 1.1-1.10 by accident
(monotonic guards, append-only logs, range-limited deletes, lossy encodings).
Append them to `contract()`; the oracle passes all of them.

```ts
  // 1.15 setSeqNums goes DOWN too: last write wins, no monotonic guard (C6)
  await store.setSeqNums(FRESH, 50, 60);
  await store.setSeqNums(FRESH, 3, 4);
  const down = (await store.load(FRESH))!;
  assert.deepEqual([down.nextSenderMsgSeqNum, down.nextTargetMsgSeqNum], [3, 4]);

  // 1.16 one entry per seqnum, the LAST write, after many rewrites (E10, D1);
  //      begin = 0 is answered, not thrown on (E4)
  for (const v of ['a', 'b', 'c']) await store.setMessage(FRESH, 7, `m7-${v}`);
  await store.setMessage(FRESH, 8, 'm8');
  assert.deepEqual(await store.getMessages(FRESH, 0, 9), ['m7-c', 'm8']);

  // 1.17 reset deletes EVERY message, including numbers >= nextSender (F1, D8)
  await store.setSeqNums(FRESH, 3, 4);
  await store.setMessage(FRESH, 1000, 'above-next-sender');
  await store.reset(FRESH, { creationTime: t1, nextSenderMsgSeqNum: 1, nextTargetMsgSeqNum: 1 });
  assert.deepEqual(await store.getMessages(FRESH, 0, 2 ** 53 - 1), []);

  // 1.18 a real message survives byte for byte: BodyLength and CheckSum still
  //      verify after the round trip (A5, A6, A8). Non-ASCII on purpose.
  const wire = fixMessage('8=FIX.4.4', `35=D\x0134=2\x0149=A\x0156=B\x0158=déjà vu ✓ 'q' "dq" \\ \r\n end\x01`);
  await store.setMessage(FRESH, 2, wire);
  const [back] = await store.getMessages(FRESH, 2, 2);
  assert.ok(Buffer.from(back, 'utf8').equals(Buffer.from(wire, 'utf8')), 'byte-identical');
  assert.ok(checksumOk(back), 'CheckSum still verifies (the engine re-validates on resend)');
```

with these helpers next to `contract()` (the FIX checksum is the byte sum mod
256 of everything before `10=`, BodyLength the byte count after `9=...<SOH>`
up to `10=`; both over UTF-8 bytes):

```ts
function fixMessage(begin: string, body: string): string {
  const head = `${begin}\x019=${Buffer.byteLength(body, 'utf8')}\x01`;
  const sum = [...Buffer.from(head + body, 'utf8')].reduce((a, b) => a + b, 0) % 256;
  return `${head}${body}10=${String(sum).padStart(3, '0')}\x01`;
}
function checksumOk(m: string): boolean {
  const b = Buffer.from(m, 'utf8');
  const at = b.lastIndexOf('\x0110=') + 1;
  const sum = [...b.subarray(0, at)].reduce((a, x) => a + x, 0) % 256;
  return Number(b.subarray(at + 3, b.length - 1).toString()) === sum;
}
```

Scenario → rule: 1.15 C6; 1.16 D1/E4/E10; 1.17 F1/D8; 1.18 A5/A6/A8.

## 2. Engine-level (loopback)

These need a real engine pair on `127.0.0.1`: an `Acceptor` and an `Initiator`
with mirrored session ids (`FIX.4.4:CLIENT->SERVER` on the initiator,
`FIX.4.4:SERVER->CLIENT` on the acceptor), `UseDataDictionary=N`,
`StartTime=00:00:00`, `EndTime=00:00:00`, `HeartBtInt=30`, `log: 'none'`, a
free port (listen on port 0 with `node:net`, read the port, close, use it),
and `SocketConnectHost=127.0.0.1` / `SocketConnectPort` on the initiator,
`SocketAcceptPort` on the acceptor. Wait for state with a small poll
(`until(() => engine.isLoggedOn(id))`) or `once(engine, 'logon')`, never with a
fixed sleep. (The repository's `test/helpers.ts` and `test/store-adapters.ts`
build exactly that; the SQL adapter test's `loopback()`, see the sources table
in `contract.md`, is the minimal version of 2.1-2.2.)

- **2.1 Numbering continues across a restart (`ResetOnLogon=N`).** Start both
  with the candidate adapter, log on, send two application messages, stop both
  (`await ini.stop(); await acc.stop()`). Expect the initiator's
  `getExpectedSenderNum()` to be 4 before the stop (Logon=1, orders 2 and 3);
  after the stop the adapter row must hold `nextSenderMsgSeqNum = 5` (the
  Logout took 4) and messages 1..4. Start a second pair over the SAME adapter:
  `getExpectedSenderNum()` is 5 before logon; send one more message; it arrives
  with `MsgSeqNum = 6` (test "ResetOnLogon=N: a restart continues seqnums from
  the adapter ..." and the SQL adapter test's `loopback()`: `sender2 == 7` after
  the second logon + order).
- **2.2 A gap is served from `getMessages()` with the message intact.** Before
  the second start of 2.1, lower the ACCEPTOR row's `nextTargetMsgSeqNum` to 3
  (directly in the backend). On logon the acceptor sends a ResendRequest from 3;
  the application message 3 must arrive in `fromApp` with `PossDupFlag=Y` and
  every field equal to the original (put `'"quoted" \back\slash'` in `Text`);
  the admin messages 4 (Logout) and 5 (Logon) are gap-filled. The candidate's
  `getMessages` was called with a range that includes 3..5.
- **2.3 Write-through order.** With a recording wrapper around the candidate
  (push the method name to an array), every outbound application message must
  show `setMessage` then `setSeqNums` (test "sync Map adapter on both sides ...":
  "Every outbound message = setMessage + setSeqNums, as upstream").
- **2.4 `ResetOnLogon=Y` resets through the adapter.** The initiator's `reset`
  is called at logon; afterwards the row is `1/1` with no messages below the
  Logon's own seqnum.
- **2.5 `close()` on `stop()`.** After `await engine.stop()` the last recorded
  call is `close` (once per session), and `await Initiator.create({ store:
  sameAdapter })` right after records `load` next, never a call before `close`
  (test "await stop(); await create({ store: same }) sees close() before load()").
- **2.6 A session constructed outside its session time.** Configure
  `StartTime`/`EndTime` as a one-hour window two hours from now; pre-create the
  row with `9/9`; `Acceptor.create()` must call `load` then `reset` and resolve
  with `getExpectedSenderNum() === 1`. Make `reset` reject: `create()` rejects
  and `doesSessionExist(id)` is `false` (test "a session constructed outside its
  session time resets through the adapter on the JS thread; create() awaits
  it").
- **2.7 Forcing a resend without touching the backend.** Log on with
  `ResetOnLogon=N` on both sides, send a few orders from the initiator, then
  rewind the acceptor: `acc.getSession(ACC_ID).setNextTargetMsgSeqNum(n)` with
  `n` the first order's seqnum, and send one more order. The acceptor sees a
  number above the one it expects and sends `ResendRequest(n, 0)`; the
  initiator answers from its adapter's `getMessages(n, next - 1)`. This is how
  2.8, 2.9 and 3.6 trigger a resend.
- **2.8 A resend delivers each stored application message once, in order (E2,
  E10).** With 2.7 over the candidate after three orders `o1..o3` (each
  written several times if your design keeps history), the acceptor's
  `fromApp` must see `o1`, `o2`, `o3` with `PossDupFlag=Y` and their original
  seqnums, then the trigger order, and no `SequenceReset` whose `NewSeqNo` is
  below its own `MsgSeqNum`. For contrast, the `[probe]` behind E2/E10 wrapped
  `MapMessageStore.getMessages` to reverse its result: the acceptor got only
  the trigger order (`SequenceReset-GapFill 2→5` first, `o1..o3` lost); to
  duplicate every entry: three `SequenceReset`s going backwards.
- **2.9 A damaged row wedges the session (A8), to see why 1.18 matters.**
  With `MapMessageStore`, three orders, then change one byte of the middle
  stored message without changing its length (`11=o2` → `11=oX`), then 2.7:
  only `o1` is resent, and the acceptor's `getExpectedTargetNum()` stays at
  the damaged number. Your adapter must never be the thing that changes that
  byte.

## 3. Failure injection (wrap the candidate, do not modify it)

Wrap the candidate in an object that forwards every method but can be told,
per method, to reject, hang, or park the call until the test settles it. A
self-contained version (the repository's `ControlledStore` in
`test/store-adapters.ts` does the same over a `MapMessageStore`):

```ts
import type { MessageStoreAdapter, MessageStoreMethod } from '@homaiohq/napi-quickfix';

/**
 * 'ok'     forward to the candidate.
 * 'reject' reject at once; the candidate is NOT called.
 * 'hang'   never settle; the candidate is NOT called.
 * 'defer'  park the call in `parked`; `resolve()` THEN forwards it to the
 *          candidate and settles with the candidate's outcome, `reject()`
 *          rejects without calling the candidate. Use it to release a timed-out
 *          call late, after the engine gave up on it.
 */
type Mode = 'ok' | 'reject' | 'hang' | 'defer';
interface Parked { method: MessageStoreMethod; args: unknown[]; resolve(): void; reject(err?: Error): void }

export function faulty(inner: MessageStoreAdapter) {
  const modes = new Map<MessageStoreMethod, Mode>();
  const parked: Parked[] = [];
  const calls: MessageStoreMethod[] = [];
  const wrap = (method: MessageStoreMethod) => (...args: unknown[]) => {
    calls.push(method);
    const call = () => (inner[method] as (...a: unknown[]) => unknown).apply(inner, args);
    switch (modes.get(method) ?? 'ok') {
      case 'reject': return Promise.reject(new Error(`injected ${method} rejection`));
      case 'hang': return new Promise(() => {});
      case 'defer':
        return new Promise((resolve, reject) => parked.push({
          method, args,
          resolve: () => { Promise.resolve().then(call).then(resolve, reject); },
          reject: (err = new Error(`injected ${method} rejection`)) => reject(err),
        }));
      default: return call();
    }
  };
  const store = {
    load: wrap('load'), create: wrap('create'), setSeqNums: wrap('setSeqNums'),
    setMessage: wrap('setMessage'), getMessages: wrap('getMessages'), reset: wrap('reset'),
    ...(inner.close && { close: wrap('close') }),
  } as MessageStoreAdapter;
  return { store, modes, parked, calls };
}
```

`'storeError'` is delivered through the event loop, independently of the
`sendToTarget()` Promise: it can arrive AFTER that Promise settled. In every
scenario below, wait for the event (`once(engine, 'storeError')`, or a poll on
an array your listener fills) instead of asserting on it right after
`await sendToTarget(...)`; tests written the other way are flaky.

- **3.1 `setMessage` rejects.** `sendToTarget()` resolves `false`,
  `getExpectedSenderNum()` is unchanged, the session is still logged on,
  `'storeError'` fired once with `poisoned === false`; restore the adapter; the
  next send succeeds and arrives with the seqnum the failed send did not
  consume (test "setMessage rejection: ...").
- **3.2 `setSeqNums` rejects.** `sendToTarget()` resolves `false`,
  `'storeError'` has `poisoned === true`, `getExpectedSenderNum()` throws an
  `IOException`; while `setSeqNums` keeps rejecting, the session disconnects
  on its next inbound message (the reload succeeds, the inbound message's own
  write then fails; a single rejection heals at the next call's reload with no
  disconnect, test "a send whose setSeqNums rejects once: ..."); restore
  the adapter and `session.logon()`: the candidate's `load` is called (the
  reload) and the session is back (test "ResetOnDisconnect=Y + rejecting
  reset() ..." uses the same recovery path).
- **3.3 A hang is bounded.** Make `setMessage` never settle with
  `storeTimeoutMs: 300`: `sendToTarget()` resolves `false` after >= 300 ms,
  `'storeError'` says "timed out", `poisoned === false`. Then make
  `setSeqNums` never settle: `poisoned === true`, and NO reload is attempted
  until the parked Promise is settled (test "setSeqNums timeout then late
  resolve ...").
- **3.4 Nothing hangs the process.** With a hung `setMessage` and no `stop()`,
  the process still exits once the timeout released the engine thread. Run it
  in a child process (`node:child_process` `fork()` of a small script that
  builds the pair, parks a send and returns; the parent asserts the child's
  exit within the timeout plus a margin, and kills it otherwise). Then the same
  with an explicit `process.exit(1)` while the send is parked: it must exit at
  once.
- **3.5 A black hole, two ways (I2).** (a) At connect time: point a fresh
  adapter at a firewall-dropped address (nothing answers the SYN): each method
  rejects before `storeTimeoutMs` elapses, through the connect/checkout
  timeout. (b) Mid-statement: with the adapter connected, freeze the server
  (`docker pause`, `kill -STOP` of the server process) while a write is in
  flight: the call must NOT reject before the server is back (the engine times
  it out: `'storeError'` "timed out"); after the thaw it settles, and the row
  then holds what the engine's later calls wrote, never the frozen write's
  value over a newer one.
- **3.6 A late `setMessage` must not overwrite a newer one (D7).** The stall
  has to sit BELOW the candidate's own ordering, in its driver: wrapping the
  candidate in the `faulty()` wrapper above would park the call before the candidate's
  FIFO ever sees it. Wrap the candidate's backend call (its `execute`, its pool
  client, ...) so the first write whose parameters contain `11=A` waits on a
  Promise you release by hand; `storeTimeoutMs: 300`. Then:
  `send(A)` resolves `false` (timeout); `send(B)` (any result); release A;
  `send(C)` resolves `true`; afterwards the row for A's seqnum must hold the
  last message whose send resolved `true` there (C, or B if B succeeded),
  never A, and a 2.7 resend from that number must not deliver A. The
  `[probe]` behind D7 ran this with a pool-like double (no ordering): the row
  held A and the acceptor's `fromApp` received A with `PossDupFlag=Y`. With a
  per-session FIFO, `send(B)` failed (queued behind A), A then B landed in
  order, `send(C)` succeeded, and the row held C.
- **3.7 A statement the client gave up on must not commit after newer writes
  (I2, D7).** 3.6 stalls inside your process; this one stalls on the wire,
  where a client-side timeout cannot see it. Put a TCP proxy between the
  adapter and a real server (~40 lines of `node:net`: pipe both ways, and a
  switch that holds, per connection, the client-to-server bytes in a buffer
  instead of forwarding them, and flushes them on release). Hold one pool
  connection's bytes, then:
  - *the D7 repro*: `send(A)` parks on that connection and the engine times it
    out (`storeTimeoutMs: 300`); `send(B)`; release the bytes; `send(C)`;
    then a 2.7 resend from A's seqnum must not deliver A;
  - *the seqnum regression*: let a `setSeqNums` park the same way, let the
    session go on (it reconnects after the poison), release the bytes, then
    `kill -9` the process and restart it on the same rows: the peer must not
    answer the Logon with "MsgSeqNum too low".

  `[trial]`: an adapter with a client-side `query_timeout` above the server's
  `statement_timeout` failed both, 3/3 each (A delivered with
  `PossDupFlag=Y`; the row moved from `12/4` back to `5/3`, then "expecting 12
  but received 8"). Ending the backend and confirming it gone before
  rejecting (contract I2) passed both.

## 4. Interop (only when targeting QuickFIX C++ tables)

- **4.1 Read a row written by QuickFIX C++.** Insert a `sessions` row by hand in
  upstream's format (`creation_time = '2026-10-22 10:11:12'`,
  `incoming_seqnum = 20`, `outgoing_seqnum = 10`): `load()` must return
  `nextTargetMsgSeqNum = 20`, `nextSenderMsgSeqNum = 10`,
  `creationTime = 2026-10-22T10:11:12Z` (not shifted by the local offset).
- **4.2 Write a row QuickFIX C++ can read.** After `setSeqNums(id, 10, 20)` the
  row has `outgoing_seqnum = 10`, `incoming_seqnum = 20`; after `reset()` the
  `creation_time` text starts with `YYYY-MM-DD HH:MM:SS` in UTC.
- **4.3 Messages are byte-identical in the `message` column**: `SELECT` the raw
  column and compare with the string you wrote (SOH present, nothing escaped
  twice).
- **4.4 Date style and precision.** PostgreSQL: with `ALTER DATABASE <db> SET
  datestyle = 'SQL, DMY'` (new connections), `load()` still returns the exact
  instant. All backends: after `create()`/`reset()` the raw `creation_time` has
  no fractional part (SQL Server: `CONVERT(VARCHAR(23), creation_time, 121)`
  ends in `.000`), because upstream's `OdbcStore` misreads a fraction and MySQL
  rounds one.
- **4.5 Message size at the column limit.** Store and read back a message one
  byte over the column's limit (MySQL `BLOB`: 65,536 bytes; PostgreSQL and SQL
  Server have no practical limit, use ~200 KB): either it round-trips
  byte-identical, or `setMessage` rejects. It must never resolve with a
  truncated or missing row. Run it under the pool's real `sql_mode`.
- **4.6 Keys that differ only by case.** `create()` two sessions whose
  `TargetCompID`s are `ACME` and `acme`: both rows exist, `setSeqNums` on one
  leaves the other untouched, `reset` of one keeps the other's messages. On the
  stock MySQL/SQL Server collations this FAILS (duplicate key): either change
  the key collation (`upstream-schemas.md` section 7) or document that CompIDs
  must not differ by case alone.
- **4.7 Non-ASCII bytes, compared raw.** Store a message containing
  `58=みずほ証券 é`; read the raw column bytes with the database's own tool
  (PostgreSQL `encode(convert_to(message, 'UTF8'), 'hex')`, MySQL
  `HEX(message)`, SQL Server `CAST(CAST(message AS VARCHAR(MAX)) AS
  VARBINARY(MAX))`) and compare with `Buffer.from(msg, 'utf8')`. Then insert
  a row holding those exact bytes outside the adapter (as the C++ store would)
  and check `getMessages()` returns the original string.
- **4.8 Rows written by upstream's store, read by yours, and back.** If you
  can build the harness of section 5, run it: let upstream create the session
  (`populateCache()` inserts it), `set` a message with SOH, quotes and
  non-ASCII, `seqnums 10 20`; your `load()`/`getMessages()` must see exactly
  that. Then write with your adapter and `dump` with upstream: same numbers,
  same creation second, byte-identical messages.

## 5. Optional: upstream's own stores as an oracle

The strongest interop check runs QuickFIX's real `PostgreSQLStore`,
`MySQLStore` and `OdbcStore` against your database. Not shipped with this
skill (it needs Docker and a C++ toolchain); it takes about 3 minutes to build:

- **Image**: `debian:bookworm` with `build-essential cmake libpq-dev
  default-libmysqlclient-dev unixodbc-dev`, plus Microsoft's `msodbcsql18`
  from `packages.microsoft.com` for SQL Server.
- **QuickFIX**: the source of the tag this binding pins (`v1.16.0`), built
  with upstream's CMake: `-DHAVE_POSTGRESQL=ON -DHAVE_MYSQL=ON -DHAVE_ODBC=ON
  -DHAVE_SSL=OFF -DHAVE_PYTHON3=OFF -DQUICKFIX_TESTS=OFF
  -DQUICKFIX_EXAMPLES=OFF -DQUICKFIX_SHARED_LIBS=OFF`, target `quickfix`. A
  second tree with `-DCMAKE_CXX_FLAGS="-fsanitize=address,undefined"` exposes
  the memory errors (gotcha 14 of `upstream-schemas.md`).
- **CLI** (~200 lines of your own C++, compiled with `-std=c++17 -DHAVE_ODBC
  -I<quickfix>/src/C++ -I/usr/include/mysql -I/usr/include/postgresql`, since
  the ODBC headers are guarded by `HAVE_ODBC`, and linked with
  `libquickfix.a -lpq -lmysqlclient -lodbc -lpthread`): construct `FIX::PostgreSQLStore(now, sessionID,
  database, user, password, host, port)` (or the MySQL / `FIX::OdbcStore(now,
  sessionID, user, password, connectionString)` equivalents) and expose
  `dump` (`getCreationTime()`, both `getNext*MsgSeqNum()`, `get(1, N)` printed
  with byte lengths and hex), `set <seq> <file>` (raw bytes), `seqnums <s>
  <t>` and `reset`. Note that constructing the store INSERTs a missing session
  row, as upstream does.
- **Ports**: upstream keeps the port in a `short`; for a server on a port
  above 32,767 pass port 0 and set `PGPORT` / `MYSQL_TCP_PORT` instead.
- Run the container with `--network host`, one operation per invocation, and
  only against a scratch database.
