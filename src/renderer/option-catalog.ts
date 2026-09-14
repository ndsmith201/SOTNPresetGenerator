import type { PresetOption } from "./types";

// Use the same order after loading, creating, and editing options: write order
// affects the exported preset and must not change merely because the app restarts.
export function sortPresetOptions(options: PresetOption[]): PresetOption[] {
  const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
  return [...options].sort((left, right) =>
    compare(left.category, right.category) || compare(left.label, right.label) || left.source.id - right.source.id
  );
}
