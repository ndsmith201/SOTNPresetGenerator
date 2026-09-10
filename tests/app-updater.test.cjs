const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const { AppUpdater, selectUpdate, isNewerStableVersion } = require('../dist/app-updater');
const release = (version = '0.2.0', extra = {}) => ({ tag_name: `v${version}`, draft: false, prerelease: false, assets: ['RELEASES', `SOTNPresetGenerator-${version}-full.nupkg`, `SOTNPresetGenerator-${version}-win32-x64-Setup.exe`].map(name => ({ name })), ...extra });
class FakeUpdater extends EventEmitter {
  checks = 0; restarts = 0; feed = '';
  setFeedURL({ url }) { this.feed = url; }
  checkForUpdates() { this.checks++; }
  quitAndInstall() { this.restarts++; }
}
function fixture(overrides = {}) {
  const native = new FakeUpdater();
  const states = [];
  let requests = 0;
  const service = new AppUpdater({ currentVersion: '0.1.2', enabled: true, arch: 'x64', squirrelInstalled: true, updater: native, onState: state => states.push(state), fetcher: async () => { requests++; return new Response(JSON.stringify(release())); }, ...overrides });
  return { native, states, service, requests: () => requests };
}

test('release comparison handles numeric versions and refuses downgrades, prereleases, and malformed tags', () => {
  assert.equal(isNewerStableVersion('0.10.0', '0.9.9'), true);
  assert.equal(isNewerStableVersion('1.0.0', '1.0.0-beta.2'), true);
  for (const [next, current] of [['0.2.0', '0.2.0'], ['0.1.9', '0.2.0'], ['1.0.0-beta', '0.1.0'], ['01.0.0', '0.1.0'], ['../../payload', '0.1.0'], ['2.0.0', 'development']]) assert.equal(isNewerStableVersion(next, current), false);
});
test('only complete matching-architecture releases enable automatic updates and feed URLs stay on this repository', () => {
  const valid = selectUpdate(release(), '0.1.2', 'x64', true);
  assert.equal(valid.automatic, true);
  assert.equal(valid.feedUrl, 'https://github.com/ndsmith201/SOTNPresetGenerator/releases/download/v0.2.0');
  assert.equal(selectUpdate(release(), '0.1.2', 'arm64', true), null);
  assert.equal(selectUpdate(release('0.2.0', { draft: true }), '0.1.2', 'x64', true), null);
  assert.equal(selectUpdate(release('0.2.0', { prerelease: true }), '0.1.2', 'x64', true), null);
  assert.equal(selectUpdate(release('0.2.0', { tag_name: '../evil' }), '0.1.2', 'x64', true), null);
  const missingFeed = release(); missingFeed.assets = missingFeed.assets.filter(asset => asset.name !== 'RELEASES');
  assert.equal(selectUpdate(missingFeed, '0.1.2', 'x64', true).automatic, false);
  assert.equal(selectUpdate(release(), '0.1.2', 'x64', false).automatic, false);
});
test('startup checks once and does not download until consent; restart requires completed download', async () => {
  const { service, native, requests } = fixture();
  await Promise.all([service.check(), service.check()]);
  assert.equal(requests(), 1); assert.equal(service.getState().phase, 'available');
  assert.equal(native.checks, 0);
  assert.throws(() => service.restart(), /not finished/);
  native.emit('update-downloaded'); assert.equal(service.getState().phase, 'available');
  service.install(); assert.equal(native.checks, 1); assert.equal(service.getState().phase, 'downloading');
  assert.throws(() => service.install(), /No automatic update/);
  native.emit('update-downloaded'); assert.equal(service.getState().phase, 'ready');
  assert.equal(native.restarts, 0);
  service.restart(); assert.equal(native.restarts, 1); assert.equal(service.getState().phase, 'restarting');
  assert.throws(() => service.restart(), /not finished/);
});
test('failed downloads remain retryable and never restart', async () => {
  const { service, native } = fixture(); await service.check(); service.install();
  native.emit('error', new Error('Connection interrupted'));
  assert.equal(service.getState().phase, 'error'); assert.match(service.getState().error, /Connection interrupted/);
  assert.equal(native.restarts, 0);
  service.install(); assert.equal(native.checks, 2);
  native.emit('update-not-available'); assert.equal(service.getState().phase, 'error');
});
test('synchronous updater failures are reported without quitting', async () => {
  const { service, native } = fixture(); await service.check();
  native.setFeedURL = () => { throw new Error('Updater unavailable'); };
  service.install(); assert.equal(service.getState().phase, 'error'); assert.equal(native.checks, 0);
});
test('offline, rate-limited, missing, malformed, and oversized releases are quiet on startup', async () => {
  for (const fetcher of [async () => { throw new Error('Offline'); }, async () => new Response('', { status: 404 }), async () => new Response('', { status: 403 }), async () => new Response('invalid'), async () => new Response('x'.repeat(1048577))]) {
    const { service, native } = fixture({ fetcher }); await service.check();
    assert.equal(service.getState().phase, 'idle'); assert.equal(native.checks, 0);
  }
});
test('development, current releases, and portable installs never try native installation', async () => {
  const development = fixture({ enabled: false }); await development.service.check(); assert.equal(development.requests(), 0);
  const current = fixture({ currentVersion: '0.2.0' }); await current.service.check(); assert.equal(current.service.getState().phase, 'idle');
  const portable = fixture({ squirrelInstalled: false }); await portable.service.check(); assert.equal(portable.service.getState().phase, 'available'); assert.throws(() => portable.service.install(), /No automatic update/);
});
test('release runtime modules are packaged without including updater tests', () => {
  const { packagerConfig } = require('../forge.config.cjs');
  assert.equal(packagerConfig.ignore('/dist/app-updater.js'), false);
  assert.equal(packagerConfig.ignore('/dist/update-types.js'), false);
  assert.equal(packagerConfig.ignore('/tests/app-updater.test.cjs'), true);
});
