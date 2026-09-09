const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, mkdir, writeFile, readFile, readdir, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { BuiltPresetStore, generatePatch } = require('../dist/preset-generation');
const { exportMatchesCurrent } = require('../dist/renderer/export-state');
const { TopBar } = require('../dist/renderer/components/TopBar');

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

test('Generate sits immediately after Export with a disabled hover/focus tooltip until built', () => {
  const props = { editing: true, presetCount: 1, exporting: false, generating: false, canGenerate: false };
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

test('generation passes the exported preset to the CLI and writes the chosen patch', async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'randomize'), `
    const fs = require('node:fs');
    const assert = require('node:assert/strict');
    assert.equal(process.env.ELECTRON_RUN_AS_NODE, '1');
    assert.equal(process.defaultApp, true);
    assert.equal(process.argv[2], '--preset-file');
    assert.equal(JSON.parse(fs.readFileSync(process.argv[3])).metadata.id, 'test');
    assert.equal(process.argv[4], '--out');
    fs.writeFileSync(process.argv[5], 'PPF30-test-patch');
  `);
  const store = new BuiltPresetStore();
  const build = await store.resolve(await store.remember(root, 'test'));
  const output = path.join(root, 'chosen output.ppf');
  await generatePatch(build, process.execPath, output);
  assert.equal(await readFile(output, 'utf8'), 'PPF30-test-patch');
  assert.equal((await readdir(root)).some(name => name.startsWith('.sotn-generate-')), false);
  await assert.rejects(generatePatch(build, process.execPath, path.join(root, 'wrong.bin')), /\.ppf output/);
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
