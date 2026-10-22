/**
 * A generic SQL {@link MessageStoreAdapter}: give it an `execute(sql, params)`
 * over your own driver / pool and a dialect, and it persists session state in
 * the table layout of QuickFIX's own PostgreSQL / MySQL stores (`sessions`,
 * `messages`, optional table prefix), so an existing QuickFIX C++ deployment
 * interoperates. Schema files for each dialect live in the package's `sql/`
 * directory; {@link sqlSchema} returns the same statements.
 *
 * Subpath export: `@homaiohq/napi-quickfix/store/sql`. No driver dependency.
 */
import type { Awaitable, MessageStoreAdapter, MessageStoreState } from '../store.js';
import type { SessionID } from '../session-id.js';

export type SqlDialect = 'postgres' | 'mysql' | 'sqlite';

/** A result row, as drivers return them (column name → value). */
export type SqlRow = Record<string, unknown>;

/**
 * Run one statement with positional parameters and return its rows (anything
 * array-like of rows; for statements without a result set the return value is
 * ignored). Placeholders are `$1..$n` for `postgres`, `?` otherwise.
 */
export type SqlExecute = (sql: string, params: unknown[]) => Awaitable<SqlRow[] | unknown>;

export interface SqlMessageStoreOptions {
  dialect: SqlDialect;
  execute: SqlExecute;
  /**
   * Run `fn` inside a transaction, handing it an `execute` bound to it. Used
   * by `reset()` (delete the messages + rewrite the session row); without it
   * the two statements run back to back on `execute`.
   */
  transaction?: (fn: (execute: SqlExecute) => Promise<void>) => Promise<void>;
  /** Prepended to both table names (`sessions`, `messages`). Default `''`. */
  tablePrefix?: string;
}

const KEY_COLUMNS = ['beginstring', 'sendercompid', 'targetcompid', 'session_qualifier'] as const;

function key(id: SessionID): [string, string, string, string] {
  return [id.beginString, id.senderCompID, id.targetCompID, id.sessionQualifier];
}

function placeholders(dialect: SqlDialect, from: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => (dialect === 'postgres' ? `$${from + i}` : '?'));
}

/** `YYYY-MM-DD HH:MM:SS.mmm` in UTC, what upstream writes (at second precision). */
function toSqlTime(d: Date): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new TypeError('creationTime must be a valid Date');
  }
  return d.toISOString().replace('T', ' ').replace('Z', '');
}

/** Parse what the driver gave back for a timestamp column read as text. */
function fromSqlTime(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    // "YYYY-MM-DD HH:MM:SS[.ffffff][+00]" (no zone = UTC, as written).
    const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(v.trim());
    if (m) {
      const frac = m[3] ? m[3].slice(0, 4) : '';
      const zone = m[4] ? (m[4] === 'Z' ? 'Z' : m[4].length === 3 ? `${m[4]}:00` : m[4].replace(/(\d{2})(\d{2})$/, '$1:$2')) : 'Z';
      const d = new Date(`${m[1]}T${m[2]}${frac}${zone}`);
      if (!Number.isNaN(d.getTime())) return d;
    }
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  throw new TypeError(`sql message store: cannot read creation_time ${String(v)}`);
}

function toSeq(v: unknown, what: string): number {
  const n = typeof v === 'bigint' ? Number(v) : typeof v === 'string' ? Number(v) : (v as number);
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new TypeError(`sql message store: ${what} is not a positive safe integer (${String(v)})`);
  }
  return n;
}

function rows(result: unknown): SqlRow[] {
  if (Array.isArray(result)) return result as SqlRow[];
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: SqlRow[] }).rows; // a pg Result passed through as is
  }
  return [];
}

/**
 * The `CREATE TABLE` statements for `dialect` (one per table), as in the
 * package's `sql/` files.
 */
