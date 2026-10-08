/**
 * Ergonomic wrapper around the native `FIX::Group`: one entry of a repeating
 * group.
 */
import { native, type NativeGroup } from './native.js';

/**
 * One entry of a FIX repeating group.
 *
 * A group is identified by its **count tag** (`field`, e.g. `453 NoPartyIDs`)
 * and its **delimiter** (`delim`, the first tag of every entry, e.g.
 * `448 PartyID`). Build an entry, fill its fields, then
 * {@link Message.addGroup} it; QuickFIX maintains the count field for you.
 *
 * Field values are accepted as `string | number` on input and always returned
 * as `string`, exactly as on {@link Message}. Groups nest: an entry can carry
 * its own repeating groups through the same `addGroup` / `getGroup` API.
 *
 * Entries read back with `getGroup` are **snapshot copies**: mutating one does
 * not change the message it came from. Write it back with
 * {@link Message.replaceGroup}.
 *
 * Group indices are **1-based**, as in QuickFIX.
 *
 * @example
 * ```ts
 * import { Group, Message, FIELD } from '@homaiohq/napi-quickfix';
 *
 * const party = new Group(FIELD.NoPartyIDs, FIELD.PartyID)
 *   .setField(FIELD.PartyID, 'TRADER-1')
 *   .setField(FIELD.PartyIDSource, 'D')
 *   .setField(FIELD.PartyRole, 11);
 * order.addGroup(party);
 *
 * order.groupCount(FIELD.NoPartyIDs);           // 1
 * order.getGroup(1, FIELD.NoPartyIDs).getField(FIELD.PartyID); // 'TRADER-1'
 * ```
 */
export class Group {
  /** @internal Underlying native handle. */
  readonly #native: NativeGroup;

  /**
   * Create an empty group entry.
   *
   * @param field The group's count tag (e.g. `FIELD.NoPartyIDs`), or an
   *   existing native handle to adopt (internal).
   * @param delim The delimiter: the first tag of every entry (e.g.
   *   `FIELD.PartyID`).
   * @param order Optional complete field order of an entry, delimiter first
   *   (e.g. `[448, 447, 452]`). Fields not listed sort after the listed ones by
   *   tag number. Without it, fields sort delimiter-first then by tag number,
   *   which already matches the standard dictionaries for most groups.
   */
  constructor(field: number | NativeGroup, delim?: number, order?: readonly number[]) {
    if (typeof field !== 'number') {
      // Adopt an existing native handle (getGroup path).
      this.#native = field;
    } else {
      if (typeof delim !== 'number') {
        throw new TypeError('new Group(field: number, delim: number, order?: number[])');
      }
      this.#native = new native.GroupWrap(field, delim, order);
    }
  }

  /** @internal Wrap an existing native group handle. */
  static fromNative(handle: NativeGroup): Group {
    return new Group(handle);
  }

  /** @internal The native handle backing this group. */
  get nativeHandle(): NativeGroup {
    return this.#native;
  }

  /** The group's count tag (e.g. `453` for `NoPartyIDs`). */
  get field(): number {
    return this.#native.field();
  }

  /** The delimiter: the first tag of every entry (e.g. `448` for `PartyID`). */
  get delim(): number {
    return this.#native.delim();
  }

  /**
   * Read a field by tag.
   * @throws A `QuickFixError` (`fixErrorName: 'FieldNotFound'`) if absent.
   */
  getField(tag: number): string {
    return this.#native.getField(tag);
  }

  /** Set a field. Returns `this` for chaining. */
  setField(tag: number, value: string | number): this {
    this.#native.setField(tag, String(value));
    return this;
  }

  /** Whether a field is present. */
  isSetField(tag: number): boolean {
    return this.#native.isSetField(tag);
  }

  /** Remove a field (no-op if absent). Returns `this` for chaining. */
  removeField(tag: number): this {
    this.#native.removeField(tag);
    return this;
  }

  /** Read a field by tag, or `undefined` if absent. */
  getFieldIfSet(tag: number): string | undefined {
    return this.#native.getFieldIfSet(tag);
  }

  /** The number of fields, including every field of every nested group entry. */
  totalFields(): number {
    return this.#native.totalFields();
  }

  /** Whether the entry has no fields of its own. */
  isEmpty(): boolean {
    return this.#native.isEmpty();
  }

  /** Remove every field and nested group. Returns `this` for chaining. */
  clear(): this {
    this.#native.clear();
    return this;
  }

  /** The entry's own fields, in wire order, as `[tag, value]` pairs. */
  fields(): [number, string][] {
    return this.#native.fields();
  }

  /** Iterates the entry's own fields as `[tag, value]` pairs (see {@link Group.fields}). */
  [Symbol.iterator](): IterableIterator<[number, string]> {
    return this.fields()[Symbol.iterator]();
  }

  /**
   * Append a nested group entry under its own count tag (a copy is stored; the
   * count field is updated). Returns `this` for chaining.
   */
  addGroup(group: Group): this {
    this.#native.addGroup(group.nativeHandle);
    return this;
  }

  /**
   * A snapshot copy of the `index`-th entry (1-based) of the nested group `tag`.
   * Mutations do not affect this entry; write them back with
   * {@link Group.replaceGroup}.
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
   * Remove every entry of the nested group `tag` (and its count field), or
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

  /** Whether the nested group `tag` has any entry, or has an `index`-th entry (1-based). */
  hasGroup(tag: number): boolean;
  hasGroup(index: number, tag: number): boolean;
  hasGroup(a: number, b?: number): boolean {
    return b === undefined ? this.#native.hasGroup(a) : this.#native.hasGroup(a, b);
  }

  /** The number of entries of the nested group `tag` (0 if none). */
  groupCount(tag: number): number {
    return this.#native.groupCount(tag);
  }

  /** The entry's fields (and nested groups) as a SOH-delimited string, in wire order. */
  toString(): string {
    return this.#native.toString();
  }
}
