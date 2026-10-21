const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildPreviewPreset, createPresetFromTemplate, toPresetOptions } = require("../dist/renderer/preset-utils.js");
const { writeLocations } = require("../dist/renderer/template-options.js");
const { detectStartingRelics } = require("../dist/renderer/starting-relics.js");
const { itemInitializationRange } = require("../dist/renderer/item-initialization.js");
const { ensureInjectedCode } = require("../dist/renderer/injected-code.js");
const template = require("../templates/preset-template.json");

const word = (value, extra = {}) => ({ type: "word", value, ...extra });
const row = (id, comment, writes, extra = {}) => ({
  id, comment, category: "world", writes, gameInit: false, itemInit: false,
  mainBlock: false, statEdit: false, rawJson: false, readOnly: false, ...extra
});
const [bat, game, item, patch, main] = toPresetOptions([
  row(1, "Enable Soul of Bat", [word("0xa0627964")], { category: "relics" }),
  row(2, "Teleporters", [word("0x3402001f"), word("0xa062bebc")], { gameInit: true }),
  row(3, "Initialize item", [word("0x34040001"), word("0x0c012345"), word("0x00000000")], { itemInit: true }),
  row(4, "Regular patch", [word("0x11223344", { address: "0x2000" })]),
  row(5, "Main block patch", [word("0x55667788", { address: "0x3000" })], { mainBlock: true })
]);
const patchOnly = { writes: [word("0x12345678", { address: "0x1000", comment: "Existing patch" })] };
const matches = (write, value) => write.type === "word" && Number(write.value) === value;

function generate(source, options = []) {
  const preset = createPresetFromTemplate("Template anchors", source, options);
  preset.optionIds = options.map(option => option.id);
  return buildPreviewPreset(template, preset, options);
}

function assertStartupScaffold(output) {
  const writes = output.writes;
  const locations = writeLocations(writes);
  const hooks = writes.flatMap((write, index) => matches(write, 0x0c04db00) && locations[index].address === 0xfa97c ? [index] : []);
  assert.equal(hooks.length, 1);
  assert.equal(locations[hooks[0]].address, 0xfa97c);
  assert.ok(locations.some(location => location.startup && location.address === 0x158c98));
  const returns = writes.flatMap((write, index) => matches(write, 0x0803924f) ? [index] : []);
  assert.equal(returns.length, 1);
  assert.ok(locations[returns[0]].startup);
  assert.ok(matches(writes[returns[0] + 1] ?? {}, 0));
  assert.equal(locations[returns[0] + 1].address, locations[returns[0]].address + 4);
}

for (const [label, option, field] of [
  ["relic", bat, "injectedWrites"],
  ["game initialization", game, "gameInitWrites"],
  ["item initialization", item, "itemInitWrites"]
]) {
  test(`a patch-only template gains the jump, startup and return/nop for a selected ${label} option`, () => {
    const original = structuredClone(patchOnly);
    const output = generate(patchOnly, [option]);
    assertStartupScaffold(output);
    const first = output.writes.findIndex(write => matches(write, Number(option[field][0].value)));
    assert.ok(first >= 0);
    assert.deepEqual(output.writes.slice(first, first + option[field].length), option[field]);
    assert.ok(writeLocations(output.writes)[first].startup);
    assert.deepEqual(output.writes.at(-1), patchOnly.writes[0]);
    if (option === bat) assert.ok(detectStartingRelics(output).has("Soul of Bat"));
    if (option === item) {
      const range = itemInitializationRange(output.writes);
      assert.ok(range && first > range.start && first + option[field].length <= range.end);
    }
    assert.deepEqual(generate(output, [option]).writes, output.writes);
    assert.deepEqual(patchOnly, original);
  });
}

for (const [label, value] of [["jump to injected code", 0x0c04db00], ["return", 0x0803924f], ["return nop", 0]]) {
  test(`a missing ${label} is restored independently when startup options are selected`, () => {
    const source = { writes: structuredClone(template.writes.filter(write => !matches(write, value))) };
    const original = structuredClone(source);
    const output = generate(source, [game]);
    assertStartupScaffold(output);
    for (const anchorValue of [0x0c04db00, 0x0803924f, 0]) {
      assert.equal(output.writes.filter(write => matches(write, anchorValue)).length, 1);
    }
    assert.deepEqual(generate(output, [game]).writes, output.writes);
    assert.deepEqual(source, original);
  });
}

