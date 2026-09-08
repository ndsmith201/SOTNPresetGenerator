import type { JsonObject } from "./types";

// Relic inventory bytes at 0x80097964, in the same order as the registered
// Enable relic writes in database/seed.sql.
const RELICS = [
  "Soul of Bat", "Fire of Bat", "Echo of Bat", "Force of Echo",
  "Soul of Wolf", "Power of Wolf", "Skill of Wolf", "Form of Mist",
  "Power of Mist", "Gas Cloud", "Cube of Zoe", "Spirit Orb",
  "Gravity Boots", "Leap Stone", "Holy Symbol", "Faerie Scroll",
  "Jewel of Open", "Merman Statue", "Bat Card", "Ghost Card", "Faerie Card",
  "Demon Card", "Sword Card", "Sprite Card", "Nosedevil Card",
  "Heart of Vlad", "Tooth of Vlad", "Rib of Vlad", "Ring of Vlad", "Eye of Vlad"
] as const;

function word(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value
    : typeof value === "string" && /^0x[\da-f]+$/i.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 0xffffffff ? parsed : undefined;
}

/** Read constant inventory writes in the standard new-game injection routine.
 * Never infer inventory from comments or matching instructions in gameplay code.
 * Stop at unknown control flow rather than assuming a conditional grant occurs.
 */
export function detectStartingRelics(template: JsonObject | null, grantWrites?: Map<string, number[]>): Set<string> {
  const relics = new Set<string>();
  if (!Array.isArray(template?.writes)) return relics;
  const registers: (number | undefined)[] = Array(32).fill(undefined);
  registers[0] = 0;
  let address: number | undefined;
  let running = false;
  let returnDelaySlot = false;
  for (const [index, entry] of template.writes.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    if (Object.hasOwn(entry, "address")) {
      const nextAddress = word(entry.address);
      if (nextAddress === 0x00158c98) {
        registers.fill(undefined);
        registers[0] = 0;
        running = true;
        returnDelaySlot = false;
      } else if (nextAddress !== address) running = false;
      address = nextAddress;
    }
    if (!running) continue;
    const instruction = word(entry.value);
    if (entry.type !== "word" || instruction === undefined) break;
    if (address !== undefined) address += 4;
    const opcode = instruction >>> 26;
    const rs = (instruction >>> 21) & 31;
    const rt = (instruction >>> 16) & 31;
    const rd = (instruction >>> 11) & 31;
    const immediate = instruction & 0xffff;
    const signedImmediate = (immediate << 16) >> 16;
    const left = registers[rs];
    const right = registers[rt];
    const wasDelaySlot = returnDelaySlot;
    if (instruction === 0x0803924f) {
      returnDelaySlot = true;
    } else if (opcode === 15) { // lui
      registers[rt] = (immediate << 16) >>> 0;
    } else if (opcode === 13) { // ori
      registers[rt] = left === undefined ? undefined : (left | immediate) >>> 0;
    } else if (opcode === 12) { // andi
      registers[rt] = left === undefined ? undefined : (left & immediate) >>> 0;
    } else if (opcode === 9 || opcode === 8) { // addiu / addi
      registers[rt] = left === undefined ? undefined : (left + signedImmediate) >>> 0;
    } else if (opcode === 40 || opcode === 41 || opcode === 43) { // sb / sh / sw
      if (left !== undefined) {
        const destination = (left + signedImmediate) >>> 0;
        const bytes = opcode === 40 ? 1 : opcode === 41 ? 2 : 4;
        for (let offset = 0; offset < bytes; offset++) {
          const relic = RELICS[destination + offset - 0x80097964];
          if (!relic) continue;
          // Bit zero means owned; an owned but inactive relic can be enabled
          // in the menu. Later clears supersede earlier grants.
          if (right !== undefined && ((right >>> (8 * offset)) & 1)) {
            relics.add(relic);
            grantWrites?.set(relic, [...(grantWrites.get(relic) ?? []), index]);
          } else {
            relics.delete(relic);
            grantWrites?.delete(relic);
          }
        }
      }
    } else if (opcode === 0) {
      const operation = instruction & 63;
      if (operation === 8 || operation === 9) break; // jr / jalr
      if (operation === 0) registers[rd] = right === undefined ? undefined : (right << ((instruction >>> 6) & 31)) >>> 0;
      else if (operation === 33) registers[rd] = left === undefined || right === undefined ? undefined : (left + right) >>> 0;
      else if (operation === 37) registers[rd] = left === undefined || right === undefined ? undefined : (left | right) >>> 0;
      else registers[rd] = undefined;
    } else if (opcode <= 7 || opcode === 20 || opcode === 21 || opcode === 22 || opcode === 23) {
      break; // Conditional branches and other jumps are not definite grants.
    } else {
      registers[rt] = undefined;
    }
    registers[0] = 0;
    if (wasDelaySlot) break;
  }
  return relics;
}
