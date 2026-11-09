CREATE TABLE IF NOT EXISTS sessions (
  chat_id INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_updated ON sessions (updated_at);
