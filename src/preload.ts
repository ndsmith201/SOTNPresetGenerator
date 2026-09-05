import { contextBridge, ipcRenderer } from "electron";

export interface PresetAppApi {
  platform: NodeJS.Platform;
  version: string;
  getPresetTemplate: () => Promise<unknown>;
  listOptions: () => Promise<unknown>;
  createOption: (request: {
    comment: string;
    category: string;
    type: string;
    value: string;
    address?: string;
    gameInit?: boolean;
    rawJson?: boolean;
    additionalWrites?: Record<string, unknown>[];
  }) => Promise<unknown>;
  chooseSotnRandoPath: (currentPath?: string) => Promise<unknown>;
  exportPreset: (request: { sotnRandoPath: string; presetName: string; json: string }) => Promise<unknown>;
  windowControls: {
    minimize: () => void;
    toggleMaximize: () => void;
    close: () => void;
  };
}

const api: PresetAppApi = {
  platform: process.platform,
  version: "0.1.0",
  getPresetTemplate: () => ipcRenderer.invoke("preset:get-template") as Promise<unknown>,
  listOptions: () => ipcRenderer.invoke("options:list") as Promise<unknown>,
  createOption: (request) => ipcRenderer.invoke("options:create", request) as Promise<unknown>,
  chooseSotnRandoPath: (currentPath) => ipcRenderer.invoke("sotnrando:choose-path", currentPath) as Promise<unknown>,
  exportPreset: (request) => ipcRenderer.invoke("preset:export", request) as Promise<unknown>,
  windowControls: {
    minimize: () => ipcRenderer.send("window:minimize"),
    toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
    close: () => ipcRenderer.send("window:close")
  }
};

contextBridge.exposeInMainWorld("presetApp", api);
