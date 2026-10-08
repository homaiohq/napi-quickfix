/**
 * Ergonomic wrapper around a live native `FIX::Session`.
 */
import { native, type NativeSession } from './native.js';
import { SessionID } from './session-id.js';

/**
 * A handle on one live FIX session (wraps `FIX::Session`).
 *
 * Obtain one with {@link lookupSession} (any session in the process) or
 * {@link Engine.getSession} (a session of a particular engine); sessions
 * cannot be constructed directly.
 *
 * **Lifetime.** The underlying `FIX::Session` is owned by its engine. This
 * handle stores only the {@link SessionID} and re-resolves the session on every
 * call, so it never dangles: once the owning engine has been stopped (which
 * destroys its sessions) every method throws — or, for the async ones, rejects
 * with — a {@link QuickFixError} whose `fixErrorName` is `'SessionNotFound'`.
 *
 * **Sync vs. async.** State queries, sequence-number access and the runtime
 * option getters/setters are synchronous: they never take the mutex QuickFIX
 * holds while running your application handlers. {@link Session.logon},
 * {@link Session.logout}, {@link Session.disconnect}, {@link Session.reset} and
 * {@link Session.refresh} return a `Promise` and run off the main thread, because
 * `reset`/`disconnect` take that mutex and fire `toAdmin`/`onLogout`, which must
 * round-trip to the event loop (see ARCHITECTURE.md §5).
 *
 * @example
 * ```ts
 * const session = initiator.getSession(sessionID)!;
 * if (session.isLoggedOn()) {
 *   console.log('next outbound seq', session.getExpectedSenderNum());
 *   await session.logout('maintenance');
 * }
 * ```
 */
export class Session {
  /** @internal Underlying native handle. */
  readonly #native: NativeSession;

  /** @internal Use {@link lookupSession} / {@link Engine.getSession}. */
  private constructor(handle: NativeSession) {
    this.#native = handle;
  }

  /** @internal Wrap an existing native session handle. */
  static fromNative(handle: NativeSession): Session {
    return new Session(handle);
  }

  /** @internal The native handle backing this session. */
  get nativeHandle(): NativeSession {
    return this.#native;
  }

