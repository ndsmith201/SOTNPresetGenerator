import type { WriteEntry } from "./types";
import { hasAnchorValue } from "./write-anchors";

export function itemInitializationRange(writes: WriteEntry[]): { start: number; end: number } | null {
  const returnIndex = writes.findIndex(write => hasAnchorValue(write, 0x0803924f));
  const limit = returnIndex < 0 ? writes.length : returnIndex;
  const start = writes.findIndex((write, index) => index < limit && hasAnchorValue(write, 0x37f70000));
  if (start < 0) return null;
  const end = writes.findIndex((write, index) => index > start && index < limit && hasAnchorValue(write, 0x36ff0000));
  return end < 0 ? null : { start, end };
}

/** Add the item routine before startup code when an older template lacks it. */
export function ensureItemInitialization(writes: WriteEntry[]): { start: number; end: number } {
  const existing = itemInitializationRange(writes);
  if (existing) return existing;
  const returnIndex = writes.findIndex(write => hasAnchorValue(write, 0x0803924f));
  const limit = returnIndex < 0 ? writes.length : returnIndex;
  const saveIndex = writes.findIndex((write, index) => index < limit && hasAnchorValue(write, 0x37f70000));
  const recallIndex = writes.findIndex((write, index) => index < limit && hasAnchorValue(write, 0x36ff0000));
  const startup = writes.findIndex((write, index) => Number(write.address) === 0x158c98 && (returnIndex < 0 || index < returnIndex));
  const save = { address: "0x00158c98", comment: "Save Return Address for rA (Armor Code)", type: "word", value: "0x37F70000" };
  const recall = { comment: "Recall Return Address for rA (Armor Code)", type: "word", value: "0x36FF0000" };
  if (saveIndex >= 0) {
    // Keep any existing item instructions inside the repaired pair.
    const initialization = writes.findIndex((write, index) => index > saveIndex && index < limit &&
      [0x34020003, 0x3c038009, 0x3c038004].some(value => hasAnchorValue(write, value)));
    const end = initialization >= 0 ? initialization : limit;
    writes.splice(end, 0, recall);
    return { start: saveIndex, end };
  }
  const start = startup >= 0 ? startup : recallIndex >= 0 ? recallIndex : returnIndex >= 0 ? returnIndex : 0;
  // Resume the existing startup sequence immediately after the new routine.
  if (Number(writes[start]?.address) === 0x158c98) delete writes[start].address;
  if (recallIndex >= 0) {
    writes.splice(start, 0, save);
    return { start, end: recallIndex + 1 };
  }
  writes.splice(start, 0, save, recall);
  return { start, end: start + 1 };
}
