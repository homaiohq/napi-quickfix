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
import { SessionID } from './session-id.js';
import type { ApplicationHandlers } from './application.js';
import type { SessionSettings } from './session-settings.js';

/** Options for constructing an {@link Initiator} or {@link Acceptor}. */
export interface EngineOptions {
  /** Parsed session settings ({@link SessionSettings.fromString}/`fromFile`). */
  settings: SessionSettings;
  /**
   * Synchronous application callbacks. These may mutate outbound messages and
   * throw to reject inbound ones (see {@link ApplicationHandlers}).
   */
  handlers?: ApplicationHandlers;
  /** Message-store factory. Defaults to the engine's default (`'file'`). */
  store?: 'file' | 'memory';
  /** Log factory. Defaults to the engine's default. */
  log?: 'screen' | 'file' | 'none';
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
}

/** The native callback behind each engine event. */
const EVENT_CALLBACKS: Readonly<Record<keyof EngineEvents, keyof NativeApplicationHandlers>> = {
  create: 'onCreate',
  logon: 'onLogon',
  logout: 'onLogout',
  toAdmin: 'toAdmin',
  fromAdmin: 'fromAdmin',
  toApp: 'toApp',
  fromApp: 'fromApp',
};

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

  /**
   * @param Native The native engine constructor (`InitiatorWrap`/`AcceptorWrap`).
   * @param options Engine options.
   */
  protected constructor(Native: NativeEngineConstructor, options: EngineOptions) {
    super();

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

    this.#native = new Native({
      settings: options.settings.nativeHandle,
      handlers: nativeHandlers,
      store: options.store,
      log: options.log,
    });

    // Every native callback above is registered so events can be emitted, but
    // forwarding one costs the engine thread a message copy and a wait on the
    // event loop. Keep a callback switched on only while someone listens: a
    // user handler, or at least one event listener. `newListener` fires before
    // the listener is added and `removeListener` after it is removed, so the
    // switch is set before the first callback can reach a listener.
    const callbackOf = (event: string | symbol): keyof NativeApplicationHandlers | undefined =>
      typeof event === 'string' && event in EVENT_CALLBACKS
        ? EVENT_CALLBACKS[event as keyof EngineEvents]
        : undefined;
    const sync = (event: string | symbol) => {
      const callback = callbackOf(event);
      if (callback === undefined) return;
      const wanted = userHandlers[callback] !== undefined || this.listenerCount(event) > 0;
      this.#native.setCallbackEnabled(callback, wanted);
    };
    for (const event of Object.keys(EVENT_CALLBACKS)) sync(event);
    // The typed `on` overloads below only know EngineEvents; these two are
    // EventEmitter's own.
    const emitter: EventEmitter = this;
    emitter.on('newListener', (event: string | symbol) => {
      const callback = callbackOf(event);
      if (callback !== undefined) this.#native.setCallbackEnabled(callback, true);
    });
    emitter.on('removeListener', sync);
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
   * event loop free for any in-flight callbacks.
   *
   * @param force When `true`, aborts immediately instead of draining gracefully.
   *
   * @example
   * ```ts
   * await initiator.stop();
   * ```
   */
  stop(force?: boolean): Promise<void> {
    return this.#native.stop(force);
  }

  /** Whether any session is currently logged on. */
  isLoggedOn(): boolean {
    return this.#native.isLoggedOn();
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
