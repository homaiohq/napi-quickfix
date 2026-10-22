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
    MSG["Message · Group · SessionID<br/>SessionSettings · DataDictionary"]
    ENG["Engine (EventEmitter)<br/>Initiator · Acceptor · Session"]
    TUN["createTlsTunnel<br/>(loopback ⇄ node:tls)"]
    NAT["native.ts — typed NativeModule"]
    LOAD["load-native.cjs<br/>(node-gyp-build loader)"]
  end

  subgraph ADDON["C++ Node-API addon  (cpp/ → napi_quickfix.node)"]
    REG["addon.cpp — module init"]
    WRAPS["ObjectWrap classes<br/>MessageWrap · GroupWrap · SessionIDWrap<br/>SessionSettingsWrap · DataDictionaryWrap<br/>InitiatorWrap · AcceptorWrap · SessionWrap"]
    BRIDGE["ApplicationBridge<br/>(FIX::Application + TSFN)<br/>JsMessageStoreFactory<br/>(FIX::MessageStore + TSFN)"]
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
  APP -.->|"optional"| TUN
  NET -.->|"TCP to 127.0.0.1"| TUN
```

The TypeScript layer is a thin, ergonomic facade. Each TS class holds an opaque handle to its C++ `ObjectWrap`
counterpart. The C++ layer owns the QuickFIX objects and translates every exception into a JS `QuickFixError`
(with a stable `.fixErrorName` discriminator).

TLS is not done by QuickFIX: the engine is built without `HAVE_SSL`, because bundling OpenSSL would break the
one-N-API-prebuild-per-platform model. Instead, `createTlsTunnel` (`src/tls-tunnel.ts`, pure TS) plays the stunnel
client. The plain `SocketInitiator` connects to its loopback listener, and the tunnel carries each connection to the
counterparty over `node:tls`. The tunnel and the engine are independent; the user wires the tunnel's port into the
settings.

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

**The three upstream fixes carried.** `CMakeLists.txt` edits the fetched sources (`${quickfix_SOURCE_DIR}/src/C++`)
at configure time through `qf_patch()`, not through a FetchContent `PATCH_COMMAND`, which is skipped for a source
tree restored from the CI cache or given through `FETCHCONTENT_SOURCE_DIR_QUICKFIX`. Each edit replaces one whole
line (a CRLF checkout keeps matching), is idempotent, and fails the configure if its anchor line is gone or not
unique (a new pin: drop the edit if upstream has the fix, otherwise re-anchor it).

- *No Logon without a connection.* QuickFIX v1.16.0 generates and persists a Logon for an initiator session whose
  connection was just dropped (`Session::disconnect()` only queues the socket for `SocketMonitor::drop()`, and
  `SocketInitiator::onStart()` ticks every connection through `onTimeout()` before the drop is processed), then
  fires `onLogout` twice. With a `MessageStoreAdapter` it is also costly: each store call of that extra tick retries
  the poisoned store's `load()` on the engine's only network thread, stalling every other session. The fix adds
  `&& m_pResponder` to the guard in `Session::next()` (`test/session.test.ts`).
- *A dropped socket is closed only once its disconnect is delivered.* `SocketMonitor::drop()` closed the fd at once
  and queued it for the next `block()`. A reconnect due in the `onTimeout()` between the two got the same fd number
  (POSIX hands out the lowest free one), the queued `SocketInitiator::onDisconnect(fd)` matched the new pending
  connection first and tore it down, and the dropped session was never `setDisconnected()`: it stayed in
  `Initiator::m_connected`, never redialled, its sends stored and never delivered. A store call that stalls the
  network thread past `ReconnectInterval` and then fails makes that window near-certain. The fix moves the
  `socket_close()` from `drop()` to `block()`, after `onError(fd)`, and has the destructor close drops still queued;
  both `SocketMonitor_UNIX.cpp` and `SocketMonitor_WIN32.cpp` (`test/reconnect.test.ts`).
- *A store failure in the queued-message pass disconnects.* `Session::next(Message)` calls `nextQueued()` after its
  `try`/`catch`, and `nextQueued()` increments the target seqnum itself for a queued Logon or ResendRequest
  (`Session.cpp:1157` from `:1308`), so an `IOException` there escaped the network thread: `std::terminate`. It takes
  a peer whose Logon was too high and whose GapFill ends exactly at it, then a failed increment: a `FileStore` write
  error, or a `MessageStoreAdapter` that rejects, times out or is already poisoned. The fix wraps that one call in the
  handler `next(Message)`'s own `try` ends with (log the error, disconnect); the other `nextQueued()` callers already
  run inside that `try` (`test/store.test.ts`).

These are the only changes to QuickFIX's sources; anything else upstream does wrong is worked around in the binding or
documented.

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

**One environment at a time, many environments per process.** The addon is context-aware: Node runs its `Init` once
per environment that imports it, which with `worker_threads` is the main thread plus every Worker. Anything `Init`
creates for an environment, in particular the constructors of the exported classes, is therefore kept in that
environment's **instance data** (`AddonData`, `cpp/addon_data.h`, set with `env.SetInstanceData`) and read back with
`AddonData::Get(env)`, never in a module static: a static `Napi::FunctionReference` is a reference into *one*
environment, and the next Worker's `Init` would overwrite it, deleting the previous environment's reference from the
wrong thread and leaving the main thread building its instances from a dead one. The state that *is* process-wide
is QuickFIX's own session registry (`FIX::Session::lookupSession` is keyed by `SessionID` across every environment)
and the `SessionOpGate` registry that mirrors it, both mutex-protected; a `SessionID` live in one Worker is a
"Duplicate Session" in another.

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
  JS-->>BR: fulfill SyncChannel (edited message copy / error)
  BR->>QF: assign edited copy or throw FIX exception
```

- **Fire-and-forget** callbacks never block the QuickFIX thread.
- **Synchronous** callbacks (which may mutate the outbound message or throw to reject) use a `BlockingCall` plus a
  shared `SyncChannel` (mutex + condition variable). An RAII guard **always** fulfils the channel — even if the JS
  handler throws — so the QuickFIX thread can never deadlock waiting on it.
- The message crosses the bridge as a **deep copy of the `FIX::Message`** in both directions, never as its wire
  string. QuickFIX parsed it with the session's data dictionary, so its repeating groups are structured; re-parsing
  a string without that dictionary would flatten them, and `getGroup` in a handler (or a group added in `toApp`)
  would be lost.
