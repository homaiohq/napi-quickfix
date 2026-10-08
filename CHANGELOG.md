# Changelog

All notable changes to `@homaiohq/napi-quickfix` are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to the [versioning policy](./VERSIONING.md) (pre-1.0 SemVer).

Each release notes the **bundled QuickFIX version** — QuickFIX is statically linked into
the prebuilt binaries (see the [versioning policy](./VERSIONING.md#relationship-to-quickfixs-version)).

## [Unreleased]

### Added

- `FIELD` now covers every field in the bundled QuickFIX (generated from
  `FixFieldNumbers.h`, 6000+ names) instead of a hand-picked subset of 28. Entries
  are typed as number literals, so `FIELD.Password` is `554` and a misspelt name is
  a compile error. New `FieldName` type export.
- `@homaiohq/napi-quickfix/fields` subpath export: the `FIELD` table without loading
  the native addon. The package declares `sideEffects`, so bundlers can drop it.
- `yarn gen:fields` / `yarn gen:fields:check` regenerate and verify the table.

### Changed

- `FIELD` is a literal-typed object rather than `Record<string, number>`; indexing it
  with an arbitrary `string` is now a type error. `enums.FIELD` moved from the native
  addon to the generated table.

### Fixed

- The README `toAdmin` example used `FIELD.Username` / `FIELD.Password`, which were
  `undefined` at runtime; both now resolve.

## [0.1.0] - Unreleased

Initial release.

- Node-API (N-API v9) C++ binding for the QuickFIX FIX-protocol engine.
- Prebuilt binaries for Linux, macOS, and Windows (x64, arm64).
- Bundles **QuickFIX v1.16.0** (statically linked).
- Sub-second timestamp resolution is platform-dependent: microseconds on Linux
  (glibc **and** musl) and macOS, milliseconds on Windows, where QuickFIX has no
  microsecond clock available. A `TimestampPrecision=6` session on Windows therefore
  emits `.NNN000`.
