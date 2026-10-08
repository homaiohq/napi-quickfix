/**
 * FIX constants.
 *
 * - {@link FIELD} — field-name → tag-number (e.g. `FIELD.MsgType === 35`).
 *   Generated from QuickFIX's `FixFieldNumbers.h` (see `src/generated/fields.ts`),
 *   so it carries every `FIX::FIELD::*` name the bundled engine knows.
 * - value groups such as {@link MsgType} and {@link Side} (e.g.
 *   `MsgType.Logon === 'A'`, `Side.Buy === '1'`) — one per field, generated from
 *   QuickFIX's `FixValues.h` (see `src/generated/values.ts`), so every
 *   `FIX::<Field>_<VALUE>` constant is here. {@link VALUES} holds all of them
 *   keyed by field name, and each group is also importable from
 *   `@homaiohq/napi-quickfix/values` without loading the native addon.
 *
 * Everything carries literal types and is frozen, so a misspelt name is a
 * compile error and consumers cannot mutate the shared constant tables.
 *
 * @example
 * ```ts
 * import { FIELD, MsgType, enums } from '@homaiohq/napi-quickfix';
 * msg.setField(FIELD.MsgType, MsgType.Logon);
 * const side = enums.Side.Buy;
 * ```
 */
import { FIELD } from './generated/fields.js';
import { VALUES, type ValueGroups } from './generated/values.js';

export { FIELD, type FieldName } from './generated/fields.js';
export {
  VALUES,
  MsgType,
  Side,
  OrdType,
  TimeInForce,
  type ValueGroups,
  type ValueGroupName,
} from './generated/values.js';

/**
 * A single group of FIX constants widened to a string-indexed map (name → value).
 *
 * Every value group and {@link FIELD} is assignable to it, so use it where a group
 * is looked up by a `string` key the compiler cannot narrow (a name read from
 * configuration, say) instead of the literally-typed group itself:
 *
 * @example
 * ```ts
 * const group: EnumGroup = enums[name as ValueGroupName];
 * const code = group[valueName];
 * ```
 */
export type EnumGroup = Readonly<Record<string, number | string>>;

/**
 * The full, frozen tree of FIX constants: every value group of {@link ValueGroups}
 * plus the {@link FIELD} tag table.
 */
export type Enums = ValueGroups & { readonly FIELD: typeof FIELD };

/**
 * The complete tree of FIX constants (frozen), e.g. `enums.FIELD.MsgType`,
 * `enums.MsgType.Logon`, `enums.Side.Buy`.
 *
 * `enums.FIELD` is the same table as {@link FIELD}; every other member is the
 * same object as the corresponding {@link VALUES} group.
 */
export const enums: Enums = /* @__PURE__ */ Object.freeze({ ...VALUES, FIELD });
