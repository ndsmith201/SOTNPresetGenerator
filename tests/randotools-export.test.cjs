const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, mkdir, writeFile, readFile, rm, stat } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { exportRandoToolsPreset } = require('../dist/randotools-export');

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'randotools-export-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
const noReplacement = async () => { throw new Error('Unexpected overwrite prompt'); };
const json = '{"metadata":{"id":"my-preset"}}\n';

test('an unset, missing, or file-valued RandoTools path skips copying without creating an installation', async t => {
  const root = await fixture(t);
  const missing = path.join(root, 'missing', 'SotnRandoTools');
  const file = path.join(root, 'file');
  await writeFile(file, 'keep');
  for (const directory of [undefined, '', ' ', missing, file]) {
    assert.deepEqual(await exportRandoToolsPreset(directory, 'my-preset', json, noReplacement), { status: 'skipped' });
  }
  await assert.rejects(stat(path.join(root, 'missing')), { code: 'ENOENT' });
  assert.equal(await readFile(file, 'utf8'), 'keep');
});

test('copies the exact JSON into presets and can create that child folder in an existing installation', async t => {
  const root = await fixture(t);
  const result = await exportRandoToolsPreset(root, 'my-preset', json, noReplacement);
  assert.deepEqual(result, { status: 'exported', path: path.join(root, 'presets', 'my-preset.json') });
  assert.equal(await readFile(result.path, 'utf8'), json);
});

test('existing presets are preserved on cancel and replaced only after confirmation', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'presets'));
  const target = path.join(root, 'presets', 'my-preset.json');
  await writeFile(target, 'original');
  assert.deepEqual(await exportRandoToolsPreset(root, 'my-preset', json, async file => {
    assert.equal(file, target);
    return false;
  }), { status: 'canceled' });
  assert.equal(await readFile(target, 'utf8'), 'original');
  assert.equal((await exportRandoToolsPreset(root, 'my-preset', json, async () => true)).status, 'exported');
  assert.equal(await readFile(target, 'utf8'), json);
});

test('an installation removed after selection is not recreated', async t => {
  const root = await fixture(t);
  await rm(root, { recursive: true });
  assert.deepEqual(await exportRandoToolsPreset(root, 'my-preset', json, noReplacement), { status: 'skipped' });
  await assert.rejects(stat(root), { code: 'ENOENT' });
});

test('rejects filenames outside presets and reports a conflicting directory', async t => {
  const root = await fixture(t);
  await assert.rejects(exportRandoToolsPreset(root, '../escape', json, noReplacement), /filename is invalid/);
  await mkdir(path.join(root, 'presets', 'my-preset.json'), { recursive: true });
  await assert.rejects(exportRandoToolsPreset(root, 'my-preset', json, noReplacement), /directory already uses/);
});
