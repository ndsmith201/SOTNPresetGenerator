const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

// Run with: electron tests/community-ui.cjs (after building the renderer).
// All account/catalog/export operations use a fake preload in an isolated profile.
async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sotn-community-ui-'));
  app.setPath('userData', path.join(root, 'profile'));
  await app.whenReady();
  const template = JSON.parse(await fs.readFile(path.join(__dirname, '../templates/preset-template.json'), 'utf8'));
  const preload = path.join(root, 'preload.cjs');
  await fs.writeFile(preload, `
    const template = ${JSON.stringify(template)};
    let signedIn = sessionStorage.getItem('ui-signed-in') === 'true';
    let vote = 0;
    let deletedOption = false;
    const option = { id: 1, readOnly: false, comment: 'My shortcut', description: 'A local option', category: 'gameplay', type: 'string', value: '{"music":false}', address: null, gameInit: false, statEdit: false, rawJson: true, additionalWrites: [] };
    const item = { id: 'community-preset', kind: 'presets', createdBy: 'runner', createdAt: '2026-09-09T20:00:00Z', upvotes: 12, downvotes: 3, score: 9, data: { ...template, metadata: { ...template.metadata, name: 'Castle challenge' }, music: false } };
    const account = () => ({ signedIn, email: signedIn ? 'runner' : '', remembered: false, config: { apiUrl: 'https://example.invalid', region: 'us-east-1', clientId: 'test', devUser: '' } });
    localStorage.setItem('sotn-preset-generator.author', 'Settings author');
    window.__calls = [];
    window.presetApp = {
      updates: { async getState() { return { phase: 'idle', currentVersion: '0.1.2' }; }, onState() { return () => {}; } },
      platform: 'win32', version: 'test', windowControls: { close() {}, minimize() {}, toggleMaximize() {} },
      async getDefaultSotnRandoPath() { return 'test-root'; }, async getPresetTemplate() { return template; },
      async listOptions() { return { status: 'ok', options: [...(deletedOption ? [] : [option]), { ...option, id: 2, readOnly: true, comment: 'Bundled option' }] }; },
      async deleteOption(id) { window.__calls.push({ action: 'deleteOption', id }); deletedOption = true; return { status: 'deleted' }; },
      async getSuccessfulExports() { return {}; }, async listInstalledPresets() { return { status: 'ok', presets: [] }; },
      async exportPreset(request) { window.__calls.push({ action: 'export', ...request }); return { status: 'exported', path: 'test-root/presets/local.json', buildToken: 'verified-build' }; },
      async community(request) {
        window.__calls.push(request);
        const ok = data => ({ status: 'ok', data });
        if (request.action === 'status') return ok(account());
        if (request.action === 'list') return ok({ items: request.kind === 'presets' ? [{ ...item }] : [], nextCursor: request.kind === 'presets' && !request.cursor ? 'page-two' : undefined });
        if (request.action === 'get') return ok({ ...item });
        if (request.action === 'account') { signedIn = request.account.action !== 'signOut' && request.account.action !== 'signUp'; sessionStorage.setItem('ui-signed-in', String(signedIn)); return ok({ account: account(), message: signedIn ? 'Signed in.' : 'Account created. You can sign in now.' }); }
        if (!signedIn) return { status: 'error', error: 'Sign in again.' };
        if (request.action === 'vote') {
          item.upvotes += Number(request.value === 1) - Number(vote === 1);
          item.downvotes += Number(request.value === -1) - Number(vote === -1);
          vote = request.value; return ok({ ...item });
        }
        if (request.action === 'sharePreset' || request.action === 'shareOption') { if (window.__failNextShare) { window.__failNextShare = false; return { status: 'error', error: 'Test service unavailable' }; } return ok({ ...item }); }
        throw new Error('Unexpected request: ' + request.action);
      }
    };

  `);
  const win = new BrowserWindow({ show: false, width: 1360, height: 900, webPreferences: { preload, contextIsolation: false, sandbox: false, backgroundThrottling: false } });
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const waitFor = async expression => {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Timed out: ' + expression);
  };
  const click = async selector => { await waitFor(`Boolean(document.querySelector(${JSON.stringify(selector)}))`); await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); };
  const button = async label => {
    const expression = `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)} && !b.closest('[hidden]'))`;
    await waitFor(`Boolean(${expression})`); await evaluate(`(${expression}).click()`);
  };
  const fill = (selector, value) => evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const screenshot = async name => { await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'); await new Promise(resolve => setTimeout(resolve, 100)); await fs.writeFile(path.join(__dirname, '../dist', name), (await win.webContents.capturePage()).toPNG()); };
  try {
    await win.loadFile(path.join(__dirname, '../dist/renderer/index.html'));
    await waitFor(`Boolean(document.querySelector('[aria-label="View community preset Castle challenge"]'))`);
    assert.equal(await evaluate(`document.querySelector('.preset-community-score').textContent`), '12');
    assert.equal(await evaluate(`document.querySelector('.preset-community-score').closest('.preset-card-container').querySelector('.preset-delete-button')`), null);
    await button('Load more');
    await waitFor(`window.__calls.some(c => c.cursor === 'page-two')`);
    await evaluate(`document.querySelector('[aria-labelledby="community-presets-title"]').scrollIntoView()`);
    await screenshot('community-library.png');
    await click('[aria-label="View community preset Castle challenge"]');
    await waitFor(`Boolean(document.querySelector('[aria-label="Upvote, 12 upvotes"]'))`);
    assert.equal(await evaluate(`document.querySelector('.code-preview').textContent.includes('Castle challenge')`), true);
    await screenshot('community-preset.png');
    await click('[aria-label="Upvote, 12 upvotes"]');
    await waitFor(`Boolean(document.querySelector('.login-dialog[open]'))`);
    assert.equal(await evaluate(`document.querySelector('.login-dialog').textContent.includes('Welcome')`), false);
    assert.equal(await evaluate(`parseFloat(getComputedStyle(document.querySelector('#signInTab')).paddingBottom) >= 12`), true);
    await button('Sign up');
    assert.equal(await evaluate(`document.querySelectorAll('.login-dialog input').length`), 3);
    await fill('#loginUsername', 'runner'); await fill('#loginPassword', 'ExamplePassword!1'); await fill('#loginConfirm', 'different');
    await click('.login-dialog button[type="submit"]');
    await waitFor(`document.querySelector('.community-error')?.textContent.includes('do not match')`);
    assert.equal(await evaluate(`window.__calls.filter(c => c.action === 'account').length`), 0);
    await screenshot('community-signup.png');
    await button('Sign in');
    assert.equal(await evaluate(`document.querySelectorAll('.login-dialog input').length`), 2);
    await fill('#loginPassword', 'ExamplePassword!1');
    await click('.login-dialog button[type="submit"]');
    await waitFor(`Boolean(document.querySelector('[aria-label="Upvote, 13 upvotes"][aria-pressed="true"]'))`);
    await click('[aria-label="Downvote, 3 downvotes"]');
    await waitFor(`Boolean(document.querySelector('[aria-label="Downvote, 4 downvotes"][aria-pressed="true"]'))`);
    assert.equal(await evaluate(`Boolean(document.querySelector('[aria-label="Upvote, 12 upvotes"]'))`), true);
    await click('[aria-label="Downvote, 4 downvotes"]');
    await waitFor(`Boolean(document.querySelector('[aria-label="Downvote, 3 downvotes"][aria-pressed="false"]'))`);
    await button('Use as template');
    await waitFor(`Boolean(document.querySelector('[aria-label="Actions for My shortcut"]'))`);
    await waitFor(`JSON.parse(document.querySelector('.code-preview').textContent).metadata.author.at(-1) === 'runner'`);
    assert.equal(await evaluate(`localStorage.getItem('sotn-preset-generator.author')`), 'Settings author');
    await click('[aria-label="Actions for Bundled option"]');
    assert.equal(await evaluate(`document.querySelector('.option-actions-menu').textContent.trim()`), 'View');
    await evaluate(`document.querySelector('.option-actions-menu').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await click('[aria-label="Actions for My shortcut"]'); await click('.option-actions-menu button:nth-child(2)');
    await waitFor(`Boolean(document.querySelector('.share-dialog[open]'))`);
    await button('Cancel');
    assert.equal(await evaluate(`window.__calls.filter(c => c.action === 'shareOption').length`), 0);
    await click('[aria-label="Actions for My shortcut"]'); await click('.option-actions-menu button:nth-child(2)');
    await evaluate('window.__failNextShare = true');
    await button('Share publicly');
    await waitFor(`document.querySelector('.share-dialog .community-error')?.textContent.includes('Test service unavailable')`);
    assert.equal(await evaluate(`window.__calls.filter(c => c.action === 'shareOption').length`), 1);
    await button('Share publicly');
    await waitFor(`window.__calls.some(c => c.action === 'shareOption' && c.localId === 1)`);
    await waitFor(`!document.querySelector('.share-dialog')`);
    assert.equal(await evaluate(`window.__calls.filter(c => c.action === 'shareOption').length`), 2);
    await button('Community'); await button('Login'); await button('Sign out'); await click('[aria-label="Close login"]');
    await waitFor(`JSON.parse(document.querySelector('.code-preview').textContent).metadata.author.at(-1) === 'Settings author'`);
    assert.equal(await evaluate(`JSON.parse(document.querySelector('.code-preview').textContent).metadata.author.includes('runner')`), false);
    await button('Share');
    await waitFor(`Boolean(document.querySelector('.login-dialog[open]'))`);
    await fill('#loginUsername', 'runner'); await fill('#loginPassword', 'ExamplePassword!1'); await click('.login-dialog button[type="submit"]');
    await waitFor(`Boolean(document.querySelector('.share-dialog[open]'))`);
    assert.equal(await evaluate(`window.__calls.filter(c => c.action === 'sharePreset' || c.action === 'export').length`), 0);
    await screenshot('community-share.png');
    await button('Share publicly');
    await waitFor(`window.__calls.some(c => c.action === 'sharePreset')`);
    const calls = await evaluate(`window.__calls.filter(c => c.action === 'export' || c.action === 'sharePreset')`);
    assert.deepEqual(calls.map(c => c.action), ['export', 'sharePreset']);
    assert.equal(calls[1].buildToken, 'verified-build');
    assert.equal(JSON.parse(calls[0].json).metadata.author.at(-1), 'runner');
    assert.equal(JSON.parse(calls[0].json).metadata.author.includes('Settings author'), false);
    await waitFor(`!document.querySelector('.share-dialog')`);
    await screenshot('community-local-editor.png');
    await click('[aria-label="Actions for My shortcut"]');
    await screenshot('option-actions.png');
    await evaluate(`document.querySelector('.option-actions-menu button').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))`);
    assert.equal(await evaluate(`document.activeElement.textContent.trim()`), 'Delete');
    await click('.option-actions-menu button:last-child');
    await button('Cancel');
    assert.equal(await evaluate(`window.__calls.filter(c => c.action === 'deleteOption').length`), 0);
    await click('[aria-label="Actions for My shortcut"]');
    await click('.option-actions-menu button:last-child');
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem('sotn-preset-generator.presets.v1')).some(p => p.optionIds.includes('option:1'))`), true);
    await button('Delete option');
    await waitFor(`!document.querySelector('[aria-label="Actions for My shortcut"]')`);
    assert.equal(await evaluate(`window.__calls.filter(c => c.action === 'deleteOption').length`), 1);
    await waitFor(`!JSON.parse(localStorage.getItem('sotn-preset-generator.presets.v1')).some(p => p.optionIds.includes('option:1'))`);
    await win.webContents.reload();
    await click('[aria-label="Edit Castle challenge"]');
    await waitFor(`JSON.parse(document.querySelector('.code-preview').textContent).metadata.author.at(-1) === 'runner'`);
    assert.equal(await evaluate(`Boolean(document.querySelector('.login-dialog'))`), false);
    await win.setSize(850, 700);
    await screenshot('community-local-editor-small.png');
    await fs.writeFile(path.join(__dirname, '../dist/community-ui-result.json'), JSON.stringify({ passed: true, completedAt: new Date().toISOString() }));
    console.log('Community UI checks passed: cards, pagination, original JSON, login tabs, password mismatch, vote transitions, option sharing, cancel, login-resume, and verified preset sharing.');
  } finally {
    win.destroy();
    // Electron may retain profile handles until app exit; leave this isolated OS-temp profile for cleanup.
    app.quit();
  }
}
main().catch(async error => { console.error(error); await fs.writeFile(path.join(__dirname, '../dist/community-ui-result.json'), JSON.stringify({ passed: false, error: String(error) })); app.exit(1); });
