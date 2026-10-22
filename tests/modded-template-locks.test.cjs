const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  buildPreviewPreset, calculatePresetMaxComplexity, createPresetFromTemplate,
  loadPresets, persistPresets
} = require("../dist/renderer/preset-utils.js");
const { RELIC_LOCATION_CHECKS } = require("../dist/renderer/relic-location-checks.js");
const template = require("../templates/preset-template.json");

const customBat = {
  location: "Soul of Bat", locks: ["Modded key"], escapeRequires: ["Modded exit"],
  block: ["Modded block"], comment: "Preserve the whole source entry", extra: { custom: true }
};
const source = (lockLocation = [customBat], castleType = "Modded") => ({
  metadata: { name: "Modded source", castleType, metaExtension: "Scenic" },
  lockLocation, writes: []
});
const option = (id, label, previewJson = null) => ({
  id, label, category: "relics", description: "", injectedWrites: [],
  gameInitWrites: [], itemInitWrites: [], mainBlockWrites: [], appendedWrites: [], previewJson
});
const bat = option("bat", "Enable Soul of Bat");
const get = (output, location) => output.lockLocation.find(entry => entry.location === location);
function generate(base, { extension = "Scenic", options = [], selected = options.map(item => item.id), bundle = template } = {}) {
  const draft = createPresetFromTemplate("Modded copy", base, options);
  draft.metaExtension = extension;
  draft.optionIds = selected;
  return buildPreviewPreset(bundle, draft, options, undefined, 99);
}

test("modded detection uses metadata.castleType, ignoring case and surrounding whitespace", () => {
  for (const marker of ["Modded", "modded", "mOdDeD", "  MODDED  "]) {
    assert.deepEqual(get(generate(source([customBat], marker)), "Soul of Bat"), customBat);
  }
});

test("modded entries replace complete matching defaults while unmatched defaults remain", () => {
  const output = generate(source());
  assert.deepEqual(get(output, "Soul of Bat"), customBat);
  assert.deepEqual(get(output, "Cube of Zoe"), get(template, "Cube of Zoe"));
  assert.equal(output.lockLocation.length, template.lockLocation.length);
});

test("empty source locks replace the whole default record without leaking default escape rules", () => {
  const unlocked = { location: "Soul of Bat", locks: [] };
  const bundle = { lockLocation: [{ location: "Soul of Bat", locks: ["Form of Mist"], escapeRequires: ["Soul of Bat"], comment: "Default only" }] };
  assert.deepEqual(generate(source([unlocked]), { bundle }).lockLocation, [unlocked]);
});

test("each extension filters source overrides and switching back restores their original entries", () => {
  const telescope = { location: "Telescope", locks: ["Custom telescope key"], note: { keep: true } };
  const unknown = { location: "Unknown modded check", locks: ["Unknown key"] };
  const wrongCase = { location: "soul of bat", locks: ["Wrong case must not replace the canonical check"] };
  const base = source([customBat, telescope, unknown, wrongCase]);
  const draft = createPresetFromTemplate("Extensions", base);
  const overrides = new Map([[customBat.location, customBat], [telescope.location, telescope]]);
  const original = buildPreviewPreset(template, draft, [], undefined, 99);
  for (const extension of Object.keys(RELIC_LOCATION_CHECKS)) {
    const allowed = new Set(RELIC_LOCATION_CHECKS[extension]);
    const output = buildPreviewPreset(template, { ...draft, metaExtension: extension }, [], undefined, 99);
    assert.deepEqual(output.lockLocation, template.lockLocation.filter(entry => allowed.has(entry.location))
      .map(entry => overrides.get(entry.location) ?? entry), extension);
    assert.ok(!output.lockLocation.some(entry => [unknown.location, wrongCase.location].includes(entry.location)), extension);
    assert.equal(output.relicLocationsExtension, extension === "Classic" ? false : extension.toLowerCase());
  }
  assert.deepEqual(buildPreviewPreset(template, draft, [], undefined, 99), original);
});

test("allowed source-only entries survive a supplied default template that omits them", () => {
  const extra = { location: "Cube of Zoe", locks: ["Custom key"], custom: "Retain" };
  const bundle = { lockLocation: [structuredClone(get(template, "Soul of Bat"))] };
  const output = generate(source([extra]), { extension: "Guarded", bundle });
  assert.deepEqual(output.lockLocation, [...bundle.lockLocation, extra]);
});

test("missing or invalid source lock sections fall back to the selected extension defaults", () => {
  const expected = template.lockLocation.filter(entry => RELIC_LOCATION_CHECKS.Guarded.includes(entry.location));
  const candidates = [undefined, null, {}, "invalid", [], [null, {}, { location: 7 }]];
  for (const lockLocation of candidates) {
    const base = source();
    if (lockLocation === undefined) delete base.lockLocation;
    else base.lockLocation = lockLocation;
    assert.deepEqual(generate(base, { extension: "Guarded" }).lockLocation, expected);
  }
});

test("normal or unrecognized castle markers retain existing default lock behavior", () => {
  const expected = template.lockLocation;
  for (const marker of ["Normal", "Unknown", "", null, 1]) {
    assert.deepEqual(generate(source([customBat], marker)).lockLocation, expected);
  }
  const topLevelOnly = source();
  delete topLevelOnly.metadata.castleType;
  topLevelOnly.castleType = "Modded";
  assert.deepEqual(generate(topLevelOnly).lockLocation, expected);
});

