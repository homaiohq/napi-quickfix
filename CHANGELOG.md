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
  `ValueGroupName` types. Names map QuickFIX's `Side_SELL_SHORT` to `Side.SellShort`;
  `MsgType` names are kept verbatim.
- `@homaiohq/napi-quickfix/values` subpath export: every value group by name, without
  loading the native addon and tree-shakeable per group.
- `OrdType`, `TimeInForce` and `VALUES` as named root exports; `enums` now carries every
  value group next to `FIELD`.
- `yarn gen:values` / `yarn gen:values:check` regenerate and verify the table, like
  `gen:fields`.

### Changed

- `MsgType`, `Side` and `enums` are sourced from the generated table instead of the
  hand-curated subset in the native addon. Their keys and values are unchanged, but they
  are now typed as literals (`Side.Buy` is `'1'`, a misspelt name is a compile error) and
  `Enums` is the precise tree type rather than a string-indexed record.
- The native addon no longer exports `enums` (`cpp/enums.cpp` removed); the TypeScript
  public surface is a superset of what it provided.

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