export function sqlSchema(dialect: SqlDialect, options: { tablePrefix?: string } = {}): string[] {
  const p = options.tablePrefix ?? '';
  const pk = `PRIMARY KEY (${KEY_COLUMNS.join(', ')}`;
  switch (dialect) {
    case 'postgres':
      return [
        `CREATE TABLE IF NOT EXISTS ${p}sessions (
  beginstring CHAR(8) NOT NULL,
  sendercompid VARCHAR(64) NOT NULL,
  targetcompid VARCHAR(64) NOT NULL,
  session_qualifier VARCHAR(64) NOT NULL,
  creation_time TIMESTAMP NOT NULL,
  incoming_seqnum NUMERIC NOT NULL,
  outgoing_seqnum NUMERIC NOT NULL,
  ${pk})
);`,
        `CREATE TABLE IF NOT EXISTS ${p}messages (
  beginstring CHAR(8) NOT NULL,
  sendercompid VARCHAR(64) NOT NULL,
  targetcompid VARCHAR(64) NOT NULL,
  session_qualifier VARCHAR(64) NOT NULL,
  msgseqnum NUMERIC NOT NULL,
  message TEXT NOT NULL,
  ${pk}, msgseqnum)
);`,
      ];
    case 'mysql':
      return [
        `CREATE TABLE IF NOT EXISTS ${p}sessions (
  beginstring CHAR(8) NOT NULL,
  sendercompid VARCHAR(64) NOT NULL,
  targetcompid VARCHAR(64) NOT NULL,
  session_qualifier VARCHAR(64) NOT NULL,
  creation_time DATETIME(3) NOT NULL,
  incoming_seqnum BIGINT UNSIGNED NOT NULL,
  outgoing_seqnum BIGINT UNSIGNED NOT NULL,
  ${pk})
);`,
        `CREATE TABLE IF NOT EXISTS ${p}messages (
  beginstring CHAR(8) NOT NULL,
  sendercompid VARCHAR(64) NOT NULL,
  targetcompid VARCHAR(64) NOT NULL,
  session_qualifier VARCHAR(64) NOT NULL,
  msgseqnum BIGINT UNSIGNED NOT NULL,
  message BLOB NOT NULL,
  ${pk}, msgseqnum)
);`,
      ];
    case 'sqlite':
      return [
        `CREATE TABLE IF NOT EXISTS ${p}sessions (
  beginstring TEXT NOT NULL,
  sendercompid TEXT NOT NULL,
  targetcompid TEXT NOT NULL,
  session_qualifier TEXT NOT NULL,
  creation_time TEXT NOT NULL,
  incoming_seqnum INTEGER NOT NULL,
  outgoing_seqnum INTEGER NOT NULL,
  ${pk})
);`,
        `CREATE TABLE IF NOT EXISTS ${p}messages (
  beginstring TEXT NOT NULL,
  sendercompid TEXT NOT NULL,
  targetcompid TEXT NOT NULL,
  session_qualifier TEXT NOT NULL,
  msgseqnum INTEGER NOT NULL,
  message TEXT NOT NULL,
  ${pk}, msgseqnum)
);`,
      ];
    default:
      throw new TypeError(`sql message store: unknown dialect ${String(dialect)}`);
  }
}

/**
 * Build a {@link MessageStoreAdapter} over `execute`. Column mapping follows
 * upstream: `outgoing_seqnum` is the next sender number, `incoming_seqnum` the
 * next target number; timestamps are written and read as UTC text.
 */
