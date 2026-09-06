const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildPreviewPreset } = require("../dist/renderer/preset-utils.js");
const { DEFAULT_BUILT_IN_SETTINGS } = require("../dist/renderer/constants.js");
const { RELIC_LOCATION_CHECKS } = require("../dist/renderer/relic-location-checks.js");
const template = require("../templates/preset-template.json");
const preset = { id: "extensions", name: "Extensions", optionIds: [], complexity: 1,
  metaExtension: "Guarded", builtInSettings: DEFAULT_BUILT_IN_SETTINGS, createdAt: "", updatedAt: "" };
const option = (id, previewJson = null) => ({ id, label: id, category: "relics",
  injectedWrites: [], gameInitWrites: [], appendedWrites: [], previewJson });

for (const [extension, count] of Object.entries({ Classic: 32, Guarded: 37, GuardedPlus: 39,
  Equipment: 105, Extended: 71, Scenic: 118 })) {
  test(`${extension} emits only its ${count} template checks with original order and fields`, () => {
    const original = structuredClone(template);
    const result = buildPreviewPreset(template, { ...preset, metaExtension: extension }, []);
    const allowed = new Set(RELIC_LOCATION_CHECKS[extension]);
    assert.equal(result.lockLocation.length, count);
    assert.deepEqual(result.lockLocation, template.lockLocation.filter(({ location }) => allowed.has(location)));
    assert.equal(result.metadata.metaExtension, extension);
    assert.equal(result.relicLocationsExtension, extension === "Classic" ? false : extension.toLowerCase());
    assert.deepEqual(template, original);
  });
}

test("extension switching restores template entries and retains starting-relic lock adjustments", () => {
  const bat = option("Enable Soul of Bat");
  const selected = { ...preset, optionIds: [bat.id] };
  const initial = buildPreviewPreset(template, { ...selected, metaExtension: "Scenic" }, [bat]);
  const guarded = buildPreviewPreset(template, selected, [bat]);
  assert.equal(guarded.lockLocation.length, 37);
  assert.ok(!guarded.lockLocation.some(({ location }) => location === "Telescope"));
  assert.deepEqual(guarded.lockLocation.find(({ location }) => location === "Soul of Bat").locks, ["Form of Mist"]);
  const restored = buildPreviewPreset(template, { ...selected, metaExtension: "Scenic" }, [bat]);
  assert.deepEqual(restored.lockLocation, initial.lockLocation);
  assert.deepEqual(buildPreviewPreset(template, { ...preset, metaExtension: "Scenic" }, []).lockLocation,
    template.lockLocation);
});

test("raw options may customize allowed locks but cannot restore excluded checks or override the selected extension", () => {
  const raw = option("Raw", { relicLocationsExtension: "scenic", metadata: { metaExtension: "Scenic" },
    lockLocation: [
      { location: "Soul of Bat", comment: "Custom rule", locks: ["Form of Mist + Jewel of Open"] },
      { location: "Telescope", locks: [] },
      { location: "Unknown check", locks: [] }
    ] });
  const mist = option("Enable Form of Mist");
  const original = structuredClone(raw);
  const result = buildPreviewPreset(template, { ...preset, optionIds: [raw.id, mist.id] }, [raw, mist]);
  assert.deepEqual(result.lockLocation, [{ location: "Soul of Bat", comment: "Custom rule", locks: ["Jewel of Open"] }]);
  assert.equal(result.relicLocationsExtension, "guarded");
  assert.equal(result.metadata.metaExtension, "Guarded");
  assert.deepEqual(raw, original);
});

test("filtering uses only supplied entries and does not fabricate missing template checks", () => {
  const smallTemplate = { lockLocation: [{ location: "Telescope", comment: "Keep", locks: [] }] };
  assert.deepEqual(buildPreviewPreset(smallTemplate, preset, []).lockLocation, []);
  assert.deepEqual(buildPreviewPreset(smallTemplate, { ...preset, metaExtension: "Scenic" }, []).lockLocation,
    smallTemplate.lockLocation);
  assert.ok(!Object.hasOwn(buildPreviewPreset({}, preset, []), "lockLocation"));
});
