/**
 * Ergonomic wrapper around a live native `FIX::Session`.
 */
import { native, type NativeSession } from './native.js';
import { SessionID, toNativeSessionID } from './session-id.js';

/**
 * A handle on one live FIX session (wraps `FIX::Session`).
 *
 * Obtain one with {@link lookupSession} (any session in the process) or
 * {@link Engine.getSession} (a session of a particular engine); sessions
 * cannot be constructed directly.
 *
 * **Lifetime.** The underlying `FIX::Session` is owned by its engine. This
 * handle stores only the {@link SessionID} and the identity of the engine it
 * was obtained from, and re-resolves the session on every call, so it never
 * dangles: once that engine has been stopped (which destroys its sessions)
 * every method throws a {@link QuickFixError} whose `fixErrorName` is
 * `'SessionNotFound'` -- also after a new engine has been created with the
 * same id. A handle never crosses over to another engine's session; obtain a
 * new one from the new engine.
 *
 * **Sync and async members.** State queries, the sequence-number getters and
 * the runtime option getters/setters are synchronous. {@link Session.logon},
 * {@link Session.logout}, {@link Session.refresh},
 * {@link Session.setNextSenderMsgSeqNum} and
 * {@link Session.setNextTargetMsgSeqNum} return a Promise: they take the
 * session-state mutex that the engine holds while it writes to the message
 * store, and with a {@link MessageStoreAdapter} that write waits on the event
 * loop, so taking the mutex on the main thread would deadlock the process.
 * They therefore run on a worker thread, like {@link sendToTarget}. Calls on
 * one session are serialised in program order, awaited or not:
 * `session.logout('x'); session.logon();` lands in that order. Their latency is
 * that of the worker pool: they queue behind in-flight `sendToTarget` calls,
 * each of which may be waiting on a store write (see the README). Once the
 * owning engine is gone they reject with `SessionNotFound`.
 * ({@link Session.logon} / {@link Session.logout} flip a plain flag the
 * engine's network thread reads without a lock, exactly as QuickFIX's own
 * `Initiator::stop()` does; the engine picks the change up on its next pass.)
 * QuickFIX's `Session::disconnect()` / `reset()` are deliberately not exposed:
 * they are only safe on the engine's own network thread (see ARCHITECTURE.md
 * §5). Use {@link Session.logout} to bring a session down, and the
 * sequence-number setters to reset its numbering -- on a quiet session; see
 * {@link Session.setNextSenderMsgSeqNum}.
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
  /** @internal The serial-chain key (`sessionID.toString()`), see {@link serialise}. */
  readonly #key: string;

  /** @internal Use {@link lookupSession} / {@link Engine.getSession}. */
  private constructor(handle: NativeSession) {
    this.#native = handle;
    this.#key = SessionID.fromNative(handle.getSessionID()).toString();
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
   * configured `StartTime`/`EndTime` window. Throws `RangeError` for an
   * invalid `Date`.
   */
  isSessionTime(now?: Date): boolean {
    return this.#native.isSessionTime(now?.getTime());
  }

  /**
   * Whether `now` (default: the current time) falls inside the session's
   * configured `LogonTime`/`LogoutTime` window. Throws `RangeError` for an
   * invalid `Date`.
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
   * message store). Runs on a worker thread, serialised with the other
   * control calls on this session; resolves once the store has acknowledged
   * the write.
   *
   * **Call it on a quiet session.** The setter is not serialised against a
   * message the engine is sending or receiving on this session at the same
   * time: QuickFIX reads the next number into the outbound header, runs your
   * `toApp`/`toAdmin` handler, then increments from the store, all under a
   * lock this call does not take. A value set inside that window -- from a
   * handler, or while a {@link sendToTarget} promise or a heartbeat is in
   * flight on this session -- is overwritten by the increment, and the
   * session ends up one off from its counterparty (a Resend Request or a
   * "MsgSeqNum too low" Logout). With a {@link MessageStoreAdapter} (and
   * `PersistMessages=Y`, the default), a value set after the outbound header
   * was stamped but before the message was written makes that send fail
   * instead: `sendToTarget()` resolves `false`, a non-poisoning
   * `'storeError'` names the mismatch, and the new number stands. Set it before {@link Engine.start}, from a
   * `'logout'` event, or when you know nothing is in flight; never from a
   * handler.
   *
   * @throws `RangeError` synchronously if `seqNum` is not a positive safe
   *   integer (MsgSeqNum is 1-based).
   * @returns Rejects with a {@link QuickFixError}: `SessionNotFound` once the
   *   engine is gone (a `'logout'` listener fired by `stop()` may see this),
   *   `IOException` if the store refused the write.
   */
  setNextSenderMsgSeqNum(seqNum: number): Promise<void> {
    checkSeqNum(seqNum, 'setNextSenderMsgSeqNum');
    return serialise(this.#key, () => this.#native.setNextSenderMsgSeqNum(seqNum));
  }

  /**
   * Set the MsgSeqNum expected on the next inbound message (writes to the
   * message store). Runs on a worker thread, serialised with the other
   * control calls on this session; resolves once the store has acknowledged
   * the write.
   *
   * **Call it on a quiet session.** Like {@link Session.setNextSenderMsgSeqNum},
   * it is not serialised against a message the engine is processing on this
   * session: QuickFIX checks the inbound number, runs your `fromApp`/`fromAdmin`
   * handler, then increments the expected number from the store under a lock
   * this call does not take, so a value set meanwhile is overwritten. Set it
   * before {@link Engine.start}, from a `'logout'` event, or when you know
   * nothing is in flight; never from a handler.
   *
   * @throws `RangeError` synchronously if `seqNum` is not a positive safe
   *   integer (MsgSeqNum is 1-based).
   * @returns Rejects with a {@link QuickFixError}: `SessionNotFound` once the
   *   engine is gone, `IOException` if the store refused the write.
   */
  setNextTargetMsgSeqNum(seqNum: number): Promise<void> {
    checkSeqNum(seqNum, 'setNextTargetMsgSeqNum');
    return serialise(this.#key, () => this.#native.setNextTargetMsgSeqNum(seqNum));
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
  /** @throws {RangeError} if `seconds` is not an integer in the int32 range. */
  setLogonTimeout(seconds: number): void {
    this.#native.setLogonTimeout(seconds);
  }

  /** `LogoutTimeout`, in seconds. */
  getLogoutTimeout(): number {
    return this.#native.getLogoutTimeout();
  }
  /** @throws {RangeError} if `seconds` is not an integer in the int32 range. */
  setLogoutTimeout(seconds: number): void {
    this.#native.setLogoutTimeout(seconds);
  }

  /** `MaxLatency`, in seconds. */
  getMaxLatency(): number {
    return this.#native.getMaxLatency();
  }
  /** @throws {RangeError} if `seconds` is not an integer in the int32 range. */
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

  // --- control -----------------------------------------------------------------------

  /**
   * Enable the session. An initiator session reconnects and logs on at its
   * next `ReconnectInterval`; an acceptor session accepts the next inbound
   * Logon. Resolves once the flag is set ({@link Session.isEnabled} is `true`
   * then); observe the handshake through the engine's `'logon'` event.
   *
   * @returns Rejects with a {@link QuickFixError} (`SessionNotFound`) once the
   *   engine is gone.
   */
  logon(): Promise<void> {
    return serialise(this.#key, () => this.#native.logon());
  }

  /**
   * Disable the session and initiate a graceful Logout (sent with `reason` as
   * tag 58 on the next engine tick). The session stays disabled — it will not
   * reconnect — until {@link Session.logon}. Resolves once the flag is cleared
   * ({@link Session.isEnabled} is `false` then); observe completion through
   * the engine's `'logout'` event.
   *
   * @returns Rejects with a {@link QuickFixError} (`SessionNotFound`) once the
   *   engine is gone.
   */
  logout(reason?: string): Promise<void> {
    if (reason !== undefined && typeof reason !== 'string') {
      throw new TypeError('logout(reason?: string)');
    }
    return serialise(this.#key, () => this.#native.logout(reason));
  }

  /**
   * Re-read the session state (sequence numbers etc.) from the message store.
   *
   * @returns Rejects with a {@link QuickFixError}: `IOException` if the store
   *   cannot be read (or a `stop(true)` aborted the read), `SessionNotFound`
   *   once the engine is gone.
   */
  refresh(): Promise<void> {
    return serialise(this.#key, () => this.#native.refresh());
  }
}

/* ------------------------------------------------------------------------- *
 * Per-session serial chain for the worker-thread members.
 *
 * The native members queue an AsyncWorker each, and two workers may run on
 * two pool threads in either order; `logout(); logon();` must still end
 * enabled. The chain is keyed by `sessionID.toString()` at module level, not
 * per `Session` instance: every `getSession()` / `lookupSession()` call hands
 * out a fresh handle, so a per-instance chain would serialise nothing. The
 * entry is removed once its chain has drained (and no engine or handle is
 * referenced from it), so the map never pins an engine and does not grow with
 * the number of ids seen.
 *
 * Scope: one JS realm, shared by the ESM and CJS builds through a global
 * symbol: a handle from each build on the same session must queue on one
 * chain, or `esm.logout(); cjs.logon();` races.
 * ------------------------------------------------------------------------- */

const CHAINS_KEY = Symbol.for('@homaiohq/napi-quickfix:sessionChains');
const chains: Map<string, Promise<void>> = ((globalThis as Record<symbol, unknown>)[CHAINS_KEY] ??= new Map<
  string,
  Promise<void>
>()) as Map<string, Promise<void>>;

// Argument validation happens here, before the call is chained, so a bad
// argument is a synchronous TypeError/RangeError (as for every other member)
// rather than a rejection; the native setter checks again.
function checkSeqNum(seqNum: number, name: string): void {
  if (typeof seqNum !== 'number') {
    throw new TypeError(`${name}(seqNum: number)`);
  }
  if (!Number.isSafeInteger(seqNum) || seqNum < 1) {
    throw new RangeError(`${name}: seqNum must be a positive safe integer`);
  }
}

function serialise<T>(key: string, op: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  // Run after the previous call settled, whatever its outcome; the caller
  // gets this call's own result.
  const run = prev.then(op);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  chains.set(key, tail);
  void tail.then(() => {
    if (chains.get(key) === tail) chains.delete(key);
  });
  return run;
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
  const handle = native.lookupSession(toNativeSessionID(sessionID, 'sessionID'));
  return handle ? Session.fromNative(handle) : undefined;
}

/** Whether a session with this id exists in this process. */
export function doesSessionExist(sessionID: SessionID): boolean {
  return native.doesSessionExist(toNativeSessionID(sessionID, 'sessionID'));
}

/** The ids of every session in this process, across all engines. */
export function getSessions(): SessionID[] {
  return native.getSessions().map((h) => SessionID.fromNative(h));
}

/** The number of sessions in this process, across all engines. */
export function numSessions(): number {
  return native.numSessions();
}
