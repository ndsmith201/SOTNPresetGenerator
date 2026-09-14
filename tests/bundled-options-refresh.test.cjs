const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { readFileSync, mkdtempSync, rmSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { initializeOptionsCatalog } = require('../dist/options-database');
const schema = readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
const dump = readFileSync(path.join(__dirname, '../database/options-dump.sql'), 'utf8');
const initialize = (db, snapshot = dump) => initializeOptionsCatalog(db, schema, async () => snapshot);
const rows = db => db.prepare('SELECT * FROM options ORDER BY id').all();
const state = db => ({ rows: rows(db),
  mappings: db.prepare('SELECT * FROM bundled_options ORDER BY source_id').all(),
  fingerprint: db.prepare('SELECT * FROM bundled_options_state').all() });
const update = `${dump}
  UPDATE options SET comment = 'Updated Bat', writes_json = '[{"type":"word","value":"0x12345678"}]' WHERE id = 1;
  DELETE FROM options WHERE id = 2;
  INSERT INTO options (id, comment, category, type, value, writes_json)
  VALUES (1000, 'New bundled option', 'items', 'word', '0', '[{"type":"word","value":"1"}]');`;

test('upgrading an untracked release refreshes and retires old editable bundled entries', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(dump);
    const [changed, retired] = db.prepare('SELECT id FROM options WHERE read_only = 0 ORDER BY id LIMIT 2').all();
    assert.ok(changed && retired);
    db.prepare("UPDATE options SET comment = 'Old edited bundle content' WHERE id IN (?, ?)").run(changed.id, retired.id);
    db.exec(`INSERT INTO options (id, comment, category, type, value, writes_json)
      VALUES (1000, 'Keep custom', 'items', 'word', '0', '[]');`);
    const snapshot = `${dump}\nUPDATE options SET comment = 'Replacement bundled entry' WHERE id = ${changed.id};
      DELETE FROM options WHERE id = ${retired.id};`;
    await initialize(db, snapshot);
    assert.equal(db.prepare('SELECT comment FROM options WHERE id = ?').get(changed.id).comment, 'Replacement bundled entry');
    assert.equal(db.prepare('SELECT id FROM options WHERE id = ?').get(retired.id), undefined);
    assert.equal(db.prepare('SELECT comment FROM options WHERE id = 1000').get().comment, 'Keep custom');
    assert.equal(db.prepare('SELECT option_id FROM bundled_options WHERE source_id = ?').get(changed.id).option_id, changed.id);
  } finally { db.close(); }
});

test('updates replace bundled rows, restore deletions, retire removed entries and preserve local IDs and unrelated data', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await initialize(db);
    db.exec(`INSERT INTO options (id, comment, category, type, value, writes_json) VALUES (1000, 'Custom', 'items', 'word', '7', '[{"type":"word","value":"7"}]');
      CREATE TABLE saved_presets (json TEXT);
      INSERT INTO saved_presets VALUES ('{"optionIds":["option:1","option:1000"]}');
      CREATE TABLE export_records (json TEXT);
      INSERT INTO export_records VALUES ('saved export');
      CREATE TABLE settings (value TEXT);
      INSERT INTO settings VALUES ('local setting');
      DELETE FROM options WHERE id = 3;`);
    const local = db.prepare('SELECT * FROM options WHERE id = 1000').get();
    const editableId = db.prepare('SELECT id FROM options WHERE read_only = 0 AND id <> 1000 LIMIT 1').get().id;
    db.prepare("UPDATE options SET comment = 'Edited bundled option' WHERE id = ?").run(editableId);
    await initialize(db, update);
    assert.equal(db.prepare('SELECT comment FROM options WHERE id = 1').get().comment, 'Updated Bat');
    assert.deepEqual(JSON.parse(db.prepare('SELECT writes_json FROM options WHERE id = 1').get().writes_json), [{ type: 'word', value: '0x12345678' }]);
    assert.equal(db.prepare('SELECT id FROM options WHERE id = 2').get(), undefined);
    assert.ok(db.prepare('SELECT id FROM options WHERE id = 3').get());
    assert.notEqual(db.prepare('SELECT comment FROM options WHERE id = ?').get(editableId).comment, 'Edited bundled option');
    assert.deepEqual(db.prepare('SELECT * FROM options WHERE id = 1000').get(), local);
    const mappedId = db.prepare('SELECT option_id FROM bundled_options WHERE source_id = 1000').get().option_id;
    assert.ok(mappedId > 1000);
    assert.equal(db.prepare('SELECT comment FROM options WHERE id = ?').get(mappedId).comment, 'New bundled option');
    assert.equal(db.prepare('SELECT json FROM saved_presets').get().json, '{"optionIds":["option:1","option:1000"]}');
    assert.equal(db.prepare('SELECT json FROM export_records').get().json, 'saved export');
    assert.equal(db.prepare('SELECT value FROM settings').get().value, 'local setting');
    // Reintroducing a retired entry and updating a remapped entry keeps both IDs.
    await initialize(db, update.replace('DELETE FROM options WHERE id = 2;', ''));
    assert.ok(db.prepare('SELECT id FROM options WHERE id = 2').get());
    assert.equal(db.prepare('SELECT option_id FROM bundled_options WHERE source_id = 1000').get().option_id, mappedId);
    assert.deepEqual(db.prepare('SELECT * FROM options WHERE id = 1000').get(), local);
    assert.ok(Number(db.prepare("INSERT INTO options (comment, category, type, value) VALUES ('Another custom', 'items', 'word', '1')").run().lastInsertRowid) > mappedId);
  } finally { db.close(); }
});

