/**
 * Application-callback types for the session engine.
 *
 * Handlers are invoked **synchronously** by QuickFIX on its own threads via the
 * native bridge. Two callbacks may mutate their message argument in place
 * (`toAdmin`/`toApp`), and several may reject a message by **throwing** a typed
 * rejection (`toApp`/`fromApp`/`fromAdmin`). Throwing anything else surfaces as
 * a generic rejection.
 *
 * The {@link Initiator}/{@link Acceptor} also emit observe-only EventEmitter
 * events mirroring these callbacks — but events cannot mutate or reject; that
 * MUST go through the handlers.
 */
import type { Message } from './message.js';
import type { SessionID } from './session-id.js';

/**
 * User-supplied FIX application callbacks.
 *
 * All are optional. Runtime semantics:
 * - `onCreate`/`onLogon`/`onLogout` — fire-and-forget notifications.
 * - `toAdmin`/`toApp` — invoked before an outbound message is sent; may **mutate**
 *   the message in place (e.g. add credentials to a Logon in `toAdmin`).
 * - `toApp` — additionally may **throw** {@link FixReject} with kind `'DoNotSend'`
 *   to suppress sending.
 * - `fromAdmin`/`fromApp` — invoked for inbound messages; may **throw**
 *   {@link FixReject} to reject (e.g. `'RejectLogon'`, `'UnsupportedMessageType'`).
 */
export interface ApplicationHandlers {
  /** A new session was created. */
  onCreate?(sessionID: SessionID): void;
  /** A session successfully logged on. */
  onLogon?(sessionID: SessionID): void;
  /** A session logged out (or was disconnected). */
  onLogout?(sessionID: SessionID): void;
  /**
   * About to send an admin (session-level) message. May mutate `message`.
   * @param message The outbound message (mutable).
   */
  toAdmin?(message: Message, sessionID: SessionID): void;
  /**
   * About to send an application message. May mutate `message`, or throw a
   * {@link FixReject} with kind `'DoNotSend'` to suppress it.
   */
  toApp?(message: Message, sessionID: SessionID): void;
  /**
   * Received an admin (session-level) message. May throw a {@link FixReject}
   * (e.g. `'RejectLogon'`) to reject it.
   */
  fromAdmin?(message: Message, sessionID: SessionID): void;
  /**
   * Received an application message. May throw a {@link FixReject} (e.g.
   * `'UnsupportedMessageType'`, `'DoNotSend'`) to reject it.
   */
  fromApp?(message: Message, sessionID: SessionID): void;
}

/**
 * The kinds of rejection the native bridge understands. Throwing a
 * {@link FixReject} with one of these maps to the matching QuickFIX behaviour:
 * - `'DoNotSend'` → `FIX::DoNotSend` (from `toApp`)
 * - `'RejectLogon'` → `FIX::RejectLogon` (from `fromAdmin`)
 * - `'UnsupportedMessageType'` → `FIX::UnsupportedMessageType` (from `fromApp`)
 * - `'IncorrectDataFormat'` → `FIX::IncorrectDataFormat`
 * - `'IncorrectTagValue'` → `FIX::IncorrectTagValue`
 * - `'FieldNotFound'` → `FIX::FieldNotFound`
 */
export type FixRejectKind =
  | 'DoNotSend'
  | 'RejectLogon'
  | 'UnsupportedMessageType'
  | 'IncorrectDataFormat'
  | 'IncorrectTagValue'
  | 'FieldNotFound';

/**
 * A typed rejection error to throw from an {@link ApplicationHandlers} callback.
 *
 * The native bridge inspects a thrown error's `fixError` property (a
 * {@link FixRejectKind}) to decide which QuickFIX exception to raise on the
 * engine thread. Throwing any error without a recognized `fixError` results in a
 * generic rejection.
 *
 * For symmetry with errors flowing the OTHER way (native → JS
 * {@link import('./native.js').QuickFixError}), a `FixReject` also carries a
 * `fixErrorName` set to the same stable {@link FixRejectKind} discriminator.
 * Here `fixError` and `fixErrorName` are identical (the kinds are already
 * space-free); the pair exists so both directions expose the same shape.
 *
 * @example
 * ```ts
 * handlers: {
 *   fromApp(msg) {
 *     if (msg.getMsgType() === 'X') throw new FixReject('UnsupportedMessageType');
 *   },
 * }
 * ```
 */
export class FixReject extends Error {
  /**
   * Discriminator read by the native bridge to map to a FIX exception. The
   * bridge maps rejections by THIS property.
   */
  readonly fixError: FixRejectKind;
  /**
   * Stable, space-free discriminator (equal to {@link FixReject.fixError}).
   * Mirrors {@link import('./native.js').QuickFixError.fixErrorName} so both
   * error directions share one shape.
   */
  readonly fixErrorName: FixRejectKind;
  /** Optional extra detail forwarded to the engine where supported. */
  readonly detail?: string;

  constructor(kind: FixRejectKind, message?: string, detail?: string) {
    super(message ?? kind);
    this.name = 'FixReject';
    this.fixError = kind;
    this.fixErrorName = kind;
    this.detail = detail;
  }
}

/**
 * Convenience factory for a {@link FixReject}. Equivalent to
 * `new FixReject(kind, message, detail)`.
 *
 * @example
 * ```ts
 * throw fixReject('DoNotSend');
 * ```
 */
export function fixReject(kind: FixRejectKind, message?: string, detail?: string): FixReject {
  return new FixReject(kind, message, detail);
}
