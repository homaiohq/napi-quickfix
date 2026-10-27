/**
 * FIX session acceptor (server side — listens for initiators).
 */
import { native } from './native.js';
import { Engine, type CreateEngineOptions, type EngineOptions } from './engine.js';

export type { CreateEngineOptions, EngineOptions } from './engine.js';

/**
 * A FIX session acceptor (wraps `FIX::SocketAcceptor`). Acceptors listen for
 * inbound connections from initiators as configured in
 * {@link EngineOptions.settings}.
 *
 * Extends {@link Engine} (an {@link import('node:events').EventEmitter}), so you
 * can observe lifecycle/message events in addition to supplying `handlers`.
 * Remember: only `handlers` may mutate outbound messages or reject inbound ones;
 * events are observe-only.
 *
 * @example
 * ```ts
 * const acceptor = new Acceptor({
 *   settings: SessionSettings.fromString(cfg),
 *   handlers: {
 *     fromApp: (msg, id) => { void sendToTarget(makeReply(msg), id); },
 *   },
 * });
 * await acceptor.start();
 * // ... later
 * await acceptor.stop();
 * ```
 */
export class Acceptor extends Engine {
  /**
   * @param options Engine options. A {@link MessageStoreAdapter} store is
   *   only accepted by {@link Acceptor.create}.
   */
  constructor(options: EngineOptions) {
    super(native.AcceptorWrap, options);
  }

  /**
   * Build an Acceptor, loading the message store first when `store` is a
   * {@link MessageStoreAdapter}: the adapter's `load()` (and `create()` for a
   * session it has never seen) runs for every session the engine will own,
   * then the engine is constructed from that state. With `'file'`/`'memory'`
   * this is `new Acceptor(options)` behind a Promise, so there is one entry
   * point for every store.
   *
   * Rejects without having created anything if `load()`/`create()` fail or
   * time out (`storeTimeoutMs`), or if a write an earlier engine of one of
   * its sessions left pending has not settled within `storeTimeoutMs`
   * (`IOException`); and with the engine torn down (its adapter's `close()`
   * called) if a store call the constructor made (a `reset()` for a session
   * constructed outside its session time) fails or times out. See README
   * "Message store".
   */
  static async create(options: CreateEngineOptions): Promise<Acceptor> {
    return Engine.createEngine('acceptor', options, (o) => new Acceptor(o));
  }
}
