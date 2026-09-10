const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');

function release(args, {
  npmPath = process.env.npm_execpath,
  run = execFileSync,
  readVersion = () => JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf8')).version,
} = {}) {
  if (args.length !== 1 || !['major', 'minor', 'patch'].includes(args[0])) {
    throw new Error('Usage: npm run release <major|minor|patch>');
  }
  if (!npmPath) throw new Error('Run this command through npm: npm run release <major|minor|patch>');

  const options = { cwd: path.resolve(__dirname, '..'), stdio: 'inherit', windowsHide: true };
  // Use npm's CLI through Node so this also works with Windows npm.cmd launchers.
  // The existing version hook exports and stages the options snapshot.
  run(process.execPath, [npmPath, 'version', args[0], '--git-tag-version=true', '--tag-version-prefix=v'], options);
  const tag = `v${readVersion()}`;
  try {
    run('git', ['push', '--atomic', 'origin', 'HEAD', `refs/tags/${tag}`], options);
  } catch (error) {
    throw new Error(`Push failed. The version commit and ${tag} remain local. After fixing the push error, retry with: git push --atomic origin HEAD refs/tags/${tag}`, { cause: error });
  }
}

if (require.main === module) {
  try {
    release(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { release };
