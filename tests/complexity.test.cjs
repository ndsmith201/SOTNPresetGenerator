const assert = require("node:assert/strict");
const { test } = require("node:test");
const { calculateMaxComplexity, buildPreviewPreset, normalizeComplexity } = require("../dist/renderer/preset-utils.js");
const { DEFAULT_BUILT_IN_SETTINGS } = require("../dist/renderer/constants.js");
const template = require("../templates/preset-template.json");
const option = (name, category = "relics") => ({ id: name, label: `Enable ${name}`, category,
  injectedWrites: [], gameInitWrites: [], appendedWrites: [], previewJson: null });
const selected = (...names) => names.map((name) => option(name));
const locks = (...entries) => ({ lockLocation: entries });
const check = (location, ...routes) => ({ location, locks: routes });

test("a pair counts only its completing pickup, even if it unlocks several checks", () => {
  const input = locks(check("Holy glasses", "Gold ring + Silver ring"), check("Trio", "Gold ring + Silver ring"));
  assert.equal(calculateMaxComplexity(input), 1);
  assert.equal(calculateMaxComplexity(input, selected("Gold ring")), 1);
  assert.equal(calculateMaxComplexity(input, selected("Gold ring", "Silver ring")), 0);
});

test("maximum searches acquisition orders and counts only new access", () => {
  // Taking A first opens everything in one step; B then C opens two steps.
  const input = locks(check("First", "A", "B"), check("Trio", "A", "C"));
  assert.equal(calculateMaxComplexity(input), 2);
  assert.equal(calculateMaxComplexity(input, selected("A")), 0);
  assert.equal(calculateMaxComplexity(input, selected("B")), 1);
});

test("flight makes other movement pickups redundant while Mist still opens its own barrier", () => {
  const input = locks(
    check("Soul of Bat", "Form of Mist + Leap Stone", "Form of Mist + Soul of Bat", "Form of Mist + Power of Mist"),
    check("Trio", "Soul of Bat", "Leap Stone + Gravity Boots", "Form of Mist + Power of Mist")
  );
  assert.equal(calculateMaxComplexity(input, selected("Soul of Bat")), 1);
  assert.equal(calculateMaxComplexity(input, selected("Soul of Bat", "Leap Stone", "Gravity Boots", "Power of Mist")), 1);
  assert.equal(calculateMaxComplexity(input, selected("Soul of Bat", "Form of Mist")), 0);
  assert.equal(calculateMaxComplexity(input, selected("Soul of Bat", "Form of Mist", "Power of Mist")), 0);
  assert.equal(calculateMaxComplexity(input, selected("Leap Stone", "Gravity Boots")), 1);
  assert.equal(calculateMaxComplexity(input, selected("Form of Mist", "Power of Mist")), 0);
  // Partial pairs do not start with flight: separate pickups can open both checks.
  assert.equal(calculateMaxComplexity(input, selected("Form of Mist")), 2);
  assert.equal(calculateMaxComplexity(input, selected("Power of Mist")), 2);
});

test("Bat retains its separate use with Echo even after jump flight", () => {
  const input = locks(check("Trio", "Soul of Bat + Echo of Bat"));
  assert.equal(calculateMaxComplexity(input, selected("Leap Stone", "Gravity Boots", "Echo of Bat")), 1);
  assert.equal(calculateMaxComplexity(input, selected("Soul of Bat", "Echo of Bat")), 0);
});

test("Trio is included and all later checks and unrelated options are ignored", () => {
  const input = locks(check("First", "First relic"), check("Trio", "Trio relic"), check("Later", "Later relic"));
  assert.equal(calculateMaxComplexity(input), 2);
  assert.equal(calculateMaxComplexity(input, selected("Trio relic")), 1);
  assert.equal(calculateMaxComplexity(input, [option("First relic", "world"), ...selected("Later relic")]), 2);
});

