const { execFile } = require('node:child_process');
const { cp, mkdir, mkdtemp, readFile, rm, rename, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const lock = require('../sotnrando.lock.json');

const exec = promisify(execFile);
const root = path.resolve(__dirname, '..');
const stagingRoot = path.join(root, 'out', 'bundled');
const bundlePath = path.join(stagingRoot, 'sotnrando');

// All cleanup is restricted to this script's staging area.
async function removeStaging(directory) {
  const relative = path.relative(stagingRoot, path.resolve(directory));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid staging path');
  await rm(directory, { recursive: true, force: true });
}

async function bundleSotnRando() {
  if (!/^[a-f0-9]{40}$/.test(lock.commit) || lock.repository !== 'https://github.com/sotnrando/sotnrando.git') {
    throw new Error('Expected the official sotnrando repository and a full pinned commit.');
  }
  const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  await mkdir(stagingRoot, { recursive: true });
  const temporary = await mkdtemp(path.join(stagingRoot, 'prepare-'));
  const checkout = path.join(temporary, 'checkout');
  const prepared = path.join(temporary, 'sotnrando');
  const run = (command, args, cwd) => exec(command, args, {
    cwd, windowsHide: true, maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  });
  try {
    console.log(`Bundling sotnrando ${lock.commit}...`);
    await run('git', ['init', checkout], temporary);
    await run('git', ['fetch', '--depth=1', lock.repository, lock.commit], checkout);
    await run('git', ['checkout', '--detach', 'FETCH_HEAD'], checkout);
    const { stdout } = await run('git', ['rev-parse', 'HEAD'], checkout);
    if (stdout.trim() !== lock.commit) throw new Error('sotnrando checkout does not match the pinned commit.');
    await cp(checkout, prepared, {
      recursive: true,
      filter: (source) => !['.git', '.github'].includes(path.relative(checkout, source).split(path.sep)[0])
    });
    // Install exactly the upstream lockfile. Run the required build explicitly;
    // upstream's preinstall invokes npx and can otherwise rewrite its lockfile.
    await run(process.execPath, [npmCli, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], prepared);
    await run(process.execPath, ['tools/build-presets'], prepared);
    await run(process.execPath, ['randomize', '--help'], prepared);
    const pkg = JSON.parse(await readFile(path.join(prepared, 'package.json'), 'utf8'));
    await writeFile(path.join(prepared, 'bundle-info.json'), `${JSON.stringify({ ...lock, version: pkg.version }, null, 2)}\n`);
    await removeStaging(bundlePath);
    await rename(prepared, bundlePath);
    console.log(`Bundled sotnrando ${pkg.version}, dependencies, presets, and upstream license.`);
    return bundlePath;
  } finally {
    await removeStaging(temporary);
  }
}

module.exports = { bundleSotnRando, bundlePath };
if (require.main === module) bundleSotnRando().catch((error) => { console.error(error); process.exitCode = 1; });
