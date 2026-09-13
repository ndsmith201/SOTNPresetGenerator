const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { test } = require("node:test");
const { buildPreviewPreset, toPresetOptions } = require("../dist/renderer/preset-utils.js");
const { DEFAULT_BUILT_IN_SETTINGS } = require("../dist/renderer/constants.js");

const preset = {
  id: "test", name: "Test", optionIds: [], complexity: 1, metaExtension: "Scenic",
  builtInSettings: DEFAULT_BUILT_IN_SETTINGS, createdAt: "", updatedAt: ""
};
function option(id, label, extra = {}) {
  return {
    id, label, category: "relics", description: "", injectedWrites: [],
    gameInitWrites: [], appendedWrites: [], previewJson: null, ...extra
  };
}
function preview(template, options, ids = options.map((option) => option.id)) {
  return buildPreviewPreset(template, { ...preset, optionIds: ids }, options);
}

test("stat-edit options keep their UI category and follow all relic writes in the JSON", () => {
  const [statEdit, regular] = toPresetOptions([
    { id: 901, comment: "Raise strength", category: "gameplay", type: "word", value: "0x00000001", address: "0x00123456", gameInit: false, statEdit: true, rawJson: false, additionalWrites: [] },
    { id: 902, comment: "Regular patch", category: "gameplay", type: "word", value: "0x00000002", address: "0x00123458", gameInit: false, statEdit: false, rawJson: false, additionalWrites: [] }
  ]);
  const template = { writes: [
    { comment: "Before", type: "word", value: "0x00000000" },
    { comment: "lui v1, 0x8004", type: "word", value: "0x3c038004" },
    { comment: "After", type: "word", value: "0x00000000" }
  ] };
  const relic = option("relic", "Enable Soul of Bat", {
    injectedWrites: [{ comment: "First relic" }, { comment: "Relic follow-up" }]
  });
  const otherRelic = option("other-relic", "Enable Leap Stone", {
    injectedWrites: [{ comment: "Second relic" }]
  });
  const otherStatEdit = structuredClone(statEdit);
  otherStatEdit.id = "other-stat-edit";
  otherStatEdit.injectedWrites = [{ comment: "Raise defense" }, { comment: "Stat follow-up" }];
  const options = [statEdit, relic, otherStatEdit, regular, otherRelic];
  const originalOptions = structuredClone(options);
  const result = preview(template, options);

  assert.equal(statEdit.category, "gameplay");
  assert.deepEqual(result.writes.map((write) => write.comment), [
    "Before", "First relic", "Relic follow-up", "Second relic", "Raise strength",
    "Raise defense", "Stat follow-up", "lui v1, 0x8004", "After", "Regular patch"
  ]);
  assert.deepEqual(options, originalOptions);
  const fallback = preview({ writes: [{ comment: "j 0x800e493c" }] }, options);
  assert.deepEqual(fallback.writes.map((write) => write.comment), [
    "First relic", "Relic follow-up", "Second relic", "Raise strength", "Raise defense",
    "Stat follow-up", "Regular patch", "j 0x800e493c"
  ]);
});

test("regular option writes precede the return and nop without redirecting the return address", () => {
  const template = JSON.parse(readFileSync(path.join(__dirname, "../templates/preset-template.json"), "utf8"));
  const original = structuredClone(template);
  const options = toPresetOptions([
    { id: 1, comment: "Relic", category: "relics", type: "word", value: "0xa0627964", address: null },
    { id: 2, comment: "Stat", category: "gameplay", type: "word", value: "0x00000001", statEdit: true },
    { id: 3, comment: "Init", category: "gameplay", type: "word", value: "0x00000002", gameInit: true },
    { id: 4, comment: "Patch", category: "world", type: "word", value: "0x12345678", address: "0x1000",
      additionalWrites: [{ comment: "Patch follow-up", type: "word", value: "0x12345679" }] }
  ].map((entry) => ({ gameInit: false, statEdit: false, rawJson: false, additionalWrites: [], ...entry })));
  const originalOptions = structuredClone(options);
  const result = preview(template, options);
  assert.deepEqual(result.writes.slice(-2), [
    { ...template.writes.at(-2), address: "0x00158cb8" }, template.writes.at(-1)
  ]);
  assert.deepEqual(result.writes.slice(template.writes.findIndex(write => Number(write.value) === 0x3c038004), -2).map((write) => write.comment), [
    "Relic", "Stat", "lui v1, 0x8004", "Init", "Patch", "Patch follow-up"
  ]);
  assert.deepEqual(template, original);
  assert.deepEqual(options, originalOptions);
  assert.deepEqual(preview(template, options, []).writes, template.writes);
});

