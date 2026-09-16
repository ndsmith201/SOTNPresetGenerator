const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { buildPreviewPreset, createPresetFromTemplate, toPresetOptions } = require('../dist/renderer/preset-utils');
const { draftInput, optionDraft } = require('../dist/renderer/option-authoring');
const { mainBlockStart, writeLocations } = require('../dist/renderer/template-options');
const { initializeOptionsCatalog } = require('../dist/options-database');
const { optionSubmission } = require('../dist/community-options');
const template = require('../templates/preset-template.json');
const bundledMainBlockIds = [31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 46, 47, 58, 59, 62, 67, 73, 74, 76, 77];
const word = (value, extra = {}) => ({ type: 'word', value, ...extra });
const row = (id, writes, extra = {}) => ({ id, comment: `Patch ${id}`, description: '', category: 'world',
  mainBlock: true, itemInit: false, gameInit: false, statEdit: false, rawJson: false, readOnly: false, writes, ...extra });
function generate(source, options, selected = options.map(option => option.id)) {
  const preset = createPresetFromTemplate('Main block', source, options);
  preset.optionIds = selected;
  return buildPreviewPreset(template, preset, options, undefined, 0);
}

test('main block writes follow the complete return/nop pair while other placements stay before it', () => {
  const patches = [word('0x12345678', { address: '0x1000' }), word('0x87654321')];
  const options = toPresetOptions([
    row(1, patches), row(2, [word('0x11223344')]),
    row(3, [word('0x34020001')], { mainBlock: false, gameInit: true }),
    row(4, [word('0x34020002')], { mainBlock: false, itemInit: true }),
    row(5, [word('0xabcdef01', { address: '0x2000' })], { mainBlock: false })
  ]);
  const original = structuredClone(template);
  const output = generate(undefined, options);
  const start = mainBlockStart(output.writes);
  assert.deepEqual(output.writes.slice(start), [...patches, ...options[1].mainBlockWrites]);
  assert.equal(output.writes[start - 2].value, '0x0803924f');
  assert.equal(output.writes[start - 1].value, '0x00000000');
  assert.deepEqual(output.writes[start - 3], options[4].appendedWrites[0]);
  for (const field of ['injectedWrites', 'gameInitWrites', 'itemInitWrites', 'appendedWrites']) {
    assert.deepEqual(options[0][field], []);
  }
  assert.deepEqual(generate(output, options).writes, output.writes);
  assert.deepEqual(template, original);
});

test('numeric and uppercase anchors match and inherited main block writes can be deselected', () => {
  for (const jump of [0x0803924f, '0x0803924F']) {
    const patch = word('0x12345678');
    const source = { writes: [word(1, { address: '0x00158c98' }), patch, word(jump), word(0)] };
    const options = toPresetOptions([row(1, [patch])]);
    assert.deepEqual(createPresetFromTemplate('Main block', source, options).optionIds, []);
    const output = generate(source, options);
    assert.deepEqual(output.writes.slice(mainBlockStart(output.writes)), [patch]);
    assert.deepEqual(createPresetFromTemplate('Main block', output, options).optionIds, [options[0].id]);
    assert.deepEqual(generate(output, options).writes, output.writes);
    assert.deepEqual(generate(output, options, []).writes, source.writes);
  }
});

test('new main block writes preserve the target of an existing implicit trailing write', () => {
  const tail = word('0xaabbccdd');
  const source = { writes: [...structuredClone(template.writes), tail] };
  const originalAddress = writeLocations(source.writes).at(-1).address;
  for (const patch of [word('0x12345678'), word('0x12345678', { address: '0x1000' })]) {
    const options = toPresetOptions([row(1, [patch])]);
    const output = generate(source, options);
    assert.deepEqual(output.writes[mainBlockStart(output.writes)], patch);
    assert.equal(writeLocations(output.writes).at(-1).address, originalAddress);
    assert.deepEqual(generate(output, options).writes, output.writes);
  }
});

test('main block falls back to the end for imported templates without the anchor pair', () => {
  const source = { writes: [word('0x1234', { address: '0x1000' })] };
  const options = toPresetOptions([row(1, [word('0x5678', { address: '0x2000' })])]);
  const output = generate(source, options);
  assert.deepEqual(output.writes, [...source.writes, ...options[0].mainBlockWrites]);
  assert.deepEqual(generate(output, options).writes, output.writes);
});

test('copying and sharing preserve main block placement and JSON mode clears it', () => {
  const input = draftInput({ ...optionDraft(), comment: 'Patch', placement: 'main-block', writes: [word('0x12345678')] });
  const saved = row(1, input.writes, input);
  assert.equal(optionDraft(saved).placement, 'main-block');
  assert.equal(optionSubmission(saved).mainBlock, true);
  assert.equal(draftInput({ ...optionDraft(saved), rawJson: true, json: '{}' }).mainBlock, undefined);
  const conflicting = toPresetOptions([{ ...saved, gameInit: true, itemInit: true, statEdit: true }])[0];
  assert.deepEqual(conflicting.mainBlockWrites, input.writes);
  for (const field of ['injectedWrites', 'gameInitWrites', 'itemInitWrites', 'appendedWrites']) assert.deepEqual(conflicting[field], []);
});

test('existing and new databases persist main block options across catalog initialization', async () => {
  const schema = readFileSync('database/schema.sql', 'utf8');
  const dump = readFileSync('database/options-dump.sql', 'utf8');
  const legacyDump = `${dump}\nALTER TABLE options DROP COLUMN main_block;`;
  for (const installed of ['new', 'legacy', 'tracked']) {
    const db = new DatabaseSync(':memory:');
    try {
      if (installed === 'legacy') db.exec(legacyDump);
      if (installed === 'tracked') await initializeOptionsCatalog(db, schema, async () => legacyDump);
      await initializeOptionsCatalog(db, schema, async () => dump);
      db.prepare("INSERT INTO options (comment, category, type, value, main_block, writes_json) VALUES ('Main block patch', 'world', 'word', '0', 1, ?)")
        .run(JSON.stringify([word('0x12345678')]));
      await initializeOptionsCatalog(db, schema, async () => dump);
      assert.equal(db.prepare("SELECT main_block FROM options WHERE comment = 'Main block patch'").get().main_block, 1);
      assert.deepEqual(db.prepare('SELECT id FROM options WHERE read_only = 1 AND main_block = 1 ORDER BY id').all().map(option => option.id), bundledMainBlockIds);
    } finally { db.close(); }
  }
});

test('selected built-in options emit their original writes after the return and nop anchor', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await initializeOptionsCatalog(db, readFileSync('database/schema.sql', 'utf8'),
      async () => readFileSync('database/options-dump.sql', 'utf8'));
    const selected = db.prepare('SELECT * FROM options WHERE main_block = 1 ORDER BY id').all();
    assert.deepEqual(selected.map(option => option.id), bundledMainBlockIds);
    const options = toPresetOptions(selected.map(option => row(option.id, JSON.parse(option.writes_json), {
      comment: option.comment, category: option.category, mainBlock: Boolean(option.main_block),
      gameInit: Boolean(option.game_init), itemInit: Boolean(option.item_init), statEdit: Boolean(option.stat_edit)
    })));
    const output = generate(undefined, options);
    assert.deepEqual(output.writes.slice(mainBlockStart(output.writes)), selected.flatMap(option => JSON.parse(option.writes_json)));
  } finally { db.close(); }
});
