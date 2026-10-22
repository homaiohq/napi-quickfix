// Test doubles for the MessageStoreAdapter contract, plus config helpers for
// the store tests. Shared by store.test.ts and the child-process scripts in
// fixtures/.
import { setTimeout as sleep } from 'node:timers/promises';

import {
  MapMessageStore,
  type MessageStoreAdapter,
  type MessageStoreMethod,
  type MessageStoreState,
  type SessionID,
} from '../dist/esm/index.js';

/** How a {@link ControlledStore} call behaves. */
export type Mode =
  | 'ok' // settle after `delayMs`
  | 'reject' // reject after `delayMs` with an injected Error
  | 'hang' // never settle
  | 'defer'; // park until the test settles it through `parked`

export interface Parked {
  method: MessageStoreMethod;
  args: unknown[];
  /** Apply the call to the inner store and resolve it. */
  resolve: () => void;
  /** Reject it (nothing is applied). */
  reject: (err?: Error) => void;
}

/**
 * A {@link MapMessageStore} behind a per-call behaviour switch: every method
 * is async (settled through a timer, so the continuation is a macrotask),
 * records itself in `calls`, counts in-flight calls, and can be told to
 * reject, hang or park per method. `load` participates like the others, so
 * reloads can be observed and starved too.
 */
export class ControlledStore implements MessageStoreAdapter {
  readonly inner: MapMessageStore;
  readonly calls: string[] = [];
  readonly parked: Parked[] = [];
  readonly closed: string[] = [];
  inflight = 0;
  maxInflight = 0;
  delayMs: number;
  /** Decide the behaviour of a call; default `'ok'`. */
  mode: (method: MessageStoreMethod, args: unknown[]) => Mode = () => 'ok';

  constructor(inner = new MapMessageStore(), delayMs = 0) {
    this.inner = inner;
    this.delayMs = delayMs;
  }

  /** Behaviour for `method` only (others stay `'ok'`); `predicate` may narrow it. */
  set(method: MessageStoreMethod, mode: Mode, predicate: (args: unknown[]) => boolean = () => true): void {
    const prev = this.mode;
    this.mode = (m, args) => (m === method && predicate(args) ? mode : prev(m, args));
  }

  count(method: MessageStoreMethod): number {
    return this.calls.filter((c) => c === method).length;
  }

  #run<T>(method: MessageStoreMethod, args: unknown[], fn: () => T): Promise<T> {
    this.calls.push(method);
    const mode = this.mode(method, args);
    this.inflight++;
    this.maxInflight = Math.max(this.maxInflight, this.inflight);
    const done = () => {
      this.inflight--;
    };
    switch (mode) {
      case 'hang':
        return new Promise<T>(() => {});
      case 'defer':
        return new Promise<T>((resolve, reject) => {
          this.parked.push({
            method,
            args,
            resolve: () => {
              done();
              try {
                resolve(fn());
              } catch (err) {
                reject(err);
              }
            },
            reject: (err = new Error(`injected ${method} rejection`)) => {
              done();
              reject(err);
            },
          });
        });
      case 'reject':
        return sleep(this.delayMs).then(() => {
          done();
          throw new Error(`injected ${method} rejection`);
        });
      default:
        return sleep(this.delayMs).then(() => {
          try {
            return fn();
          } finally {
            done();
          }
        });
    }
  }

  load(id: SessionID): Promise<MessageStoreState | null> {
    return this.#run('load', [id], () => this.inner.load(id));
  }
  create(id: SessionID, state: MessageStoreState): Promise<void> {
    return this.#run('create', [id, state], () => this.inner.create(id, state));
  }
  setSeqNums(id: SessionID, s: number, t: number): Promise<void> {
    return this.#run('setSeqNums', [id, s, t], () => this.inner.setSeqNums(id, s, t));
  }
  setMessage(id: SessionID, seq: number, msg: string): Promise<void> {
    return this.#run('setMessage', [id, seq, msg], () => this.inner.setMessage(id, seq, msg));
  }
  getMessages(id: SessionID, b: number, e: number): Promise<string[]> {
    return this.#run('getMessages', [id, b, e], () => this.inner.getMessages(id, b, e));
  }
  reset(id: SessionID, state: MessageStoreState): Promise<void> {
    return this.#run('reset', [id, state], () => this.inner.reset(id, state));
  }
  close(id: SessionID): Promise<void> {
    return this.#run('close', [id], () => {
      this.closed.push(id.toString());
    });
  }

  /** The persisted row of `id` (throws if none). */
  row(id: SessionID): { state: MessageStoreState; messages: Map<number, string> } {
    const row = this.inner.rows.get(id.toString());
    if (!row) throw new Error(`no row for ${id.toString()}`);
    return row;
  }
}

/** A synchronous MapMessageStore that also records its calls and implements close(). */
export class RecordingMapStore extends MapMessageStore {
  readonly calls: string[] = [];
  override load(id: SessionID): MessageStoreState | null {
    this.calls.push('load');
    return super.load(id);
  }
  override create(id: SessionID, state: MessageStoreState): void {
    this.calls.push('create');
    super.create(id, state);
  }
  override setSeqNums(id: SessionID, s: number, t: number): void {
    this.calls.push('setSeqNums');
    super.setSeqNums(id, s, t);
  }
  override setMessage(id: SessionID, seq: number, msg: string): void {
    this.calls.push('setMessage');
    super.setMessage(id, seq, msg);
  }
  override getMessages(id: SessionID, b: number, e: number): string[] {
    this.calls.push('getMessages');
    return super.getMessages(id, b, e);
  }
  override reset(id: SessionID, state: MessageStoreState): void {
    this.calls.push('reset');
    super.reset(id, state);
  }
  close(_id: SessionID): void {
    this.calls.push('close');
  }
}

/**
 * Edit the [DEFAULT] section of a config from helpers.ts: `set` replaces or
 * adds `Key=Value` lines.
 */
export function withSettings(cfg: string, set: Record<string, string>): string {
  let out = cfg;
  for (const [key, value] of Object.entries(set)) {
    const re = new RegExp(`^${key}=.*$`, 'm');
    out = re.test(out) ? out.replace(re, `${key}=${value}`) : out.replace('[DEFAULT]\n', `[DEFAULT]\n${key}=${value}\n`);
  }
  return out;
}

/** `HH:MM:SS` of `now + offsetHours` in UTC, for StartTime/EndTime. */
export function utcClock(offsetHours: number): string {
  const d = new Date(Date.now() + offsetHours * 3_600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}
