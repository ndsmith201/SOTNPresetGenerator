const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { crc32 } = require('node:zlib');
const { createRequire } = require('node:module');
const { pipeline } = require('node:stream/promises');

// Exercise the actual transitive dependencies and import style used by Forge.
const packagerPath = require.resolve('@electron/packager');
const { extractElectronZip } = require(path.join(path.dirname(packagerPath), 'unzip.js'));
const rebuildRequire = createRequire(require.resolve('@electron/rebuild'));
const tar = rebuildRequire('tar');
const { ExternalEditor } = require('external-editor');

function workspace(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sotn-build-deps-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

// Minimal stored ZIP fixture, including Unix mode bits for symlink regression cases.
function zipEntry(filename, content, mode = 0o100644) {
  const name = Buffer.from(filename);
  const data = Buffer.from(content);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc32(data), 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(0x0314, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc32(data), 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE((mode << 16) >>> 0, 38);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + data.length, 16);
  return Buffer.concat([local, name, data, central, name, end]);
}

test('Forge packager extracts a normal ZIP with the replacement extractor', async t => {
  const directory = workspace(t);
  const zip = path.join(directory, 'normal.zip');
  const output = path.join(directory, 'output');
  fs.writeFileSync(zip, zipEntry('nested/content.txt', 'Packaged content'));
  await extractElectronZip(zip, output);
  assert.equal(fs.readFileSync(path.join(output, 'nested/content.txt'), 'utf8'), 'Packaged content');
});

test('Forge ZIP extraction rejects traversal outside the destination', async t => {
  const directory = workspace(t);
  const zip = path.join(directory, 'traversal.zip');
  fs.writeFileSync(zip, zipEntry('../escaped.txt', 'Do not write'));
  await assert.rejects(extractElectronZip(zip, path.join(directory, 'output')));
  assert.equal(fs.existsSync(path.join(directory, 'escaped.txt')), false);
});

test('Forge ZIP extraction rejects escaping symlink targets', async t => {
  const directory = workspace(t);
  const zip = path.join(directory, 'symlink.zip');
  const output = path.join(directory, 'output');
  fs.writeFileSync(zip, zipEntry('link', '../outside', 0o120777));
  await assert.rejects(extractElectronZip(zip, output));
  assert.equal(fs.existsSync(path.join(output, 'link')), false);
});

test('native rebuild tar dependency supports file and streaming extraction', async t => {
  const directory = workspace(t);
  const source = path.join(directory, 'source');
  const output = path.join(directory, 'output');
  fs.mkdirSync(source);
  fs.mkdirSync(output);
  fs.writeFileSync(path.join(source, 'header.h'), 'Header fixture');
  const archive = path.join(directory, 'headers.tar.gz');
  await tar.c({ file: archive, cwd: source, gzip: true }, ['header.h']);
  await tar.x({ file: archive, cwd: output });
  assert.equal(fs.readFileSync(path.join(output, 'header.h'), 'utf8'), 'Header fixture');
  fs.unlinkSync(path.join(output, 'header.h'));
  await pipeline(fs.createReadStream(archive), tar.extract({ cwd: output }));
  assert.equal(fs.readFileSync(path.join(output, 'header.h'), 'utf8'), 'Header fixture');
});

test('Forge external editor can create and remove its temporary file', () => {
  const editor = new ExternalEditor('Temporary editor content');
  const filename = editor.tempFile;
  try {
    assert.equal(fs.readFileSync(filename, 'utf8'), 'Temporary editor content');
  } finally { editor.cleanup(); }
  assert.equal(fs.existsSync(filename), false);
});
