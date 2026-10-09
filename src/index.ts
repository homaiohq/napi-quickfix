/**
 * `@homaiohq/napi-quickfix` — a modern Node-API binding for the QuickFIX C++
 * FIX-protocol engine.
 *
 * @packageDocumentation
 */
import { native } from './native.js';
import type { Message } from './message.js';
import { type SessionID, toNativeSessionID } from './session-id.js';

// --- Pure layer -----------------------------------------------------------
export { Message, createMessage, parseMessage } from './message.js';
export type { MessageParseOptions, MessageJSON } from './message.js';
export { SessionID } from './session-id.js';
export { SessionSettings } from './session-settings.js';
export { DataDictionary } from './data-dictionary.js';

// --- Session engine -------------------------------------------------------
export { Initiator } from './initiator.js';
export { Acceptor } from './acceptor.js';
export { Engine } from './engine.js';
export type { EngineOptions, EngineEvents } from './engine.js';
export { Session, lookupSession, doesSessionExist, getSessions, numSessions } from './session.js';
export { FixReject, fixReject } from './application.js';
export type { ApplicationHandlers, FixRejectKind } from './application.js';
export type { QuickFixError } from './native.js';

// --- Enums / constants ----------------------------------------------------
// Every other value group (ExecType, OrdStatus, SecurityType, ...) is reachable
// as `enums.<Field>` / `VALUES.<Field>`, or by name from the
// `@homaiohq/napi-quickfix/values` subpath, which keeps this namespace small.
export { enums, FIELD, VALUES, MsgType, Side, OrdType, TimeInForce } from './enums.js';
export type { Enums, EnumGroup, FieldName, ValueGroups, ValueGroupName } from './enums.js';

/**
 * Send a message to the target session identified by `sessionID`.
 *
 * Wraps `FIX::Session::sendToTarget`. The session must exist and be logged on
 * for delivery; otherwise the engine queues or drops per its configuration.
 *
 * Runs off the main thread and resolves once the engine has accepted (or
 * rejected) the message, so the event loop stays free for callbacks. On a
 * missing session the returned Promise rejects with a
 * {@link QuickFixError} (`fixErrorName: 'SessionNotFound'`).
 *
 * @param message The message to send.
 * @param sessionID The destination session.
 * @returns A Promise resolving to `true` if the message was accepted for sending.
 * @throws {TypeError} synchronously if `sessionID` is neither a {@link SessionID}
 *   nor a qualifier string (it is not routed by the header instead).
 *
 * @example
 * ```ts
 * import { sendToTarget, createMessage, SessionID, FIELD, MsgType } from '@homaiohq/napi-quickfix';
 * const order = createMessage({ [FIELD.MsgType]: MsgType.NewOrderSingle });
 * await sendToTarget(order, new SessionID('FIX.4.4', 'CLIENT', 'BROKER'));
 * ```
 */
export function sendToTarget(message: Message, sessionID: SessionID): Promise<boolean>;
/**
 * Send a message to the session identified by the message's **own header**
 * (`BeginString`, `SenderCompID`, `TargetCompID`) plus an optional session
 * qualifier.
 *
 * Wraps the `FIX::Session::sendToTarget(message, qualifier)` overload. Same
 * threading and error behaviour as the SessionID form; a message whose header
 * does not identify an existing session rejects with
 * `fixErrorName: 'SessionNotFound'`.
 *
 * @param message The message to send; its header must carry tags 8, 49 and 56.
 * @param qualifier Optional session qualifier (`SessionQualifier` in the settings).
 */
export function sendToTarget(message: Message, qualifier?: string): Promise<boolean>;
export function sendToTarget(
  message: Message,
  sessionIDOrQualifier?: SessionID | string,
): Promise<boolean> {
  // Dispatch on the primitive, not `instanceof SessionID`: this package ships
  // ESM and CJS builds, and a SessionID created by the other build is a
  // different class with the same shape (see toNativeSessionID). Anything
  // else is a TypeError here rather than an `undefined` target the native
  // layer would read as "route by the message header".
  const target =
    typeof sessionIDOrQualifier === 'string' || sessionIDOrQualifier === undefined
      ? sessionIDOrQualifier
      : toNativeSessionID(sessionIDOrQualifier, 'sessionID');
  return native.sendToTarget(message.nativeHandle, target);
}

/** The QuickFIX engine / addon version string. */
export const version: () => string = () => native.version();

/**
 * Parse the MsgType (tag 35) out of a raw FIX wire string. Low-level helper;
 * prefer {@link Message.parse} + {@link Message.getMsgType} for general use.
 */
export const quickfixParseMsgType: (raw: string) => string = (raw) =>
  native.quickfixParseMsgType(raw);
