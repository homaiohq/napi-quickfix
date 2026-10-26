/**
 * Shared implementation for {@link Initiator} and {@link Acceptor}.
 *
 * Both are thin subclasses of {@link Engine} that differ only in which native
 * constructor they instantiate.
 */
import { EventEmitter } from 'node:events';
import {
  type NativeEngine,
  type NativeEngineConstructor,
  type NativeApplicationHandlers,
  type NativeMessage,
  type NativeSessionID,
} from './native.js';
import { Message } from './message.js';
import { SessionID, toNativeSessionID } from './session-id.js';
import { Session } from './session.js';
import {
  StoreBinding,
  isMessageStoreAdapter,
  isStoreBinding,
  withTimeout,
  type MessageStoreAdapter,
  type MessageStoreMethod,
} from './store.js';
import type { ApplicationHandlers } from './application.js';
import type { SessionSettings } from './session-settings.js';
import type { QuickFixError } from './native.js';

/** Options for constructing an {@link Initiator} or {@link Acceptor} with `new`. */
export interface EngineOptions {
  /** Parsed session settings ({@link SessionSettings.fromString}/`fromFile`). */
  settings: SessionSettings;
  /**
   * Synchronous application callbacks. These may mutate outbound messages and
   * throw to reject inbound ones (see {@link ApplicationHandlers}).
   */
  handlers?: ApplicationHandlers;
  /**
   * Message store: QuickFIX's file store (the default) or its memory store. A
   * {@link MessageStoreAdapter} is accepted by {@link Initiator.create} /
   * {@link Acceptor.create} only (its state has to be loaded before the engine
   * can be constructed); passing one here throws a `TypeError`.
   */
  store?: 'file' | 'memory';
  /** Log factory. Defaults to the engine's default. */
  log?: 'screen' | 'file' | 'none';
}

/** Options for {@link Initiator.create} / {@link Acceptor.create}. */
export interface CreateEngineOptions extends Omit<EngineOptions, 'store'> {
  /**
   * Message store: `'file'` (default), `'memory'`, or a
   * {@link MessageStoreAdapter} persisting through your own driver (README:
   * "Message store").
   */
  store?: 'file' | 'memory' | MessageStoreAdapter;
  /**
   * With an adapter: how long one adapter call may take before it is failed
   * with `IOException`, in milliseconds: every call an engine thread waits
   * on, and the ones `create()` and `stop()` await (`load()`/`create()` at
   * preload, a constructor-time `reset()`, `close()`), and, before the
   * preload, `create()`'s wait for the writes an earlier engine of one of its
   * sessions left pending (it rejects with `IOException` past it). Default `30_000`;
   * `0` disables the timeout, accepting that a stalled adapter then stalls
   * every session of the engine, a graceful `stop()` and process exit with
   * it. See the README for the trade-off. Passing it with `'file'`/`'memory'`
   * is a `TypeError` (it would silently do nothing).
   */
  storeTimeoutMs?: number;
}

/**
 * Events emitted (observe-only) by an {@link Engine}. Each mirrors a callback in
 * {@link ApplicationHandlers} but CANNOT mutate or reject — do that via
 * `handlers`.
 */
export interface EngineEvents {
  create: [sessionID: SessionID];
  logon: [sessionID: SessionID];
  logout: [sessionID: SessionID];
  toAdmin: [message: Message, sessionID: SessionID];
  fromAdmin: [message: Message, sessionID: SessionID];
  toApp: [message: Message, sessionID: SessionID];
  fromApp: [message: Message, sessionID: SessionID];
  /**
   * A {@link MessageStoreAdapter} call failed: it rejected, threw, returned
   * a malformed value, or timed out (`storeTimeoutMs`), or a timed-out call
   * settled afterwards. `poisoned` is `true` when the failure made the
   * session's store refuse every call until it has been reloaded from the
   * adapter (README: "Message store"). The next store call attempts that
   * reload once every timed-out write has settled; if it succeeds the poison
   * lifts and the session stays up (a rejected write on a send: that send
   * resolved `false`). While it cannot lift (a timed-out write still
   * unsettled, the adapter still failing), the engine disconnects the
   * session at its next inbound message, and reconciles sequence numbers
   * with the peer at the next logon; a failed inbound sequence-number write
   * disconnects it at once. Observe-only, like every event.
   */
  storeError: [sessionID: SessionID, method: MessageStoreMethod, error: QuickFixError, poisoned: boolean];
}

/**
 * Base class for the FIX session engines.
 *
 * Extends Node's {@link EventEmitter}: in addition to invoking your `handlers`,
 * the engine emits an observe-only event for each callback
 * (`'create' | 'logon' | 'logout' | 'toAdmin' | 'fromAdmin' | 'toApp' | 'fromApp'`).
 *
 * **Important:** mutation of outbound messages and rejection of inbound ones
 * MUST be done in `handlers` (which run synchronously and can throw); event
 * listeners run after and cannot affect the message or reject it.
 */
