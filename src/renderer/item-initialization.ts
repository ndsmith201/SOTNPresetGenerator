import type { WriteEntry } from "./types";

const wordIs = (write: WriteEntry, value: number) => write.type === "word" && Number(write.value) === value;

export function itemInitializationRange(writes: WriteEntry[]): { start: number; end: number } | null {
  const returnIndex = writes.findIndex(write => wordIs(write, 0x0803924f));
  const limit = returnIndex < 0 ? writes.length : returnIndex;
  const start = writes.findIndex((write, index) => index < limit && wordIs(write, 0x37f70000));
  if (start < 0) return null;
  const end = writes.findIndex((write, index) => index > start && index < limit && wordIs(write, 0x36ff0000));
  return end < 0 ? null : { start, end };
}

/** Add the item routine before startup code when an older template lacks it. */
export function ensureItemInitialization(writes: WriteEntry[]): { start: number; end: number } {
  const existing = itemInitializationRange(writes);
  if (existing) return existing;
  const returnIndex = writes.findIndex(write => wordIs(write, 0x0803924f));
  const startup = writes.findIndex((write, index) => Number(write.address) === 0x158c98 && (returnIndex < 0 || index < returnIndex));
  const start = startup >= 0 ? startup : returnIndex >= 0 ? returnIndex : 0;
  // Resume the existing startup sequence immediately after the new routine.
  if (Number(writes[start]?.address) === 0x158c98) delete writes[start].address;
  writes.splice(start, 0,
    { address: "0x00158c98", comment: "Save Return Address for rA (Armor Code)", type: "word", value: "0x37F70000" },
    { comment: "Recall Return Address for rA (Armor Code)", type: "word", value: "0x36FF0000" }
  );
  return { start, end: start + 1 };
}
