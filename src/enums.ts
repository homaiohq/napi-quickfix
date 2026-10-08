/**
 * FIX constants.
 *
 * - {@link FIELD} — field-name → tag-number (e.g. `FIELD.MsgType === 35`).
 *   Generated from QuickFIX's `FixFieldNumbers.h` (see `src/generated/fields.ts`),
 *   so it carries every `FIX::FIELD::*` name the bundled engine knows, with
 *   literal types.
 * - value groups exported by the native engine such as {@link MsgType} and
 *   {@link Side} (e.g. `MsgType.Logon === 'A'`, `Side.Buy === '1'`).
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
import { FIELD } from './generated/fields.js';
import { native } from './native.js';

export { FIELD, type FieldName } from './generated/fields.js';

/** A single group of FIX constants (name → value). */
export type EnumGroup = Readonly<Record<string, number | string>>;

/** The full, frozen tree of FIX constants. */
export type Enums = Readonly<Record<string, EnumGroup>>;

function deepFreeze(source: Record<string, Record<string, number | string>>): Enums {
  const out: Record<string, EnumGroup> = {};
  for (const key of Object.keys(source)) {
    out[key] = Object.freeze({ ...source[key] });
  }
  // FIELD is already frozen (generated); reuse it rather than copying 6000+ keys.
  out.FIELD = FIELD;
  return Object.freeze(out);
}

/**
 * The complete tree of FIX constants (frozen), e.g. `enums.FIELD.MsgType`,
 * `enums.MsgType.Logon`, `enums.Side.Buy`.
 *
 * `enums.FIELD` is the same table as {@link FIELD}; the value groups come from
 * the native engine.
 */
export const enums: Enums = deepFreeze(
  (native.enums ?? {}) as unknown as Record<string, Record<string, number | string>>,
);

/** A group of numeric FIX constants (name → number). */
export type NumericEnumGroup = Readonly<Record<string, number>>;

/** A group of string-valued FIX constants (name → string), e.g. {@link MsgType}. */
export type StringEnumGroup = Readonly<Record<string, string>>;

/** MsgType values (strings), e.g. `MsgType.Logon === 'A'`. */
export const MsgType: StringEnumGroup = (enums.MsgType ?? Object.freeze({})) as StringEnumGroup;

/** Side values (strings), e.g. `Side.Buy === '1'`. */
export const Side: StringEnumGroup = (enums.Side ?? Object.freeze({})) as StringEnumGroup;
