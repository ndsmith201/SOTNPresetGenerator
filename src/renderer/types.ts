import type { UpdateApi } from "../update-types";
import type { SuccessfulExport } from "./export-state";
import type { CommunityRequest, CommunityResult } from "../community-types";

export type OptionCategory = "world" | "gameplay" | "items" | "relics" | "challenge";
export type WriteType = "char" | "short" | "word" | "long" | "string";
export type MetaExtension = "Guarded" | "GuardedPlus" | "Equipment" | "Scenic" | "Extended" | "Classic";
export type OptionFilter = "all" | "selected";
export type JsonObject = Record<string, unknown>;
export type WriteEntry = Record<string, unknown>;

export interface BuiltInSettings {
  tournamentMode: boolean;
  zeroDollarRelicMode: boolean;
  openClockStatueMode: boolean;
  colorrandoMode: boolean;
  stats: boolean;
  turkeyMode: boolean;
  music: boolean;
  fastwarpMode: boolean;
  magicmaxMode: boolean;
  surpriseMode: boolean;
  antiFreezeMode: boolean;
  noprologueMode: boolean;
  enemyStatRandoMode: boolean;
  shopPriceRandoMode: boolean;
  startRoomRandoMode: boolean;
  startRoomRando2ndMode: boolean;
  rlbcMode: boolean;
}

export interface Preset {
  id: string;
  name: string;
  optionIds: string[];
  complexity: number;
  metaExtension: MetaExtension;
  builtInSettings: BuiltInSettings;
  createdAt: string;
  updatedAt: string;
  baseTemplate?: JsonObject;
  templateOptionMatches?: TemplateOptionMatch[];
}

export interface TemplateOptionMatch {
  optionId: string;
  writeIndices: number[];
  jsonKeys: string[];
}

export interface InstalledPreset {
  fileName: string;
  name: string;
  json: JsonObject;
}

export interface DatabaseOption {
  id: number;
  readOnly: boolean;
  comment: string;
  description: string;
  category: OptionCategory;
  type: WriteType;
  value: string;
  address: string | null;
  gameInit: boolean;
  statEdit: boolean;
  rawJson: boolean;
  additionalWrites: WriteEntry[];
}

export interface PresetOption {
  id: string;
  label: string;
  description: string;
  category: OptionCategory;
  injectedWrites: WriteEntry[];
  gameInitWrites: WriteEntry[];
  appendedWrites: WriteEntry[];
  previewJson: JsonObject | null;
  source: DatabaseOption;
}

export interface CreateOptionInput {
  comment: string;
  description?: string;
  category: OptionCategory;
  type: WriteType;
  value: string;
  address?: string;
  gameInit?: boolean;
  statEdit?: boolean;
  rawJson?: boolean;
  additionalWrites?: WriteEntry[];
}

export interface PresetAppApi {
  updates: UpdateApi;
  community: (request: CommunityRequest) => Promise<CommunityResult>;
  platform: string;
  version: string;
  getPresetTemplate: () => Promise<unknown>;
  getDefaultSotnRandoPath: () => Promise<string | null>;
  listInstalledPresets: (sotnRandoPath: string) => Promise<unknown>;
  listOptions: () => Promise<unknown>;
  deleteOption: (id: number) => Promise<unknown>;
  createOption: (request: CreateOptionInput) => Promise<unknown>;
  updateOption: (id: number, request: CreateOptionInput) => Promise<unknown>;
  chooseSotnRandoPath: (currentPath?: string) => Promise<unknown>;
  exportPreset: (request: { sotnRandoPath: string; presetName: string; json: string; localPresetId: string }) => Promise<unknown>;
  getSuccessfulExports: () => Promise<Record<string, SuccessfulExport>>;
  generatePreset: (buildToken: string) => Promise<unknown>;
  windowControls: {
    minimize: () => void;
    toggleMaximize: () => void;
    close: () => void;
  };
}

declare global {
  interface Window {
    presetApp: PresetAppApi;
  }
}