test("raw JSON writes retain their existing replacement behavior", () => {
  const template = JSON.parse(readFileSync(path.join(__dirname, "../templates/preset-template.json"), "utf8"));
  const raw = { writes: [...template.writes, { comment: "Raw patch", address: "0x2000", type: "word", value: "0x12345678" }] };
  const original = structuredClone(raw);
  const options = [option("regular", "Regular", { appendedWrites: [{ comment: "Regular patch" }] }),
    option("raw", "Raw", { previewJson: raw })];
  assert.deepEqual(preview(template, options).writes, raw.writes);
  assert.deepEqual(raw, original);
});

test("a game-init anchor after the return cannot put option writes past the return", () => {
  const tail = [
    { reason: "Return from injected code", type: "word", value: "0x0803924f" },
    { type: "word", value: "0x00000000", comment: "nop" },
    { type: "word", value: "0x3c038004", comment: "lui v1, 0x8004" }
  ];
  const options = [option("all", "All", { injectedWrites: [{ comment: "Relic" }],
    gameInitWrites: [{ comment: "Init" }], appendedWrites: [{ comment: "Patch" }] })];
  assert.deepEqual(preview({ writes: tail }, options).writes, [
    { comment: "Relic" }, { type: "word", value: "0x3c038004", comment: "lui v1, 0x8004" },
    { comment: "Init" }, { comment: "Patch" }, ...tail
  ]);
  assert.deepEqual(preview({}, options).writes.map((write) => write.comment), ["Relic", "lui v1, 0x8004", "Init", "Patch"]);
});

test("removes all selected relics from every combination using exact names", () => {
  const options = [option("bat", "Enable Soul of Bat"), option("leap", "Enable Leap Stone")];
  const result = preview({ lockLocation: [
    { location: "Cube of Zoe", locks: ["Soul of Bat + Leap Stone + Holy glasses", "Soul of Bat + Gravity Boots"] },
    { location: "Spirit Orb", locks: ["Leap Stone+ Jewel of Open", "Fire of Bat", "Soul of Bat Extra"] }
  ] }, options);
  assert.deepEqual(result.lockLocation.map((entry) => entry.locks), [
    ["Holy glasses"], ["Jewel of Open", "Fire of Bat", "Soul of Bat Extra"]
  ]);
});

test("a fully satisfied alternative unlocks the location", () => {
  const result = preview({ lockLocation: [
    { location: "Cube of Zoe", locks: ["Soul of Bat", "Leap Stone + Gravity Boots"] },
    { location: "Spirit Orb", locks: ["Soul of Bat + Leap Stone", "Leap Stone"] },
    { location: "Gravity Boots", locks: [] }
  ] }, [option("bat", "Enable Soul of Bat")]);
  assert.deepEqual(result.lockLocation.map((entry) => entry.locks), [[], [], []]);
});

test("starting equipment options remove their exact lock requirements and deselection restores them", () => {
  const equipment = [
    ["Start with Gold Ring", "Gold ring"],
    ["Start with Silver Ring", "Silver ring"],
    ["Start with Holy Glasses", "Holy glasses"]
  ];
  for (const [label, requirement] of equipment) {
    const options = [option(label, label, { category: "items" })];
    const template = { lockLocation: [
      { location: "Cube of Zoe", locks: [`${requirement} + Jewel of Open`] },
      { location: "Spirit Orb", locks: [requirement, "Soul of Bat"] },
      { location: "Gravity Boots", locks: [`${requirement} Extra`] }
    ] };
    const original = structuredClone(template);
    assert.deepEqual(preview(template, options).lockLocation.map(entry => entry.locks), [
      ["Jewel of Open"], [], [`${requirement} Extra`]
    ], label);
    assert.deepEqual(preview(template, options, []).lockLocation, original.lockLocation, label);
    assert.deepEqual(template, original);
  }
});

