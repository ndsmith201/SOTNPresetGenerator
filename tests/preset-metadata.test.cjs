const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildPreviewPreset } = require("../dist/renderer/preset-utils.js");
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
