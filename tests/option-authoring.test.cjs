const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { optionDraft, draftInput, normalizeWrites, parseWriteSource, parseWriteImport } = require('../dist/renderer/option-authoring');
const { toPresetOptions } = require('../dist/renderer/preset-utils');
const { initializeOptionsCatalog } = require('../dist/options-database');
const { optionSubmission } = require('../dist/community-options');

const base = { id: 1, readOnly: true, comment: 'Source', description: 'Original', category: 'gameplay', type: 'word', value: '0x34020063', address: null, gameInit: false, statEdit: true, rawJson: false, additionalWrites: [{ type: 'short', value: 0, address: '0x1234', comment: 'Independent note', custom: { keep: true } }] };
const stored = input => ({ id: 2, readOnly: false, address: null, gameInit: false, statEdit: false, rawJson: false, additionalWrites: [], ...input });
const legacyCatalog = fs.readFileSync(path.join(__dirname, 'fixtures/legacy-options.sql'), 'utf8');

test('write imports accept arrays and pasted object lists with optional addresses and notes', () => {
  const writes = [
    { comment: 'Card Names Ptr. Faerie Card', type: 'word', address: '0xB57B8', value: '0x800DFFE0' },
    { type: 'word', value: '0x800E02B0' },
    { comment: 'Card Names Ptr. Demon Card', type: 'word', address: '0xB57C8', value: '0x800E0074' },
    { type: 'word', value: '0x800E0284' },
    { comment: 'Card Names Ptr. Sword Card', type: 'word', address: '0xB57D8', value: '0x800E003C' },
    { type: 'word', value: '0x800E0258' },
    { comment: 'Card Names Ptr. Nosedevil Card', type: 'word', address: '0xB57F8', value: '0x800E00D4' },
    { type: 'word', value: '0x800E01FC' },
    { comment: 'Shorten Dark Metamorphosis', type: 'char', address: '0xF540A', value: '0x00' }
  ];
  const array = JSON.stringify(writes, null, 2);
  const objects = array.trim().slice(1, -1);
  for (const source of [array, objects, objects.replace(/^ +/gm, spaces => '\u00a0'.repeat(spaces.length))]) {
    const imported = parseWriteImport(source);
    assert.deepEqual(imported, writes);
    const input = draftInput({ ...optionDraft(), comment: 'Imported patch', writes: imported });
    assert.deepEqual(input.writes, writes);
  }
});

test('write imports preserve string whitespace and extra properties while normalizing fields', () => {
  const write = { comment: 'Note "quoted"\u00a0text', type: 'word', address: 4096, value: 0, custom: { keep: true } };
  const source = JSON.stringify(write, null, 2).replace(/^ +/gm, spaces => '\u202f'.repeat(spaces.length));
  assert.deepEqual(parseWriteImport(source), [{ ...write, address: '0x1000' }]);
});

test('invalid write imports report JSON and row errors before updating the draft', () => {
  for (const source of ['', '[]', 'null', '[1]', '[[]]']) {
    assert.throws(() => parseWriteImport(source), /write object/);
  }
  assert.throws(() => parseWriteImport('{"type":'), /Enter valid JSON/);
  assert.throws(() => parseWriteImport('{"type":"invalid","value":0}'), /Write 1: choose a valid type/);
  assert.throws(() => parseWriteImport('{"type":"word","value":""}'), /Write 1: enter a value/);
  assert.throws(() => parseWriteImport('{"type":"word","value":0}, {"type":"char","value":0,"address":"invalid"}'), /Write 2: address/);
});

test('copy, reorder, save and reopen preserve per-write addresses, notes and extra fields', () => {
  const original = structuredClone(base);
  const draft = optionDraft(base);
  draft.comment = 'My copy';
  draft.writes.reverse();
  const input = draftInput(draft);
  assert.equal(input.writes[0].address, '0x1234');
  assert.equal(input.writes[0].comment, 'Independent note');
  assert.equal(input.writes[0].value, 0);
  assert.deepEqual(input.writes[0].custom, { keep: true });
  assert.equal(input.writes[1].address, undefined);
  assert.equal(input.statEdit, true);
  assert.deepEqual(optionDraft(stored(input)).writes, draft.writes);
  assert.deepEqual(toPresetOptions([stored(input)])[0].injectedWrites, draft.writes);
  assert.deepEqual(base, original);
  const published = optionSubmission(stored(input));
  for (const field of ['type', 'value', 'address', 'primaryWrite', 'additionalWrites']) assert.equal(Object.hasOwn(published, field), false);
  assert.deepEqual(published.writes, draft.writes);
  assert.deepEqual(optionDraft(stored(published)).writes, draft.writes);
  assert.deepEqual(optionDraft(stored(input)).writes, draft.writes);
});

test('every bundled option survives opening and saving without changing its generated writes or settings', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(fs.readFileSync('database/options-dump.sql', 'utf8'));
    for (const row of db.prepare('SELECT * FROM options').all()) {
      const option = { ...base, id: row.id, comment: row.comment, description: row.description, category: row.category, type: row.type, value: row.value, address: row.address, gameInit: !!row.game_init, statEdit: !!row.stat_edit, rawJson: !!row.raw_json, additionalWrites: JSON.parse(row.additional_writes_json || '[]'), primaryWrite: JSON.parse(row.primary_write_json || 'null'), ...(row.writes_json ? { writes: JSON.parse(row.writes_json) } : {}) };
      const input = draftInput(optionDraft(option));
      const before = toPresetOptions([option])[0];
      const after = toPresetOptions([stored(input)])[0];
      for (const field of ['injectedWrites', 'gameInitWrites', 'appendedWrites', 'previewJson']) assert.deepEqual(after[field], before[field], `${row.comment}: ${field}`);
    }
  } finally { db.close(); }
});

