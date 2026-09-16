import { isRecord } from "./community-client";
import { writeLocations } from "./renderer/template-options";
import type { JsonObject } from "./renderer/types";

/** Remove editor placeholders while retaining the remaining writes' targets. */
export function presetSubmission(preset: JsonObject): JsonObject {
  if (!Array.isArray(preset.writes)) return preset;
  const writes = preset.writes;
  const disabled = writes.map(write => isRecord(write) && write.comment === "Disabled template option (nop)");
  if (!disabled.some(Boolean)) return preset;
  const locations = writeLocations(writes);
  return { ...preset, writes: writes.flatMap((write, index) => {
    if (disabled[index]) return [];
    if (index > 0 && disabled[index - 1] && isRecord(write) && write.address === undefined) {
      const address = locations[index].address;
      if (address !== undefined) return [{ ...write, address: `0x${address.toString(16).padStart(8, "0")}` }];
    }
    return [write];
  }) };
}
