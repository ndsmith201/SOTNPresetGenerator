const assert = require("node:assert/strict");
const { test } = require("node:test");
const { detectStartingRelics } = require("../dist/renderer/starting-relics.js");
const { buildPreviewPreset, calculatePresetMaxComplexity, createPresetFromTemplate, persistPresets, loadPresets } = require("../dist/renderer/preset-utils.js");
const template = require("../templates/preset-template.json");

const word = (value, extra = {}) => ({ type: "word", value, ...extra });
const startup = (...instructions) => [
  word("0x34020003", { address: "0x00158c98" }),
  word("0x3c038009"), ...instructions,
  word("0x0803924f"), word("0x00000000")
];

// Startup sequence from bat-target-confirmed: Faerie Scroll, 99 hearts,
// then Soul of Bat (v0 still holds 0x63 rather than the usual 0x03).
const batWrites = [
  word("0x0c04db00", { address: "0x000fa97c" }),
  word("0x3c038009", { address: "0x00158c98" }),
  word("0x34020003"), word("0xa0627973"),
  word("0x34020063"), word("0xa0627bc4"), word("0xa0627964"),
  word("0x0803924f"), word("0x00000000")
];

test("detects bat-target-confirmed's starting Bat and Faerie Scroll without relying on comments", () => {
  assert.deepEqual([...detectStartingRelics({ writes: batWrites })], ["Faerie Scroll", "Soul of Bat"]);
  assert.equal(detectStartingRelics(null).size, 0);
  assert.equal(detectStartingRelics({ writes: [word("0xa0627964", { comment: "Enable Soul of Bat" })] }).size, 0);
});

test("all registered relic inventory bytes are recognized, including numeric and uppercase instructions", () => {
  const instructions = Array.from({ length: 30 }, (_, index) => word(0xa0627964 + index));
  const relics = detectStartingRelics({ writes: startup(...instructions) });
  assert.equal(relics.size, 30);
  for (const relic of ["Soul of Bat", "Power of Mist", "Leap Stone", "Sword Card", "Heart of Vlad", "Eye of Vlad"]) assert.ok(relics.has(relic));
  assert.ok(detectStartingRelics({ writes: startup(word("0xA0627964")) }).has("Soul of Bat"));
});

test("inventory values, base registers, clears and code boundaries prevent false starting relics", () => {
  const writes = startup(
    word("0xa0627964"), // Bat granted, then cleared.
    word("0x34020000"), word("0xa0627964"),
    word("0x34020002"), word("0xa0627968"), // Active bit without owned bit.
    word("0x34020001"), word("0xa062796b"), // Owned but inactive Mist.
    word("0x3c038004"), word("0xa0627970"), // Wrong RAM bank, not Boots.
    word("0x3c038009"), word("0x8c620000"), word("0xa0627971") // Unknown loaded value, not Leap.
  );
  writes.push(word("0x34020003", { address: "0x000fe824" }), word("0x3c038009"), word("0xa062797d"));
  assert.deepEqual([...detectStartingRelics({ writes })], ["Form of Mist"]);
  assert.equal(detectStartingRelics({ writes: startup(word("0x10000002"), word("0xa0627964")) }).size, 0);
});

test("detects stores in the return delay slot and contiguous explicit addresses", () => {
  const writes = [
    word("0x34020003", { address: "0x00158c98" }),
    word("0x3c038009", { address: "0x00158c9c" }),
    word("0x0803924f"), word("0xa0627964"), word("0xa0627968")
  ];
  assert.deepEqual([...detectStartingRelics({ writes })], ["Soul of Bat"]);
});

test("template starting relics adjust replacement locks, escapes, metadata and complexity without duplicating writes", () => {
  const source = { writes: batWrites, complexityGoal: template.complexityGoal, inherits: "parent" };
  const sourceBefore = structuredClone(source);
  const templateBefore = structuredClone(template);
  const preset = createPresetFromTemplate("Bat copy", source);
  const maximum = calculatePresetMaxComplexity(template, preset, []);
  assert.equal(maximum, 8);
  const output = buildPreviewPreset(template, preset, [], undefined, maximum);
  assert.deepEqual(output.writes, batWrites);
  assert.equal(output.metadata.transformEarly, true);
  assert.equal(output.metadata.transformFocus, true);
  const customLocks = { lockLocation: [
    { location: "Cube of Zoe", locks: ["Soul of Bat"], escapeRequires: ["Soul of Bat"] },
    { location: "Spirit Orb", locks: ["Faerie Scroll + Jewel of Open"] },
    { location: "Soul of Bat", locks: ["Form of Mist + Soul of Bat"], escapeRequires: ["Form of Mist"] }
  ] };
  const result = buildPreviewPreset(customLocks, preset, []);
  assert.deepEqual(result.lockLocation, [
    { location: "Cube of Zoe", locks: [], escapeRequires: [] },
    { location: "Spirit Orb", locks: ["Jewel of Open"] },
    { location: "Soul of Bat", locks: ["Form of Mist"], escapeRequires: ["Form of Mist"] }
  ]);
  assert.deepEqual(source, sourceBefore);
  assert.deepEqual(template, templateBefore);
  assert.deepEqual(preset.baseTemplate, sourceBefore);
});

test("template relics combine with selected relics and survive deselection and draft reload", () => {
  const preset = createPresetFromTemplate("Jump copy", { writes: startup(word("0xa0627970")) });
  const locks = { lockLocation: [{ location: "Cube of Zoe", locks: ["Gravity Boots + Leap Stone"], escapeRequires: ["Gravity Boots + Leap Stone"] }] };
  const leap = { id: "leap", label: "Enable Leap Stone", category: "relics", injectedWrites: [], gameInitWrites: [], appendedWrites: [], previewJson: null };
  const selected = buildPreviewPreset(locks, { ...preset, optionIds: [leap.id] }, [leap]);
  assert.deepEqual(selected.lockLocation[0].locks, []);
  assert.deepEqual(selected.lockLocation[0].escapeRequires, []);
  const deselected = buildPreviewPreset(locks, preset, [leap]);
  assert.deepEqual(deselected.lockLocation[0].locks, ["Leap Stone"]);
  assert.deepEqual(deselected.lockLocation[0].escapeRequires, ["Gravity Boots + Leap Stone"]);
  let stored;
  const previous = global.localStorage;
  global.localStorage = { getItem: () => stored, setItem: (_key, value) => { stored = value; } };
  try {
    persistPresets([preset]);
    assert.deepEqual(buildPreviewPreset(locks, loadPresets()[0], [leap]), deselected);
  } finally { global.localStorage = previous; }
});
