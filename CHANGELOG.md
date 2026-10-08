# Changelog

All notable changes to `@homaiohq/napi-quickfix` are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to the [versioning policy](./VERSIONING.md) (pre-1.0 SemVer).

Each release notes the **bundled QuickFIX version** — QuickFIX is statically linked into
the prebuilt binaries (see the [versioning policy](./VERSIONING.md#relationship-to-quickfixs-version)).

## [Unreleased]

### Added

- Repeating groups. A new `Group` class (count tag, delimiter tag, optional explicit
  field order, mirroring `FIX::Group(field, delim, order[])`) with
  `setField`/`getField`/`hasField`, nested `addGroup`/`getGroup`/`groupCount`, and
  `toString`/`toPretty`. `Message` gains `addGroup`, `getGroup` (1-based, QuickFIX
  convention), `groupCount` and `hasField`. Header groups such as `NoHops` are routed
  to the header like header fields are.
- Explicit body field order: `new Message(raw?, { order })` / `createMessage(fields,
  { order })`, mirroring `FIX::Message(headerOrder, trailerOrder, order)`. Listed tags
  are written in that sequence, any other tag after them numerically. Without it the
  body sorts numerically, as before.
- `Message.parse` / `new Message(raw, opts)` accept a `dictionary` option so repeating
  groups in a raw string are parsed as groups instead of flat repeated tags.

### Changed

- Inbound handlers (`fromApp`, `fromAdmin`, `toApp`, `toAdmin`) now receive the
  engine's own message. On a session with `UseDataDictionary=Y` repeating groups are
  therefore parsed as groups: a tag that lives inside a group (e.g. `PartyID` on an
  ExecutionReport) is read with `getGroup`, and `getField` on it throws
  `FieldNotFound` where the flat re-parse used to return the last occurrence.
- Tags passed to any accessor must be integers (`TypeError` otherwise); set paths and
  the `Group` constructor additionally require them to be positive. Tags in an `order`
  must lie in `1..100000`.

### Fixed

- The application bridge now hands `FIX::Message` copies across the thread boundary
  instead of wire strings. With a `toApp`/`toAdmin` handler registered, an outbound
  message was re-parsed from its string without the session dictionary, which flattened
  every repeating group and re-sorted the body before it was sent.
- CMake re-scans `cpp/*.cpp` on every build (`CONFIGURE_DEPENDS`), so a new source file
  is linked without a manual reconfigure.

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
