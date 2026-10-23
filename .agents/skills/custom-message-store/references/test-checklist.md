# Test checklist for a custom MessageStoreAdapter

Run the candidate adapter through every scenario below. `MapMessageStore`
(exported by `@homaiohq/napi-quickfix`) is the oracle: for the adapter-level
scenarios, run the same script against a `MapMessageStore` and against the
candidate and compare the outputs. The examples these scenarios are lifted
from: the SQL adapter test of the source revision (`contract()`, reproduced
below as section 1, and `loopback()`; see the sources table in `contract.md`),
and, in the repository, `test/store.test.ts` and the test doubles in `test/store-adapters.ts`
(`ControlledStore`: per-method `'ok' | 'reject' | 'hang' | 'defer'`).

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
- **1.13 Rejection shape.** Point the adapter at an unreachable backend: every
  method must reject (or throw) within your driver's timeout, which must be
  shorter than `storeTimeoutMs` (I2). None may hang, none may resolve.
- **1.14 Concurrency across sessions.** Fire 50 interleaved `setMessage`/
  `setSeqNums` calls for 5 different sessions concurrently; afterwards each
  session's `load()` and `getMessages()` must match what the oracle holds (H1).

## 2. Engine-level (loopback)

These need a real engine pair on `127.0.0.1`: an `Acceptor` and an `Initiator`
with mirrored session ids (`FIX.4.4:CLIENT->SERVER` on the initiator,
`FIX.4.4:SERVER->CLIENT` on the acceptor), `UseDataDictionary=N`,
`StartTime=00:00:00`, `EndTime=00:00:00`, `HeartBtInt=30`, `log: 'none'`. In the
repository, `test/helpers.ts` (`acceptorCfg(port)`, `initiatorCfg(port)`,
`freePort()`, `waitForEvent()`, `waitUntil()`) and `test/store-adapters.ts`
(`withSettings()`) build exactly that; the SQL adapter test's `loopback()` (source
revision, see the sources table in `contract.md`) is the minimal version of 2.1-2.2.

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

## 3. Failure injection (wrap the candidate, do not modify it)

Wrap the candidate in an object that forwards every method but can be told to
reject / hang per method (copy `ControlledStore` from `test/store-adapters.ts`:
it wraps any inner adapter).

- **3.1 `setMessage` rejects.** `sendToTarget()` resolves `false`,
  `getExpectedSenderNum()` is unchanged, the session is still logged on,
  `'storeError'` fired once with `poisoned === false`; restore the adapter; the
  next send succeeds and arrives with the seqnum the failed send did not
  consume (test "setMessage rejection: ...").
- **3.2 `setSeqNums` rejects.** `sendToTarget()` resolves `false`,
  `'storeError'` has `poisoned === true`, `getExpectedSenderNum()` throws an
  `IOException`, the session disconnects on its next inbound message; restore
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
  the process still exits once the timeout released the engine thread (the
  repository runs this in a child process: `test/fixtures/store-child.ts`).
- **3.5 Driver timeouts beat the engine timeout.** Point the adapter at a
  black-holed address (e.g. a firewall-dropped port) and confirm each method
  rejects before `storeTimeoutMs` elapses (I2).

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
