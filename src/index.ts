/**
 * `@homaiohq/napi-quickfix` — a modern Node-API binding for the QuickFIX C++
 * FIX-protocol engine.
 *
 * @packageDocumentation
 */
import { native } from './native.js';
import type { Message } from './message.js';
import type { SessionID } from './session-id.js';

// --- Pure layer -----------------------------------------------------------
export { Message, createMessage, parseMessage } from './message.js';
export type { MessageOptions, MessageParseOptions, MessageJSON } from './message.js';
export { Group } from './group.js';
export { SessionID } from './session-id.js';
export { SessionSettings } from './session-settings.js';
export { DataDictionary } from './data-dictionary.js';

// --- Session engine -------------------------------------------------------
export { Initiator } from './initiator.js';
export { Acceptor } from './acceptor.js';
export { Engine } from './engine.js';
export type { EngineOptions, EngineEvents } from './engine.js';
export { FixReject, fixReject } from './application.js';
export type { ApplicationHandlers, FixRejectKind } from './application.js';
export type { QuickFixError } from './native.js';

// --- Enums / constants ----------------------------------------------------
export { enums, FIELD, MsgType, Side } from './enums.js';
export type { Enums, EnumGroup, FieldName } from './enums.js';

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
 *
 * @example
 * ```ts
 * import { sendToTarget, createMessage, SessionID, FIELD, MsgType } from '@homaiohq/napi-quickfix';
 * const order = createMessage({ [FIELD.MsgType]: MsgType.NewOrderSingle });
 * await sendToTarget(order, new SessionID('FIX.4.4', 'CLIENT', 'BROKER'));
 * ```
 */
export function sendToTarget(message: Message, sessionID: SessionID): Promise<boolean> {
  return native.sendToTarget(message.nativeHandle, sessionID.nativeHandle);
}

/** The QuickFIX engine / addon version string. */
export const version: () => string = () => native.version();

/**
 * Parse the MsgType (tag 35) out of a raw FIX wire string. Low-level helper;
 * prefer {@link Message.parse} + {@link Message.getMsgType} for general use.
 */
export const quickfixParseMsgType: (raw: string) => string = (raw) =>
  native.quickfixParseMsgType(raw);