test("starting rings and glasses combine with selected relics to unlock locations", () => {
  const options = [
    option("gold", "Start with Gold Ring", { category: "items" }),
    option("silver", "Start with Silver Ring", { category: "items" }),
    option("glasses", "Start with Holy Glasses", { category: "items" }),
    option("jewel", "Enable Jewel of Open")
  ];
  const template = { lockLocation: [
    { location: "Holy glasses", locks: ["Gold ring + Silver ring"] },
    { location: "Trio", locks: ["Holy glasses + Jewel of Open"] }
  ] };
  assert.deepEqual(preview(template, options, ["gold"]).lockLocation.map(entry => entry.locks), [
    ["Silver ring"], ["Holy glasses + Jewel of Open"]
  ]);
  assert.deepEqual(preview(template, options).lockLocation.map(entry => entry.locks), [[], []]);
});

test("requirement removal keeps only one copy of identical locks within each location", () => {
  const template = { lockLocation: [
    { location: "Cube of Zoe", locks: [
      "Jewel of Open + Leap Stone", "Leap Stone + Jewel of Open", "Leap Stone",
      "Jewel of Open+Leap Stone", "Form of Mist + Soul of Wolf"
    ] },
    { location: "Spirit Orb", locks: ["Leap Stone + Jewel of Open", "Leap Stone", "Form of Mist"] }
  ] };
  const original = structuredClone(template);
  const result = preview(template, [option("jewel", "Enable Jewel of Open")]);
  assert.deepEqual(result.lockLocation.map((entry) => entry.locks), [
    ["Leap Stone", "Form of Mist + Soul of Wolf"], ["Leap Stone", "Form of Mist"]
  ]);
  assert.deepEqual(template, original);
});

test("deselection restores locks without modifying template or other location fields", () => {
  const template = { lockLocation: [{ location: "Soul of Bat", comment: "Keep",
    locks: ["Soul of Bat + Jewel of Open"], escapeRequires: ["Soul of Bat"], block: ["Soul of Bat"] }] };
  const original = structuredClone(template);
  const options = [option("bat", "Enable Soul of Bat")];
  const selected = preview(template, options);
  assert.deepEqual(selected.lockLocation[0], { ...original.lockLocation[0], locks: ["Jewel of Open"], escapeRequires: [] });
  assert.deepEqual(preview(template, options, []).lockLocation, original.lockLocation);
  assert.deepEqual(template, original);
  assert.deepEqual(preview(template, [option("other", "Enable Soul of Bat", { category: "world" })]).lockLocation, original.lockLocation);
});

test("processes locks supplied by a raw JSON option without mutating the option", () => {
  const raw = { lockLocation: [{ location: "Soul of Bat", locks: ["Form of Mist + Holy glasses"] }] };
  const original = structuredClone(raw);
  const result = preview({}, [option("mist", "Enable Form of Mist"),
    option("raw", "Custom", { category: "world", previewJson: raw })]);
  assert.deepEqual(result.lockLocation[0].locks, ["Holy glasses"]);
  assert.deepEqual(raw, original);
});

test("all enabled relics from the SQL dump are removed across the real template", () => {
  const database = new DatabaseSync(":memory:");
  let rows;
  try {
    database.exec(readFileSync(path.join(__dirname, "../database/options-dump.sql"), "utf8"));
    rows = database.prepare("SELECT * FROM options WHERE category = ?").all("relics");
  } finally {
    database.close();
  }
  const options = toPresetOptions(rows.map((row) => ({ ...row,
    gameInit: Boolean(row.game_init), statEdit: Boolean(row.stat_edit), rawJson: Boolean(row.raw_json),
    additionalWrites: JSON.parse(row.additional_writes_json || "[]")
  })));
  const template = JSON.parse(readFileSync(path.join(__dirname, "../templates/preset-template.json"), "utf8"));
  const original = structuredClone(template);
  for (const selected of [...options.map((option) => [option]), options]) {
    const result = preview(template, options, selected.map((option) => option.id));
    assert.equal(result.lockLocation.length, template.lockLocation.length);
    const names = new Set(selected.map((option) => option.label.slice("Enable ".length)));
    for (const location of result.lockLocation) {
      for (const lock of location.locks || []) {
        assert.ok(lock.split("+").every((name) => !names.has(name.trim())), location.location);
      }
    }
  }
  assert.deepEqual(template, original);
});

