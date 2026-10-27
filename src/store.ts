/**
 * Pluggable message store: persist session state (sequence numbers, creation
 * time, sent messages) through your own database driver.
 *
 * QuickFIX's `MessageStore` is exposed to JS as a {@link MessageStoreAdapter}:
 * one object per engine, receiving the {@link SessionID} on every call, so a
 * shared pool plus a key serves every session. This file holds the contract
 * and the glue to the native store (`cpp/js_message_store.{h,cpp}`). The
 * user-facing policy (threading, timeout, failures) is README "Message
 * store"; the mechanism is ARCHITECTURE.md §4b.
 */
import type { QuickFixError, NativeSessionID, NativeStoreBridge, NativeStoreState } from './native.js';
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
 * each method receives the session's id and may return a value or a Promise.
 * Settle only once the write is durable. A rejection (or a synchronous throw)
 * surfaces to the engine as an `IOException`; calls from the engine's threads
 * block that thread, not the event loop, bounded by `storeTimeoutMs`.
 * Sequence numbers are positive safe integers (at most 2^53-1). What each
 * failure does to the session: README "Message store" ("Failure policy").
 */
export interface MessageStoreAdapter {
  /**
   * The persisted state of `sessionID`, or `null` (or `undefined`) if there is
   * no row; reject if it could not be read. Called by
   * {@link Initiator.create} / {@link Acceptor.create} before the engine
   * exists, and by the engine to reload the state (`RefreshOnLogon=Y`,
   * {@link Session.refresh}, after a store failure), where `null` restarts the
   * numbering at 1/1 through {@link create}. A malformed result fails the call.
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
   * the engine's sessions, before the `stop()` Promise settles, and only once
   * the engine's pending writes for that session have settled (bounded by
   * `storeTimeoutMs`; not called past it; after `stop(true)`, possibly after
   * `stop()` settled). No store call for that session follows. A failure is
   * a `'storeError'`, never a rejection of `stop()`. Not called for an engine
   * dropped without `stop()`.
   *
   * Per session, although the adapter is per engine: it releases what the
   * adapter holds for one session (an advisory lock that keeps a second
   * engine off the session's row, a per-session queue). It is not the place
   * to end a pool the adapter shares with other sessions or engines; the
   * application owns that.
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
    // Walk the range, not the whole map: a resend asks for a few seqnums out
    // of every message ever stored. A range wider than the map (a caller's
    // open-ended end) falls back to sorting what is there.
    if (end - begin < messages.size) {
      for (let seq = begin; seq <= end; seq++) {
        const msg = messages.get(seq);
        if (msg !== undefined) out.push(msg);
      }
      return out;
    }
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

/**
 * `p`, failed with an `IOException` if it has not settled after `timeoutMs`
 * (`0`: no bound). The JS-side counterpart of the native per-call deadline,
 * for the adapter calls made outside an engine thread: the preload, the
 * constructor's `reset()` and `close()`. A settlement after the deadline is
 * observed and ignored.
 */
export function withTimeout<T>(p: Promise<T>, timeoutMs: number, method: string): Promise<T> {
  if (timeoutMs <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(ioError(method, `timed out after ${timeoutMs} ms`)), timeoutMs);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/* ------------------------------------------------------------------------- *
 * Writes in flight, per session, past the engine that issued them.
 *
 * An engine stops waiting for a call when it times out or when stop()/GC
 * aborts it (the native waiter is released with IOException), but the
 * adapter's statement may still commit afterwards. Nothing in the engine can
 * fence it once the engine is gone, and with a fresh adapter instance per
 * engine on the same database, neither can a per-session FIFO adapter: the
 * write would land under the next engine of the session (a regressed seqnum
 * row, or a stale message replacing the one stored at its seqnum). So every
 * write an adapter is asked for is tracked here until its Promise settles,
 * and preload() does not read a session while one is pending (bounded by the
 * new engine's storeTimeoutMs). Reads (load, getMessages) are not tracked: a
 * late read changes nothing.
 *
 * Scope: one JS realm (the main thread, or one Worker), shared by the ESM and
 * CJS builds through a global symbol. A write can only settle on the event
 * loop of the realm that issued it; a Worker that is terminated with one in
 * flight takes it along unsettled, which is the cross-process case (README:
 * "Message store"). JS thread only: no locking. A tracked call holds no
 * handle, so it never keeps the process alive.
 * ------------------------------------------------------------------------- */

/** An adapter write that has not settled yet. */
interface PendingCall {
  readonly sessionID: SessionID;
  readonly method: MessageStoreMethod;
  /** Fulfils (never rejects) once the adapter's Promise has settled. */
  readonly done: Promise<void>;
  settled: boolean;
}

const PENDING_KEY = Symbol.for('@homaiohq/napi-quickfix:pendingStoreWrites');
const pendingWrites: Map<string, Set<PendingCall>> = ((globalThis as Record<symbol, unknown>)[PENDING_KEY] ??= new Map<
  string,
  Set<PendingCall>
>()) as Map<string, Set<PendingCall>>;

/**
 * Track `p` as an in-flight `method` write for `sessionID` until it settles;
 * `onSettled` then runs with the rejection reason, if any. The tracking
 * reaction also observes a rejection, so tracking never adds an unhandled one.
 */
function trackWrite(
  sessionID: SessionID,
  method: MessageStoreMethod,
  p: Promise<unknown>,
  onSettled?: (call: PendingCall, rejected: boolean, reason: unknown) => void,
): PendingCall {
  const key = sessionID.toString();
  let set = pendingWrites.get(key);
  if (!set) pendingWrites.set(key, (set = new Set()));
  const finish = (rejected: boolean, reason: unknown) => {
    call.settled = true;
    const s = pendingWrites.get(key);
    if (s?.delete(call) && s.size === 0) pendingWrites.delete(key);
    onSettled?.(call, rejected, reason);
  };
  const call: PendingCall = {
    sessionID,
    method,
    settled: false,
    done: p.then(
      () => finish(false, undefined),
      (err: unknown) => finish(true, err),
    ),
  };
  set.add(call);
  return call;
}

/**
 * Wait until every call of `calls` has settled, or `timeoutMs` passed (`0`:
 * no bound). Resolves with one still pending, or `undefined`. `unref`: the
 * bound's timer does not keep the process alive.
 */
async function drain(calls: PendingCall[], timeoutMs: number, unref = false): Promise<PendingCall | undefined> {
  if (calls.length === 0) return undefined;
  const all = Promise.all(calls.map((c) => c.done));
  if (timeoutMs <= 0) {
    await all;
    return undefined;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    all,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
      if (unref) timer.unref?.();
    }),
  ]);
  clearTimeout(timer);
  return calls.find((c) => !c.settled);
}