for (const [label, value] of [["save", 0x37f70000], ["recall", 0x36ff0000]]) {
  test(`a missing item ${label} anchor is repaired without duplicating its existing partner`, () => {
    const source = { writes: structuredClone(template.writes.filter(write => !matches(write, value))) };
    const original = structuredClone(source);
    const output = generate(source, [item]);
    assertStartupScaffold(output);
    for (const anchorValue of [0x37f70000, 0x36ff0000]) {
      assert.equal(output.writes.filter(write => matches(write, anchorValue)).length, 1);
    }
    const range = itemInitializationRange(output.writes);
    assert.ok(range);
    assert.deepEqual(output.writes.slice(range.start + 1, range.end), item.itemInitWrites);
    assert.deepEqual(generate(output, [item]).writes, output.writes);
    assert.deepEqual(source, original);
  });
}

test("complete numeric and uppercase startup anchors are retained without duplication", () => {
  for (const numeric of [false, true]) {
    const source = {
      writes: template.writes.map(({ comment, reason, ...write }) => ({
        ...write,
        value: numeric ? Number(write.value) : write.value.toUpperCase(),
        ...(write.address === undefined ? {} : {
          address: numeric ? Number(write.address) : write.address.toUpperCase()
        })
      }))
    };
    const original = structuredClone(source);
    const gameIndex = source.writes.findIndex(write => matches(write, 0x3c038004));
    const output = generate(source, [game]);
    assertStartupScaffold(output);
    assert.deepEqual(output.writes, [
      ...source.writes.slice(0, gameIndex + 1), ...game.gameInitWrites,
      ...source.writes.slice(gameIndex + 1)
    ]);
    assert.deepEqual(generate(output, [game]).writes, output.writes);
    assert.deepEqual(source, original);
  }
});

test("inherited startup options also restore missing control-flow anchors without duplicating their writes", () => {
  const gameIndex = template.writes.findIndex(write => matches(write, 0x3c038004));
  const inherited = [
    ...template.writes.slice(0, gameIndex + 1), ...game.gameInitWrites,
    ...template.writes.slice(gameIndex + 1)
  ];
  for (const value of [0x0c04db00, 0x0803924f, 0]) {
    const source = { writes: structuredClone(inherited.filter(write => !matches(write, value))) };
    const preset = createPresetFromTemplate("Inherited startup", source, [game]);
    assert.deepEqual(preset.optionIds, [game.id]);
    const output = buildPreviewPreset(template, preset, [game]);
    assertStartupScaffold(output);
    assert.equal(output.writes.filter(write => matches(write, 0x3402001f)).length, 1);
    assert.deepEqual(generate(output, [game]).writes, output.writes);
  }
});

test("the same jump instruction at a different address does not satisfy the startup hook", () => {
  const source = structuredClone(template);
  source.writes[0].address = "0x2000";
  const original = structuredClone(source);
  const output = generate(source, [game]);
  assertStartupScaffold(output);
  assert.deepEqual(output.writes[0], template.writes[0]);
  assert.ok(output.writes.some(write => matches(write, 0x0c04db00) && Number(write.address) === 0x2000));
  assert.deepEqual(generate(output, [game]).writes, output.writes);
  assert.deepEqual(source, original);
});

test("an existing word at the hook address is repaired without a later overwrite", () => {
  for (const earlierHook of [false, true]) {
    const source = { writes: [
      ...(earlierHook ? [structuredClone(template.writes[0])] : []),
      { ...structuredClone(template.writes[0]), value: "0x00000000" },
      ...structuredClone(template.writes.slice(1))
    ] };
    const original = structuredClone(source);
    const output = generate(source, [game]);
    const locations = writeLocations(output.writes);
    const hooks = output.writes.filter((write, index) => locations[index].address === 0xfa97c);
    assert.equal(hooks.length, earlierHook ? 2 : 1);
    assert.ok(hooks.every(write => matches(write, 0x0c04db00)));
    assert.deepEqual(generate(output, [game]).writes, output.writes);
    assert.deepEqual(source, original);
  }
});

test("a return instruction at another patch address cannot satisfy the startup return", () => {
  const unrelated = [word("0x0803924f", { address: "0x2000" }), word("0x00000000")];
  const source = { writes: [...structuredClone(template.writes.slice(0, -2)), ...unrelated] };
  const original = structuredClone(source);
  const output = generate(source, [game]);
  const locations = writeLocations(output.writes);
  const returns = output.writes.flatMap((write, index) => matches(write, 0x0803924f) && locations[index].startup ? [index] : []);
  assert.equal(returns.length, 1);
  assert.ok(matches(output.writes[returns[0] + 1], 0));
  assert.deepEqual(output.writes.slice(-2), unrelated);
  assert.deepEqual(generate(output, [game]).writes, output.writes);
  assert.deepEqual(source, original);
});

