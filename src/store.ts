/**
 * Pluggable message store: persist session state (sequence numbers, creation
 * time, sent messages) through your own database driver.
 *
 * QuickFIX's `MessageStore` is exposed to JS as a {@link MessageStoreAdapter}:
 * one object per engine, receiving the {@link SessionID} on every call, so a
 * shared pool plus a key serves every session. Writes are write-through: the
 * engine's thread waits for your Promise before the message hits the wire.
 * The README section "Message store" describes the threading, the timeout
 * and the failure policy; this file holds the contract and the glue.
 */
import type { QuickFixError, NativeStoreBridge, NativeStoreState } from './native.js';
import { SessionID } from './session-id.js';

/** A value or a Promise of it: every adapter method may be sync or async. */
export type Awaitable<T> = T | Promise<T>;

/** The per-session state a {@link MessageStoreAdapter} persists next to the messages. */
export interface MessageStoreState {
  /** When the session's numbering was last (re)started. */
  creationTime: Date;
  /** The MsgSeqNum (tag 34) the next outbound message will carry. */
  nextSenderMsgSeqNum: number;
  /** The MsgSeqNum expected on the next inbound message. */
  nextTargetMsgSeqNum: number;
}

/**
 * The store contract. One adapter object serves every session of an engine;
 * each method receives the session's id. Every method may return a value or a
 * Promise. A rejection (or a synchronous throw) surfaces to the engine as an
 * `IOException`; what the engine does with it depends on the method, see the
 * README ("Message store": failure policy). Calls made from the engine's
 * threads block that thread, not the event loop, until the Promise settles,
 * bounded by `storeTimeoutMs`.
 *
 * Sequence numbers cross as `number` and are refused in both directions
 * above `Number.MAX_SAFE_INTEGER` (2^53-1): a {@link load} result above it
 * fails, and the engine never asks the adapter to write one (the write is
 * refused and reported as a `'storeError'` instead of being rounded).
 */
export interface MessageStoreAdapter {
  /**
   * The persisted state of `sessionID`, or `null` if the session has never
   * been seen. Called by {@link Initiator.create} / {@link Acceptor.create}
   * before the engine exists, and again by the engine to reload the state
   * (`RefreshOnLogon=Y`, {@link Session.refresh}, and after a store failure).
   */
  load(sessionID: SessionID): Awaitable<MessageStoreState | null>;
  /** Persist the initial `state` of a session {@link load} returned `null` for. */
  create(sessionID: SessionID, state: MessageStoreState): Awaitable<void>;
  /** Persist both sequence numbers (the engine writes them together). */
  setSeqNums(sessionID: SessionID, nextSender: number, nextTarget: number): Awaitable<void>;
  /**
   * Persist an outbound message under its MsgSeqNum. Must be an upsert: a
   * seqnum is rewritten when a previous write failed or timed out and the
   * engine reused the number.
   */
  setMessage(sessionID: SessionID, seqNum: number, message: string): Awaitable<void>;
  /**
   * The persisted messages with `begin <= seqNum <= end`, ascending, with
   * missing seqnums omitted (never padded): the engine parses each string and
   * gap-fills what is not there.
   */
  getMessages(sessionID: SessionID, begin: number, end: number): Awaitable<string[]>;
  /**
   * Delete every message of the session and persist `state` (seqnums `1`/`1`
   * and a new creation time), in one transaction where the backend allows.
   */
  reset(sessionID: SessionID, state: MessageStoreState): Awaitable<void>;
  /**
   * Optional. Called once per session after {@link Engine.stop} has destroyed
   * the engine's sessions, before the `stop()` Promise settles; no store call
   * for that session follows. Not called for an engine dropped without
   * `stop()`.
   */
  close?(sessionID: SessionID): Awaitable<void>;
}

/** The method names a `'storeError'` event can name. */
export type MessageStoreMethod = keyof MessageStoreAdapter;

