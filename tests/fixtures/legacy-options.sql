-- Fixed pre-writes_json catalog for migration tests. Keep this historical shape
-- independent of the current schema and regenerated release snapshot.
CREATE TABLE options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  read_only INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL CHECK (category IN ('world', 'items', 'challenge', 'relics', 'gameplay')),
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  address TEXT,
  game_init INTEGER NOT NULL DEFAULT 0,
  stat_edit INTEGER NOT NULL DEFAULT 0,
  raw_json INTEGER NOT NULL DEFAULT 0,
  primary_write_json TEXT,
  additional_writes_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO options (id, comment, category, type, value)
VALUES (1, 'Legacy memory patch', 'gameplay', 'word', '0x1234');
