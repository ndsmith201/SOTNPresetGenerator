const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildPreviewPreset, createPresetFromTemplate } = require("../dist/renderer/preset-utils.js");
const { itemInitializationRange, ensureItemInitialization } = require("../dist/renderer/item-initialization.js");
const { mainBlockStart } = require("../dist/renderer/template-options.js");

const SAVE = 0x37f70000;
const RECALL = 0x36ff0000;
const GAME = 0x3c038004;
const RETURN = 0x0803924f;
const word = value => ({ type: "word", value });
const representations = value => [value, String(value), `0X${value.toString(16).toUpperCase()}`, `0x${value.toString(16).padStart(12, "0")}`];
const option = (id, placement, writes) => ({
  id, label: id, category: "world", description: "", previewJson: null,
  injectedWrites: [], gameInitWrites: [], itemInitWrites: [], mainBlockWrites: [], appendedWrites: [],
  [placement]: writes
});
function generate(writes, options) {
  // A default draft isolates placement matching from template scaffold repair.
  const draft = createPresetFromTemplate("Value anchors");
  draft.optionIds = options.map(item => item.id);
  return buildPreviewPreset({ writes }, draft, options, undefined, 0).writes;
}

test("item range anchors use numeric values regardless of type, comments, or representation", () => {
  const saves = representations(SAVE);
  const recalls = representations(RECALL);
  const returns = representations(RETURN);
  for (let index = 0; index < saves.length; index++) {
    const writes = [
      { value: saves[index], type: index % 2 ? "string" : "arbitrary", comment: "Unrelated label" },
      word("0x34040001"),
      { value: recalls[index], reason: "Unrelated reason" },
      { value: returns[index], type: "short" }
    ];
    assert.deepEqual(itemInitializationRange(writes), { start: 0, end: 2 });
  }
});

test("complete item pairs with nonstandard or missing types are reused without duplicates or changes", () => {
  const writes = [
    { value: "0X0037F70000", type: "short", address: "0x00158c98", custom: { keep: true } },
    word("0x34040001"), { value: String(RECALL), comment: "Keep this existing recall" },
    { value: RETURN, type: "string" }
  ];
  const original = structuredClone(writes);
  assert.deepEqual(ensureItemInitialization(writes), { start: 0, end: 2 });
  assert.deepEqual(writes, original);
  assert.deepEqual(ensureItemInitialization(writes), { start: 0, end: 2 });
  assert.deepEqual(writes, original);
});

test("partial item pairs reuse each existing value-only anchor independently", () => {
  const save = { value: String(SAVE), type: "custom", address: "0x00158c98" };
  const initialization = { value: String(0x34020003) };
  const onlySave = [save, word("0x34040001"), initialization, { value: RETURN, type: "char" }];
  assert.deepEqual(ensureItemInitialization(onlySave), { start: 0, end: 2 });
  assert.deepEqual(onlySave[0], save);
  assert.deepEqual(onlySave[3], initialization);
  for (const value of [SAVE, RECALL]) assert.equal(onlySave.filter(write => Number(write.value) === value).length, 1);
  const recall = { value: "0X0036FF0000", type: "custom", note: "Existing partner" };
  const onlyRecall = [recall, { value: GAME }, { value: RETURN }];
  assert.deepEqual(ensureItemInitialization(onlyRecall), { start: 0, end: 1 });
  assert.deepEqual(onlyRecall[1], recall);
  for (const value of [SAVE, RECALL]) assert.equal(onlyRecall.filter(write => Number(write.value) === value).length, 1);
});

test("item ranges still require save then recall before the first return value", () => {
  assert.equal(itemInitializationRange([{ value: RECALL }, { value: SAVE }, { value: RETURN }]), null);
  assert.equal(itemInitializationRange([{ value: SAVE }, { value: RETURN }, { value: RECALL }]), null);
  assert.equal(itemInitializationRange([{ value: RETURN }, { value: SAVE }, { value: RECALL }]), null);
  assert.deepEqual(itemInitializationRange([
    { value: RECALL }, { value: SAVE }, word(1), { value: RECALL }, { value: RETURN },
    { value: SAVE }, { value: RECALL }
  ]), { start: 1, end: 3 });
});

test("item anchor comments and reasons cannot substitute for a wrong value", () => {
  assert.equal(itemInitializationRange([
    { value: 1, comment: "Save Return Address for rA (Armor Code)" },
    { value: 2, reason: "Recall Return Address for rA (Armor Code)" }, { value: RETURN }
  ]), null);
});

