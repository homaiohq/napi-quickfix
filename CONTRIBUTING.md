# Contributing to @homaiohq/napi-quickfix

Thanks for your interest in improving this project! This is a Node-API (N-API)
C++ binding for the [QuickFIX](https://github.com/quickfix/quickfix) FIX-protocol
engine.

## Prerequisites

- **Node.js** LTS **22**, **24** or **26**
- **CMake** (>= 3.12)
- A **C++17** compiler (GCC, Clang, or MSVC)
- **Corepack** (bundled with Node) to provision the pinned Yarn version
- **Docker** (optional) — only to reproduce the Alpine/musl build locally

QuickFIX itself is **not** vendored: it is fetched at build time via CMake
`FetchContent` (pinned to `v1.16.0`). The sources are downloaded automatically
on first configure, so an internet connection is required for the first build.

## Getting started

```sh
corepack enable        # provisions the Yarn version pinned in package.json
yarn install           # installs dependencies (node-modules linker)
yarn build             # native (cmake-js) + dual ESM/CJS TypeScript build
yarn test              # runs the node:test suite
```

Useful scripts:

- `yarn build:native` — build only the native addon (`cmake-js`).
- `yarn build:ts` — build only the TypeScript (ESM + CJS).
- `yarn clean` — remove `dist/` and `build/`.
- `yarn prebuild` — produce prebuilt binaries for the current platform. On Linux the
  binary is libc-tagged (`node.napi.glibc.node` / `node.napi.musl.node`); detection is
  automatic and the script *fails* rather than guessing. Override with `PREBUILD_LIBC`.

## Building for Alpine / musl

CI builds a separate musl-tagged prebuild inside `node:22-alpine`. To reproduce it
locally without disturbing your glibc `build/` and `node_modules/`:

```sh
docker run --rm -v "$PWD":/src:ro -w /w node:22-alpine sh -euxc '
  apk add --no-cache build-base cmake git
  mkdir -p /w && tar -C /src -cf - --exclude=./build --exclude=./node_modules \
    --exclude=./dist --exclude=./prebuilds --exclude=./.git . | tar -C /w -xf -
  mkdir -p /cp && corepack enable --install-directory /cp && export PATH="/cp:$PATH"
  yarn install --immutable --mode=skip-build
  yarn build && yarn test && yarn prebuild
  readelf -d prebuilds/linux-x64/node.napi.musl.node | grep NEEDED
'
```

Gotchas, all of which the CI job encodes:

- Do **not** use `actions/setup-node` or `lukka/get-cmake` on Alpine — both ship
  glibc-only binaries. The container's Node is the toolchain; CMake comes from `apk`.
- `corepack enable --install-directory` requires the target directory to already exist.
- `CMakeLists.txt` forces `HAVE_GETTIMEOFDAY` on the QuickFIX target. Without it, musl
  builds fall through to QuickFIX's obsolete `ftime()` branch and are capped at
  millisecond resolution, while glibc builds get microseconds — a silent cross-libc
  divergence at `TimestampPrecision=6`. The loopback test asserts the parity.

## Project layout

- `cpp/` — the native addon (`node-addon-api` wrappers, application bridge).
- `src/` — the TypeScript public API and native loader.
- `test/` — the `node:test` suite and fixtures.
- `CMakeLists.txt` — native build wiring, including the QuickFIX FetchContent step.
- `.github/workflows/` — CI and release automation.

## Development notes

- **Do not vendor QuickFIX.** It must remain a build-time-only dependency fetched
  via FetchContent; do not commit any of its sources.
- The native module targets **N-API v9**; one prebuild per platform serves all
  supported Node LTS versions.
- The engine callbacks (`handlers`) run synchronously across the native/JS
  boundary. Preserve their mutate/throw semantics — do not swallow exceptions
  thrown from handlers, as they map to QuickFIX rejection behavior.

## Submitting changes

1. Fork and create a feature branch.
2. Make your change with accompanying tests where practical.
3. Ensure `yarn build && yarn test` passes locally.
4. Write commits (and your PR title) in the
   [Conventional Commits](https://www.conventionalcommits.org/) format — e.g.
   `feat: add session reset API`, `fix: handle empty tag 35`, or `feat!: drop Node 22`
   for a breaking change. This signals the intended version bump; see the
   [type → bump mapping](./VERSIONING.md#conventional-commits).
5. Open a pull request describing the change and its motivation.

## Versioning & releasing

This project follows [Semantic Versioning](https://semver.org/) with pre-1.0
conventions. The full policy — including how each kind of change maps to a version
bump for a native binding — lives in [VERSIONING.md](./VERSIONING.md). In short, while
in `0.x`:

- **PATCH** — backward-compatible bug fixes and no-op internal changes.
- **MINOR** — new features **and** breaking changes (pre-1.0 has no major channel).

"Breaking" here is broader than the TS surface: raising the minimum Node version,
dropping a platform/arch prebuild, or bumping the pinned QuickFIX version in a way that
changes observable behavior all count. When your change warrants a version bump, add a
[CHANGELOG.md](./CHANGELOG.md) entry describing it (and note the bundled QuickFIX version
if it changed). Maintainers cut releases by bumping `package.json` and pushing a matching
`vX.Y.Z` tag; see [VERSIONING.md](./VERSIONING.md#version--tag-contract) for the flow.

## License

By contributing, you agree that your contributions will be licensed under the
project's [MIT License](./LICENSE).
