import { DatabaseSync } from "node:sqlite";

/** Import the release catalog once; later launches only migrate the user's schema. */
export async function initializeOptionsCatalog(
  database: DatabaseSync,
  schema: string,
  loadDump: () => Promise<string>
): Promise<void> {
  const existing = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'options'").get();
  if (!existing) {
    const dump = await loadDump();
    // Validate before touching the destination. The snapshot owns its transaction.
    const validation = new DatabaseSync(":memory:");
    try {
      validation.exec(dump);
      migrateOptionsCategories(validation);
      validation.exec(schema);
      migrateOptionalWriteFields(validation);
      validation.prepare("SELECT id, comment, read_only FROM options").all();
    } finally {
      validation.close();
    }
    try {
      database.exec(dump);
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch { /* No active transaction. */ }
      throw error;
    }
  }
  migrateOptionsCategories(database);
  database.exec(schema);
  migrateOptionalWriteFields(database);
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
  const statEditExpression = columns.has("stat_edit") ? "stat_edit" : "0";
  const rawJsonExpression = columns.has("raw_json") ? "raw_json" : "0";
  const additionalWritesExpression = columns.has("additional_writes_json") ? "additional_writes_json" : "NULL";

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
      stat_edit INTEGER NOT NULL DEFAULT 0 CHECK (stat_edit IN (0, 1)),
      raw_json INTEGER NOT NULL DEFAULT 0 CHECK (raw_json IN (0, 1)),
      additional_writes_json TEXT CHECK (
        additional_writes_json IS NULL OR
        (json_valid(additional_writes_json) AND json_type(additional_writes_json) = 'array')
      ),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO options (id, comment, description, read_only, category, type, value, address, game_init, stat_edit, raw_json, additional_writes_json, created_at, updated_at)
    SELECT id, comment, ${descriptionExpression}, ${readOnlyExpression}, category, type, value, ${addressExpression}, ${gameInitExpression}, ${statEditExpression}, ${rawJsonExpression}, ${additionalWritesExpression}, created_at, updated_at
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