/*
 * Validation of what an adapter returns. The TS layer owns it, for the
 * preload and for every call the engine makes later (through the bridge):
 * the native side only converts the values this layer hands it, with cheap
 * internal assertions. A malformed result throws a TypeError: at preload it
 * rejects create(); through the bridge it rejects the call's Promise, which
 * the engine handles like any adapter failure (IOException, 'storeError').
 */

function adapterName(adapter: MessageStoreAdapter): string {
  return (adapter.constructor as { name?: string } | undefined)?.name ?? 'adapter';
}

/**
 * A copy of `s` holding exactly the checked values (a getter cannot answer
 * differently when the native side reads it), or a TypeError.
 */
function validState(what: string, s: unknown): MessageStoreState {
  if (s === null || typeof s !== 'object') {
    throw new TypeError(`${what} must return a MessageStoreState`);
  }
  const { creationTime, nextSenderMsgSeqNum, nextTargetMsgSeqNum } = s as Record<string, unknown>;
  if (!(creationTime instanceof Date) || Number.isNaN(creationTime.getTime())) {
    throw new TypeError(`${what}: creationTime must be a valid Date`);
  }
  for (const [key, v] of [
    ['nextSenderMsgSeqNum', nextSenderMsgSeqNum],
    ['nextTargetMsgSeqNum', nextTargetMsgSeqNum],
  ] as const) {
    if (!Number.isSafeInteger(v) || (v as number) < 1) {
      throw new TypeError(`${what}: ${key} must be a positive safe integer`);
    }
  }
  return {
    creationTime: new Date(creationTime.getTime()),
    nextSenderMsgSeqNum: nextSenderMsgSeqNum as number,
    nextTargetMsgSeqNum: nextTargetMsgSeqNum as number,
  };
}

