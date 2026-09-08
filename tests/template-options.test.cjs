const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildPreviewPreset, calculatePresetMaxComplexity, createPresetFromTemplate, toPresetOptions, loadPresets, persistPresets } = require("../dist/renderer/preset-utils.js");
const { matchTemplateOptions, selectTemplateOptions } = require("../dist/renderer/template-options.js");
const { detectStartingRelics } = require("../dist/renderer/starting-relics.js");
const template = require("../templates/preset-template.json");

function option(id, extra = {}) {
  return toPresetOptions([{ id, comment: `Option ${id}`, description: "", category: "world", type: "word", value: "0x12345678", address: "0x1000", gameInit: false, statEdit: false, rawJson: false, readOnly: true, additionalWrites: [], ...extra }])[0];
}
const bat = option(1, { comment: "Enable Soul of Bat", category: "relics", address: null, value: "0xa0627964" });
const scroll = option(2, { comment: "Enable Faerie Scroll", category: "relics", address: null, value: "0xa0627973" });
const source = { metadata: { transformEarly: true }, complexityGoal: template.complexityGoal, writes: [
  { address: "0x00158c98", type: "word", value: "0x3c038009" },
  { type: "word", value: "0x34020003" },
  { type: "word", value: "0xA0627973", comment: "unrelated comment" },
  { type: "word", value: "0x34020063" },
  { type: "word", value: "0xa0627964" },
  { type: "word", value: "0x0803924f" },
  { type: "word", value: "0x00000000" }
] };

test("starting relic options are preselected with their original writes exactly once", () => {
  const original = structuredClone(source);
  const preset = createPresetFromTemplate("Copy", source, [bat, scroll]);
  assert.deepEqual(preset.optionIds, [bat.id, scroll.id]);
  const output = buildPreviewPreset(template, preset, [bat, scroll]);
  assert.deepEqual(output.writes, source.writes);
  assert.equal(calculatePresetMaxComplexity(template, preset, [bat, scroll]), 8);
  assert.deepEqual(source, original);
});

test("unchecking a matched relic removes its grant and updates locks and metadata; rechecking restores original writes", () => {
  const preset = createPresetFromTemplate("Copy", source, [bat, scroll]);
  const unchecked = { ...preset, optionIds: [scroll.id] };
  const output = buildPreviewPreset(template, unchecked, [bat, scroll]);
  assert.deepEqual([...detectStartingRelics(output)], ["Faerie Scroll"]);
  assert.equal(output.metadata.transformEarly, false);
  assert.equal(output.writes.length, source.writes.length);
  assert.equal(output.writes[4].value, "0x00000000");
  assert.ok(calculatePresetMaxComplexity(template, unchecked, [bat, scroll]) > 8);
  assert.deepEqual(buildPreviewPreset(template, preset, [bat, scroll]).writes, source.writes);
});

test("complete addressed write groups match normalized values and inferred addresses, but partial or wrong-address groups do not", () => {
  const patch = option(3, { additionalWrites: [{ type: "short", value: "0x000A" }] });
  const json = { writes: [
    { type: "word", address: "0x00001000", value: 0x12345678, comment: "Different" },
    { type: "short", address: "0x1004", value: "0x0a" },
    { type: "char", value: "0x03" }
  ] };
  assert.deepEqual(matchTemplateOptions(json, [patch]).map(match => match.optionId), [patch.id]);
  assert.deepEqual(matchTemplateOptions({ writes: json.writes.slice(0, 1) }, [patch]), []);
  assert.deepEqual(matchTemplateOptions({ writes: [{ ...json.writes[0], address: "0x2000" }, json.writes[1]] }, [patch]), []);
  const preset = createPresetFromTemplate("Patch copy", json, [patch]);
  assert.deepEqual(buildPreviewPreset({}, preset, [patch]).writes, json.writes);
  const removed = buildPreviewPreset({}, { ...preset, optionIds: [] }, [patch]);
  assert.deepEqual(removed.writes, [{ type: "char", value: "0x03", address: "0x1006" }]);
});

test("raw JSON settings match independent of object key order and deselect without losing unrelated settings", () => {
  const raw = option(4, { rawJson: true, value: JSON.stringify({ itemDrops: { zombie: ["Potion"], bat: ["Heart"] } }) });
  const json = { itemDrops: { bat: ["Heart"], zombie: ["Potion"] }, custom: { keep: true } };
  const preset = createPresetFromTemplate("Raw copy", json, [raw]);
  assert.deepEqual(preset.optionIds, [raw.id]);
  assert.deepEqual(buildPreviewPreset({}, preset, [raw]).itemDrops, json.itemDrops);
  const output = buildPreviewPreset({}, { ...preset, optionIds: [] }, [raw]);
  assert.equal(Object.hasOwn(output, "itemDrops"), false);
  assert.deepEqual(output.custom, json.custom);
  assert.deepEqual(matchTemplateOptions({ itemDrops: { bat: ["Heart"] } }, [raw]), []);
});

test("injected option groups must match in startup code; inactive and wrong-bank relic stores are not matches", () => {
  const init = option(5, { address: null, gameInit: true, value: "0xa062becc" });
  const writes = [
    { address: "0x158c98", type: "word", value: "0x34020003" },
    { type: "word", value: "0x3c038004" },
    { type: "word", value: "0xa062becc" },
    { type: "word", value: "0xa0627964" },
    { type: "word", value: "0x0803924f" },
    { type: "word", value: "0x00000000" }
  ];
  assert.deepEqual(matchTemplateOptions({ writes }, [init, bat]).map(match => match.optionId), [init.id]);
  assert.deepEqual(matchTemplateOptions({ writes: [{ ...writes[0], address: "0x20000" }, ...writes.slice(1)] }, [init]), []);
});

test("legacy drafts match once and persist deselections across reload", () => {
  const legacy = createPresetFromTemplate("Old draft", source);
  delete legacy.templateOptionMatches;
  const migrated = selectTemplateOptions(legacy, [bat, scroll]);
  assert.deepEqual(migrated.optionIds, [bat.id, scroll.id]);
  const cleared = { ...migrated, optionIds: [] };
  assert.deepEqual(selectTemplateOptions(cleared, [bat, scroll]).optionIds, []);
  let stored;
  const previous = global.localStorage;
  global.localStorage = { getItem: () => stored, setItem: (_key, value) => { stored = value; } };
  try {
    persistPresets([cleared]);
    const restored = selectTemplateOptions(loadPresets()[0], [bat, scroll]);
    assert.deepEqual(restored.optionIds, []);
    assert.equal(detectStartingRelics(buildPreviewPreset(template, restored, [bat, scroll])).size, 0);
  } finally { global.localStorage = previous; }
});

test("overlapping matched writes remain while any selected option still needs them", () => {
  const duplicate = { ...bat, id: "another-bat" };
  const preset = createPresetFromTemplate("Overlap", source, [bat, duplicate]);
  assert.deepEqual(buildPreviewPreset(template, { ...preset, optionIds: [bat.id] }, [bat, duplicate]).writes, source.writes);
});
