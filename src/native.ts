// Loads the compiled native addon. The actual `require('node-gyp-build')(root)`
// lives in the authored load-native.cjs, which build:ts:copy places next to the
// compiled output in both dist/esm and dist/cjs. We import it here; the ESM and
// CJS TS builds each emit the correct interop for pulling in a CommonJS module,
// so this single source works for both output formats.
//
// A plain default import compiles under BOTH tsconfigs (NodeNext ESM and
// CommonJS/Bundler). We intentionally avoid `import.meta` / `createRequire`
// here because `import.meta` is not permitted under the CommonJS tsconfig.
import nativeModule from './load-native.cjs';

/* ------------------------------------------------------------------------- *
 * Native ↔ TS interface contract.
 *
 * These interfaces describe the shape of the addon exported by
 * `load-native.cjs`. The runtime classes live in C++ (Agent 2); tsc only needs
 * these types, so the TS build does not depend on the native module existing.
 * All of the ergonomic TS wrappers in this package depend on THESE types, never
 * on the raw addon directly.
 * ------------------------------------------------------------------------- */

/**
 * Native `FIX::Message` wrapper. FIX is string-on-the-wire, so every field
 * value crosses the boundary as a string.
 */
export interface NativeMessage {
  getField(tag: number): string;
  setField(tag: number, value: string): void;
  getHeaderField(tag: number): string;
  setHeaderField(tag: number, value: string): void;
  getTrailerField(tag: number): string;
  setTrailerField(tag: number, value: string): void;
  getMsgType(): string;
  toString(): string;
  toPretty(): string;
}

/** Constructor shape for the native `MessageWrap` class. */
export interface NativeMessageConstructor {
  new (): NativeMessage;
  new (raw: string, validate?: boolean): NativeMessage;
}

/** Native `FIX::SessionID` wrapper. */
export interface NativeSessionID {
  getBeginString(): string;
  getSenderCompID(): string;
  getTargetCompID(): string;
  getSessionQualifier(): string;
  toString(): string;
}

/** Constructor shape for the native `SessionIDWrap` class. */
export interface NativeSessionIDConstructor {
  new (
    beginString: string,
    senderCompID: string,
    targetCompID: string,
    qualifier?: string,
  ): NativeSessionID;
}

/** Native `FIX::SessionSettings` wrapper. */
export interface NativeSessionSettings {
  getSessions(): NativeSessionID[];
}

/**
 * Constructor shape for the native `SessionSettingsWrap` class. `fromString` /
 * `fromFile` MAY appear here as statics (see the module-level equivalents on
 * {@link NativeModule}); we resolve defensively at runtime.
 */
export interface NativeSessionSettingsConstructor {
  new (): NativeSessionSettings;
  fromString?(cfg: string): NativeSessionSettings;
  fromFile?(path: string): NativeSessionSettings;
}

/**
 * Error shape thrown across the native bridge (e.g. from
 * {@link NativeDataDictionary.validate}, message getters, or engine ops).
 *
 * Carries TWO error identifiers:
 * - {@link QuickFixError.fixError} — the QuickFIX runtime exception type as
 *   reported by the C++ engine. This is a human-facing string that MAY contain
 *   spaces (e.g. `'Session Not Found'`, `'Field not found'`).
 * - {@link QuickFixError.fixErrorName} — a stable, space-free discriminator
 *   suitable for `switch`/equality checks (e.g. `'SessionNotFound'`,
 *   `'FieldNotFound'`). Prefer this for programmatic branching.
 */
export interface QuickFixError extends Error {
  /** Always `'QuickFixError'` for errors originating in the native bridge. */
  name: string;
  /** Human-readable message. */
  message: string;
  /**
   * QuickFIX runtime exception type string (may contain spaces), e.g.
   * `'Session Not Found'`. This is the value the native bridge reads when
   * mapping a thrown rejection back to a FIX exception.
   */
  fixError?: string;
  /**
   * Stable, space-free discriminator, e.g. `'SessionNotFound'`. Use this for
   * programmatic checks; it is not subject to QuickFIX's human-facing wording.
   */
  fixErrorName?: string;
  /** Optional extra detail forwarded from the engine where available. */
  detail?: string;
}

/** Native `FIX::DataDictionary` wrapper. */
export interface NativeDataDictionary {
  /** Throws a {@link QuickFixError} if the message is invalid. */
  validate(message: NativeMessage): void;
}

