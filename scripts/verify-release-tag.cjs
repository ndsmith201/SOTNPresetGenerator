const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { version } = require('../package.json');

const tag = process.argv[2] || process.env.RELEASE_TAG;
assert.equal(tag, `v${version}`, `Release tag must equal v${version} from package.json.`);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', windowsHide: true }).trim();
assert.equal(git('rev-parse', `refs/tags/${tag}^{commit}`), git('rev-parse', 'HEAD'), 'The release tag must point to the checked-out commit.');
console.log(`Verified ${tag} at the checked-out commit.`);