const flightMethods = [
  ["Soul of Bat"], ["Leap Stone", "Gravity Boots"], ["Form of Mist", "Power of Mist"]
];
const flightOptions = flightMethods.flat().map((name) => option(name, `Enable ${name}`));

for (const method of flightMethods) {
  test(`${method.join(" + ")} satisfies every complete flight method in locks`, () => {
    const template = { lockLocation: [
      { location: "Cube of Zoe", locks: ["Holy glasses + Soul of Bat"] },
      { location: "Spirit Orb", locks: ["Gravity Boots + Holy glasses + Leap Stone"] },
      { location: "Gravity Boots", locks: ["Power of Mist + Holy glasses + Form of Mist"] },
      { location: "Leap Stone", locks: ["Form of Mist + Power of Mist"] },
      { location: "Holy Symbol", locks: flightMethods.map((relics) => `Holy glasses + ${relics.join(" + ")}`) }
    ] };
    const original = structuredClone(template);
    const result = preview(template, flightOptions, method);
    assert.deepEqual(result.lockLocation.map((entry) => entry.locks), [
      ["Holy glasses"], ["Holy glasses"], ["Holy glasses"], [], ["Holy glasses"]
    ]);
    assert.deepEqual(preview(template, flightOptions, []).lockLocation, original.lockLocation);
    assert.deepEqual(template, original);
  });
}

test("incomplete flight selections do not satisfy other flight methods", () => {
  const template = { lockLocation: [{ location: "Cube of Zoe", locks: [
    "Soul of Bat", "Leap Stone + Gravity Boots", "Form of Mist + Power of Mist"
  ] }] };
  const result = preview(template, flightOptions, ["Leap Stone", "Form of Mist"]);
  assert.deepEqual(result.lockLocation[0].locks, ["Soul of Bat", "Gravity Boots", "Power of Mist"]);
});

test("flight preserves standalone relic requirements and matches pairs before simplification", () => {
  const template = { lockLocation: [
    { location: "Cube of Zoe", locks: ["Form of Mist + Jewel of Open"] },
    { location: "Spirit Orb", locks: ["Leap Stone + Holy glasses"] },
    { location: "Gravity Boots", locks: ["Leap Stone + Gravity Boots + Holy glasses"] }
  ] };
  const result = preview(template, flightOptions, ["Soul of Bat", "Gravity Boots"]);
  assert.deepEqual(result.lockLocation.map((entry) => entry.locks), [
    ["Form of Mist"], ["Holy glasses"], ["Holy glasses"]
  ]);
});

test("flight reduces Mist combinations to Mist and keeps standalone Mist", () => {
  const template = { lockLocation: [
    { location: "Cube of Zoe", locks: ["Form of Mist + Leap Stone", "Jewel of Open + Form of Mist", "Form of Mist"] },
    { location: "Spirit Orb", locks: ["Form of Mist + Soul of Wolf"] },
    { location: "Gravity Boots", locks: ["Form of Mist + Gravity Boots + Soul of Wolf"] }
  ] };
  for (const method of flightMethods.slice(0, 2)) {
    assert.deepEqual(preview(template, flightOptions, method).lockLocation.map((entry) => entry.locks), [
      ["Form of Mist"], ["Form of Mist"], ["Form of Mist"]
    ]);
  }
  assert.deepEqual(preview(template, flightOptions, []).lockLocation, template.lockLocation);
});

test("flight removes the Mist flight alternative while preserving other Mist barriers", () => {
  const template = { lockLocation: [
    { location: "Cube of Zoe", locks: ["Form of Mist + Power of Mist", "Form of Mist + Leap Stone"] },
    { location: "Spirit Orb", locks: ["Holy glasses + Form of Mist + Power of Mist"] }
  ] };
  const result = preview(template, flightOptions, ["Soul of Bat"]);
  assert.deepEqual(result.lockLocation.map((entry) => entry.locks), [["Form of Mist"], ["Holy glasses"]]);
});

