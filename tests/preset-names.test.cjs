const assert = require("node:assert/strict");
const { test } = require("node:test");
const { presetNameError } = require("../dist/renderer/preset-utils.js");

test("preset names must contain more than whitespace", () => {
  for (const name of ["", " ", "\t\n "]) {
    assert.equal(presetNameError(name, []), "Enter a name to continue.");
    assert.equal(presetNameError(name, [{ id: "fallback", name: "!!!" }]), "Enter a name to continue.");
  }
});

test("new names remain available when their generated IDs are distinct", () => {
  assert.equal(presetNameError("Weekend challenge", []), "");
  const presets = [{ id: "first", name: "Weekend challenge" }];
  for (const name of ["Weekday challenge", "Weekend challenge 2", "  Another route  "]) {
    assert.equal(presetNameError(name, presets), "", name);
  }
});

test("duplicate display names and generated preset IDs are rejected", () => {
  const cases = [
    ["Castle challenge", "Castle challenge"],
    ["Castle challenge", "  CASTLE CHALLENGE  "],
    ["Weekend challenge", "Weekend-challenge"],
    ["Weekend challenge", "Weekend\t\nchallenge!!!"],
    ["José's castle", "Jose's castle"],
    ["Café route", "Cafe\u0301 route"],
    ["Full Width", "Ｆｕｌｌ Width"],
    ["a".repeat(100) + " first", "a".repeat(100) + " second"]
  ];
  for (const [existingName, candidate] of cases) {
    const message = presetNameError(candidate, [{ id: "existing", name: existingName }]);
    assert.ok(message.includes(existingName), `The error should identify ${existingName}`);
    assert.match(message, /different name/i);
  }
});

test("names that share the fallback generated ID are rejected", () => {
  for (const [existingName, candidate] of [["!!!", "???"], ["東京", "京都"], ["Preset", "東京"]]) {
    const message = presetNameError(candidate, [{ id: "existing", name: existingName }]);
    assert.ok(message.includes(existingName));
    assert.match(message, /different name/i);
  }
});

test("renaming excludes only the current preset UUID", () => {
  const presets = [
    { id: "current", name: "Castle challenge" },
    { id: "another", name: "Weekend challenge" }
  ];
  assert.equal(presetNameError("Castle challenge", presets, "current"), "");
  assert.equal(presetNameError("  CASTLE-CHALLENGE  ", presets, "current"), "");
  assert.match(presetNameError("Weekend challenge", presets, "current"), /Weekend challenge/);
  assert.match(presetNameError("Castle challenge", presets, "unrelated"), /Castle challenge/);
  assert.match(presetNameError("Castle challenge", presets), /Castle challenge/);
});

test("excluding the current preset does not hide another existing duplicate", () => {
  const presets = [
    { id: "current", name: "Castle challenge" },
    { id: "duplicate", name: "Castle-challenge" }
  ];
  const message = presetNameError("Castle challenge", presets, "current");
  assert.ok(message.includes("Castle-challenge"));
  assert.match(message, /different name/i);
});

test("validating names never changes the library or existing names", () => {
  const presets = Object.freeze([
    Object.freeze({ id: "current", name: "  Café route  " }),
    Object.freeze({ id: "another", name: "Weekend challenge" })
  ]);
  const original = structuredClone(presets);
  assert.match(presetNameError("Cafe route", presets), /Café route/);
  assert.equal(presetNameError("Cafe route", presets, "current"), "");
  assert.equal(presetNameError("New route", presets), "");
  assert.deepEqual(presets, original);
});
