const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, mkdir, writeFile, readFile, readdir, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { BuiltPresetStore, generatePatch, normalizeSeedName } = require('../dist/preset-generation');
const { exportMatchesCurrent } = require('../dist/renderer/export-state');
const { TopBar } = require('../dist/renderer/components/TopBar');
const { sortPresetOptions } = require('../dist/renderer/option-catalog');
const { buildPreviewPreset, createPresetFromTemplate, loadPresets, persistPresets, toPresetOptions } = require('../dist/renderer/preset-utils');

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sotn-generation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'presets'));
  await mkdir(path.join(root, 'build', 'presets'), { recursive: true });
  await writeFile(path.join(root, 'presets', 'test.json'), '{"metadata":{"id":"test"}}');
  await writeFile(path.join(root, 'build', 'presets', 'test.js'), 'module.exports = {};');
  return root;
}

async function persistentFixture(t) {
  const root = await fixture(t);
  let database;
  return {
    root,
    restart() {
      database?.close();
      database = new DatabaseSync(path.join(root, 'options.sqlite'));
      return new BuiltPresetStore(database);
    },
    close() { database?.close(); }
  };
}

test('a successful export and its generation token survive closing and reopening the database', async (t) => {
  const fixture = await persistentFixture(t);
  try {
    const snapshot = { localPresetId: 'saved-draft', json: await readFile(path.join(fixture.root, 'presets/test.json'), 'utf8') };
    const before = fixture.restart();
    assert.deepEqual(await before.listSuccessfulExports(), {});
    const token = await before.remember(fixture.root, 'test', snapshot);
    const after = fixture.restart();
    const exports = await after.listSuccessfulExports();
    const restored = exports[JSON.stringify([fixture.root, 'test'])];
    assert.deepEqual(restored, { ...snapshot, directory: fixture.root, buildToken: token });
    assert.equal(exportMatchesCurrent(restored, snapshot.localPresetId, fixture.root, snapshot.json), true);
    assert.equal(exportMatchesCurrent(restored, snapshot.localPresetId, fixture.root, '{"music":true}'), false);
    assert.equal(exportMatchesCurrent(restored, snapshot.localPresetId, 'another directory', snapshot.json), false);
    assert.equal((await after.resolve(token)).presetId, 'test');
  } finally { fixture.close(); }
});

test('exporting after an option save stays current across catalog, draft, and database restart', async (t) => {
  const fixture = await persistentFixture(t);
  const storage = new Map();
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value)
  } });
  try {
    const rows = [
      { id: 1, comment: 'Z gameplay patch', category: 'gameplay', writes: [{ type: 'word', address: '0x1000', value: '0x01' }] },
      { id: 2, comment: 'A world patch', category: 'world', writes: [{ type: 'word', address: '0x2000', value: '0x02' }] }
    ];
    const savedOption = toPresetOptions([rows[1]])[0];
    const afterSave = sortPresetOptions([...toPresetOptions([rows[0]]), savedOption]);
    const template = { writes: [{ type: 'word', address: '0x00158c98', value: '0x37f70000' },
      { type: 'word', value: '0x36ff0000' }, { type: 'word', value: '0x0803924f' }, { type: 'word', value: '0x00000000' }] };
    const draft = createPresetFromTemplate('Test');
    draft.optionIds = afterSave.map(option => option.id);
    const json = JSON.stringify(buildPreviewPreset(template, draft, afterSave));
    // The previous name-only save order generated a different write sequence.
    assert.notEqual(json, JSON.stringify(buildPreviewPreset(template, draft, [...afterSave].sort((a, b) => a.label.localeCompare(b.label)))));
    persistPresets([draft]);
    await writeFile(path.join(fixture.root, 'presets/test.json'), json);
    const token = await fixture.restart().remember(fixture.root, 'test', { localPresetId: draft.id, json });

    const restartedOptions = sortPresetOptions(toPresetOptions([...rows].reverse()));
    const [restoredDraft] = loadPresets(new Set(restartedOptions.map(option => option.id)));
    const restartedStore = fixture.restart();
    const exported = (await restartedStore.listSuccessfulExports())[JSON.stringify([fixture.root, 'test'])];
    const current = JSON.stringify(buildPreviewPreset(template, restoredDraft, restartedOptions));
    assert.equal(exportMatchesCurrent(exported, restoredDraft.id, fixture.root, current), true);
    assert.equal((await restartedStore.resolve(token)).presetId, 'test');

    const edited = sortPresetOptions(toPresetOptions([rows[0], { ...rows[1], writes: [{ type: 'word', address: '0x2000', value: '0x03' }] }]));
    assert.equal(exportMatchesCurrent(exported, restoredDraft.id, fixture.root, JSON.stringify(buildPreviewPreset(template, restoredDraft, edited))), false);
    restoredDraft.optionIds = [afterSave[0].id];
    persistPresets([restoredDraft]);
    const [changedDraft] = loadPresets();
    const afterAnotherRestart = (await fixture.restart().listSuccessfulExports())[JSON.stringify([fixture.root, 'test'])];
    assert.equal(exportMatchesCurrent(afterAnotherRestart, changedDraft.id, fixture.root, JSON.stringify(buildPreviewPreset(template, changedDraft, restartedOptions))), false);
  } finally {
    fixture.close();
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  }
});