test("generation and storage reload preserve source, draft and bundled data independently", t => {
  const base = source();
  const originalBase = structuredClone(base);
  const originalBundle = structuredClone(template);
  const draft = createPresetFromTemplate("Saved modded copy", base);
  const originalDraft = structuredClone(draft);
  const output = buildPreviewPreset(template, draft, [], undefined, 99);
  const previousStorage = global.localStorage;
  const saved = new Map();
  global.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  t.after(() => {
    if (previousStorage === undefined) delete global.localStorage;
    else global.localStorage = previousStorage;
  });
  persistPresets([draft]);
  const [restored] = loadPresets(new Set());
  assert.deepEqual(buildPreviewPreset(template, restored, [], undefined, 99), output);
  get(output, "Soul of Bat").extra.custom = false;
  get(output, "Cube of Zoe").locks.push("Changed output only");
  assert.deepEqual(base, originalBase);
  assert.deepEqual(draft, originalDraft);
  assert.deepEqual(template, originalBundle);
  assert.deepEqual(get(buildPreviewPreset(template, restored, [], undefined, 99), "Soul of Bat"), customBat);
});

test("starting relics remove explicit source requirements and deselection restores complete rules", () => {
  const custom = {
    location: "Cube of Zoe", locks: ["Soul of Bat + Jewel of Open"],
    escapeRequires: ["Soul of Bat"], block: ["Soul of Bat"], extra: { keep: true }
  };
  const base = source([custom]);
  const output = generate(base, { options: [bat] });
  assert.deepEqual(get(output, custom.location), { ...custom, locks: ["Jewel of Open"], escapeRequires: [] });
  assert.deepEqual(get(generate(base, { options: [bat], selected: [] }), custom.location), custom);
  assert.deepEqual(base.lockLocation, [custom]);
});

test("starting relics inherited from source startup writes also simplify explicit custom requirements", () => {
  const custom = { location: "Cube of Zoe", locks: ["Soul of Bat + Jewel of Open"] };
  const base = source([custom]);
  base.writes = structuredClone(template.writes);
  const gameAnchor = base.writes.findIndex(write => Number(write.value) === 0x3c038004);
  base.writes.splice(gameAnchor, 0, { type: "word", value: "0xa0627964" });
  const original = structuredClone(base);
  assert.deepEqual(get(generate(base), "Cube of Zoe").locks, ["Jewel of Open"]);
  assert.deepEqual(base, original);
});

test("source rules avoid standard-castle flight and location-specific substitutions", () => {
  const custom = [
    { location: "Floating Catacombs Elixir", locks: ["Jewel of Open"], note: "Keep the custom key" },
    { location: "Rib of Vlad", locks: ["Jewel of Open"], note: "Keep the custom route" },
    { location: "Cube of Zoe", locks: ["Form of Mist+Jewel of Open"] }
  ];
  const output = generate(source(custom), { options: [bat] });
  for (const entry of custom) assert.deepEqual(get(output, entry.location), entry, entry.location);
});

test("untouched bundled defaults keep their normal starting-flight behavior for modded copies", () => {
  const normalRule = { location: "Cube of Zoe", locks: ["Form of Mist + Jewel of Open"] };
  const customRule = { location: "Spirit Orb", locks: ["Custom key"] };
  const bundle = { lockLocation: [normalRule, { location: "Spirit Orb", locks: [] }] };
  const output = generate(source([customRule]), { bundle, options: [bat] });
  assert.deepEqual(get(output, "Cube of Zoe").locks, ["Form of Mist"]);
  assert.deepEqual(get(output, "Spirit Orb"), customRule);
});

test("complexity uses custom source rules and their explicit-only starting-relic semantics", () => {
  const bundle = { lockLocation: [
    { location: "Cube of Zoe", locks: [] }, { location: "Spirit Orb", locks: [] }
  ] };
  const custom = [
    { location: "Cube of Zoe", locks: ["Form of Mist"] },
    { location: "Spirit Orb", locks: ["Form of Mist + Jewel of Open"] }
  ];
  const draft = createPresetFromTemplate("Custom progression", source(custom), [bat]);
  draft.optionIds = [bat.id];
  draft.complexity = 99;
  assert.equal(calculatePresetMaxComplexity(bundle, draft, [bat]), 2);
  const output = buildPreviewPreset(bundle, draft, [bat]);
  assert.deepEqual(output.lockLocation, custom);
  assert.equal(output.complexityGoal.min, 2);
  assert.equal(output.metadata.metaComplexity, "2");
});

test("raw option lock overrides still replace the assembled array and remain extension-filtered", () => {
  const rawEntry = { location: "Soul of Bat", locks: ["Form of Mist + Jewel of Open"], raw: true };
  const raw = option("raw", "Raw locks", { lockLocation: [rawEntry, { location: "Telescope", locks: [] }] });
  const mist = option("mist", "Enable Form of Mist");
  const original = structuredClone(raw);
  const output = generate(source(), { extension: "Guarded", options: [raw, mist] });
  assert.deepEqual(output.lockLocation, [{ ...rawEntry, locks: ["Jewel of Open"] }]);
  assert.deepEqual(raw, original);
});
