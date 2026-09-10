const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

// No network, installer, or actual app restart: test the renderer with a fake update bridge.
async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sotn-update-ui-'));
  app.setPath('userData', path.join(root, 'profile'));
  await app.whenReady();
  const template = JSON.parse(await fs.readFile(path.join(__dirname, '../templates/preset-template.json'), 'utf8'));
  const preload = path.join(root, 'preload.cjs');
  await fs.writeFile(preload, `
    const template = ${JSON.stringify(template)};
    const release = { version: '9.0.0', pageUrl: 'https://github.com/ndsmith201/SOTNPresetGenerator/releases/tag/v9.0.0', automatic: true };
    let state = { phase: 'available', currentVersion: '0.1.2', release };
    const listeners = new Set();
    window.__updateCalls = [];
    window.__updateState = phase => { state = { ...state, phase, error: phase === 'error' ? 'Test download failed' : undefined }; listeners.forEach(listener => listener(state)); };
    window.__portableUpdate = () => { state = { ...state, phase: 'available', release: { ...release, automatic: false } }; listeners.forEach(listener => listener(state)); };
    localStorage.setItem('sotn-preset-generator.presets.v1', JSON.stringify([{ id: 'saved-draft', name: 'Keep my preset', optionIds: [], complexity: 1, createdAt: '', updatedAt: '' }]));
    window.presetApp = {
      platform: 'win32', version: '0.1.2', windowControls: { close() {}, minimize() {}, toggleMaximize() {} },
      async getDefaultSotnRandoPath() { return ''; }, async getPresetTemplate() { return template; },
      async listOptions() { return { status: 'ok', options: [] }; }, async getSuccessfulExports() { return {}; },
      async community(request) { return { status: 'ok', data: request.action === 'list' ? { items: [] } : { signedIn: false, email: '', config: {}, remembered: false } }; },
      updates: {
        async getState() { return state; },
        onState(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        async install() { window.__updateCalls.push('install'); window.__updateState('downloading'); return { status: 'ok' }; },
        async restart() { window.__updateCalls.push('restart'); window.__savedAtRestart = JSON.parse(localStorage.getItem('sotn-preset-generator.presets.v1')); window.__updateState('restarting'); return { status: 'ok' }; },
        async openDownload() { window.__updateCalls.push('download'); return { status: 'ok' }; }
      }
    };
  `);
  const win = new BrowserWindow({ show: false, width: 1100, height: 760, webPreferences: { preload, contextIsolation: false, sandbox: false, backgroundThrottling: false } });
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const waitFor = async expression => {
    for (let i = 0; i < 120; i++) {
      if (await evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Timed out: ' + expression);
  };
  const click = async text => {
    const expression = `[...document.querySelectorAll('.update-dialog button')].find(button => button.textContent === ${JSON.stringify(text)})`;
    await waitFor(`Boolean(${expression})`); await evaluate(`(${expression}).click()`);
  };
  try {
    await win.loadFile(path.join(__dirname, '../dist/renderer/index.html'));
    await waitFor(`Boolean(document.querySelector('.update-dialog[open]'))`);
    assert.equal(await evaluate(`window.__updateCalls.length`), 0);
    await new Promise(resolve => setTimeout(resolve, 200));
    await fs.writeFile(path.join(__dirname, '../dist/startup-update.png'), (await win.webContents.capturePage()).toPNG());
    await click('Later');
    await waitFor(`!document.querySelector('.update-dialog')`);
    assert.equal(await evaluate(`window.__updateCalls.length`), 0);
    await win.reload();
    await waitFor(`Boolean(document.querySelector('.update-dialog[open]'))`);
    await click('Update and restart');
    await waitFor(`document.querySelector('.update-dialog [role="status"]')?.textContent.includes('Downloading')`);
    assert.deepEqual(await evaluate(`window.__updateCalls`), ['install']);
    await evaluate(`document.querySelector('.update-dialog').dispatchEvent(new Event('cancel', { cancelable: true }))`);
    assert.equal(await evaluate(`Boolean(document.querySelector('.update-dialog[open]'))`), true);
    await evaluate(`window.__updateState('error')`);
    await waitFor(`document.querySelector('.update-dialog [role="alert"]')?.textContent.includes('Test download failed')`);
    await click('Update and restart');
    await evaluate(`window.__updateState('ready')`);
    await waitFor(`window.__updateCalls.includes('restart')`);
    assert.deepEqual(await evaluate(`window.__updateCalls`), ['install', 'install', 'restart']);
    assert.equal(await evaluate(`window.__savedAtRestart[0].name`), 'Keep my preset');
    await win.reload();
    await waitFor(`Boolean(document.querySelector('.update-dialog[open]'))`);
    await evaluate(`window.__portableUpdate()`);
    await click('Download update');
    await waitFor(`!document.querySelector('.update-dialog')`);
    assert.deepEqual(await evaluate(`window.__updateCalls`), ['download']);
    await fs.writeFile(path.join(__dirname, '../dist/update-ui-result.json'), JSON.stringify({ passed: true, completedAt: new Date().toISOString() }));
  } finally { win.destroy(); app.quit(); }
}
main().catch(async error => { await fs.writeFile(path.join(__dirname, '../dist/update-ui-result.json'), JSON.stringify({ passed: false, error: String(error) })); app.exit(1); });