  /** The id this handle refers to. Always available, even after the session is gone. */
  get sessionID(): SessionID {
    return SessionID.fromNative(this.#native.getSessionID());
  }

  // --- state -----------------------------------------------------------------

  /** `true` once a Logon has been both sent and received. */
  isLoggedOn(): boolean {
    return this.#native.isLoggedOn();
  }

  /**
   * Whether the session is enabled. `false` after {@link Session.logout} until
   * {@link Session.logon}; a disabled initiator session is not reconnected.
   */
  isEnabled(): boolean {
    return this.#native.isEnabled();
  }

  /** Whether this side has sent a Logon on the current connection. */
  sentLogon(): boolean {
    return this.#native.sentLogon();
  }

  /** Whether this side has sent a Logout on the current connection. */
  sentLogout(): boolean {
    return this.#native.sentLogout();
  }

  /** Whether a Logon has been received on the current connection. */
  receivedLogon(): boolean {
    return this.#native.receivedLogon();
  }

  /** `true` for a session owned by an {@link Initiator}. */
  isInitiator(): boolean {
    return this.#native.isInitiator();
  }

  /** `true` for a session owned by an {@link Acceptor}. */
  isAcceptor(): boolean {
    return this.#native.isAcceptor();
  }

  /**
   * Whether `now` (default: the current time) falls inside the session's
   * configured `StartTime`/`EndTime` window.
   */
  isSessionTime(now?: Date): boolean {
    return this.#native.isSessionTime(now?.getTime());
  }

  /**
   * Whether `now` (default: the current time) falls inside the session's
   * configured `LogonTime`/`LogoutTime` window.
   */
  isLogonTime(now?: Date): boolean {
    return this.#native.isLogonTime(now?.getTime());
  }

  // --- sequence numbers --------------------------------------------------------

  /** The MsgSeqNum (tag 34) the next outbound message will carry. */
  getExpectedSenderNum(): number {
    return this.#native.getExpectedSenderNum();
  }

  /** The MsgSeqNum (tag 34) expected on the next inbound message. */
  getExpectedTargetNum(): number {
    return this.#native.getExpectedTargetNum();
  }

  /**
   * Set the MsgSeqNum the next outbound message will carry (writes to the
   * message store; a file store may throw `IOException`).
   *
   * @throws `RangeError` if `seqNum` is not a non-negative safe integer.
   */
  setNextSenderMsgSeqNum(seqNum: number): void {
    this.#native.setNextSenderMsgSeqNum(seqNum);
  }

  /**
   * Set the MsgSeqNum expected on the next inbound message (writes to the
   * message store; a file store may throw `IOException`).
   *
   * @throws `RangeError` if `seqNum` is not a non-negative safe integer.
   */
  setNextTargetMsgSeqNum(seqNum: number): void {
    this.#native.setNextTargetMsgSeqNum(seqNum);
  }

  // --- runtime options -----------------------------------------------------------
  // Each pair mirrors a QuickFIX session setting; the setter changes the LIVE
  // session only (the SessionSettings it was created from are not updated).

  /** `ResetOnLogon` */
  getResetOnLogon(): boolean {
    return this.#native.getResetOnLogon();
  }
  setResetOnLogon(value: boolean): void {
    this.#native.setResetOnLogon(value);
  }

  /** `ResetOnLogout` */
  getResetOnLogout(): boolean {
    return this.#native.getResetOnLogout();
  }
  setResetOnLogout(value: boolean): void {
    this.#native.setResetOnLogout(value);
  }

  /** `ResetOnDisconnect` */
  getResetOnDisconnect(): boolean {
    return this.#native.getResetOnDisconnect();
  }
  setResetOnDisconnect(value: boolean): void {
    this.#native.setResetOnDisconnect(value);
  }

  /** `RefreshOnLogon` */
  getRefreshOnLogon(): boolean {
    return this.#native.getRefreshOnLogon();
  }
  setRefreshOnLogon(value: boolean): void {
    this.#native.setRefreshOnLogon(value);
  }

  /** `CheckCompID` */
  getCheckCompId(): boolean {
    return this.#native.getCheckCompId();
  }
  setCheckCompId(value: boolean): void {
    this.#native.setCheckCompId(value);
  }

  /** `CheckLatency` */
  getCheckLatency(): boolean {
    return this.#native.getCheckLatency();
  }
  setCheckLatency(value: boolean): void {
    this.#native.setCheckLatency(value);
  }

  /** `PersistMessages` */
  getPersistMessages(): boolean {
    return this.#native.getPersistMessages();
  }
  setPersistMessages(value: boolean): void {
    this.#native.setPersistMessages(value);
  }

  /** `SendRedundantResendRequests` */
  getSendRedundantResendRequests(): boolean {
    return this.#native.getSendRedundantResendRequests();
  }
  setSendRedundantResendRequests(value: boolean): void {
    this.#native.setSendRedundantResendRequests(value);
  }

  /** `ValidateLengthAndChecksum` */
  getValidateLengthAndChecksum(): boolean {
    return this.#native.getValidateLengthAndChecksum();
  }
  setValidateLengthAndChecksum(value: boolean): void {
    this.#native.setValidateLengthAndChecksum(value);
  }

  /** `SendNextExpectedMsgSeqNum` */
  getSendNextExpectedMsgSeqNum(): boolean {
    return this.#native.getSendNextExpectedMsgSeqNum();
  }
  setSendNextExpectedMsgSeqNum(value: boolean): void {
    this.#native.setSendNextExpectedMsgSeqNum(value);
  }

  /** `NonStopSession` */
  getIsNonStopSession(): boolean {
    return this.#native.getIsNonStopSession();
  }
  setIsNonStopSession(value: boolean): void {
    this.#native.setIsNonStopSession(value);
  }

  /** `LogonTimeout`, in seconds. */
  getLogonTimeout(): number {
    return this.#native.getLogonTimeout();
  }
  setLogonTimeout(seconds: number): void {
    this.#native.setLogonTimeout(seconds);
  }

  /** `LogoutTimeout`, in seconds. */
  getLogoutTimeout(): number {
    return this.#native.getLogoutTimeout();
  }
  setLogoutTimeout(seconds: number): void {
    this.#native.setLogoutTimeout(seconds);
  }

  /** `MaxLatency`, in seconds. */
  getMaxLatency(): number {
    return this.#native.getMaxLatency();
  }
  setMaxLatency(seconds: number): void {
    this.#native.setMaxLatency(seconds);
  }

  /** `TimestampPrecision` (number of sub-second digits, `0..9`). */
  getTimestampPrecision(): number {
    return this.#native.getTimestampPrecision();
  }
  /** @throws `RangeError` unless `precision` is an integer in `0..9`. */
  setTimestampPrecision(precision: number): void {
    this.#native.setTimestampPrecision(precision);
  }

  // --- control (async) -------------------------------------------------------------

  /**
   * Enable the session. An initiator session reconnects and logs on at its
   * next `ReconnectInterval`; an acceptor session accepts the next inbound
   * Logon. Observe the result through the engine's `'logon'` event.
   */
  logon(): Promise<void> {
    return this.#native.logon();
  }

  /**
   * Disable the session and initiate a graceful Logout (sent with `reason` as
   * tag 58 on the next engine tick). The session stays disabled — it will not
   * reconnect — until {@link Session.logon}. Observe completion through the
   * engine's `'logout'` event.
   */
  logout(reason?: string): Promise<void> {
    return this.#native.logout(reason);
  }

  /**
   * Drop the transport immediately (no Logout exchange). Fires `onLogout` if
   * the session was logged on. An enabled initiator session reconnects at its
   * next `ReconnectInterval`.
   */
  disconnect(): Promise<void> {
    return this.#native.disconnect();
  }

  /**
   * Send a Logout, disconnect, and reset the message store (sequence numbers
   * back to 1). An enabled initiator session then reconnects.
   */
  reset(): Promise<void> {
    return this.#native.reset();
  }

  /** Re-read the session state (sequence numbers etc.) from the message store. */
  refresh(): Promise<void> {
    return this.#native.refresh();
  }
}

/**
 * Look up a live session by id, across every engine in this process.
 *
 * @returns The {@link Session}, or `undefined` if no session with that id
 *   exists (never created, or its engine has been stopped).
 *
 * @example
 * ```ts
 * const session = lookupSession(new SessionID('FIX.4.4', 'CLIENT', 'BROKER'));
 * console.log(session?.isLoggedOn());
 * ```
 */
export function lookupSession(sessionID: SessionID): Session | undefined {
  const handle = native.lookupSession(sessionID.nativeHandle);
  return handle ? Session.fromNative(handle) : undefined;
}

/** Whether a session with this id exists in this process. */
export function doesSessionExist(sessionID: SessionID): boolean {
  return native.doesSessionExist(sessionID.nativeHandle);
}

/** The ids of every session in this process, across all engines. */
export function getSessions(): SessionID[] {
  return native.getSessions().map((h) => SessionID.fromNative(h));
}

/** The number of sessions in this process, across all engines. */
export function numSessions(): number {
  return native.numSessions();
}
