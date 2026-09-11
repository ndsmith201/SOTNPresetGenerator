const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildPreviewPreset, createPresetFromTemplate, toPresetOptions } = require("../dist/renderer/preset-utils.js");
const { detectStartingRelics } = require("../dist/renderer/starting-relics.js");
const template = require("../templates/preset-template.json");

const [bat, teleporters, shortcuts] = toPresetOptions([
  { id: 1, comment: "Enable Soul of Bat", category: "relics", type: "word", value: "0xa0627964", additionalWrites: [] },
  { id: 2, comment: "Teleporters", category: "world", gameInit: true, type: "word", value: "0x3402001f",
    additionalWrites: [{ type: "word", value: "0xa062bebc" }] },
  { id: 3, comment: "Shortcuts", category: "world", gameInit: true, type: "word", value: "0x34020001",
    additionalWrites: [{ type: "word", value: "0xa062be6f" }] }
]);
const options = [bat, teleporters, shortcuts];
const anchorIndex = (writes) => writes.findIndex((write) => Number(write.value) === 0x3c038004);

function generate(source, selected = options) {
  const preset = createPresetFromTemplate("Game init", source, options);
  preset.optionIds = selected.map((option) => option.id);
  return buildPreviewPreset(template, preset, options);
}

test("default generation keeps the anchor between relic grants and game init writes", () => {
  const original = structuredClone(template);
  const output = generate();
  const index = anchorIndex(output.writes);
  assert.deepEqual(output.writes.slice(index - 1, index + 5), [
    ...bat.injectedWrites, template.writes[3], ...teleporters.gameInitWrites, ...shortcuts.gameInitWrites
  ]);
  assert.ok(detectStartingRelics(output).has("Soul of Bat"));
  assert.deepEqual(template, original);
});

test("presets with missing or empty writes copy the default routine before applying options", () => {
  const originalTemplate = structuredClone(template);
  for (const writes of [undefined, [], null]) {
    const source = { music: true, ...(writes === undefined ? {} : { writes }) };
    const originalSource = structuredClone(source);
    const withoutOptions = generate(source, []);
    assert.deepEqual(withoutOptions.writes, template.writes);
    assert.equal(withoutOptions.music, true);
    const withOptions = generate(source);
    assert.deepEqual(withOptions.writes, generate().writes);
    assert.ok(detectStartingRelics(withOptions).has("Soul of Bat"));
    assert.deepEqual(generate(withOptions).writes, withOptions.writes);
    withoutOptions.writes[0].value = "changed";
    assert.deepEqual(template, originalTemplate);
    assert.deepEqual(source, originalSource);
  }
});

test("installed presets without an anchor initialize the game bank before new game init options", () => {
  const source = { writes: template.writes.filter((write) => Number(write.value) !== 0x3c038004) };
  const original = structuredClone(source);
  const output = generate(source);
  const index = anchorIndex(output.writes);
  assert.ok(index > 0);
  assert.deepEqual(output.writes.slice(index - 1, index + 5), [
    ...bat.injectedWrites, template.writes[3], ...teleporters.gameInitWrites, ...shortcuts.gameInitWrites
  ]);
  assert.equal(output.writes[index + 5].value, "0x0803924f");
  assert.ok(detectStartingRelics(output).has("Soul of Bat"));
  assert.deepEqual(source, original);
  assert.deepEqual(generate(source, []).writes, source.writes);
});

test("existing anchors are recognized without comments and with numeric or uppercase values", () => {
  for (const value of ["0x3C038004", 0x3c038004, "0x3c038004"]) {
    const source = structuredClone(template);
    source.writes[3] = { type: "word", value };
    const output = generate(source);
    const index = anchorIndex(output.writes);
    assert.equal(output.writes.filter((write) => Number(write.value) === 0x3c038004).length, 1);
    assert.deepEqual(output.writes[index], source.writes[3]);
    assert.deepEqual(output.writes.slice(index + 1, index + 5), [...teleporters.gameInitWrites, ...shortcuts.gameInitWrites]);
    assert.ok(detectStartingRelics(output).has("Soul of Bat"));
  }
});

test("reopening an affected preset restores the anchor before inherited game init options without duplicating them", () => {
  const source = { writes: [
    ...template.writes.slice(0, 3), ...bat.injectedWrites, ...teleporters.gameInitWrites,
    ...template.writes.slice(4)
  ] };
  const original = structuredClone(source);
  const output = generate(source);
  const index = anchorIndex(output.writes);
  assert.deepEqual(output.writes.slice(index - 1, index + 5), [
    ...bat.injectedWrites, template.writes[3], ...shortcuts.gameInitWrites, ...teleporters.gameInitWrites
  ]);
  assert.equal(output.writes.length, source.writes.length + shortcuts.gameInitWrites.length + 1);
  assert.deepEqual(source, original);
  assert.deepEqual(generate(output).writes, output.writes);
});

test("restoring a missing or late anchor preserves the return address around addressed patches", () => {
  const [patch] = toPresetOptions([
    { id: 4, comment: "Regular patch", category: "world", type: "word", value: "0x12345678", address: "0x1000",
      additionalWrites: [{ type: "word", value: "0x12345679" }] }
  ]);
  const catalog = [...options, patch];
  for (const lateAnchor of [false, true]) {
    const source = { writes: [
      ...template.writes.filter((write) => Number(write.value) !== 0x3c038004),
      ...(lateAnchor ? [template.writes[3]] : [])
    ] };
    const original = structuredClone(source);
    const preset = createPresetFromTemplate("Patched game init", source, catalog);
    preset.optionIds = catalog.map((option) => option.id);
    const output = buildPreviewPreset(template, preset, catalog);
    assert.deepEqual(output.writes.slice(3), [
      ...bat.injectedWrites, template.writes[3], ...teleporters.gameInitWrites, ...shortcuts.gameInitWrites,
      ...patch.appendedWrites, { ...template.writes.at(-2), address: "0x00158cb8" }, template.writes.at(-1),
      ...(lateAnchor ? [template.writes[3]] : [])
    ]);
    assert.ok(detectStartingRelics(output).has("Soul of Bat"));
    assert.deepEqual(source, original);
    const reopened = createPresetFromTemplate("Patched game init", output, catalog);
    assert.deepEqual(buildPreviewPreset(template, reopened, catalog).writes, output.writes);
  }
});