- The message also carries the **session dictionary**, so `setField` & co. route its header/trailer fields as the
  parser does. The bridge caches, per session, a copy of the session's `DataDictionaryProvider` (which shares its
  dictionaries' ownership) taken on the QuickFIX thread, so a message kept by JS can outlive its session safely.
- The trampoline (`CallJs`) **catches what a stopping environment throws** and lets the callback pass through; any
  other `Napi::Error` (a throwing handlers getter, a failed wrapper) is rethrown and surfaces as an uncaught
  exception, and any other C++ exception is swallowed, since it would `std::terminate` the process. A Worker's
  `terminate()` marks its environment unable to call into JS from the parent thread, at any moment, while the
  Worker's loop still dispatches what the TSFN holds (and the callback whose handler is running): from then on every
  Node-API call that may run JS fails, and the node-addon-api wrappers throw a `Napi::Error` for it, which the
  trampoline treats exactly as it treats a callback arriving after `Deactivate()`. The one failure the wrappers
  cannot build their error for is a handler interrupted mid-call: V8 reports the termination as a pending exception
  whose value is `null`, and wrapping a non-object exception needs a call that fails in a stopping environment and
  would abort the process. The build defines `NODE_API_SWALLOW_UNTHROWABLE_EXCEPTIONS` (`CMakeLists.txt`) so that
  node-addon-api treats that failure as success; the trampoline then probes the environment (`CanCallIntoJs`, only on
  that failure path) to tell an interrupted handler from one that threw, so the interruption is not reported to
  QuickFIX as a throw.

---

## 4b. The message-store bridge (JS store → C++ threads)

`JsMessageStoreFactory` / `JsMessageStore` (`cpp/js_message_store.{h,cpp}`) implement QuickFIX's `MessageStore`
over a JS `MessageStoreAdapter`, so session state can be persisted write-through in any database Node can reach
without a client library in the prebuild. The direction is the reverse of the Application bridge: QuickFIX calls the
store synchronously, under `SessionState::m_mutex` (`SS`), from whichever thread touched the session, and that thread
has to wait for a JS result. The user-facing contract (what an adapter must do, what the application observes) is the
README's "Message store"; this section is the mechanism behind it.

```mermaid
sequenceDiagram
  participant QF as QuickFIX / libuv thread (holds SessionState mutex)
  participant ST as JsMessageStore
  participant TSFN as store TSFN
  participant JS as JS main thread
  participant AD as TS bridge → user adapter

  QF->>ST: set(seq, msg) / incrNextSenderMsgSeqNum() ...
  ST->>TSFN: BlockingCall + Channel(id), wait with deadline
  TSFN-->>JS: CallJs trampoline
  JS->>AD: bridge.setMessage(sid, seq, msg)  (always a Promise)
  AD-->>JS: promise.then(onFulfilled.bind(id), onRejected.bind(id))
  JS-->>ST: continuation looks the channel up by id, fulfils it
  ST->>QF: return / throw IOException, cache updated after the ack
```

- **Shape.** One adapter object per engine, keyed by `SessionID` (the adapter receives the id on every call). The
  TS `StoreBinding` (`src/store.ts`) hands the factory a *bridge* object: `load(sid) → state | null`,
  `create(sid, state)`, `setSeqNums(sid, s, t)`, `setMessage(sid, seq, msg)`, `getMessages(sid, b, e) → string[]`,
  `reset(sid, state)`, each always returning a Promise (`settle()` normalises a sync return or throw), plus a
  `storeError(sid, method, message, poisoned, late)` reporter. The TS layer owns validation: `validLoad()` /
  `validMessages()` check every `load()`/`getMessages()` result (a malformed one, or a seqnum that is not a positive
  safe integer, rejects the call like any adapter failure), and `createEngine()` checks `storeTimeoutMs`. The native
  side only converts what it is handed; `ReadSeq()`, `FromDate()`, `ReadSeeds()` and `ReadTimeout()` assert it again
  with an `internal:` message so nothing malformed is converted silently.
