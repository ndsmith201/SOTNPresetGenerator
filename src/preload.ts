import type { CreateOptionInput } from "./renderer/types";
import type { UpdateApi, UpdateState } from "./update-types";
import { contextBridge, ipcRenderer } from "electron";
import type { SuccessfulExport } from "./renderer/export-state";
import type { CommunityRequest, CommunityResult } from "./community-types";

export interface PresetAppApi {
  updates: UpdateApi;
  community: (request: CommunityRequest) => Promise<CommunityResult>;
  platform: NodeJS.Platform;
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

const api: PresetAppApi = {
  updates: {
    getState: () => ipcRenderer.invoke("updates:state"),
    onState: listener => {
      const receive = (_event: Electron.IpcRendererEvent, state: UpdateState) => listener(state);
      ipcRenderer.on("updates:state-changed", receive);
      return () => { ipcRenderer.removeListener("updates:state-changed", receive); };
    },
    install: () => ipcRenderer.invoke("updates:install"),
    restart: () => ipcRenderer.invoke("updates:restart"),
    openDownload: () => ipcRenderer.invoke("updates:download")
  },
  community: (request) => ipcRenderer.invoke("community:request", request),
  platform: process.platform,
  version: process.argv.find((argument) => argument.startsWith("--preset-app-version="))?.slice("--preset-app-version=".length) ?? "development",
  getPresetTemplate: () => ipcRenderer.invoke("preset:get-template") as Promise<unknown>,
  getDefaultSotnRandoPath: () => ipcRenderer.invoke("sotnrando:default-path") as Promise<string | null>,
  listInstalledPresets: (rootPath) => ipcRenderer.invoke("preset:list-installed", rootPath) as Promise<unknown>,
  deleteOption: (id) => ipcRenderer.invoke("options:delete", id) as Promise<unknown>,
  listOptions: () => ipcRenderer.invoke("options:list") as Promise<unknown>,
  createOption: (request) => ipcRenderer.invoke("options:create", request) as Promise<unknown>,
  updateOption: (id, request) => ipcRenderer.invoke("options:update", id, request) as Promise<unknown>,
  chooseSotnRandoPath: (currentPath) => ipcRenderer.invoke("sotnrando:choose-path", currentPath) as Promise<unknown>,
  exportPreset: (request) => ipcRenderer.invoke("preset:export", request) as Promise<unknown>,
  getSuccessfulExports: () => ipcRenderer.invoke("preset:successful-exports") as Promise<Record<string, SuccessfulExport>>,
  generatePreset: (buildToken) => ipcRenderer.invoke("preset:generate", buildToken) as Promise<unknown>,
  windowControls: {
    minimize: () => ipcRenderer.send("window:minimize"),
    toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
    close: () => ipcRenderer.send("window:close")
  }
};

contextBridge.exposeInMainWorld("presetApp", api);