test('clearing an address omits it and invalid addresses identify the offending row', () => {
  assert.deepEqual(normalizeWrites([{ type: 'word', value: '0', address: '' }]), [{ type: 'word', value: '0' }]);
  assert.equal(normalizeWrites([{ type: 'word', value: '0', address: 4096 }])[0].address, '0x1000');
  assert.throws(() => normalizeWrites([{ type: 'word', value: '0' }, { type: 'short', value: '1', address: 'xyz' }]), /Write 2: address/);
  assert.throws(() => normalizeWrites([{ type: 'word', value: '' }]), /Write 1: enter a value/);
  assert.throws(() => normalizeWrites([]), /at least one/);
  assert.throws(() => parseWriteSource('[null]'), /write object/);
});

test('placement choices are exclusive and JSON mode excludes write-specific fields', () => {
  const draft = optionDraft(base);
  for (const placement of ['default', 'game-init', 'after-relics']) {
    const input = draftInput({ ...draft, placement });
    assert.equal(!!input.gameInit, placement === 'game-init');
    assert.equal(!!input.statEdit, placement === 'after-relics');
  }
  const input = draftInput({ ...draft, rawJson: true, json: '{"enemyDrops":true}' });
  assert.equal(input.rawJson, true);
  assert.deepEqual(input.writes, []);
  for (const field of ['address', 'primaryWrite', 'additionalWrites', 'gameInit', 'statEdit']) assert.equal(input[field], undefined);
  assert.throws(() => draftInput({ ...draft, rawJson: true, json: '[]' }), /must be an object/);
  assert.throws(() => draftInput({ ...draft, rawJson: true, json: '{' }), /valid JSON/);
});

test('older catalogs migrate all writes without changing existing data and preserve the array on later launches', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(legacyCatalog);
    // Model the older version that predates both first-write metadata and writes_json.
    db.exec('ALTER TABLE options DROP COLUMN primary_write_json');
    assert.equal(db.prepare('PRAGMA table_info(options)').all().some(column => column.name === 'primary_write_json'), false);
    assert.equal(db.prepare('PRAGMA table_info(options)').all().some(column => column.name === 'writes_json'), false);
    const before = db.prepare('SELECT comment, value, address, additional_writes_json FROM options').all();
    const schema = fs.readFileSync('database/schema.sql', 'utf8');
    await initializeOptionsCatalog(db, schema, async () => { throw new Error('Do not reload existing catalog'); });
    assert.deepEqual(db.prepare('SELECT comment, value, address, additional_writes_json FROM options').all(), before);
    assert.equal(db.prepare('SELECT primary_write_json FROM options LIMIT 1').get().primary_write_json, null);
    const migrated = JSON.parse(db.prepare('SELECT writes_json FROM options WHERE id = 1').get().writes_json);
    assert.equal(migrated[0].value, before[0].value);
    const write = { type: 'word', value: 12, address: '0x1000', comment: 'Row note', custom: true };
    db.prepare('UPDATE options SET writes_json = ? WHERE id = 1').run(JSON.stringify([write, ...migrated]));
    await initializeOptionsCatalog(db, schema, async () => '');
    assert.deepEqual(JSON.parse(db.prepare('SELECT writes_json FROM options WHERE id = 1').get().writes_json), [write, ...migrated]);
  } finally { db.close(); }
});

for (const existingWritesColumn of [false, true]) test(`migration retains independent first-write properties and unified arrays across restarts (${existingWritesColumn ? 'null' : 'missing'} writes_json)`, async () => {
  const db = new DatabaseSync(':memory:');
  const restored = new DatabaseSync(':memory:');
  try {
    db.exec(legacyCatalog);
    if (existingWritesColumn) {
      db.exec('ALTER TABLE options ADD COLUMN writes_json TEXT');
      assert.equal(db.prepare('SELECT writes_json FROM options WHERE id = 1').get().writes_json, null);
    } else {
      assert.equal(db.prepare('PRAGMA table_info(options)').all().some(column => column.name === 'writes_json'), false);
    }
    const primary = { type: 'word', value: 0, comment: 'Independent first note', extra: { keep: true } };
    const next = { type: 'short', value: '1', address: '0x1234', comment: 'Next note' };
    db.prepare('UPDATE options SET primary_write_json = ?, additional_writes_json = ? WHERE id = 1').run(JSON.stringify(primary), JSON.stringify([next]));
    const schema = fs.readFileSync('database/schema.sql', 'utf8');
    await initializeOptionsCatalog(db, schema, async () => { throw new Error('No snapshot reload'); });
    const writes = JSON.parse(db.prepare('SELECT writes_json FROM options WHERE id = 1').get().writes_json);
    assert.deepEqual(writes, [primary, next]);
    const option = { ...base, writes };
    assert.deepEqual(optionSubmission(option).writes, [primary, next]);
    assert.deepEqual(toPresetOptions([option])[0].injectedWrites, [primary, next]);
    await initializeOptionsCatalog(restored, schema, async () => legacyCatalog);
    restored.prepare('UPDATE options SET writes_json = ? WHERE id = 1').run(JSON.stringify(writes));
    await initializeOptionsCatalog(restored, schema, async () => { throw new Error('No reload'); });
    assert.deepEqual(JSON.parse(restored.prepare('SELECT writes_json FROM options WHERE id = 1').get().writes_json), [primary, next]);
  } finally { db.close(); restored.close(); }
});
