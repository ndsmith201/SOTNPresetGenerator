const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const { optionDraft, draftInput, normalizeWrites, parseWriteSource } = require('../dist/renderer/option-authoring');
const { toPresetOptions } = require('../dist/renderer/preset-utils');
const { initializeOptionsCatalog } = require('../dist/options-database');
const { optionSubmission } = require('../dist/community-service');

const base = { id: 1, readOnly: true, comment: 'Source', description: 'Original', category: 'gameplay', type: 'word', value: '0x34020063', address: null, gameInit: false, statEdit: true, rawJson: false, additionalWrites: [{ type: 'short', value: 0, address: '0x1234', comment: 'Independent note', custom: { keep: true } }] };
const stored = input => ({ id: 2, readOnly: false, address: null, gameInit: false, statEdit: false, rawJson: false, additionalWrites: [], ...input });

test('copy, reorder, save and reopen preserve per-write addresses, notes and extra fields', () => {
  const original = structuredClone(base);
  const draft = optionDraft(base);
  draft.comment = 'My copy';
  draft.writes.reverse();
  const input = draftInput(draft);
  assert.equal(input.address, '0x1234');
  assert.equal(input.primaryWrite.comment, 'Independent note');
  assert.equal(input.primaryWrite.value, 0);
  assert.deepEqual(input.primaryWrite.custom, { keep: true });
  assert.equal(input.additionalWrites[0].address, undefined);
  assert.equal(input.statEdit, true);
  assert.deepEqual(optionDraft(stored(input)).writes, draft.writes);
  assert.deepEqual(toPresetOptions([stored(input)])[0].injectedWrites, draft.writes);
  assert.deepEqual(base, original);
  assert.deepEqual(optionSubmission(stored(input)).primaryWrite, input.primaryWrite);
});

test('every bundled option survives opening and saving without changing its generated writes or settings', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(fs.readFileSync('database/options-dump.sql', 'utf8'));
    for (const row of db.prepare('SELECT * FROM options').all()) {
      const option = { ...base, id: row.id, comment: row.comment, description: row.description, category: row.category, type: row.type, value: row.value, address: row.address, gameInit: !!row.game_init, statEdit: !!row.stat_edit, rawJson: !!row.raw_json, additionalWrites: JSON.parse(row.additional_writes_json || '[]') };
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
  for (const field of ['address', 'primaryWrite', 'additionalWrites', 'gameInit', 'statEdit']) assert.equal(input[field], undefined);
  assert.throws(() => draftInput({ ...draft, rawJson: true, json: '[]' }), /must be an object/);
  assert.throws(() => draftInput({ ...draft, rawJson: true, json: '{' }), /valid JSON/);
});

test('older catalogs migrate primary-write storage without changing existing data and preserve it on later launches', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const dump = fs.readFileSync('database/options-dump.sql', 'utf8').replace(/^.*primary_write_json.*\r?\n/m, '');
    db.exec(dump);
    const before = db.prepare('SELECT comment, value, address, additional_writes_json FROM options').all();
    const schema = fs.readFileSync('database/schema.sql', 'utf8');
    await initializeOptionsCatalog(db, schema, async () => { throw new Error('Do not reload existing catalog'); });
    assert.deepEqual(db.prepare('SELECT comment, value, address, additional_writes_json FROM options').all(), before);
    assert.equal(db.prepare('SELECT primary_write_json FROM options LIMIT 1').get().primary_write_json, null);
    const write = { type: 'word', value: 12, address: '0x1000', comment: 'Row note', custom: true };
    db.prepare('UPDATE options SET primary_write_json = ? WHERE id = 1').run(JSON.stringify(write));
    await initializeOptionsCatalog(db, schema, async () => '');
    assert.deepEqual(JSON.parse(db.prepare('SELECT primary_write_json FROM options WHERE id = 1').get().primary_write_json), write);
  } finally { db.close(); }
});
