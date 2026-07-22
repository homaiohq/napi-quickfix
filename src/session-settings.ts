/**
 * Ergonomic wrapper around the native `FIX::SessionSettings`.
 */
import { native, type NativeSessionSettings } from './native.js';
import { SessionID } from './session-id.js';

/**
 * Parsed QuickFIX session settings (the `.cfg` configuration).
 *
 * Construct via {@link SessionSettings.fromString} or
 * {@link SessionSettings.fromFile}; direct construction is not supported.
 *
 * @example
 * ```ts
 * const settings = SessionSettings.fromString(`
 * [DEFAULT]
 * ConnectionType=initiator
 * ...
 * `);
 * for (const id of settings.getSessions()) console.log(id.toString());
 * ```
 */
export class SessionSettings {
  /** @internal Underlying native handle. */
  readonly #native: NativeSessionSettings;

  /** @internal Use {@link SessionSettings.fromString} / {@link SessionSettings.fromFile}. */
  private constructor(handle: NativeSessionSettings) {
    this.#native = handle;
  }

  /**
   * Parse settings from an in-memory config string.
   *
   * @param cfg The QuickFIX `.cfg` contents.
   * @throws A `QuickFixError` (`fixError: 'ConfigError'`) on invalid config.
   */
  static fromString(cfg: string): SessionSettings {
    // The native `fromString` may be a module-level fn or a class static;
    // prefer the module-level fn, fall back to the static.
    const handle =
      native.sessionSettingsFromString?.(cfg) ??
      native.SessionSettingsWrap.fromString?.(cfg);
    if (!handle) {
      throw new Error('native SessionSettings.fromString is unavailable');
    }
    return new SessionSettings(handle);
  }

  /**
   * Load settings from a `.cfg` file on disk.
   *
   * @param path Path to the QuickFIX `.cfg` file.
   * @throws A `QuickFixError` (`fixError: 'ConfigError'`) on invalid config.
   */
  static fromFile(path: string): SessionSettings {
    const handle =
      native.sessionSettingsFromFile?.(path) ??
      native.SessionSettingsWrap.fromFile?.(path);
    if (!handle) {
      throw new Error('native SessionSettings.fromFile is unavailable');
    }
    return new SessionSettings(handle);
  }

  /** @internal Wrap an existing native handle. */
  static fromNative(handle: NativeSessionSettings): SessionSettings {
    return new SessionSettings(handle);
  }

  /** @internal The native handle backing these settings. */
  get nativeHandle(): NativeSessionSettings {
    return this.#native;
  }

  /** The sessions declared by this configuration. */
  getSessions(): SessionID[] {
    return this.#native.getSessions().map((h) => SessionID.fromNative(h));
  }
}