test('catalog ordering is deterministic for renamed options and duplicate names', () => {
  const rows = toPresetOptions([
    { id: 3, comment: 'same', category: 'world', writes: [] },
    { id: 2, comment: 'same', category: 'world', writes: [] },
    { id: 1, comment: 'Z', category: 'gameplay', writes: [] }
  ]);
  const original = structuredClone(rows);
  assert.deepEqual(sortPresetOptions(rows).map(option => option.source.id), [1, 2, 3]);
  assert.deepEqual(rows, original);
  assert.deepEqual(sortPresetOptions([rows[0], { ...rows[1], label: 'z' }, rows[2]]).map(option => option.source.id), [1, 3, 2]);
});

test('a failed re-export stays invalid after restart even when the previous files remain', async (t) => {
  const fixture = await persistentFixture(t);
  try {
    const store = fixture.restart();
    const token = await store.remember(fixture.root, 'test', { localPresetId: 'draft', json: '{}' });
    store.forget(fixture.root, 'test');
    const restarted = fixture.restart();
    assert.deepEqual(await restarted.listSuccessfulExports(), {});
    await assert.rejects(restarted.resolve(token), /Export and build/);
  } finally { fixture.close(); }
});

test('a re-export of the same filename persists only the latest draft and token', async (t) => {
  const fixture = await persistentFixture(t);
  try {
    const store = fixture.restart();
    const old = await store.remember(fixture.root, 'test', { localPresetId: 'draft-a', json: '{}' });
    const latest = await store.remember(fixture.root, 'test', { localPresetId: 'draft-b', json: '{}' });
    const restarted = fixture.restart();
    const exports = Object.values(await restarted.listSuccessfulExports());
    assert.equal(exports.length, 1);
    assert.equal(exports[0].localPresetId, 'draft-b');
    assert.equal(exports[0].buildToken, latest);
    await assert.rejects(restarted.resolve(old), /Export and build/);
  } finally { fixture.close(); }
});

for (const changedFile of ['presets/test.json', 'build/presets/test.js']) {
  for (const change of ['modified', 'deleted']) {
    test(`startup discards persisted status if ${changedFile} was ${change} while closed`, async (t) => {
      const fixture = await persistentFixture(t);
      try {
        const store = fixture.restart();
        const token = await store.remember(fixture.root, 'test', { localPresetId: 'draft', json: '{}' });
        const file = path.join(fixture.root, changedFile);
        if (change === 'modified') await writeFile(file, 'external edit');
        else await rm(file);
        const restarted = fixture.restart();
        assert.deepEqual(await restarted.listSuccessfulExports(), {});
        // Invalid records are also removed from disk, rather than reappearing on the next launch.
        await assert.rejects(fixture.restart().resolve(token), /Export and build/);
      } finally { fixture.close(); }
    });
  }
}

test('Generate requires a successful export of this draft, JSON, and directory', () => {
  const exported = { localPresetId: 'draft-a', directory: 'rando', json: '{"music":true}', buildToken: 'built' };
  assert.equal(exportMatchesCurrent(undefined, 'draft-a', 'rando', exported.json), false);
  assert.equal(exportMatchesCurrent(exported, 'draft-a', 'rando', exported.json), true);
  assert.equal(exportMatchesCurrent(exported, 'draft-b', 'rando', exported.json), false);
  assert.equal(exportMatchesCurrent(exported, 'draft-a', 'other-rando', exported.json), false);
  assert.equal(exportMatchesCurrent(exported, 'draft-a', 'rando', '{"music":false}'), false);
});

test('the presets page toolbar shows New preset without a preset count', () => {
  for (const presetCount of [0, 7]) {
    const markup = renderToStaticMarkup(React.createElement(TopBar, {
      editing: false, presetCount, exporting: false, generating: false, canGenerate: false
    }));
    const buttons = [...markup.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)]
      .map((match) => match[1].replace(/<[^>]*>/g, '').trim());
    assert.deepEqual(buttons, ['New preset']);
    assert.doesNotMatch(markup.replace(/<[^>]*>/g, ''), /\d+\s*presets/);
  }
});

