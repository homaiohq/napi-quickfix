# Changelog

All notable changes to `@homaiohq/napi-quickfix` are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to the [versioning policy](./VERSIONING.md) (pre-1.0 SemVer).

Each release notes the **bundled QuickFIX version** — QuickFIX is statically linked into
the prebuilt binaries (see the [versioning policy](./VERSIONING.md#relationship-to-quickfixs-version)).

## [Unreleased]

### Added

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
- `DataDictionary.validate(msg, bodyOnly?)`, and the introspection methods
  `getVersion`, `getFieldName`, `getFieldTag`, `isField`, `isMsgType`.
- Argument validation on the field and group methods: a tag passed to a setter
  (and a `Group` count tag / delimiter / order entry) must be a positive integer,
  a tag passed to a reader and a group index must be an integer. Anything else
  throws a `TypeError` instead of being silently truncated (`1.5` → `1`,
  `NaN` → `0`) or emitted on the wire (`setField(0, 'x')` → `0=x`).

### Fixed

- Messages handed to engine handlers (`fromApp`, `toApp`, ...) now keep the
  repeating groups QuickFIX parsed with the session's dictionary, and groups added
  to an outbound message in `toApp` / `toAdmin` reach the wire. The bridge used to
  round-trip every message through its wire string without a dictionary, which
  flattened them.

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