test("real template maximum reflects starting inventory without mutating locks", () => {
  const original = structuredClone(template);
  assert.equal(calculateMaxComplexity(template), 11);
  for (const names of [["Soul of Bat"], ["Leap Stone", "Gravity Boots"]]) {
    assert.equal(calculateMaxComplexity(template, selected(...names)), 8);
  }
  assert.equal(calculateMaxComplexity(template, selected("Form of Mist", "Power of Mist")), 7);
  assert.equal(calculateMaxComplexity(template, selected("Soul of Bat", "Form of Mist")), 7);
  assert.equal(calculateMaxComplexity(template, selected("Soul of Bat", "Form of Mist")),
    calculateMaxComplexity(template, selected("Soul of Bat", "Form of Mist", "Power of Mist")));
  const end = template.lockLocation.findIndex(({ location }) => location === "Trio");
  const required = [...new Set(template.lockLocation.slice(0, end + 1).flatMap(({ locks }) => locks.flatMap(lock => lock.split("+").map(name => name.trim()))))];
  assert.equal(calculateMaxComplexity(template, selected(...required)), 1);
  const vlads = ["Heart of Vlad", "Tooth of Vlad", "Rib of Vlad", "Ring of Vlad", "Eye of Vlad"];
  assert.equal(calculateMaxComplexity(template, selected(...required, ...vlads)), 0);
  assert.deepEqual(template, original);
});

test("Bat's seven check-opening steps plus the final Vlad give complexity eight", () => {
  const vlads = ["Heart of Vlad", "Tooth of Vlad", "Rib of Vlad", "Ring of Vlad", "Eye of Vlad"];
  assert.equal(calculateMaxComplexity(template, selected("Soul of Bat")), 8);
  assert.equal(calculateMaxComplexity(template, selected("Soul of Bat", ...vlads.slice(0, 4))), 8);
  assert.equal(calculateMaxComplexity(template, selected("Soul of Bat", ...vlads)), 7);
  const input = { ...locks(check("Trio")), complexityGoal: { goals: [vlads.join(" + ")] } };
  assert.equal(calculateMaxComplexity(input), 1);
  assert.equal(calculateMaxComplexity(input, selected(...vlads)), 0);
});

test("raw lock overrides participate and generated complexity is clamped in both JSON fields", () => {
  const raw = { ...option("Raw", "world"), previewJson: { ...locks(check("Trio", "Gold ring + Silver ring")),
    metadata: { metaComplexity: "99" }, complexityGoal: { min: 99, goals: ["Keep"] } } };
  const preset = { id: "test", name: "Test", optionIds: [raw.id], complexity: 11, metaExtension: "Guarded",
    builtInSettings: DEFAULT_BUILT_IN_SETTINGS, createdAt: "", updatedAt: "" };
  const output = buildPreviewPreset(template, preset, [raw]);
  assert.equal(output.metadata.metaComplexity, "1");
  assert.deepEqual(output.complexityGoal, { min: 1, goals: ["Keep"] });
  assert.equal(preset.complexity, 11);
  const enabled = [...selected("Gold ring", "Silver ring"), raw];
  const unlocked = buildPreviewPreset(template, { ...preset, optionIds: enabled.map(option => option.id) }, enabled);
  assert.equal(unlocked.complexityGoal.min, 0);
  assert.equal(unlocked.metadata.metaComplexity, "0");
});

test("calculated bounds replace the old fixed ceiling and handle no remaining progression", () => {
  const input = locks(...Array.from({ length: 12 }, (_, index) => check(index === 11 ? "Trio" : `Check ${index}`, `Relic ${index}`)));
  assert.equal(calculateMaxComplexity(input), 12);
  assert.equal(normalizeComplexity(12, 12), 12);
  assert.equal(normalizeComplexity(8, 3), 3);
  assert.equal(normalizeComplexity(8, 0), 0);
  assert.equal(calculateMaxComplexity(locks(check("Trio"))), 0);
  assert.equal(calculateMaxComplexity(null), 0);
});