test("main block pairs recognize return and zero values independently of write types", () => {
  const returns = representations(RETURN);
  const nops = representations(0);
  for (let index = 0; index < returns.length; index++) {
    assert.equal(mainBlockStart([
      word(1), { value: returns[index], type: "arbitrary", comment: "Not a return label" },
      { value: nops[index], reason: "Not a nop label" }, word(2)
    ]), 3);
  }
});

test("main block requires the zero value immediately following the return value", () => {
  assert.equal(mainBlockStart([{ value: RETURN }, word(1), { value: 0 }]), null);
  assert.equal(mainBlockStart([{ value: 0 }, { value: RETURN }]), null);
  assert.equal(mainBlockStart([{ value: RETURN }]), null);
  assert.equal(mainBlockStart([{ value: RETURN - 1, comment: "j 0x800e493c", reason: "Return from injected code" }, { value: 0 }]), null);
});

test("null, booleans, empty values, arrays and objects cannot stand in for a nop", () => {
  for (const value of [null, false, true, "", "  ", [], [0], {}, { value: 0 }, undefined]) {
    assert.equal(mainBlockStart([{ value: RETURN }, { type: "word", value, comment: "nop" }]), null);
  }
  assert.equal(mainBlockStart([{ value: RETURN }, { type: "word", reason: "nop" }]), null);
});

test("game and return placements recognize value-only anchors in each supported numeric representation", () => {
  const games = representations(GAME);
  const returns = representations(RETURN);
  const injected = [word("0xa0627964")];
  const gameInit = [word("0x3402001f")];
  const appended = [word("0x12345678")];
  const mainBlock = [word("0x87654321")];
  const options = [
    option("injected", "injectedWrites", injected), option("game", "gameInitWrites", gameInit),
    option("appended", "appendedWrites", appended), option("main", "mainBlockWrites", mainBlock)
  ];
  for (let index = 0; index < games.length; index++) {
    const before = word("0x11111111");
    const gameAnchor = { value: games[index], type: index % 2 ? "char" : "unrecognized", note: "Keep game properties" };
    const returnAnchor = { value: returns[index], comment: "Keep return properties" };
    const nop = { value: "0X000000000000", type: "short" };
    const tail = { ...word("0x22222222"), address: "0x2000" };
    const writes = [before, gameAnchor, returnAnchor, nop, tail];
    const original = structuredClone(writes);
    assert.deepEqual(generate(writes, options), [
      before, ...injected, gameAnchor, ...gameInit, ...appended, returnAnchor, nop, ...mainBlock, tail
    ]);
    assert.deepEqual(writes, original);
  }
});

test("return-like comments and reasons do not redirect appended writes away from the actual return value", () => {
  const decoy = { ...word("0x12345678"), comment: "j 0x800e493c", reason: "Return from injected code" };
  const gameAnchor = { value: GAME, type: "custom" };
  const returnAnchor = { value: RETURN, type: "char", comment: "Actual return identified by value" };
  const nop = { value: 0 };
  const gameInit = [word("0x3402001f")];
  const appended = [word("0x87654321")];
  assert.deepEqual(generate([decoy, gameAnchor, returnAnchor, nop], [
    option("game", "gameInitWrites", gameInit), option("appended", "appendedWrites", appended)
  ]), [decoy, gameAnchor, ...gameInit, ...appended, returnAnchor, nop]);
});

test("misleading comments cannot invent missing game or return anchors", () => {
  const decoy = { ...word("0x11111111"), comment: "lui v1, 0x8004; j 0x800e493c", reason: "Return from injected code" };
  const tail = word("0x22222222");
  const appended = [word("0x87654321")];
  assert.deepEqual(generate([decoy, tail], [option("appended", "appendedWrites", appended)]), [decoy, tail, ...appended]);
  const gameInit = [word("0x3402001f")];
  const withGame = generate([decoy, { value: RETURN }, { value: 0 }], [option("game", "gameInitWrites", gameInit)]);
  assert.deepEqual(withGame.map(write => Number(write.value)), [0x11111111, GAME, 0x3402001f, RETURN, 0]);
  assert.deepEqual(withGame[0], decoy);
});

test("a value-only game anchor after the return is not an initialization placement", () => {
  const returnAnchor = { value: RETURN, type: "custom" };
  const nop = { value: 0 };
  const lateGame = { value: GAME, type: "short", comment: "Late anchor stays in place" };
  const gameInit = [word("0x3402001f")];
  const output = generate([returnAnchor, nop, lateGame], [option("game", "gameInitWrites", gameInit)]);
  assert.deepEqual(output.map(write => Number(write.value)), [GAME, 0x3402001f, RETURN, 0, GAME]);
  assert.deepEqual(output.at(-1), lateGame);
});
