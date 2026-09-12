// Run after building: electron tests/option-authoring-ui.cjs
// Real renderer in a hidden window; fake IPC and an isolated profile protect user data.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sotn-authoring-ui-'));
  app.setPath('userData', path.join(directory, 'profile'));
  await app.whenReady();
  const template = JSON.parse(await fs.readFile(path.join(__dirname, '../templates/preset-template.json'), 'utf8'));
  const preload = path.join(directory, 'preload.cjs');
  await fs.writeFile(preload, `
    const template = ${JSON.stringify(template)};
    const source = { id: 1, readOnly: true, comment: 'ITS OVER 9000 Mode', description: 'Start with all stats at 99.', category: 'gameplay', type: 'word', value: '0x34020063', address: null, gameInit: false, statEdit: true, rawJson: false, additionalWrites: ['0xa0627bc0','0xa0627bb8','0xa0627bbc','0xa0627bc4'].map(value => ({ type: 'word', value })) };
    let options = [source, { ...source, id: 2, comment: 'JSON example', type: 'word', rawJson: true, statEdit: false, value: '{"enemyDrops":true}', additionalWrites: [] }];
    let nextId = 3;
    const { id: localId, readOnly: localReadOnly, ...publicWrite } = source;
    publicWrite.address = '0x00123456';
    publicWrite.primaryWrite = { type: 'word', value: source.value, address: publicWrite.address, comment: 'Shared first write' };
    const publicOptions = [publicWrite, { comment: 'Shared JSON', category: 'gameplay', type: 'word', value: '{"enemyDrops":true}', rawJson: true }].map((data, index) => ({ id: 'shared-' + index, kind: 'options', data, upvotes: 2, downvotes: 0, score: 2, createdAt: new Date().toISOString(), createdBy: 'tester' }));
    window.__calls = [];
    if (!localStorage.getItem('sotn-preset-generator.presets.v1')) localStorage.setItem('sotn-preset-generator.presets.v1', JSON.stringify(['Test preset','Other preset'].map((name, i) => ({ id: String(i), name, optionIds: [], complexity: 1, metaExtension: 'Guarded', builtInSettings: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }))));
    window.presetApp = {
      updates: { async getState() { return { phase: 'idle', currentVersion: 'test' }; }, onState() { return () => {}; } },
      platform: 'win32', version: 'test', windowControls: { close() {}, minimize() {}, toggleMaximize() {} },
      async getDefaultSotnRandoPath() { return null; }, async getPresetTemplate() { return template; },
      async listOptions() { return { status: 'ok', options }; }, async getSuccessfulExports() { return {}; },
      async community(request) {
        if (request.action === 'get') return { status: 'ok', data: publicOptions.find(item => item.id === request.id) };
        return { status: 'ok', data: request.action === 'status' ? { signedIn: false, config: {} } : { items: request.kind === 'options' ? publicOptions : [] } };
      },
      async createOption(input) {
        window.__calls.push({ action: 'create', input });
        if (window.__failNextSave) { window.__failNextSave = false; return { status: 'error', error: 'Test save failed' }; }
        const option = { id: nextId++, readOnly: false, address: null, gameInit: false, statEdit: false, rawJson: false, additionalWrites: [], ...input };
        options.push(option); return { status: 'created', option };
      },
      async updateOption(id, input) {
        window.__calls.push({ action: 'update', id, input });
        const option = { id, readOnly: false, address: null, gameInit: false, statEdit: false, rawJson: false, additionalWrites: [], ...input };
        options = options.map(item => item.id === id ? option : item); return { status: 'updated', option };
      }
    };
  `);
  const win = new BrowserWindow({ show: false, width: 1500, height: 1050, webPreferences: { preload, contextIsolation: false, sandbox: false, backgroundThrottling: false, offscreen: true } });
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const waitFor = async expression => {
    for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 40)); }
    throw new Error('Timed out: ' + expression);
  };
  const click = async selector => { await waitFor(`Boolean(document.querySelector(${JSON.stringify(selector)}))`); await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); };
  const button = async label => {
    const expression = `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)} && b.checkVisibility())`;
    await waitFor(`Boolean(${expression})`); await evaluate(`(${expression}).click()`);
  };
  const fill = (selector, value) => evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); })()`);
  const screenshot = async name => {
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await new Promise(resolve => setTimeout(resolve, 150));
    await fs.writeFile(path.join(__dirname, '../dist', name), (await win.webContents.capturePage()).toPNG());
  };
  const field = (row, name) => `[aria-label="Write ${row} ${name}"]`;
  const assertLayout = async () => {
    assert.equal(await evaluate(`(() => { const d = document.querySelector('.option-builder'); const s = d.querySelector('.builder-scroll'); const f = d.querySelector('.builder-footer').getBoundingClientRect(); return d.scrollWidth <= d.clientWidth + 1 && s.scrollWidth <= s.clientWidth + 1 && f.bottom <= innerHeight && f.top > 0; })()`), true, 'Dialog must fit horizontally and keep its footer visible');
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('.builder-write-address input')).every(input => input.getBoundingClientRect().width >= 120)`), true, 'Addresses must have usable input width');
  };
  try {
    await win.loadFile(path.join(__dirname, '../dist/renderer/index.html'));
    await click('[aria-label="Edit Test preset"]');
    await button('+ New option');
    await waitFor(`document.querySelector('.option-builder[open]')?.textContent.includes('How would you like to start?')`);
    await fill('[aria-label="Search options to copy"]', '9000');
    await click('.builder-copy-result input');
    await screenshot('option-authoring-start.png');
    await button('Continue →');
    assert.equal(await evaluate(`document.querySelectorAll('.builder-write-address input').length`), 5);
    await fill('#optionCommentInput', 'My stat boost');
    await fill(field(2, 'address (optional)'), '0x00123456');
    await fill(field(2, 'note (optional)'), 'My addressed write');
    await click('[aria-label="Move write 2 up"]');
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(field(1, 'address (optional)'))}).value`), '0x00123456');
    await assertLayout();
    await screenshot('option-authoring-editor.png');
    // Actual minimum app size, including a short viewport.
    win.webContents.enableDeviceEmulation({ screenPosition: 'desktop', screenSize: { width: 720, height: 520 }, viewPosition: { x: 0, y: 0 }, deviceScaleFactor: 1, viewSize: { width: 720, height: 520 }, scale: 1 });
    await waitFor('innerWidth <= 720');
    await assertLayout();
    await evaluate(`document.querySelector('.builder-write-row').scrollIntoView({ block: 'start' })`);
    await screenshot('option-authoring-narrow.png');
    win.webContents.disableDeviceEmulation();
    await waitFor('innerWidth > 1400');
    await evaluate(`document.querySelector('.builder-scroll').scrollTop = 0`);
    await button('Back'); await button('Continue →');
    assert.equal(await evaluate(`document.querySelector('#optionCommentInput').value`), 'My stat boost', 'Back/continue must preserve edits');
    await fill(field(3, 'address (optional)'), 'invalid');
    await button('Create option');
    await waitFor(`document.querySelector('.builder-footer [role="alert"]').textContent.includes('Write 3: address')`);
    assert.equal(await evaluate('window.__calls.length'), 0);
    await fill(field(3, 'address (optional)'), '');
    // Advanced JSON edits cannot silently be lost on save or mode change.
    await click('.builder-advanced summary');
    const sequence = await evaluate(`JSON.parse(document.querySelector('.builder-advanced textarea').value)`);
    sequence[0].custom = { retained: true };
    await fill('.builder-advanced textarea', JSON.stringify(sequence));
    assert.equal(await evaluate(`document.querySelector('.builder-footer button[type="submit"]').disabled`), true);
    await button('Apply JSON');
    await fill('#optionModeSelect', 'json');
    await fill('#optionJsonInput', '{"enemyDrops":false}');
    await fill('#optionModeSelect', 'write');
    assert.equal(await evaluate(`document.querySelectorAll('.builder-write-address input').length`), 5);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(field(1, 'address (optional)'))}).value`), '0x00123456');
    await click('.builder-enable input');
    await evaluate('window.__failNextSave = true');
    await button('Create option');
    await waitFor(`document.querySelector('.builder-footer [role="alert"]').textContent.includes('Test save failed')`);
    await button('Create option');
    await waitFor(`!document.querySelector('.option-builder[open]')`);
    const input = await evaluate('window.__calls.at(-1).input');
    assert.equal(input.address, '0x00123456');
    assert.equal(input.primaryWrite.comment, 'My addressed write');
    assert.deepEqual(input.primaryWrite.custom, { retained: true });
    assert.equal(input.additionalWrites[1].address, undefined);
    const presets = await evaluate(`JSON.parse(localStorage.getItem('sotn-preset-generator.presets.v1'))`);
    assert.deepEqual(presets.find(p => p.id === '0').optionIds, ['option:3']);
    assert.deepEqual(presets.find(p => p.id === '1').optionIds, []);
    // Reopen an editable copy and verify saving an address removal.
    await click('[aria-label="Actions for My stat boost"]'); await button('Edit');
    await waitFor(`Boolean(document.querySelector('.option-builder[open]'))`);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(field(1, 'address (optional)'))}).value`), '0x00123456');
    await fill(field(1, 'address (optional)'), '');
    await button('Save changes'); await waitFor(`!document.querySelector('.option-builder[open]')`);
    assert.equal(await evaluate('window.__calls.at(-1).input.primaryWrite.address'), undefined);
    // Registered options stay protected and remain selectable for copying.
    await click('[aria-label="Actions for ITS OVER 9000 Mode"]'); await button('View');
    assert.equal(await evaluate(`document.querySelectorAll('.option-builder input:not([readonly]), .option-builder textarea:not([readonly])').length`), 0);
    assert.equal(await evaluate(`Boolean(document.querySelector('.option-builder button[type="submit"]'))`), false);
    await button('Close');
    await button('+ New option');
    await click('.builder-path:nth-child(3)'); await button('Continue →');
    await fill('#optionCommentInput', 'Custom JSON');
    await fill('#optionJsonInput', '[]'); await button('Create option');
    await waitFor(`document.querySelector('.builder-footer [role="alert"]').textContent.includes('must be an object')`);
    await fill('#optionJsonInput', '{"enemyDrops":false}');
    await screenshot('option-authoring-json.png');
    await button('Create option'); await waitFor(`!document.querySelector('.option-builder[open]')`);
    const jsonInput = await evaluate('window.__calls.at(-1).input');
    assert.equal(jsonInput.rawJson, true);
    assert.equal(jsonInput.primaryWrite, undefined);
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem('sotn-preset-generator.presets.v1')).some(p => p.optionIds.includes('option:4'))`), false);
    // Community viewing reuses the authoring form, without save or mutation controls.
    await click('[aria-label="Back to presets"]');
    await click('[aria-label="View community option ITS OVER 9000 Mode"]');
    await waitFor(`Boolean(document.querySelector('.option-builder-inline'))`);
    assert.equal(await evaluate(`document.querySelectorAll('#optionDialogTitle').length`), 1);
    assert.equal(await evaluate(`document.querySelectorAll('.option-builder-inline input:not([readonly]), .option-builder-inline textarea:not([readonly]), .option-builder-inline select:not(:disabled)').length`), 0);
    assert.equal(await evaluate(`document.querySelectorAll('.builder-write-address input').length`), 5);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(field(1, 'address (optional)'))}).value`), '0x00123456');
    assert.equal(await evaluate(`document.querySelectorAll('.builder-mode-select svg rect').length`), 2, 'CPU icon is shared with creation');
    assert.equal(await evaluate(`document.querySelectorAll('.builder-add-write, .builder-remove, .builder-move-buttons, .builder-enable, .option-builder-inline button[type="submit"], .builder-grip[draggable="true"]').length`), 0);
    const callsBeforeView = await evaluate('window.__calls.length');
    await fill('#optionCommentInput', 'Attempted edit');
    assert.equal(await evaluate(`document.querySelector('#optionCommentInput').value`), 'ITS OVER 9000 Mode');
    await evaluate(`document.querySelector('.option-builder-inline form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`);
    assert.equal(await evaluate('window.__calls.length'), callsBeforeView);
    await click('.builder-advanced summary');
    assert.equal(await evaluate(`JSON.parse(document.querySelector('.builder-advanced textarea').value)[0].comment`), 'Shared first write');
    await assertLayout();
    await screenshot('option-view-community.png');
    await button('Close');
    await click('[aria-label="View community option Shared JSON"]');
    await waitFor(`Boolean(document.querySelector('.option-builder-inline #optionJsonInput'))`);
    assert.equal(await evaluate(`document.querySelector('#optionJsonInput').readOnly`), true);
    assert.equal(await evaluate(`document.querySelector('#optionJsonInput').value`), '{"enemyDrops":true}');
    assert.equal(await evaluate(`document.querySelectorAll('.builder-write-row').length`), 0);
    await screenshot('option-view-community-json.png');
    await button('Close');
    assert.equal(await evaluate('window.__calls.length'), callsBeforeView);
    console.log('Option authoring UI passed, including the shared read-only community viewer for writes and JSON.');
  } finally { win.destroy(); }
}

const finish = (error) => {
  require('node:fs').writeFileSync(path.join(__dirname, '../dist/option-authoring-ui-result.json'), JSON.stringify({ passed: !error, error: error?.stack ?? null }, null, 2));
  if (error) console.error(error);
  app.exit(error ? 1 : 0);
};
main().then(() => finish(), finish);
