# Contributing to @homaiohq/napi-quickfix

Thanks for your interest in improving this project! This is a Node-API (N-API)
C++ binding for the [QuickFIX](https://github.com/quickfix/quickfix) FIX-protocol
engine.

## Prerequisites

- **Node.js** LTS **22** or **24**
- **CMake** (>= 3.12)
- A **C++17** compiler (GCC, Clang, or MSVC)
- **Corepack** (bundled with Node) to provision the pinned Yarn version

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
- `yarn prebuild` — produce prebuilt binaries for the current platform.

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
4. Open a pull request describing the change and its motivation.

## License

By contributing, you agree that your contributions will be licensed under the
project's [MIT License](./LICENSE).