test("pinned recall and return cursors resume startup around addressed patches", () => {
  const writes = [
    ...structuredClone(template.writes.slice(0, 2)),
    word("0x34040001"), word("0x12", { address: "0x1000" }),
    { ...structuredClone(template.writes[2]), address: "0x00158ca0" },
    ...structuredClone(template.writes.slice(3, -2)),
    word("0x12345678", { address: "0x2000" }),
    { ...structuredClone(template.writes.at(-2)), address: "0x00158cb0" },
    structuredClone(template.writes.at(-1))
  ];
  const original = structuredClone(writes);
  ensureInjectedCode(writes);
  assert.deepEqual(writes, original);
  ensureInjectedCode(writes);
  assert.deepEqual(writes, original);
});

test("an unrelated nop cannot satisfy a missing return delay slot", () => {
  const unrelated = word("0x00000000", { comment: "Unrelated startup nop" });
  const source = { writes: [
    ...structuredClone(template.writes.slice(0, 3)), unrelated,
    ...structuredClone(template.writes.slice(3, -1))
  ] };
  const output = generate(source, [game]);
  assertStartupScaffold(output);
  assert.equal(output.writes.filter(write => matches(write, 0)).length, 2);
  assert.ok(output.writes.some(write => write.comment === unrelated.comment));
  assert.deepEqual(generate(output, [game]).writes, output.writes);
});

test("a zero write at an unrelated address cannot satisfy the return delay slot", () => {
  const unrelated = word("0x00000000", { address: "0x2000", comment: "Unrelated addressed zero" });
  const source = { writes: [...structuredClone(template.writes.slice(0, -1)), unrelated] };
  const original = structuredClone(source);
  const output = generate(source, [game]);
  assertStartupScaffold(output);
  assert.deepEqual(output.writes.slice(-3), [...template.writes.slice(-2), unrelated]);
  assert.equal(output.writes.filter(write => matches(write, 0)).length, 2);
  assert.deepEqual(generate(output, [game]).writes, output.writes);
  assert.deepEqual(source, original);
});

test("restoring a missing startup body reuses an existing return and its nop", () => {
  for (const hasHook of [false, true]) {
    const source = { writes: [
      ...(hasHook ? [structuredClone(template.writes[0])] : []),
      ...structuredClone(template.writes.slice(-2)), ...structuredClone(patchOnly.writes)
    ] };
    const output = generate(source, [game]);
    assertStartupScaffold(output);
    assert.equal(output.writes.filter(write => matches(write, 0x0803924f)).length, 1);
    assert.equal(output.writes.filter(write => matches(write, 0)).length, 1);
    assert.deepEqual(output.writes.at(-1), patchOnly.writes[0]);
    assert.deepEqual(generate(output, [game]).writes, output.writes);
  }
});

test("a restored return preserves an existing call and its nop delay slot", () => {
  const call = word("0x0c012345", { comment: "Existing initialization call" });
  const callNop = word("0x00000000", { comment: "Existing call delay slot" });
  const source = { writes: [
    ...structuredClone(template.writes.slice(0, -2)), call, callNop,
    ...structuredClone(patchOnly.writes)
  ] };
  const output = generate(source, [game]);
  assertStartupScaffold(output);
  const callIndex = output.writes.findIndex(write => write.comment === call.comment);
  assert.ok(callIndex >= 0);
  assert.deepEqual(output.writes.slice(callIndex, callIndex + 4), [call, callNop, ...template.writes.slice(-2)]);
  assert.deepEqual(output.writes.at(-1), patchOnly.writes[0]);
  assert.deepEqual(generate(output, [game]).writes, output.writes);
});

test("templates without startup selections retain their existing writes", () => {
  const incomplete = { writes: structuredClone(template.writes.filter(write => !matches(write, 0x0c04db00) && !matches(write, 0x0803924f))) };
  for (const source of [patchOnly, incomplete]) {
    assert.deepEqual(generate(source).writes, source.writes);
  }
  assert.deepEqual(generate(patchOnly, [patch]).writes, [...patchOnly.writes, ...patch.appendedWrites]);
  assert.deepEqual(generate(patchOnly, [main]).writes, [...patchOnly.writes, ...main.mainBlockWrites]);
});

test("missing and empty write sections still use the bundled default routine", () => {
  for (const writes of [undefined, null, []]) {
    const source = writes === undefined ? {} : { writes };
    assert.deepEqual(generate(source).writes, template.writes);
  }
});

test("restored infrastructure and retained writes are cloned independently", () => {
  const originalSource = structuredClone(patchOnly);
  const originalTemplate = structuredClone(template);
  const output = generate(patchOnly, [game]);
  output.writes[0].value = "changed restored anchor";
  output.writes.at(-1).value = "changed retained write";
  assert.deepEqual(patchOnly, originalSource);
  assert.deepEqual(template, originalTemplate);
});