/**
 * Constructor shape for the native `DataDictionaryWrap` class. `fromString` /
 * `fromFile` MAY appear here as statics (see module-level equivalents on
 * {@link NativeModule}); we resolve defensively at runtime.
 */
export interface NativeDataDictionaryConstructor {
  new (): NativeDataDictionary;
  fromString?(xml: string): NativeDataDictionary;
  fromFile?(path: string): NativeDataDictionary;
}

/**
 * The handlers object handed to the native engine constructor. Each callback
 * receives raw native handles (the TS layer re-wraps them). Mutation happens by
 * mutating the passed {@link NativeMessage}; rejection happens by throwing.
 */
export interface NativeApplicationHandlers {
  onCreate?(sessionID: NativeSessionID): void;
  onLogon?(sessionID: NativeSessionID): void;
  onLogout?(sessionID: NativeSessionID): void;
  toAdmin?(message: NativeMessage, sessionID: NativeSessionID): void;
  toApp?(message: NativeMessage, sessionID: NativeSessionID): void;
  fromAdmin?(message: NativeMessage, sessionID: NativeSessionID): void;
  fromApp?(message: NativeMessage, sessionID: NativeSessionID): void;
}

/** Options passed to the native `InitiatorWrap` / `AcceptorWrap` constructors. */
export interface NativeEngineOptions {
  settings: NativeSessionSettings;
  handlers?: NativeApplicationHandlers;
  store?: 'file' | 'memory';
  log?: 'screen' | 'file' | 'none';
}

/**
 * Native handle on a live `FIX::Session`.
 *
 * The handle stores only the `FIX::SessionID`; every method re-resolves the
 * engine-owned session via `FIX::Session::lookupSession` and throws a
 * {@link QuickFixError} with `fixErrorName: 'SessionNotFound'` once the owning
 * engine has been stopped.
 *
 * Every member is synchronous: none takes the session mutex QuickFIX holds
 * across application callbacks, so they are safe on the main thread.
 * `FIX::Session::disconnect()`/`reset()` are not exposed; they are only safe
 * on the engine's own network thread (see `cpp/session_wrap.cpp`).
 */
export interface NativeSession {
  getSessionID(): NativeSessionID;

  isLoggedOn(): boolean;
  isEnabled(): boolean;
  sentLogon(): boolean;
  sentLogout(): boolean;
  receivedLogon(): boolean;
  isInitiator(): boolean;
  isAcceptor(): boolean;
  /** `nowMs` is an epoch-millisecond timestamp; omitted means "now". */
  isSessionTime(nowMs?: number): boolean;
  isLogonTime(nowMs?: number): boolean;

  getExpectedSenderNum(): number;
  getExpectedTargetNum(): number;
  setNextSenderMsgSeqNum(seqNum: number): void;
  setNextTargetMsgSeqNum(seqNum: number): void;

  getResetOnLogon(): boolean;
  setResetOnLogon(value: boolean): void;
  getResetOnLogout(): boolean;
  setResetOnLogout(value: boolean): void;
  getResetOnDisconnect(): boolean;
  setResetOnDisconnect(value: boolean): void;
  getRefreshOnLogon(): boolean;
  setRefreshOnLogon(value: boolean): void;
  getCheckCompId(): boolean;
  setCheckCompId(value: boolean): void;
  getCheckLatency(): boolean;
  setCheckLatency(value: boolean): void;
  getPersistMessages(): boolean;
  setPersistMessages(value: boolean): void;
  getSendRedundantResendRequests(): boolean;
  setSendRedundantResendRequests(value: boolean): void;
  getValidateLengthAndChecksum(): boolean;
  setValidateLengthAndChecksum(value: boolean): void;
  getSendNextExpectedMsgSeqNum(): boolean;
  setSendNextExpectedMsgSeqNum(value: boolean): void;
  getIsNonStopSession(): boolean;
  setIsNonStopSession(value: boolean): void;
  getLogonTimeout(): number;
  setLogonTimeout(seconds: number): void;
  getLogoutTimeout(): number;
  setLogoutTimeout(seconds: number): void;
  getMaxLatency(): number;
  setMaxLatency(seconds: number): void;
  getTimestampPrecision(): number;
  /** Throws a `RangeError` unless `precision` is an integer in `0..9`. */
  setTimestampPrecision(precision: number): void;

