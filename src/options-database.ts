import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { optionWrites } from "./option-writes";

// Keep applied migrations immutable; append a new file for future catalog changes.
const catalogMigrations = ["001-built-in-option-descriptions.sql"];

/** Refresh bundled options once per snapshot, preserving local options and IDs. */
export async function initializeOptionsCatalog(
  database: DatabaseSync,
  schema: string,
  loadDump: () => Promise<string>
): Promise<void> {
  const dump = await loadDump();
  const fingerprint = createHash("sha256").update(dump).digest("hex");
  const source = new DatabaseSync(":memory:");
  try {
    // Validate in isolation before making any changes to an installed catalog.
    source.exec(dump);
    const tables = source.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
    if (tables.length !== 1 || tables[0].name !== "options") throw new Error("Bundled snapshot must contain only the options table.");
    migrateOptionsCategories(source);
    source.exec(schema);
    migrateOptionalWriteFields(source);
    migrateUnifiedWrites(source);
    const columns = source.prepare("PRAGMA table_info(options)").all().map(column => String(column.name));
    const bundled = source.prepare("SELECT * FROM options ORDER BY id").all();
    // Immutable identities from the last release before bundle tracking. IDs
    // alone cannot distinguish an old shipped editable entry from a local one.
    const baseline: { id: number; createdAt: string }[] = JSON.parse(await readFile(
      path.join(__dirname, "../database/bundled-options-baseline.json"), "utf8"));

    // read_only identified registered options before explicit bundle tracking.
    // Very old catalogs lacked that flag: adopt only matching ID/name pairs.
    const oldColumns = database.prepare("PRAGMA table_info(options)").all();
    const legacyIds = oldColumns.some(column => column.name === "read_only")
      ? database.prepare("SELECT id FROM options WHERE read_only = 1").all().map(row => Number(row.id))
      : oldColumns.length ? bundled.filter(row => database.prepare("SELECT comment FROM options WHERE id = ?").get(row.id)?.comment === row.comment).map(row => Number(row.id)) : [];
    migrateOptionsCategories(database);
    database.exec(schema);
    migrateOptionalWriteFields(database);
    migrateUnifiedWrites(database);
    database.exec(`CREATE TABLE IF NOT EXISTS bundled_options (
      source_id INTEGER PRIMARY KEY, option_id INTEGER NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS bundled_options_state (
      id INTEGER PRIMARY KEY CHECK (id = 1), fingerprint TEXT NOT NULL
    );`);
    database.exec("BEGIN IMMEDIATE");
    try {
      const previous = database.prepare("SELECT fingerprint FROM bundled_options_state WHERE id = 1").get();
      if (previous?.fingerprint !== fingerprint) {
        if (!previous) {
          const adopt = database.prepare("INSERT OR IGNORE INTO bundled_options (source_id, option_id) VALUES (?, ?)");
          for (const id of legacyIds) adopt.run(id, id);
          // Earlier snapshots also shipped editable rows. Adopt exact copies,
          // while retaining modified or unrelated editable options as local data.
          const lookup = database.prepare("SELECT * FROM options WHERE id = ?");
          for (const entry of baseline) {
            if (lookup.get(entry.id)?.created_at === entry.createdAt) adopt.run(entry.id, entry.id);
          }
          for (const row of bundled) {
            const local = lookup.get(row.id);
            if (local && columns.every(column => column === "read_only" || local[column] === row[column])) adopt.run(row.id, row.id);
          }
        }
        const mappings = new Map(database.prepare("SELECT source_id, option_id FROM bundled_options").all()
          .map(row => [Number(row.source_id), Number(row.option_id)]));
        // Keep mappings for retired options so a later restoration uses the same ID.
        let nextId = Math.max(0, Number(database.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'options'").get()?.seq ?? 0),
          Number(source.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'options'").get()?.seq ?? 0),
          ...mappings.values(), ...bundled.map(row => Number(row.id)));
        database.exec("DELETE FROM options WHERE id IN (SELECT option_id FROM bundled_options)");
        const occupied = new Set(database.prepare("SELECT id FROM options").all().map(row => Number(row.id)));
        const reserved = new Set(mappings.values());
        const quoted = columns.map(column => `"${column.replaceAll('"', '""')}"`).join(", ");
        const insert = database.prepare(`INSERT INTO options (${quoted}) VALUES (${columns.map(() => "?").join(", ")})`);
        const remember = database.prepare("INSERT INTO bundled_options (source_id, option_id) VALUES (?, ?) ON CONFLICT(source_id) DO UPDATE SET option_id = excluded.option_id");
        for (const row of bundled) {
          const sourceId = Number(row.id);
          const mapped = mappings.get(sourceId);
          const id = mapped ?? (!occupied.has(sourceId) && !reserved.has(sourceId) ? sourceId : ++nextId);
          insert.run(...columns.map(column => column === "id" ? id : row[column]));
          remember.run(sourceId, id);
          occupied.add(id);
          reserved.add(id);
        }
        // Preserve the source high-water mark, including deleted source entries.
        database.prepare("UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = 'options'").run(nextId);
        database.prepare("INSERT INTO bundled_options_state (id, fingerprint) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET fingerprint = excluded.fingerprint").run(fingerprint);
      }
      // Bundled definitions are protected even when an older snapshot marked
      // them editable, or this snapshot was already applied before the upgrade.
      database.exec(`UPDATE options SET read_only = 1
        WHERE read_only = 0 AND id IN (SELECT option_id FROM bundled_options)`);
      await migrateOptionsData(database);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally { source.close(); }
}

function migrateUnifiedWrites(database: DatabaseSync): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    const columns = database.prepare("PRAGMA table_info(options)").all();
    if (!columns.some(column => column.name === "writes_json")) {
      database.exec("ALTER TABLE options ADD COLUMN writes_json TEXT CHECK (writes_json IS NULL OR (json_valid(writes_json) AND json_type(writes_json) = 'array'))");
    }
    const save = database.prepare("UPDATE options SET writes_json = ? WHERE id = ?");
    for (const row of database.prepare("SELECT * FROM options WHERE writes_json IS NULL").all()) {
      const writes = optionWrites({ ...row, rawJson: Boolean(row.raw_json),
        primaryWrite: row.primary_write_json ? JSON.parse(String(row.primary_write_json)) : undefined,
        additionalWrites: row.additional_writes_json ? JSON.parse(String(row.additional_writes_json)) : [] });
      save.run(JSON.stringify(writes), row.id);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

async function migrateOptionsData(database: DatabaseSync): Promise<void> {
  database.exec(`CREATE TABLE IF NOT EXISTS options_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const applied = database.prepare("SELECT 1 FROM options_migrations WHERE id = ?");
  const record = database.prepare("INSERT INTO options_migrations (id) VALUES (?)");
  for (const id of catalogMigrations) {
    if (applied.get(id)) continue;
    const sql = await readFile(path.join(__dirname, "../database/migrations", id), "utf8");
    // The caller holds the catalog refresh transaction and its write lock.
    database.exec(sql);
    record.run(id);
  }
}

function migrateOptionsCategories(database: DatabaseSync): void {
  const table = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'options'")
    .get() as { sql?: string } | undefined;
  if (!table?.sql || (table.sql.includes("'relics'") && table.sql.includes("'gameplay'"))) return;

  const columns = new Set(
    (database.prepare("PRAGMA table_info(options)").all() as unknown as { name: string }[]).map((column) => column.name)
  );
  const addressExpression = columns.has("address") ? "address" : "NULL";
  const descriptionExpression = columns.has("description") ? "description" : "''";
  const readOnlyExpression = columns.has("read_only") ? "read_only" : "1";
  const gameInitExpression = columns.has("game_init") ? "game_init" : "0";
  const itemInitExpression = columns.has("item_init") ? "item_init" : "0";
  const statEditExpression = columns.has("stat_edit") ? "stat_edit" : "0";
  const rawJsonExpression = columns.has("raw_json") ? "raw_json" : "0";
  const additionalWritesExpression = columns.has("additional_writes_json") ? "additional_writes_json" : "NULL";
  const primaryWriteExpression = columns.has("primary_write_json") ? "primary_write_json" : "NULL";
  const writesExpression = columns.has("writes_json") ? "writes_json" : "NULL";

  database.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN IMMEDIATE;
    ALTER TABLE options RENAME TO options_before_relic_category;
    CREATE TABLE options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment TEXT NOT NULL CHECK (length(trim(comment)) > 0),
      description TEXT NOT NULL DEFAULT '',
      read_only INTEGER NOT NULL DEFAULT 0 CHECK (read_only IN (0, 1)),
      category TEXT NOT NULL CHECK (category IN ('world', 'items', 'challenge', 'relics', 'gameplay')),
      type TEXT NOT NULL CHECK (type IN ('char', 'short', 'word', 'long', 'string')),
      value TEXT NOT NULL CHECK (length(trim(value)) > 0),
      address TEXT CHECK (address IS NULL OR length(trim(address)) > 0),
      game_init INTEGER NOT NULL DEFAULT 0 CHECK (game_init IN (0, 1)),
      item_init INTEGER NOT NULL DEFAULT 0 CHECK (item_init IN (0, 1)),
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
    INSERT INTO options (id, comment, description, read_only, category, type, value, address, game_init, item_init, stat_edit, raw_json, additional_writes_json, primary_write_json, writes_json, created_at, updated_at)
    SELECT id, comment, ${descriptionExpression}, ${readOnlyExpression}, category, type, value, ${addressExpression}, ${gameInitExpression}, ${itemInitExpression}, ${statEditExpression}, ${rawJsonExpression}, ${additionalWritesExpression}, ${primaryWriteExpression}, ${writesExpression}, created_at, updated_at
    FROM options_before_relic_category;
    DROP TABLE options_before_relic_category;
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

function migrateOptionalWriteFields(database: DatabaseSync): void {
  const columns = new Set(
    (database.prepare("PRAGMA table_info(options)").all() as unknown as { name: string }[]).map((column) => column.name)
  );
  if (!columns.has("primary_write_json")) {
    database.exec("ALTER TABLE options ADD COLUMN primary_write_json TEXT CHECK (primary_write_json IS NULL OR (json_valid(primary_write_json) AND json_type(primary_write_json) = 'object'))");
  }
  if (!columns.has("address")) {
    database.exec(
      "ALTER TABLE options ADD COLUMN address TEXT CHECK (address IS NULL OR length(trim(address)) > 0)"
    );
  }
  if (!columns.has("additional_writes_json")) {
    database.exec(
      "ALTER TABLE options ADD COLUMN additional_writes_json TEXT CHECK (additional_writes_json IS NULL OR (json_valid(additional_writes_json) AND json_type(additional_writes_json) = 'array'))"
    );
  }
  if (!columns.has("game_init")) {
    database.exec("ALTER TABLE options ADD COLUMN game_init INTEGER NOT NULL DEFAULT 0 CHECK (game_init IN (0, 1))");
  }
  if (!columns.has("item_init")) {
    database.exec("ALTER TABLE options ADD COLUMN item_init INTEGER NOT NULL DEFAULT 0 CHECK (item_init IN (0, 1))");
  }
  if (!columns.has("main_block")) {
    database.exec("ALTER TABLE options ADD COLUMN main_block INTEGER NOT NULL DEFAULT 0 CHECK (main_block IN (0, 1))");
  }
  if (!columns.has("description")) {
    database.exec("ALTER TABLE options ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  }
  if (!columns.has("stat_edit")) {
    database.exec("ALTER TABLE options ADD COLUMN stat_edit INTEGER NOT NULL DEFAULT 0 CHECK (stat_edit IN (0, 1))");
  }
  if (!columns.has("raw_json")) {
    database.exec("ALTER TABLE options ADD COLUMN raw_json INTEGER NOT NULL DEFAULT 0 CHECK (raw_json IN (0, 1))");
  }
  if (!columns.has("read_only")) {
    // Freeze the existing catalog once; options created after this migration stay editable.
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec("ALTER TABLE options ADD COLUMN read_only INTEGER NOT NULL DEFAULT 0 CHECK (read_only IN (0, 1))");
      database.exec("UPDATE options SET read_only = 1");
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}


/** Delete only editable local options; bundled catalog entries are protected. */
export function deleteUserOption(database: DatabaseSync, id: unknown): void {
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) throw new Error("Invalid option id.");
  const option = database.prepare("SELECT read_only FROM options WHERE id = ?").get(id);
  if (!option) throw new Error("The option could not be found.");
  if (option.read_only) throw new Error("This registered option is read-only.");
  database.prepare("DELETE FROM options WHERE id = ? AND read_only = 0").run(id);
}
