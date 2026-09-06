const assert = require("node:assert/strict");
const { test } = require("node:test");
const { RELIC_LOCATION_CHECKS: checks } = require("../dist/renderer/relic-location-checks.js");
const { META_EXTENSIONS } = require("../dist/renderer/constants.js");
const template = require("../templates/preset-template.json");
const extensionLocations = require("./fixtures/extension-location-names.json");

const counts = { Classic: 32, Guarded: 37, GuardedPlus: 39, Equipment: 105, Scenic: 118, Extended: 71 };

test("template covers every custom location from the audited extension JSON files", () => {
  assert.equal(extensionLocations.locations.length, 32);
  assert.equal(new Set(extensionLocations.locations).size, 32);
  for (const location of extensionLocations.locations) {
    assert.equal(template.lockLocation.filter((entry) => entry.location === location).length, 1, location);
  }
});

test("Telescope uses the source preset's unrestricted locks without its custom item restrictions", () => {
  // Source: sotnrando/presets/battle-mage.json, Telescope entry.
  assert.deepEqual(template.lockLocation.find((entry) => entry.location === "Telescope"), {
    location: "Telescope", comment: "No Requirements", locks: []
  });
});

test("every supported extension has a complete, unique, immutable guide list", () => {
  assert.deepEqual(Object.keys(checks).sort(), [...META_EXTENSIONS].sort());
  assert.ok(Object.isFrozen(checks));
  for (const extension of META_EXTENSIONS) {
    assert.equal(checks[extension].length, counts[extension], extension);
    assert.equal(new Set(checks[extension]).size, counts[extension], extension);
    assert.ok(Object.isFrozen(checks[extension]));
    assert.ok(checks[extension].every((name) => name && name.trim() === name));
  }
});

test("inheritance includes guarded checks in every larger extension", () => {
  for (const [parent, child] of [
    ["Classic", "Guarded"], ["Guarded", "GuardedPlus"],
    ["GuardedPlus", "Equipment"], ["GuardedPlus", "Extended"],
    ["Equipment", "Scenic"], ["Extended", "Scenic"]
  ]) {
    assert.ok(checks[parent].every((name) => checks[child].includes(name)), `${parent} -> ${child}`);
  }
  assert.deepEqual(checks.Guarded.slice(checks.Classic.length), [
    "Crystal cloak", "Mormegil", "Dark Blade", "Ring of Arcana", "Trio"
  ]);
  assert.deepEqual(checks.GuardedPlus.slice(checks.Guarded.length), ["Badelaire", "Forbidden Library Opal"]);
});

test("Extended includes 19 selected equipment checks and all 13 scenic-only checks", () => {
  const selectedEquipment = checks.Extended.filter((name) =>
    checks.Equipment.includes(name) && !checks.GuardedPlus.includes(name));
  assert.equal(selectedEquipment.length, 19);
  assert.ok(selectedEquipment.includes("Silver plate"));
  const scenicOnly = checks.Scenic.filter((name) => !checks.Equipment.includes(name));
  assert.equal(scenicOnly.length, 13);
  assert.ok(scenicOnly.every((name) => checks.Extended.includes(name)));
  assert.ok(checks.Extended.includes("Telescope"));
  assert.ok(!checks.Extended.includes("Holy mail"));
  assert.ok(!checks.Extended.includes("Holy sword"));
});

test("Scenic covers the full template using confirmed randomizer check names", () => {
  const templateNames = new Set(template.lockLocation.map(({ location }) => location));
  assert.deepEqual(checks.Scenic.filter((name) => !templateNames.has(name)), []);
  assert.deepEqual([...templateNames].filter((name) => !checks.Scenic.includes(name)), []);
  assert.ok(checks.Equipment.includes("Broadsword"));
  assert.ok(!checks.Scenic.includes("Olrox Onyx"));
});

test("Classic includes progression equipment and all five Vlad checks", () => {
  for (const name of ["Gold ring", "Silver ring", "Holy glasses", "Spike Breaker",
    "Heart of Vlad", "Tooth of Vlad", "Rib of Vlad", "Ring of Vlad", "Eye of Vlad"]) {
    assert.ok(checks.Classic.includes(name), name);
  }
});
