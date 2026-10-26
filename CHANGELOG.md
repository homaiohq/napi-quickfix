# Changelog

All notable changes to `@homaiohq/napi-quickfix` are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to the [versioning policy](./VERSIONING.md) (pre-1.0 SemVer).

Each release notes the **bundled QuickFIX version** — QuickFIX is statically linked into
the prebuilt binaries (see the [versioning policy](./VERSIONING.md#relationship-to-quickfixs-version)).

## [Unreleased]

Bundles **QuickFIX v1.16.0** (statically linked, with three upstream fixes carried: see
"Fixed").

### Added

- `MessageStoreAdapter`: a pluggable message store. Pass an adapter object (one per
  engine, keyed by `SessionID`: `load`/`create`/`setSeqNums`/`setMessage`/`getMessages`/
  `reset`/`close?`, each sync or async) to the new `Initiator.create()` /
  `Acceptor.create()` factories to persist session state write-through in any database
  Node can reach, through your own driver and pool. The factories preload every
  session's state before constructing the engine, and also accept `'file'`/`'memory'`.
  `storeTimeoutMs` (default 30 s, `0` disables) bounds each adapter call. Failures are
  reported through the new `'storeError'` event (`sessionID, method, error, poisoned,
  late`); a failed `setMessage` makes the send resolve `false`, a failed `setSeqNums`/
  `reset` poisons the session's store until it has been reloaded, and a write the
  engine gave up on is fenced so it cannot land under a later engine of the session.
  `MapMessageStore` (in-memory reference implementation) is exported. The contract,
  the failure policy, the threadpool and latency rules and `stop()`'s behaviour are in
  [README "Message store"](./README.md#message-store).
- `.agents/skills/custom-message-store` (in the repository, not the npm package): an
  agent skill for writing a custom `MessageStoreAdapter` (the contract as sourced rules,
  the column mapping onto QuickFIX v1.16.0's `sessions`/`messages` tables for interop
  with links to the upstream DDL, driver guidance from a PostgreSQL adapter trial
  (issue #35), a test checklist).
- `SessionSettings.getSessions(connectionType?)`: only the sessions an engine of that
  type would create.
- `scripts/tsan.sh` and a ThreadSanitizer CI job over the suite, failing on a race in
  this addon's code or a QuickFIX race not known to be upstream's
  (`scripts/tsan-gate.py`), and refusing a build the sanitizer did not instrument.

### Changed

- **Breaking:** `Session.logon()`, `Session.logout()`, `Session.refresh()`,
  `Session.setNextSenderMsgSeqNum()` and `Session.setNextTargetMsgSeqNum()` now return
  a `Promise<void>` and run on a libuv worker, like `sendToTarget()`: they take the
  session-state mutex the engine holds across a store write, which with a
  `MessageStoreAdapter` waits on the event loop, so taking it on the main thread
  deadlocked the process. Migration: `await` them (or `.catch()` them). Calls on one
  session still run in program order whether awaited or not, so `logout(); logon();`
  ends enabled. Argument validation still throws synchronously (`TypeError`/
  `RangeError`); `SessionNotFound` is now a rejection, which a `'logout'` listener fired
  by `stop()` can see. The getters, state queries and option getters/setters stay
  synchronous.
- `Initiator.isLoggedOn()` with no argument reads each session's state instead of
  taking the engine mutex, which QuickFIX holds while a connecting session reads the
  store: with an adapter, polling it froze the event loop for `storeTimeoutMs` on each
  reconnect.

### Fixed

- Every `start()` and `stop()` call rooted one `Promise` for the rest of the process (a
  deferred created up front and never settled on the worker path). The promise is now
  built only where it is settled.
- The addon could not be loaded in a `worker_threads` Worker: the exported classes'
  constructors were module statics shared by every environment, so each Worker
  overwrote them (heap corruption, a V8 fatal check at Worker teardown, a segfault).
  They now live in per-environment instance data.
- `worker.terminate()` aborted the whole process when an engine callback was being
  dispatched in the Worker at that moment. The bridge now lets such a callback pass
  through, as it does after the engine's own teardown (see `ARCHITECTURE.md` §4).
- A process that called `process.exit()`, or died of an uncaught exception or an
  unhandled rejection, never exited when a `sendToTarget()` or a `stop()` was in flight
  (a pool thread parked on a JS round trip was never woken). The module now releases
  those threads from `process.on('exit')`; from then on the exiting engines run no
  handler and act on nothing a handler has not seen (README "Process exit").
- An initiator whose session was disconnected by an inbound message (a peer's Logout,
  a failed store write) generated and stored a Logon it never sent (the peer saw a gap)
  and emitted `'logout'` twice. A QuickFIX v1.16.0 bug with any store; the build now
  carries the one-line upstream fix (no Logon without a connection).
- An initiator session could stay disconnected for good, its sends resolving `true`
  but never delivered, when it was disconnected while handling inbound data in the same
  network-loop pass as another session's due reconnect: the reconnect reused the
  dropped socket's number and the queued disconnect tore it down instead. A QuickFIX
  v1.16.0 bug with two or more sessions on any store (an acceptor could be hit the same
  way); a store call stalling the network thread past `ReconnectInterval` made it
  near-certain. The build now carries a `SocketMonitor` fix: a dropped socket is closed
  only once its disconnect has been processed.
- A store failure on the sequence-number increment QuickFIX makes for a queued Logon or
  ResendRequest (a peer whose Logon was too high, then a GapFill ending exactly at it)
  terminated the process: QuickFIX v1.16.0 makes that increment outside its own error
  handling. A `FileStore` write error was enough; a `MessageStoreAdapter` that rejects,
  times out or is poisoned at that moment made it reachable. The build now carries a
  fix: the session logs the error and disconnects, like any other inbound store failure.
- The npm package shipped every `CMakeLists.txt` of a local build tree when packed from
  a working tree. The `files` entry now names the root file only.

### Known QuickFIX limitations

Two file-descriptor leaks found by the same audit are in QuickFIX itself and are not
patched by this binding (it carries three upstream fixes, see "Fixed" and
`ARCHITECTURE.md`):

- An `Acceptor` whose `start()` fails because its port is already bound leaks the
  listening socket it created (`socket_createAcceptor` returns without closing it on a
  failed `bind`/`listen`): one fd per failed start.
- An `Initiator` stopped while a connection attempt is still pending leaks that socket
  (`SocketMonitor`'s destructor closes its read sockets and signal pipe but not the
  sockets still in its connect set): one fd per stop that lands in that window, which
  with an unreachable counterparty is most stops. Confirmed against bare `libquickfix`
  with no binding involved.

## [0.3.1] - 2026-10-20

Bundles **QuickFIX v1.16.0** (statically linked, unchanged).

### Fixed

- `Initiator`/`Acceptor` instances were never garbage-collected, started or not. The
  native bridge held the handlers object (which closes over the `Engine`) for the
  wrap's whole life, a cycle through native memory the GC cannot see, so every engine
  kept its `Engine` object, listeners, both factories and, once a message had passed
  through it, the parsed data dictionary of each session (about 3 MB per
  acceptor+initiator pair with `FIX44.xml`). The bridge now drops the handlers and
  the dictionaries as soon as the engine is destroyed: when `stop()` settles (after
  the `'logout'` events a graceful stop fired have been dispatched), or right after a
  force stop or a failed force stop aborted the callback queue. A started engine is
  still kept alive by its handlers until it is stopped, like a `net.Server`.

## [0.3.0] - 2026-10-14

Bundles **QuickFIX v1.16.0** (statically linked, unchanged).

### Added

- `createTlsTunnel`: a built-in, stunnel-style TLS tunnel for initiators. It listens on
  a loopback port that `SocketConnectHost`/`SocketConnectPort` point at, and carries each
  connection to the counterparty over Node's `tls.connect` (mTLS, SNI, certificate and
  hostname verification). It emits `'secureConnect'`/`'tlsError'`, closes idempotently,
  and supports `await using`. QuickFIX's OpenSSL-based SSL engines are still not built,
  so prebuilds are unchanged. Acceptor-side TLS is not provided; see the README for why
  and for the alternatives.

## [0.2.0] - 2026-10-12

Bundles **QuickFIX v1.16.0** (statically linked, unchanged).

### Added

- Every FIX value constant of the bundled QuickFIX, generated from `FixValues.h`
  (690 groups, 5781 values for v1.16.0): one frozen object per field (`MsgType`, `Side`,
  `OrdType`, `TimeInForce`, `ExecType`, `OrdStatus`, `SecurityType`, ...) with string
  literal types, plus a `VALUES` tree keyed by field name and the `ValueGroups` /
  `ValueGroupName` types. Names map QuickFIX's `Side_SELL_SHORT` to `Side.SellShort`,
  lower-casing every word, acronyms included (`SecurityIDSource_ISIN_NUMBER` →
  `SecurityIDSource.IsinNumber`); `MsgType` names are kept verbatim.
- `@homaiohq/napi-quickfix/values` subpath export: every value group by name, without
  loading the native addon and, in the ESM build, tree-shakeable per group.
- `OrdType`, `TimeInForce` and `VALUES` as named root exports; `enums` now carries every
  value group next to `FIELD`.
- `yarn gen:values` / `yarn gen:values:check` regenerate and verify the table, like
  `gen:fields`.
- `Session`: a handle on a live `FIX::Session`, obtained from `engine.getSession(id)` or
  the module-level `lookupSession(id)`. Sync state getters (`isLoggedOn`, `isEnabled`,
  `sentLogon`, `sentLogout`, `receivedLogon`, `isInitiator`, `isAcceptor`,
  `isSessionTime(now?)`, `isLogonTime(now?)`), sequence-number access
  (`getExpectedSenderNum`, `getExpectedTargetNum`, `setNextSenderMsgSeqNum`,
  `setNextTargetMsgSeqNum`), getters/setters for the runtime options (`ResetOnLogon`,
  `ResetOnLogout`, `ResetOnDisconnect`, `RefreshOnLogon`, `CheckCompId`, `CheckLatency`,
  `MaxLatency`, `LogonTimeout`, `LogoutTimeout`, `PersistMessages`,
  `SendRedundantResendRequests`, `ValidateLengthAndChecksum`, `SendNextExpectedMsgSeqNum`,
  `IsNonStopSession`, `TimestampPrecision`), and control: `logon()`, `logout(reason?)`
  and `refresh()`. Every member is synchronous (and therefore takes effect in program
  order); QuickFIX's `Session::disconnect()`/`reset()` are deliberately not exposed, as
  they are only safe on the engine's own network thread. The handle re-resolves the
  session on every call and throws `QuickFixError{fixErrorName: 'SessionNotFound'}`
  once the engine it was obtained from has been stopped — also after a new engine has
  been created with the same `SessionID`; it never crosses over to another engine's
  session. The sequence-number setters are for a quiet session: they are not
  serialised against a message in flight on that session (see the `Session` docs).
- Module functions `lookupSession(id)`, `doesSessionExist(id)`, `getSessions()` and
  `numSessions()` over every session in the process.
- `Initiator`/`Acceptor`: `getSessions()` (the configured `[SESSION]`s),
  `getSession(id)`, and `isLoggedOn(sessionID?)` — the no-argument form keeps its
  engine-wide meaning; a `sessionID` argument that is not a `SessionID` is a
  `TypeError`, never a fallback to the engine-wide form.
- `sendToTarget(message, qualifier?)` overload that resolves the session from the
  message's own header (`BeginString`/`SenderCompID`/`TargetCompID`), alongside the
  existing `sendToTarget(message, sessionID)`. A `SessionID` from the other build of
  the package (ESM vs. CJS) is accepted; any other non-string target is a `TypeError`,
  never routed by the header instead.
- Constructing an `Initiator`/`Acceptor` with a `SessionID` that is already live in the
  process (owned by another engine that has not been stopped) throws a `QuickFixError`
  `ConfigError` "Duplicate Session". QuickFIX itself only rejects duplicates within one
  settings object and would otherwise let the second engine silently shadow the first
  in its process-wide session registry. A constructor that fails on a later `[SESSION]`
  deletes the sessions QuickFIX had already created for it (QuickFIX leaks them), so a
  failed construction does not lock those ids out for the rest of the process, and
  closes the engine-level log QuickFIX had already opened for it (with `log: 'file'`,
  two file streams per failed construction, which QuickFIX also leaks).
- Repeating groups. New `Group` class (one entry of a repeating group, built from
  its count tag and delimiter, with an optional explicit field order) and group
  methods on `Message` and `Group`: `addGroup`, `getGroup`, `replaceGroup`,
  `removeGroup`, `hasGroup`, `groupCount`. Groups nest. Indices are 1-based as in
  QuickFIX; `getGroup` returns a snapshot copy, so edits are written back with
  `replaceGroup`.
- Dictionary-aware parsing: `Message.parse(raw, { dictionary })` and the
  `{ sessionDictionary, applicationDictionary }` pair parse repeating groups
  structurally. A parse without a dictionary stays flat, as before.
- `FieldMap` surface on `Message` (and `Group`): `isSetField`, `removeField`,
  `getFieldIfSet`, `isEmpty`, `totalFields`, `clear`, `fields()` (plus
  `headerFields()` / `trailerFields()` on `Message`) and `[Symbol.iterator]`.
  `Message.isEmpty()` and `clear()` cover the header, body and trailer, as in
  QuickFIX.
- `DataDictionary.validate(msg, bodyOnly?)`, and the introspection methods
  `getVersion`, `getFieldName`, `getFieldTag`, `isField`, `isMsgType`. `bodyOnly`
  is QuickFIX's `validate(msg, true)`: it skips the BeginString version check and
  the tag/value checks of header and trailer fields, but still requires every
  field the dictionary marks required, header and trailer included.
- Group argument checks. A `Group` delimiter or order entry above 2^20 throws a
  `RangeError`, since QuickFIX allocates `largestTag + 1` ints per group order,
  and an order that lists a tag twice throws a `TypeError` (QuickFIX would rank
  it by its last position, which can move the delimiter off the front).
  `replaceGroup` and `removeGroup(index, tag)` throw `FieldNotFound` for a
  missing entry, index 0 included, and `hasGroup(0, tag)` is `false`: QuickFIX
  has no lower bound on group indices and would silently drop the call.
  `replaceGroup` throws a `TypeError` when the replacement's delimiter differs
  from the stored entry's, and `addGroup` when the new entry's delimiter differs
  from the stored entries' (it would serialize as part of the previous entry,
  leaving the count wrong); an entry QuickFIX copied as a plain field map (a
  message it queued out of order) has no known delimiter and takes any entry.
  `g.replaceGroup(1, g)` replaces the entry with a copy of `g` taken before the
  entry is touched.

### Changed

- `MsgType`, `Side` and `enums` are sourced from the generated table instead of the
  hand-curated subset in the native addon. Their keys and values are unchanged, but they
  are now typed as literals (`Side.Buy` is `'1'`, a misspelt name is a compile error) and
  `Enums` is the precise tree type rather than a string-indexed record.
- **Breaking (types only):** `MsgType`, `Side` and `enums` lose their `string` index
  signatures, and the exported `Enums` type is now the precise tree
  (`ValueGroups & { FIELD }`) instead of `Readonly<Record<string, EnumGroup>>`. Dynamic
  lookups such as `MsgType[nameFromConfig]` or `enums[groupName][valueName]` with
  `string` keys no longer compile; widen the group to `EnumGroup`
  (`const g: EnumGroup = MsgType`; every group and `FIELD` is assignable to it) or narrow
  the key (`enums[groupName as ValueGroupName]`). Code that typed a parameter as `Enums`
  and iterated it with `string` keys needs the same widening.
- The native addon no longer exports `enums` (`cpp/enums.cpp` removed); the TypeScript
  public surface is a superset of what it provided.
- `dist/` no longer ships `.js.map` / `.d.ts.map` files. `src/` is not published, so they
  could never resolve, and they roughly doubled the footprint of the generated tables.
- An engine now destroys its QuickFIX engine (and therefore its sessions) when `stop()`
  settles, instead of when the JS object is garbage-collected. A stopped engine could not
  be restarted before either; the visible differences are that `Session` handles fail
  deterministically with `SessionNotFound` after `stop()`, and that a new
  `Initiator`/`Acceptor` configured with the same `SessionID`s can be created right after
  stopping the old one. A graceful `stop()` settles only after the `'logout'` events it
  triggered have been delivered, so a `'logout'` listener can still reach the session
  (`engine.getSession(id)`); `stop(true)` discards the events still queued and destroys
  the engine immediately. If `stop()` fails, the engine is left intact (so it can be
  stopped again) rather than destroyed with its network thread possibly still running;
  as before, its events stop being delivered and it no longer keeps the event loop
  alive.
  A `sendToTarget()` that has already reached its session when `stop()` is called
  completes before the sessions are destroyed; one that has not reached it by then is
  refused with `SessionNotFound` rather than run against the engine that is gone. A
  send is bound to the engine that owns the session when it is called, so it never
  runs through a new engine created with the same `SessionID` afterwards.
  `engine.getSession()` / `engine.isLoggedOn(id)` keep
  answering until `stop()` settles (e.g. from a `'logout'` listener fired by a graceful
  stop). A `stop()` called while one is in flight returns that stop's Promise, so it
  never settles before the sessions are gone. `stop()` on a never-started engine is
  now asynchronous like every other `stop()`.
- `Session` int option setters (`setLogonTimeout`, `setLogoutTimeout`, `setMaxLatency`)
  throw `RangeError` for a non-integer or a value outside the int32 range, consistent
  with `setNextSenderMsgSeqNum` / `setTimestampPrecision` (previously `TypeError` for a
  non-integer and undefined behaviour for an out-of-range value). `isSessionTime(now)` /
  `isLogonTime(now)` likewise throw `RangeError` for an invalid `Date` or a time outside
  the `Date` range, instead of `TypeError` for the former and undefined behaviour for
  the latter.
- **Breaking:** messages handed to engine handlers (`fromApp`, `toApp`, ...) now
  keep the repeating groups QuickFIX parsed with the session's dictionary, and
  groups added to an outbound message in `toApp` / `toAdmin` reach the wire. The
  bridge used to round-trip every message through its wire string without a
  dictionary, which flattened them. With the default `UseDataDictionary=Y`, a
  field inside a group (e.g. `PartyID` under `NoPartyIDs`) is no longer a body
  field: `getField(448)` now throws `FieldNotFound`; read it with
  `getGroup(1, FIELD.NoPartyIDs).getField(FIELD.PartyID)`.
- **Breaking:** a `NaN` or `±Infinity` field value (`Message.setField` /
  `setHeaderField` / `setTrailerField`, `Group.setField`) throws a `RangeError`
  instead of being written as `NaN` / `Infinity`.
- **Breaking:** field tags and group indices are validated. A tag passed to a
  setter (and a `Group` count tag / delimiter / order entry) must be a positive
  integer; a tag passed to a reader (`Message`, `Group`, and
  `DataDictionary.getFieldName` / `isField`) and a group index must be an
  integer. Anything else throws a `TypeError` instead of being silently
  truncated (`1.5` → `1`, `NaN` → `0`) or emitted on the wire
  (`setField(0, 'x')` → `0=x`).
- **Breaking:** `getField` / `isSetField` / `getFieldIfSet` / `setField` /
  `removeField` route a field that only the session dictionary declares as a
  header or trailer field (a user-defined tag, say) to that section, as the
  parser does, instead of to the body. The dictionary is the one a message was
  parsed with (`sessionDictionary` / `dictionary`) or, for a message handed to
  an engine handler, the session's; such a field removed and set again in
  `toApp` goes back to the header. On a message without one, a field the header
  or trailer already holds is edited in place instead of getting a body
  duplicate; a tag held nowhere is still a body field.

### Fixed

- `Message.setField` / `setHeaderField` / `setTrailerField` (and `Group.setField`)
  wrote very small or very large numbers in exponent notation (`44=1e-7`,
  `44=1e+21`), which FIX numeric fields do not allow. Numbers are now written in
  plain decimal (`0.0000001`).
- A `toApp`/`toAdmin`/`fromApp`/`fromAdmin` callback that started on a network thread at
  the same instant the engine was torn down could register its reply channel after the
  teardown had woken the pending callbacks, and then wait on the frozen event loop
  (a hang on exit, or in `stop()`). The registration now re-checks the teardown flag
  under the same lock the wake-up takes, so the callback passes through instead.
- `Acceptor.stop()` could crash the process with `SIGSEGV` (#24). QuickFIX's
  `SocketAcceptor` closes its socket server from the stopping thread while its own
  network thread, woken by that close, closes the server again and deletes it; a stopping
  thread preempted mid-close then read the freed server. The acceptor's network thread
  now owns that shutdown alone, which also stops listening sockets from being closed
  twice. In exchange, stopping an acceptor now takes up to one second longer: the network
  thread notices the stop on its next 1 s poll timeout, as QuickFIX's initiator already does.
- A nested group entry keeps its delimiter through every copy (`addGroup`,
  `replaceGroup`, `getGroup`, the handler and `sendToTarget` paths), so an entry
  that is empty or lacks its delimiter field reports the right `delim` and
  `getGroup` no longer throws on it. QuickFIX copies nested entries as plain field
  maps; the binding now rebuilds them typed.

## [0.1.0] - 2026-10-08

Initial release. Bundles **QuickFIX v1.16.0** (statically linked).

- Node-API (N-API v9) C++ binding for the QuickFIX FIX-protocol engine: the session
  engine (`Initiator` / `Acceptor` with synchronous application handlers) and the pure
  layer (`Message`, `SessionSettings`, `DataDictionary`, `SessionID`).
- Prebuilt binaries for Linux x64 (glibc and musl/Alpine), macOS x64 + arm64, and
  Windows x64; other platforms build from source at install time.
- `FIELD` covers every field in the bundled QuickFIX (generated from
  `FixFieldNumbers.h`, 6000+ names), typed as number literals so a misspelt name is a
  compile error. `FieldName` type export.
- `@homaiohq/napi-quickfix/fields` subpath export: the `FIELD` table without loading
  the native addon. The package declares `sideEffects`, so bundlers can drop it.
- Sub-second timestamp resolution is platform-dependent: microseconds on Linux
  (glibc **and** musl) and macOS, milliseconds on Windows, where QuickFIX has no
  microsecond clock available. A `TimestampPrecision=6` session on Windows therefore
  emits `.NNN000`.
