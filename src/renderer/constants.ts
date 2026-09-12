import type { BuiltInSettings, MetaExtension, OptionCategory, WriteType } from "./types";

export const STORAGE_KEY = "sotn-preset-generator.presets.v1";
export const SOTNRANDO_PATH_KEY = "sotn-preset-generator.sotnrando-path";
export const PRESET_AUTHOR_KEY = "sotn-preset-generator.author";
export const MIN_COMPLEXITY = 1;
export const DEFAULT_COMPLEXITY = 1;
export const META_EXTENSIONS: readonly MetaExtension[] = [
  "Guarded",
  "GuardedPlus",
  "Equipment",
  "Scenic",
  "Extended",
  "Classic"
];
export const DEFAULT_META_EXTENSION: MetaExtension = "Guarded";
export const WRITE_TYPES: readonly WriteType[] = ["char", "short", "word", "long", "string"];

export const OPTION_GROUPS: readonly { id: OptionCategory; label: string; icon: string }[] = [
  { id: "world", label: "World & Exploration", icon: "map" },
  { id: "gameplay", label: "Gameplay", icon: "gamepad" },
  { id: "items", label: "Items & Equipment", icon: "diamond" },
  { id: "relics", label: "Relics", icon: "relic" },
  { id: "challenge", label: "Challenge Modifiers", icon: "spark" }
];

export const BUILT_IN_TOGGLES: readonly {
  key: keyof BuiltInSettings;
  label: string;
  defaultValue: boolean;
}[] = [
  { key: "tournamentMode", label: "Tournament mode", defaultValue: true },
  { key: "zeroDollarRelicMode", label: "Zero-dollar relics", defaultValue: true },
  { key: "openClockStatueMode", label: "Open Clock Statue", defaultValue: true },
  { key: "colorrandoMode", label: "Color randomizer", defaultValue: true },
  { key: "stats", label: "Randomize stats", defaultValue: false },
  { key: "turkeyMode", label: "Turkey mode", defaultValue: true },
  { key: "music", label: "Randomize music", defaultValue: false },
  { key: "fastwarpMode", label: "Fast warps", defaultValue: true },
  { key: "magicmaxMode", label: "Max magic", defaultValue: true },
  { key: "surpriseMode", label: "Surprise mode", defaultValue: false },
  { key: "antiFreezeMode", label: "Anti-freeze", defaultValue: true },
  { key: "noprologueMode", label: "Skip prologue", defaultValue: true },
  { key: "enemyStatRandoMode", label: "Enemy stats", defaultValue: false },
  { key: "shopPriceRandoMode", label: "Shop prices", defaultValue: false },
  { key: "startRoomRandoMode", label: "Starting room", defaultValue: false },
  { key: "startRoomRando2ndMode", label: "2nd Castle Starting room", defaultValue: false },
  { key: "rlbcMode", label: "RLBC mode", defaultValue: true }
];

export const DEFAULT_BUILT_IN_SETTINGS = Object.fromEntries(
  BUILT_IN_TOGGLES.map(({ key, defaultValue }) => [key, defaultValue])
) as unknown as BuiltInSettings;
