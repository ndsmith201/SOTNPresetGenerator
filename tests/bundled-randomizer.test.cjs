const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, mkdir, readFile, writeFile, readdir, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { initializeBundledRandomizer, randomizerInstallPath } = require('../dist/bundled-randomizer.js');

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sotn-bundle-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'resources', 'sotnrando');
  await mkdir(path.join(source, 'tools'), { recursive: true });
  await mkdir(path.join(source, 'presets'));
  await writeFile(path.join(source, 'package.json'), '{"presets":["sample"]}');
  await writeFile(path.join(source, 'tools', 'build-presets'), '// bundled build tool');
  await writeFile(path.join(source, 'presets', 'sample.json'), '{}');
  return { root, source, destination: path.join(root, 'sotnrando') };
}

test('Squirrel upgrades use the same writable randomizer directory', () => {
  const root = path.resolve('install', 'SOTNPresetGenerator');
  for (const version of ['0.1.2', '0.2.0-beta.1']) {
    assert.equal(randomizerInstallPath(path.join(root, `app-${version}`, 'SOTNPresetGenerator.exe'), true), path.join(root, 'sotnrando'));
  }
});

test('portable installs resolve the randomizer next to the current executable', () => {
  for (const root of [path.resolve('portable'), path.resolve('moved portable')]) {
    assert.equal(randomizerInstallPath(path.join(root, 'SOTNPresetGenerator.exe'), false), path.join(root, 'sotnrando'));
  }
});

test('first launch installs a writable copy and subsequent launches preserve presets and registration', async (t) => {
  const { root, source, destination } = await fixture(t);
  assert.equal(await initializeBundledRandomizer(source, destination), destination);
  await writeFile(path.join(destination, 'presets', 'custom.json'), '{"music":true}');
  await writeFile(path.join(destination, 'package.json'), '{"presets":["sample","custom"]}');
  await writeFile(path.join(source, 'package.json'), '{"presets":["new-release"]}');
  await initializeBundledRandomizer(source, destination);
  assert.deepEqual(JSON.parse(await readFile(path.join(destination, 'package.json'), 'utf8')).presets, ['sample', 'custom']);
  assert.equal(await readFile(path.join(destination, 'presets', 'custom.json'), 'utf8'), '{"music":true}');
  assert.deepEqual(await readdir(path.join(source, 'presets')), ['sample.json']);
  assert.equal((await readdir(root)).some((name) => name.startsWith('.sotnrando-install-')), false);
});

test('an incomplete bundle leaves no partial installation and can be retried', async (t) => {
  const { root, source, destination } = await fixture(t);
  await rm(path.join(source, 'tools', 'build-presets'));
  await assert.rejects(initializeBundledRandomizer(source, destination), /ENOENT/);
  assert.deepEqual(await readdir(root), ['resources']);
  await writeFile(path.join(source, 'tools', 'build-presets'), '// repaired');
  await initializeBundledRandomizer(source, destination);
});

test('an invalid existing directory is reported without replacing its contents', async (t) => {
  const { source, destination } = await fixture(t);
  await mkdir(destination);
  await writeFile(path.join(destination, 'keep.txt'), 'User data');
  await assert.rejects(initializeBundledRandomizer(source, destination), /ENOENT/);
  assert.deepEqual(await readdir(destination), ['keep.txt']);
});

test('Forge includes the randomizer outside ASAR and includes its initialization module', () => {
  const { packagerConfig } = require('../forge.config.cjs');
  assert.deepEqual(packagerConfig.extraResource, [path.resolve(__dirname, '../out/bundled/sotnrando')]);
  assert.equal(packagerConfig.ignore('/dist/bundled-randomizer.js'), false);
  assert.equal(packagerConfig.ignore('/out/bundled/sotnrando/package.json'), true);
});
