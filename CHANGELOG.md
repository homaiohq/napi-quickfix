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
  groups in a raw string are parsed as groups instead of flat repeated tags, and a
  `sessionDictionary` option for FIXT 1.1 / FIX 5.x strings, whose header and trailer
  live in a separate dictionary (`FIXT11.xml`) as the engine uses it.
- The engine only forwards a callback to JS while a handler or an event listener
  exists for it. Without one the QuickFIX thread returns pass-through immediately,
  without copying the message or waiting on the event loop, so a session that only
  handles `fromApp` pays nothing for its heartbeats and test requests.

### Changed

- Inbound handlers (`fromApp`, `fromAdmin`, `toApp`, `toAdmin`) now receive the
  engine's own message. On a session with `UseDataDictionary=Y` repeating groups are
  therefore parsed as groups: a tag that lives inside a group (e.g. `PartyID` on an
  ExecutionReport) is read with `getGroup`, and `getField` on it throws
  `FieldNotFound` where the flat re-parse used to return the last occurrence.
- Tags passed to any accessor, reads included, must be positive integers (`TypeError`
  otherwise): QuickFIX's ordered sorter indexes an array by tag, so a negative tag
  looked up on a map with an explicit order read out of bounds. Tags in an `order` must
  be distinct and lie in `1..100000`; a repeated tag is a `TypeError` instead of
  silently keeping one occurrence.
- `getField` / `setField` / `hasField` also find a non-standard tag that the message
  already holds in its header or trailer, such as a custom header field declared by
  the session's dictionary. Before, such a field was parsed into the header by the
  engine but looked up in the body by the wrapper.
- `new Group(countTag, ...)` and `new Message(raw)` throw a `TypeError` for a
  wrong-typed first argument instead of adopting it as a native handle and failing on
  the first method call.

### Fixed

- The application bridge now hands `FIX::Message` copies across the thread boundary
  instead of wire strings. With a `toApp`/`toAdmin` handler registered, an outbound
  message was re-parsed from its string without the session dictionary, which flattened
  every repeating group and re-sorted the body before it was sent.
- A nested group's delimiter survives every copy. QuickFIX's `FieldMap` copy slices
  nested instances to plain field maps, so `getGroup` on a copied group (after
  `addGroup`, inside a handler, or after `sendToTarget`) guessed the delimiter from
  the first field; the wrapper now clones instances as `FIX::Group` objects.
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