test('Generate sits immediately after Export with a disabled hover/focus tooltip until built', () => {
  const props = { editing: true, exporting: false, generating: false, canGenerate: false };
  const markup = renderToStaticMarkup(React.createElement(TopBar, props));
  assert(markup.indexOf('Export</button>') < markup.indexOf('Generate</button>'));
  assert(markup.indexOf('Generate</button>') < markup.indexOf('Save preset</button>'));
  assert.match(markup, /disabled=""[^>]*>.*?Generate<\/button>/);
  assert.match(markup, /class="generate-action" tabindex="0" aria-describedby=/);
  assert.match(markup, /role="tooltip"[^>]*>Export and build the preset first\./);
  const enabled = renderToStaticMarkup(React.createElement(TopBar, { ...props, canGenerate: true }));
  assert.doesNotMatch(enabled, /disabled=""|role="tooltip"/);
  const busy = renderToStaticMarkup(React.createElement(TopBar, { ...props, canGenerate: true, exporting: true }));
  assert.match(busy, /disabled=""[^>]*>.*?Generate<\/button>/);
  const generating = renderToStaticMarkup(React.createElement(TopBar, { ...props, canGenerate: true, generating: true }));
  assert.match(generating, /Generating…<\/button>/);
});

test('generation rejects unknown tokens and missing compiled presets', async (t) => {
  const root = await fixture(t);
  const store = new BuiltPresetStore();
  await assert.rejects(store.resolve('not-exported'), /Export and build/);
  await rm(path.join(root, 'build', 'presets', 'test.js'));
  await assert.rejects(store.remember(root, 'test'), /ENOENT/);
});

test('re-export invalidates the earlier build and a failed rebuild cannot reuse it', async (t) => {
  const root = await fixture(t);
  const store = new BuiltPresetStore();
  const first = await store.remember(root, 'test');
  assert.equal((await store.resolve(first)).presetId, 'test');
  const second = await store.remember(root, 'test');
  await assert.rejects(store.resolve(first), /Export and build/);
  store.forget(root, 'test');
  await assert.rejects(store.resolve(second), /Export and build/);
});

for (const modifiedFile of ['presets/test.json', 'build/presets/test.js']) {
  test(`generation requires another export when ${modifiedFile} changes externally`, async (t) => {
    const root = await fixture(t);
    const store = new BuiltPresetStore();
    const token = await store.remember(root, 'test');
    await writeFile(path.join(root, modifiedFile), 'changed externally');
    await assert.rejects(store.resolve(token), /has changed/);
  });
}

for (const seedName of [undefined, '', '   ', '  Weekend challenge  ', '--out=another.ppf', '"Night" & castle 雪', '0']) {
test(`generation passes the exported preset and optional seed ${JSON.stringify(seedName)} to the CLI`, async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'randomize'), `
    const fs = require('node:fs');
    const assert = require('node:assert/strict');
    assert.equal(process.env.ELECTRON_RUN_AS_NODE, '1');
    assert.equal(process.defaultApp, true);
    assert.equal(process.argv[2], '--preset-file');
    assert.equal(JSON.parse(fs.readFileSync(process.argv[3])).metadata.id, 'test');
    assert.equal(process.argv[4], '--out');
    assert.deepEqual(process.argv.slice(6), ${JSON.stringify(seedName?.trim() ? [`--seed=${seedName.trim()}`] : [])});
    fs.writeFileSync(process.argv[5], 'PPF30-test-patch');
  `);
  const store = new BuiltPresetStore();
  const build = await store.resolve(await store.remember(root, 'test'));
  const output = path.join(root, 'chosen output.ppf');
  await generatePatch(build, process.execPath, output, seedName);
  assert.equal(await readFile(output, 'utf8'), 'PPF30-test-patch');
  assert.equal((await readdir(root)).some(name => name.startsWith('.sotn-generate-')), false);
  await assert.rejects(generatePatch(build, process.execPath, path.join(root, 'wrong.bin')), /\.ppf output/);
});
}

test('invalid seed names are rejected at the generation boundary', () => {
  for (const value of [null, 123, {}, ['seed'], 'seed\0name']) {
    assert.throws(() => normalizeSeedName(value), /valid seed name/);
  }
});

test('a failing randomizer preserves an existing output and removes its partial patch', async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'randomize'), `
    require('node:fs').writeFileSync(process.argv[5], 'partial patch');
    process.exit(1);
  `);
  const store = new BuiltPresetStore();
  const build = await store.resolve(await store.remember(root, 'test'));
  const output = path.join(root, 'existing.ppf');
  await writeFile(output, 'existing patch');
  await assert.rejects(generatePatch(build, process.execPath, output));
  assert.equal(await readFile(output, 'utf8'), 'existing patch');
  assert.equal((await readdir(root)).some(name => name.startsWith('.sotn-generate-')), false);
});
