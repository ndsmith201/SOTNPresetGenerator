import {
  BUILT_IN_TOGGLES,
  DEFAULT_BUILT_IN_SETTINGS,
  DEFAULT_COMPLEXITY,
  DEFAULT_META_EXTENSION,
  MAX_COMPLEXITY,
  META_EXTENSIONS,
  MIN_COMPLEXITY,
  OPTION_GROUPS,
  STORAGE_KEY,
  WRITE_TYPES
} from "./constants";
import type {
  BuiltInSettings,
  DatabaseOption,
  JsonObject,
  MetaExtension,
  Preset,
  PresetOption,
  WriteEntry
} from "./types";

export function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeComplexity(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return DEFAULT_COMPLEXITY;
  return Math.min(MAX_COMPLEXITY, Math.max(MIN_COMPLEXITY, value));
}

export function normalizeMetaExtension(value: unknown): MetaExtension {
  return META_EXTENSIONS.includes(value as MetaExtension) ? (value as MetaExtension) : DEFAULT_META_EXTENSION;
}

export function normalizeBuiltInSettings(value: unknown): BuiltInSettings {
  const candidate = isJsonObject(value) ? value : {};
  const settings = { ...DEFAULT_BUILT_IN_SETTINGS };
  BUILT_IN_TOGGLES.forEach(({ key }) => {
    if (typeof candidate[key] === "boolean") settings[key] = candidate[key];
  });
  return settings;
}

