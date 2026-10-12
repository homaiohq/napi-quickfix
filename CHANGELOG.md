# Changelog

All notable changes to `@homaiohq/napi-quickfix` are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to the [versioning policy](./VERSIONING.md) (pre-1.0 SemVer).

Each release notes the **bundled QuickFIX version** — QuickFIX is statically linked into
the prebuilt binaries (see the [versioning policy](./VERSIONING.md#relationship-to-quickfixs-version)).

## [Unreleased]

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

### Fixed

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
