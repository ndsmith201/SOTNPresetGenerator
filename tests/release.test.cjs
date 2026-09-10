const assert = require('node:assert/strict');
const { test } = require('node:test');
const { release } = require('../scripts/release.cjs');

test('release rejects missing, unsupported, and extra arguments before making changes', () => {
  for (const args of [[], ['prepatch'], ['1.0.0'], ['patch', '--force']]) {
    assert.throws(() => release(args, {
      npmPath: 'npm-cli.js',
      run() { assert.fail('Invalid input must not run commands'); },
    }), /Usage:/);
  }
});

test('release requires the npm launcher before making changes', () => {
  assert.throws(() => release(['patch'], {
    npmPath: '',
    run() { assert.fail('Missing npm must not run commands'); },
  }), /Run this command through npm/);
});

test('release supports each bump and pushes only the resulting tag with the branch', () => {
  for (const [bump, version] of [['major', '1.0.0'], ['minor', '0.4.0'], ['patch', '0.3.3']]) {
    const commands = [];
    release([bump], {
      npmPath: 'C:/Program Files/nodejs/npm-cli.js',
      run(command, args) { commands.push([command, args]); },
      readVersion() {
        assert.equal(commands.length, 1, 'Read the updated version after npm completes');
        return version;
      },
    });
    assert.deepEqual(commands, [
      [process.execPath, ['C:/Program Files/nodejs/npm-cli.js', 'version', bump, '--git-tag-version=true', '--tag-version-prefix=v']],
      ['git', ['push', '--atomic', 'origin', 'HEAD', `refs/tags/v${version}`]],
    ]);
  }
});

test('a failed version bump or version hook prevents pushing', () => {
  let calls = 0;
  assert.throws(() => release(['patch'], {
    npmPath: 'npm-cli.js',
    run() { calls++; throw new Error('Version hook failed'); },
    readVersion() { assert.fail('Failed version must stop release'); },
  }), /Version hook failed/);
  assert.equal(calls, 1);
});

test('a failed push reports how to retry without another version bump', () => {
  let calls = 0;
  assert.throws(() => release(['patch'], {
    npmPath: 'npm-cli.js',
    run() { if (++calls === 2) throw new Error('Push rejected'); },
    readVersion: () => '0.3.3',
  }), /retry with: git push --atomic origin HEAD refs\/tags\/v0\.3\.3/);
  assert.equal(calls, 2);
});
