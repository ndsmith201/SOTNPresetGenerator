const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildPreviewPreset } = require("../dist/renderer/preset-utils.js");
const { DEFAULT_BUILT_IN_SETTINGS } = require("../dist/renderer/constants.js");
const template = require("../templates/preset-template.json");
const preset = { id: "escape", name: "Escape", optionIds: [], complexity: 1,
  metaExtension: "Scenic", builtInSettings: DEFAULT_BUILT_IN_SETTINGS, createdAt: "", updatedAt: "" };
const option = (name, extra = {}) => ({ id: name, label: `Enable ${name}`, category: "relics",
  injectedWrites: [], gameInitWrites: [], appendedWrites: [], previewJson: null, ...extra });
function preview(input, names) {
  const options = names.map((name) => option(name));
  return buildPreviewPreset(input, { ...preset, optionIds: names }, options);
}
const entry = (escapeRequires) => ({ location: "Holy glasses", locks: ["Silver ring + Gold ring"],
  escapeRequires, comment: "Keep", block: ["Soul of Bat"] });

test("one fulfilled escape alternative clears only escape requirements, not entry locks or blocks", () => {
  const check = entry(["Gravity Boots + Leap Stone", "Soul of Bat", "Form of Mist + Power of Mist"]);
  assert.deepEqual(preview({ lockLocation: [check] }, ["Soul of Bat"]).lockLocation, [{ ...check, escapeRequires: [] }]);
});

test("combinations require all selected relics and partial progress leaves escape requirements intact", () => {
  const check = entry(["Gravity Boots + Leap Stone", "Form of Mist + Power of Mist"]);
  for (const names of [["Gravity Boots"], ["Leap Stone"], ["Form of Mist"], ["Power of Mist"],
    ["Gravity Boots", "Form of Mist"], ["Soul of Wolf", "Power of Wolf"]]) {
    assert.deepEqual(preview({ lockLocation: [check] }, names).lockLocation, [check]);
  }
  for (const names of [["Gravity Boots", "Leap Stone"], ["Form of Mist", "Power of Mist"]]) {
    assert.deepEqual(preview({ lockLocation: [check] }, names).lockLocation[0].escapeRequires, []);
  }
});

test("escape matching trims whitespace, matches exact names, and ignores malformed alternatives", () => {
  const input = { lockLocation: [entry([null, 42, "", " + ", "Soul of Bat Extra", "Soul of Bat + "])] };
  assert.deepEqual(preview(input, ["Soul of Bat"]).lockLocation, input.lockLocation);
  const spaced = { lockLocation: [entry(["  Gravity Boots+ Leap Stone  "])] };
  assert.deepEqual(preview(spaced, ["Gravity Boots", "Leap Stone"]).lockLocation[0].escapeRequires, []);
});

test("escape-only entries are handled and missing escape fields are not added", () => {
  const input = { lockLocation: [
    { location: "Soul of Bat", escapeRequires: ["Soul of Bat"] },
    { location: "Cube of Zoe", locks: [] },
    { location: "Spirit Orb", locks: [], escapeRequires: [] }
  ] };
  const result = preview(input, ["Soul of Bat"]);
  assert.deepEqual(result.lockLocation[0], { location: "Soul of Bat", escapeRequires: [] });
  assert.deepEqual(result.lockLocation.slice(1), input.lockLocation.slice(1));
});

test("actual template differentiates a single jump escape from a full-flight escape", () => {
  const result = preview(template, ["Leap Stone"]);
  assert.deepEqual(result.lockLocation.find(({ location }) => location === "Demon Card").escapeRequires, []);
  assert.deepEqual(result.lockLocation.find(({ location }) => location === "Holy glasses").escapeRequires,
    template.lockLocation.find(({ location }) => location === "Holy glasses").escapeRequires);
});

test("deselection restores escapes and raw JSON options are processed without mutating inputs", () => {
  const raw = option("Raw", { category: "world", previewJson: { lockLocation: [entry(["Soul of Bat"])] } });
  const bat = option("Soul of Bat");
  const original = structuredClone(raw);
  const originalTemplate = structuredClone(template);
  const selected = buildPreviewPreset(template, { ...preset, optionIds: [raw.id, bat.id] }, [raw, bat]);
  assert.deepEqual(selected.lockLocation[0].escapeRequires, []);
  const deselected = buildPreviewPreset(template, { ...preset, optionIds: [raw.id] }, [raw, bat]);
  assert.deepEqual(deselected.lockLocation, raw.previewJson.lockLocation);
  const wrongCategory = { ...bat, category: "world" };
  assert.deepEqual(buildPreviewPreset(template, { ...preset, optionIds: [raw.id, bat.id] }, [raw, wrongCategory]).lockLocation,
    raw.previewJson.lockLocation);
  assert.deepEqual(raw, original);
  assert.deepEqual(template, originalTemplate);
});
