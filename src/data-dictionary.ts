/**
 * Ergonomic wrapper around the native `FIX::DataDictionary`.
 */
import { native, type NativeDataDictionary } from './native.js';
import type { Message } from './message.js';

/**
 * A FIX data dictionary, used to validate messages against a FIX spec XML.
 *
 * Construct via {@link DataDictionary.fromFile} or
 * {@link DataDictionary.fromString}; direct construction is not supported.
 *
 * @example
 * ```ts
 * const dd = DataDictionary.fromFile('./spec/FIX44.xml');
 * dd.validate(msg); // throws QuickFixError if invalid
 * dd.getFieldName(35); // 'MsgType'
 * Message.parse(raw, { dictionary: dd }); // structural parse (repeating groups)
 * ```
 */
export class DataDictionary {
  /** @internal Underlying native handle. */
  readonly #native: NativeDataDictionary;

  /** @internal Use {@link DataDictionary.fromFile} / {@link DataDictionary.fromString}. */
  private constructor(handle: NativeDataDictionary) {
    this.#native = handle;
  }

  /**
   * Load a data dictionary from a FIX spec XML file.
   *
   * @param xmlPath Path to the FIX spec XML (e.g. `FIX44.xml`).
   * @throws A `QuickFixError` (`fixError: 'ConfigError'`) if the file is invalid.
   */
  static fromFile(xmlPath: string): DataDictionary {
    // The native `fromFile` may be a module-level fn or a class static;
    // prefer the module-level fn, fall back to the static.
    const handle =
      native.dataDictionaryFromFile?.(xmlPath) ??
      native.DataDictionaryWrap.fromFile?.(xmlPath);
    if (!handle) {
      throw new Error('native DataDictionary.fromFile is unavailable');
    }
    return new DataDictionary(handle);
  }

  /**
   * Load a data dictionary from FIX spec XML held in memory.
   *
   * @param xml The FIX spec XML contents.
   * @throws A `QuickFixError` (`fixError: 'ConfigError'`) if the XML is invalid.
   */
  static fromString(xml: string): DataDictionary {
    const handle =
      native.dataDictionaryFromString?.(xml) ??
      native.DataDictionaryWrap.fromString?.(xml);
    if (!handle) {
      throw new Error('native DataDictionary.fromString is unavailable');
    }
    return new DataDictionary(handle);
  }

  /** @internal Wrap an existing native handle. */
  static fromNative(handle: NativeDataDictionary): DataDictionary {
    return new DataDictionary(handle);
  }

  /** @internal The native handle backing this dictionary. */
  get nativeHandle(): NativeDataDictionary {
    return this.#native;
  }

  /**
   * Validate a message against this dictionary.
   *
   * @param msg The message to validate.
   * @param bodyOnly When `true`, validate only as the *application* dictionary:
   *   the BeginString version check and header/trailer field validation are
   *   skipped (QuickFIX's `validate(msg, true)`). Defaults to `false`.
   * @throws A `QuickFixError` on any validation failure (e.g.
   *   `fixErrorName: 'InvalidMessage'` / `'RequiredTagMissing'` /
   *   `'IncorrectTagValue'` / `'UnsupportedVersion'`).
   */
  validate(msg: Message, bodyOnly = false): void {
    this.#native.validate(msg.nativeHandle, bodyOnly);
  }

  /** The BeginString the spec declares (e.g. `'FIX.4.4'`), or `''` if it has none. */
  getVersion(): string {
    return this.#native.getVersion();
  }

  /** The name of a field tag (e.g. `35` → `'MsgType'`), or `undefined` if the spec does not define it. */
  getFieldName(tag: number): string | undefined {
    return this.#native.getFieldName(tag);
  }

  /** The tag of a field name (e.g. `'MsgType'` → `35`), or `undefined` if the spec does not define it. */
  getFieldTag(name: string): number | undefined {
    return this.#native.getFieldTag(name);
  }

  /** Whether the spec defines a field with this tag. */
  isField(tag: number): boolean {
    return this.#native.isField(tag);
  }

  /** Whether the spec defines a message with this MsgType (e.g. `'D'`). */
  isMsgType(msgType: string): boolean {
    return this.#native.isMsgType(msgType);
  }
}