test("flight and explicitly enabled Mist also satisfy the remaining Mist requirement", () => {
  const template = { lockLocation: [{ location: "Cube of Zoe", locks: ["Form of Mist + Jewel of Open"] }] };
  const result = preview(template, flightOptions, ["Soul of Bat", "Form of Mist"]);
  assert.deepEqual(result.lockLocation[0].locks, []);
});

test("Soul of Bat's real location still requires Mist when Bat or jump flight is enabled", () => {
  const template = JSON.parse(readFileSync(path.join(__dirname, "../templates/preset-template.json"), "utf8"));
  for (const ids of [["Soul of Bat"], ["Leap Stone", "Gravity Boots"]]) {
    const result = preview(template, flightOptions, ids);
    assert.deepEqual(result.lockLocation.find((entry) => entry.location === "Soul of Bat").locks, ["Form of Mist"]);
    assert.deepEqual(result.lockLocation.find((entry) => entry.location === "Fire of Bat").locks, []);
  }
  for (const ids of [["Soul of Bat", "Form of Mist"], ["Form of Mist", "Power of Mist"]]) {
    const result = preview(template, flightOptions, ids);
    assert.deepEqual(result.lockLocation.find((entry) => entry.location === "Soul of Bat").locks, []);
  }
  assert.deepEqual(
    preview(template, flightOptions, []).lockLocation,
    template.lockLocation
  );
});

test("every complete flight method removes Leap Stone from Demon Card's real locks", () => {
  const template = JSON.parse(readFileSync(path.join(__dirname, "../templates/preset-template.json"), "utf8"));
  const original = structuredClone(template);
  for (const method of flightMethods) {
    const result = preview(template, flightOptions, method);
    const demonCard = result.lockLocation.find((entry) => entry.location === "Demon Card");
    assert.deepEqual(demonCard.locks, ["Jewel of Open"]);
  }
  const withoutFlight = preview(template, flightOptions, ["Form of Mist"]);
  assert.ok(withoutFlight.lockLocation.find((entry) => entry.location === "Demon Card").locks.includes("Jewel of Open + Leap Stone"));
  assert.deepEqual(preview(template, flightOptions, []).lockLocation, original.lockLocation);
  assert.deepEqual(template, original);
});

test("flight removes the complete Wolf pair, preserving individual Wolf requirements", () => {
  const template = { lockLocation: [
    { location: "Cube of Zoe", locks: ["Soul of Wolf + Power of Wolf"] },
    { location: "Spirit Orb", locks: ["Power of Wolf + Jewel of Open + Soul of Wolf", "Jewel of Open"] },
    { location: "Gravity Boots", locks: ["Soul of Wolf + Jewel of Open"] },
    { location: "Leap Stone", locks: ["Power of Wolf + Jewel of Open"] },
    { location: "Holy Symbol", locks: ["Soul of Wolf", "Power of Wolf"] },
    { location: "Faerie Scroll", locks: ["Soul of Wolf + Power of Wolf", "Jewel of Open"] }
  ] };
  for (const method of flightMethods) {
    const result = preview(template, flightOptions, method);
    assert.deepEqual(result.lockLocation.map((entry) => entry.locks), [
      [], ["Jewel of Open"], ["Soul of Wolf + Jewel of Open"],
      ["Power of Wolf + Jewel of Open"], ["Soul of Wolf", "Power of Wolf"], ["Jewel of Open"]
    ]);
  }
  assert.deepEqual(preview(template, flightOptions, []).lockLocation, template.lockLocation);
});

