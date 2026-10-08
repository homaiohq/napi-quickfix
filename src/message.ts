/**
 * Ergonomic wrapper around the native `FIX::Message`.
 */
import { native, type NativeMessage } from './native.js';
import { Group } from './group.js';
import type { DataDictionary } from './data-dictionary.js';

/** Options for building a {@link Message}. */
export interface MessageOptions {
  /**
   * Explicit body field order, mirroring QuickFIX's
   * `FIX::Message(headerOrder, trailerOrder, order)`. Listed tags are written
   * in this sequence; any other tag follows them in numeric order. Without it
   * the body sorts numerically, as in QuickFIX. Tags must be distinct integers in
   * `1..100000`.
   */
  order?: readonly number[];
}

/** Options controlling how a raw FIX string is parsed into a {@link Message}. */
export interface MessageParseOptions extends MessageOptions {
  /**
   * When `true`, the engine validates the message structure during parsing
   * (e.g. checksum / body-length). Defaults to `false` (lenient parse), matching
   * QuickFIX behaviour where validation is normally applied via a
   * {@link DataDictionary} instead.
   */
  validate?: boolean;
  /**
   * A data dictionary describing the message's repeating groups. With it, the
   * parser builds proper {@link Group} instances that {@link Message.getGroup}
   * can read and that `toString()` re-emits in wire order. Without it (the
   * default) every repeated tag lands in the flat body, as in QuickFIX.
   *
   * This is the *application* dictionary (`FIX44.xml`, `FIX50SP2.xml`, ...).
   * A FIX 4.x dictionary also describes the header and trailer, so it is all
   * a FIX 4.x message needs.
   */
  dictionary?: DataDictionary;
  /**
   * The *session* dictionary (`FIXT11.xml`) describing the header and trailer
   * of a FIXT 1.1 / FIX 5.x message, as the engine uses it next to the
   * application `dictionary` on such a session. Defaults to `dictionary`, and
   * stands in for a missing `dictionary`.
   */
  sessionDictionary?: DataDictionary;
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
 * **Field order** follows QuickFIX. Body fields sort numerically by tag
 * unless the message is built with an explicit `order`
 * (`new Message(undefined, { order })`, mirroring
 * `FIX::Message(headerOrder, trailerOrder, order)`): the listed tags are
 * written in that sequence and any other tag after them, numerically. The
 * header keeps the FIX layout (`8`, `9`, `35` first) and the trailer ends with
 * `10`. Note that a resend is rebuilt by the engine from the message store in
 * numeric (or dictionary) order.
 *
 * Repeating groups (several occurrences of the same tags) are added with
 * {@link Message.addGroup}; see {@link Group}.
 *
 * @example
 * ```ts
 * import { Message, Group, FIELD, MsgType } from '@homaiohq/napi-quickfix';
 *
 * const msg = new Message();
 * msg.setField(FIELD.MsgType, MsgType.NewOrderSingle)
 *    .setField(FIELD.ClOrdID, 'order-1')
 *    .setField(FIELD.OrderQty, 100);
 *
 * const party = new Group(FIELD.NoPartyIDs, FIELD.PartyID);
 * party.setField(FIELD.PartyID, 'TRADER-1').setField(FIELD.PartyRole, 11);
 * msg.addGroup(party);
 *
 * const parsed = Message.parse(msg.toString());
 * console.log(parsed.getMsgType());
 * ```
 */
export class Message {
  /** @internal Underlying native handle. */
  readonly #native: NativeMessage;

  /**
   * Create a message. With no `raw`, creates an empty message. With a raw
   * FIX string, parses it. `opts.order` applies in both cases.
   *
   * Advanced: passing an existing {@link NativeMessage} handle adopts it (used
   * internally by the engine bridge to wrap inbound/outbound native messages).
   *
   * @param raw Optional raw FIX wire string (SOH-delimited) to parse, or an
   *   existing native handle to adopt.
   * @param opts Optional parse / ordering options.
   */
  constructor(raw?: string | NativeMessage, opts?: MessageParseOptions) {
    if (raw === undefined || typeof raw === 'string') {
      this.#native =
        raw === undefined && opts?.order === undefined
          ? new native.MessageWrap()
          : new native.MessageWrap(
              raw,
              opts?.validate ?? false,
              opts?.dictionary?.nativeHandle,
              opts?.order,
              opts?.sessionDictionary?.nativeHandle,
            );
    } else if (raw instanceof native.MessageWrap) {
      // Adopt an existing native handle (bridge path).
      this.#native = raw;
    } else {
      throw new TypeError('new Message(raw?, opts?): raw must be a string');
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
   * Read a field by tag, routed like {@link setField}: standard header and
   * trailer tags come from their section, as does any other tag the message
   * already holds there (a custom header field declared by the session's
   * dictionary, for instance). Everything else is a body field.
   *
   * @throws A `QuickFixError` (`fixErrorName: 'FieldNotFound'`) if absent, a
   *   `TypeError` unless `tag` is a positive integer.
   */
  getField(tag: number): string {
    return this.#native.getField(tag);
  }

  /**
   * Set a field. Returns `this` for chaining. Standard header and trailer
   * tags (`MsgType`, `SenderCompID`, `CheckSum`, ...) are routed to their
   * section automatically, and so is any other tag the message already holds
   * in its header or trailer; the rest goes to the body.
   *
   * @throws A `TypeError` unless `tag` is a positive integer (every accessor
   *   requires that).
   */
  setField(tag: number, value: string | number): this {
    this.#native.setField(tag, String(value));
    return this;
  }

  /** Whether a field is set (header, body or trailer, routed like {@link setField}). */
  hasField(tag: number): boolean {
    return this.#native.hasField(tag);
  }

  /**
   * Append one instance of a repeating group. QuickFIX sets the group's count
   * field (`NoXxx`) and keeps it equal to the number of instances added; the
   * instances are written right after it. A header group such as `NoHops` is
   * routed to the header, like `setField`.
   *
   * The group is copied: later changes to `group` do not affect this message,
   * so one {@link Group} object can be reused to build several instances.
   */
  addGroup(group: Group): this {
    this.#native.addGroup(group.nativeHandle);
    return this;
  }

  /**
   * Read one instance of a repeating group, as a copy.
   *
   * @param index 1-based position of the instance (QuickFIX convention). A
   *   non-integer throws a `TypeError`.
   * @param countTag The group's count tag, e.g. `FIELD.NoPartyIDs`.
   * @throws A `QuickFixError` (`fixErrorName: 'FieldNotFound'`) if the message
   *   has no such group or fewer instances than `index`.
   */
  getGroup(index: number, countTag: number): Group {
    return Group.fromNative(this.#native.getGroup(index, countTag));
  }

  /** Number of instances of the repeating group identified by `countTag` (0 if none). */
  groupCount(countTag: number): number {
    return this.#native.groupCount(countTag);
  }

  /**
   * Read a header field by tag.
   * @throws A `QuickFixError` (`fixErrorName: 'FieldNotFound'`) if absent.
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
   * @throws A `QuickFixError` (`fixErrorName: 'FieldNotFound'`) if absent.
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
 * @param opts Optional {@link MessageOptions}, e.g. an explicit body `order`.
 *
 * @example
 * ```ts
 * const msg = createMessage({ [FIELD.MsgType]: MsgType.Logon, [FIELD.HeartBtInt]: 30 });
 * const ordered = createMessage({ 55: 'AAPL', 38: 100 }, { order: [55, 38] });
 * ```
 */
export function createMessage(
  fields?: Record<number, string | number>,
  opts?: MessageOptions,
): Message {
  const msg = new Message(undefined, opts);
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
