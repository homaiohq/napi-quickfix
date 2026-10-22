-- QuickFIX message-store tables for @homaiohq/napi-quickfix/store/sql (sqlite).
-- Same layout as QuickFIX's own PostgreSQL/MySQL stores (sessions/messages); generated from
-- sqlSchema('sqlite') in src/store/sql.ts. Prefix the table names if you pass tablePrefix.

CREATE TABLE IF NOT EXISTS sessions (
  beginstring TEXT NOT NULL,
  sendercompid TEXT NOT NULL,
  targetcompid TEXT NOT NULL,
  session_qualifier TEXT NOT NULL,
  creation_time TEXT NOT NULL,
  incoming_seqnum INTEGER NOT NULL,
  outgoing_seqnum INTEGER NOT NULL,
  PRIMARY KEY (beginstring, sendercompid, targetcompid, session_qualifier)
);

CREATE TABLE IF NOT EXISTS messages (
  beginstring TEXT NOT NULL,
  sendercompid TEXT NOT NULL,
  targetcompid TEXT NOT NULL,
  session_qualifier TEXT NOT NULL,
  msgseqnum INTEGER NOT NULL,
  message TEXT NOT NULL,
  PRIMARY KEY (beginstring, sendercompid, targetcompid, session_qualifier, msgseqnum)
);