/** A `load()` result: `null` (also for `undefined`: no row) or a valid state. */
function validLoad(adapter: MessageStoreAdapter, id: SessionID, v: unknown): MessageStoreState | null {
  return v === null || v === undefined ? null : validState(`${adapterName(adapter)}.load(${id.toString()})`, v);
}

/** A `getMessages()` result: a copy of an array of strings, or a TypeError. */
function validMessages(adapter: MessageStoreAdapter, id: SessionID, v: unknown): string[] {
  const what = `${adapterName(adapter)}.getMessages(${id.toString()})`;
  if (!Array.isArray(v)) throw new TypeError(`${what} must return string[]`);
  const out: string[] = [];
  for (const m of v as unknown[]) {
    if (typeof m !== 'string') throw new TypeError(`${what}: entries must be strings`);
    out.push(m);
  }
  return out;
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
  emit:
    | ((method: MessageStoreMethod, sessionID: SessionID, error: QuickFixError, poisoned: boolean, late: boolean) => void)
    | null = null;
  /** This engine's writes that have not settled yet (see trackWrite). */
  readonly #writes = new Set<PendingCall>();
  /** Set once the engine can no longer wait for a call (see {@link detach}). */
  #detached = false;

  constructor(adapter: MessageStoreAdapter, timeoutMs: number, states: NativeStoreState[]) {
    this.adapter = adapter;
    this.timeoutMs = timeoutMs;
    this.states = states;
    // `check` validates a read's result (load, getMessages): native trusts
    // what this bridge resolves with, and a malformed result rejects.
    const call = <T>(
      sid: NativeSessionID,
      method: MessageStoreMethod | null,
      fn: (id: SessionID) => Awaitable<unknown>,
      check?: (id: SessionID, v: unknown) => T,
    ): Promise<T> => {
      const id = SessionID.fromNative(sid);
      const raw = settle(() => fn(id));
      const p = check ? raw.then((v) => check(id, v)) : (raw as Promise<T>);
      if (method) this.#writes.add(trackWrite(id, method, raw, (c, rejected, reason) => this.#settled(c, rejected, reason)));
      if (this.collecting) this.collecting.push(p);
      return p;
    };
    this.bridge = {
      load: (sid) => call(sid, null, (id) => this.adapter.load(id), (id, v) => validLoad(this.adapter, id, v)),
      create: (sid, state) => call(sid, 'create', (id) => this.adapter.create(id, state)),
      setSeqNums: (sid, s, t) => call(sid, 'setSeqNums', (id) => this.adapter.setSeqNums(id, s, t)),
      setMessage: (sid, seq, msg) => call(sid, 'setMessage', (id) => this.adapter.setMessage(id, seq, msg)),
      getMessages: (sid, b, e) =>
        call(sid, null, (id) => this.adapter.getMessages(id, b, e), (id, v) => validMessages(this.adapter, id, v)),
      reset: (sid, state) => call(sid, 'reset', (id) => this.adapter.reset(id, state)),
      storeError: (sid, method, message, poisoned, late) => {
        this.emit?.(method as MessageStoreMethod, SessionID.fromNative(sid), ioError(method, message), poisoned, late);
      },
    };
  }

  /**
   * The engine can no longer wait for any of its calls: from now on, each
   * write still pending is reported as it settles, as a late, non-poisoning
   * `'storeError'` ("abandoned at teardown"): it timed out, or teardown
   * failed its waiter, and it took effect (or failed) with no engine left to
   * account for it. Called by {@link Engine.stop} once the native side can
   * no longer make or wait for a call (stop(true): at once; graceful: when
   * the native stop settled). Before that, a late settlement of a timed-out
   * write is the native store's to report. `detach(false)` undoes it, for a
   * stop(true) the native side refused.
   */
  detach(detached = true): void {
    this.#detached = detached;
  }

  #settled(call: PendingCall, rejected: boolean, reason: unknown): void {
    this.#writes.delete(call);
    if (!this.#detached) return;
    const why = rejected ? `rejected after stop: ${reason instanceof Error ? reason.message : String(reason)}` : 'settled after stop';
    this.emit?.(call.method, call.sessionID, ioError(call.method, `abandoned at teardown; ${why}`), false, true);
  }

  /**
   * Preload the state of every session in `ids` through the adapter, the
   * sessions concurrently: the engine constructor needs it synchronously. A
   * missing row is created.
   * Each call is bounded by `timeoutMs` (see {@link withTimeout}). First,
   * the writes still pending for those sessions -- an earlier engine's, or
   * an earlier create()'s -- must settle, bounded by `timeoutMs` too:
   * otherwise one could land under the new engine. On that timeout the
   * preload fails with an `IOException` naming the session and the method.
   */
  static async preload(adapter: MessageStoreAdapter, ids: SessionID[], timeoutMs: number): Promise<NativeStoreState[]> {
    const stuck = await drain(
      ids.flatMap((id) => [...(pendingWrites.get(id.toString()) ?? [])]),
      timeoutMs,
    );
    if (stuck) {
      throw ioError(
        stuck.method,
        `${stuck.sessionID.toString()}: a ${stuck.method}() from an earlier engine of this session is still pending after ${timeoutMs} ms; not loading the session while it may still write`,
      );
    }
    // The sessions load concurrently (one round trip of startup latency, not
    // one per session). Every one is let settle, so none is left an
    // unobserved rejection, and the first failure in `ids` order is thrown,
    // whichever failed first in time.
    const results = await Promise.allSettled(ids.map((id) => StoreBinding.#preloadOne(adapter, id, timeoutMs)));
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) throw failed.reason;
    return results.map((r) => (r as PromiseFulfilledResult<NativeStoreState>).value);
  }

  static async #preloadOne(adapter: MessageStoreAdapter, id: SessionID, timeoutMs: number): Promise<NativeStoreState> {
    let s = validLoad(adapter, id, await withTimeout(settle(() => adapter.load(id)), timeoutMs, 'load'));
    if (s === null) {
      const created: MessageStoreState = { creationTime: new Date(), nextSenderMsgSeqNum: 1, nextTargetMsgSeqNum: 1 };
      const p = settle(() => adapter.create(id, created));
      trackWrite(id, 'create', p);
      await withTimeout(p, timeoutMs, 'create');
      s = created;
    }
    return {
      sessionID: id.nativeHandle,
      creationTime: s.creationTime,
      nextSenderMsgSeqNum: s.nextSenderMsgSeqNum,
      nextTargetMsgSeqNum: s.nextTargetMsgSeqNum,
    };
  }

  /**
   * Call the adapter's optional `close()` for each id, each bounded by the
   * store timeout; failures (a timeout included) become `'storeError'`s.
   * close() waits for the engine's own pending writes of that session first
   * (bounded by the timeout too): run under one, it could pull the adapter's
   * connection or lock out from under a statement still in flight. If one is
   * still pending at the bound, close() is not called and that is reported.
   * With `force` (stop(true)), a session with pending writes is not waited
   * for: its close() runs once they settled, after stop() returned, and a
   * create() for the session waits for that close() like for a write.
   */
  async closeAll(ids: SessionID[], force = false): Promise<void> {
    if (!this.adapter.close) return;
    await Promise.all(
      ids.map(async (id) => {
        const key = id.toString();
        const own = [...this.#writes].filter((c) => c.sessionID.toString() === key);
        if (force && own.length > 0) {
          trackWrite(id, 'close', this.#closeAfter(id, own, true));
          return;
        }
        await this.#closeAfter(id, own, false);
      }),
    );
  }

  /** close() `id` once `own` settled (see {@link closeAll}); never rejects. */
  async #closeAfter(id: SessionID, own: PendingCall[], unref: boolean): Promise<void> {
    const stuck = await drain(own, this.timeoutMs, unref);
    if (stuck) {
      this.emit?.('close', id, ioError('close', `not called: a ${stuck.method}() is still pending after ${this.timeoutMs} ms`), false, false);
      return;
    }
    await withTimeout(
      settle(() => this.adapter.close!(id)),
      this.timeoutMs,
      'close',
    ).catch((err: unknown) => {
      // withTimeout's own error is already the IOException to report.
      const error =
        err instanceof Error && (err as QuickFixError).fixErrorName === 'IOException'
          ? (err as QuickFixError)
          : ioError('close', err instanceof Error ? err.message : String(err));
      this.emit?.('close', id, error, false, false);
    });
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