export function createSqlMessageStore(options: SqlMessageStoreOptions): MessageStoreAdapter {
  const { dialect, execute, transaction } = options;
  if (dialect !== 'postgres' && dialect !== 'mysql' && dialect !== 'sqlite') {
    throw new TypeError(`sql message store: unknown dialect ${String(dialect)}`);
  }
  if (typeof execute !== 'function') {
    throw new TypeError('sql message store: execute must be a function');
  }
  const p = options.tablePrefix ?? '';
  const sessions = `${p}sessions`;
  const messages = `${p}messages`;
  const ph = (from: number, count: number) => placeholders(dialect, from, count);
  const where = (from: number) => KEY_COLUMNS.map((c, i) => `${c} = ${ph(from + i, 1)[0]}`).join(' AND ');
  const timeText =
    dialect === 'postgres'
      ? 'creation_time::text AS creation_time'
      : dialect === 'mysql'
        ? 'CAST(creation_time AS CHAR) AS creation_time'
        : 'creation_time';

  const sql = {
    load: `SELECT ${timeText}, incoming_seqnum, outgoing_seqnum FROM ${sessions} WHERE ${where(1)}`,
    create: `INSERT INTO ${sessions} (${KEY_COLUMNS.join(', ')}, creation_time, incoming_seqnum, outgoing_seqnum) VALUES (${ph(1, 7).join(', ')})`,
    setSeqNums: `UPDATE ${sessions} SET outgoing_seqnum = ${ph(1, 1)[0]}, incoming_seqnum = ${ph(2, 1)[0]} WHERE ${where(3)}`,
    setMessage:
      dialect === 'mysql'
        ? `INSERT INTO ${messages} (${KEY_COLUMNS.join(', ')}, msgseqnum, message) VALUES (${ph(1, 6).join(', ')}) ON DUPLICATE KEY UPDATE message = VALUES(message)`
        : `INSERT INTO ${messages} (${KEY_COLUMNS.join(', ')}, msgseqnum, message) VALUES (${ph(1, 6).join(', ')}) ON CONFLICT (${KEY_COLUMNS.join(', ')}, msgseqnum) DO UPDATE SET message = ${dialect === 'postgres' ? 'EXCLUDED' : 'excluded'}.message`,
    getMessages: `SELECT message FROM ${messages} WHERE ${where(1)} AND msgseqnum >= ${ph(5, 1)[0]} AND msgseqnum <= ${ph(6, 1)[0]} ORDER BY msgseqnum ASC`,
    deleteMessages: `DELETE FROM ${messages} WHERE ${where(1)}`,
    resetSession:
      dialect === 'mysql'
        ? `INSERT INTO ${sessions} (${KEY_COLUMNS.join(', ')}, creation_time, incoming_seqnum, outgoing_seqnum) VALUES (${ph(1, 7).join(', ')}) ON DUPLICATE KEY UPDATE creation_time = VALUES(creation_time), incoming_seqnum = VALUES(incoming_seqnum), outgoing_seqnum = VALUES(outgoing_seqnum)`
        : `INSERT INTO ${sessions} (${KEY_COLUMNS.join(', ')}, creation_time, incoming_seqnum, outgoing_seqnum) VALUES (${ph(1, 7).join(', ')}) ON CONFLICT (${KEY_COLUMNS.join(', ')}) DO UPDATE SET creation_time = ${dialect === 'postgres' ? 'EXCLUDED' : 'excluded'}.creation_time, incoming_seqnum = ${dialect === 'postgres' ? 'EXCLUDED' : 'excluded'}.incoming_seqnum, outgoing_seqnum = ${dialect === 'postgres' ? 'EXCLUDED' : 'excluded'}.outgoing_seqnum`,
  };

  const resetWith = async (run: SqlExecute, id: SessionID, state: MessageStoreState) => {
    await run(sql.deleteMessages, key(id));
    await run(sql.resetSession, [...key(id), toSqlTime(state.creationTime), state.nextTargetMsgSeqNum, state.nextSenderMsgSeqNum]);
  };

  return {
    async load(id) {
      const r = rows(await execute(sql.load, key(id)));
      if (r.length === 0) return null;
      const row = r[0];
      return {
        creationTime: fromSqlTime(row.creation_time),
        nextSenderMsgSeqNum: toSeq(row.outgoing_seqnum, 'outgoing_seqnum'),
        nextTargetMsgSeqNum: toSeq(row.incoming_seqnum, 'incoming_seqnum'),
      };
    },
    async create(id, state) {
      await execute(sql.create, [...key(id), toSqlTime(state.creationTime), state.nextTargetMsgSeqNum, state.nextSenderMsgSeqNum]);
    },
    async setSeqNums(id, nextSender, nextTarget) {
      await execute(sql.setSeqNums, [nextSender, nextTarget, ...key(id)]);
    },
    async setMessage(id, seqNum, message) {
      await execute(sql.setMessage, [...key(id), seqNum, message]);
    },
    async getMessages(id, begin, end) {
      const r = rows(await execute(sql.getMessages, [...key(id), begin, end]));
      return r.map((row) => {
        const m = row.message;
        if (typeof m === 'string') return m;
        if (m instanceof Uint8Array) return Buffer.from(m).toString('utf8');
        throw new TypeError('sql message store: message column is neither text nor bytes');
      });
    },
    async reset(id, state) {
      if (transaction) {
        await transaction((run) => resetWith(run, id, state));
      } else {
        await resetWith(execute, id, state);
      }
    },
  };
}
