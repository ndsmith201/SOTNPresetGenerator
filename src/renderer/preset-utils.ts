import { unifiedOption } from "../option-writes";
import {
  BUILT_IN_TOGGLES,
  DEFAULT_BUILT_IN_SETTINGS,
  DEFAULT_COMPLEXITY,
  DEFAULT_META_EXTENSION,
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
import { RELIC_LOCATION_CHECKS } from "./relic-location-checks";
import { detectStartingRelics } from "./starting-relics";
import { matchTemplateOptions, selectTemplateOptions, templateWithOptionSelections, writeLocations } from "./template-options";
import { ensureItemInitialization } from "./item-initialization";

const EARLY_TRANSFORM_OPTION_LABELS = new Set([
  "Enable Soul of Bat",
  "Enable Soul of Wolf",
  "Enable Form of Mist"
]);

const FLIGHT_METHODS = [
  ["Soul of Bat"],
  ["Leap Stone", "Gravity Boots"],
  ["Form of Mist", "Power of Mist"]
];

const FLIGHT_SATISFIED_REQUIREMENTS = [
  ...FLIGHT_METHODS,
  ["Soul of Wolf", "Power of Wolf"]
];

const VLAD_RELICS = new Set(["Heart of Vlad", "Tooth of Vlad", "Rib of Vlad", "Ring of Vlad", "Eye of Vlad"]);

export function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeComplexity(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number {
  const candidate = typeof value === "number" && Number.isSafeInteger(value) ? value : DEFAULT_COMPLEXITY;
  return Math.min(maximum, Math.max(Math.min(MIN_COMPLEXITY, maximum), candidate));
}

const STARTING_EQUIPMENT_REQUIREMENTS = new Map([
  ["Start with Gold Ring", "Gold ring"],
  ["Start with Silver Ring", "Silver ring"],
  ["Start with Holy Glasses", "Holy glasses"]
]);

function getEnabledRelics(selected: PresetOption[], template: JsonObject | null = null): Set<string> {
  return new Set([...detectStartingRelics(template), ...selected.flatMap((option) => {
    const equipment = STARTING_EQUIPMENT_REQUIREMENTS.get(option.label);
    if (equipment) return [equipment];
    return option.category === "relics" && option.label.startsWith("Enable ")
      ? [option.label.slice("Enable ".length).trim()] : [];
  })]);
}

/** Longest sequence of check-opening pickups, plus final Vlad completion.
 * Relic placement is unknown: setup pickups are allowed, but score zero.
 */
export function calculateMaxComplexity(
  template: JsonObject | null,
  selected: PresetOption[] = [],
  extension: MetaExtension = DEFAULT_META_EXTENSION
): number {
  let locations = template?.lockLocation;
  let complexityGoal = template?.complexityGoal;
  for (const option of selected) {
    if (option.previewJson && Object.hasOwn(option.previewJson, "lockLocation")) locations = option.previewJson.lockLocation;
    if (option.previewJson && Object.hasOwn(option.previewJson, "complexityGoal")) complexityGoal = option.previewJson.complexityGoal;
  }
  if (!Array.isArray(locations)) return 0;
  const allowedLocations = new Set(RELIC_LOCATION_CHECKS[normalizeMetaExtension(extension)]);
  const routes: string[][][] = [];
  for (const location of locations) {
    if (!isJsonObject(location) || typeof location.location !== "string" || !allowedLocations.has(location.location)) continue;
    if (Array.isArray(location.locks)) {
      routes.push(location.locks.filter((lock): lock is string => typeof lock === "string")
        .map((lock) => lock.split("+").map((relic) => relic.trim()).filter(Boolean)));
    }
  }
  const enabled = getEnabledRelics(selected, template);
  const goals = isJsonObject(complexityGoal) && Array.isArray(complexityGoal.goals)
    ? complexityGoal.goals.filter((goal): goal is string => typeof goal === "string") : [];
  // The last required Vlad completes the goal rather than opening a check.
  // Count that terminal step once, not once for each missing Vlad relic.
  const finalVladStep = goals.length > 0 && goals.every((goal) => goal.split("+")
    .some((requirement) => VLAD_RELICS.has(requirement.trim()) && !enabled.has(requirement.trim())));
  const requiredRelics = routes.flat(2);
  const movementRelics = FLIGHT_SATISFIED_REQUIREMENTS.flat();
  const usesMovement = requiredRelics.some((relic) => movementRelics.includes(relic));
  const relics = [...new Set([...requiredRelics, ...(usesMovement ? movementRelics : [])])];
  const bits = new Map(relics.map((relic, index) => [relic, 1n << BigInt(index)]));
  const mask = (names: string[]) => names.reduce((value, name) => value | (bits.get(name) ?? 0n), 0n);
  const flightMasks = usesMovement ? FLIGHT_METHODS.map(mask) : [];
  const jumpMask = mask(["Leap Stone", "Gravity Boots"]);
  const methods = FLIGHT_SATISFIED_REQUIREMENTS.map((names) => ({ names, mask: mask(names) }));
  const checkRoutes = routes.map((alternatives) => {
    // If every route needs Mist and some use another movement method, Mist
    // serves as entry as well as flight (for example, Soul of Bat's location).
    const mistEntry = alternatives.length > 0 && alternatives.every((route) => route.includes("Form of Mist")) &&
      alternatives.some((route) => !route.includes("Power of Mist"));
    return alternatives.map((requirements) => {
      const required = mask(requirements);
      let withFlight = required & ~jumpMask;
      for (const method of methods) {
        // Bat still has a distinct use with Echo; standalone Mist is a barrier.
        if (method.names.includes("Soul of Bat") && requirements.includes("Echo of Bat")) continue;
        if ((required & method.mask) === method.mask) withFlight &= ~method.mask;
      }
      if (mistEntry) withFlight |= mask(["Form of Mist"]);
      return { required, withFlight };
    });
  });
  // Identical access rules always open together and score just one step.
  // Collapse them so larger extensions do not repeat the same inventory checks.
  const checks = [...new Map(checkRoutes.map((alternatives) => [
    [...new Set(alternatives.map(({ required, withFlight }) => `${required}:${withFlight}`))].sort().join("|"),
    alternatives
  ])).values()];
  const allChecks = (1n << BigInt(checks.length)) - 1n;
  const allRelics = mask(relics);
  const start = mask([...enabled]);
  const accessCache = new Map<bigint, bigint>();
  const access = (inventory: bigint): bigint => {
    const cached = accessCache.get(inventory);
    if (cached !== undefined) return cached;
    const flight = flightMasks.some((method) => (inventory & method) === method);
    let accessible = 0n;
    checks.forEach((alternatives, index) => {
      if (!alternatives.length || alternatives.some((route) => {
        const required = flight ? route.withFlight : route.required;
        return (inventory & required) === required;
      })) accessible |= 1n << BigInt(index);
    });
    accessCache.set(inventory, accessible);
    return accessible;
  };
  const memo = new Map<bigint, number>();
  const longest = (inventory: bigint): number => {
    const cached = memo.get(inventory);
    if (cached !== undefined) return cached;
    const before = access(inventory);
    if (before === allChecks) return 0;
    let best = 0;
    let remaining = allRelics & ~inventory;
    while (remaining) {
      const nextRelic = remaining & -remaining;
      remaining &= ~nextRelic;
      const next = inventory | nextRelic;
      const opensCheck = access(next) !== before;
      best = Math.max(best, Number(opensCheck) + longest(next));
    }
    memo.set(inventory, best);
    return best;
  };
  return longest(start) + Number(finalVladStep);
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

export function templateExtension(template: JsonObject): MetaExtension {
  if (template.relicLocationsExtension === false) return "Classic";
  const metadata = isJsonObject(template.metadata) ? template.metadata : {};
  const value = template.relicLocationsExtension ?? metadata.metaExtension;
  return META_EXTENSIONS.find((extension) => extension.toLowerCase() === String(value).toLowerCase()) ?? DEFAULT_META_EXTENSION;
}

function templateComplexity(template: JsonObject): number {
  const goal = isJsonObject(template.complexityGoal) ? template.complexityGoal : {};
  const metadata = isJsonObject(template.metadata) ? template.metadata : {};
  const value = goal.min ?? Number(metadata.metaComplexity);
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : DEFAULT_COMPLEXITY;
}

export function createPresetFromTemplate(name: string, source?: JsonObject, options: PresetOption[] = []): Preset {
  const timestamp = new Date().toISOString();
  return selectTemplateOptions({
    id: crypto.randomUUID(), name, optionIds: [],
    complexity: source ? templateComplexity(source) : DEFAULT_COMPLEXITY,
    metaExtension: source ? templateExtension(source) : DEFAULT_META_EXTENSION,
    builtInSettings: normalizeBuiltInSettings(source),
    createdAt: timestamp, updatedAt: timestamp,
    ...(source ? { baseTemplate: structuredClone(source) } : {})
  }, options);
}

export function calculatePresetMaxComplexity(template: JsonObject | null, preset: Preset | null, options: PresetOption[]): number {
  if (!preset) return 0;
  const source = presetTemplate(template, preset);
  const selected = options.filter((option) => preset.optionIds.includes(option.id));
  return calculateMaxComplexity(source, selected, preset.metaExtension);
}

function presetTemplate(template: JsonObject | null, preset: Preset): JsonObject | null {
  if (!template) return null;
  if (!preset.baseTemplate) return template;
  // Keep installed settings, but use the bundled access rules for every
  // extension. Preview generation clones and filters these before editing them.
  const { inherits: _inherits, ...source } = templateWithOptionSelections(preset)!;
  return { ...source, lockLocation: template.lockLocation ?? [] };
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
    (value.baseTemplate === undefined || isJsonObject(value.baseTemplate)) &&
    (value.templateOptionMatches === undefined || (Array.isArray(value.templateOptionMatches) && value.templateOptionMatches.every((match) =>
      isJsonObject(match) && typeof match.optionId === "string" && Array.isArray(match.writeIndices) && match.writeIndices.every((index) => Number.isSafeInteger(index) && index >= 0) &&
      Array.isArray(match.jsonKeys) && match.jsonKeys.every((key) => typeof key === "string")))) &&
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
    typeof value.description === "string" &&
    typeof value.readOnly === "boolean" &&
    OPTION_GROUPS.some((group) => group.id === value.category) &&
    (!value.rawJson || typeof value.value === "string") &&
    typeof value.gameInit === "boolean" &&
    (value.itemInit === undefined || typeof value.itemInit === "boolean") &&
    typeof value.statEdit === "boolean" &&
    typeof value.rawJson === "boolean" &&
    Array.isArray(value.writes) &&
    value.writes.every(isJsonObject)
  );
}

export function toPresetOptions(databaseOptions: DatabaseOption[]): PresetOption[] {
  return databaseOptions.map((input) => {
    const option = unifiedOption(input) as unknown as DatabaseOption;
    let previewJson: JsonObject | null = null;
    if (option.rawJson) {
      try {
        const parsed = JSON.parse(option.value!) as unknown;
        if (isJsonObject(parsed)) previewJson = parsed;
      } catch {
        previewJson = null;
      }
    }
    const writes = option.writes;
    const itemInit = !option.rawJson && Boolean(option.itemInit);
    const injectRelicWrites = !option.rawJson && !option.gameInit && !itemInit &&
      (option.statEdit || (option.category === "relics" && !writes[0]?.address));
    return {
      id: `option:${option.id}`,
      label: option.comment,
      description: option.description ?? "",
      category: option.category,
      injectedWrites: injectRelicWrites ? writes : [],
      gameInitWrites: option.gameInit && !itemInit ? writes : [],
      itemInitWrites: itemInit ? writes : [],
      appendedWrites: injectRelicWrites || option.gameInit || itemInit || option.rawJson ? [] : writes,
      previewJson,
      source: structuredClone(option)
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
    Number(write.value) === 0x3c038004
  );
}

function removeEnabledRelicsFromLocks(preview: JsonObject, enabledRelics: Set<string>): void {
  if (!enabledRelics.size || !Array.isArray(preview.lockLocation)) return;
  const enabledFlightMethods = FLIGHT_METHODS.filter((method) => method.every((relic) => enabledRelics.has(relic)));
  const hasFlight = enabledFlightMethods.length > 0;

  for (const location of preview.lockLocation) {
    if (!isJsonObject(location)) continue;
    // Escape entries are alternatives; every relic within one '+' combination
    // must be enabled. Keep unsatisfied alternatives intact for placement logic.
    if (Array.isArray(location.escapeRequires) && location.escapeRequires.some((escape: unknown) => {
      if (typeof escape !== "string") return false;
      const requirements = escape.split("+").map((relic) => relic.trim());
      return requirements.every((relic) => relic.length > 0 && enabledRelics.has(relic));
    })) {
      location.escapeRequires = [];
    }
    if (!Array.isArray(location.locks)) continue;
    // Rib of Vlad's jump routes need a transformation as well as height.
    // Use the enabled movement route, rather than substituting it for Bat.
    const useEnabledVladRoute = hasFlight && location.location === "Rib of Vlad" && !enabledRelics.has("Form of Mist");
    // Shotel keeps its entry requirements; Staurolite also keeps Holy glasses
    // when Mist is enabled instead of turning that route into an unlocked one.
    const preserveMistEntry = location.location === "Shotel" ||
      (location.location === "Staurolite" && enabledRelics.has("Form of Mist"));
    // The Elixir's jump route needs Spike Breaker, Bat needs Holy glasses,
    // and full Mist unlocks it. Prefer Mist, then Bat, when routes overlap.
    const elixirRoute = location.location === "Floating Catacombs Elixir"
      ? enabledFlightMethods.find((method) => method.includes("Form of Mist")) ?? enabledFlightMethods[0]
      : undefined;
    const locks = location.locks.flatMap((lock: unknown) => {
      if (typeof lock !== "string") return [lock];
      let requirements = lock.split("+").map((requirement) => requirement.trim());
      if (elixirRoute) {
        if (!elixirRoute.every((relic) => requirements.includes(relic))) return [];
        if (elixirRoute.includes("Form of Mist")) {
          requirements = requirements.filter((relic) => relic !== "Holy glasses");
        }
      }
      if (useEnabledVladRoute && !FLIGHT_METHODS.some((method) =>
        method.every((relic) => enabledRelics.has(relic) && requirements.includes(relic))
      )) return [];
      // Spike Breaker and the key still gate the spike corridor even with flight.
      const mistSpikeBarrier = requirements.includes("Form of Mist") && requirements.includes("Spike Breaker");
      if (mistSpikeBarrier || (preserveMistEntry && requirements.includes("Form of Mist"))) {
        requirements = ["Form of Mist", ...requirements.filter((relic) => relic !== "Form of Mist")];
      }
      if (hasFlight && !useEnabledVladRoute && !mistSpikeBarrier && !preserveMistEntry && requirements.includes("Form of Mist") && !requirements.includes("Power of Mist")) {
        // Flight satisfies the accompanying requirements, but Mist is still
        // needed for the barrier unless it is explicitly enabled as well.
        requirements = ["Form of Mist"];
      }
      const satisfied = new Set(enabledRelics);
      if (hasFlight) {
        // Flight also covers double-jump and high-jump requirements.
        satisfied.add("Leap Stone");
        satisfied.add("Gravity Boots");
        // Match whole methods before removing selected relics, so partial pairs
        // still require their missing relic when they serve another purpose.
        for (const method of FLIGHT_SATISFIED_REQUIREMENTS) {
          // Echo of Bat requires the actual Bat form, not another flight method.
          if (method.includes("Soul of Bat") && requirements.includes("Echo of Bat")) continue;
          if (method.every((relic) => requirements.includes(relic))) {
            method.forEach((relic) => {
              if (!preserveMistEntry || relic !== "Form of Mist") satisfied.add(relic);
            });
          }
        }
      }
      const remaining = requirements.filter((requirement) => !satisfied.has(requirement));
      // Discard redundant flight alternatives without erasing a remaining
      // barrier. Only explicitly enabled requirements can unlock all routes.
      if (!remaining.length && !requirements.every((relic) => enabledRelics.has(relic))) return [];
      return [remaining.join(" + ")];
    });
    // Lock entries are alternatives: one satisfied alternative unlocks the location.
    location.locks = locks.includes("") ? [] : [...new Set(locks)];
  }
}

export function buildPreviewPreset(
  template: JsonObject | null,
  preset: Preset | null,
  options: PresetOption[],
  author?: string,
  maximumComplexity?: number
): JsonObject | null {
  if (!preset) return null;
  const source = presetTemplate(template, preset);
  if (!source) return null;
  const preview = structuredClone(source);
  const extension = normalizeMetaExtension(preset.metaExtension);
  const selected = options.filter((option) => preset.optionIds.includes(option.id));
  const complexity = normalizeComplexity(preset.complexity, maximumComplexity ?? calculatePresetMaxComplexity(template, preset, options));
  const matchedIds = new Set(preset.templateOptionMatches?.map((match) => match.optionId));
  const additions = selected.filter((option) => !matchedIds.has(option.id));
  const extensionChanged = !preset.baseTemplate || extension !== templateExtension(source);
  const enabledRelics = getEnabledRelics(selected, source);
  const earlyTransformEnabled = [...EARLY_TRANSFORM_OPTION_LABELS].some((label) => enabledRelics.has(label.slice("Enable ".length)));
  const originalRelics = detectStartingRelics(preset.baseTemplate ?? null);
  const removedEarlyTransform = [...EARLY_TRANSFORM_OPTION_LABELS].some((label) => originalRelics.has(label.slice("Enable ".length)) && !enabledRelics.has(label.slice("Enable ".length)));
  const metadata = isJsonObject(preview.metadata) ? preview.metadata : {};
  metadata.id = presetIdFromName(preset.name);
  metadata.name = preset.name;
  metadata.metaComplexity = complexity.toString();
  if (extensionChanged || !Object.hasOwn(metadata, "metaExtension")) metadata.metaExtension = extension;
  if (!preset.baseTemplate || earlyTransformEnabled || removedEarlyTransform) {
    metadata.transformEarly = earlyTransformEnabled;
    metadata.transformFocus = earlyTransformEnabled;
  }
  preview.metadata = metadata;
  if (extensionChanged || !Object.hasOwn(source, "relicLocationsExtension")) {
    preview.relicLocationsExtension = extension === "Classic" ? false : extension.toLowerCase();
  }

  const complexityGoal = isJsonObject(preview.complexityGoal) ? preview.complexityGoal : {};
  complexityGoal.min = complexity;
  preview.complexityGoal = complexityGoal;
  BUILT_IN_TOGGLES.forEach(({ key }) => {
    // Some randomizer settings also accept structured values. Keep those until
    // the user changes that toggle, and fill absent settings with app defaults.
    if (!Object.hasOwn(source, key) || typeof source[key] === "boolean" ||
      preset.builtInSettings[key] !== DEFAULT_BUILT_IN_SETTINGS[key]) {
      const removed = preset.templateOptionMatches?.some((match) => !preset.optionIds.includes(match.optionId) && match.jsonKeys.includes(key)) && !Object.hasOwn(source, key);
      preview[key] = removed ? DEFAULT_BUILT_IN_SETTINGS[key] : preset.builtInSettings[key];
    }
  });

  // Presets without writes still need the default startup routine and anchors.
  const sourceWrites = Array.isArray(preview.writes) && preview.writes.length > 0
    ? preview.writes : template?.writes;
  const templateWrites = Array.isArray(sourceWrites)
    ? sourceWrites.filter(isJsonObject).map((write) => structuredClone(write))
    : [];
  const itemInit = additions.flatMap(option => structuredClone(option.itemInitWrites ?? []));
  if (itemInit.length > 0) {
    const { start, end } = ensureItemInitialization(templateWrites);
    // Older copies of the armor block can reset startup to the save instruction.
    if (templateWrites[start].address !== undefined &&
      Number(templateWrites[end + 1]?.address) === Number(templateWrites[start].address)) delete templateWrites[end + 1].address;
    const firstAddressedWrite = itemInit.findIndex(write => write.address !== undefined);
    if (firstAddressedWrite >= 0 && templateWrites[end].address === undefined) {
      const address = writeLocations([...templateWrites.slice(0, end), ...itemInit.slice(0, firstAddressedWrite), templateWrites[end]]).at(-1)?.address;
      if (address !== undefined) templateWrites[end].address = `0x${address.toString(16).padStart(8, "0")}`;
    }
    templateWrites.splice(end, 0, ...itemInit);
  }
  // Keep each option's writes together, with all stat edits following the relics.
  const injectionOrder = [
    ...additions.filter((option) => !option.source?.statEdit),
    ...additions.filter((option) => option.source?.statEdit)
  ];
  const injected = injectionOrder.flatMap((option) => structuredClone(option.injectedWrites));
  const gameInit = additions.flatMap((option) => structuredClone(option.gameInitWrites));
  const appended = additions.flatMap((option) => structuredClone(option.appendedWrites));
  const returnIndex = templateWrites.findIndex(isReturnJump);
  let gameInitAnchorIndex = templateWrites.findIndex((write, index) =>
    isGameInitAnchor(write) && (returnIndex < 0 || index < returnIndex)
  );
  const selectedGameInit = selected.filter((option) => option.gameInitWrites.length > 0);
  if (gameInitAnchorIndex < 0 && selectedGameInit.length > 0) {
    // Installed presets may only initialize the relic bank (0x8009). Restore
    // the game bank before both new and already-inherited game init writes.
    const inheritedIndices = matchTemplateOptions({ writes: templateWrites }, selectedGameInit)
      .flatMap((match) => match.writeIndices)
      .filter((index) => returnIndex < 0 || index < returnIndex);
    gameInitAnchorIndex = inheritedIndices.length > 0 ? Math.min(...inheritedIndices)
      : returnIndex < 0 ? templateWrites.length : returnIndex;
    templateWrites.splice(gameInitAnchorIndex, 0, {
      type: "word", value: "0x3c038004", comment: "lui v1, 0x8004"
    });
  }
  if (gameInitAnchorIndex >= 0) {
    templateWrites.splice(gameInitAnchorIndex, 0, ...injected);
    const shiftedAnchorIndex = gameInitAnchorIndex + injected.length;
    templateWrites.splice(shiftedAnchorIndex + 1, 0, ...gameInit);
  } else {
    templateWrites.splice(returnIndex < 0 ? templateWrites.length : returnIndex, 0, ...injected, ...gameInit);
  }
  // Never split the return jump from its delay slot or put option writes after it.
  const finalReturnIndex = templateWrites.findIndex(isReturnJump);
  const firstAddressedPatch = appended.findIndex((write) => write.address !== undefined);
  if (finalReturnIndex >= 0 && firstAddressedPatch >= 0 && templateWrites[finalReturnIndex].address === undefined) {
    // Addressed patches change the implicit write cursor. Resume the injected
    // routine at its original end, including any new unaddressed instructions.
    const locations = writeLocations([
      ...templateWrites.slice(0, finalReturnIndex), ...appended.slice(0, firstAddressedPatch),
      templateWrites[finalReturnIndex]
    ]);
    const address = locations.at(-1)?.address;
    if (address !== undefined) templateWrites[finalReturnIndex].address = `0x${address.toString(16).padStart(8, "0")}`;
  }
  templateWrites.splice(finalReturnIndex < 0 ? templateWrites.length : finalReturnIndex, 0, ...appended);
  preview.writes = templateWrites;
  const merged = additions.reduce(
    (merged, option) => option.previewJson ? { ...merged, ...structuredClone(option.previewJson) } : merged,
    preview
  );
  const mergedMetadata = isJsonObject(merged.metadata) ? merged.metadata : {};
  mergedMetadata.id = presetIdFromName(preset.name);
  mergedMetadata.name = preset.name;
  if (typeof preset.description === "string") mergedMetadata.description = preset.description;
  mergedMetadata.metaComplexity = complexity.toString();
  if (extensionChanged || !Object.hasOwn(mergedMetadata, "metaExtension")) mergedMetadata.metaExtension = extension;
  const configuredAuthor = author?.trim();
  if (configuredAuthor) {
    const existingAuthors = Array.isArray(mergedMetadata.author) ? mergedMetadata.author : [];
    mergedMetadata.author = [...existingAuthors, configuredAuthor];
  }
  merged.metadata = mergedMetadata;
  merged.complexityGoal = { ...(isJsonObject(merged.complexityGoal) ? merged.complexityGoal : {}), min: complexity };
  if (preset.baseTemplate) delete merged.inherits;
  // Enforce the selected extension after raw options, so they cannot reintroduce
  // excluded checks or change the extension behind the selector's back.
  if (Object.hasOwn(preview, "relicLocationsExtension")) merged.relicLocationsExtension = preview.relicLocationsExtension;
  if (Array.isArray(merged.lockLocation)) {
    const allowedLocations = new Set(RELIC_LOCATION_CHECKS[extension]);
    merged.lockLocation = merged.lockLocation.filter((entry) =>
      isJsonObject(entry) && typeof entry.location === "string" && allowedLocations.has(entry.location)
    );
  }
  removeEnabledRelicsFromLocks(merged, enabledRelics);
  return merged;
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
