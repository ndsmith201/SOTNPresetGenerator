import type { WriteEntry } from "./types";
import { writeLocations } from "./template-options";
import { hasAnchorValue } from "./write-anchors";

const hook = { comment: "Jump to injected code", address: "0x000fa97c", type: "word", value: "0x0c04db00" };
const returnJump = { reason: "Return from injected code", type: "word", value: "0x0803924f", comment: "j 0x800e493c" };
const nop = { type: "word", value: "0x00000000", comment: "nop" };
const startup = [
  { address: "0x00158c98", comment: "Save Return Address for rA (Armor Code)", type: "word", value: "0x37F70000" },
  { comment: "Recall Return Address for rA (Armor Code)", type: "word", value: "0x36FF0000" },
  { type: "word", value: "0x34020003", comment: "ori v0, 0x0003" },
  { type: "word", value: "0x3c038009", comment: "lui v1, 0x8009" },
  { type: "word", value: "0x3c038004", comment: "lui v1, 0x8004" }
];

/** Restore each missing relic setup instruction before the insertion point. */
export function ensureRelicInitialization(writes: WriteEntry[], index: number): number {
  const missing: WriteEntry[] = startup.slice(2, 4)
    .filter(anchor => !writes.some((write, position) => position < index && hasAnchorValue(write, Number(anchor.value))))
    .map(anchor => ({ ...anchor }));
  if (missing.length === 0) return index;
  // The new setup must execute at the original boundary, with the existing
  // instruction continuing after it instead of resetting the write cursor.
  if (writes[index]?.address !== undefined) {
    missing[0].address = writes[index].address;
    delete writes[index].address;
  }
  writes.splice(index, 0, ...missing);
  return index + missing.length;
}

function hasDelaySlot(write: WriteEntry | undefined): boolean {
  if (write?.type !== "word") return false;
  const instruction = Number(write.value);
  const opcode = instruction >>> 26;
  return (opcode >= 1 && opcode <= 7) || (opcode >= 20 && opcode <= 23) ||
    (opcode === 0 && [8, 9].includes(instruction & 63));
}

/** Complete the entry and exit of a routine that selected options need to run. */
export function ensureInjectedCode(writes: WriteEntry[]): void {
  const locations = writeLocations(writes);
  const entryWrites = writes.flatMap((write, index) => write.type === "word" && locations[index].address === 0xfa97c ? [index] : []);
  // Existing writes to the entry address must not overwrite the hook. This
  // repair preserves execution targets; anchor identity still uses only value.
  for (const index of entryWrites) if (!hasAnchorValue(writes[index], 0x0c04db00)) writes[index].value = hook.value;
  if (!writes.some(write => hasAnchorValue(write, 0x0c04db00))) writes.unshift({ ...hook });

  const existingExit = writes.findIndex(write => hasAnchorValue(write, 0x0803924f));
  let start = writes.findIndex((write, index) => (existingExit < 0 || index < existingExit) &&
    startup.some(anchor => hasAnchorValue(write, Number(anchor.value))));
  if (start >= 0 && writes[start].address === undefined &&
    !writes.some((write, index) => index < start && Number(write.address) === 0x158c98)) {
    writes[start].address = "0x00158c98";
  }
  if (start < 0) {
    start = existingExit >= 0 ? existingExit : hasAnchorValue(writes[0], 0x0c04db00) ? 1 : 0;
    writes.splice(start, 0, ...structuredClone(startup));
  }

  let exit = writes.findIndex((write, index) => index >= start && hasAnchorValue(write, 0x0803924f));
  if (exit < 0) {
    const startupLocations = writeLocations(writes);
    let cursor = startupLocations[start].address;
    let end = start;
    // Cursor tracking determines where to add a missing exit without moving
    // existing addressed patches. It does not decide whether an anchor exists.
    for (let index = start; index < writes.length && cursor !== undefined; index++) {
      if (startupLocations[index].address !== cursor) continue;
      end = index + 1;
      cursor = writeLocations([{ ...writes[index], address: cursor }, {}])[1].address;
    }
    exit = hasAnchorValue(writes[end - 1], 0) && !hasDelaySlot(writes[end - 2]) ? end - 1 : end;
    writes.splice(exit, 0, { ...returnJump });
  }
  // The delay slot belongs to this return, even when another nop exists elsewhere.
  const next = writes[exit + 1];
  const returnAddress = writeLocations(writes)[exit].address;
  if (!hasAnchorValue(next, 0) || (next.address !== undefined && Number(next.address) !== (returnAddress ?? NaN) + 4)) {
    writes.splice(exit + 1, 0, { ...nop });
  }
}
