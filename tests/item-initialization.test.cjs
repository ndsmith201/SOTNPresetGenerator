const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { buildPreviewPreset, createPresetFromTemplate, toPresetOptions } = require('../dist/renderer/preset-utils');
const { draftInput, optionDraft } = require('../dist/renderer/option-authoring');
const { itemInitializationRange } = require('../dist/renderer/item-initialization');
const { writeLocations } = require('../dist/renderer/template-options');
const { initializeOptionsCatalog } = require('../dist/options-database');
const { optionSubmission } = require('../dist/community-options');
const template = require('../templates/preset-template.json');
const schema = readFileSync('database/schema.sql', 'utf8');
const dump = readFileSync('database/options-dump.sql', 'utf8');
const row = (id, writes, extra = {}) => ({ id, comment: `Item ${id}`, category: 'items', itemInit: true, gameInit: false, statEdit: false, rawJson: false, readOnly: false, writes, ...extra });
const word = (value, extra = {}) => ({ type: 'word', value, ...extra });
const items = [word('0x34040001', { comment: 'Item parameter' }), word('0x0c012345', { comment: 'Initialize item' }), word('0x00000000', { comment: 'Call delay slot' })];
function generate(source, catalog, selected = catalog.map(option => option.id)) {
  const draft = createPresetFromTemplate('Items', source, catalog);
  draft.optionIds = selected;
  return buildPreviewPreset(template, draft, catalog, undefined, 0);
}

test('item initialization stays between save and recall while other placements precede the old return/nop', () => {
  const catalog = toPresetOptions([
    row(1, items), row(2, [word('0x34040002')]),
    row(3, [word('0x34020001')], { itemInit: false, gameInit: true }),
    row(4, [word('0x12345678', { address: '0x1000' })], { itemInit: false })
  ]);
  const original = structuredClone(template);
  const output = generate(undefined, catalog);
  const range = itemInitializationRange(output.writes);
  assert.deepEqual(output.writes.slice(range.start + 1, range.end), [...items, ...catalog[1].itemInitWrites]);
  assert.deepEqual(catalog[0].injectedWrites, []);
  assert.deepEqual(catalog[0].gameInitWrites, []);
  assert.deepEqual(catalog[0].appendedWrites, []);
  assert.equal(output.writes.at(-2).value, '0x0803924f');
  assert.equal(output.writes.at(-1).comment, 'nop');
  assert.deepEqual(output.writes.at(-3), catalog[3].appendedWrites[0]);
  const locations = writeLocations(output.writes);
  assert.equal(locations[range.start].address, 0x158c98);
  assert.equal(locations[range.end].address, 0x158cac);
  assert.equal(locations[range.end + 1].address, 0x158cb0);
  assert.deepEqual(generate(output, catalog).writes, output.writes);
  assert.deepEqual(template, original);
});

test('older presets gain one item anchor pair automatically and retain it when reopened', () => {
  const range = itemInitializationRange(template.writes);
  const source = { writes: template.writes.filter((_, index) => index !== range.start && index !== range.end).map(write => ({ ...write })) };
  source.writes[1].address = '0x00158c98';
  const original = structuredClone(source);
  const catalog = toPresetOptions([row(1, items)]);
  const output = generate(source, catalog);
  const added = itemInitializationRange(output.writes);
  assert.deepEqual(output.writes.slice(added.start + 1, added.end), items);
  assert.equal(output.writes.filter(write => Number(write.value) === 0x37f70000).length, 1);
  assert.equal(output.writes.filter(write => Number(write.value) === 0x36ff0000).length, 1);
  assert.equal(writeLocations(output.writes)[added.end + 1].address, 0x158cac);
  assert.deepEqual(generate(output, catalog).writes, output.writes);
  assert.deepEqual(generate(source, catalog, []).writes, source.writes);
  assert.deepEqual(source, original);
});

test('numeric and commentless anchors work and item matching is restricted to their section', () => {
  const source = { writes: [word(0x37f70000, { address: '0x00158c98' }), word(0x36ff0000), ...items, word(0x0803924f), word(0)] };
  const catalog = toPresetOptions([row(1, items)]);
  const draft = createPresetFromTemplate('Items', source, catalog);
  assert.deepEqual(draft.optionIds, []);
  const output = generate(source, catalog);
  assert.deepEqual(output.writes.slice(1, 4), items);
  assert.equal(output.writes[4].value, 0x36ff0000);
  assert.deepEqual(generate(output, catalog).writes, output.writes);
});

test('addressed item writes restore the recall cursor and cannot reset startup over the item routine', () => {
  const source = structuredClone(template);
  const range = itemInitializationRange(source.writes);
  source.writes[range.end + 1].address = '0x00158c98';
  const catalog = toPresetOptions([row(1, [items[0], word('0x12', { address: '0x1000' })])]);
  const output = generate(source, catalog);
  const added = itemInitializationRange(output.writes);
  assert.equal(output.writes[added.end].address, '0x00158ca0');
  assert.equal(writeLocations(output.writes)[added.end + 1].address, 0x158ca4);
  assert.deepEqual(generate(output, catalog).writes, output.writes);
});

test('copying, sharing and deselecting an inherited item option preserve its placement', () => {
  const input = draftInput({ ...optionDraft(), comment: 'Item init', placement: 'item-init', writes: items });
  const saved = row(1, items, input);
  assert.equal(optionDraft(saved).placement, 'item-init');
  assert.equal(optionSubmission(saved).itemInit, true);
  const catalog = toPresetOptions([saved]);
  const output = generate(undefined, catalog);
  const reopened = createPresetFromTemplate('Items', output, catalog);
  assert.deepEqual(reopened.optionIds, [catalog[0].id]);
  const without = generate(output, catalog, []);
  const range = itemInitializationRange(without.writes);
  assert(without.writes.slice(range.start + 1, range.end).every(write => write.value === '0x00000000'));
  assert.equal(without.writes.at(-2).value, '0x0803924f');
});

test('existing and newly installed databases persist the item-init flag through subsequent initialization', async () => {
  for (const installed of [false, true]) {
    const db = new DatabaseSync(':memory:');
    try {
      if (installed) db.exec(dump);
      await initializeOptionsCatalog(db, schema, async () => dump);
      assert.equal(db.prepare('SELECT count(*) AS count FROM options WHERE item_init <> 0').get().count, 0);
      db.prepare("INSERT INTO options (comment, category, type, value, writes_json, item_init) VALUES ('Item init', 'items', 'word', '0', ?, 1)").run(JSON.stringify(items));
      await initializeOptionsCatalog(db, schema, async () => { throw new Error('Do not reload snapshot'); });
      const stored = db.prepare("SELECT item_init, writes_json FROM options WHERE comment = 'Item init'").get();
      assert.equal(stored.item_init, 1);
      assert.deepEqual(JSON.parse(stored.writes_json), items);
    } finally { db.close(); }
  }
});
