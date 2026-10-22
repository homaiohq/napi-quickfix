# QuickFIX C++ message-store tables: schemas, statements, column mapping

Use this file when the adapter must read and write the tables an existing
QuickFIX C++ deployment already uses (its `PostgreSQLStore`, `MySQLStore` or
`OdbcStore`), or when you simply want a proven table layout.

## Provenance

- QuickFIX C++ **v1.16.0**, the tag pinned by this binding's `CMakeLists.txt`
  (`FetchContent_Declare(quickfix ... GIT_TAG v1.16.0)`). Files were read from
  the FetchContent checkout (`build/_deps/quickfix-src`, commit
  `2ce8a60667d95a55cdc57a210f165e19cb757126`, `project(... VERSION 1.16.0)`).
  Upstream paths are relative to the QuickFIX repository root. Line numbers are
  those of v1.16.0.
- No DDL is reproduced in this skill, neither upstream's (section 5 links to
  it) nor the binding's own: that one is `sqlSchema()` in `src/store/sql.ts`
  and `sql/*.sql` on the branch that ships the SQL adapter
  (`@homaiohq/napi-quickfix` branch `feat/js-message-store` @ `f802818`,
  identical at `6b8caa0`, the commit that added it), elided from the
  reproduction in `sql-adapter-reference.md`; it was tested against
  `node:sqlite` and PostgreSQL by that revision's SQL adapter test.

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
(`SessionID.h:33-52`), so two sessions that differ only in `SenderSubID` share a
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
parameters and a real upsert (`INSERT ... ON CONFLICT (...) DO UPDATE`,
`INSERT ... ON DUPLICATE KEY UPDATE`, `MERGE`).

## 3. Timestamps

- **Format**: `YYYY-MM-DD HH:MM:SS`, **UTC wall-clock, no zone marker, second
  precision**. The components come from a `UtcTimeStamp` (`getYMD`/`getHMS`,
  `PostgreSQLStore.cpp:110-113`); it is read back with
  `strptime("%Y-%m-%d %H:%M:%S")` and wrapped as `UtcTimeStamp(&tm)`
  (`FieldTypes.h:547`), i.e. interpreted as UTC again.
- **Column types**: PostgreSQL `TIMESTAMP` (without time zone), MySQL
  `DATETIME`, MSSQL `DATETIME`. None carries a zone, so the convention "the text
  is UTC" is the whole contract.
- **Driver trap**: `pg` parses `timestamp without time zone` as LOCAL time when
  it builds a `Date`; `mysql2` applies its `timezone` option. The binding's
  removed SQL adapter sidestepped both by selecting the column as text
  (`creation_time::text` / `CAST(creation_time AS CHAR)`) and parsing it as UTC
  (`fromSqlTime()` in `sql-adapter-reference.md`), and by writing
  `toISOString().replace('T', ' ').replace('Z', '')`. Do the same, or configure
  the driver's type parser; verify with test 1.11 of `test-checklist.md`.
- **Precision**: upstream writes seconds. The binding writes milliseconds
  (`.mmm`), which a `TIMESTAMP`/`DATETIME` column truncates or rounds
  harmlessly; the binding's own MySQL DDL (`sqlSchema('mysql')` / `sql/mysql.sql`,
  section 5) uses `DATETIME(3)` to keep them. Reading a
  second-precision value is fine: the only consumer is `checkSessionTime()`.
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

**https://github.com/quickfix/quickfix/tree/master/src/sql**

This skill does not reproduce them. When you need the exact DDL (column types,
primary keys, the log tables), fetch the files from that link, or ask the user
to paste them. For exact parity with the engine this binding pins, open the
`v1.16.0` tag rather than `master`:
https://github.com/quickfix/quickfix/tree/v1.16.0/src/sql (the same files are
in the local FetchContent checkout, `build/_deps/quickfix-src/src/sql/`). In
v1.16.0 the files are:

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
`event_log` and their `*_backup_log` twins belong to `MySQLLog` /
`PostgreSQLLog` / `OdbcLog`; an adapter never touches them, create them only
if the deployment's C++ side also logs to SQL. The column types that matter to
an adapter are discussed where they bite: section 3 (`creation_time`) and
section 6, gotchas 5-7 (`message`, the seqnum columns, `CHAR(8)`).

**The binding's own dialect DDL.** The binding's SQL adapter does not use the
upstream files; it carries its own idempotent (`IF NOT EXISTS`) table statements of the same
layout (`DATETIME(3)` for MySQL so the binding's millisecond `creation_time`
survives, a plain-typed SQLite variant) in `sqlSchema(dialect)` of
`src/store/sql.ts` and as `sql/*.sql`, on the branch that ships the adapter;
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
3. **`creation_time` is naive UTC text at second precision**; keep drivers from
   applying a local zone (section 3).
4. **SOH preserved**: the `message` column holds the wire bytes; a `TEXT`
   column is fine (SOH is a valid character), but never store a `|`-separated
   rendering.
5. **`message` column type/size**: PostgreSQL `TEXT` cannot hold a NUL byte
   (`0x00`), which a `RawData`-style field could in principle carry (upstream has
   the same limit: `PQescapeString`); MySQL `BLOB` is binary-safe and comes
   back as bytes (decode UTF-8); its 64 KiB cap is MySQL's documented `BLOB`
   limit (general database knowledge, not from this repository): use
   `MEDIUMBLOB` when you are not bound to an upstream deployment and send large
   messages. MSSQL `TEXT` is deprecated; `VARCHAR(MAX)` when you own the schema.
6. **Numeric types**: PostgreSQL `NUMERIC` comes back from `pg` as a string,
   MySQL `BIGINT UNSIGNED` as a number, string or bigint depending on driver
   options; convert and validate (`toSeq()` in `sql-adapter-reference.md`).
   The binding supports up to `2^53 - 1`; upstream's columns hold 64 bits.
7. **`CHAR(8)` for `beginstring`**: `FIXT.1.1` is exactly 8 characters; a
   `CHAR` column pads with spaces on some engines, so compare with the trimmed
   value if you ever read the key back.
8. **Upstream's `set()` "upsert" is INSERT-then-UPDATE with the message
   unescaped in the fallback** (section 2); use a parameterised native upsert.
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
12. **`refresh()` upstream re-reads the row and would INSERT a missing one**;
    the binding's `load()` must only read (contract B1), so a row deleted
    underneath a running engine makes the next `load()` return `null`, which a
    reload treats as "nothing to apply" (`if (o.present) Apply(o.state)` in
    `cpp/js_message_store.cpp` `Gate()`): the cached numbers are kept.
