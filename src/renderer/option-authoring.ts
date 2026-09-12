import { WRITE_TYPES } from "./constants";
import { optionWrites } from "../option-writes";
import type { CreateOptionInput, DatabaseOption, OptionCategory, WriteEntry, WriteType } from "./types";

export type WritePlacement = "default" | "game-init" | "after-relics";
export interface OptionDraft {
  comment: string;
  description: string;
  category: OptionCategory;
  rawJson: boolean;
  json: string;
  placement: WritePlacement;
  writes: WriteEntry[];
}

export function optionDraft(option?: DatabaseOption | null): OptionDraft {
  return {
    comment: option?.comment ?? "", description: option?.description ?? "",
    category: option?.category ?? "world", rawJson: option?.rawJson ?? false,
    json: option?.rawJson ? option.value ?? "{}" : '{\n  "enemyDrops": true\n}',
    placement: option?.gameInit ? "game-init" : option?.statEdit ? "after-relics" : "default",
    writes: option && !option.rawJson ? optionWrites(option) : [{ type: "word", value: "" }]
  };
}

export function parseWriteSource(source: string): WriteEntry[] {
  const parsed: unknown = JSON.parse(source);
  if (!Array.isArray(parsed) || !parsed.length || !parsed.every(entry => entry && typeof entry === "object" && !Array.isArray(entry))) {
    throw new Error("Enter a JSON array containing at least one write object.");
  }
  return parsed;
}

export function normalizeWrites(writes: WriteEntry[]): WriteEntry[] {
  if (!writes.length) throw new Error("Add at least one write.");
  return writes.map((source, index) => {
    const write = structuredClone(source);
    if (!WRITE_TYPES.includes(write.type as WriteType)) throw new Error(`Write ${index + 1}: choose a valid type.`);
    if (!((typeof write.value === "string" && write.value.trim()) || (typeof write.value === "number" && Number.isFinite(write.value)))) {
      throw new Error(`Write ${index + 1}: enter a value.`);
    }
    if (typeof write.value === "string") write.value = write.value.trim();
    if ((typeof write.address === "string" && !write.address.trim()) || write.address === null || write.address === undefined) delete write.address;
    else {
      const address = typeof write.address === "number" && Number.isSafeInteger(write.address) && write.address >= 0
        ? `0x${write.address.toString(16)}` : typeof write.address === "string" ? write.address.trim() : "";
      if (!/^0x[0-9a-f]+$/i.test(address)) throw new Error(`Write ${index + 1}: address must be hexadecimal, beginning with 0x.`);
      write.address = address;
    }
    return write;
  });
}

export function draftInput(draft: OptionDraft): CreateOptionInput {
  if (!draft.comment.trim()) throw new Error("Enter an option name.");
  const common = { comment: draft.comment.trim(), description: draft.description.trim(), category: draft.category };
  if (draft.rawJson) {
    let parsed: unknown;
    try { parsed = JSON.parse(draft.json); } catch { throw new Error("Enter valid JSON settings."); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON settings must be an object.");
    return { ...common, value: draft.json.trim(), rawJson: true, writes: [] };
  }
  return {
    ...common, writes: normalizeWrites(draft.writes),
    ...(draft.placement === "game-init" ? { gameInit: true } : draft.placement === "after-relics" ? { statEdit: true } : {})
  };
}