- **Dispatch rule.** The store is called by the engine's network thread, a `sendToTarget()` worker
  (`Session::sendRaw`), a `SessionOpWorker` (`setNext*`, `refresh`), the stop worker
  (`Initiator::stop()` → `logout()`), and the JS thread itself for the engine constructor (`Session::Session` reads
  the creation time and may `reset()`) and destructor. The JS thread may take `SS` only there, when no other thread
  owns the session (the issue #29 spike). On the JS thread the bridge is called directly (`CallDirect()`) and the
  Promise is not awaited: the TS `StoreBinding` collects it and `Initiator.create()` awaits it, tearing the engine
  down on rejection. On every other thread the call goes through a **dedicated** `TypedThreadSafeFunction` with
  `BlockingCall` and a promise-aware channel (`cpp/sync_channel.h`, the same `SyncChannel` + `PendingChannels` the
  Application bridge uses), released by the promise continuation, by the per-call deadline (`storeTimeoutMs`), or
  by `Deactivate()`/`Abort()` during teardown (→ "aborted" → `IOException`, never a fake success). The trampoline
  (`CallJs`) does not run the adapter for a call nobody waits on: once deactivated, or when the waiter's deadline
  passed while the call sat in the queue behind a busy loop. Such a call is *dropped unrun* and counts as a late
  settlement that wrote nothing (a stale `setMessage` run then could commit over the retry's row). The TS layer
  calls the adapter itself, outside the engine, for the preload (`load()`/`create()` before the engine exists) and
  `close()` (after `stop()` settled), each bounded by `withTimeout()`.
- **Cache.** Sequence numbers and the creation time live in a `MemoryStore` cache (upstream's `PostgreSQLStore`
  layout), updated **after** the adapter acknowledged (DB-first; upstream's `incr*` bump the cache first), so a
  rejected write leaves cache and database equal. The engine's getters read it; `SessionWrap::getExpected*` on the
  JS thread read it (`CachedNextSender()`/`CachedNextTarget()`, which throw while the store is not healthy) through
  a process-wide `SessionID → JsMessageStore` registry (`Lookup()`), written only on the JS thread, without entering
  `FIX::Session` (whose getters take `SS`, see §5). The cache mutex `C` is a leaf, never held across a JS call;
  nothing that logs or reports runs under it.
- **Continuation lifetime.** The two continuations are created once per factory and bound per call to a channel id
  (`Function.prototype.bind`); they capture a `shared_ptr` to the pending-channel registry, never a channel, so no
  per-call native closure — and no finalizer running at GC time — ever races the waiting thread for the channel's
  ownership (the spike's TSan finding). The waiting thread registers the channel, waits, and erases it; a
  continuation finds it by id under the registry lock and fulfils it there. A channel whose waiter timed out stays
  registered as *expired*, so the continuation that settles it later can tell it was **late** (`OnSettled()` →
  `SettledLate()`) before erasing it.

### The store's state model

`JsMessageStore::Health` says whether the cache can be trusted to match the adapter's row:

| Health | Meaning | Left by |
| --- | --- | --- |
| `kOk` | cache and row agree | — |
| `kPoisoned` | a fatal call failed; the cache may disagree with the row | a reload through `load()` that succeeds |
| `kResetPending` | a `reset()` failed; the cache already holds the reset numbers | that reset, retried with its original timestamp (`RetryReset()`), succeeding |

Next to it: `reloadInFlight_` (a reload runs through the bridge with `C` released, one at a time; orthogonal to
`Health`, since `refresh()` reloads a healthy store too), `unsettled_` (timed-out fatal calls and reload `load()`s
whose Promise has not settled) and `unsettledSets_` (timed-out `setMessage`s per seqnum, not part of the poison).
Only the transitions write them, all under `C`: `EnterPoison()` (a fatal call failed: `kOk → kPoisoned`, a pending
reset stays pending; a timed-out call is counted unsettled), `MarkResetPending()` (`reset()` failed on a poisoned
store: `kResetPending` at its timestamp, superseding an earlier pending one, and the cache takes the reset numbers),
`BeginReload()`/`EndReload()` (success: `kOk`; failure: a healthy store is poisoned unless a teardown aborted the
reload, a poisoned one keeps its health and records the new error; a timed-out step counts as unsettled) and
`CountUnsettled()`.

Every store call first asks `Decide(caller)` what to do, through `Triage()` (which also marks the reload in flight)
and then `Gate()` or `Recover()`:

| Health | First match, top to bottom | `kCall` (writes, `get()`, `getCreationTime()`) | `kGetter` (seqnum getters) | `kRefresh` (`refresh()`) |
| --- | --- | --- | --- | --- |
| `kOk` | | proceed | proceed | reload (proceed if one is in flight) |
| not `kOk` | `unsettled_ > 0` | refuse: "a timed-out call has not settled yet" | refuse | refuse |
| | `reloadInFlight_` | refuse: "reload in progress" | refuse | refuse |
| | JS thread (a bridged call would abort) | refuse | refuse | refuse |
| `kPoisoned` | otherwise | reload, then proceed | refuse | reload |
| `kResetPending` | otherwise | retry the reset, then proceed | retry the reset | retry the reset |

`Recover()` runs the step without `C` (`Reload()` or `RetryReset()`), applies `EndReload()`, then logs and reports.
A failed step on a poisoned store is logged, reported (poisoned) and thrown as `IOException` to the caller; on a
healthy store's `refresh()` it is reported as a fresh poison and not thrown; a teardown abort is never reported (a healthy
store's `refresh()` aborted that way stays healthy and flags the calling thread, so `Session.refresh()` still rejects). `Reload()` applies `load()`'s state; a `null` result means
the row is gone, and as upstream's `refresh()` does (`m_cache.reset(now)`, then `populateCache()` INSERTs a 1/1 row,
`PostgreSQLStore.cpp:107-127`) the numbering restarts at 1/1 with a new creation time, persisted through `create()`
before the cache takes it.

What each method's failure does (`Forward()`'s `fatal` flag, `SettledLate()`):

| Call | Rejected / threw / malformed / timed out | Settled after its timeout, or dropped unrun |
| --- | --- | --- |
| `setSeqNums`, `reset` | poison (`IOException`, `storeError` poisoned); a timeout counts unsettled | unsettled −1; reported (poisoned, late) |
| a reload's `create()` (missing row) | as `setSeqNums` | as `setSeqNums` |
| a reload's `load()` | a healthy store's `refresh()`: poison; a poisoned store stays poisoned; a timeout counts unsettled | unsettled −1; not reported, result discarded |
| `setMessage` | `IOException` + non-poisoning `storeError`; a timeout counts `unsettledSets_[seq]` | `unsettledSets_[seq]` −1; reported (late, not poisoned: "set(N) is accepted again") |
| `getMessages` | `IOException` + non-poisoning `storeError` | discarded |
| any, `kAborted` (teardown) | `IOException`, no report, no poison | — |

Why poison: the engine cannot know whether a rejected or late write committed. A late increment leaves the cache one
behind the row; a late reset leaves the old numbers in the cache while the row says 1/1 with the messages gone. A
poisoned store fails every write at once with `IOException`, inside `sendRaw()`'s `try`, so nothing stamped from its
cache reaches the wire. The poison lifts only once every timed-out write has settled (so a late write has landed) and
a reload has run. Who reloads: a write's `Gate()`, or `getCreationTime()`, which QuickFIX reads first in every
network-thread pass over the session (the tick `Session::next()`, `Session::next(Message)`, `setResponder()`), before
any seqnum read; with `NonStopSession=Y` QuickFIX never reads it, so the next write. A failed reload keeps the store
poisoned for the next attempt; a timed-out one counts as unsettled too, so a stalled adapter costs one timeout, not
one per call, until its `load()` settles. While the poison cannot lift, every inbound message ends in an
`incrNextTargetMsgSeqNum()` that throws, so QuickFIX disconnects the session at its next inbound message (a heartbeat
at the latest); a failure of that inbound write itself disconnects at once.

**The pending reset.** A failed `reset()` is not undone by a reload, which would restore the numbers QuickFIX meant
to discard (a `ResetOnLogon=Y` Logon would leave with the old `MsgSeqNum` and no `ResetSeqNumFlag`). It stays
pending, and the "reload" that lifts the poison is the reset itself, retried with its original timestamp (idempotent,
so repeating one that landed late is harmless; a timed-out retry is unsettled like a timed-out `reset()`). The cache
takes the reset numbers at once, as upstream's stores do (cache first), so a Logon's `ResetSeqNumFlag`
(`shouldSendReset()`) and its `MsgSeqNum` (`fill()`) both read 1 whichever of their retries lands; the seqnum getters
retry it too (it cannot move the cache). Until it lands, QuickFIX reads 1/1 while the row still holds the old numbers,
and JS's `getExpected*()` throw. A `reset()` that failed on a healthy store (only a teardown abort does) leaves
nothing pending.

**The seqnum getters never move the cache.** While poisoned they retry a pending reset and nothing else; a reload
happens only in a write's `Gate()` or in `getCreationTime()`. So the reads of one pass agree up to its next write
(`shouldSendReset()` and `fill()`, `verify()`'s too-high/too-low checks, `nextLogon()`, `nextResendRequest()`), and a
poisoned store costs one reload attempt per pass and per write, not one per read. A write's own reload can still move
the cache under an earlier read; the fences below catch that.

### Fences

Each is refused like a non-fatal adapter failure — `IOException` (inside `sendRaw()`'s `try` on the send path, so
nothing is sent) plus a non-poisoning `storeError` — unless noted.

- **2^53 (`CheckSafeSeq()`).** The dispatcher hands seqnums to JS as doubles, exact only up to 2^53-1, so a larger one
  would arrive rounded and the adapter would persist a number the engine never had. `set()` and `setNext*()` (hence
  `incr*()`) refuse it before the gate and before `Forward()`; nothing reached the adapter, cache and row are still
  equal, hence no poison. The counterparty can reach it: a `SequenceReset` with `GapFillFlag=N` carries a 64-bit
  `NewSeqNo` into `setNextTargetMsgSeqNum()`; QuickFIX's handler then disconnects. Values coming back are refused by
  the TS validation (`ReadSeq()` asserts it).
- **The stamp (`CheckStamp()`).** `Session::persist()` stores the message under the `MsgSeqNum` `fill()` stamped,
  which is the next sender seqnum unless the cache moved in between: on a poisoned store the stamp came from the
  cache and this `set()`'s gate, or the network thread's `getCreationTime()` between `fill()` and `persist()`
  (`sendRaw()` holds `Session::m_mutex`, not `SS`, across them), reloaded it; or a `Session.setNextSenderMsgSeqNum()`
  worker took `SS` while `sendRaw()` ran `toApp`/`toAdmin` (the setter does not take `Session::m_mutex`, see
  `session_wrap.cpp`). `set()` refuses a stamp that is no longer the next sender seqnum.
- **`PersistMessages=N`.** `persist()` then calls `incrNextSenderMsgSeqNum()` alone, with no `MsgSeqNum` to check: a
  store poisoned on entry means the message was stamped from a poisoned cache, so it is refused even if this call's
  reload lifts the poison.
- **The inbound increment.** `incrNextTargetMsgSeqNum()` on a store poisoned on entry whose own reload moved the target
  seqnum: the message was accepted (`verify()`) against a number the store no longer holds. It is not counted and is
  reported, but **not thrown**: the reload left cache and row equal, so there is nothing to disconnect for, and
  `nextQueued()` reaches this call past `Session::next(Message)`'s handlers (`Session.cpp:1157` from `:1308`), where
  only the carried fix (§2) keeps a throw from being `std::terminate`. Nor does it poison. QuickFIX's own sequence checks reconcile:
  the peer's next message is too low (Logout + disconnect) or too high (ResendRequest). A reload by another thread's
  write in that window lifts the poison first and goes unnoticed, as a setter's move does with upstream's stores.
- **`NonStopSession=Y`.** QuickFIX never reads the creation time, so a poisoned initiator's reconnect
  (`ResetOnLogon=N`, `RefreshOnLogon=N`) stamps its Logon from the cache and only `persist()` reloads: if that moved
  the sender seqnum (a late write landed) the Logon is refused by the stamp check and the attempt ends at
  `LogonTimeout`; the next one goes out right.
- **One seqnum's timed-out `setMessage` (`CheckUnsettledSet()`).** A `setMessage(N)` that timed out may still commit,
  on a connection pool after the retry's write for N, and a resend of N would then deliver the message whose send
  failed. Until it has settled (or was dropped unrun), `set(N)` is refused, so the next message waits for it. Only
  `set(N)`: every other number is a different row, and the seqnum cannot move past N without a reset, a setter or a
  reload (`persist()` throws before its increment). A late write landing after a `reset()` leaves an old row at
  N ≥ the next sender seqnum, which no resend serves and the new numbering's `set(N)` overwrites once it may.
- **The unsettled counters** are written by `CountUnsettled()` only, and not clamped at 0: the waiter counts its
  timed-out call only after `Call()` returned, so a late settlement racing that window takes the counter to −1 for a
  moment and the increment brings it back. Safe, because the waiter holds `SS` throughout and no store call reads the
  counter meanwhile; every expired call is counted exactly once (`CallDirect()` never times out, teardown leaves
  nothing late, `CallJs()` settles what it drops), so the count is exact once both have run.

### Members that never throw into QuickFIX

Each has a call site with no `IOException` handler; a throw there is `std::terminate` on the acceptor (observed) and,
on the initiator's connect path, swallowed with the session left "pending" for good.

| Member | Unguarded call site | Instead of throwing |
| --- | --- | --- |
| `reset()` | `Session::disconnect()` (`ResetOnDisconnect=Y`) inside `Session::next()`'s own `catch (IOException&)`; `Session::reset()` from `setResponder()` outside the session period | poison (pending reset) + report |
| `refresh()` | `Session::setResponder()` on the connect path (`RefreshOnLogon=Y`) | poison + report; `SessionOpWorker` reads `Poisoned()` (and `TakeRefreshAborted()`) afterwards and rejects |
| `getCreationTime()` | `setResponder()` → `checkSessionTime()` | reload attempt, then the cached value |
| `getNextSenderMsgSeqNum()` | `generateLogout()` → `fill()` before `sendRaw()`'s `try`: `Session::reset()` on the connect path, and QuickFIX's own `catch (RejectLogon&)` / `catch (UnsupportedVersion&)` | the cached value (a pending reset retried) |
| `getNextTargetMsgSeqNum()` | `nextQueued()`, after `Session::next(Message)`'s handlers, on every inbound message | the cached value (a pending reset retried) |
| `incrNextTargetMsgSeqNum()`, inside a QuickFIX handler (`std::current_exception()` set) | `catch (UnsupportedVersion&)` increments with no guard (observed: a wrong BeginString from the peer) | failure recorded (poison / `storeError`), cache left as is; the Logout that handler sent sets `sentLogout()`, so the logout timeout disconnects |

No stale number reaches the wire through these: `persist()`'s writes still throw inside `sendRaw()`'s `try`. With the
sender getter never throwing, a poisoned initiator's Logon fails at `persist()` after `generateLogon()` marked it
sent, so that connection attempt ends at `LogonTimeout`. (`nextQueued()` can also call `incrNextTargetMsgSeqNum()`
outside `next(Message)`'s `try`, for a queued Logon or ResendRequest at exactly the expected seqnum. That exposure is
upstream's own, a `FileStore` write failure terminated there too; the build carries a fix that disconnects instead,
see §2.)

### Timeout, reports, teardown

- **Timeout.** `storeTimeoutMs` (default 30 s, 0 = none) bounds how long a QuickFIX thread can be parked: a
  never-settling adapter would otherwise freeze every session of the engine and make a graceful `stop()`
  (`Initiator::stop()` → `logout()` takes `SS`) and process exit wait on it forever. The calls the TS layer makes
  itself (preload, the constructor-time `reset()`, `close()`) are bounded by the same value (`withTimeout()`).
- **Reports.** `storeError` events carry `poisoned` and `late` as arguments. They originate in native (only it knows
  about timeouts, late settlements and poison), except `close()` failures and writes abandoned at teardown, which the
  TS binding reports itself. Native reports go through the bridge's `storeError` callback: called directly on the JS
  thread, or queued through the store TSFN (`NonBlockingCall`) from a waiting thread, so one can arrive after the
  failed send's Promise settled. The session-log event is written only from the waiting thread, which already holds
  `SS` (re-entrant for its owner); the JS thread must never take it.
- **Teardown** mirrors the Application bridge on every path: `Teardown()` deactivates the store bridge *before* the
  Application bridge and before the force-stop (a network thread parked in a store call holds the mutex
  `Initiator::stop()` takes); `stop(true)` deactivates it on the JS thread before queuing the stop worker; a graceful
  `stop()` keeps it serving (its writes are legitimate, each bounded by the timeout) and releases it in
  `DestroyStoppedEngine()`, where the rooted bridge object is dropped too (#28 shape); `ref()`/`unref()` apply to both
  TSFNs. The trampoline refuses to run the adapter once deactivated, so a call nobody waits on cannot land after
  `close()`.
- **Abandoned writes.** Teardown abandons a call, it cannot cancel it: `Deactivate()` wakes every waiter and marks
  every registered channel done, a timed-out one included, so a Promise that settles afterwards is dropped by
  `OnSettled()` and the native fence (poison, unsettled counters) ends with the engine, while the adapter's write may
  still commit. The fence past the engine is in the TS binding, which sees every adapter Promise. `trackWrite()`
  records each write (`create`, `setSeqNums`, `setMessage`, `reset`; reads are not tracked) in a per-realm registry
  keyed by session (a global symbol, so the ESM and CJS builds share it) until it settles. `preload()` first drains
  the session's pending writes, bounded by the new engine's timeout, and fails with `IOException` naming the session
  and method if one is still pending. `closeAll()` runs a session's `close()` only after the engine's own pending
  writes of that session settled (bounded; at the bound it reports and skips `close()`); with `stop(true)` it does
  not wait, but tracks the deferred `close()` like a write so the next `create()` waits for it too. `detach()` marks
  the moment the engine can no longer wait for a call (`stop(true)`: at once, undone by `detach(false)` if the native
  side refused the stop; graceful: once the native stop settled): from then on each pending write that settles is
  reported as a late, non-poisoning "abandoned at teardown". A write can only settle on the loop of the realm that
  issued it, so a terminated Worker takes it along unsettled, which is the cross-process case: not fenced.

---

## 5. Why `start` / `stop` / `sendToTarget` are async

These calls make QuickFIX invoke synchronous callbacks that must round-trip to the JS main thread. If they ran **on**
the main thread, the main thread would block waiting for a `BlockingCall` that only the (now-blocked) event loop can
service — a deadlock. The fix: run the blocking QuickFIX call on a libuv worker thread via `Napi::AsyncWorker` and
return a `Promise`, keeping the event loop free to run the bridge trampoline.

```mermaid
flowchart TD
  subgraph MAIN["JS main thread (event loop stays free)"]
    CALL["await sendToTarget(msg, id)<br/>resolve the owning engine's gate"]
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

Synchronous, non-blocking members stay sync: `isLoggedOn()` (it reads the sessions' flags, never the engine mutex;
see "Lock order" below), `getSessions()`, `getSession()`, `ref()`, `unref()`, and the entire pure layer (`Message`, `SessionID`, `SessionSettings`, `DataDictionary`). On GC and on environment
teardown (the loop drained, a Worker ending), a cleanup hook deactivates the bridge and force-stops the engine
**before** the TSFN is torn down, so a live session never crashes on shutdown.

`process.exit()` and a fatal exception (uncaught, or an unhandled rejection) take another path:
`Environment::Exit` → `DefaultProcessExitHandlerInternal` → `uv_library_shutdown()`, which joins the libuv threadpool
**without running the cleanup hooks**. A pool thread parked on a JS round trip at that instant (a `SendToTargetWorker`
in `CallSync` for toApp, or in a store call; a stop worker joining a network thread that is) would never be woken, and
the process would never exit. Both paths emit `'exit'` first, synchronously, so `src/native.ts` registers
`process.on('exit', () => native.prepareExit())` at module load. `prepareExit()` (`addon.cpp`) walks the engine wraps
of the environment (`AddonData::engines`, each wrap adds itself at construction and removes itself in its destructor)
and runs each one's `PrepareExit()`, the non-blocking half of `Teardown()`: `JsMessageStoreFactory::Deactivate()` (a
parked store call fails with `IOException` and frees the session mutex), `ApplicationBridge::DeactivateForExit()`,
and `SessionOpGate::RefuseWhileFrozen()`. No join, no TSFN operation: the engine stays as it is until the process is
gone. `DeactivateForExit()` differs from `Deactivate()` in what a woken or later callback does: it throws
`FIX::IOException` instead of passing through. QuickFIX contains that exception everywhere it calls the
`Application` (`Session::sendRaw` returns `false` before persisting, `Session::next(Message)` disconnects before
incrementing the target seqnum), so an exiting engine never sends what `toApp` might have vetoed or a Logon without
what `toAdmin` adds, and never advances a persistent store past an inbound message no handler saw.
`RefuseWhileFrozen()` covers an operation queued after a graceful stop's worker froze the gate: it would wait for the
`Unfreeze()` the JS thread runs when that stop settles, which never happens once the process is exiting, so it is
refused with `SessionNotFound` instead (never run under a freeze: in a Worker, whose cleanup hooks do run afterwards,
the destructor's `Freeze()` still precedes the engine's destruction). `test/exit.test.ts` covers each case in a child.

The promise a `start()`/`stop()` returns is the AsyncWorker's own. The early-return cases (already started or
stopped, a call in progress, the engine gone) build theirs where they settle it (`ResolvedPromise` /
`RejectedPromise`, `engine_workers.h`): a `Napi::Promise::Deferred` created up front and then not used is never
settled, and its `napi_deferred` is a strong handle that roots the Promise for the rest of the process — one per
call, which is how 0.3.1 leaked.

### `Session`: which members are synchronous

`SessionWrap` is a handle on an engine-owned `FIX::Session`. The rule for what may run on the main thread is the
lock, not the I/O: a main-thread call must never take a mutex that another thread may hold **while it waits on the
JS event loop**. Two QuickFIX mutexes are held that way. `Session::m_mutex` (`S`) is held across application
callbacks (`sendRaw` holds it across `toAdmin`/`toApp`; `disconnect` across `onLogout`), each a `BlockingCall` that
needs the loop. `SessionState::m_mutex` (`SS`) is held across every message-store call (`SessionState::set`,
`incr*`, `get`, `reset`, `refresh`, and the getters `getNext*`/`getCreationTime`), and with a JS message store
(§4b) each of those is a wait on the loop too, from whichever thread runs it: the engine's network thread, or a
`sendToTarget` libuv worker running `Session::sendRaw`. A main-thread call taking `S` or `SS` would then wait on a
thread that is waiting on the main thread: a deadlock of the whole process, reproduced for `SS` in the issue #29
spike. The members split accordingly:

| Members | Thread | Why |
| --- | --- | --- |
| `isLoggedOn` · `isEnabled` · `sentLogon` · `sentLogout` · `receivedLogon` · `isInitiator` · `isAcceptor` · `isSessionTime` · `isLogonTime` · option getters/setters | sync, main | Read/write plain members of `FIX::Session`; no lock, no callback. |
| `getExpectedSenderNum` · `getExpectedTargetNum` | sync, main | For a `file`/`memory` store: `FIX::Session::getExpected*` → `SessionState::getNext*` under `SS`, which no thread holds across a wait on the loop in that configuration (the store is in-process). For a JS store the handle bypasses `FIX::Session` and reads the `JsMessageStore` cache under the store's own leaf mutex (§4b); `SS` is never taken on the main thread. |
| `setNextSenderMsgSeqNum` · `setNextTargetMsgSeqNum` · `logon` · `logout` · `refresh` | `SessionOpWorker` (libuv), Promise | Each takes `SS` (`setNext*`/`refresh` through the store; `logout`/`logon` through `logoutReason`), so they run on a worker under the engine's `SessionOpGate`, exactly like `SendToTargetWorker`: the loop stays free to serve the store call the holder is waiting on. The TS `Session` serialises the five per session (a module-level chain keyed by `sessionID.toString()`, since every `getSession()` hands out a fresh handle), so `logout(); logon();` still lands in program order. Their latency is that of the pool: they queue behind in-flight `sendToTarget` workers, each of which may be parked in a store write. The setters are not serialised against the engine, though: `Session::sendRaw` holds `S` across `fill()` (reads the next sender num into the header), `toApp`/`toAdmin` and `persist()` (`incrNextSenderMsgSeqNum`), and `Session::next()` across the target-num check, `fromApp`/`fromAdmin` and `incrNextTargetMsgSeqNum`; a target setter landing inside that window is overwritten by the increment and the session ends up one off from the peer; a sender setter landing between `fill()` and `persist()` makes `set()` refuse the message (`CheckStamp()`: not sent, a non-poisoning `'storeError'`). The setters are for a quiescent session (before `start()`, from a `'logout'` event, never from a handler). `enabled` is a plain `bool` that `logon`/`logout` write with no lock while the network thread reads it in `Session::next()`: formally a data race, the same one `Initiator::stop()` makes from the stopping thread, benign in practice (the flag is picked up on the next pass). TSan reports it, with QuickFIX's other upstream races (`FIX::Mutex`'s recursion bookkeeping, the heartbeat timestamps a `sendToTarget` worker's `fill()` writes); `scripts/tsan-gate.py` lists them without failing the run. A `'logout'` listener fired by a graceful `stop()` that calls `setNext*` either runs before the stop worker's `Freeze()` and succeeds, or parks on the gate until the engine is destroyed and rejects `SessionNotFound`. |

`FIX::Session::disconnect()` and `reset()` (which calls it) are **not exposed**, and not only because they take
`m_mutex` and fire callbacks (that alone would just make them AsyncWorkers, like `sendToTarget`). Through the
session's responder they reach `FIX::SocketMonitor::drop()`, which erases from the monitor's socket sets and pushes
onto its dropped queue with **no lock**, while the engine's network thread iterates those same sets in
`SocketMonitor::block()`. QuickFIX only ever calls them from that thread itself (timeouts, logout handling,
remote disconnects); from any other thread they are a data race with a crash window of a few instructions
(upstream quickfix/quickfix#346, closed "not planned"). There is no public hook to run code on the network thread,
and this binding does not carry a patch for it (it carries three others, see §2), so the supported way to bring a session down is `logout()` — exactly
what `Initiator::stop()` itself does — and to renumber it, the sequence-number setters.

**Lifetime.** `FIX::Session` objects are owned by the engine and `FIX::Session::lookupSession` returns a raw,
non-owning pointer, so `SessionWrap` never caches it: it stores the `FIX::SessionID` by value and re-resolves on
**every** call, throwing `QuickFixError{fixErrorName: 'SessionNotFound'}` when the session is gone. The registry
`lookupSession` reads is keyed by `SessionID` alone, and a stopped engine's ids may be taken by a new engine (below),
so re-resolving the id is not enough: a handle also holds the `shared_ptr<SessionOpGate>` of the engine that owned
the session when it was created (`NewInstance`; `engine.getSession` passes its own gate, `lookupSession` the
registered one) and `Resolve()` requires `SessionOpGate::Lookup(id)` to still return that gate before it calls
`lookupSession`. Engines are created and destroyed on the JS thread, as is `Resolve()`, so the check cannot race;
the gate stays registered until the engine is destroyed, so a `'logout'` listener fired by a graceful `stop()`
still resolves. A handle not created through `NewInstance` (the exported constructor) has no gate and always
throws. QuickFIX only deletes sessions — and removes them from the registry
`lookupSession` reads — in the engine destructor, so `InitiatorWrap`/`AcceptorWrap` destroy their engine as soon
as `stop()` settles (all network threads are joined by then) rather than waiting for GC. That is what makes a stale
`Session` handle fail deterministically after `stop()`, and lets a new engine reuse the same `SessionID`s right
after the old one has been stopped. The same point is where the wrap breaks the only cycle that could keep it
alive: the bridge holds the handlers object strongly (so a started engine stays reachable through them, like a
`net.Server` through its listeners), the handlers close over the `Engine`, and the `Engine` holds the wrap — a
cycle through native memory the GC cannot see. `DestroyStoppedEngine()` calls `ApplicationBridge::DropHandlers()`,
which also frees the per-session dictionaries the bridge cached for its `Message`s; neither `Release()` nor
`Abort()` does, because callbacks queued before a graceful `Release()` (the `'logout'` events `stop()` fired) are
still dispatched afterwards and read the handlers. A wrap dropped without `stop()` keeps everything, and its TSFN
keeps the event loop alive, until the process exits. A `SessionID` that is still live is refused: both wrap constructors throw
`ConfigError` "Duplicate Session" (`RejectDuplicateSessions`, `engine_common.h`). QuickFIX itself does **not**
enforce that — its `Session` constructor ignores `addSession()`'s result and the only upstream "Duplicate Session"
check is within one `SessionSettings` — so without it a second engine silently shadowed the first in the registry.
The check has a corollary: `Initiator`/`Acceptor::initialize()` creates the sessions one `[SESSION]` at a time and,
if a later one throws `ConfigError`, unwinds without the engine destructor that would delete the ones already
created — they would stay registered with no owner, resolvable through `lookupSession` yet refused as duplicates
by every later engine. Both wrap constructors therefore catch the throw and delete those orphans
(`DestroyOrphanedSessions`, `engine_common.h`): the duplicate check just before guarantees every session of theirs
that exists at that point was created by the failed constructor. The same unwinding leaks the **engine-level
`Log`** that the `Initiator`/`Acceptor` constructor requests from the `LogFactory` (`create()` with no `SessionID`)
before `initialize()` runs — only the engine destructor hands it back, and QuickFIX's `FileLogFactory` does not
reclaim it either, so with `log: 'file'` each failed construction left two open streams. The wraps therefore hand
the engine a `TrackingLogFactory` (`engine_common.h`) that forwards to the real factory and remembers that `Log`;
on a failed construction they destroy it next to the orphaned sessions.

That eager destruction races with the worker-thread operations above, which hold a raw `FIX::Session*` between
`lookupSession` and the end of the operation. `session_op_gate.h` closes the race with a **per-engine** gate.
Each wrap owns a `shared_ptr<SessionOpGate>` and registers it for its `SessionID`s at construction (the duplicate
check above is what keeps the registry one-to-one). `sendToTarget()` resolves the gate of the engine owning the
id on the **JS thread**, before it queues its `SendToTargetWorker` (deriving the id from the message header first,
for the qualifier form); engines register and unregister on that thread only, so the lookup is exact and the send
is bound to the engine that owned the session when it was called — an engine registered later for the same id can
never be the one it runs on, however long the worker sat in the libuv queue. No registered gate means no engine
owns the session, refused as `SessionNotFound` without queuing anything. The worker then calls
`SessionOpGate::Acquire(gate, id)` on its thread and holds the returned `OpScope` for its whole `Execute()`.
`Acquire` re-reads the registry *after* the scope is held and keeps it only if the same gate is still the owner:
constructing the scope may have blocked across the owner's destruction, and a new engine may own the id by then —
holding the old gate would let the new engine's `stop()` destroy the session mid-operation. In that case the
operation is refused (`SessionNotFound`), not retried against the new owner: it was queued for the engine that is
gone, and sending it through the new engine's session (not logged on, so persisted in its store and sent on its
first logon) would be the cross-over `SessionWrap::Resolve()` refuses for `Session` handles. The engine's stop worker — on its **own** libuv thread, after `stop()`
has joined the network threads — calls `Freeze()` on *its* gate, which blocks new operations on *its* sessions and
waits for the in-flight ones to drain. Waiting on the worker thread rather than on the JS thread matters: an
in-flight `sendToTarget()` may be blocked in a `toApp` `BlockingCall`, which needs the JS loop free. A never-started
engine takes the same async path on `stop()`, since its sessions are registered from construction.

The destruction itself (unregister, delete the engine, `Unfreeze()`) runs on the JS thread, but **not** straight
from the worker's `OnOK`: the `'logout'` events a graceful `stop()` fired are fire-and-forget TSFN calls still
queued in the bridge, and nothing orders their dispatch before the AsyncWorker completion. So for a graceful stop
`OnOK` queues the destruction — together with the settlement of the `stop()` promise and the owner reference that
keeps the wrap alive — through the bridge's own FIFO (`ApplicationBridge::RunAfterQueued`, a `kBarrier` item)
behind those events, then releases the TSFN; the TSFN is ref'd for that drain so an `unref()`'d engine's `stop()`
still resolves. `stop(true)` aborts the TSFN (discarding queued events) and destroys immediately. If `stop()`
itself threw, the engine is left intact, the gate unfrozen and `stopped_` cleared so a later `stop()` or the
destructor's `Teardown()` retries — the network thread may still be running, so destroying would be unsafe.
`Teardown()` (the env cleanup hook and the destructor) runs once, keyed on its own `tornDown_` flag rather than on
`stopped_`, which is set for the whole duration of an in-flight `stop()`: if the stop worker is still running, it
first deactivates the bridge (waking any `BlockingCall` the worker's `Freeze()` may be waiting behind) and then
waits for the worker's operation to return (`StopCompletion`, `engine_workers.h`) before force-stopping — a no-op if
the worker's `stop()` completed — and destroying the engine. Node drains the thread pool before it runs cleanup hooks
or finalizers, so that wait is expected to return at once; it makes the ordering a property of this code rather
than of Node's shutdown sequence.
Because the settlement is deferred, `stopped_` is set long before the engine is gone; a `stop()` made in that
window (typically from the `'logout'` listener the stop fired) must not resolve on the strength of `stopped_`
alone. The wrap keeps a reference to the in-flight stop's promise (`stopPromise_`) until it settles and returns
that same promise to any `stop()` made meanwhile, whatever its `force` argument.

The gate is per engine, not process-wide, for two reasons. Stopping engine A must not stall engine B's operations,
nor wait on them. And the wrap **destructor** (GC, JS thread) also freezes before destroying its engine: with one
gate per engine that only waits for operations on *this* engine's sessions, which cannot be blocked on the JS
thread because `Teardown()` has already deactivated this bridge and joined these network threads. A process-wide
gate would have made that finalizer wait for *another* engine's operation blocked in a `BlockingCall` that only the
JS thread can service — a deadlock.

Until `stop()` settles the engine is alive on the JS thread, so `engine.getSession()` / `engine.isLoggedOn(id)`
keep answering during a graceful stop (a `'logout'` listener can still read the final sequence numbers).

### Lock order

The locks and the two scheduling resources that behave like locks, with the order in which a thread may hold them
(`X → Y`: holds `X` while acquiring or waiting for `Y`):

| Symbol | What |
| --- | --- |
| `E` | `Initiator`/`Acceptor::m_mutex` (engine) |
| `R` | `Session::s_mutex` (the process-wide session registry; a leaf) |
| `G` | `SessionOpGate` (an `OpScope` in flight / `Freeze()` waiting) |
| `S` | `Session::m_mutex`, held across application callbacks |
| `SS` | `SessionState::m_mutex`, held across every message-store call |
| `LOOP` | the JS event loop as a resource: every `BlockingCall` waits for it to be free |
| `POOL` | a libuv threadpool slot (`UV_THREADPOOL_SIZE`, default 4) |
| `C` | `JsMessageStore`'s cache mutex (a leaf, never held across a JS call) |

```
E → R ;  E → SS → LOOP (initiator connect path) ;  POOL → G → S → SS → {LOOP, C} ;  SS → LOOP ;
SS → R (session-log event) ;  never LOOP → SS outside engine construction/destruction ;
never LOOP → E ;  never C → anything ;  an adapter's hot path → never POOL
```

`E → SS` is the initiator's: `Initiator::connect()` holds `Initiator::m_mutex` across `doConnect()` → the
`SocketConnection` constructor → `getSession(id, responder)` → `Session::setResponder()`, whose `refresh()`
(`RefreshOnLogon=Y`), `getCreationTime()` and, outside the session period, `reset()` are store calls. So the JS
thread never takes `E`: the no-argument `engine.isLoggedOn()` reads each session's `FIX::Session::isLoggedOn()`
flags (no lock) instead of calling `FIX::Initiator::isLoggedOn()`, which locks `E`; calling it was a loop freeze of
one `storeTimeoutMs` per reconnect attempt (`test/store-lock-order.test.ts`). `FIX::Acceptor` has no engine mutex.
The JS thread takes `E` only in the engine constructor (no network thread yet) and in `Teardown()`'s `stop(force)`,
after both bridges were deactivated (nothing waits on `LOOP` any more).

`SS` is held by "a QuickFIX or libuv thread": the engine's network thread, a `sendToTarget` worker running
`Session::sendRaw`, a `SessionOpWorker`, or the stop worker (`Initiator::stop()` → `logout()`). With a JS store each
of them may wait on `LOOP` under `SS`, which is why nothing on the JS thread may take `SS` (the `Session` members
that do run on workers, §5 table) and why `getExpected*` read the store cache `C` instead. A JS-thread `SS` is only
taken by the engine constructor and destructor, when no other thread owns the session. The one remaining cycle is
through the pool: four parked session operations plus an adapter that itself needs a pool slot to finish
(`POOL → G → S → SS → LOOP → adapter → POOL`), hence the last rule.

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
| Public TS API | `src/index.ts`, `message.ts`, `group.ts`, `session-id.ts`, `session-settings.ts`, `data-dictionary.ts`, `enums.ts` |
| Generated FIX constants | `scripts/gen-fields.mjs` → `src/generated/fields.ts` (`FIELD`), `scripts/gen-values.mjs` → `src/generated/values.ts` (value groups, `VALUES`) — both from the QuickFIX headers at the pinned tag |
| Engine + handlers | `src/engine.ts`, `initiator.ts`, `acceptor.ts`, `application.ts` |
| Message store | `src/store.ts` (`MessageStoreAdapter`, `MapMessageStore`, the `StoreBinding` bridge), `src/store/sql.ts` (generic SQL adapter, `sql/` schemas), `cpp/js_message_store.{h,cpp}`, `cpp/sync_channel.h` |
| TLS tunnel (initiators) | `src/tls-tunnel.ts` (`createTlsTunnel`) |
| Per-session control | `src/session.ts` (`Session`, `lookupSession`, `doesSessionExist`, `getSessions`, `numSessions`), `cpp/session_wrap.{h,cpp}` |
| Native loader | `src/native.ts`, `src/load-native.cjs` |
| Addon entry / wraps | `cpp/addon.cpp`, `cpp/*_wrap.{h,cpp}`, `cpp/field_map_ops.h` (field/group ops shared by `MessageWrap` and `GroupWrap`), `cpp/session_static.cpp` (`sendToTarget` + session lookups) |
| Bridge / async / errors | `cpp/application_bridge.{h,cpp}`, `cpp/sync_channel.h` (the reply channel + pending registry both bridges use), `cpp/engine_workers.h` (`EngineOpWorker`), `cpp/session_static.cpp` (`SendToTargetWorker`), `cpp/session_wrap.cpp` (`SessionOpWorker`), `cpp/errors.h` |
| Build / dist | `CMakeLists.txt`, `scripts/prebuild.mjs`, `tsconfig.*.json`, `package.json` |
| Tests | `test/*.test.ts`, `test/helpers.ts` (loopback harness), `test/store-adapters.ts` (store test doubles), `test/fixtures/` (reduced FIX 4.4 dictionary + loader, TEST-ONLY TLS certificates, child-process store scenarios) |
| CI | `.github/workflows/ci.yml` (build-test matrix, musl, ThreadSanitizer via `scripts/tsan.sh`, Postgres adapter), `.github/workflows/release.yml` |
