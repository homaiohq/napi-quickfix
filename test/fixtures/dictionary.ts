import { fileURLToPath } from 'node:url';

import { DataDictionary } from '../../dist/esm/index.js';

/**
 * Absolute path of the reduced FIX 4.4 dictionary (header/trailer, the admin
 * messages, and a NewOrderSingle with the NoPartyIDs/NoPartySubIDs groups).
 * Usable both by `DataDictionary.fromFile` and as a session's `DataDictionary=`
 * setting.
 */
export const FIX44_MINI_PATH: string = fileURLToPath(new URL('./FIX44-mini.xml', import.meta.url));

/** Load the reduced FIX 4.4 dictionary. */
export function loadFix44Mini(): DataDictionary {
  return DataDictionary.fromFile(FIX44_MINI_PATH);
}
