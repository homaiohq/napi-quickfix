# @homaiohq/napi-quickfix

[![CI](https://github.com/homaiohq/napi-quickfix/actions/workflows/ci.yml/badge.svg)](https://github.com/homaiohq/napi-quickfix/actions/workflows/ci.yml)
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
  synchronous application handlers), per-session control (`Session`: sequence
  numbers, logon/logout, runtime options) *and* the pure layer (`Message` with
  repeating `Group`s and dictionary-aware parsing, `SessionSettings`,
  `DataDictionary`, `SessionID`).
- **Ergonomic, safe API** — chainable message building with automatic
  header/trailer field routing, typed rejections, and C++ exceptions surfaced as
  JavaScript `Error`s.
- **Every FIX constant, typed** — `FIELD` (tag numbers) and one value group per
  field (`MsgType`, `Side`, `ExecType`, `OrdStatus`, ...) are
  generated from the bundled QuickFIX headers with literal types, frozen, and
  importable without loading the native addon.
- **TLS for initiators** — `createTlsTunnel` is a built-in, stunnel-style TLS
  tunnel (mTLS, SNI, certificate verification via Node's `tls`), so you don't need
  a separate stunnel process.
- **Pluggable message store** — persist session state (sequence numbers, sent
  messages) write-through in any database Node can reach, through a small
  `MessageStoreAdapter` over your own driver and pool.

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

Releases are published from GitHub Actions via npm Trusted Publishing with
[provenance](https://docs.npmjs.com/generating-provenance-statements), so you can
check that an installed version was built from this repository:

```sh
npm audit signatures
```

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
new Message(raw?: string, opts?: MessageParseOptions);
Message.parse(raw: string, opts?: MessageParseOptions): Message;
// MessageParseOptions: { validate?: boolean; dictionary?: DataDictionary;
//                        sessionDictionary?: DataDictionary; applicationDictionary?: DataDictionary }

message.setField(tag: number, value: string | number): this; // chainable, auto-routes header/trailer fields
message.getField(tag: number): string;           // throws QuickFixError (FieldNotFound) if absent
// Standard header/trailer tags route to their section. Any other tag is a body field, unless the
// header or trailer already holds it (a field a dictionary declares there): then it is read and
// edited in place. A new dictionary-declared header field goes in with setHeaderField.
message.getFieldIfSet(tag: number): string | undefined;
message.isSetField(tag: number): boolean;
message.removeField(tag: number): this;
message.setHeaderField(tag, value): this;   message.getHeaderField(tag): string;
message.setTrailerField(tag, value): this;  message.getTrailerField(tag): string;
message.fields(): [tag: number, value: string][];   // body fields in wire order (also iterable)
message.headerFields(); message.trailerFields();    // same shape
message.isEmpty(): boolean;  message.totalFields(): number;  message.clear(): this;

// Tags must be integers (positive for setters) and group indices integers: anything else throws a TypeError.
// Repeating groups (indices are 1-based, as in QuickFIX)
message.addGroup(group: Group): this;               // appends a copy, maintains the count field; TypeError if group.delim differs from the stored entries'
message.getGroup(index: number, tag: number): Group; // snapshot copy; throws FieldNotFound if absent
message.replaceGroup(index: number, group: Group): this; // throws FieldNotFound if absent, TypeError if group.delim differs
message.removeGroup(tag: number): this;  message.removeGroup(index: number, tag: number): this; // (index, tag) throws FieldNotFound if absent
message.hasGroup(tag: number): boolean;  message.hasGroup(index: number, tag: number): boolean;
message.groupCount(tag: number): number;

message.getMsgType(): string;
message.toString(): string;   // raw SOH-delimited wire string
message.toPretty(): string;   // human-readable
message.toJSON(): { msgType?: string; raw: string };

createMessage(fields?: Record<number, string | number>): Message;
parseMessage(raw: string, opts?: MessageParseOptions): Message;
```

Field values are accepted as `string | number` (numbers are stringified) and
always returned as `string`. Header/trailer fields such as `MsgType`,
`BeginString`, and `CheckSum` are **automatically routed** to the correct
section by `setField`, so you rarely need `setHeaderField`/`setTrailerField`
directly.

**Parsing and repeating groups.** A parse without a dictionary is *flat*: the
fields of a repeating group are kept as plain repeated body fields and
`getGroup` throws. Pass a `dictionary` (or a `sessionDictionary` /
`applicationDictionary` pair for FIXT/FIX 5) to parse groups structurally.
With `UseDataDictionary=Y` (the default), messages delivered to engine handlers
are already parsed with the session's dictionary, so `getGroup` works on them
directly; with `UseDataDictionary=N` they arrive flat.

```ts
import { DataDictionary, Group, Message, FIELD, MsgType } from '@homaiohq/napi-quickfix';

const dd = DataDictionary.fromFile('./spec/FIX44.xml');

const order = new Message()
  .setField(FIELD.MsgType, MsgType.NewOrderSingle)
  .setField(FIELD.ClOrdID, 'order-1')
  .addGroup(new Group(FIELD.NoPartyIDs, FIELD.PartyID).setField(FIELD.PartyID, 'TRADER-1').setField(FIELD.PartyRole, 11))
  .addGroup(new Group(FIELD.NoPartyIDs, FIELD.PartyID).setField(FIELD.PartyID, 'FIRM-7').setField(FIELD.PartyRole, 1));
// 453=2|448=TRADER-1|452=11|448=FIRM-7|452=1 on the wire

const parsed = Message.parse(order.toString(), { dictionary: dd });
parsed.groupCount(FIELD.NoPartyIDs);                           // 2
parsed.getGroup(2, FIELD.NoPartyIDs).getField(FIELD.PartyID);  // 'FIRM-7'

// getGroup returns a snapshot: write changes back with replaceGroup.
const first = parsed.getGroup(1, FIELD.NoPartyIDs).setField(FIELD.PartyRole, 12);
parsed.replaceGroup(1, first);
```

### Group

One entry of a repeating group, identified by its **count tag** (`field`, e.g.
`453 NoPartyIDs`) and its **delimiter** (`delim`, the first tag of every entry,
e.g. `448 PartyID`). Groups nest through the same `addGroup`/`getGroup` API.

```ts
new Group(field: number, delim: number, order?: number[]); // order: full entry field order, delimiter first, no tag twice
                                                          // delim and order tags are capped at 2^20 (RangeError beyond that)
group.field;  group.delim;                                  // read-only

group.setField(tag, value: string | number): this;  group.getField(tag): string;
group.getFieldIfSet(tag): string | undefined;       group.isSetField(tag): boolean;
group.removeField(tag): this;  group.isEmpty();  group.totalFields();  group.clear(): this;
group.fields(): [tag, value][];                     // in wire order (also iterable)
group.toString(): string;                           // the entry's fields, SOH-delimited, in wire order

// Nested groups — same contract as on Message
group.addGroup(g: Group): this;  group.getGroup(index, tag): Group;  group.replaceGroup(index, g): this;
group.removeGroup(tag): this;    group.removeGroup(index, tag): this;
group.hasGroup(tag): boolean;    group.hasGroup(index, tag): boolean;  group.groupCount(tag): number;
```

Without an explicit `order`, an entry's fields are emitted delimiter-first and
then by ascending tag number, which matches the standard dictionaries for most
groups; pass `order` (e.g. `[448, 447, 452]`) when a group's spec order differs.

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
dictionary.validate(msg: Message, bodyOnly?: boolean): void; // throws QuickFixError if invalid
dictionary.getVersion(): string;                       // e.g. 'FIX.4.4'
dictionary.getFieldName(tag: number): string | undefined;
dictionary.getFieldTag(name: string): number | undefined;
dictionary.isField(tag: number): boolean;
dictionary.isMsgType(msgType: string): boolean;
```

`validate(msg, true)` validates as the *application* dictionary only: the
BeginString version check and header/trailer validation are skipped. A
dictionary also drives structural parsing — see `Message.parse` above.

### Initiator / Acceptor (the session engine)

Both extend Node's `EventEmitter` and share the same options and lifecycle:

```ts
new Initiator({ settings, handlers?, store?: 'file' | 'memory', log?: 'screen' | 'file' | 'none' });
new Acceptor({ settings, handlers?, store?, log? });
// With a MessageStoreAdapter (see "Message store"), or for one uniform async entry point:
await Initiator.create({ settings, handlers?, store?: 'file' | 'memory' | MessageStoreAdapter, storeTimeoutMs?, log? });
await Acceptor.create({ ... });

engine.start(): Promise<void>;
engine.stop(force?: boolean): Promise<void>;   // graceful drain by default; force to abort
engine.isLoggedOn(sessionID?: SessionID): boolean; // any session, or just that one
engine.getSessions(): SessionID[];                 // the [SESSION]s it was configured with
engine.getSession(sessionID: SessionID): Session | undefined;
engine.ref(): void;    // keep the event loop alive while running (default)
engine.unref(): void;  // let a short script / test exit
```

`start`/`stop` resolve once the engine has finished starting up / shutting down;
they run off the main thread so your handlers can fire meanwhile. Once `stop()`
settles the engine's sessions are destroyed: `getSession` returns `undefined` and
any `Session` handle you still hold throws `SessionNotFound`. Until then they are
still live: a graceful `stop()` settles only after the `'logout'` events it
triggered have been delivered, so a `'logout'` listener can still read the
session, and a `sendToTarget()` that has already reached its session completes
before the sessions go away. One that has not reached it by then is refused
with `SessionNotFound` rather than run against the engine that is gone; a send
is bound to the engine that owns the session when it is called, never to one
created later with the same id.
`stop(true)` discards the events still queued and destroys the sessions right
away. A `stop()` called while another is still in flight (from that `'logout'`
listener, say) returns the same Promise, so it too settles only once the
sessions are gone; the first call's `force` applies to both.

Two live engines cannot share a `SessionID`: constructing one whose session
already exists in the process throws a `ConfigError` ("Duplicate Session") until
the engine owning it has been stopped. A constructor that fails on a later
`[SESSION]` (any `ConfigError`) cleans up the sessions it had already created
(so the ids are not locked out by the failed attempt) and the engine-level log
QuickFIX had already opened for it.

### TLS (stunnel-style) for initiators

QuickFIX's own `SSLSocketInitiator` needs OpenSSL compiled into the engine, and
this package's prebuilds are built without it. Instead, `createTlsTunnel` does
what a stunnel client does, inside your process. It listens on a loopback port,
you point the initiator's `SocketConnectHost`/`SocketConnectPort` at it, and it
carries each connection to the counterparty over Node's
[`tls.connect`](https://nodejs.org/api/tls.html#tlsconnectoptions-callback):

```text
Initiator --plain TCP--> 127.0.0.1:<tunnel.port> --TLS--> fix.broker.com:9443
```

```ts
import { readFileSync } from 'node:fs';
import { createTlsTunnel, Initiator, SessionSettings } from '@homaiohq/napi-quickfix';

const tunnel = await createTlsTunnel({
  host: 'fix.broker.com',
  port: 9443,
  tls: {
    ca: readFileSync('broker-ca.pem'),   // omit to trust Node's default CAs
    cert: readFileSync('client.pem'),    // mTLS, if the venue requires it
    key: readFileSync('client.key'),
    minVersion: 'TLSv1.2',
  },
});
tunnel.on('secureConnect', (info) => console.log('TLS up', info.protocol, info.peerCertificate.subject));
tunnel.on('tlsError', (err) => console.error('TLS failed:', err.message));

const settings = SessionSettings.fromString(`
[DEFAULT]
ConnectionType=initiator
SocketConnectHost=${tunnel.host}
SocketConnectPort=${tunnel.port}
...
`);
const initiator = new Initiator({ settings, handlers });
await initiator.start();

// Shutdown: the engine first, so its Logout still crosses the tunnel.
await initiator.stop();
await tunnel.close();
```

- **Options.** `tls` accepts any `tls.ConnectionOptions` except
  `host`/`port`/`socket`/`path`. `servername` (SNI, and the name the server
  certificate is checked against) defaults to `host`, unless `host` is an IP
  address.
- **Fixed port.** Pass `localPort` to listen on a fixed port, for example to
  keep `SocketConnectPort=9001` in a static `.cfg` file. A port that is already
  in use makes `createTlsTunnel` reject with `EADDRINUSE`.
- **Failover.** Open one tunnel per `SocketConnectHost<n>`, and set
  `SocketConnectHost<n>=127.0.0.1` with `SocketConnectPort<n>=${tunnelN.port}`.
- **Failures.** If the TLS connection fails or breaks (DNS, TCP, handshake,
  certificate, or `tls` options that `tls.connect` rejects such as an
  unreadable key), the tunnel emits `'tlsError'` and drops the initiator's
  loopback connection. QuickFIX then reconnects after its `ReconnectInterval`.
  The tunnel never emits `'error'`, so a tunnel with no listeners cannot crash
  the process.
- **Shutdown of a connection.** When either side closes, the other is ended
  rather than reset, so data still in the tunnel (a Logout, TLS's
  `close_notify`) is delivered. A connection that has not fully closed 5 seconds
  after the first side closed is destroyed.
- **Lifecycle.** The tunnel's handles are unref'd, so the tunnel alone never
  keeps the process alive (a started engine does). `close()` destroys live
  connections at once. It is idempotent, and
  `await using tunnel = await createTlsTunnel(...)` closes the tunnel at the end
  of the block.

**Security notes**

- The plain-text hop listens on `127.0.0.1` only. As with stunnel, other
  processes on the same host can still connect to that port, so treat the host
  as trusted.
- QuickFIX's own logs show the loopback address (`Connecting to 127.0.0.1 on
  port ...`). Use the `'secureConnect'` event to see the real peer and its
  certificate.
- Tunnel traffic runs on the JS event loop, which the application handlers
  already depend on. A blocked loop stalls both in the same way.

**Acceptor side.** There is no in-process equivalent for acceptors. QuickFIX
1.16's acceptor always listens on every interface, and it checks
`AllowedRemoteAddresses` only after processing the Logon. A tunnel in front of
it could therefore be bypassed by connecting to the plain port directly. To
accept TLS, terminate it outside the process (stunnel in server mode, a load
balancer, a service mesh) and firewall the acceptor's port.

If you'd rather run stunnel as a sidecar on the initiator side, this config is
equivalent to the example above:

```ini
[fix-broker]
client = yes
accept = 127.0.0.1:9001
connect = fix.broker.com:9443
CAfile = broker-ca.pem
cert = client.pem
key = client.key
verifyChain = yes
checkHost = fix.broker.com
sslVersionMin = TLSv1.2
```

### Session

A handle on one **live** session, obtained from `engine.getSession(id)` or the
module-level `lookupSession(id)`. It stores only the `SessionID` and the identity
of the engine it came from, and re-resolves the engine-owned `FIX::Session` on
every call, so it never dangles — once the session is gone (its engine was
stopped) every method throws a `QuickFixError` whose `fixErrorName` is
`'SessionNotFound'`, even after a new engine has been created with the same id.
A handle never crosses over to another engine's session; get a new one from the
new engine.

```ts
session.sessionID: SessionID;

// State (sync)
session.isLoggedOn(): boolean;   session.isEnabled(): boolean;
session.sentLogon(): boolean;    session.sentLogout(): boolean;   session.receivedLogon(): boolean;
session.isInitiator(): boolean;  session.isAcceptor(): boolean;
session.isSessionTime(now?: Date): boolean;   session.isLogonTime(now?: Date): boolean;

// Sequence numbers (getters sync; the setters write to the message store on a
// worker thread -- on a quiet session, see below)
session.getExpectedSenderNum(): number;                  session.getExpectedTargetNum(): number;
session.setNextSenderMsgSeqNum(n: number): Promise<void>; session.setNextTargetMsgSeqNum(n: number): Promise<void>;

// Runtime options (sync; change the live session, not its SessionSettings)
session.getResetOnLogon() / setResetOnLogon(v: boolean)        // likewise: ResetOnLogout,
session.getLogonTimeout() / setLogonTimeout(seconds: number)   //   ResetOnDisconnect, RefreshOnLogon,
session.getTimestampPrecision() / setTimestampPrecision(0..9)  //   CheckCompId, CheckLatency, MaxLatency,
                                                               //   LogoutTimeout, PersistMessages,
                                                               //   SendRedundantResendRequests,
                                                               //   ValidateLengthAndChecksum,
                                                               //   SendNextExpectedMsgSeqNum, IsNonStopSession

// Control (worker thread)
session.logon(): Promise<void>;                   // enable; an initiator reconnects + logs on
session.logout(reason?: string): Promise<void>;   // disable + graceful Logout; stays down until logon()
session.refresh(): Promise<void>;                 // re-read state from the message store
```

The state queries, the sequence-number getters and the option getters/setters
are synchronous: none of them takes a QuickFIX mutex that another thread may
hold while it waits on the event loop. `logon()`, `logout()`, `refresh()` and
the two sequence-number setters return a Promise: they take the session-state
mutex, the one the engine holds while it writes to the message store, and
with a [message store adapter](#message-store) that write waits on the event
loop, so taking the mutex on the main thread would deadlock the process. They
run on a worker thread instead, like `sendToTarget()`, and calls on one
session are serialised in program order whether you await them or not:
`session.logout('x'); session.logon();` lands in that order. Their latency is
that of the libuv worker pool: they queue behind in-flight `sendToTarget()`
calls on any session, each of which may itself be waiting on a store write.
Bound the number of sends in flight (await them, or cap them with a
semaphore) and/or raise `UV_THREADPOOL_SIZE` if that latency matters. Once the
owning engine is gone they reject with `SessionNotFound`; a `'logout'`
listener fired by `engine.stop()` may see that, since the engine is destroyed
when the stop settles. (`logon()`/`logout()` flip a plain flag the engine's
network thread reads without a lock, exactly as QuickFIX's own
`Initiator::stop()` does from the stopping thread; the engine picks the change
up on its next pass.) The sequence-number setters are not serialised against a
message the engine is sending or receiving on that session at the same
moment: QuickFIX reads the number, runs your handler, then increments from the
store under a lock the setters do not take, so a value set in that window —
from a handler, or while a `sendToTarget()` or a heartbeat is in flight — is
overwritten and the session ends up one off from its counterparty. Renumber a
**quiet** session: before `start()`, from a `'logout'` event, or when you know
nothing is in flight. QuickFIX's `Session::disconnect()` and `reset()` are
deliberately **not** exposed: they drop the transport through the engine's
socket monitor, which is only safe from the engine's own network thread
(QuickFIX itself never calls them from anywhere else). Bring a session down
with `logout()` and renumber it with the sequence-number setters. Observe the
outcome through the engine's `'logon'` / `'logout'` events:

```ts
initiator.on('logon', (id) => {
  console.log('next outbound seq', initiator.getSession(id)!.getExpectedSenderNum());
});
initiator.on('logout', (id) => {
  // The session is quiet now: renumber it, e.g. after the counterparty reset.
  // If this 'logout' was fired by stop(), the engine may be gone by the time
  // the write runs: it then rejects SessionNotFound instead of succeeding.
  void initiator.getSession(id)?.setNextTargetMsgSeqNum(1).catch(() => {});
});

await lookupSession(id)?.logout('maintenance');   // -> 'logout' event, isLoggedOn() === false
await lookupSession(id)?.logon();                 // -> reconnects, 'logon' event
```

### Message store

By default the engine persists each session's state — the next sequence
numbers, the session's creation time and every outbound message (for resends)
— with QuickFIX's file store (`store: 'file'`, under `FileStorePath`), or keeps
it in memory (`'memory'`). A **`MessageStoreAdapter`** replaces that with your
own database, through whatever driver and pool you already use; QuickFIX's own
PostgreSQL/MySQL/ODBC stores are not built (they need client libraries in the
prebuild). One adapter object serves every session of an engine; each method
receives the `SessionID`. Every method may return a value or a Promise:

```ts
import { Initiator, type MessageStoreAdapter, type MessageStoreState } from '@homaiohq/napi-quickfix';

interface MessageStoreState { creationTime: Date; nextSenderMsgSeqNum: number; nextTargetMsgSeqNum: number }

interface MessageStoreAdapter {
  load(sessionID): MessageStoreState | null | Promise<...>;     // null: never seen
  create(sessionID, state): void | Promise<void>;                // first time a session is seen
  setSeqNums(sessionID, nextSender, nextTarget): void | Promise<void>;
  setMessage(sessionID, seqNum, message): void | Promise<void>;  // an UPSERT, never fails on a duplicate
  getMessages(sessionID, begin, end): string[] | Promise<string[]>; // inclusive, ascending, missing omitted
  reset(sessionID, state): void | Promise<void>;                 // delete the messages + write state, one tx if possible
  close?(sessionID): void | Promise<void>;                       // after stop() destroyed the sessions
}

const initiator = await Initiator.create({
  settings,
  store: myAdapter,          // a MessageStoreAdapter: create() only, `new` throws TypeError
  storeTimeoutMs: 30_000,    // default; 0 disables (see below)
  log: 'none',
});
initiator.on('storeError', (sessionID, method, error, poisoned) => { /* alert */ });
```

`Initiator.create()` / `Acceptor.create()` call `load()` for every session the
engine will own (and `create()` for one it has never seen) before constructing
the engine, which needs that state synchronously; they also accept `'file'` and
`'memory'`, so there is one async entry point for every store. A ready-made
`MapMessageStore` (an in-memory `Map` per session) is exported as the reference
implementation and a test double.

**Threads and latency.** The store is write-through: the engine persists a
message and bumps the sequence number *before* the message hits the wire, and
the thread doing that — the engine's network thread, or the worker running a
`sendToTarget()` — waits for your Promise. The event loop stays free (that is
what serves the Promise), but that thread holds the session's state mutex
meanwhile, which is why `logon()`, `logout()`, `refresh()` and the sequence-number
setters run on a worker (see "Session") and why a parked send pins one libuv
pool thread. Two rules follow:

- **An adapter must not depend on the libuv threadpool on its hot path**
  (`fs.promises`, `dns.lookup`, `zlib`, async `crypto`, …), or the pool must be
  sized for it (`UV_THREADPOOL_SIZE`, default 4): with every slot parked in a
  store write, an adapter that needs a slot to finish the write deadlocks through
  the pool. Socket-based database drivers (`pg`, `mysql2`, …) do not use it.
- **Bound your sends** (await them, or cap them with a semaphore): each
  in-flight `sendToTarget()` may be parked in a store write, and the session
  control calls queue behind them on the same pool.
- Never await an engine operation on the *same* session from inside a store
  method (`session.logout()`, `sendToTarget(msg, thatSession)`, `engine.stop()`):
  it waits on the mutex the thread parked in your method holds. The timeout
  surfaces it as an `IOException` and poisons the store.

**Timeout.** `storeTimeoutMs` (default 30 s) bounds how long an engine thread
waits on one adapter call; on expiry the call fails with `IOException` and the
engine proceeds as for a rejection, while the Promise is still observed (see
"late" below). The trade-off: a longer timeout freezes heartbeats of *every*
session of the engine (one network thread) for that long when the adapter
stalls; a shorter one produces more late outcomes, each fatal for the session.
`0` disables it, accepting that a stalled adapter stalls the engine, a
graceful `stop()` and process exit with it.

**Failure policy.** A rejection, a synchronous throw, a malformed return value
or a timeout reach the engine as an `IOException`; every one is reported
through the `'storeError'` event (`sessionID, method, error, poisoned`) and
the session log.

- `setMessage` and `getMessages` are **never fatal**: a failed `setMessage`
  makes `sendToTarget()` resolve `false` (nothing was sent, the sequence number
  is reused by the next send: hence the upsert), and a failed `getMessages`
  makes the engine disconnect so the peer reconnects and re-requests — QuickFIX's
  own behaviour. A `setMessage` that settles after its timeout is simply a
  late upsert.
- `setSeqNums` and `reset` failing, timing out or settling **late** (after the
  timeout already failed the call), and `load` (a `refresh`) failing or timing
  out, **poison** the session's store. The engine cannot know whether a rejected
  or late write was committed: a late increment leaves the cache one behind the
  database, a late reset leaves it with the old numbers while the database says
  `1/1` with the messages gone. A poisoned store fails every write and every
  read of the outbound sequence number at once (no stale number ever reaches
  the wire), and every inbound message ends in a sequence-number write, so the
  engine disconnects the session at its next inbound message (a heartbeat at
  the latest); `'storeError'` fires with `poisoned: true`, and the
  `getExpected*()` getters throw `IOException` until it lifts. **Poison lifts in
  two steps**, whatever `RefreshOnLogon` says: once every timed-out write has
  settled (so a late write has landed), the next store call of any kind first
  reloads the state through `load()` (one reload in flight at a time, so a dead
  adapter costs one timeout per attempt, not per call), then proceeds; QuickFIX's
  own sequence logic then reconciles with the peer at the next logon (a resend
  request, or redelivery with `PossDupFlag=Y`). An inbound message whose
  sequence-number write failed after `fromApp` ran is therefore delivered
  **again** with `PossDupFlag=Y` on reconnect: standard FIX dedupe, not a
  sequence-number inconsistency.
- `reset()` and `refresh()` never raise into QuickFIX, which runs them on
  paths without a handler (`ResetOnDisconnect=Y` inside its own error handler,
  `RefreshOnLogon=Y` on the connect path); they poison and report instead.

**`stop()`.** `stop(true)` fails every pending store call first, so a stalled
adapter cannot hold it up. A graceful `stop()` lets in-flight writes complete
(each bounded by the timeout, at most one per session) before the engine logs
its sessions out; if the Logout itself cannot be persisted, QuickFIX's own 10 s
logout grace applies on top. Once the sessions are destroyed the adapter's
`close()` is called for each session, and `stop()` settles after it, so
`await engine.stop(); await Initiator.create({ store: sameAdapter })` never
races `close()` against `load()`. An engine dropped without `stop()` is torn
down at process exit without calling `close()`.

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
  message or reject it — use `handlers` for that. An engine built with a
  message store adapter also emits `'storeError'` (see "Message store").

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
sendToTarget(message: Message, sessionID: SessionID): Promise<boolean>;
sendToTarget(message: Message, qualifier?: string): Promise<boolean>; // session from the message header (8/49/56)

lookupSession(sessionID: SessionID): Session | undefined; // any engine in this process
doesSessionExist(sessionID: SessionID): boolean;
getSessions(): SessionID[];      // every session in this process, across all engines
numSessions(): number;

version(): string;               // engine / addon version string

createTlsTunnel(options: TlsTunnelOptions): Promise<TlsTunnel>; // see "TLS (stunnel-style) for initiators"

FIELD        // field-name -> tag number, e.g. FIELD.MsgType === 35, FIELD.Password === 554
MsgType      // MsgType values, e.g. MsgType.Logon === 'A'
Side         // Side values, e.g. Side.Buy === '1'
OrdType      // e.g. OrdType.Limit === '2'
TimeInForce  // e.g. TimeInForce.Day === '0'
VALUES       // every value group keyed by field name, e.g. VALUES.ExecType.Fill === '2'
enums        // the full frozen tree: every value group plus FIELD
```

`FIELD` is generated from the bundled QuickFIX's `FixFieldNumbers.h`, so it has every
`FIX::FIELD::*` name the engine knows (6000+). Values are literal types: `FIELD.Password`
is typed `554`, and a misspelt field name is a compile error. `FieldName` is the union of
all field names.

The value groups are generated the same way from `FixValues.h`: one frozen object per
field (690 groups, 5700+ values), each value a string because FIX is string-on-the-wire
(`EncryptMethod.None === '0'`, not `0`). Names derive from QuickFIX's
`FIX::<Field>_<VALUE>` constants with the SCREAMING_SNAKE suffix turned into PascalCase —
`Side_SELL_SHORT` → `Side.SellShort`, `ExecType_DONE_FOR_DAY` → `ExecType.DoneForDay` —
while `MsgType`, whose upstream names already mirror message names, is kept verbatim
(`MsgType.NewOrderSingle`, `MsgType.IOI`). Every word is lower-cased, acronyms included
(`SecurityIDSource_ISIN_NUMBER` → `SecurityIDSource.IsinNumber`, `MDEntryType_VWAP` →
`MDEntryType.Vwap`): the upstream names carry no acronym information, so there is no
allowlist to maintain and the keys are stable. The exact rule is documented in
`scripts/gen-values.mjs`. Values are literal types too (`Side.Buy` is typed `'1'`), and
`ValueGroupName` is the union of all group names.

The root entry exports `MsgType`, `Side`, `OrdType` and `TimeInForce` by name and every
group through `VALUES` / `enums`. Both tables are also exposed as subpath exports that
do **not** load the native addon, for tooling that only needs the constants (log
parsers, test helpers, bundles for platforms without a prebuild); each group is a named
export there, so bundlers resolving the ESM build keep only the groups you import (the
CJS build is not tree-shakeable: tsc drops the `@__PURE__` annotations when it emits
CommonJS):

```ts
import { FIELD } from '@homaiohq/napi-quickfix/fields';
import { ExecType, OrdStatus, SecurityType } from '@homaiohq/napi-quickfix/values';
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
| **Timestamp resolution** | microseconds on Linux (glibc + musl) and macOS; **milliseconds on Windows** |

Because prebuilds are N-API-tagged (not ABI-tagged), a single binary per
platform serves all supported Node LTS versions.

On Windows, QuickFIX has no microsecond clock available (it falls back to
`ftime()`), so sub-second `SendingTime` digits beyond milliseconds are always
zero — a `TimestampPrecision=6` session emits `.NNN000`. Setting a higher
precision is still valid and interoperable; only the extra digits are padding.

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
