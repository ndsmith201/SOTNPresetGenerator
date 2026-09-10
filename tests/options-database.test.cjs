const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, readFileSync, rmSync, existsSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { deleteUserOption, initializeOptionsCatalog } = require('../dist/options-database');
const { exportOptions, validateDump } = require('../scripts/export-options.cjs');

const schema = readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
const dump = readFileSync(path.join(__dirname, '../database/options-dump.sql'), 'utf8');
const rows = database => database.prepare('SELECT * FROM options ORDER BY id').all();

test('first installation loads every snapshot field and subsequent launches preserve edits and deletions', async () => {
  const source = new DatabaseSync(':memory:');
  const installed = new DatabaseSync(':memory:');
  try {
    source.exec(dump);
    await initializeOptionsCatalog(installed, schema, async () => dump);
    assert.deepEqual(rows(installed), rows(source));
    installed.exec("UPDATE options SET comment = 'User edit', read_only = 0 WHERE id = (SELECT MIN(id) FROM options)");
    installed.exec('DELETE FROM options WHERE id = (SELECT MAX(id) FROM options)');
    const edited = rows(installed);
    await initializeOptionsCatalog(installed, schema, async () => { throw new Error('Existing installs must not load the snapshot'); });
    assert.deepEqual(rows(installed), edited);
    installed.exec('DELETE FROM options');
    await initializeOptionsCatalog(installed, schema, async () => { throw new Error('An empty existing catalog is still an existing installation'); });
    assert.equal(rows(installed).length, 0);
  } finally { source.close(); installed.close(); }
});

test('an invalid snapshot leaves first installation retryable', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    await assert.rejects(initializeOptionsCatalog(database, schema, async () => 'BEGIN; CREATE TABLE options (id INTEGER); invalid SQL; COMMIT;'));
    assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE name = 'options'").get(), undefined);
    await initializeOptionsCatalog(database, schema, async () => dump);
    assert.ok(rows(database).length > 0);
  } finally { database.close(); }
});

test('existing legacy catalogs migrate without importing release options', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(`CREATE TABLE options (
      id INTEGER PRIMARY KEY AUTOINCREMENT, comment TEXT NOT NULL,
      category TEXT CHECK (category IN ('world', 'items', 'challenge')),
      type TEXT, value TEXT, created_at TEXT, updated_at TEXT
    );
    INSERT INTO options VALUES (9, 'Legacy custom option', 'world', 'word', '0x1234', '2025-01-01', '2025-02-01');`);
    await initializeOptionsCatalog(database, schema, async () => { throw new Error('Do not replace legacy data'); });
    assert.equal(rows(database).length, 1);
    const row = rows(database)[0];
    assert.equal(row.id, 9);
    assert.equal(row.comment, 'Legacy custom option');
    assert.equal(row.value, '0x1234');
    assert.equal(row.read_only, 1);
    assert.equal(row.updated_at, '2025-02-01');
    assert.doesNotThrow(() => database.exec("INSERT INTO options (comment, category, type, value) VALUES ('New', 'gameplay', 'word', '1')"));
  } finally { database.close(); }
});

test('export includes committed WAL data, escaped text, IDs and sequence without changing the source', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'sotn-options-export-'));
  const sourcePath = path.join(directory, 'options.sqlite');
  const destination = path.join(directory, 'snapshot.sql');
  const source = new DatabaseSync(sourcePath);
  const restored = new DatabaseSync(':memory:');
  try {
    source.exec(schema);
    source.prepare('INSERT INTO options (id, comment, description, category, type, value, read_only, additional_writes_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(7, "Author's option ☾", 'Line one\nLine two\0end', 'gameplay', 'word', '0x1234', 0, '[{"comment":"Quoted \\\"value\\\""}]');
    source.exec("INSERT INTO options (id, comment, category, type, value) VALUES (99, 'Deleted', 'world', 'word', '1'); DELETE FROM options WHERE id = 99;");
    source.exec("INSERT INTO write_options (id, label, category) VALUES ('private', 'Do not export', 'world')");
    const before = rows(source);
    assert.equal(exportOptions(sourcePath, destination), 1);
    const sql = readFileSync(destination, 'utf8');
    assert.equal(validateDump(sql), 1);
    await initializeOptionsCatalog(restored, schema, async () => sql);
    assert.deepEqual(rows(restored), before);
    assert.deepEqual(rows(source), before);
    assert.equal(restored.prepare('SELECT COUNT(*) AS count FROM write_options').get().count, 0);
    assert.equal(source.prepare('SELECT COUNT(*) AS count FROM write_options').get().count, 1);
    assert.doesNotMatch(sql, /Do not export|write_options|options\.sqlite/);
    assert.equal(restored.prepare("INSERT INTO options (comment, category, type, value) VALUES ('Next', 'world', 'word', '1')").run().lastInsertRowid, 100);
    assert.equal(exportOptions(sourcePath, destination), 1);
    assert.equal(readFileSync(destination, 'utf8'), sql, 'Unchanged data yields a deterministic dump');
  } finally {
    source.close(); restored.close(); rmSync(directory, { recursive: true, force: true });
  }
});

test('export fails on a missing source instead of creating or replacing data', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'sotn-options-missing-'));
  try {
    const source = path.join(directory, 'missing.sqlite');
    const destination = path.join(directory, 'snapshot.sql');
    assert.throws(() => exportOptions(source, destination));
    assert.equal(existsSync(source), false);
    assert.equal(existsSync(destination), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('release validation rejects dumps containing unrelated tables', () => {
  assert.throws(() => validateDump(`${dump}\nCREATE TABLE private_settings (value TEXT);`), /only the options table/);
});


test('deleting a local option protects registered options and rejects invalid IDs', () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(schema);
    database.exec("INSERT INTO options (id, comment, read_only, category, type, value) VALUES (1, 'Local option', 0, 'gameplay', 'word', '1'), (2, 'Registered option', 1, 'gameplay', 'word', '2')");
    for (const id of [0, -1, 1.5, '1', NaN, null]) assert.throws(() => deleteUserOption(database, id), /Invalid option id/);
    assert.throws(() => deleteUserOption(database, 2), /read-only/);
    deleteUserOption(database, 1);
    assert.deepEqual(rows(database).map(row => row.id), [2]);
    assert.throws(() => deleteUserOption(database, 1), /could not be found/);
  } finally { database.close(); }
});
