const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { test } = require("node:test");
const { buildPreviewPreset, toPresetOptions } = require("../dist/renderer/preset-utils.js");
const { DEFAULT_BUILT_IN_SETTINGS } = require("../dist/renderer/constants.js");
const expectations = require("./fixtures/flight-location-locks.cjs");

const template = JSON.parse(readFileSync(path.join(__dirname, "../templates/preset-template.json"), "utf8"));
const database = new DatabaseSync(":memory:");
let options;
try {
  database.exec(readFileSync(path.join(__dirname, "../database/options-dump.sql"), "utf8"));
  options = toPresetOptions(database.prepare("SELECT * FROM options").all().map((row) => ({
    ...row, gameInit: Boolean(row.game_init), rawJson: Boolean(row.raw_json),
    additionalWrites: JSON.parse(row.additional_writes_json || "[]")
  })));
} finally {
  database.close();
}

const preset = {
  id: "flight-test", name: "Flight test", optionIds: [], complexity: 1, metaExtension: "Scenic",
  builtInSettings: DEFAULT_BUILT_IN_SETTINGS, createdAt: "", updatedAt: ""
};
const scenarios = [
  ["Soul of Bat", ["Enable Soul of Bat"]],
  ["Gravity Boots + Leap Stone", ["Enable Gravity Boots", "Enable Leap Stone"]],
  ["Form of Mist + Power of Mist", ["Enable Form of Mist", "Enable Power of Mist"]]
];

test("every template location has exactly one explicit flight expectation", () => {
  const names = template.lockLocation.map((entry) => entry.location);
  const covered = expectations.map(([name]) => name);
  assert.equal(new Set(names).size, names.length, "Duplicate template location");
  assert.equal(new Set(covered).size, covered.length, "Duplicate fixture location");
  assert.deepEqual([...covered].sort(), [...names].sort(), "Update the fixture when locations change");
  for (const row of expectations) {
    assert.ok(row.length === 2 || row.length === 4, row[0]);
    for (const locks of row.slice(1)) {
      assert.ok(Array.isArray(locks) && locks.every((lock) => typeof lock === "string"), row[0]);
    }
  }
});

for (const [scenarioIndex, [name, labels]] of scenarios.entries()) {
  test(`${name}: all locations`, async (t) => {
    const input = structuredClone(template);
    const sourceOptions = structuredClone(options);
    const optionIds = labels.map((label) => {
      const matches = sourceOptions.filter((option) => option.label === label);
      assert.equal(matches.length, 1, `Expected one database option for ${label}`);
      return matches[0].id;
    });
    const result = buildPreviewPreset(input, { ...preset, optionIds }, sourceOptions);
    assert.deepEqual(result.lockLocation.map((entry) => entry.location), template.lockLocation.map((entry) => entry.location));
    const byLocation = new Map(result.lockLocation.map((entry) => [entry.location, entry]));
    const originals = new Map(template.lockLocation.map((entry) => [entry.location, entry]));

    for (const row of expectations) {
      const [location] = row;
      const expectedLocks = row.length === 2 ? row[1] : row[scenarioIndex + 1];
      await t.test(location, () => {
        const actual = byLocation.get(location);
        assert.deepEqual(actual.locks, expectedLocks, "Unexpected simplified locks");
        assert.equal(new Set(actual.locks).size, actual.locks.length, "Duplicate locks");
        assert.ok(actual.locks.every((lock) => lock.trim().length > 0), "Empty lock string");
        const original = originals.get(location);
        // Every escape list in this template includes each complete flight method.
        assert.deepEqual(actual, { ...original, locks: expectedLocks,
          ...(Array.isArray(original.escapeRequires) ? { escapeRequires: [] } : {}) }, "Other location fields changed");
      });
    }

    assert.deepEqual(input, template, "Template was mutated");
    assert.deepEqual(sourceOptions, options, "Database options were mutated");
    const deselected = buildPreviewPreset(input, preset, sourceOptions);
    assert.deepEqual(deselected.lockLocation, template.lockLocation, "Deselecting flight must restore all original locks");
  });
}
