# QuickFIX C++ message-store tables: schemas, statements, column mapping

Use this file when the adapter must read and write the tables an existing
QuickFIX C++ deployment already uses (its `PostgreSQLStore`, `MySQLStore` or
`OdbcStore`), or when you simply want a proven table layout. Section 7 is the
per-backend guide (PostgreSQL, MySQL, SQL Server); section 8 covers sharing
the tables with a C++ engine during a cutover or as a standby.

## Provenance

- QuickFIX C++ **v1.16.0**, the tag pinned by this binding's `CMakeLists.txt`
  (`FetchContent_Declare(quickfix ... GIT_TAG v1.16.0)`), commit
  `2ce8a60667d95a55cdc57a210f165e19cb757126`:
  https://github.com/quickfix/quickfix/tree/v1.16.0. Upstream paths are
  relative to the QuickFIX repository root. Line numbers are those of v1.16.0.
- No DDL is reproduced in this skill, neither upstream's (section 5 links to
  it) nor the binding's own: that one is `sqlSchema()` in `src/store/sql.ts`
  and `sql/*.sql` of the generic SQL adapter, in no release yet (PR #33), at
  commit `f802818` of https://github.com/homaiohq/napi-quickfix (PR #31,
  identical at `6b8caa0`, the commit that added it), elided from the
  reproduction in `sql-adapter-reference.md`; it was tested against
  `node:sqlite` and PostgreSQL by that revision's SQL adapter test.
- **Verification** (2026-10-23). Statements marked "observed" were run, not
  only read: upstream's unmodified `PostgreSQLStore`, `MySQLStore` and
  `OdbcStore` from v1.16.0, built with `HAVE_POSTGRESQL`/`HAVE_MYSQL`/`HAVE_ODBC`
  (and once more under ASan+UBSan) on Debian bookworm (libpq 15, MariaDB
  Connector/C 10.11, Microsoft ODBC Driver 18), against PostgreSQL 16.15,
  MySQL 8.4.13 (default `sql_mode`, `utf8mb4_0900_ai_ci`) and SQL Server 2022
  (`SQL_Latin1_General_CP1_CI_AS`), with the tables created from upstream's
  `src/sql` files; Node adapters on `pg` 8, `mysql2` 3 and `mssql` 12 (tedious)
  against the same servers. `test-checklist.md` section 5 says how to rebuild
  that harness. QuickFIX `master` has no store or `src/sql` change since v1.16.0
  (checked the same day).

## License

