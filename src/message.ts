/**
 * Ergonomic wrapper around the native `FIX::Message`.
 */
import { native, type NativeMessage } from './native.js';
import { Group } from './group.js';
import type { DataDictionary } from './data-dictionary.js';

/** Options controlling how a raw FIX string is parsed into a {@link Message}. */
export interface MessageParseOptions {
  /**
   * When `true`, the engine validates the message structure during parsing
   * (e.g. checksum / body-length). Defaults to `false` (lenient parse), matching
   * QuickFIX behaviour where validation is normally applied via a
   * {@link DataDictionary} instead.
   */
  validate?: boolean;
  /**
   * Parse with this dictionary as both the session and application dictionary
   * (the usual choice for FIX 4.x). With a dictionary, repeating groups are
   * parsed into nested {@link Group} entries readable with
   * {@link Message.getGroup}; without one the parse is **flat** and group
   * fields are left as plain repeated body fields.
   */
  dictionary?: DataDictionary;
  /**
   * The session (transport) dictionary, e.g. `FIXT11.xml`. Governs header,
   * trailer and admin messages. Overrides {@link MessageParseOptions.dictionary}
   * for that role.
   */
  sessionDictionary?: DataDictionary;
  /**
   * The application dictionary, e.g. `FIX50SP2.xml`. Governs the body of
   * application messages. Overrides {@link MessageParseOptions.dictionary} for
   * that role.
   */
  applicationDictionary?: DataDictionary;
}

/** A structured, best-effort view of a parsed message returned by {@link Message.toJSON}. */
export interface MessageJSON {
  /** The MsgType (tag 35) if resolvable, otherwise omitted. */
  msgType?: string;
  /** The raw FIX wire string (SOH-delimited). */
  raw: string;
}

/**
 * A FIX message.
 *
 * Field values are accepted as `string | number` on input (numbers are
 * stringified, since FIX is string-on-the-wire) and always returned as `string`.
 *
 * @example
 * ```ts
 * import { Message, FIELD, MsgType } from '@homaiohq/napi-quickfix';
 *
 * const msg = new Message();
 * msg.setField(FIELD.MsgType, MsgType.NewOrderSingle)
 *    .setField(FIELD.ClOrdID, 'order-1')
 *    .setField(FIELD.OrderQty, 100);
 *
 * const parsed = Message.parse(msg.toString());
 * console.log(parsed.getMsgType());
 *
 * // Repeating groups: build entries with Group, read them back by 1-based index.
 * msg.addGroup(new Group(FIELD.NoPartyIDs, FIELD.PartyID).setField(FIELD.PartyID, 'TRADER-1'));
 * const dd = DataDictionary.fromFile('FIX44.xml');
 * const withGroups = Message.parse(msg.toString(), { dictionary: dd });
 * withGroups.getGroup(1, FIELD.NoPartyIDs).getField(FIELD.PartyID); // 'TRADER-1'
 * ```
 */
export class Message {
  /** @internal Underlying native handle. */
  readonly #native: NativeMessage;

