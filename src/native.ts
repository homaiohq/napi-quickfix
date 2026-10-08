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
 * The field and repeating-group operations every `FIX::FieldMap` exposes.
 * Shared by the message body and by group entries. Group indices are 1-based,
 * as in QuickFIX; `getGroup` returns a snapshot copy.
 */
export interface NativeFieldMap {
  getField(tag: number): string;
  setField(tag: number, value: string): void;
  isSetField(tag: number): boolean;
  removeField(tag: number): void;
  getFieldIfSet(tag: number): string | undefined;
  /** Own fields plus every field of every nested group entry. */
  totalFields(): number;
  isEmpty(): boolean;
  clear(): void;
  /** Own fields, in wire order, as `[tag, value]` pairs. */
  fields(): [number, string][];

  addGroup(group: NativeGroup): void;
  /** @throws A {@link QuickFixError} (`FieldNotFound`) when absent / out of range. */
  getGroup(index: number, tag: number): NativeGroup;
  /** @throws A {@link QuickFixError} (`FieldNotFound`) when the slot does not exist. */
  replaceGroup(index: number, group: NativeGroup): void;
  removeGroup(tag: number): void;
  removeGroup(index: number, tag: number): void;
  hasGroup(tag: number): boolean;
  hasGroup(index: number, tag: number): boolean;
  groupCount(tag: number): number;
}

/**
 * Native `FIX::Message` wrapper. FIX is string-on-the-wire, so every field
 * value crosses the boundary as a string. The {@link NativeFieldMap} methods
 * auto-route well-known header/trailer tags to the right section; `fields()`,
 * `isEmpty()` and `totalFields()` read the body, `clear()` empties everything.
 */
export interface NativeMessage extends NativeFieldMap {
  getHeaderField(tag: number): string;
  setHeaderField(tag: number, value: string): void;
  getTrailerField(tag: number): string;
  setTrailerField(tag: number, value: string): void;
  headerFields(): [number, string][];
  trailerFields(): [number, string][];
  getMsgType(): string;
  toString(): string;
  toPretty(): string;
}

/** Constructor shape for the native `MessageWrap` class. */
export interface NativeMessageConstructor {
  new (): NativeMessage;
  /**
   * Parse `raw`. With a dictionary the parse is structural (repeating groups
   * become nested groups); without one it is flat. Admin messages always use
   * the session dictionary; application messages use the application one.
   */
  new (
    raw: string,
    validate?: boolean,
    sessionDictionary?: NativeDataDictionary | null,
    applicationDictionary?: NativeDataDictionary | null,
  ): NativeMessage;
}

/** Native `FIX::Group` wrapper: one entry of a repeating group. */
export interface NativeGroup extends NativeFieldMap {
  /** The group's count tag (e.g. 453 NoPartyIDs). */
  field(): number;
  /** The first tag of every entry (e.g. 448 PartyID). */
  delim(): number;
  /** The entry's fields (and nested groups) as a SOH-delimited string, in wire order. */
  toString(): string;
}

/** Constructor shape for the native `GroupWrap` class. */
export interface NativeGroupConstructor {
  /**
   * @param order Optional full field order of an entry, delimiter first, no
   *   zeros. Without it, fields sort delimiter-first then by tag number.
   */
  new (field: number, delim: number, order?: readonly number[] | null): NativeGroup;
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
  /**
   * Throws a {@link QuickFixError} if the message is invalid. With `bodyOnly`
   * the BeginString version check and header/trailer validation are skipped.
   */
  validate(message: NativeMessage, bodyOnly?: boolean): void;
  /** The BeginString the spec declares (e.g. `'FIX.4.4'`), `''` if none. */
  getVersion(): string;
  getFieldName(tag: number): string | undefined;
  getFieldTag(name: string): number | undefined;
  isField(tag: number): boolean;
  isMsgType(msgType: string): boolean;
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
 * Native engine (SocketInitiator / SocketAcceptor) wrapper.
 *
 * `start`/`stop` run OFF the main thread and resolve a Promise when the engine
 * has finished (re)configuring its sockets, so the Node.js event loop stays free
 * to service the application callbacks the engine fires. `isLoggedOn`/`ref`/
 * `unref` remain synchronous.
 */
export interface NativeEngine {
  start(): Promise<void>;
  stop(force?: boolean): Promise<void>;
  isLoggedOn(): boolean;
  ref(): void;
  unref(): void;
}

/** Constructor shape for the native `InitiatorWrap` / `AcceptorWrap` classes. */
export interface NativeEngineConstructor {
  new (options: NativeEngineOptions): NativeEngine;
}

/**
 * The nested FIX-constants object exported by the addon, e.g.
 * `enums.MsgType.Logon`, `enums.Side.Buy`. Field tags (`FIELD`) are not exported
 * by the addon; they are generated on the TS side (`src/generated/fields.ts`).
 */
export type NativeEnums = Readonly<Record<string, Readonly<Record<string, number | string>>>>;

/** The full surface of the native addon exported by `load-native.cjs`. */
export interface NativeModule {
  version(): string;
  quickfixParseMsgType(raw: string): string;
  /** Runs off the main thread; resolves `true` if accepted for sending. */
  sendToTarget(message: NativeMessage, sessionID: NativeSessionID): Promise<boolean>;
  enums: NativeEnums;

  MessageWrap: NativeMessageConstructor;
  GroupWrap: NativeGroupConstructor;
  SessionIDWrap: NativeSessionIDConstructor;
  SessionSettingsWrap: NativeSessionSettingsConstructor;
  DataDictionaryWrap: NativeDataDictionaryConstructor;
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
