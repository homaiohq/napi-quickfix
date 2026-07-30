# Changelog

All notable changes to `@homaiohq/napi-quickfix` are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to the [versioning policy](./VERSIONING.md) (pre-1.0 SemVer).

Each release notes the **bundled QuickFIX version** — QuickFIX is statically linked into
the prebuilt binaries (see the [versioning policy](./VERSIONING.md#relationship-to-quickfixs-version)).

## [Unreleased]

## [0.1.0] - Unreleased

Initial release.

- Node-API (N-API v9) C++ binding for the QuickFIX FIX-protocol engine.
- Prebuilt binaries for Linux, macOS, and Windows (x64, arm64).
- Bundles **QuickFIX v1.16.0** (statically linked).
- Sub-second timestamp resolution is platform-dependent: microseconds on Linux
  (glibc **and** musl) and macOS, milliseconds on Windows, where QuickFIX has no
  microsecond clock available. A `TimestampPrecision=6` session on Windows therefore
  emits `.NNN000`.
