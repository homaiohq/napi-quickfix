/**
 * FIX session initiator (client side — connects out to acceptors).
 */
import { native } from './native.js';
import { Engine, type EngineOptions } from './engine.js';

export type { EngineOptions } from './engine.js';

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
  /** @param options Engine options. */
  constructor(options: EngineOptions) {
    super(native.InitiatorWrap, options);
  }
}
