# Architecture

`@homaiohq/napi-quickfix` is a Node.js binding for the [QuickFIX](https://github.com/quickfix/quickfix)
C++ FIX-protocol engine. It has three layers — a **TypeScript public API**, a **C++ Node-API addon**, and the
**QuickFIX engine** (fetched at build time, never vendored) — glued together by a native binary that is prebuilt so
end users need no compiler.

- **Language boundary:** TypeScript ⇄ C++ via [node-addon-api](https://github.com/nodejs/node-addon-api) (N-API v9).
- **Build:** [cmake-js](https://github.com/cmake-js/cmake-js) + CMake `FetchContent` (pins QuickFIX `v1.16.0`).
- **Distribution:** prebuilt `.node` binaries loaded at runtime by
  [node-gyp-build](https://github.com/prebuild/node-gyp-build); dual **ESM + CJS** output.
- **Threading:** blocking engine calls run off the main thread (`AsyncWorker`); QuickFIX callbacks marshal back to JS
  through a `TypedThreadSafeFunction`.

---

## 1. Layered overview

```mermaid
graph TD
  subgraph JS["JavaScript / TypeScript  (src/)"]
    APP["Your application"]
    IDX["index.ts — public barrel"]
    MSG["Message · SessionID<br/>SessionSettings · DataDictionary"]
    ENG["Engine (EventEmitter)<br/>Initiator · Acceptor · Session"]
    NAT["native.ts — typed NativeModule"]
    LOAD["load-native.cjs<br/>(node-gyp-build loader)"]
  end

  subgraph ADDON["C++ Node-API addon  (cpp/ → napi_quickfix.node)"]
    REG["addon.cpp — module init"]
    WRAPS["ObjectWrap classes<br/>MessageWrap · SessionIDWrap<br/>SessionSettingsWrap · DataDictionaryWrap<br/>InitiatorWrap · AcceptorWrap · SessionWrap"]
    BRIDGE["ApplicationBridge<br/>(FIX::Application + TSFN)"]
    WORKERS["engine_workers.h<br/>AsyncWorkers (start/stop/send/session ops)"]
    ERR["errors.h — FIX::Exception → QuickFixError"]
  end

  subgraph QF["QuickFIX C++ engine  (FetchContent, static)"]
    CORE["FIX::Message · Session<br/>SocketInitiator · SocketAcceptor<br/>DataDictionary · SessionSettings"]
    NET["Network + session threads"]
  end

  APP --> IDX --> MSG & ENG
  MSG --> NAT
  ENG --> NAT
  NAT --> LOAD -->|"dlopen .node"| REG
  REG --> WRAPS & BRIDGE & WORKERS
  WRAPS --> ERR
  WRAPS --> CORE
  WORKERS --> CORE
  CORE <--> NET
  NET -->|"callbacks"| BRIDGE
  BRIDGE -->|"ThreadSafeFunction"| ENG
```

The TypeScript layer is a thin, ergonomic facade. Each TS class holds an opaque handle to its C++ `ObjectWrap`
counterpart. The C++ layer owns the QuickFIX objects and translates every exception into a JS `QuickFixError`
(with a stable `.fixErrorName` discriminator).

---

## 2. Build pipeline

Nothing from QuickFIX is committed. CMake fetches and statically links it at build time; the result is a single
`.node` binary. End users install a **prebuilt** binary and skip this entirely.

```mermaid
flowchart LR
  A["yarn build"] --> B["cmake-js compile"]
  B --> C["CMake configure"]
  C --> D["FetchContent_Declare<br/>quickfix @ v1.16.0"]
  D --> E["build/_deps: clone + build<br/>libquickfix.a (static)"]
  C --> F["quickfix/ include-tree shim<br/>(flat src/C++/*.h → quickfix/*.h)"]
  E --> G["compile cpp/*.cpp<br/>link node-addon-api + libquickfix.a"]
  F --> G
  G --> H["build/Release/napi_quickfix.node"]
  A --> I["tsc × 2"]
  I --> J["dist/esm (NodeNext)"]
  I --> K["dist/cjs (+ package.json type:commonjs)"]
  J & K --> L["copy load-native.cjs into both"]

  H -.->|"yarn prebuild"| M["prebuilds/&lt;platform&gt;-&lt;arch&gt;/<br/>node.napi.node · node.napi.glibc.node · node.napi.musl.node"]
```

Key detail: QuickFIX ships headers **flat** in `src/C++/*.h` but code includes them as `quickfix/Message.h`, so
`CMakeLists.txt` copies them into a generated `quickfix/` include tree at configure time (Windows-safe, no symlinks).

---

## 3. Module loading (dual ESM + CJS)

```mermaid
flowchart TD
  E1["import from ESM<br/>dist/esm/index.js"] --> N["native.ts"]
  C1["require() from CJS<br/>dist/cjs/index.js"] --> N
  N -->|"import default"| LC["load-native.cjs"]
  LC -->|"node-gyp-build(pkgRoot)"| R{"resolve binary"}
  R -->|"prefer"| P["prebuilds/&lt;platform&gt;-&lt;arch&gt;/*.node<br/>(N-API tagged → any Node LTS)"]
  R -->|"dev fallback"| B["build/Release/napi_quickfix.node"]
```

The loader is one authored `.cjs` file copied into both build outputs, so ESM and CJS resolve the exact same binary
from the package root. The `napi` tag means a single prebuild per platform serves Node 22, 24 and 26.

---

## 4. The Application bridge (C++ threads → JS)

QuickFIX invokes `FIX::Application` callbacks from its **own network/session threads**. `ApplicationBridge`
subclasses `FIX::Application` and forwards each callback to JS through a single `Napi::TypedThreadSafeFunction`.

```mermaid
sequenceDiagram
  participant QF as QuickFIX thread
  participant BR as ApplicationBridge
  participant TSFN as TypedThreadSafeFunction
  participant JS as JS main thread
  participant H as User handler + event

  Note over QF,JS: fire-and-forget (onCreate / onLogon / onLogout)
  QF->>BR: onLogon(sessionID)
  BR->>TSFN: NonBlockingCall(copy of sessionID)
  TSFN-->>JS: CallJs trampoline
  JS->>H: handler(sid) + emit('logon', sid)

  Note over QF,JS: synchronous mutate / throw (toAdmin / toApp / fromAdmin / fromApp)
  QF->>BR: toApp(message, sessionID)
  BR->>TSFN: BlockingCall + SyncChannel(wait)
  TSFN-->>JS: CallJs trampoline (wrap Message + SessionID)
  JS->>H: handler(msg, sid)
  H-->>JS: mutate msg / throw FixReject
  JS-->>BR: fulfill SyncChannel (edited raw / error)
  BR->>QF: re-parse msg or throw FIX exception
```

- **Fire-and-forget** callbacks never block the QuickFIX thread.
- **Synchronous** callbacks (which may mutate the outbound message or throw to reject) use a `BlockingCall` plus a
  shared `SyncChannel` (mutex + condition variable). An RAII guard **always** fulfils the channel — even if the JS
  handler throws — so the QuickFIX thread can never deadlock waiting on it.

---

## 5. Why `start` / `stop` / `sendToTarget` are async

These calls make QuickFIX invoke synchronous callbacks that must round-trip to the JS main thread. If they ran **on**
the main thread, the main thread would block waiting for a `BlockingCall` that only the (now-blocked) event loop can
service — a deadlock. The fix: run the blocking QuickFIX call on a libuv worker thread via `Napi::AsyncWorker` and
return a `Promise`, keeping the event loop free to run the bridge trampoline.

```mermaid
flowchart TD
  subgraph MAIN["JS main thread (event loop stays free)"]
    CALL["await initiator.sendToTarget(msg, id)"]
    CJS["CallJs trampoline runs toApp handler"]
  end
  subgraph WORKER["libuv worker thread"]
    EX["AsyncWorker.Execute()<br/>FIX::Session::sendToTarget(copy)"]
  end
  subgraph QFT["QuickFIX thread"]
    CB["toApp callback → BlockingCall"]
  end

  CALL -->|"queue work + keep ref"| EX
  EX --> CB
  CB -->|"BlockingCall (loop free ✓)"| CJS
  CJS -->|"fulfill SyncChannel"| CB
  EX -->|"OnOK / OnError"| RES["resolve/reject Promise"]
  RES --> CALL
```

Synchronous, non-blocking members stay sync: `isLoggedOn()`, `getSessions()`, `getSession()`, `ref()`, `unref()`,
and the entire pure layer (`Message`, `SessionID`, `SessionSettings`, `DataDictionary`). On GC/process exit, a
cleanup hook deactivates the bridge and force-stops the engine **before** the TSFN is torn down, so a live session
never crashes on shutdown.

### `Session`: which members are async, and why

`SessionWrap` is a handle on an engine-owned `FIX::Session`. The rule for its sync/async split is the lock, not the
I/O: **QuickFIX holds `Session::m_mutex` while it runs application callbacks** (`sendRaw` holds it across
`toAdmin`/`toApp`; `disconnect` holds it across `onLogout`). A QuickFIX thread blocked in one of those callbacks is
waiting on the JS event loop via a `BlockingCall`, so any main-thread call that takes `m_mutex` would wait on a
thread that is waiting on the main thread — deadlock.

| Members | Thread | Why |
| --- | --- | --- |
| `isLoggedOn` · `isEnabled` · `sentLogon` · `sentLogout` · `receivedLogon` · `isInitiator` · `isAcceptor` · `isSessionTime` · `isLogonTime` · option getters/setters | sync, main | Read/write plain members of `FIX::Session`; no lock, no callback. |
| `getExpectedSenderNum` · `getExpectedTargetNum` · `setNextSenderMsgSeqNum` · `setNextTargetMsgSeqNum` | sync, main | Touch the `MessageStore` under `SessionState`'s own mutex, which QuickFIX never holds across a callback. May throw `IOException` (mapped to `QuickFixError`). |
| `reset` · `disconnect` | **async, `SessionOpWorker`** | Take `m_mutex` **and** fire `toAdmin` (`reset` sends a Logout) / `onLogout` through the TSFN — the deadlock case above. |
| `logon` · `logout` · `refresh` | **async, `SessionOpWorker`** | Don't take `m_mutex` today, but they are state transitions whose effect is only observable through `'logon'`/`'logout'` events; they share the async shape so the control surface is uniform and robust to upstream locking changes. |

**Lifetime.** `FIX::Session` objects are owned by the engine and `FIX::Session::lookupSession` returns a raw,
non-owning pointer, so `SessionWrap` never caches it: it stores the `FIX::SessionID` by value and re-resolves on
**every** call (on the worker thread for async ops), throwing/rejecting `QuickFixError{fixErrorName:
'SessionNotFound'}` when the session is gone. QuickFIX only deletes sessions — and removes them from the registry
`lookupSession` reads — in the engine destructor, so `InitiatorWrap`/`AcceptorWrap` destroy their engine as soon
as `stop()` settles (all network threads are joined by then) rather than waiting for GC. That is what makes a stale
`Session` handle fail deterministically after `stop()`, and lets a new engine reuse the same `SessionID`s
immediately instead of hitting a "Duplicate Session" `ConfigError`.

That eager destruction races with the worker-thread operations above, which hold a raw `FIX::Session*` between
`lookupSession` and the end of the operation. `session_op_gate.h` closes the race with a process-wide gate:
`SessionOpWorker` / `SendToTargetWorker` hold a `SessionOpGate::OpScope` for their whole `Execute()`, and the
engine's stop worker — on its **own** libuv thread, after `stop()` has joined the network threads — calls
`SessionOpGate::Freeze()`, which blocks new operations and waits for the in-flight ones to drain. Only then does
`OnOK` destroy the engine on the JS thread and `Unfreeze()`. Waiting on the worker thread rather than in `OnOK`
matters: an in-flight `reset()` may be blocked in a `toAdmin` `BlockingCall`, which needs the JS loop free. A
never-started engine takes the same async path on `stop()`, since its sessions are registered from construction.
The wrap destructor also freezes before destroying the engine, but only after `Teardown()` has deactivated the
bridge, so no in-flight operation can be waiting on the (blocked) JS thread.

Until `stop()` settles the engine is alive on the JS thread, so `engine.getSession()` / `engine.isLoggedOn(id)`
keep answering during a graceful stop (a `'logout'` listener can still read the final sequence numbers).

---

## 6. Handlers vs. events

Each engine exposes two channels for the same callbacks — with different contracts:

```mermaid
flowchart LR
  CB["QuickFIX callback"] --> BR["ApplicationBridge → CallJs"]
  BR --> HDL["handlers.toApp(msg, id)<br/>SYNCHRONOUS"]
  HDL -->|"may mutate msg / throw FixReject"| BACK["→ back to QuickFIX"]
  BR --> EV["emit('toApp', msg, id)<br/>OBSERVE-ONLY (after handler)"]
```

- **`handlers`** run synchronously inside the callback and can mutate outbound messages or `throw new FixReject(...)`
  to reject inbound ones (mapped to `DoNotSend` / `RejectLogon` / `UnsupportedMessageType`).
- **Events** are emitted afterward for observation (logging, metrics) and cannot affect the FIX flow.

---

## 7. CI / release

```mermaid
flowchart TD
  subgraph CI["ci.yml — push / PR"]
    M["matrix: {ubuntu, macos, windows} × node {22, 24, 26}"]
    M --> S1["get-cmake → yarn install → yarn build → yarn test"]
    MU["build-test-musl<br/>container: node:22-alpine"]
    MU --> S2["apk build-base cmake git → yarn install → yarn build → yarn test"]
  end
  subgraph REL["release.yml — tag v*"]
    P["prebuild matrix<br/>ubuntu · macos-intel · macos-arm · windows"]
    PM["prebuild-musl<br/>container: node:22-alpine"]
    P --> UP["upload prebuilds/ artifacts"]
    PM --> UP
    UP --> PUB["publish job"]
    PUB --> DL["download + merge all prebuilds"]
    DL --> NPM["npm publish --provenance (OIDC, no token)"]
    DL --> GH["GitHub Release<br/>(auto notes + tarball + prebuilds.zip)"]
  end
```

Because binaries are N-API-tagged, one prebuild per platform/arch covers every supported Node LTS. Publishing uses
npm **trusted publishing** (OIDC) — no long-lived token.

The musl jobs are deliberately **separate jobs** rather than matrix entries: they need a container and a different step
list (no `setup-node`, which would install a glibc Node; no `lukka/get-cmake`, whose Kitware binaries are glibc-only —
CMake comes from `apk`). Note that `runner.os` is `Linux` for both the glibc and musl jobs, so their cache keys carry a
**front-loaded** `musl-` discriminator (`cmake-deps-musl-Linux-…`). Front-loaded, not suffixed: `build/_deps` holds a
compiled `libquickfix.a`, and as a suffix the glibc job's `restore-keys: cmake-deps-Linux-` would still prefix-match the
musl entries and link musl objects into a glibc addon.

---

## Source map

| Area | Files |
| --- | --- |
| Public TS API | `src/index.ts`, `message.ts`, `session-id.ts`, `session-settings.ts`, `data-dictionary.ts`, `enums.ts` |
| Generated FIX constants | `scripts/gen-fields.mjs` → `src/generated/fields.ts` (`FIELD`), `scripts/gen-values.mjs` → `src/generated/values.ts` (value groups, `VALUES`) — both from the QuickFIX headers at the pinned tag |
| Engine + handlers | `src/engine.ts`, `initiator.ts`, `acceptor.ts`, `application.ts` |
| Per-session control | `src/session.ts` (`Session`, `lookupSession`, `doesSessionExist`, `getSessions`, `numSessions`), `cpp/session_wrap.{h,cpp}` |
| Native loader | `src/native.ts`, `src/load-native.cjs` |
| Addon entry / wraps | `cpp/addon.cpp`, `cpp/*_wrap.{h,cpp}`, `cpp/session_static.cpp` (`sendToTarget` + session lookups) |
| Bridge / async / errors | `cpp/application_bridge.{h,cpp}`, `cpp/engine_workers.h` (`EngineOpWorker`, `SessionOpWorker`), `cpp/errors.h` |
| Build / dist | `CMakeLists.txt`, `scripts/prebuild.mjs`, `tsconfig.*.json`, `package.json` |
| Tests | `test/*.test.ts`, `test/helpers.ts` (loopback harness) |
| CI | `.github/workflows/ci.yml`, `.github/workflows/release.yml` |
