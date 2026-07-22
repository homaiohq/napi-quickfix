/**
 * FIX constants exposed by the native engine.
 *
 * The addon exports a nested object of QuickFIX constants:
 * - {@link FIELD} — field-name → tag-number (e.g. `FIELD.MsgType === 35`)
 * - value groups such as {@link MsgType}, {@link Side}, etc.
 *   (e.g. `MsgType.Logon === 'A'`, `Side.Buy === '1'`)
 *
 * Everything is frozen at the TS layer so consumers cannot mutate the shared
 * constant tables.
 *
 * @example
 * ```ts
 * import { FIELD, MsgType, enums } from '@homaiohq/napi-quickfix';
 * msg.setField(FIELD.MsgType, MsgType.Logon);
 * const side = enums.Side.Buy;
 * ```
 */
import { native } from './native.js';

/** A single group of FIX constants (name → value). */
export type EnumGroup = Readonly<Record<string, number | string>>;

/** The full, frozen tree of FIX constants exported by the engine. */
export type Enums = Readonly<Record<string, EnumGroup>>;

function deepFreeze(source: Record<string, Record<string, number | string>>): Enums {
  const out: Record<string, EnumGroup> = {};
  for (const key of Object.keys(source)) {
    out[key] = Object.freeze({ ...source[key] });
  }
  return Object.freeze(out);
}

/**
 * The complete tree of FIX constants (frozen), e.g. `enums.FIELD.MsgType`,
 * `enums.MsgType.Logon`, `enums.Side.Buy`.
 */
export const enums: Enums = deepFreeze(
  (native.enums ?? {}) as unknown as Record<string, Record<string, number | string>>,
);

/** A group of numeric FIX constants (name → number), e.g. {@link FIELD}. */
export type NumericEnumGroup = Readonly<Record<string, number>>;

/** A group of string-valued FIX constants (name → string), e.g. {@link MsgType}. */
export type StringEnumGroup = Readonly<Record<string, string>>;

/**
 * Field-name → tag-number map, e.g. `FIELD.MsgType === 35`.
 *
 * Typed as numbers so entries can be passed straight to tag-taking APIs such as
 * `Message.setField(tag, value)`.
 */
export const FIELD: NumericEnumGroup = (enums.FIELD ?? Object.freeze({})) as NumericEnumGroup;

/** MsgType values (strings), e.g. `MsgType.Logon === 'A'`. */
export const MsgType: StringEnumGroup = (enums.MsgType ?? Object.freeze({})) as StringEnumGroup;

/** Side values (strings), e.g. `Side.Buy === '1'`. */
export const Side: StringEnumGroup = (enums.Side ?? Object.freeze({})) as StringEnumGroup;