test('unchanged snapshots do not reset edits or deletions after reopening the database', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'sotn-bundle-refresh-'));
  const file = path.join(directory, 'options.sqlite');
  let db = new DatabaseSync(file);
  try {
    await initialize(db);
    db.exec("UPDATE options SET comment = 'Local edit' WHERE id = 1; DELETE FROM options WHERE id = 2;");
    const before = state(db);
    db.close();
    db = new DatabaseSync(file);
    await initialize(db);
    assert.deepEqual(state(db), before);
    await initialize(db, `${dump}\n-- Next bundled catalog revision`);
    assert.notEqual(db.prepare('SELECT comment FROM options WHERE id = 1').get().comment, 'Local edit');
    assert.ok(db.prepare('SELECT id FROM options WHERE id = 2').get());
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('failed replacement rolls back deletions, inserts and the fingerprint and retries successfully', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await initialize(db);
    const before = state(db);
    db.exec(`CREATE TRIGGER reject_refresh BEFORE INSERT ON options WHEN NEW.id = 3
      BEGIN SELECT RAISE(ABORT, 'Simulated replacement failure'); END;`);
    await assert.rejects(initialize(db, update), /Simulated replacement failure/);
    assert.deepEqual(state(db), before);
    db.exec('DROP TRIGGER reject_refresh');
    await initialize(db, update);
    assert.notDeepEqual(state(db).fingerprint, before.fingerprint);
    assert.equal(db.prepare('SELECT comment FROM options WHERE id = 1').get().comment, 'Updated Bat');
    const refreshed = state(db);
    await assert.rejects(initialize(db, 'invalid SQL'));
    await assert.rejects(initialize(db, `${dump}\nCREATE TABLE private_data (value TEXT);`), /only the options table/);
    assert.deepEqual(state(db), refreshed);
  } finally { db.close(); }
});

test('an empty new snapshot removes only tracked bundled options and later restores their IDs', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await initialize(db);
    db.exec(`INSERT INTO options (id, comment, category, type, value, writes_json) VALUES (1000, 'Custom', 'items', 'word', '1', '[{"type":"word","value":"1"}]');`);
    const local = db.prepare('SELECT * FROM options WHERE id = 1000').get();
    await initialize(db, `${dump}\nDELETE FROM options;`);
    assert.deepEqual(rows(db), [local]);
    await initialize(db);
    assert.equal(db.prepare('SELECT option_id FROM bundled_options WHERE source_id = 1').get().option_id, 1);
    assert.deepEqual(db.prepare('SELECT * FROM options WHERE id = 1000').get(), local);
  } finally { db.close(); }
});