export abstract class Engine extends EventEmitter {
  /** @internal Underlying native engine handle. */
  readonly #native: NativeEngine;
  /** @internal The message-store binding when built with an adapter. */
  readonly #store: StoreBinding | undefined;
  /** @internal The in-flight `stop()`: a stop() made meanwhile joins it. */
  #stopping: Promise<void> | undefined;
  /** @internal The adapter's `close()` has run (it runs once per engine). */
  #closed = false;

  /**
   * @param Native The native engine constructor (`InitiatorWrap`/`AcceptorWrap`).
   * @param options Engine options.
   */
  protected constructor(Native: NativeEngineConstructor, options: EngineOptions) {
    super();

    // A MessageStoreAdapter needs its state loaded before the engine exists:
    // that is what the async create() factories do. They hand the constructor
    // an internal StoreBinding in `store`'s place; anything else that is an
    // object is a bare adapter passed to `new`.
    let store: 'file' | 'memory' | undefined;
    let binding: StoreBinding | undefined;
    if (isStoreBinding(options.store)) {
      binding = options.store;
    } else if (options.store === undefined || options.store === 'file' || options.store === 'memory') {
      store = options.store;
    } else if (isMessageStoreAdapter(options.store)) {
      throw new TypeError(
        `${new.target.name}: a MessageStoreAdapter must be passed to ${new.target.name}.create(), not to new ${new.target.name}()`,
      );
    } else {
      throw new TypeError(`${new.target.name}: store must be 'file', 'memory' or a MessageStoreAdapter`);
    }

    const userHandlers = options.handlers ?? {};

    // Bridge native handlers: wrap native handles into TS classes, invoke the
    // user's handler (preserving mutate/throw semantics — exceptions propagate
    // to the native bridge, which maps them to FIX exceptions), then emit the
    // observe-only event.
    const nativeHandlers: NativeApplicationHandlers = {
      onCreate: (id: NativeSessionID) => {
        const sid = SessionID.fromNative(id);
        userHandlers.onCreate?.(sid);
        this.emit('create', sid);
      },
      onLogon: (id: NativeSessionID) => {
        const sid = SessionID.fromNative(id);
        userHandlers.onLogon?.(sid);
        this.emit('logon', sid);
      },
      onLogout: (id: NativeSessionID) => {
        const sid = SessionID.fromNative(id);
        userHandlers.onLogout?.(sid);
        this.emit('logout', sid);
      },
      toAdmin: (m: NativeMessage, id: NativeSessionID) => {
        const msg = Message.fromNative(m);
        const sid = SessionID.fromNative(id);
        // Handler may mutate `msg` (writes go straight to the native handle).
        userHandlers.toAdmin?.(msg, sid);
        this.emit('toAdmin', msg, sid);
      },
      toApp: (m: NativeMessage, id: NativeSessionID) => {
        const msg = Message.fromNative(m);
        const sid = SessionID.fromNative(id);
        // May mutate or throw FixReject('DoNotSend') — do NOT swallow.
        userHandlers.toApp?.(msg, sid);
        this.emit('toApp', msg, sid);
      },
      fromAdmin: (m: NativeMessage, id: NativeSessionID) => {
        const msg = Message.fromNative(m);
        const sid = SessionID.fromNative(id);
        // May throw FixReject('RejectLogon', ...) — do NOT swallow.
        userHandlers.fromAdmin?.(msg, sid);
        this.emit('fromAdmin', msg, sid);
      },
      fromApp: (m: NativeMessage, id: NativeSessionID) => {
        const msg = Message.fromNative(m);
        const sid = SessionID.fromNative(id);
        // May throw FixReject('UnsupportedMessageType', ...) — do NOT swallow.
        userHandlers.fromApp?.(msg, sid);
        this.emit('fromApp', msg, sid);
      },
    };

    this.#store = binding;
    if (binding) {
      binding.emit = (method, sessionID, error, poisoned) => {
        this.emit('storeError', sessionID, method, error, poisoned);
      };
    }
    this.#native = new Native({
      settings: options.settings.nativeHandle,
      handlers: nativeHandlers,
      store: binding ? binding.bridge : store,
      storeStates: binding?.states,
      storeTimeoutMs: binding?.timeoutMs,
      log: options.log,
    });
  }

  /**
   * @internal Shared body of {@link Initiator.create} / {@link Acceptor.create}:
   * preload the adapter's state for every session the engine will own, build
   * the engine with the internal binding, and await the store calls the
   * constructor itself made (a `reset()` for a session constructed outside
   * its session time), tearing the engine down if one of them failed.
   */
  protected static async createEngine<T extends Engine>(
    connectionType: 'initiator' | 'acceptor',
    options: CreateEngineOptions,
    make: (options: EngineOptions) => T,
  ): Promise<T> {
    const { store, storeTimeoutMs, ...rest } = options;
    if (store === undefined || store === 'file' || store === 'memory') {
      if (storeTimeoutMs !== undefined) {
        throw new TypeError('storeTimeoutMs applies to a MessageStoreAdapter only');
      }
      return make({ ...rest, store });
    }
    if (!isMessageStoreAdapter(store)) {
      throw new TypeError("store must be 'file', 'memory' or a MessageStoreAdapter");
    }
    // Capped like the native check: above 2^31-1 a timer fires after 1 ms
    // (TimeoutOverflowWarning), failing every preload call as "timed out".
    if (
      storeTimeoutMs !== undefined &&
      (!Number.isInteger(storeTimeoutMs) || storeTimeoutMs < 0 || storeTimeoutMs > 2_147_483_647)
    ) {
      throw new RangeError('storeTimeoutMs must be an integer from 0 to 2147483647 (0 disables the timeout)');
    }
    const timeoutMs = storeTimeoutMs ?? 30_000;
    const ids = options.settings.getSessions(connectionType);
    const states = await StoreBinding.preload(store, ids, timeoutMs);
    const binding = new StoreBinding(store, timeoutMs, states);
    binding.collecting = [];
    let engine: T;
    let collected: Promise<unknown>[];
    try {
      engine = make({ ...rest, store: binding as unknown as 'memory' });
    } catch (err) {
      // The constructor threw (ConfigError): the store calls it made before
      // throwing, if any, are observed so none is an unhandled rejection.
      await Promise.allSettled(binding.collecting);
      throw err;
    } finally {
      collected = binding.collecting;
      binding.collecting = null;
    }
    try {
      // Only reset() is called on the JS thread (see createEngine's JSDoc).
      await withTimeout(Promise.all(collected), timeoutMs, 'reset');
    } catch (err) {
      await engine.stop(true).catch(() => {});
      throw err;
    }
    return engine;
  }

  /**
   * Start the engine (begins connecting / listening).
   *
   * Runs off the main thread, so the Node.js event loop stays free to service
   * the application callbacks/events the engine fires. The returned Promise
   * resolves once startup completes.
   *
   * @example
   * ```ts
   * await initiator.start();
   * ```
   */
  start(): Promise<void> {
    return this.#native.start();
  }

  /**
   * Stop the engine.
   *
   * Runs off the main thread and resolves once shutdown completes, keeping the
   * event loop free for any in-flight callbacks. Once it settles the engine's
   * sessions are destroyed. A `stop()` called while another is still in flight
   * (even from a `'logout'` listener that stop fired) returns the same Promise,
   * so it too settles only once the sessions are gone; the first call's
   * `force` applies to both. With a {@link MessageStoreAdapter}, a graceful
   * stop lets the store's in-flight writes complete (each bounded by
   * `storeTimeoutMs`, one per session at most) and calls the adapter's
   * `close()` for every session before settling (each bounded by
   * `storeTimeoutMs` too; a failure or timeout is a `'storeError'`, never a
   * rejection); `stop(true)` fails every pending store call first. A write
   * the engine gave up on may still be running in the adapter: a session's
   * `close()` waits for it (bounded by `storeTimeoutMs`; after `stop(true)`
   * it runs once the write settled, past the settlement of `stop()`), the
   * session's next `create()` waits for it too, and its settlement is
   * reported as a late `'storeError'` (README: "Message store", `stop()`).
   *
   * @param force When `true`, aborts immediately instead of draining gracefully.
   *
   * @example
   * ```ts
   * await initiator.stop();
   * ```
   */
  stop(force?: boolean): Promise<void> {
    if (this.#stopping) return this.#stopping;
    const native = this.#native.stop(force);
    // stop(true) has just failed every pending store call (the native side
    // deactivated its store bridge synchronously): whatever the adapter still
    // runs is abandoned from here on. A graceful stop keeps the store serving
    // until the engine is destroyed, i.e. until `native` settles. A refused
    // stop(true) (a start() in flight) leaves the engine running with its
    // store serving: attach again, or every write it completes would be
    // reported as abandoned. (A stop() that threw part-way also lands there,
    // its store aborted: a write it abandoned then settles unreported, the
    // lesser harm.)
    if (force && this.#store) {
      this.#store.detach();
      native.catch(() => this.#store?.detach(false));
    }
    const stopping = native.then(async () => {
      // The engine is destroyed: no store call can follow. Let the adapter
      // release what it holds per session, once (a stop() joining this one
      // -- from the 'logout' listener it fired, say -- shares this promise;
      // a stop() after settlement is a no-op that must not close() again).
      if (this.#store && !this.#closed) {
        this.#closed = true;
        this.#store.detach();
        await this.#store.closeAll(this.getSessions(), force === true);
      }
    });
    this.#stopping = stopping;
    const clear = () => {
      if (this.#stopping === stopping) this.#stopping = undefined;
    };
    stopping.then(clear, clear);
    return stopping;
  }

  /**
   * Whether a session is logged on.
   *
   * With no argument: `true` if **any** of this engine's sessions is logged on.
   * With a {@link SessionID}: `true` only if that session belongs to this engine
   * and is logged on (`false`, not an error, for a foreign id). Always `false`
   * before {@link Engine.start} and once {@link Engine.stop} has settled; while
   * a graceful stop is still in progress it reports the live state.
   *
   * @throws {TypeError} if `sessionID` is given but is not a {@link SessionID}
   *   (it does not fall back to the engine-wide form).
   */
  isLoggedOn(sessionID?: SessionID): boolean {
    return sessionID === undefined
      ? this.#native.isLoggedOn()
      : this.#native.isLoggedOn(toNativeSessionID(sessionID, 'sessionID'));
  }

  /**
   * The ids of the sessions this engine was configured with (every `[SESSION]`
   * in its settings). Stable for the engine's lifetime, including after
   * {@link Engine.stop}.
   */
  getSessions(): SessionID[] {
    return this.#native.getSessions().map((h) => SessionID.fromNative(h));
  }

  /**
   * A handle on one of this engine's sessions.
   *
   * @returns The {@link Session}, or `undefined` if `sessionID` is not one of
   *   this engine's sessions or {@link Engine.stop} has settled (that destroys
   *   its sessions). While a stop is still in progress the sessions are alive,
   *   so a `'logout'` listener can still read e.g. the final sequence numbers.
   *
   * @example
   * ```ts
   * initiator.on('logon', (id) => {
   *   const session = initiator.getSession(id)!;
   *   console.log('next seq', session.getExpectedSenderNum());
   * });
   * ```
   */
  getSession(sessionID: SessionID): Session | undefined {
    const handle = this.#native.getSession(toNativeSessionID(sessionID, 'sessionID'));
    return handle ? Session.fromNative(handle) : undefined;
  }

  /**
   * Keep the Node.js event loop alive while the engine is running (default once
   * started). Pair with {@link Engine.unref} to let a short script exit.
   */
  ref(): void {
    this.#native.ref();
  }

  /** Allow the process to exit even while the engine is running. */
  unref(): void {
    this.#native.unref();
  }
}

/* ------------------------------------------------------------------------- *
 * Strongly-typed EventEmitter surface.
 *
 * The class above extends the plain (non-generic) Node `EventEmitter`, which
 * guarantees the runtime methods (`on`/`once`/`off`/`emit`/...) exist. To layer
 * strong EVENT typing on top — AND to guarantee those methods appear in the
 * emitted `dist/**\/*.d.ts` regardless of the consumer's @types/node version —
 * we merge a same-named `interface Engine` declaring typed overloads for the
 * common listener methods. Declaration merging writes these explicit signatures
 * into the emitted `.d.ts`, so consumers get both the methods and the event
 * types even on toolchains whose `EventEmitter` is not generic.
 * ------------------------------------------------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Engine {
  /** Register a listener for an engine event (typed per {@link EngineEvents}). */
  on<E extends keyof EngineEvents>(event: E, listener: (...args: EngineEvents[E]) => void): this;
  /** Register a one-shot listener for an engine event. */
  once<E extends keyof EngineEvents>(event: E, listener: (...args: EngineEvents[E]) => void): this;
  /** Alias of {@link Engine.on}. */
  addListener<E extends keyof EngineEvents>(
    event: E,
    listener: (...args: EngineEvents[E]) => void,
  ): this;
  /** Remove a previously registered listener. */
  off<E extends keyof EngineEvents>(event: E, listener: (...args: EngineEvents[E]) => void): this;
  /** Alias of {@link Engine.off}. */
  removeListener<E extends keyof EngineEvents>(
    event: E,
    listener: (...args: EngineEvents[E]) => void,
  ): this;
  /** Remove all listeners (optionally for a single event). */
  removeAllListeners<E extends keyof EngineEvents>(event?: E): this;
  /** Emit an engine event with its typed arguments. */
  emit<E extends keyof EngineEvents>(event: E, ...args: EngineEvents[E]): boolean;
  /** List the listeners registered for an event. */
  listeners<E extends keyof EngineEvents>(event: E): Array<(...args: EngineEvents[E]) => void>;
}
