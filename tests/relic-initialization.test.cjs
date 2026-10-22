const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildPreviewPreset, createPresetFromTemplate, toPresetOptions } = require("../dist/renderer/preset-utils.js");
const { detectStartingRelics } = require("../dist/renderer/starting-relics.js");
const { writeLocations } = require("../dist/renderer/template-options.js");
const template = require("../templates/preset-template.json");

const OWNED = 0x34020003;
const RELICS = 0x3c038009;
const GAME = 0x3c038004;
const RETURN = 0x0803924f;
const BAT = 0xa0627964;
const word = (value, extra = {}) => ({ type: "word", value, ...extra });
const valueIs = (write, value) => Number(write.value) === value;
const [bat] = toPresetOptions([
  { id: 1, comment: "Enable Soul of Bat", category: "relics", writes: [word("0xa0627964")] }
]);

// Aperture initializes the game bank directly, then opens shortcuts and
// teleporters and calls the map routine. It has no relic-bank initializer.
const aperture = {
  writes: [
    structuredClone(template.writes[0]),
    word("0x34020003", { address: "0x00158c98", comment: "ori v0, 0x0003" }),
    ...[
      "0x3c038004", "0xa062BEB3", "0x34020001", "0xa062BE1C",
      "0xa062BE1D", "0xa062BE1E", "0xa062BE6F", "0xa062BE4C",
      "0xa062BE9D", "0xa062BE80", "0xa062BDFC", "0xa062BE3E",
      "0x3402001F", "0xa062BEBC", "0xa062BEBD", "0x37F70000",
      "0x0C03C8A2", "0x34040000", "0x36FF0000", "0x00000000",
      "0x0803924f", "0x00000000"
    ].map(value => word(value)),
    word("0x18000006", { address: "0x4BAEA08", comment: "Death goes home." })
  ]
};

function generate(source, options = [bat]) {
  const preset = createPresetFromTemplate("Relic initialization", source, options);
  preset.optionIds = options.map(option => option.id);
  return buildPreviewPreset(template, preset, options, undefined, 99);
}

function assertBatRoundTrip(output) {
  assert.ok(detectStartingRelics(output).has("Soul of Bat"));
  const reopened = createPresetFromTemplate("Relic initialization", output, [bat]);
  assert.deepEqual(reopened.optionIds, [bat.id]);
  assert.deepEqual(buildPreviewPreset(template, reopened, [bat], undefined, 99).writes, output.writes);
  assert.deepEqual(generate(output).writes, output.writes);
}

test("Aperture gains the missing relic bank before Soul of Bat and retains its game initialization", () => {
  const original = structuredClone(aperture);
  const output = generate(aperture);
  assert.deepEqual(output.writes.slice(0, 5).map(write => Number(write.value)), [
    0x0c04db00, OWNED, RELICS, BAT, GAME
  ]);
  assert.equal(output.writes.filter(write => valueIs(write, RELICS)).length, 1);
  assert.deepEqual(output.writes.slice(4), aperture.writes.slice(2));
  assert.deepEqual(output.writes.slice(0, 2), aperture.writes.slice(0, 2));
  assert.equal(output.writes.length, aperture.writes.length + 2);
  assertBatRoundTrip(output);
  assert.deepEqual(generate(aperture, []).writes, aperture.writes);
  assert.deepEqual(aperture, original);
});

for (const missing of [[OWNED], [RELICS], [OWNED, RELICS]]) {
  test(`missing relic initialization ${missing.map(value => value.toString(16)).join(" and ")} is restored independently`, () => {
    const source = { writes: structuredClone(template.writes.filter(write => !missing.some(value => valueIs(write, value)))) };
    const original = structuredClone(source);
    const output = generate(source);
    const batIndex = output.writes.findIndex(write => valueIs(write, BAT));
    for (const value of [OWNED, RELICS]) {
      assert.equal(output.writes.filter(write => valueIs(write, value)).length, 1);
      assert.ok(output.writes.findIndex(write => valueIs(write, value)) < batIndex);
    }
    assertBatRoundTrip(output);
    assert.deepEqual(generate(source, []).writes, source.writes);
    assert.deepEqual(source, original);
  });
}

test("numeric and uppercase commentless relic anchors are reused without duplication", () => {
  for (const numeric of [false, true]) {
    const source = {
      writes: template.writes.map(write => [OWNED, RELICS].some(value => valueIs(write, value))
        ? word(numeric ? Number(write.value) : write.value.toUpperCase())
        : structuredClone(write))
    };
    const original = structuredClone(source);
    const output = generate(source);
    for (const value of [OWNED, RELICS]) {
      assert.equal(output.writes.filter(write => valueIs(write, value)).length, 1);
      assert.deepEqual(output.writes.find(write => valueIs(write, value)), source.writes.find(write => valueIs(write, value)));
    }
    assert.equal(output.writes.length, source.writes.length + 1);
    assertBatRoundTrip(output);
    assert.deepEqual(source, original);
  }
});

for (const afterReturn of [false, true]) {
  test(`relic anchors only after the ${afterReturn ? "return" : "game bank"} cannot initialize an earlier Soul of Bat grant`, () => {
    const writes = structuredClone(template.writes.filter(write => ![OWNED, RELICS].some(value => valueIs(write, value))));
    const late = [word("0x34020003", { comment: "Later owned value" }), word("0x3c038009", { comment: "Later relic bank" })];
    const insertion = afterReturn ? writes.length : writes.findIndex(write => valueIs(write, RETURN));
    writes.splice(insertion, 0, ...late);
    const source = { writes };
    const original = structuredClone(source);
    const output = generate(source);
    const batIndex = output.writes.findIndex(write => valueIs(write, BAT));
    assert.deepEqual(output.writes.slice(batIndex - 2, batIndex + 1).map(write => Number(write.value)), [OWNED, RELICS, BAT]);
    for (const value of [OWNED, RELICS]) assert.equal(output.writes.filter(write => valueIs(write, value)).length, 2);
    for (const write of late) assert.deepEqual(output.writes.find(candidate => candidate.comment === write.comment), write);
    assertBatRoundTrip(output);
    assert.deepEqual(source, original);
  });
}

test("a game anchor at the routine entry transfers its address to restored relic initialization", () => {
  const source = {
    writes: [
      structuredClone(template.writes[0]),
      word("0x3c038004", { address: "0x00158c98", comment: "Existing game bank" }),
      word("0xa062beb3"),
      ...structuredClone(template.writes.slice(-2))
    ]
  };
  const original = structuredClone(source);
  const output = generate(source);
  assert.deepEqual(output.writes.slice(1, 5).map(write => Number(write.value)), [OWNED, RELICS, BAT, GAME]);
  assert.equal(Number(output.writes[1].address), 0x158c98);
  assert.equal(output.writes[4].address, undefined);
  assert.equal(output.writes[4].comment, "Existing game bank");
  const locations = writeLocations(output.writes);
  assert.equal(locations.filter(location => location.address === 0x158c98).length, 1);
  assert.equal(locations[3].address, 0x158ca0);
  assert.equal(locations[4].address, 0x158ca4);
  assertBatRoundTrip(output);
  assert.deepEqual(source, original);
});