Nothing from QuickFIX is reproduced in this skill: the SQL files are linked
(section 5) and the C++ is cited by file and line, with short identifiers
quoted for orientation. QuickFIX, including those SQL files, is distributed
under the **QuickFIX Software License, Version 1.0**
(https://github.com/quickfix/quickfix/blob/v1.16.0/LICENSE; also in this
repository's `THIRD_PARTY_LICENSES`, section "QuickFIX"). If you copy its DDL
into your own project, keep that license's notice with it.

---

## 1. The column mapping (verified in upstream source)

| Table.column | Adapter value | Upstream evidence (v1.16.0) |
| --- | --- | --- |
| `sessions.incoming_seqnum` | `nextTargetMsgSeqNum` | `populateCache()` selects `creation_time, incoming_seqnum, outgoing_seqnum` (`PostgreSQLStore.cpp:84`) and does `m_cache.setNextTargetMsgSeqNum(std::stoull(query.getValue(0, 1)))` (`:105`, column 1 = `incoming_seqnum`); `setNextTargetMsgSeqNum()` runs `UPDATE sessions SET incoming_seqnum=` (`:256`) |
| `sessions.outgoing_seqnum` | `nextSenderMsgSeqNum` | `m_cache.setNextSenderMsgSeqNum(std::stoull(query.getValue(0, 2)))` (`:106`, column 2 = `outgoing_seqnum`); `setNextSenderMsgSeqNum()` runs `UPDATE sessions SET outgoing_seqnum=` (`:240`) |
| `sessions.creation_time` | `creationTime` | written `'%d-%02d-%02d %02d:%02d:%02d'` from `UtcTimeStamp::getYMD/getHMS` (`:113`, `:303`); read with `strptime("%Y-%m-%d %H:%M:%S")` into `UtcTimeStamp(&tm)` (`:103-104`) |
| `sessions.{beginstring, sendercompid, targetcompid, session_qualifier}` | `sessionID.beginString`, `.senderCompID`, `.targetCompID`, `.sessionQualifier` (`''` when none) | every `WHERE` clause (`:85-88`, `:198-202`, `:216-219`, ...) |
| `messages.msgseqnum` | `seqNum` of `setMessage`/`getMessages` | `INSERT INTO messages (... msgseqnum, message)` (`:183-190`) |
| `messages.message` | the raw FIX string, SOH included | `set(msgSeqNum, msg)` receives `message.toString()` (`Session.cpp:570-573`); `Field.h:183` writes `'\001'` after every field |

The same lines exist in `MySQLStore.cpp` (`:83`, `:104-105`, `:238`, `:252`)
and `OdbcStore.cpp` (`:60`, `:94-95` `setNextTargetMsgSeqNum(incomingSeqNum)` /
`setNextSenderMsgSeqNum(outgoingSeqNum)`, `:227`, `:241`).

**Mnemonic**: `incoming` = what comes in = the next number you expect FROM the
peer = `nextTarget`; `outgoing` = what goes out = the next number you will
stamp = `nextSender`. Both are the NEXT numbers (a fresh row is `1 / 1`,
`PostgreSQLStore.cpp:115-122` inserts `m_cache.getNextTargetMsgSeqNum(),
m_cache.getNextSenderMsgSeqNum()` of a `MemoryStore` that starts at `1/1`).

**Session key**: exactly `(beginstring, sendercompid, targetcompid,
session_qualifier)`. QuickFIX C++'s `SessionID` has no SubID/LocationID members
(`SessionID.h:103-109`), so two sessions that differ only in `SenderSubID` share a
row; the qualifier is the only disambiguator, and it is stored as the empty
string, not `NULL` (`NOT NULL` column; `getSessionQualifier()` returns `""`).

---

## 2. The statements upstream issues (reconstructed from the C++)

PostgreSQL flavour (`PostgreSQLStore.cpp`); MySQL is identical except string
literals are double-quoted and the driver escapes with `mysql_escape_string`;
ODBC uses `{ts '...'}` timestamp literals. `<key>` stands for
`beginstring='B' and sendercompid='S' and targetcompid='T' and
session_qualifier='Q'`.

| Adapter method | Upstream statement(s) | Lines |
| --- | --- | --- |
| `load` | `SELECT creation_time, incoming_seqnum, outgoing_seqnum FROM sessions WHERE <key>`; `> 1` row → `ConfigError("Multiple entries found for session in database")` | `:84-98` |
| `create` | (inside `populateCache()` when 0 rows) `INSERT INTO sessions (beginstring, sendercompid, targetcompid, session_qualifier, creation_time, incoming_seqnum, outgoing_seqnum) VALUES ('B','S','T','Q','YYYY-MM-DD HH:MM:SS', <nextTarget>, <nextSender>)` | `:107-127` |
| `setSeqNums` | two separate statements upstream: `UPDATE sessions SET outgoing_seqnum=<n> WHERE <key>` (sender) and `UPDATE sessions SET incoming_seqnum=<n> WHERE <key>` (target). The binding sends both numbers in one call: issue one `UPDATE ... SET outgoing_seqnum=$sender, incoming_seqnum=$target` | `:238-268` |
| `setMessage` | `INSERT INTO messages (beginstring, sendercompid, targetcompid, session_qualifier, msgseqnum, message) VALUES (...)`; **if it fails**: `UPDATE messages SET message='<msg>' WHERE <key> and msgseqnum=<n>` | `:178-210` |
| `getMessages` | `SELECT message FROM messages WHERE <key> and msgseqnum>=<begin> and msgseqnum<=<end> ORDER BY msgseqnum` | `:212-232` |
| `reset` | `DELETE FROM messages WHERE <key>`; then `UPDATE sessions SET creation_time='YYYY-MM-DD HH:MM:SS', incoming_seqnum=1, outgoing_seqnum=1 WHERE <key>`. Two autocommitted statements, **no transaction** | `:282-318` |
| `refresh` (binding: `load`) | `m_cache.reset(now); populateCache();` i.e. the `SELECT` again (inserting a row if none) | `:320-323` |

Do not transliterate these literally. Upstream interpolates the session id
values unescaped, and the `UPDATE` fallback of `set()` interpolates the message
**unescaped** in the PostgreSQL and MySQL stores (`PostgreSQLStore.cpp:197`,
`MySQLStore.cpp:196`; only `OdbcStore.cpp:176` uses the escaped copy). Use bound
parameters and a real upsert (section 7 has one per backend).

The fallback runs whenever the `INSERT` fails, for any reason, not only on a
duplicate seqnum. Observed with upstream's own stores built from v1.16.0
(see "Verification" below): a message containing `'` (PostgreSQL) or `"`
(MySQL) makes the fallback a syntax error, so `set()` throws; and on MySQL in
strict mode a message larger than the `BLOB` column makes the `INSERT` fail,
then either the fallback is that syntax error (the message contains `"`: the
send fails visibly) or the fallback `UPDATE` matches 0 rows and `set()` returns
`true` having stored **nothing**, so the message goes out unstored
(`MySQLStore.cpp:194-207`; `MySQLConnection.h:66-67` treats 0 affected rows as
success). Without strict mode the `INSERT` succeeds truncated instead. Your
adapter must reject in every case (contract I6).

## 3. Timestamps

- **Format**: `YYYY-MM-DD HH:MM:SS`, **UTC wall-clock, no zone marker, second
  precision**. The components come from a `UtcTimeStamp` (`getYMD`/`getHMS`,
  `PostgreSQLStore.cpp:110-113`); PostgreSQL and MySQL read it back with
  `strptime("%Y-%m-%d %H:%M:%S")` and wrap it as `UtcTimeStamp(&tm)`
  (`FieldTypes.h:547`), i.e. interpreted as UTC again. ODBC reads it as an
  `SQL_TIMESTAMP_STRUCT` instead (`OdbcStore.cpp:79-93`).
- **Column types**: PostgreSQL `TIMESTAMP` (without time zone), MySQL
  `DATETIME`, MSSQL `DATETIME`. None carries a zone, so the convention "the text
  is UTC" is the whole contract.
- **Write whole seconds when a C++ store may read the row**:
  `d.toISOString().slice(0, 19).replace('T', ' ')`. Upstream never writes a
  fraction, and a fraction hurts it: `OdbcStore.cpp:92` passes the ODBC
  `fraction` (nanoseconds) to the 4-argument `setHMS(h, m, s, millis)`, which
  multiplies it by 10^6 in an `int` (`FieldTypes.h:259-260`): observed, a stored
  `.347` reads back in C++ as `:13.002`, `.003` as `:14.112`, and UBSan reports
  the signed overflow. MySQL `DATETIME` and MSSQL `DATETIME` also ROUND a
  fraction rather than truncate it (`.999` becomes the next second; MSSQL keeps
  1/300 s, `.345` becomes `.347`). The binding needs no sub-second precision:
  the only consumer is `checkSessionTime()`, and test 1.2 tolerates 1 s.
  (The binding's own `sqlSchema()` DDL uses `DATETIME(3)` for MySQL and the
  removed adapter wrote `.mmm`: fine for tables only the binding reads, not for
  upstream's tables.)
- **Read it as text in a fixed format, never through the server's default
  rendering.** `pg` parses `timestamp without time zone` as LOCAL time when it
  builds a `Date`; `mysql2` applies its `timezone` option; `tedious` applies
  `useUTC`. The removed SQL adapter read `creation_time::text`, which is NOT
  safe: a timestamp's text form follows the session's `DateStyle`. Observed:
  under `DateStyle = 'SQL, DMY'` it is `22/10/2026 10:11:12.345` (the adapter's
  fallback `new Date(v)` is `Invalid Date`, so `load()` throws and
  `Initiator.create()` rejects); under `'Postgres, MDY'` it is
  `Thu Oct 22 10:11:12.345 2026`, which `new Date()` parses as LOCAL time
  (shifted by the process offset, silently). Use a format the server cannot
  restyle: PostgreSQL `to_char(creation_time, 'YYYY-MM-DD HH24:MI:SS.MS')`,
  MySQL `CAST(creation_time AS CHAR)` or `DATE_FORMAT(creation_time,
  '%Y-%m-%d %H:%i:%s')`, MSSQL `CONVERT(VARCHAR(23), creation_time, 121)`;
  then parse strictly as UTC (append `Z`; reject anything that does not match).
  Verify with tests 1.11 and 4.4 of `test-checklist.md`.
- **The C++ side has the same DateStyle weakness and no error path.**
  `PostgreSQLStore.cpp:101-103` parses into an uninitialised `struct tm` and
  ignores `strptime`'s return value: under `'SQL, DMY'` upstream's own store
  reported `0035-12-03T167:00:23Z` (the garbage varies between runs), then
  (as the session window check fails) resets the session at startup, and at
  every logon with `RefreshOnLogon=Y`; only `NonStopSession=Y` skips that check
  (`Session.h:248-254`).
  If the database or cluster sets a non-ISO `DateStyle`, pin it for the FIX
  role: `ALTER ROLE <role> IN DATABASE <db> SET datestyle = 'ISO, MDY'` (or
  `PGDATESTYLE=ISO` / `PGOPTIONS='-c datestyle=ISO'` in the C++ process).
  Writing is unaffected: an ISO `YYYY-MM-DD` literal parses under any
  `DateStyle`.
- **What it is for**: QuickFIX compares `creation_time` with "now" against the
  configured `StartTime`/`EndTime` window (`Session.h:248-254`) and resets the
  session if the stored numbering belongs to a previous window. A value shifted
  by the local offset makes a fresh session look stale at startup: spurious
  resets.

## 4. Table prefix

Upstream hard-codes the names `sessions` and `messages` in database `quickfix`
(and the log tables, section 5). The binding's removed SQL adapter added an optional
`tablePrefix` that is prepended to BOTH names (`${prefix}sessions`,
`${prefix}messages`) so several deployments can share one schema; its test
used `t<pid>_` to isolate CI runs. Interop with an
upstream deployment means an empty prefix.

## 5. The DDL: read it upstream, do not copy it from here

QuickFIX ships its table definitions in the repository under `src/sql/`, one
subdirectory per dialect:

**https://github.com/quickfix/quickfix/tree/v1.16.0/src/sql**

That is the tag this binding pins; `master` had no change there as of
2026-10-23 (https://github.com/quickfix/quickfix/tree/master/src/sql). This
skill does not reproduce the files, and the npm package does not ship them.
When you need the exact DDL (column types, primary keys, the log tables),
fetch them from that link, or ask the user to paste them. In v1.16.0 the files
are:

| Dialect | Directory | Store tables (what an adapter reads/writes) | Log tables (upstream's SQL *log*, never touched by a store) | Driver scripts |
| --- | --- | --- | --- | --- |
| MySQL | `src/sql/mysql/` | `sessions_table.sql`, `messages_table.sql` | `messages_log_table.sql`, `event_log_table.sql` | `mysql.sql` (drops and recreates database `quickfix`, then `source`s the four table files), `user.sql`, `create.sh`, `create_user.sh`, `create.bat` |
| PostgreSQL | `src/sql/postgresql/` | `sessions_table.sql`, `messages_table.sql` | `messages_log_table.sql`, `event_log_table.sql` | `postgresql.sql` (`\i` of the four table files), `user.sql`, `create.sh`, `create_user.sh`, `create.bat` |
| MSSQL | `src/sql/mssql/` | `mssql.sql` (one file: the database, both store tables and the four log tables) | in `mssql.sql` | `create.bat` |

What you need to know about them without opening them (prose, verified
against the C++ in sections 1-2): `sessions` has the four key columns plus
`creation_time`, `incoming_seqnum`, `outgoing_seqnum`, primary key on the four
key columns; `messages` has the four key columns plus `msgseqnum`, `message`,
primary key on the four key columns plus `msgseqnum`. `messages_log`,
`event_log` and their `*_backup_log` twins (MySQL and MSSQL have both;
PostgreSQL has `event_backup_log` only) belong to `MySQLLog` /
`PostgreSQLLog` / `OdbcLog`; an adapter never touches them, create them only
if the deployment's C++ side also logs to SQL. The column types that matter to
an adapter are discussed where they bite: section 3 (`creation_time`) and
section 6, gotchas 5-7 and 13 (`message`, the seqnum columns, `CHAR(8)`,
key collation), and per backend in section 7.

**The binding's own dialect DDL.** The binding's SQL adapter does not use the
upstream files; it carries its own idempotent (`IF NOT EXISTS`) table statements of the same
layout (`DATETIME(3)` for MySQL so the binding's millisecond `creation_time`
survives, a plain-typed SQLite variant) in `sqlSchema(dialect)` of
`src/store/sql.ts` and as `sql/*.sql`, at the commit cited in "Provenance";
the reproduction in `sql-adapter-reference.md` elides them (the same rule as
for upstream: link, do not copy); those statements were tested against
`node:sqlite` and PostgreSQL. Interop with an upstream deployment means using
the upstream files, not these.

---

## 6. Gotchas, collected

1. **Seqnum columns hold the NEXT numbers**, not the last used (`1/1` for a new
   session). Writing "last sent" off-by-one makes the peer see a duplicate or a
   gap at the next logon.
2. **`incoming_seqnum` = `nextTargetMsgSeqNum`, `outgoing_seqnum` =
   `nextSenderMsgSeqNum`.** Inverting them is the classic interop bug; test 4.1
   of `test-checklist.md` catches it.
3. **`creation_time` is naive UTC text at second precision**: write whole
   seconds, read it through a fixed-format expression, never through the
   driver's or the server's default rendering (section 3: DateStyle, driver
   time zones, ODBC fraction overflow, rounding).
4. **SOH preserved**: the `message` column holds the wire bytes; a `TEXT`
   column is fine (SOH is a valid character), but never store a `|`-separated
   rendering.
5. **`message` column type/size** (details per backend in section 7):
   PostgreSQL `TEXT` is unbounded but cannot hold a NUL byte (`0x00`);
   MySQL `BLOB` caps a message at **65,535 bytes** (observed: error 1406 in
   strict mode, which fails `setMessage` and so the send; silent truncation to
   65,535 bytes without strict mode; upstream itself may store nothing and
   report success, section 2), and widening it to `MEDIUMBLOB` is safe for the C++
   side; MSSQL `TEXT` is single-byte in the database collation's code page, so
   it is not byte-preserving for non-ASCII text (section 7).
6. **Numeric types**: PostgreSQL `NUMERIC` comes back from `pg` as a string,
   MySQL `BIGINT UNSIGNED` as a number, string or bigint depending on driver
   options; convert and validate (`toSeq()` in `sql-adapter-reference.md`).
   The binding supports up to `2^53 - 1`; upstream's columns hold 64 bits.
7. **`CHAR(8)` for `beginstring`**: `FIXT.1.1` is exactly 8 characters; the
   column pads shorter values with spaces (observed `FIX.4.4 ` read back from
   SQL Server; PostgreSQL `char(n)` pads on output too; MySQL strips by
   default). Comparisons ignore the padding, so `WHERE beginstring = $1` works;
   trim if you ever read the key back.
8. **Upstream's `set()` "upsert" is INSERT-then-UPDATE with the message
   unescaped in the fallback**, which runs on ANY insert failure (section 2);
   use a parameterised native upsert, and reject when nothing was written.
9. **Upstream's `reset()` is two autocommitted statements**; the binding asks
   for one transaction where available, else DELETE first (contract F2).
10. **Only four key columns.** There are no `sendersubid`/`senderlocid`/
    `targetsubid`/`targetlocid` columns in QuickFIX C++'s tables. (QuickFIX/J's
    JDBC store uses a different, wider layout; it is not covered here and was
    not verified.)
11. **Upstream never deletes a `sessions` row** and never deletes messages
    except in `reset()`. Message tables grow until the next reset; a
    housekeeping job may delete rows with `msgseqnum < outgoing_seqnum - N`
    only if you accept that a resend request older than `N` will be gap-filled
    (derived; not something upstream does).
12. **`refresh()` upstream re-reads the row and INSERTs a missing one**
    (`PostgreSQLStore.cpp:320-323`: `m_cache.reset(now)`, then
    `populateCache()`, whose `else` branch at `:107-127` inserts `1/1`). The
    binding's `load()` must only read (contract B1); the engine does the
    INSERT itself. A row deleted underneath a running engine makes the next
    reload's `load()` (a `refresh()` or the reload that lifts a poison) return
    `null`, and `Reload()` in `cpp/js_message_store.cpp` then calls
    `create(sessionID, { now, 1, 1 })` and applies `1/1` once it resolves (a
    failing `create()` poisons the store): the numbering restarts, as upstream's
    does. So a missing row must read as `null`, never as an error, and
    `create()` must work outside preload too (contract B3, B5).
13. **Key comparison must be exact (case- and accent-sensitive).** QuickFIX
    compares session ids by their string form (`SessionID.h:113-119`), so
    `ACME` and `acme` are two sessions. Upstream's DDL declares no collation:
    MySQL's default `utf8mb4_0900_ai_ci` and SQL Server's `*_CI_AS` make the
    key columns case- (and on MySQL accent-) insensitive. Observed: the second
    session's `create()` fails with a duplicate key, and upstream's own stores
    silently share one row (the `cle` session read, overwrote and reset the
    `CLE` session's numbers and messages). PostgreSQL compares exactly. Fix on
    the four key columns of both tables, safe for the C++ side: MySQL
    `utf8mb4_0900_bin` (MariaDB: `utf8mb4_nopad_bin`; plain `utf8mb4_bin` is PAD
    SPACE, so `ACME` and `ACME ` would become equal), SQL Server
    `Latin1_General_BIN2` (section 7). Only needed when CompIDs can differ by
    case or accent alone; check before migrating whether rows already merged.
14. **`OdbcStore::get()` overruns its stack buffer on messages over 4,095
    bytes** (`OdbcStore.cpp:209-214` writes `messageBuffer[messageLength] = 0`
    with the total remaining length). Observed: ASan stack-buffer-overflow at
    10 KB (the plain build returned it intact by luck), a segfault at 200 KB.
    A C++ engine on SQL Server cannot safely serve a resend of a large message,
    whoever wrote the row. Node-side reads have no such limit.
15. **The database port is a `short` in upstream** (`DatabaseConnectionID.h:40,
    62`): a C++ store cannot reach a server on a port above 32,767 (observed:
    "Unable to connect ... :-10104"). Irrelevant to the adapter; relevant if the
    C++ engine is to share your database.

---

## 7. Per backend: the three clients upstream supports

Upstream ships exactly three SQL stores (`PostgreSQLStore`, `MySQLStore`,
`OdbcStore`; its `src/sql` has `postgresql/`, `mysql/` and `mssql/`, the last
being what `OdbcStore` is used with). Each subsection gives what an adapter on
the usual Node driver must do to read and write the same rows as the C++ store.
"Observed" = run against upstream's own store and the server versions listed
under "Verification" (top of this file). Statements are in the form a Node
driver takes; `<key>` is the four key columns compared to four parameters.

### 7.1 PostgreSQL (`PostgreSQLStore`, driver `pg`)

| Topic | What to do |
| --- | --- |
| Column types | `NUMERIC` seqnums (come back as strings: `Number()` + validate), `TIMESTAMP` without zone, `TEXT` message, `CHAR(8)`/`VARCHAR(64)` keys |
| `load` | `SELECT to_char(creation_time, 'YYYY-MM-DD HH24:MI:SS.MS') AS creation_time, incoming_seqnum, outgoing_seqnum FROM sessions WHERE <key>`; parse `creation_time + 'Z'` strictly (section 3: `::text` and `pg`'s default parser both depend on `DateStyle`/`TZ`) |
| Write `creation_time` | a UTC text parameter `YYYY-MM-DD HH:MM:SS`, never a JS `Date` (pg serialises a `Date` with the process offset, and a `TIMESTAMP` column keeps the local wall-clock: observed, `new Date('2026-10-22T10:11:12Z')` under `TZ=Europe/Paris` is stored as `12:11:12`) |
| `setMessage` | `INSERT INTO messages (<key cols>, msgseqnum, message) VALUES ($1,...,$6) ON CONFLICT (<key cols>, msgseqnum) DO UPDATE SET message = EXCLUDED.message` (needs upstream's primary key) |
| `reset` | `BEGIN`; `DELETE FROM messages WHERE <key>`; `INSERT INTO sessions ... ON CONFLICT (<key cols>) DO UPDATE SET ...`; `COMMIT`, all on ONE client from `pool.connect()` |
| Text | the database encoding (normally `UTF8`) holds any message except a NUL byte; observed byte-identical round trips both ways with SOH, quotes, backslash, `みずほ証券`, `é` |
| Keys | compared exactly; nothing to change |
| Timeouts | `statement_timeout` / `lock_timeout` on the store's own pool (`options: '-c statement_timeout=... -c lock_timeout=...'`) and `connectionTimeoutMillis`; checkout + connect + statement together shorter than `storeTimeoutMs`. No `query_timeout`: a statement sent without an answer is ended with `pg_terminate_backend(client.processID)` from another connection and confirmed gone in `pg_stat_activity` before the call rejects (contract I2) |
| Pool | the store's own `pg.Pool` (its short `statement_timeout` must not reach the application's queries), `idleTimeoutMillis: 0`, warmed before `create()`, replenished from the event loop (contract H4) |
| Threadpool | `pg` 8.x authenticates SCRAM-SHA-256 (the server default since PostgreSQL 14) through WebCrypto, on the libuv threadpool: every reconnect needs pool slots while each parked send holds one. `UV_THREADPOOL_SIZE` above the in-flight sends plus a margin (contract H4; observed: 6 sends in flight on the default 4 slots never recovered from a server restart) |
| Error events | `pool.on('error')` for idle clients, and `client.on('error')` on every client you hold checked out: `pg-pool` removes its listener during checkout (contract I9) |
| Shutdown | `pool.end()` waits without limit for a frozen server: bound it (contract I7) |
| Upstream defects | non-ISO `DateStyle` breaks its `creation_time` read (section 3); the `set()` fallback fails on a message containing `'` (section 2) |

### 7.2 MySQL (`MySQLStore`, driver `mysql2`; MariaDB noted)

| Topic | What to do |
| --- | --- |
| Column types | `BIGINT UNSIGNED` seqnums (number, string or bigint depending on `supportBigNumbers`/`bigNumberStrings`: convert + validate), `DATETIME` (no fraction: rounds), `BLOB` message (comes back as a `Buffer`: decode UTF-8), key columns in the database's default collation |
| `load` | `SELECT CAST(creation_time AS CHAR) AS creation_time, incoming_seqnum, outgoing_seqnum FROM sessions WHERE <key>` (fixed format regardless of `time_zone`), parse as UTC |
| `setMessage` | MySQL >= 8.0.19: `INSERT INTO messages (...) VALUES (?,?,?,?,?,?) AS new ON DUPLICATE KEY UPDATE message = new.message`. The removed adapter's `VALUES(message)` form still works but raises warning 1287 (deprecated) on 8.4; MariaDB has no row alias and keeps `VALUES()` |
| `reset` | `pool.getConnection()`, `beginTransaction()`, DELETE, the session upsert (same `AS new` form), `commit()`, `release()` |
| Prepared vs text | prefer `execute()` (server-side binding); `query()` with `?` escapes on the client, which is safe but is still string building |
| Message size | **`BLOB` holds 65,535 bytes.** Over that, strict mode (the 8.x default `STRICT_TRANS_TABLES`) rejects the insert (error 1406: `setMessage` rejects, the send resolves `false`, the message is never sent); without strict mode MySQL truncates silently (corrupt resend). If messages can exceed 64 KiB, `ALTER TABLE messages MODIFY message MEDIUMBLOB NOT NULL` (16 MiB): upstream reads it unchanged. Pin `sql_mode` to include `STRICT_ALL_TABLES` on your pool so truncation can never be silent |
| Keys | case- and accent-insensitive under the default collation (gotcha 13). If CompIDs may differ by case: `ALTER TABLE sessions MODIFY beginstring CHAR(8) COLLATE utf8mb4_0900_bin NOT NULL, MODIFY sendercompid VARCHAR(64) COLLATE utf8mb4_0900_bin NOT NULL, ...` for the four key columns of both tables (MariaDB: `utf8mb4_nopad_bin`), BEFORE two such sessions exist (afterwards their rows are already merged); observed `ACME`/`acme` as two rows afterwards. Queries joining these columns to other tables then need a matching `COLLATE` |
| Timeouts | `connectTimeout` and `innodb_lock_wait_timeout` per session, together shorter than `storeTimeoutMs`. MySQL has no server-side time limit for a write (`max_execution_time` covers read-only `SELECT`s only), so a stalled write is ended from outside: a client-side deadline must not settle the call by itself, since destroying the connection does not stop a statement the server already received. On a deadline, destroy the connection (a late reply must not be mistaken for the next call's), `KILL` its `threadId` from another connection and wait until it has left `information_schema.PROCESSLIST`, then reject (contract I2; derived) |
| Upstream defects | silent loss of a message over the column size, and the unescaped fallback (fails on `"`) (section 2); port above 32,767 unreachable (gotcha 15) |

### 7.3 SQL Server (`OdbcStore`, driver `mssql`/`tedious`)

The binding's removed SQL adapter has no SQL Server dialect; this subsection is
the verified replacement (statements from the eval adapters that passed the
checklist against SQL Server 2022).

| Topic | What to do |
| --- | --- |
| Column types | `NUMERIC(20,0)` seqnums (tedious returns a JS `number`, exact up to 2^53-1), `DATETIME` (1/300 s, rounds), `TEXT` message in the database collation's single-byte code page, `CHAR(8)`/`VARCHAR(64)` keys |
| Parameters | `request.input(name, type, value)` with `@name` placeholders. Bind the keys as `VarChar` (or `CAST(@k AS VARCHAR(64))`): an `NVarChar` parameter against a `VARCHAR` key under a `SQL_*` collation turns the primary-key seek into a scan |
| `load` | `SELECT CONVERT(VARCHAR(23), creation_time, 121) AS creation_time, incoming_seqnum, outgoing_seqnum FROM sessions WHERE <key>` (style 121 ignores `SET DATEFORMAT`/language), parse as UTC |
| Write `creation_time` | whole seconds, `CONVERT(DATETIME, @ct, 120)` with `@ct = 'YYYY-MM-DD HH:MM:SS'`. A fraction corrupts upstream's read (section 3, observed) |
| `setMessage` | one batch: `SET XACT_ABORT ON; BEGIN TRAN; UPDATE messages WITH (UPDLOCK, SERIALIZABLE) SET message = ... WHERE <key> AND msgseqnum = @seq; IF @@ROWCOUNT = 0 INSERT INTO messages (...) VALUES (...); COMMIT;` (or `MERGE ... WITH (HOLDLOCK)`). Per-session calls never overlap (contract H1), the lock hints cover a late timed-out write |
| `reset` | one batch with `SET XACT_ABORT ON; BEGIN TRAN; DELETE ...; UPDATE sessions ... ; IF @@ROWCOUNT = 0 INSERT ...; COMMIT;` so a cancel the server receives mid-batch rolls the whole batch back (a cancel that never reaches it: the `KILL` recipe in the Timeouts row) |
| Message text | **`TEXT` is not byte-preserving for non-ASCII.** Observed: a JS string bound as `NVarChar` stores `みずほ証券` as `?????` (and `é` as the single byte `0xE9`); UTF-8 bytes stored by another writer read back through tedious as mojibake. Byte-exact recipe, no schema change: write `CAST(@msg AS VARCHAR(MAX))` with `@msg` = `VarBinary(Buffer.from(message, 'utf8'))`, read `CAST(CAST(message AS VARCHAR(MAX)) AS VARBINARY(MAX))` and decode UTF-8 (observed exact both ways). Whether the C++ engine's rows hold UTF-8 bytes depends on ITS client: upstream through Microsoft's ODBC driver on Linux (C locale) changed some bytes (0x88, 0x9A to `?`) and read CP1252 back as UTF-8 mojibake; with a UTF-8 locale it stored `?????`. Before sharing the table with a C++ engine, look at the raw bytes of a row it wrote (`SELECT CAST(CAST(message AS VARCHAR(MAX)) AS VARBINARY(MAX)) FROM messages WHERE ...`) and match them; if only ASCII is ever sent, none of this matters |
| Keys | `*_CI_AS` collations are case-insensitive (gotcha 13). To change it the primary key must go first: drop the PK constraint, `ALTER TABLE sessions ALTER COLUMN sendercompid VARCHAR(64) COLLATE Latin1_General_BIN2 NOT NULL` (each key column), re-add the PK; same for `messages` (observed `ACME`/`acme` as two rows afterwards) |
| Timeouts | `connectionTimeout` and pool `acquireTimeoutMillis`, plus `requestTimeout`, together shorter than `storeTimeoutMs`; connect by IP or warm the pool (contract H4). A `requestTimeout` reaches the server as a cancel only if the server is reachable: when the request rejects without a server answer, `KILL` the connection's `@@SPID` from another connection and wait until it has left `sys.dm_exec_sessions` before rejecting (contract I2; derived) |
| Upstream defects | `creation_time` fraction overflow (section 3), `get()` stack overflow over 4,095 bytes (gotcha 14), code-page translation of the message (above). Its `set()` fallback escapes correctly |

---

## 8. Sharing the tables with a running C++ deployment (cutover, standby)

- **One engine per session at a time** (contract G3). Stop one with a graceful
  `await engine.stop()` (or the C++ `stop()`) before starting the other; nothing
  locks the row.
- **Upstream caches the state in memory** and reads the row only when the
  store is created (`populateCache()`) and on `refresh()`; `RefreshOnLogon=Y`
  calls `refresh()` at logon (`nextLogon()`, `Session.cpp:182-184`, and
  `generateLogon()`, `:677-679`). A C++ standby that was running while Node owned the session
  holds stale numbers: restart it at failover, or set `RefreshOnLogon=Y` on
  both sides. The binding reads the row at `create()` and on `refresh()` too.
- **Same session configuration on both sides** (`StartTime`/`EndTime`/
  `TimeZone`, `ResetOn*`, `PersistMessages`): `creation_time` is judged against
  the reading engine's session window (section 3).
- **What C++ will refuse to read back** is defined by its own defects, not by
  your adapter: messages over 64 KiB on MySQL (unstored or failed), over 4,095 bytes on SQL
  Server (memory-unsafe read), non-ISO `DateStyle` on PostgreSQL, a fraction in
  `creation_time` on SQL Server. Design the cutover around them (section 7).
- **The log tables** (`messages_log`, `event_log`, ...) belong to upstream's
  SQL *log*, not the store; the adapter neither writes nor needs them.
