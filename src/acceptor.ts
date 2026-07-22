/**
 * FIX session acceptor (server side — listens for initiators).
 */
import { native } from './native.js';
import { Engine, type EngineOptions } from './engine.js';

export type { EngineOptions } from './engine.js';

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
  /** @param options Engine options. */
  constructor(options: EngineOptions) {
    super(native.AcceptorWrap, options);
  }
}