function isPreset(value: unknown): value is Preset {
  if (!isJsonObject(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    Array.isArray(value.optionIds) &&
    value.optionIds.every((id) => typeof id === "string") &&
    (value.complexity === undefined || typeof value.complexity === "number") &&
    (value.metaExtension === undefined || typeof value.metaExtension === "string") &&
    (value.builtInSettings === undefined || isJsonObject(value.builtInSettings)) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

export function loadPresets(validOptionIds?: Set<string>): Preset[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(stored)) return [];
    return stored.filter(isPreset).map((preset) => ({
      ...preset,
      optionIds: validOptionIds ? preset.optionIds.filter((id) => validOptionIds.has(id)) : preset.optionIds,
      complexity: normalizeComplexity(preset.complexity),
      metaExtension: normalizeMetaExtension(preset.metaExtension),
      builtInSettings: normalizeBuiltInSettings(preset.builtInSettings)
    }));
  } catch {
    return [];
  }
}

export function persistPresets(presets: Preset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function isDatabaseOption(value: unknown): value is DatabaseOption {
  if (!isJsonObject(value)) return false;
  return (
    typeof value.id === "number" &&
    Number.isSafeInteger(value.id) &&
    typeof value.comment === "string" &&
    OPTION_GROUPS.some((group) => group.id === value.category) &&
    typeof value.type === "string" &&
    WRITE_TYPES.includes(value.type as DatabaseOption["type"]) &&
    typeof value.value === "string" &&
    (value.address === null || typeof value.address === "string") &&
    typeof value.gameInit === "boolean" &&
    typeof value.rawJson === "boolean" &&
    Array.isArray(value.additionalWrites) &&
    value.additionalWrites.every(isJsonObject)
  );
}

export function toPresetOptions(databaseOptions: DatabaseOption[]): PresetOption[] {
  return databaseOptions.map((option) => {
    let previewJson: JsonObject | null = null;
    if (option.rawJson) {
      try {
        const parsed = JSON.parse(option.value) as unknown;
        if (isJsonObject(parsed)) previewJson = parsed;
      } catch {
        previewJson = null;
      }
    }
    const primaryWrite: WriteEntry = { comment: option.comment, type: option.type, value: option.value };
    if (option.address) primaryWrite.address = option.address;
    const writes = option.rawJson ? [] : [primaryWrite, ...option.additionalWrites.map((write) => structuredClone(write))];
    const location = option.address ? option.address : "startup code";
    const extraCount = option.additionalWrites.length;
    const injectRelicWrites = !option.rawJson && !option.gameInit && option.category === "relics" && !option.address;
    const locationDescription = option.rawJson ? "preview JSON" : option.gameInit ? "game init" : location;
    return {
      id: `option:${option.id}`,
      label: option.comment,
      description: `${option.type} · ${option.value} · ${locationDescription}${extraCount ? ` · +${extraCount} write${extraCount === 1 ? "" : "s"}` : ""}`,
      category: option.category,
      injectedWrites: injectRelicWrites ? writes : [],
      gameInitWrites: option.gameInit ? writes : [],
      appendedWrites: injectRelicWrites || option.gameInit || option.rawJson ? [] : writes,
      previewJson
    };
  });
}

export function presetIdFromName(name: string): string {
  const id = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return id || "preset";
}

function isReturnJump(write: WriteEntry): boolean {
  const comment = typeof write.comment === "string" ? write.comment.toLowerCase() : "";
  const value = typeof write.value === "string" ? write.value.toLowerCase() : "";
  return value === "0x0803924f" || comment.includes("j 0x800e493c");
}

function isGameInitAnchor(write: WriteEntry): boolean {
  return (
    write.type === "word" &&
    write.value === "0x3c038004" &&
    write.comment === "lui v1, 0x8004"
  );
}

export function buildPreviewPreset(
  template: JsonObject | null,
  preset: Preset | null,
  options: PresetOption[]
): JsonObject | null {
  if (!template || !preset) return null;
  const preview = structuredClone(template);
  const metadata = isJsonObject(preview.metadata) ? preview.metadata : {};
  metadata.id = presetIdFromName(preset.name);
  metadata.name = preset.name;
  metadata.metaComplexity = normalizeComplexity(preset.complexity).toString();
  metadata.metaExtension = normalizeMetaExtension(preset.metaExtension);
  preview.metadata = metadata;
  preview.relicLocationsExtension = preset.metaExtension === "Classic" ? false : preset.metaExtension.toLowerCase();

  const complexityGoal = isJsonObject(preview.complexityGoal) ? preview.complexityGoal : {};
  complexityGoal.min = normalizeComplexity(preset.complexity);
  preview.complexityGoal = complexityGoal;
  BUILT_IN_TOGGLES.forEach(({ key }) => {
    preview[key] = preset.builtInSettings[key];
  });

  const templateWrites = Array.isArray(preview.writes)
    ? preview.writes.filter(isJsonObject).map((write) => structuredClone(write))
    : [];
  const selected = options.filter((option) => preset.optionIds.includes(option.id));
  const injected = selected.flatMap((option) => structuredClone(option.injectedWrites));
  const gameInit = selected.flatMap((option) => structuredClone(option.gameInitWrites));
  const appended = selected.flatMap((option) => structuredClone(option.appendedWrites));
  const gameInitAnchorIndex = templateWrites.findIndex(isGameInitAnchor);
  if (gameInitAnchorIndex >= 0) {
    templateWrites.splice(gameInitAnchorIndex, 0, ...injected);
    const shiftedAnchorIndex = gameInitAnchorIndex + injected.length;
    templateWrites.splice(shiftedAnchorIndex + 1, 0, ...gameInit);
  } else {
    const returnIndex = templateWrites.findIndex(isReturnJump);
    templateWrites.splice(returnIndex < 0 ? templateWrites.length : returnIndex, 0, ...injected, ...gameInit);
  }
  templateWrites.push(...appended);
  preview.writes = templateWrites;
  return selected.reduce(
    (merged, option) => option.previewJson ? { ...merged, ...structuredClone(option.previewJson) } : merged,
    preview
  );
}

export function syntaxHighlight(json: string): string {
  const escaped = json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"\s*:)|("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")|\b(true|false|null)\b|\b(-?\d+(?:\.\d+)?)\b/g,
    (match, key: string | undefined, string: string | undefined, boolean: string | undefined, number: string | undefined) => {
      if (key) return `<span class="json-key">${match}</span>`;
      if (string) return `<span class="json-string">${match}</span>`;
      if (boolean) return `<span class="json-boolean">${match}</span>`;
      if (number) return `<span class="json-number">${match}</span>`;
      return match;
    }
  );
}

export function formatUpdatedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved locally";
  const elapsedMinutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (elapsedMinutes < 1) return "Updated just now";
  if (elapsedMinutes < 60) return `Updated ${elapsedMinutes}m ago`;
  if (elapsedMinutes < 1_440) return `Updated ${Math.floor(elapsedMinutes / 60)}h ago`;
  return `Updated ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}