test("enabled Wolf relics do not grant flight and explicit selections still remove themselves", () => {
  const options = [...flightOptions, option("wolf", "Enable Soul of Wolf"), option("power", "Enable Power of Wolf")];
  const template = { lockLocation: [
    { location: "Cube of Zoe", locks: ["Soul of Bat", "Leap Stone + Gravity Boots", "Form of Mist + Power of Mist"] },
    { location: "Spirit Orb", locks: ["Soul of Wolf + Power of Wolf + Jewel of Open"] }
  ] };
  const wolfOnly = preview(template, options, ["wolf"]);
  assert.deepEqual(wolfOnly.lockLocation[1].locks, ["Power of Wolf + Jewel of Open"]);
  const wolfPair = preview(template, options, ["wolf", "power"]);
  assert.deepEqual(wolfPair.lockLocation[0].locks, template.lockLocation[0].locks);
  assert.deepEqual(wolfPair.lockLocation[1].locks, ["Jewel of Open"]);
  const batAndWolf = preview(template, options, ["Soul of Bat", "wolf"]);
  assert.deepEqual(batAndWolf.lockLocation[1].locks, ["Jewel of Open"]);
});

test("every flight method reduces Alucart sword's real locks to Cube of Zoe", () => {
  const template = JSON.parse(readFileSync(path.join(__dirname, "../templates/preset-template.json"), "utf8"));
  const original = structuredClone(template);
  for (const method of flightMethods) {
    const result = preview(template, flightOptions, method);
    assert.deepEqual(result.lockLocation.find((entry) => entry.location === "Alucart sword").locks, ["Cube of Zoe"]);
  }
  const withoutFlight = preview(template, flightOptions, ["Form of Mist"]);
  assert.ok(withoutFlight.lockLocation.find((entry) => entry.location === "Alucart sword").locks.includes("Cube of Zoe + Gravity Boots"));
  assert.deepEqual(preview(template, flightOptions, []).lockLocation, original.lockLocation);
  assert.deepEqual(template, original);
});

test("Gravity Boots alone still does not grant flight", () => {
  const template = { lockLocation: [{ location: "Cube of Zoe", locks: [
    "Soul of Bat", "Gravity Boots + Leap Stone", "Form of Mist + Power of Mist"
  ] }] };
  assert.deepEqual(preview(template, flightOptions, ["Gravity Boots"]).lockLocation[0].locks, [
    "Soul of Bat", "Leap Stone", "Form of Mist + Power of Mist"
  ]);
});

test("Elixir route selection handles overlapping flight methods and partial Mist", () => {
  const template = JSON.parse(readFileSync(path.join(__dirname, "../templates/preset-template.json"), "utf8"));
  const options = [...flightOptions,
    option("glasses", "Enable Holy glasses"), option("spikes", "Enable Spike Breaker")];
  const scenarios = [
    [["Soul of Bat", "Gravity Boots", "Leap Stone"], ["Holy glasses"]],
    [["Soul of Bat", "Form of Mist"], ["Holy glasses"]],
    [["Gravity Boots", "Leap Stone", "Form of Mist"], ["Holy glasses + Spike Breaker"]],
    [["Soul of Bat", "Form of Mist", "Power of Mist"], []],
    [["Gravity Boots", "Leap Stone", "Form of Mist", "Power of Mist"], []],
    [["Gravity Boots", "Leap Stone", "spikes"], ["Holy glasses"]],
    [["Gravity Boots", "Leap Stone", "glasses"], ["Spike Breaker"]],
    [["Gravity Boots", "Leap Stone", "glasses", "spikes"], []]
  ];
  for (const [ids, expected] of scenarios) {
    const result = preview(template, options, ids);
    assert.deepEqual(result.lockLocation.find((entry) => entry.location === "Floating Catacombs Elixir").locks,
      expected, ids.join(" + "));
  }
});

test("Staurolite retains Holy glasses with enabled Mist until glasses are also enabled", () => {
  const template = JSON.parse(readFileSync(path.join(__dirname, "../templates/preset-template.json"), "utf8"));
  const options = [...flightOptions, option("glasses", "Enable Holy glasses")];
  for (const method of flightMethods) {
    const ids = [...method, "Form of Mist"];
    assert.deepEqual(preview(template, options, ids).lockLocation.find((entry) => entry.location === "Staurolite").locks,
      ["Holy glasses"]);
    assert.deepEqual(preview(template, options, [...ids, "glasses"]).lockLocation.find((entry) => entry.location === "Staurolite").locks,
      []);
  }
});
