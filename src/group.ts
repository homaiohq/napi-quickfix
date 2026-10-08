/**
 * Ergonomic wrapper around the native `FIX::Group`.
 */
import { native, type NativeGroup } from './native.js';

/**
 * One instance of a FIX repeating group.
 *
 * A repeating group is introduced by a count field (`NoXxx`, e.g.
 * `NoPartyIDs`) followed by that many instances. Every instance starts with the
 * same *delimiter* tag, which is how the parser tells one instance from the
 * next. Build a `Group`, set its fields, and add it to a {@link Message} (or to
 * a parent `Group` for nesting) with `addGroup`. Adding copies the group, so
 * one object can be reused for several instances.
 *
 * **Field order** follows QuickFIX. Without `order` (`FIX::Group(field,
 * delim)`) the delimiter comes first and the other fields sort numerically.
 * With `order` (`FIX::Group(field, delim, order[])`) the listed tags are
 * written in that sequence, which must start with the delimiter, and any
 * other tag follows them numerically.
 *
 * @example
 * ```ts
 * import { Group, createMessage, FIELD, MsgType } from '@homaiohq/napi-quickfix';
 *
 * const order = createMessage({ [FIELD.MsgType]: MsgType.NewOrderSingle });
 *
 * const party = new Group(FIELD.NoPartyIDs, FIELD.PartyID);
 * party.setField(FIELD.PartyID, 'TRADER-1')
 *      .setField(FIELD.PartyIDSource, 'D')
 *      .setField(FIELD.PartyRole, 11);
 * order.addGroup(party);
 *
 * party.setField(FIELD.PartyID, 'FIRM-1').setField(FIELD.PartyRole, 1);
 * order.addGroup(party);
 *
 * order.groupCount(FIELD.NoPartyIDs); // 2
 * order.getGroup(2, FIELD.NoPartyIDs).getField(FIELD.PartyID); // 'FIRM-1'
 * ```
 */
export class Group {
  /** @internal Underlying native handle. */
  readonly #native: NativeGroup;

  /**
   * Create an empty group instance.
   *
   * @param countTag The group's count tag (`NoXxx`), e.g. `FIELD.NoPartyIDs`.
   * @param delimiterTag The tag that opens every instance, e.g. `FIELD.PartyID`.
   * @param order Optional explicit field order, starting with
   *   `delimiterTag`. Tags not listed follow the listed ones numerically.
   *   Tags must be distinct integers in `1..100000`.
   */
  constructor(countTag: number, delimiterTag: number, order?: readonly number[]);
  // Implementation signature only (not part of the public overloads): also
  // accepts an existing native handle, used by Group.fromNative.
  constructor(
    countTagOrHandle: number | NativeGroup,
    delimiterTag?: number,
    order?: readonly number[],
  ) {
    if (typeof countTagOrHandle === 'number') {
      if (typeof delimiterTag !== 'number') {
        throw new TypeError('new Group(countTag, delimiterTag, order?): delimiterTag is required');
      }
      this.#native = new native.GroupWrap(countTagOrHandle, delimiterTag, order);
    } else if (countTagOrHandle instanceof native.GroupWrap) {
      this.#native = countTagOrHandle;
    } else {
      // A wrong-typed countTag from plain JS must fail here, not on the first
      // method call of a Group wrapping something that is no native group.
      throw new TypeError('new Group(countTag, delimiterTag, order?): countTag must be a number');
    }
  }

  /** @internal Wrap an existing native group handle. */
  static fromNative(handle: NativeGroup): Group {
    return new (Group as unknown as new (h: NativeGroup) => Group)(handle);
  }

  /** @internal The native handle backing this group. */
  get nativeHandle(): NativeGroup {
    return this.#native;
  }

  /** The group's count tag (`NoXxx`). */
  get countTag(): number {
    return this.#native.getCountTag();
  }

  /** The tag that opens every instance of this group. */
  get delimiterTag(): number {
    return this.#native.getDelimiterTag();
  }

  /**
   * Read a field by tag.
   * @throws A `QuickFixError` (`fixErrorName: 'FieldNotFound'`) if absent, a
   *   `TypeError` unless `tag` is a positive integer.
   */
  getField(tag: number): string {
    return this.#native.getField(tag);
  }

  /**
   * Set a field. Returns `this` for chaining.
   *
   * @throws A `TypeError` unless `tag` is a positive integer.
   */
  setField(tag: number, value: string | number): this {
    this.#native.setField(tag, String(value));
    return this;
  }

  /** Whether `tag` is set on this instance. */
  hasField(tag: number): boolean {
    return this.#native.hasField(tag);
  }

  /** Append one instance of a nested repeating group (copied). Returns `this`. */
  addGroup(group: Group): this {
    this.#native.addGroup(group.nativeHandle);
    return this;
  }

  /**
   * Read one instance of a nested repeating group, as a copy.
   *
   * @param index 1-based position of the instance (QuickFIX convention). A
   *   non-integer throws a `TypeError`.
   * @param countTag The nested group's count tag.
   * @throws A `QuickFixError` (`fixErrorName: 'FieldNotFound'`) if absent.
   */
  getGroup(index: number, countTag: number): Group {
    return Group.fromNative(this.#native.getGroup(index, countTag));
  }

  /** Number of instances of the nested group identified by `countTag` (0 if none). */
  groupCount(countTag: number): number {
    return this.#native.groupCount(countTag);
  }

  /** This instance's fields (and nested groups) as a SOH-delimited string, in wire order. */
  toString(): string {
    return this.#native.toString();
  }

  /** Like {@link toString} with `|` in place of SOH. */
  toPretty(): string {
    return this.#native.toPretty();
  }
}