/**
 * A synchronous in-memory {@link MessageStoreAdapter}: one row per session,
 * in a `Map`. The reference implementation of the contract, and a test
 * double; its `rows` are public so a test can read or edit the persisted
 * state. Not persistent across processes, obviously.
 */
export class MapMessageStore implements MessageStoreAdapter {
  /** The persisted rows, keyed by `sessionID.toString()`. */
  readonly rows = new Map<string, { state: MessageStoreState; messages: Map<number, string> }>();

  #row(id: SessionID): { state: MessageStoreState; messages: Map<number, string> } {
    const row = this.rows.get(id.toString());
    if (!row) throw new Error(`MapMessageStore: no row for ${id.toString()}`);
    return row;
  }

  load(id: SessionID): MessageStoreState | null {
    const row = this.rows.get(id.toString());
    return row ? { ...row.state } : null;
  }

  create(id: SessionID, state: MessageStoreState): void {
    this.rows.set(id.toString(), { state: { ...state }, messages: new Map() });
  }

  setSeqNums(id: SessionID, nextSender: number, nextTarget: number): void {
    const row = this.#row(id);
    row.state.nextSenderMsgSeqNum = nextSender;
    row.state.nextTargetMsgSeqNum = nextTarget;
  }

  setMessage(id: SessionID, seqNum: number, message: string): void {
    this.#row(id).messages.set(seqNum, message);
  }

  getMessages(id: SessionID, begin: number, end: number): string[] {
    const messages = this.#row(id).messages;
    const out: string[] = [];
    for (const seq of [...messages.keys()].sort((a, b) => a - b)) {
      if (seq >= begin && seq <= end) out.push(messages.get(seq)!);
    }
    return out;
  }

  reset(id: SessionID, state: MessageStoreState): void {
    const row = this.rows.get(id.toString());
    if (row) {
      row.messages.clear();
      row.state = { ...state };
    } else {
      this.rows.set(id.toString(), { state: { ...state }, messages: new Map() });
    }
  }
}

/* ------------------------------------------------------------------------- *
 * Glue between the native JsMessageStoreFactory and a user adapter.
 * ------------------------------------------------------------------------- */

/** Run `fn` and normalise its outcome into a Promise (a sync throw rejects). */
function settle<T>(fn: () => Awaitable<T>): Promise<T> {
  try {
    return Promise.resolve(fn());
  } catch (err) {
    return Promise.reject(err);
  }
}

/** Build the `QuickFixError` a `'storeError'` event carries. */
function ioError(method: string, message: string): QuickFixError {
  const err = new Error(`message store ${method}: ${message}`) as QuickFixError;
  err.name = 'QuickFixError';
  err.fixError = 'IO Error';
  err.fixErrorName = 'IOException';
  return err;
}

function validState(what: string, s: MessageStoreState | null | undefined): MessageStoreState {
  if (s === null || typeof s !== 'object') {
    throw new TypeError(`${what} must return a MessageStoreState`);
  }
  if (!(s.creationTime instanceof Date) || Number.isNaN(s.creationTime.getTime())) {
    throw new TypeError(`${what}: creationTime must be a valid Date`);
  }
  for (const key of ['nextSenderMsgSeqNum', 'nextTargetMsgSeqNum'] as const) {
    const v = s[key];
    if (!Number.isSafeInteger(v) || v < 1) {
      throw new TypeError(`${what}: ${key} must be a positive safe integer`);
    }
  }
  return s;
}

/**
 * @internal The object handed to the native engine constructor as `store`.
 * Wraps the user's adapter: every method returns a Promise (the native side
 * binds its continuations to it, or, on the JS thread, lets {@link collect}
 * gather it), and `storeError` turns native failure reports into the
 * engine's `'storeError'` event. Created by {@link Engine.create}; the engine
 * constructor recognises it, so a bare adapter passed to `new Initiator()`
 * can be refused.
 */
