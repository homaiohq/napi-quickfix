-- QuickFIX message-store tables for @homaiohq/napi-quickfix/store/sql (postgres).
-- Same layout as QuickFIX's own PostgreSQL store (sessions/messages); generated from
-- sqlSchema('postgres') in src/store/sql.ts. Prefix the table names if you pass tablePrefix.

CREATE TABLE IF NOT EXISTS sessions (
  beginstring CHAR(8) NOT NULL,
  sendercompid VARCHAR(64) NOT NULL,
  targetcompid VARCHAR(64) NOT NULL,
  session_qualifier VARCHAR(64) NOT NULL,
  creation_time TIMESTAMP NOT NULL,
  incoming_seqnum NUMERIC NOT NULL,
  outgoing_seqnum NUMERIC NOT NULL,
  PRIMARY KEY (beginstring, sendercompid, targetcompid, session_qualifier)
);

CREATE TABLE IF NOT EXISTS messages (
  beginstring CHAR(8) NOT NULL,
  sendercompid VARCHAR(64) NOT NULL,
  targetcompid VARCHAR(64) NOT NULL,
  session_qualifier VARCHAR(64) NOT NULL,
  msgseqnum NUMERIC NOT NULL,
  message TEXT NOT NULL,
  PRIMARY KEY (beginstring, sendercompid, targetcompid, session_qualifier, msgseqnum)
);
