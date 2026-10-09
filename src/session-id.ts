/**
 * Ergonomic wrapper around the native `FIX::SessionID`.
 */
import { native, type NativeSessionID } from './native.js';

/**
 * Identifies a FIX session by its `BeginString`, `SenderCompID`,
 * `TargetCompID`, and an optional qualifier.
 *
 * @example
 * ```ts
 * const id = new SessionID('FIX.4.4', 'CLIENT', 'BROKER');
 * console.log(id.toString()); // FIX.4.4:CLIENT->BROKER
 * ```
 */
export class SessionID {
  /** @internal Underlying native handle. */
  readonly #native: NativeSessionID;

  /**
   * @param beginString FIX version, e.g. `'FIX.4.4'`, or an existing native
   *   handle to adopt (bridge path).
   * @param senderCompID The sender's CompID.
   * @param targetCompID The target's CompID.
   * @param qualifier Optional session qualifier.
   */
  constructor(
    beginString: string | NativeSessionID,
    senderCompID?: string,
    targetCompID?: string,
    qualifier?: string,
  ) {
    if (typeof beginString !== 'string') {
      // Adopt an existing native handle (bridge path).
      this.#native = beginString;
    } else {
      this.#native = new native.SessionIDWrap(
        beginString,
        senderCompID ?? '',
        targetCompID ?? '',
        qualifier,
      );
    }
  }

  /** @internal Wrap an existing native session-id handle (used by the engine bridge). */
  static fromNative(handle: NativeSessionID): SessionID {
    return new SessionID(handle);
  }

  /** @internal The native handle backing this session id. */
  get nativeHandle(): NativeSessionID {
    return this.#native;
  }

  /** FIX version, e.g. `'FIX.4.4'`. */
  get beginString(): string {
    return this.#native.getBeginString();
  }

  /** The sender's CompID. */
  get senderCompID(): string {
    return this.#native.getSenderCompID();
  }

  /** The target's CompID. */
  get targetCompID(): string {
    return this.#native.getTargetCompID();
  }

  /** The session qualifier (empty string if none). */
  get sessionQualifier(): string {
    return this.#native.getSessionQualifier();
  }

  /** The canonical string form, e.g. `FIX.4.4:CLIENT->BROKER`. */
  toString(): string {
    return this.#native.toString();
  }
}

/**
 * @internal The native handle behind a {@link SessionID} argument.
 *
 * Duck-typed rather than `instanceof SessionID`: this package ships ESM and
 * CJS builds, and a `SessionID` created by the other build is a different class
 * with the same shape. Both builds load the same native addon, so its
 * `SessionIDWrap` class is the one thing they share, and that is what the
 * handle is checked against. Anything else -- `null`, `{}`, a `Session` -- is
 * a `TypeError` naming the argument, rather than silently degrading to an
 * `undefined` handle that the callee would read as "no session id given".
 */
export function toNativeSessionID(value: unknown, name: string): NativeSessionID {
  const handle =
    typeof value === 'object' && value !== null
      ? (value as { nativeHandle?: unknown }).nativeHandle
      : undefined;
  if (!(handle instanceof native.SessionIDWrap)) {
    throw new TypeError(`${name} must be a SessionID`);
  }
  return handle;
}
