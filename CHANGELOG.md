# Changelog

All notable changes to `@homaiohq/napi-quickfix` are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to the [versioning policy](./VERSIONING.md) (pre-1.0 SemVer).

Each release notes the **bundled QuickFIX version** — QuickFIX is statically linked into
the prebuilt binaries (see the [versioning policy](./VERSIONING.md#relationship-to-quickfixs-version)).

## [Unreleased]

### Added

- `Message.addGroup(countTag, entry)` appends one repeating-group entry, for example
  `NoMDEntryTypes` or `NoRelatedSym` on a MarketDataRequest. Entry fields keep the
  given order and QuickFIX sets the count tag. Before this, `setField` overwrote a
  repeated tag and the body was sorted by tag number, so a valid group could not be
  sent. Nested groups are not supported yet, and a `toApp`/`toAdmin` handler that
  edits a message still flattens its groups.

### Fixed

- Outbound application messages were always re-parsed after `toApp`, even with no
  `toApp` handler or one that only read the message. The re-parse has no data
  dictionary, so it sorted the body by tag number and broke repeating groups on the
  wire (TT rejected a MarketDataRequest with "Tag55/Symbol missing/misplaced"). The
  bridge now writes a message back only when a `toApp`/`toAdmin` handler changed it.

## [0.1.0] - Unreleased

Initial release.

- Node-API (N-API v9) C++ binding for the QuickFIX FIX-protocol engine.
- Prebuilt binaries for Linux, macOS, and Windows (x64, arm64).
- Bundles **QuickFIX v1.16.0** (statically linked).
- Sub-second timestamp resolution is platform-dependent: microseconds on Linux
  (glibc **and** musl) and macOS, milliseconds on Windows, where QuickFIX has no
  microsecond clock available. A `TimestampPrecision=6` session on Windows therefore
  emits `.NNN000`.
