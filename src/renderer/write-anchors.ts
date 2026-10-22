import type { WriteEntry } from "./types";

/** Placement anchors are identified by their value, independent of metadata. */
export function hasAnchorValue(write: WriteEntry | undefined, value: number): boolean {
  const candidate = write?.value;
  return (typeof candidate === "number" || (typeof candidate === "string" && candidate.trim() !== "")) &&
    Number(candidate) === value;
}
