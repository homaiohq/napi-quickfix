/**
 * FIX session initiator (client side — connects out to acceptors).
 */
import { native } from './native.js';
import { Engine, type CreateEngineOptions, type EngineOptions } from './engine.js';

export type { CreateEngineOptions, EngineOptions } from './engine.js';

/**
 * A FIX session initiator (wraps `FIX::SocketInitiator`). Initiators establish
 * outbound connections to acceptors as configured in {@link EngineOptions.settings}.
 *
 * Extends {@link Engine} (an {@link import('node:events').EventEmitter}), so you
 * can observe lifecycle/message events in addition to supplying `handlers`.
 * Remember: only `handlers` may mutate outbound messages or reject inbound ones;
 * events are observe-only.
 *
 * @example
 * ```ts
 * const initiator = new Initiator({
 *   settings: SessionSettings.fromString(cfg),
 *   handlers: { onLogon: (id) => console.log('up', id.toString()) },
 *   store: 'memory',
 *   log: 'none',
 * });
 * initiator.on('fromApp', (msg) => console.log('recv', msg.getMsgType()));
 * await initiator.start();
 * // ... later
 * await initiator.stop();
 * ```
 */
export class Initiator extends Engine {
  /**
   * @param options Engine options. A {@link MessageStoreAdapter} store is
   *   only accepted by {@link Initiator.create}.
   */
  constructor(options: EngineOptions) {
    super(native.InitiatorWrap, options);
  }

  /**
   * Build an Initiator, loading the message store first when `store` is a
   * {@link MessageStoreAdapter}: the adapter's `load()` (and `create()` for a
   * session it has never seen) runs for every session the engine will own,
   * then the engine is constructed from that state. With `'file'`/`'memory'`
   * this is `new Initiator(options)` behind a Promise, so there is one entry
   * point for every store.
   *
   * Rejects without having created anything if `load()`/`create()` fail or
   * time out (`storeTimeoutMs`), and with the engine torn down (its
   * adapter's `close()` called) if a store call the constructor made (a
   * `reset()` for a session constructed outside its session time) fails or
   * times out.
   */
  static async create(options: CreateEngineOptions): Promise<Initiator> {
    return Engine.createEngine('initiator', options, (o) => new Initiator(o));
  }
}