  /**
   * Create a message. With no argument, creates an empty message. With a raw
   * FIX string, parses it.
   *
   * Advanced: passing an existing {@link NativeMessage} handle adopts it (used
   * internally by the engine bridge to wrap inbound/outbound native messages).
   *
   * @param raw Optional raw FIX wire string (SOH-delimited) to parse, or an
   *   existing native handle to adopt.
   * @param opts Optional parse options.
   */
  constructor(raw?: string | NativeMessage, opts?: MessageParseOptions) {
    if (raw === undefined) {
      this.#native = new native.MessageWrap();
    } else if (typeof raw === 'string') {
      const sessionDD = opts?.sessionDictionary ?? opts?.dictionary;
      const appDD = opts?.applicationDictionary ?? opts?.dictionary;
      this.#native = new native.MessageWrap(
        raw,
        opts?.validate ?? false,
        sessionDD?.nativeHandle ?? null,
        appDD?.nativeHandle ?? null,
      );
    } else {
      // Adopt an existing native handle (bridge path).
      this.#native = raw;
    }
  }

  /**
   * Parse a raw FIX wire string into a {@link Message}.
   *
   * Pass a `dictionary` to parse repeating groups structurally; without one
   * the parse is flat (see {@link MessageParseOptions}).
   *
   * @param raw Raw FIX wire string (SOH-delimited).
   * @param opts Optional parse options.
   *
   * @example
   * ```ts
   * const dd = DataDictionary.fromFile('./spec/FIX44.xml');
   * const msg = Message.parse(raw, { dictionary: dd });
   * msg.getGroup(1, FIELD.NoPartyIDs).getField(FIELD.PartyID);
   * ```
   */
  static parse(raw: string, opts?: MessageParseOptions): Message {
    return new Message(raw, opts);
  }

  /** @internal Wrap an existing native message handle (used by the engine bridge). */
  static fromNative(handle: NativeMessage): Message {
    return new Message(handle);
  }

  /** @internal The native handle backing this message (for the engine / sendToTarget / validation). */
  get nativeHandle(): NativeMessage {
    return this.#native;
  }

  /**
   * Read a field by tag. Well-known header/trailer tags (`MsgType`,
   * `SenderCompID`, `CheckSum`, ...) are read from their section; everything
   * else from the body.
   * @throws A `QuickFixError` (`fixErrorName: 'FieldNotFound'`) if absent.
   */
  getField(tag: number): string {
    return this.#native.getField(tag);
  }

  /**
   * Set a field. Well-known header/trailer tags auto-route to their section;
   * everything else goes to the body. Returns `this` for chaining.
   */
  setField(tag: number, value: string | number): this {
    this.#native.setField(tag, String(value));
    return this;
  }

  /** Whether a field is present (same auto-routing as {@link Message.getField}). */
  isSetField(tag: number): boolean {
    return this.#native.isSetField(tag);
  }

  /** Remove a field (no-op if absent; same auto-routing). Returns `this` for chaining. */
  removeField(tag: number): this {
    this.#native.removeField(tag);
    return this;
  }

  /** Read a field by tag, or `undefined` if absent (same auto-routing). */
  getFieldIfSet(tag: number): string | undefined {
    return this.#native.getFieldIfSet(tag);
  }

  /** Whether the body has no fields of its own. */
  isEmpty(): boolean {
    return this.#native.isEmpty();
  }

  /** The number of body fields, including every field of every group entry. */
  totalFields(): number {
    return this.#native.totalFields();
  }

  /** Remove every header, body and trailer field and group. Returns `this` for chaining. */
  clear(): this {
    this.#native.clear();
    return this;
  }

  /** The body's own fields, in wire order, as `[tag, value]` pairs (group entries excluded). */
  fields(): [number, string][] {
    return this.#native.fields();
  }

  /** The header fields, in wire order, as `[tag, value]` pairs. */
  headerFields(): [number, string][] {
    return this.#native.headerFields();
  }

  /** The trailer fields, in wire order, as `[tag, value]` pairs. */
  trailerFields(): [number, string][] {
    return this.#native.trailerFields();
  }

  /** Iterates the body's own fields as `[tag, value]` pairs (see {@link Message.fields}). */
  [Symbol.iterator](): IterableIterator<[number, string]> {
    return this.fields()[Symbol.iterator]();
  }

  /**
   * Append a repeating-group entry under its count tag (`group.field`). A copy
   * is stored and the count field is updated. Header groups (e.g. `NoHops`)
   * auto-route to the header. Returns `this` for chaining.
   *
   * @example
   * ```ts
   * order.addGroup(new Group(FIELD.NoPartyIDs, FIELD.PartyID).setField(FIELD.PartyID, 'X'));
   * ```
   */
  addGroup(group: Group): this {
    this.#native.addGroup(group.nativeHandle);
    return this;
  }

  /**
   * A **snapshot copy** of the `index`-th entry (1-based) of the repeating
   * group `tag`. Mutating the returned {@link Group} does not change this
   * message; write it back with {@link Message.replaceGroup}.
   *
   * Groups exist only on messages built with {@link Message.addGroup} or
   * parsed with a dictionary (including every message the engine hands to
   * your handlers); a flat parse leaves none.
   *
   * @throws A `QuickFixError` (`fixErrorName: 'FieldNotFound'`) when the tag
   *   has no entries or `index` is out of range.
   */
  getGroup(index: number, tag: number): Group {
    return Group.fromNative(this.#native.getGroup(index, tag));
  }

  /**
   * Overwrite the `index`-th entry (1-based) under `group.field` with a copy of
   * `group`. Returns `this` for chaining.
   * @throws A `QuickFixError` (`fixErrorName: 'FieldNotFound'`) when that
   *   entry does not exist.
   */
  replaceGroup(index: number, group: Group): this {
    this.#native.replaceGroup(index, group.nativeHandle);
    return this;
  }

  /**
   * Remove every entry of the repeating group `tag` (and its count field), or
   * only the `index`-th entry (1-based). No-op when absent. Returns `this`.
   */
  removeGroup(tag: number): this;
  removeGroup(index: number, tag: number): this;
  removeGroup(a: number, b?: number): this {
    if (b === undefined) {
      this.#native.removeGroup(a);
    } else {
      this.#native.removeGroup(a, b);
    }
    return this;
  }

  /** Whether the repeating group `tag` has any entry, or has an `index`-th entry (1-based). */
  hasGroup(tag: number): boolean;
  hasGroup(index: number, tag: number): boolean;
  hasGroup(a: number, b?: number): boolean {
    return b === undefined ? this.#native.hasGroup(a) : this.#native.hasGroup(a, b);
  }

  /** The number of entries of the repeating group `tag` (0 if none). */
  groupCount(tag: number): number {
    return this.#native.groupCount(tag);
  }

  /**
   * Read a header field by tag.
   * @throws A `QuickFixError` (`fixError: 'FieldNotFound'`) if absent.
   */
  getHeaderField(tag: number): string {
    return this.#native.getHeaderField(tag);
  }

  /** Set a header field. Returns `this` for chaining. */
  setHeaderField(tag: number, value: string | number): this {
    this.#native.setHeaderField(tag, String(value));
    return this;
  }

  /**
   * Read a trailer field by tag.
   * @throws A `QuickFixError` (`fixError: 'FieldNotFound'`) if absent.
   */
  getTrailerField(tag: number): string {
    return this.#native.getTrailerField(tag);
  }

  /** Set a trailer field. Returns `this` for chaining. */
  setTrailerField(tag: number, value: string | number): this {
    this.#native.setTrailerField(tag, String(value));
    return this;
  }

  /** The message type (tag 35), e.g. `'A'` for Logon. */
  getMsgType(): string {
    return this.#native.getMsgType();
  }

  /** The raw FIX wire string (SOH-delimited). */
  toString(): string {
    return this.#native.toString();
  }

  /** A human-readable, pretty-printed rendering of the message. */
  toPretty(): string {
    return this.#native.toPretty();
  }

  /**
   * A best-effort structured view. Always includes `raw`; includes `msgType`
   * when resolvable.
   */
  toJSON(): MessageJSON {
    const raw = this.toString();
    let msgType: string | undefined;
    try {
      msgType = this.getMsgType();
    } catch {
      msgType = undefined;
    }
    return msgType === undefined ? { raw } : { msgType, raw };
  }
}

/**
 * Create a message, optionally pre-populating body fields.
 *
 * @param fields Map of tag → value to set on the message body.
 *
 * @example
 * ```ts
 * const msg = createMessage({ [FIELD.MsgType]: MsgType.Logon, [FIELD.HeartBtInt]: 30 });
 * ```
 */
export function createMessage(fields?: Record<number, string | number>): Message {
  const msg = new Message();
  if (fields) {
    for (const [tag, value] of Object.entries(fields)) {
      msg.setField(Number(tag), value);
    }
  }
  return msg;
}

/**
 * Parse a raw FIX wire string into a {@link Message}. Alias of {@link Message.parse}.
 */
export function parseMessage(raw: string, opts?: MessageParseOptions): Message {
  return Message.parse(raw, opts);
}
