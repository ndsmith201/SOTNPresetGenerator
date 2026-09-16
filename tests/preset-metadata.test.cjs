const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildPreviewPreset, createPresetFromTemplate, persistPresets, loadPresets, toPresetOptions, calculatePresetMaxComplexity } = require("../dist/renderer/preset-utils.js");
const { DEFAULT_BUILT_IN_SETTINGS } = require("../dist/renderer/constants.js");

const preset = {
  id: "stable-local-id", name: "Renamed preset", optionIds: [], complexity: 1,
  metaExtension: "Guarded", builtInSettings: DEFAULT_BUILT_IN_SETTINGS,
  createdAt: "", updatedAt: ""
};

test("generated metadata uses the current name and appends the configured author without mutating saved inputs", () => {
  const template = { metadata: { name: "Old name", author: ["Template author"], description: "Keep" } };
  const original = structuredClone(template);
  const result = buildPreviewPreset(template, preset, [], "  New author  ");
  assert.equal(result.metadata.name, "Renamed preset");
  assert.equal(result.metadata.id, "renamed-preset");
  assert.deepEqual(result.metadata.author, ["Template author", "New author"]);
  assert.equal(result.metadata.description, "Keep");
  assert.deepEqual(template, original);
  assert.equal(preset.id, "stable-local-id");
  assert.deepEqual(buildPreviewPreset(template, preset, [], "  ").metadata.author, ["Template author"]);
});

test("raw JSON options cannot replace the preset name and their authors precede the configured author", () => {
  const raw = { id: "raw", label: "Metadata", category: "world", injectedWrites: [], gameInitWrites: [], appendedWrites: [],
    previewJson: { metadata: { name: "Option name", author: ["Option author"], description: "Custom" } } };
  const original = structuredClone(raw);
  const result = buildPreviewPreset({}, { ...preset, optionIds: [raw.id] }, [raw], "Configured author");
  assert.equal(result.metadata.name, preset.name);
  assert.equal(result.metadata.id, "renamed-preset");
  assert.deepEqual(result.metadata.author, ["Option author", "Configured author"]);
  assert.equal(result.metadata.description, "Custom");
  assert.deepEqual(raw, original);
});

test("configured author creates an author list when generated metadata has none", () => {
  const result = buildPreviewPreset({}, preset, [], "Configured author");
  assert.deepEqual(result.metadata.author, ["Configured author"]);
});

test("a saved preset description overrides template and raw option metadata", () => {
  const template = { metadata: { description: "Template description", author: [] } };
  const raw = { id: "raw", label: "Metadata", category: "world", injectedWrites: [], gameInitWrites: [], appendedWrites: [],
    previewJson: { metadata: { description: "Option description", author: ["Option author"] } } };
  const original = structuredClone({ template, raw });
  const draft = { ...preset, optionIds: [raw.id], description: "A custom route.\nWith shortcuts." };
  const output = buildPreviewPreset(template, draft, [raw], "runner");
  assert.equal(output.metadata.description, draft.description);
  assert.deepEqual(output.metadata.author, ["Option author", "runner"]);
  assert.deepEqual({ template, raw }, original);
});

const bundled = require('../templates/preset-template.json');
const communitySource = { ...bundled, metadata: { ...bundled.metadata, name: 'Castle challenge', author: ['Original author'], description: 'Original route' } };

test('unchanged template copies keep their authors through normalization and reload', () => {
  const source = { ...communitySource, complexityGoal: { min: 999 }, inherits: 'parent' };
  const copy = createPresetFromTemplate(source.metadata.name, source);
  const original = structuredClone(copy);
  const maximum = calculatePresetMaxComplexity(bundled, copy, []);
  assert.deepEqual(buildPreviewPreset(bundled, copy, [], 'runner').metadata.author, ['Original author']);
  const clamped = { ...copy, complexity: maximum, description: source.metadata.description, updatedAt: 'new timestamp' };
  assert.deepEqual(buildPreviewPreset(bundled, clamped, [], 'runner').metadata.author, ['Original author']);
  let saved;
  const previousStorage = global.localStorage;
  global.localStorage = { getItem: () => saved, setItem: (_key, value) => { saved = value; } };
  try {
    persistPresets([clamped]);
    const [loaded] = loadPresets(new Set());
    assert.deepEqual(buildPreviewPreset(bundled, loaded, [], 'someone else').metadata.author, ['Original author']);
  } finally { global.localStorage = previousStorage; }
  assert.deepEqual(copy, original);
});

test('name, description, modes, extension, and complexity edits add an author; reverting removes the addition', () => {
  const copy = createPresetFromTemplate(communitySource.metadata.name, communitySource);
  const changes = [
    { name: 'My castle' }, { description: 'Different route' },
    { builtInSettings: { ...copy.builtInSettings, music: !copy.builtInSettings.music } },
    { metaExtension: 'Scenic' }, { complexity: 2 }
  ];
  for (const change of changes) {
    const edited = { ...copy, ...change };
    assert.deepEqual(buildPreviewPreset(bundled, edited, [], 'runner').metadata.author, ['Original author', 'runner'], JSON.stringify(change));
  }
  assert.deepEqual(buildPreviewPreset(bundled, copy, [], 'runner').metadata.author, ['Original author']);
});

test('preselected inherited options are not edits, but adding or removing options is', () => {
  const options = toPresetOptions([
    { id: 1, comment: 'Original option', description: '', category: 'gameplay', rawJson: true, value: '{"music":false}', writes: [], readOnly: false },
    { id: 2, comment: 'New option', description: '', category: 'gameplay', rawJson: true, value: '{"customRule":true}', writes: [], readOnly: false }
  ]);
  const source = { ...communitySource, music: false };
  const copy = createPresetFromTemplate(source.metadata.name, source, options);
  assert.deepEqual(copy.optionIds, ['option:1']);
  assert.deepEqual(buildPreviewPreset(bundled, copy, options, 'runner').metadata.author, ['Original author']);
  for (const optionIds of [[], ['option:1', 'option:2']]) {
    assert.deepEqual(buildPreviewPreset(bundled, { ...copy, optionIds }, options, 'runner').metadata.author, ['Original author', 'runner']);
  }
  assert.deepEqual(buildPreviewPreset(bundled, copy, options, 'runner').metadata.author, ['Original author']);
});

test('existing authors are matched without case or surrounding whitespace and never duplicated', () => {
  for (const author of ['runner', 'RUNNER', ' runner ']) {
    const source = { ...communitySource, metadata: { ...communitySource.metadata, author: ['Original author', author] } };
    const copy = createPresetFromTemplate('Edited castle', source);
    for (let i = 0; i < 3; i++) {
      assert.deepEqual(buildPreviewPreset(bundled, copy, [], ' runner ').metadata.author, source.metadata.author);
    }
  }
});
