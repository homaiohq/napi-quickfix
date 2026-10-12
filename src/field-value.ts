/**
 * Wire formatting of the `string | number` field values `Message` and `Group`
 * accept.
 */

/**
 * A field value as FIX text. Strings pass through. A number keeps its shortest
 * round-trip digits but is written without exponent notation, which FIX numeric
 * fields do not allow (`1e-7` → `'0.0000001'`, `1e21` →
 * `'1000000000000000000000'`, where `String` gives `'1e-7'` and `'1e+21'`).
 * @throws `RangeError` for `NaN` and `±Infinity`, which have no FIX form.
 */
export function formatFieldValue(value: string | number): string {
  if (typeof value !== 'number') {
    return String(value);
  }
  if (!Number.isFinite(value)) {
    throw new RangeError(`field value must be a finite number, got ${value}`);
  }
  const text = String(value);
  const e = text.indexOf('e');
  if (e === -1) {
    return text;
  }
  // `[-]d[.ddd]e±n`: move the decimal point of the mantissa n places.
  const sign = value < 0 ? '-' : '';
  const mantissa = text.slice(sign.length, e);
  const point = mantissa.indexOf('.');
  const digits = mantissa.replace('.', '');
  const at = (point === -1 ? mantissa.length : point) + Number(text.slice(e + 1));
  if (at <= 0) {
    return `${sign}0.${'0'.repeat(-at)}${digits}`;
  }
  if (at >= digits.length) {
    return `${sign}${digits}${'0'.repeat(at - digits.length)}`;
  }
  return `${sign}${digits.slice(0, at)}.${digits.slice(at)}`;
}
