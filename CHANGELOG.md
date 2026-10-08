# Changelog

All notable changes to `@homaiohq/napi-quickfix` are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to the [versioning policy](./VERSIONING.md) (pre-1.0 SemVer).

Each release notes the **bundled QuickFIX version** — QuickFIX is statically linked into
the prebuilt binaries (see the [versioning policy](./VERSIONING.md#relationship-to-quickfixs-version)).

## [Unreleased]

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
