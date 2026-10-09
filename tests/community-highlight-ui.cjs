const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

// Run with: electron tests/community-highlight-ui.cjs (after npm run build).
// The real renderer uses a fake bridge and an isolated temporary profile. No API,
// account, file dialog, or download touches the user's data or network.
let output;
async function main() {
  output = await fs.mkdtemp(path.join(os.tmpdir(), 'sotn-community-highlight-'));
  app.setPath('userData', path.join(output, 'profile'));
  await app.whenReady();
  const template = JSON.parse(await fs.readFile(path.join(__dirname, '../templates/preset-template.json'), 'utf8'));
  const artwork = `data:image/png;base64,${(await fs.readFile(path.join(__dirname, '../assets/icons/castle-moon.png'))).toString('base64')}`;
  const mod = {
    id: 'clockwork-castle', title: 'Clockwork Castle',
    description: 'Discover new routes through the castle.\nA community-made PPF for your next run.',
    image: artwork, releaseTime: '2099-12-01T18:00:00Z', downloadAvailable: false,
    downloadUrl: '/v1/featured-mods/clockwork-castle/download', createdBy: 'runner', createdAt: '2026-10-07T18:00:00Z'
  };
  const preload = path.join(output, 'preload.cjs');
  await fs.writeFile(preload, `
    const template = ${JSON.stringify(template)};
    const initialMod = { ...${JSON.stringify(mod)}, releaseTime: new Date(Date.now() + 2000).toISOString() };
    localStorage.setItem('sotn-preset-generator.presets.v1', JSON.stringify([{
      id: 'test-preset', name: 'Test preset', optionIds: [],
      createdAt: '2026-10-07T18:00:00Z', updatedAt: '2026-10-07T18:00:00Z'
    }]));
    window.__fixture = {
      mod: initialMod, metadataMode: 'ok', downloadMode: 'cancel',
      apiUrl: 'https://first-api.example.invalid', deferredMetadata: [], deferredDownload: [], statusDelayMs: 0
    };
    window.__calls = [];
    window.__metadataCalls = [];
    const account = () => ({ signedIn: false, email: '', remembered: false,
      config: { apiUrl: window.__fixture.apiUrl, region: 'us-east-1', clientId: 'test', devUser: '' } });
    const ok = data => ({ status: 'ok', data });
    window.presetApp = {
      updates: { async getState() { return { phase: 'idle', currentVersion: 'test' }; }, onState() { return () => {}; } },
      platform: 'win32', version: 'test', windowControls: { close() {}, minimize() {}, toggleMaximize() {} },
      async getDefaultSotnRandoPath() { return ''; }, async getPresetTemplate() { return template; },
      async listOptions() { return { status: 'ok', options: [] }; }, async getSuccessfulExports() { return {}; },
      async community(request) {
        window.__calls.push({ ...request });
        const fixture = window.__fixture;
        if (request.action === 'status') {
          if (fixture.statusDelayMs) await new Promise(resolve => setTimeout(resolve, fixture.statusDelayMs));
          return ok(account());
        }
        if (request.action === 'list') return ok({ items: [] });
        if (request.action === 'featuredMod') {
          window.__metadataCalls.push(fixture.apiUrl);
          if (fixture.metadataMode === 'error') return { status: 'error', error: 'Featured service unavailable' };
          if (fixture.metadataMode === 'defer') return new Promise(resolve => fixture.deferredMetadata.push(resolve));
          return ok(fixture.mod && { ...fixture.mod });
        }
        if (request.action === 'downloadFeaturedMod') {
          if (fixture.downloadMode === 'error') return { status: 'error', error: 'The PPF could not be downloaded. Try again.' };
          if (fixture.downloadMode === 'defer') return new Promise(resolve => fixture.deferredDownload.push(resolve));
          if (fixture.downloadMode === 'cancel') return ok({ canceled: true });
          return ok({ canceled: false, filePath: '/chosen-folder/clockwork-castle.ppf' });
        }
        throw new Error('Unexpected request: ' + request.action);
      }
    };
  `);
  const win = new BrowserWindow({ show: false, useContentSize: true, width: 1360, height: 900,
    webPreferences: { preload, contextIsolation: false, sandbox: false, backgroundThrottling: false, offscreen: true } });
  const evaluate = async code => {
    try { return await win.webContents.executeJavaScript(code, true); }
    catch (cause) { throw new Error(`UI evaluation failed: ${code.slice(0, 300)}`, { cause }); }
  };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async expression => {
    for (let i = 0; i < 120; i++) {
      if (await evaluate(expression)) return;
      await pause(50);
    }
    throw new Error('Timed out: ' + expression);
  };
  const title = `document.querySelector('.community-highlight h2')?.textContent`;
  const disabled = `document.querySelector('.community-highlight-download')?.disabled`;
  const metadataCount = `window.__calls.filter(call => call.action === 'featuredMod').length`;
  const downloadCount = `window.__calls.filter(call => call.action === 'downloadFeaturedMod').length`;
  const focus = () => evaluate(`window.dispatchEvent(new Event('focus'))`);
  const clickDownload = () => evaluate(`document.querySelector('.community-highlight-download').click()`);
  const clickButton = async label => {
    const expression = `[...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(label)} && button.checkVisibility())`;
    await waitFor(`Boolean(${expression})`);
    await evaluate(`(${expression}).click()`);
  };
  const screenshot = async name => {
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await pause(100);
    const file = path.join(output, name);
    await fs.writeFile(file, (await win.webContents.capturePage()).toPNG());
    return file;
  };
  const results = [];
  try {
    await win.loadFile(path.join(__dirname, '../dist/renderer/index.html'));
    await waitFor(`${title} === 'Clockwork Castle'`);
    await waitFor(`document.querySelector('.community-highlight-artwork img')?.naturalWidth > 0`);
    assert.equal(await evaluate(`document.querySelector('.community-highlight-description').textContent`), mod.description);
    assert.equal(await evaluate(`document.querySelector('.community-highlight-artwork img').getAttribute('src')`), artwork);
    assert.equal(await evaluate(disabled), true);
    assert.match(await evaluate(`document.querySelector('.community-highlight-download-note').textContent`), /^Available /);
    await clickDownload();
    assert.equal(await evaluate(downloadCount), 0);
    assert.equal(await evaluate(`window.__calls.some(call => call.action === 'account')`), false);
    results.push('Published metadata and artwork render publicly; release time keeps Download disabled.');

    assert.equal(await evaluate(metadataCount), 1);
    await focus();
    await focus();
    await pause(100);
    assert.equal(await evaluate(metadataCount), 1);
    await waitFor(`${disabled} === false`);
    assert.equal(await evaluate(metadataCount), 1);
    assert.equal(await evaluate(downloadCount), 0);
    assert.equal(await evaluate(`Boolean(document.querySelector('.community-highlight-download-note'))`), false);
    results.push('StrictMode and focus fetch metadata once; the release deadline enables Download without another metadata request.');

    // Unrelated account renders and library remounts reuse the same metadata.
    await clickButton('Community');
    await clickButton('Login');
    await waitFor(`Boolean(document.querySelector('.login-dialog[open]'))`);
    await evaluate(`document.querySelector('[aria-label="Close login"]').click()`);
    await evaluate(`document.querySelector('[aria-label="Edit Test preset"]').click()`);
    await waitFor(`!document.querySelector('.community-highlight')`);
    // Record the first inserted banner and every subsequent metadata mutation.
    // Waiting only for the final title misses a placeholder/artwork flash while
    // a remounted library waits for even a cached metadata promise or status IPC.
    await evaluate(`
      window.__fixture.statusDelayMs = 150;
      window.__bannerPaints = [];
      const recordBanner = banner => {
        if (!banner) return;
        const paint = {
          title: banner.querySelector('h2')?.textContent,
          description: banner.querySelector('.community-highlight-description')?.textContent,
          imageSrc: banner.querySelector('.community-highlight-artwork img')?.getAttribute('src')
        };
        const previous = window.__bannerPaints.at(-1);
        if (!previous || JSON.stringify(previous) !== JSON.stringify(paint)) window.__bannerPaints.push(paint);
      };
      window.__bannerObserver = new MutationObserver(records => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            recordBanner(node.matches('.community-highlight') ? node : node.querySelector('.community-highlight'));
          }
          const element = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
          recordBanner(element?.closest('.community-highlight'));
        }
      });
      window.__bannerObserver.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['src'] });
      true;
    `);
    await evaluate(`document.querySelector('[aria-label="Back to presets"]').click()`);
    await waitFor(`Boolean(document.querySelector('.community-highlight'))`);
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await pause(200);
    const bannerPaints = await evaluate(`window.__bannerObserver.disconnect(); window.__fixture.statusDelayMs = 0; window.__bannerPaints`);
    assert.ok(bannerPaints.length > 0, 'The returned banner must be observed from its first DOM insertion.');
    for (const paint of bannerPaints) {
      assert.equal(paint.title, mod.title, 'Returning to the library must display the cached title immediately, without a placeholder flash.');
      assert.equal(paint.description, mod.description, 'Returning to the library must preserve the cached description in every render.');
      assert.equal(paint.imageSrc, artwork, 'Returning to the library must preserve the cached artwork URL in every render.');
    }
    assert.equal(await evaluate(metadataCount), 1);
    assert.equal(await evaluate(disabled), false);
    results.push('Account status changes and leaving/returning to the preset library preserve the first rendered title, description, and image URL with one metadata request, even when status IPC is delayed.');

    assert.equal(await evaluate(`window.innerWidth`), 1360);
    const desktop = await screenshot('banner-1360.png');
    win.setContentSize(720, 900);
    await waitFor(`window.innerWidth === 720`);
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), true);
    const small = await screenshot('banner-720.png');
    win.setContentSize(1360, 900);
    assert.equal(await evaluate(metadataCount), 1);
    results.push('The banner fits both app widths without a metadata request on resize.');

    await clickDownload();
    await waitFor(`${downloadCount} === 1 && !document.querySelector('.community-highlight-download').disabled`);
    assert.deepEqual(await evaluate(`window.__calls.find(call => call.action === 'downloadFeaturedMod')`),
      { action: 'downloadFeaturedMod', id: mod.id, title: mod.title });
    assert.equal(await evaluate(`Boolean(document.querySelector('.community-highlight [role="status"], .community-highlight [role="alert"]'))`), false);
    assert.equal(await evaluate(metadataCount), 1);
    results.push('Download uses the separate public id/title action; canceled save is quiet and preserves cached metadata.');

    await evaluate(`window.__fixture.downloadMode = 'error'`);
    await clickDownload();
    await waitFor(`document.querySelector('.community-highlight [role="alert"]')?.textContent.includes('The PPF could not be downloaded')`);
    assert.equal(await evaluate(disabled), false);
    assert.equal(await evaluate(metadataCount), 1);
    results.push('Download failure stays visible and allows retry without refreshing title, description, or artwork.');

    await evaluate(`window.__fixture.downloadMode = 'defer'; document.querySelector('.community-highlight-download').click(); document.querySelector('.community-highlight-download').click()`);
    await waitFor(`document.querySelector('.community-highlight-download').getAttribute('aria-busy') === 'true'`);
    assert.equal(await evaluate(downloadCount), 3);
    assert.equal(await evaluate(`window.__fixture.deferredDownload.length`), 1);
    assert.equal(await evaluate(disabled), true);
    assert.equal(await evaluate(`Boolean(document.querySelector('.community-highlight [role="alert"]'))`), false);
    await evaluate(`document.querySelector('[aria-label="Edit Test preset"]').click()`);
    await waitFor(`!document.querySelector('.community-highlight')`);
    await evaluate(`document.querySelector('[aria-label="Back to presets"]').click()`);
    await waitFor(`Boolean(document.querySelector('.community-highlight'))`);
    assert.equal(await evaluate(title), mod.title);
    assert.equal(await evaluate(`document.querySelector('.community-highlight-download').getAttribute('aria-busy')`), 'true');
    assert.equal(await evaluate(disabled), true);
    assert.equal(await evaluate(metadataCount), 1);
    assert.equal(await evaluate(downloadCount), 3);
    assert.equal(await evaluate(`window.__fixture.deferredDownload.length`), 1);
    await evaluate(`window.__fixture.deferredDownload.shift()({ status: 'ok', data: { canceled: false, filePath: '/chosen-folder/clockwork-castle.ppf' } })`);
    await waitFor(`document.querySelector('.community-highlight [role="status"]')?.textContent === 'Saved clockwork-castle.ppf'`);
    assert.equal(await evaluate(disabled), false);
    assert.equal(await evaluate(metadataCount), 1);
    results.push('Rapid duplicate clicks start one download; leaving and returning preserves its busy state and saved-file feedback without refreshing metadata.');

    const selectApi = async (apiUrl, changes = {}) => {
      await evaluate(`Object.assign(window.__fixture, ${JSON.stringify({ apiUrl, ...changes })}); true`);
      await clickButton('Community');
      await clickButton('Login');
      await waitFor(`Boolean(document.querySelector('.login-dialog[open]'))`);
      await evaluate(`document.querySelector('[aria-label="Close login"]').click()`);
    };
    const firstApi = 'https://first-api.example.invalid';
    const secondApi = 'https://second-api.example.invalid';
    const nextMod = { ...mod, id: 'new-highlight', title: 'New featured mod', description: 'A newly selected community release.',
      releaseTime: '2020-01-01T18:00:00Z', downloadAvailable: true };
    await selectApi(secondApi, { mod: nextMod });
    await waitFor(`${title} === 'New featured mod'`);
    assert.equal(await evaluate(metadataCount), 2);
    await selectApi(firstApi, { mod: { ...mod, title: 'This new server title must not replace the cached banner' } });
    await waitFor(`${title} === 'Clockwork Castle'`);
    assert.equal(await evaluate(metadataCount), 2);
    await focus();
    assert.equal(await evaluate(`document.querySelector('.community-highlight-description').textContent`), mod.description);
    assert.equal(await evaluate(`document.querySelector('.community-highlight-artwork img').getAttribute('src')`), artwork);
    assert.equal(await evaluate(metadataCount), 2);
    results.push('A new API loads its own banner once; switching back and focusing reuse the original title, description, and image.');

    // A pending response from a previous API must not overwrite the current cached selection.
    await selectApi('https://pending-api.example.invalid', { metadataMode: 'defer' });
    await waitFor(`window.__fixture.deferredMetadata.length === 1`);
    const beforePending = await evaluate(metadataCount);
    await selectApi(secondApi, { metadataMode: 'ok', mod: nextMod });
    await waitFor(`${title} === 'New featured mod'`);
    await evaluate(`window.__fixture.deferredMetadata.shift()({ status: 'ok', data: ${JSON.stringify(mod)} })`);
    await pause(100);
    assert.equal(await evaluate(title), 'New featured mod');
    assert.equal(await evaluate(metadataCount), beforePending);
    assert.equal(await evaluate(`Boolean(document.querySelector('.community-highlight [role="status"]'))`), false);
    results.push('A late metadata response from a previous API cannot replace the selected API banner.');

    // A completed download for a prior API cannot announce success for its replacement.
    await clickDownload();
    await waitFor(`window.__fixture.deferredDownload.length === 1`);
    await selectApi(firstApi, { mod });
    await waitFor(`${title} === 'Clockwork Castle'`);
    await evaluate(`window.__fixture.deferredDownload.shift()({ status: 'ok', data: { canceled: false, filePath: '/chosen-folder/previous-mod.ppf' } })`);
    await waitFor(`${disabled} === false`);
    assert.equal(await evaluate(`Boolean(document.querySelector('.community-highlight [role="status"]'))`), false);
    assert.equal(await evaluate(metadataCount), beforePending);
    results.push('Stale download feedback is ignored after changing API selections without refetching cached metadata.');

    await selectApi('https://broken-artwork-api.example.invalid', { mod: { ...nextMod, image: 'data:image/png;base64,broken-image' } });
    await waitFor(`Boolean(document.querySelector('.community-highlight-without-artwork'))`);
    assert.equal(await evaluate(`Boolean(document.querySelector('.community-highlight-artwork'))`), false);
    await selectApi(secondApi, { mod: nextMod });
    await waitFor(`document.querySelector('.community-highlight-artwork img')?.naturalWidth > 0`);
    results.push('Broken artwork hides cleanly; switching to a cached banner with valid artwork restores the image.');

    const placeholderTitle = 'A new challenge.\nYour kind of run.';
    const missingApi = 'https://missing-api.example.invalid';
    const errorApi = 'https://unavailable-api.example.invalid';
    for (const [apiUrl, metadataMode, missingMod] of [[missingApi, 'ok', null], [errorApi, 'error', nextMod]]) {
      await selectApi(apiUrl, { mod: missingMod, metadataMode });
      await waitFor(`${title} === ${JSON.stringify(placeholderTitle)}`);
      const afterRequest = await evaluate(metadataCount);
      assert.equal(await evaluate(disabled), true);
      assert.equal(await evaluate(`document.querySelector('.community-highlight-download-note').textContent`), 'Download coming soon');
      assert.equal(await evaluate(`Boolean(document.querySelector('.community-highlight [role="alert"]'))`), false);
      const beforeDownload = await evaluate(downloadCount);
      await clickDownload();
      await focus();
      await focus();
      await pause(100);
      assert.equal(await evaluate(metadataCount), afterRequest);
      assert.equal(await evaluate(downloadCount), beforeDownload);
      await selectApi(secondApi, { mod: nextMod, metadataMode: 'ok' });
      await waitFor(`${title} === 'New featured mod'`);
      await selectApi(apiUrl, { mod: nextMod, metadataMode: 'ok' });
      await waitFor(`${title} === ${JSON.stringify(placeholderTitle)}`);
      assert.equal(await evaluate(metadataCount), afterRequest);
    }
    assert.equal(await evaluate(`window.__metadataCalls.every(api => window.__metadataCalls.filter(value => value === api).length === 1)`), true);
    results.push('Missing and failed metadata are cached once per API and keep a quiet disabled placeholder across focus and API round trips.');

    const result = { passed: true, checks: results, screenshots: [desktop, small] };
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ ...result, output }, null, 2));
  } finally {
    win.destroy();
    // Electron retains profile handles until exit; keep this isolated temp profile for diagnostics.
  }
}
main().then(() => app.quit()).catch(async error => {
  console.error(error);
  if (output) await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: false, error: String(error) }));
  app.exit(1);
});
