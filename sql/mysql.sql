-- QuickFIX message-store tables for @homaiohq/napi-quickfix/store/sql (mysql).
-- Same layout as QuickFIX's own MySQL store (sessions/messages); generated from
-- sqlSchema('mysql') in src/store/sql.ts. Prefix the table names if you pass tablePrefix.

CREATE TABLE IF NOT EXISTS sessions (
  beginstring CHAR(8) NOT NULL,
  sendercompid VARCHAR(64) NOT NULL,
  targetcompid VARCHAR(64) NOT NULL,
  session_qualifier VARCHAR(64) NOT NULL,
  creation_time DATETIME(3) NOT NULL,
  incoming_seqnum BIGINT UNSIGNED NOT NULL,
  outgoing_seqnum BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (beginstring, sendercompid, targetcompid, session_qualifier)
);

CREATE TABLE IF NOT EXISTS messages (
  beginstring CHAR(8) NOT NULL,
  sendercompid VARCHAR(64) NOT NULL,
  targetcompid VARCHAR(64) NOT NULL,
  session_qualifier VARCHAR(64) NOT NULL,
  msgseqnum BIGINT UNSIGNED NOT NULL,
  message BLOB NOT NULL,
  PRIMARY KEY (beginstring, sendercompid, targetcompid, session_qualifier, msgseqnum)
);
