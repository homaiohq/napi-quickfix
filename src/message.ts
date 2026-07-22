/**
 * Ergonomic wrapper around the native `FIX::Message`.
 */
import { native, type NativeMessage } from './native.js';

/** Options controlling how a raw FIX string is parsed into a {@link Message}. */
export interface MessageParseOptions {
  /**
   * When `true`, the engine validates the message structure during parsing
   * (e.g. checksum / body-length). Defaults to `false` (lenient parse), matching
   * QuickFIX behaviour where validation is normally applied via a
   * {@link DataDictionary} instead.
   */
  validate?: boolean;
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
      this.#native = new native.MessageWrap(raw, opts?.validate ?? false);
    } else {
      // Adopt an existing native handle (bridge path).
      this.#native = raw;
    }
  }

  /**
   * Parse a raw FIX wire string into a {@link Message}.
   *
   * @param raw Raw FIX wire string (SOH-delimited).
   * @param opts Optional parse options.
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
   * Read a body field by tag.
   * @throws A `QuickFixError` (`fixError: 'FieldNotFound'`) if absent.
   */
  getField(tag: number): string {
    return this.#native.getField(tag);
  }

  /** Set a body field. Returns `this` for chaining. */
  setField(tag: number, value: string | number): this {
    this.#native.setField(tag, String(value));
    return this;
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
