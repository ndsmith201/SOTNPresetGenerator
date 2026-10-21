import type { WriteEntry } from "./types";
import { writeLocations } from "./template-options";

const wordIs = (write: WriteEntry | undefined, value: number) => write?.type === "word" && Number(write.value) === value;
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
  const hooks = writes.flatMap((write, index) => write.type === "word" && locations[index].address === 0xfa97c ? [index] : []);
  if (hooks.length === 0) {
    writes.unshift({ ...hook });
  } else {
    // A later write to the hook must not overwrite the repaired instruction.
    for (const index of hooks) if (!wordIs(writes[index], 0x0c04db00)) writes[index].value = hook.value;
  }

  let start = writes.findIndex(write => Number(write.address) === 0x158c98);
  if (start < 0) {
    // An older template may omit its first startup instruction and its address.
    start = writes.findIndex(write => write.address === undefined &&
      startup.some(anchor => wordIs(write, Number(anchor.value))));
    if (start >= 0) writes[start].address = "0x00158c98";
    else {
      const existingExit = writes.findIndex(write => wordIs(write, 0x0803924f));
      start = existingExit >= 0 ? existingExit : wordIs(writes[0], 0x0c04db00) ? 1 : 0;
      writes.splice(start, 0, ...structuredClone(startup));
    }
  }

  const startupLocations = writeLocations(writes);
  let cursor: number | undefined = 0x158c98;
  let end = start;
  let exit = -1;
  // Addressed patches may leave the routine and later resume at a pinned recall
  // or return. Follow its cursor without accepting return data in another patch.
  for (let index = start; index < writes.length && cursor !== undefined; index++) {
    if (startupLocations[index].address !== cursor) continue;
    end = index + 1;
    if (wordIs(writes[index], 0x0803924f)) { exit = index; break; }
    cursor = writeLocations([{ ...writes[index], address: cursor }, {}])[1].address;
  }
  if (exit < 0) {
    exit = wordIs(writes[end - 1], 0) && !hasDelaySlot(writes[end - 2]) ? end - 1 : end;
    writes.splice(exit, 0, { ...returnJump });
  }
  // The delay slot belongs to this return, even when another nop exists elsewhere.
  const next = writes[exit + 1];
  const returnAddress = writeLocations(writes)[exit].address;
  if (!wordIs(next, 0) || (next.address !== undefined && Number(next.address) !== (returnAddress ?? NaN) + 4)) {
    writes.splice(exit + 1, 0, { ...nop });
  }
}
