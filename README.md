# @homaiohq/napi-quickfix

[![CI](https://github.com/homaio/napi-quickfix/actions/workflows/ci.yml/badge.svg)](https://github.com/homaio/napi-quickfix/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@homaiohq/napi-quickfix.svg)](https://www.npmjs.com/package/@homaiohq/napi-quickfix)
[![Node.js](https://img.shields.io/node/v/@homaiohq/napi-quickfix.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

A modern **Node-API** (N-API / `node-addon-api`) C++ binding for the
[QuickFIX](https://github.com/quickfix/quickfix) FIX-protocol engine. It exposes
both the *pure* message layer (build, parse, and validate FIX messages) and the
full *session engine* (socket initiator/acceptor with `FIX::Application`
callbacks bridged to JavaScript) — with prebuilt binaries so most consumers need
**no C++ compiler**, dual **ESM + CommonJS** entry points, and TypeScript types
included.

## Features

- **Modern Node-API** — built on `node-addon-api` (N-API v9), not the legacy
  NAN/node-gyp stack. One prebuild per platform serves every supported Node LTS.
- **No compiler needed** — prebuilt native binaries ship in the npm package (via
  `prebuildify` + `node-gyp-build`); a source build via CMake is only a fallback.
- **Dual ESM + CJS** — a proper `exports` map with `import` and `require` entry
  points.
- **TypeScript types included** — hand-written `.d.ts` for the full public API.
- **Full FIX surface** — the session engine (`Initiator`/`Acceptor` +
  synchronous application handlers) *and* the pure layer (`Message`,
  `SessionSettings`, `DataDictionary`, `SessionID`).
- **Ergonomic, safe API** — chainable message building with automatic
  header/trailer field routing, typed rejections, and C++ exceptions surfaced as
  JavaScript `Error`s.

## Install

```sh
yarn add @homaiohq/napi-quickfix
# or
npm install @homaiohq/napi-quickfix
# or
pnpm add @homaiohq/napi-quickfix
```

Prebuilt binaries are published for **Linux x64** (both **glibc** and
**musl/Alpine**), **macOS** x64 + arm64, and **Windows** x64. On these platforms
installation requires no toolchain.

The two Linux binaries are libc-tagged and picked automatically: `node-gyp-build`
selects the musl build when `/etc/alpine-release` exists. On a musl distro that
is *not* Alpine, set `LIBC=musl` to force it.

If a matching prebuild is not available for your platform/arch, the install
falls back to building from source, which requires:

- **CMake** (>= 3.12)
- A **C++17** compiler (GCC / Clang / MSVC)

  On Alpine/musl that is `apk add build-base cmake git` — `build-base` supplies
  g++/make, and `git` is needed for the QuickFIX `FetchContent` clone.

QuickFIX itself is fetched at build time via CMake `FetchContent` (pinned to
`v1.16.0`) — nothing is vendored or committed to this repository.

## Quick start

### ESM

```ts
import {
  Message,
  SessionSettings,
  Initiator,
  FixReject,
  sendToTarget,
  FIELD,
  MsgType,
} from '@homaiohq/napi-quickfix';

// Build a message. Header/trailer fields (e.g. MsgType) auto-route to the right
// section, so setField is all you usually need. setField is chainable.
const order = new Message()
  .setField(FIELD.MsgType, MsgType.NewOrderSingle)
  .setField(FIELD.ClOrdID, 'order-1')
  .setField(FIELD.Symbol, 'AAPL')
  .setField(FIELD.OrderQty, 100);

console.log(order.getMsgType()); // 'D'
console.log(order.toPretty());

// Parse a raw FIX wire string back into a Message.
const parsed = Message.parse(order.toString());

// Load session settings from an in-memory config.
const settings = SessionSettings.fromString(`
[DEFAULT]
ConnectionType=initiator
SocketConnectHost=127.0.0.1
SocketConnectPort=5001
HeartBtInt=30
UseDataDictionary=N
StartTime=00:00:00
EndTime=00:00:00

[SESSION]
BeginString=FIX.4.4
SenderCompID=CLIENT
TargetCompID=BROKER
`);

// Create the initiator with synchronous application handlers.
const initiator = new Initiator({
  settings,
  store: 'memory',
  log: 'none',
  handlers: {
    onLogon(sessionID) {
      console.log('logged on:', sessionID.toString());
      // sessionID.toString() -> "FIX.4.4:CLIENT->BROKER"
      sendToTarget(order, sessionID);
    },
    toAdmin(msg) {
      // Handlers run synchronously and may MUTATE the outbound message.
      if (msg.getMsgType() === MsgType.Logon) {
        msg.setField(FIELD.Username, 'user');
        msg.setField(FIELD.Password, 'secret');
      }
    },
    fromApp(msg) {
      // Reject an inbound message by THROWING a typed rejection.
      if (msg.getMsgType() === 'X') {
        throw new FixReject('UnsupportedMessageType');
      }
      console.log('received:', msg.getMsgType());
    },
  },
});

// Observe-only events (cannot mutate/reject) are also emitted.
initiator.on('logout', (id) => console.log('logged out:', id.toString()));

initiator.start();

// ... later, shut down cleanly (drain gracefully).
process.on('SIGINT', () => {
  initiator.stop();
});
```

### CommonJS

```js
const {
  Message,
  SessionSettings,
  Initiator,
  FIELD,
  MsgType,
} = require('@homaiohq/napi-quickfix');

const order = new Message()
  .setField(FIELD.MsgType, MsgType.NewOrderSingle)
  .setField(FIELD.ClOrdID, 'order-1')
  .setField(FIELD.Symbol, 'AAPL');

const settings = SessionSettings.fromString(`
[DEFAULT]
ConnectionType=initiator
SocketConnectHost=127.0.0.1
SocketConnectPort=5001
HeartBtInt=30
UseDataDictionary=N
StartTime=00:00:00
EndTime=00:00:00

[SESSION]
BeginString=FIX.4.4
SenderCompID=CLIENT
TargetCompID=BROKER
`);

const initiator = new Initiator({
  settings,
  store: 'memory',
  log: 'none',
  handlers: {
    onLogon: (id) => console.log('logged on:', id.toString()),
  },
});

initiator.start();
// initiator.stop() when done.
```

## API overview

The full type surface is documented in the shipped TypeScript declarations
(`dist/esm/index.d.ts`); the reference below is a concise summary. All exports
come from `@homaiohq/napi-quickfix`.

### Message

```ts
new Message(raw?: string, opts?: { validate?: boolean });
Message.parse(raw: string, opts?: { validate?: boolean }): Message;

message.setField(tag: number, value: string | number): this; // chainable, auto-routes header/trailer fields
message.getField(tag: number): string;
message.setHeaderField(tag, value): this;   message.getHeaderField(tag): string;
message.setTrailerField(tag, value): this;  message.getTrailerField(tag): string;
message.getMsgType(): string;
message.toString(): string;   // raw SOH-delimited wire string
message.toPretty(): string;   // human-readable
message.toJSON(): { msgType?: string; raw: string };

createMessage(fields?: Record<number, string | number>): Message;
parseMessage(raw: string, opts?: { validate?: boolean }): Message;
```

Field values are accepted as `string | number` (numbers are stringified) and
always returned as `string`. Header/trailer fields such as `MsgType`,
`BeginString`, and `CheckSum` are **automatically routed** to the correct
section by `setField`, so you rarely need `setHeaderField`/`setTrailerField`
directly.

### SessionID

```ts
new SessionID(beginString: string, senderCompID: string, targetCompID: string, qualifier?: string);
sessionID.beginString;   sessionID.senderCompID;
sessionID.targetCompID;  sessionID.sessionQualifier;
sessionID.toString();    // e.g. "FIX.4.4:CLIENT->BROKER"
```

### SessionSettings

```ts
SessionSettings.fromString(cfg: string): SessionSettings;
SessionSettings.fromFile(path: string): SessionSettings;
settings.getSessions(): SessionID[];
```

### DataDictionary

```ts
DataDictionary.fromString(xml: string): DataDictionary;
DataDictionary.fromFile(xmlPath: string): DataDictionary;
dictionary.validate(msg: Message): void; // throws QuickFixError if invalid
```

### Initiator / Acceptor (the session engine)

Both extend Node's `EventEmitter` and share the same options and lifecycle:

```ts
new Initiator({ settings, handlers?, store?: 'file' | 'memory', log?: 'screen' | 'file' | 'none' });
new Acceptor({ settings, handlers?, store?, log? });

engine.start(): void;
engine.stop(force?: boolean): void;   // graceful drain by default; force to abort
engine.isLoggedOn(): boolean;
engine.ref(): void;    // keep the event loop alive while running (default)
engine.unref(): void;  // let a short script / test exit
```

### Handlers vs. events

This is the key distinction to understand:

- **`handlers`** (passed in the constructor options) run **synchronously** on the
  engine's callback path. They are the *only* place you can affect a message:
  - `toAdmin` / `toApp` may **mutate** the outbound message in place (e.g. add
    credentials to a Logon in `toAdmin`).
  - `toApp` may **throw** `new FixReject('DoNotSend')` to suppress sending.
  - `fromAdmin` / `fromApp` may **throw** a `FixReject` to reject an inbound
    message (e.g. `'RejectLogon'`, `'UnsupportedMessageType'`).
  - `onCreate` / `onLogon` / `onLogout` are fire-and-forget notifications.

- **Events** (`engine.on('logon', ...)`, etc.) are **observe-only**. The engine
  emits `'create' | 'logon' | 'logout' | 'toAdmin' | 'fromAdmin' | 'toApp' | 'fromApp'`
  *after* the corresponding handler runs. Event listeners **cannot** mutate a
  message or reject it — use `handlers` for that.

### Rejections

Throw a `FixReject` from a handler to reject:

```ts
import { FixReject, fixReject } from '@homaiohq/napi-quickfix';

throw new FixReject('DoNotSend');
throw new FixReject('RejectLogon', 'bad credentials');
throw fixReject('UnsupportedMessageType'); // convenience factory
```

Recognized kinds: `'DoNotSend'`, `'RejectLogon'`, `'UnsupportedMessageType'`,
`'IncorrectDataFormat'`, `'IncorrectTagValue'`, `'FieldNotFound'`.

### Module functions and constants

```ts
sendToTarget(message: Message, sessionID: SessionID): boolean;
version(): string;               // engine / addon version string

FIELD    // field-name -> tag number, e.g. FIELD.MsgType === 35
MsgType  // MsgType values, e.g. MsgType.Logon === 'A'
Side     // Side values, e.g. Side.Buy === '1'
enums    // the full frozen tree of FIX constants
```

### Errors

Errors thrown by native calls are `Error`s with `name === 'QuickFixError'`,
carrying a `fixError` discriminator (a stable string such as `'ConfigError'`,
`'FieldNotFound'`, `'InvalidMessage'`, `'IncorrectTagValue'`) plus a `detail`
string, so you can branch on the failure kind:

```ts
try {
  dictionary.validate(msg);
} catch (err) {
  if (err.name === 'QuickFixError' && err.fixError === 'FieldNotFound') {
    // handle a missing required field
  }
}
```

## Building from source / Contributing

Development uses **Yarn (Berry 4)** with the `node-modules` linker, via corepack.

```sh
corepack enable
yarn install
yarn build   # cmake-js native build + dual (ESM + CJS) TypeScript build
yarn test    # node --test
```

QuickFIX is fetched at build time via CMake `FetchContent` (pinned to
`v1.16.0`) — nothing is vendored or committed. The native build therefore needs
CMake (>= 3.12) and a C++17 compiler; the QuickFIX sources are downloaded
automatically on first configure.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for more detail, and
[ARCHITECTURE.md](./ARCHITECTURE.md) for a diagrammed walkthrough of how the
TypeScript API, the C++ Node-API addon, and the QuickFIX engine fit together
(layers, build pipeline, the threading/async model, and CI).

## Compatibility

| | |
| --- | --- |
| **Node.js** | LTS **22**, **24** and **26** (current) |
| **N-API version** | 9 |
| **Platforms** | Linux (glibc + musl/Alpine), macOS, Windows |
| **Prebuilt targets** | `linux-x64` (glibc, musl), `darwin-x64`, `darwin-arm64`, `win32-x64` |
| **libc (Linux)** | glibc **and** musl — separate libc-tagged prebuilds; musl is x64-only |
| **QuickFIX** | v1.16.0 (statically linked into prebuilds) |

Because prebuilds are N-API-tagged (not ABI-tagged), a single binary per
platform serves all supported Node LTS versions.

## Versioning

This package follows [Semantic Versioning](https://semver.org/) and is currently
in the **`0.x`** (pre-1.0) phase. While in `0.x`, **minor releases may include
breaking changes** — pre-1.0 has no separate major channel — so review the
[CHANGELOG](./CHANGELOG.md) before upgrading across a minor bump. Note that npm's
caret range locks the minor for `0.x`: `^0.1.0` resolves to `>=0.1.0 <0.2.0`.

The package version tracks *this binding's* API and behavior, not the bundled
QuickFIX release (statically linked, currently `v1.16.0` — see the table above).
See [VERSIONING.md](./VERSIONING.md) for the full policy.

## License

This package (`@homaiohq/napi-quickfix`) is licensed under the **MIT License** —
see [LICENSE](./LICENSE). Copyright (c) 2026 Homaio.

### Third-party licenses

The published prebuilt binaries **statically link** the QuickFIX C++ engine,
which is distributed under the **QuickFIX Software License, Version 1.0** (a
permissive, BSD-style license). Its full text and the required attribution are
reproduced in [THIRD_PARTY_LICENSES](./THIRD_PARTY_LICENSES).

As required by that license:

> This product includes software developed by quickfixengine.org
> (http://www.quickfixengine.org/).

### Acknowledgements / Naming

This is an **independent, unaffiliated** Node.js binding. It is not produced,
sponsored, or endorsed by quickfixengine.org or the QuickFIX project. The name
"QuickFIX" is used here **nominatively** — solely to describe the C++ library
that this package wraps — and does not imply any affiliation or endorsement. All
QuickFIX trademarks and names remain the property of their respective owners.