  logon(): void;
  logout(reason?: string): void;
  /** May throw a `QuickFixError` (`IOException`) from the message store. */
  refresh(): void;
}

/**
 * Constructor shape for the native `SessionWrap` class. Internal: JS obtains a
 * session through {@link NativeModule.lookupSession} or
 * {@link NativeEngine.getSession}, never by constructing one.
 */
export interface NativeSessionConstructor {
  new (sessionID: NativeSessionID): NativeSession;
}

/**
 * Native engine (SocketInitiator / SocketAcceptor) wrapper.
 *
 * `start`/`stop` run OFF the main thread and resolve a Promise when the engine
 * has finished (re)configuring its sockets, so the Node.js event loop stays free
 * to service the application callbacks the engine fires. `isLoggedOn`/`ref`/
 * `unref`/`getSessions`/`getSession` remain synchronous.
 *
 * Once `stop()` settles the engine is destroyed, which also destroys its
 * `FIX::Session` objects: `getSession` then returns `undefined` and any
 * previously obtained {@link NativeSession} throws `SessionNotFound`.
 */
export interface NativeEngine {
  start(): Promise<void>;
  stop(force?: boolean): Promise<void>;
  /**
   * No argument: whether ANY of this engine's sessions is logged on. With a
   * SessionID: whether THAT session belongs to this engine and is logged on.
   */
  isLoggedOn(sessionID?: NativeSessionID): boolean;
  /** The SessionIDs this engine was configured with (stable across stop()). */
  getSessions(): NativeSessionID[];
  /** `undefined` if the id is not one of this engine's sessions or stop() has settled. */
  getSession(sessionID: NativeSessionID): NativeSession | undefined;
  ref(): void;
  unref(): void;
}

/** Constructor shape for the native `InitiatorWrap` / `AcceptorWrap` classes. */
export interface NativeEngineConstructor {
  new (options: NativeEngineOptions): NativeEngine;
}

/**
 * The full surface of the native addon exported by `load-native.cjs`.
 *
 * FIX constants are not exported by the addon: field tags (`FIELD`) and value
 * groups (`MsgType`, `Side`, ...) are generated on the TS side from the
 * QuickFIX headers (`src/generated/fields.ts`, `src/generated/values.ts`).
 */
export interface NativeModule {
  version(): string;
  quickfixParseMsgType(raw: string): string;
  /**
   * Runs off the main thread; resolves `true` if accepted for sending.
   *
   * Second argument: an explicit SessionID, or a session qualifier (possibly
   * omitted/empty), in which case QuickFIX resolves the session from the
   * message's own header (BeginString / SenderCompID / TargetCompID).
   */
  sendToTarget(
    message: NativeMessage,
    sessionIDOrQualifier?: NativeSessionID | string,
  ): Promise<boolean>;
  /** `undefined` if no session with that id exists in this process. */
  lookupSession(sessionID: NativeSessionID): NativeSession | undefined;
  doesSessionExist(sessionID: NativeSessionID): boolean;
  /** Every session registered in this process (all engines). */
  getSessions(): NativeSessionID[];
  numSessions(): number;

  MessageWrap: NativeMessageConstructor;
  SessionIDWrap: NativeSessionIDConstructor;
  SessionSettingsWrap: NativeSessionSettingsConstructor;
  DataDictionaryWrap: NativeDataDictionaryConstructor;
  SessionWrap: NativeSessionConstructor;
  InitiatorWrap: NativeEngineConstructor;
  AcceptorWrap: NativeEngineConstructor;

  // Module-level fromString/fromFile helpers MAY be present instead of (or in
  // addition to) the class statics above. Resolved defensively in the wrappers.
  sessionSettingsFromString?(cfg: string): NativeSessionSettings;
  sessionSettingsFromFile?(path: string): NativeSessionSettings;
  dataDictionaryFromString?(xml: string): NativeDataDictionary;
  dataDictionaryFromFile?(path: string): NativeDataDictionary;
}

/**
 * The loaded native addon, typed against the {@link NativeModule} contract.
 * The default import is an `unknown` (per node-gyp-build's declaration); we
 * assert it to the contract here — the single localized cast in the codebase.
 */
export const native = nativeModule as unknown as NativeModule;
