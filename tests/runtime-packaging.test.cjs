const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const { packagerConfig } = require('../forge.config.cjs');

// Traverse compiled imports: source-level type imports do not need packaging,
// while main-process imports of renderer helpers do need their separate files.
test('every local main and preload runtime dependency survives packaging', () => {
  const root = path.resolve(__dirname, '..');
  const visited = new Set();
  function visit(filename) {
    if (visited.has(filename)) return;
    visited.add(filename);
    const relative = '/' + path.relative(root, filename).split(path.sep).join('/');
    for (let entry = relative; entry !== '/'; entry = path.posix.dirname(entry)) {
      assert.equal(packagerConfig.ignore(entry), false, `${relative} excluded by packaging at ${entry}`);
    }
    const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    function scan(node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
          node.expression.text === 'require' && node.arguments.length === 1 &&
          ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text.startsWith('.')) {
        visit(createRequire(filename).resolve(node.arguments[0].text));
      }
      ts.forEachChild(node, scan);
    }
    scan(source);
  }
  visit(path.join(root, 'dist/main.js'));
  visit(path.join(root, 'dist/preload.js'));
});

test('runtime packaging continues to exclude local data and development outputs', () => {
  for (const filename of ['/out/private-backup.sql', '/database/options.sqlite',
    '/dist/test-report.html', '/dist/screenshot.png', '/tests/runtime-packaging.test.cjs']) {
    assert.equal(packagerConfig.ignore(filename), true, filename);
  }
});
