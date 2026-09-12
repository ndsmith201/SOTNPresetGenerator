PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment TEXT NOT NULL CHECK (length(trim(comment)) > 0),
  description TEXT NOT NULL DEFAULT '',
  read_only INTEGER NOT NULL DEFAULT 0 CHECK (read_only IN (0, 1)),
  category TEXT NOT NULL CHECK (category IN ('world', 'items', 'challenge', 'relics', 'gameplay')),
  type TEXT NOT NULL CHECK (type IN ('char', 'short', 'word', 'long', 'string')),
  value TEXT NOT NULL CHECK (length(trim(value)) > 0),
  address TEXT CHECK (address IS NULL OR length(trim(address)) > 0),
  game_init INTEGER NOT NULL DEFAULT 0 CHECK (game_init IN (0, 1)),
  stat_edit INTEGER NOT NULL DEFAULT 0 CHECK (stat_edit IN (0, 1)),
  raw_json INTEGER NOT NULL DEFAULT 0 CHECK (raw_json IN (0, 1)),
  primary_write_json TEXT CHECK (primary_write_json IS NULL OR (json_valid(primary_write_json) AND json_type(primary_write_json) = 'object')),
  writes_json TEXT CHECK (writes_json IS NULL OR (json_valid(writes_json) AND json_type(writes_json) = 'array')),
  additional_writes_json TEXT CHECK (
    additional_writes_json IS NULL OR
    (json_valid(additional_writes_json) AND json_type(additional_writes_json) = 'array')
  ),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS options_category_type_idx
  ON options (category, type, comment);

CREATE TABLE IF NOT EXISTS write_options (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN ('world', 'items', 'challenge', 'relics', 'gameplay')),
  injected_writes_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(injected_writes_json)),
  appended_writes_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(appended_writes_json)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS write_options_category_idx
  ON write_options (category, label);
