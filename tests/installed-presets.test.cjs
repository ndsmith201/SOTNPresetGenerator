const assert = require("node:assert/strict");
const { test } = require("node:test");
const { mkdtemp, mkdir, readFile, writeFile, rm } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { listInstalledPresets, writeNewPreset } = require("../dist/installed-presets.js");
const { buildPreviewPreset, calculateMaxComplexity, calculatePresetMaxComplexity, createPresetFromTemplate, loadPresets, persistPresets } = require("../dist/renderer/preset-utils.js");
const { DEFAULT_BUILT_IN_SETTINGS, META_EXTENSIONS } = require("../dist/renderer/constants.js");
const { RELIC_LOCATION_CHECKS } = require("../dist/renderer/relic-location-checks.js");
const bundledTemplate = require("../templates/preset-template.json");

test("installed discovery reads all JSON files, reports bad files, and never changes source bytes", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sotn-installed-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "presets"));
  const source = '{ "metadata": { "name": "Existing" }, "music": true }\n';
  const sourcePath = path.join(root, "presets", "existing.json");
  await writeFile(sourcePath, source);
  await writeFile(path.join(root, "presets", "unregistered.JSON"), "{}");
  await writeFile(path.join(root, "presets", "bad.json"), "not json");
  await writeFile(path.join(root, "presets", "array.json"), "[]");
  await writeFile(path.join(root, "presets", "ignore.js"), "ignored");
  await mkdir(path.join(root, "presets", "directory.json"));
  const result = await listInstalledPresets(root);
  assert.deepEqual(result.presets.map((preset) => preset.fileName), ["existing.json", "unregistered.JSON"]);
  assert.equal(result.warnings.length, 2);
  const draft = createPresetFromTemplate("My copy", result.presets[0].json);
  buildPreviewPreset({}, draft, []);
  assert.equal(await readFile(sourcePath, "utf8"), source);
  await assert.rejects(writeNewPreset(sourcePath, { music: false }), /read-only/);
  assert.equal(await readFile(sourcePath, "utf8"), source);
  const newPath = path.join(root, "presets", "new.json");
  await writeNewPreset(newPath, { music: false });
  assert.deepEqual(JSON.parse(await readFile(newPath, "utf8")), { music: false });
  await assert.rejects(listInstalledPresets(path.join(root, "missing")), /ENOENT/);
});

test("installed templates preserve settings and metadata, replace locks and omit inheritance in the generated copy", () => {
  const source = {
    metadata: { name: "Original", author: ["Original author"], metaExtension: "Scenic", transformEarly: "No", transformFocus: "None" },
    complexityGoal: { min: 5, goals: ["Custom goal"] },
    relicLocationsExtension: "scenic", tournamentMode: false, music: true,
    lockLocation: [{ location: "Custom location", locks: ["Custom relic"] }],
    writes: [{ type: "word", value: "0x1234", comment: "Original write" }],
    placeRelic: [{ location: "Silver ring", relic: "Silver ring" }],
    inherits: "adventure"
  };
  const original = structuredClone(source);
  const preset = createPresetFromTemplate("My copy", source);
  assert.equal(preset.metaExtension, "Scenic");
  assert.equal(preset.complexity, 5);
  const output = buildPreviewPreset(bundledTemplate, preset, []);
  assert.equal(output.metadata.name, "My copy");
  assert.equal(output.metadata.id, "my-copy");
  assert.equal(output.metadata.transformFocus, "None");
  assert.equal(output.metadata.transformEarly, "No");
  assert.deepEqual(output.metadata.author, ["Original author"]);
  assert.equal(output.complexityGoal.min, 5);
  assert.equal(output.unrelated, undefined);
  for (const [key, value] of Object.entries(DEFAULT_BUILT_IN_SETTINGS)) assert.equal(output[key], source[key] ?? value, key);
  for (const key of ["writes", "placeRelic"]) assert.deepEqual(output[key], source[key]);
  assert.equal(Object.hasOwn(output, "inherits"), false);
  assert.deepEqual(output.lockLocation, bundledTemplate.lockLocation.filter((entry) => RELIC_LOCATION_CHECKS.Scenic.includes(entry.location)));
  assert.deepEqual(source, original);
  output.writes[0].value = "changed";
  assert.deepEqual(preset.baseTemplate, original);
  source.metadata.name = "External change";
  assert.deepEqual(preset.baseTemplate, original);
});

test("template copies survive local storage reload without a configured path", () => {
  let stored;
  const previousStorage = global.localStorage;
  global.localStorage = { getItem: () => stored, setItem: (_key, value) => { stored = value; } };
  try {
    const preset = createPresetFromTemplate("Saved copy", { relicLocationsExtension: false, music: true, complexityGoal: { min: 3 } });
    persistPresets([preset]);
    const [loaded] = loadPresets(new Set());
    assert.equal(loaded.metaExtension, "Classic");
    assert.deepEqual(loaded.baseTemplate, preset.baseTemplate);
    assert.equal(buildPreviewPreset(bundledTemplate, loaded, []).music, true);
    assert.equal(buildPreviewPreset(null, loaded, []), null);
    const standard = createPresetFromTemplate("Default");
    assert.equal(standard.baseTemplate, undefined);
    assert.equal(buildPreviewPreset({ customDefault: true }, standard, []).customDefault, true);
  } finally {
    global.localStorage = previousStorage;
  }
});

test("installed drafts switch between every extension using bundled locks and matching complexity", () => {
  const source = { inherits: "old-parent", lockLocation: [{ location: "Soul of Bat", locks: ["Custom relic"] }], complexityGoal: { min: 999, goals: [] } };
  const preset = createPresetFromTemplate("Copy", source);
  const originalTemplate = structuredClone(bundledTemplate);
  for (const metaExtension of [...META_EXTENSIONS, "Guarded"]) {
    const switched = { ...preset, metaExtension };
    const expectedMaximum = calculateMaxComplexity({ ...bundledTemplate, complexityGoal: source.complexityGoal }, [], metaExtension);
    assert.equal(calculatePresetMaxComplexity(bundledTemplate, switched, []), expectedMaximum);
    const output = buildPreviewPreset(bundledTemplate, switched, [], undefined, expectedMaximum);
    assert.deepEqual(output.lockLocation, bundledTemplate.lockLocation.filter((entry) => RELIC_LOCATION_CHECKS[metaExtension].includes(entry.location)));
    assert.equal(output.complexityGoal.min, expectedMaximum);
    assert.equal(Object.hasOwn(output, "inherits"), false);
  }
  assert.deepEqual(bundledTemplate, originalTemplate);
  assert.deepEqual(preset.baseTemplate, source);
});

test("replacement locks still apply starting relics and restore bundled requirements on deselection", () => {
  const template = { lockLocation: [{ location: "Soul of Bat", locks: ["Form of Mist"], escapeRequires: ["Form of Mist"], customField: true }] };
  const originalTemplate = structuredClone(template);
  const preset = createPresetFromTemplate("Copy", { inherits: "parent" });
  const option = { id: "mist", label: "Enable Form of Mist", category: "relics", injectedWrites: [], gameInitWrites: [], appendedWrites: [], previewJson: null };
  const output = buildPreviewPreset(template, { ...preset, optionIds: [option.id] }, [option]);
  assert.deepEqual(output.lockLocation, [{ location: "Soul of Bat", locks: [], escapeRequires: [], customField: true }]);
  assert.deepEqual(buildPreviewPreset(template, preset, [option]).lockLocation, originalTemplate.lockLocation);
  assert.deepEqual(template, originalTemplate);
  assert.equal(preset.baseTemplate.inherits, "parent");
});