export class StoreBinding {
  readonly adapter: MessageStoreAdapter;
  readonly timeoutMs: number;
  readonly states: NativeStoreState[];
  readonly bridge: NativeStoreBridge;
  /** While non-null (engine construction), every Promise produced is pushed here. */
  collecting: Promise<unknown>[] | null = null;
  /** Set by the Engine constructor; the target of `'storeError'`. */
  emit: ((method: MessageStoreMethod, sessionID: SessionID, error: QuickFixError, poisoned: boolean) => void) | null =
    null;

  constructor(adapter: MessageStoreAdapter, timeoutMs: number, states: NativeStoreState[]) {
    this.adapter = adapter;
    this.timeoutMs = timeoutMs;
    this.states = states;
    const call = <T>(fn: () => Awaitable<T>): Promise<T> => {
      const p = settle(fn);
      if (this.collecting) this.collecting.push(p);
      return p;
    };
    this.bridge = {
      load: (sid) => call(() => this.adapter.load(SessionID.fromNative(sid))),
      create: (sid, state) => call(() => this.adapter.create(SessionID.fromNative(sid), state)),
      setSeqNums: (sid, s, t) => call(() => this.adapter.setSeqNums(SessionID.fromNative(sid), s, t)),
      setMessage: (sid, seq, msg) => call(() => this.adapter.setMessage(SessionID.fromNative(sid), seq, msg)),
      getMessages: (sid, b, e) => call(() => this.adapter.getMessages(SessionID.fromNative(sid), b, e)),
      reset: (sid, state) => call(() => this.adapter.reset(SessionID.fromNative(sid), state)),
      storeError: (sid, method, message, poisoned, late) => {
        this.emit?.(
          method as MessageStoreMethod,
          SessionID.fromNative(sid),
          ioError(method, late ? `${message} (late)` : message),
          poisoned,
        );
      },
    };
  }

  /**
   * Preload the state of every session in `ids` through the adapter: the
   * engine constructor needs it synchronously. A missing row is created.
   */
  static async preload(adapter: MessageStoreAdapter, ids: SessionID[]): Promise<NativeStoreState[]> {
    const states: NativeStoreState[] = [];
    for (const id of ids) {
      let state = await settle(() => adapter.load(id));
      if (state === null || state === undefined) {
        state = { creationTime: new Date(), nextSenderMsgSeqNum: 1, nextTargetMsgSeqNum: 1 };
        await settle(() => adapter.create(id, state as MessageStoreState));
      }
      const s = validState(`${adapter.constructor?.name ?? 'adapter'}.load(${id.toString()})`, state);
      states.push({
        sessionID: id.nativeHandle,
        creationTime: s.creationTime,
        nextSenderMsgSeqNum: s.nextSenderMsgSeqNum,
        nextTargetMsgSeqNum: s.nextTargetMsgSeqNum,
      });
    }
    return states;
  }

  /** Call the adapter's optional `close()` for each id; failures become `'storeError'`s. */
  async closeAll(ids: SessionID[]): Promise<void> {
    if (!this.adapter.close) return;
    await Promise.all(
      ids.map((id) =>
        settle(() => this.adapter.close!(id)).catch((err: unknown) => {
          this.emit?.('close', id, ioError('close', err instanceof Error ? err.message : String(err)), false);
        }),
      ),
    );
  }
}

/** @internal `true` if `v` is a {@link StoreBinding} (the engine constructor's check). */
export function isStoreBinding(v: unknown): v is StoreBinding {
  return v instanceof StoreBinding;
}

/** @internal Shape check for a user-supplied adapter object. */
export function isMessageStoreAdapter(v: unknown): v is MessageStoreAdapter {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.load === 'function' &&
    typeof o.create === 'function' &&
    typeof o.setSeqNums === 'function' &&
    typeof o.setMessage === 'function' &&
    typeof o.getMessages === 'function' &&
    typeof o.reset === 'function'
  );
}
