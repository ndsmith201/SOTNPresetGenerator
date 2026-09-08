import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { OpenDialogOptions } from "electron";
import { execFile } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import { mkdirSync } from "node:fs";
import squirrelStartup from "electron-squirrel-startup";
import { initializeOptionsCatalog } from "./options-database";
import { listInstalledPresets, writeNewPreset } from "./installed-presets";

const execFileAsync = promisify(execFile);
const OPTION_CATEGORIES = ["world", "items", "challenge", "relics", "gameplay"] as const;
const WRITE_TYPES = ["char", "short", "word", "long", "string"] as const;

type OptionCategory = (typeof OPTION_CATEGORIES)[number];
type WriteType = (typeof WRITE_TYPES)[number];

interface StoredOption {
  id: number;
  comment: string;
  description: string;
  readOnly: boolean;
  category: OptionCategory;
  type: WriteType;
  value: string;
  address: string | null;
  gameInit: boolean;
  statEdit: boolean;
  rawJson: boolean;
  additionalWrites: Record<string, unknown>[];
}

interface StoredOptionRow extends Omit<StoredOption, "additionalWrites" | "gameInit" | "statEdit" | "rawJson" | "readOnly"> {
  read_only: number;
  game_init: number;
  stat_edit: number;
  raw_json: number;
  additional_writes_json: string | null;
}

let optionsDatabase: DatabaseSync | null = null;

function getOptionsDatabase(): DatabaseSync {
  if (!optionsDatabase) throw new Error("The options database is not available.");
  return optionsDatabase;
}

async function initializeOptionsDatabase(): Promise<void> {
  const schemaPath = path.join(app.getAppPath(), "database", "schema.sql");
  const dumpPath = path.join(app.getAppPath(), "database", "options-dump.sql");
  const databasePath = path.join(app.getPath("userData"), "options.sqlite");
  const schema = await readFile(schemaPath, "utf8");
  const database = new DatabaseSync(databasePath);
  try {
    await initializeOptionsCatalog(database, schema, () => readFile(dumpPath, "utf8"));
    optionsDatabase = database;
  } catch (error) {
    database.close();
    throw error;
  }
}

function listOptions(): StoredOption[] {
  const rows = getOptionsDatabase()
    .prepare(
      "SELECT id, comment, description, read_only, category, type, value, address, game_init, stat_edit, raw_json, additional_writes_json FROM options ORDER BY category, comment, id"
    )
    .all() as unknown as StoredOptionRow[];
  return rows.map(hydrateStoredOption);
}

function hydrateStoredOption(row: StoredOptionRow): StoredOption {
  let additionalWrites: Record<string, unknown>[] = [];
  if (row.additional_writes_json) {
    const parsed = JSON.parse(row.additional_writes_json) as unknown;
    if (Array.isArray(parsed)) {
      additionalWrites = parsed.filter(isRecord);
    }
  }
  const { read_only: readOnly, game_init: gameInit, stat_edit: statEdit, raw_json: rawJson, additional_writes_json: _additionalWritesJson, ...option } = row;
  return { ...option, readOnly: Boolean(readOnly), gameInit: Boolean(gameInit), statEdit: Boolean(statEdit), rawJson: Boolean(rawJson), additionalWrites };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateOptionRequest(request: unknown): Omit<StoredOption, "id" | "readOnly"> {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("Invalid option request.");
  }

  const candidate = request as Record<string, unknown>;
  const comment = typeof candidate.comment === "string" ? candidate.comment.trim() : "";
  if (candidate.description !== undefined && typeof candidate.description !== "string") throw new Error("Description must be text.");
  const description = typeof candidate.description === "string" ? candidate.description.trim() : "";
  if (description.length > 1000) throw new Error("Description must be 1,000 characters or fewer.");
  const category = candidate.category;
  const type = candidate.type;
  const value = typeof candidate.value === "string" ? candidate.value.trim() : "";
  const rawJson = candidate.rawJson ?? false;
  const requestedAddress = typeof candidate.address === "string" && candidate.address.trim() ? candidate.address.trim() : null;
  const requestedGameInit = candidate.gameInit ?? false;
  const requestedStatEdit = candidate.statEdit ?? false;
  const requestedAdditionalWrites = candidate.additionalWrites ?? [];

  if (!comment) throw new Error("Enter an option comment.");
  if (!OPTION_CATEGORIES.includes(category as OptionCategory)) throw new Error("Choose a valid category.");
  if (!WRITE_TYPES.includes(type as WriteType)) throw new Error("Choose a valid write type.");
  if (!value) throw new Error("Enter an option value.");
  if (typeof rawJson !== "boolean") throw new Error("Raw JSON must be a checkbox value.");
  if (requestedAddress && !/^0x[0-9a-f]+$/i.test(requestedAddress)) throw new Error("Address must be a hexadecimal value beginning with 0x.");
  if (typeof requestedGameInit !== "boolean") throw new Error("Game init must be a checkbox value.");
  if (typeof requestedStatEdit !== "boolean") throw new Error("Edits stats must be a checkbox value.");
  if (!Array.isArray(requestedAdditionalWrites) || !requestedAdditionalWrites.every(isRecord)) {
    throw new Error("Additional writes must be a JSON array of objects.");
  }
  if (rawJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      throw new Error("Raw JSON must contain valid JSON.");
    }
    if (!isRecord(parsed)) throw new Error("Raw JSON must be a JSON object.");
  }

  const address = rawJson ? null : requestedAddress;
  const gameInit = rawJson ? false : requestedGameInit;
  const statEdit = rawJson || gameInit ? false : requestedStatEdit;
  const additionalWrites = rawJson ? [] : requestedAdditionalWrites;
  return { comment, description, category: category as OptionCategory, type: type as WriteType, value, address, gameInit, statEdit, rawJson, additionalWrites };
}

function loadOption(id: number): StoredOption {
  const row = getOptionsDatabase()
    .prepare(
      "SELECT id, comment, description, read_only, category, type, value, address, game_init, stat_edit, raw_json, additional_writes_json FROM options WHERE id = ?"
    )
    .get(id) as unknown as StoredOptionRow | undefined;
  if (!row) throw new Error("The option could not be found.");
  return hydrateStoredOption(row);
}

function createOption(request: unknown): StoredOption {
  const option = validateOptionRequest(request);
  const additionalWritesJson = option.additionalWrites.length > 0 ? JSON.stringify(option.additionalWrites) : null;

  const result = getOptionsDatabase()
    .prepare(
      "INSERT INTO options (comment, description, category, type, value, address, game_init, stat_edit, raw_json, additional_writes_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(option.comment, option.description, option.category, option.type, option.value, option.address, option.gameInit ? 1 : 0, option.statEdit ? 1 : 0, option.rawJson ? 1 : 0, additionalWritesJson);
  return loadOption(Number(result.lastInsertRowid));
}

function updateOption(id: unknown, request: unknown): StoredOption {
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) throw new Error("Invalid option id.");
  if (loadOption(id).readOnly) throw new Error("This registered option is read-only.");
  const option = validateOptionRequest(request);
  const additionalWritesJson = option.additionalWrites.length > 0 ? JSON.stringify(option.additionalWrites) : null;
  const result = getOptionsDatabase()
    .prepare(
      "UPDATE options SET comment = ?, description = ?, category = ?, type = ?, value = ?, address = ?, game_init = ?, stat_edit = ?, raw_json = ?, additional_writes_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND read_only = 0"
    )
    .run(option.comment, option.description, option.category, option.type, option.value, option.address, option.gameInit ? 1 : 0, option.statEdit ? 1 : 0, option.rawJson ? 1 : 0, additionalWritesJson, id);
  if (result.changes !== 1) throw new Error("The option could not be found.");
  return loadOption(id);
}

function defaultSotnRandoPath(): string {
  return path.join(app.getPath("documents"), "GitHub", "sotnrando");
}

async function isDirectory(directoryPath: string): Promise<boolean> {
  try {
    return (await stat(directoryPath)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function validateSotnRandoPath(rootPath: string): Promise<string | null> {
  if (!(await isDirectory(rootPath))) return "The selected SOTNRando directory does not exist.";
  if (!(await isDirectory(path.join(rootPath, "presets")))) {
    return "The selected directory does not contain a presets folder.";
  }
  if (!(await isFile(path.join(rootPath, "package.json"))) || !(await isFile(path.join(rootPath, "tools", "build-presets")))) {
    return "The selected directory does not appear to be a complete SOTNRando repository.";
  }
  return null;
}

function presetIdFromName(presetName: string): string {
  const id = presetName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return id || "preset";
}

async function registerPreset(rootPath: string, presetId: string): Promise<void> {
  const packagePath = path.join(rootPath, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as Record<string, unknown>;
  if (!Array.isArray(packageJson.presets) || !packageJson.presets.every((item) => typeof item === "string")) {
    throw new Error("SOTNRando package.json does not contain a valid presets list.");
  }
  if (!packageJson.presets.includes(presetId)) {
    packageJson.presets.push(presetId);
    await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  }
}

async function buildPresetFiles(rootPath: string): Promise<void> {
  const buildScript = path.join(rootPath, "tools", "build-presets");
  await execFileAsync(process.execPath, [buildScript], {
    cwd: rootPath,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true
  });
}

function createWindow(): void {
  const window = new BrowserWindow({
    icon: path.join(app.getAppPath(), "assets", "icons", "castle-moon.ico"),
    width: 1320,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: "#0b0d10",
    title: "SOTN Preset Generator",
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [`--preset-app-version=${app.getVersion()}`]
    }
  });

  void window.loadFile(path.join(__dirname, "renderer/index.html"));

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
}

function registerWindowControls(): void {
  ipcMain.on("window:minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.on("window:toggle-maximize", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });

  ipcMain.on("window:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle("preset:get-template", async () => {
    const templatePath = path.join(app.getAppPath(), "templates", "preset-template.json");
    return JSON.parse(await readFile(templatePath, "utf8")) as unknown;
  });

  ipcMain.handle("preset:list-installed", async (_event, rootPath: unknown) => {
    if (typeof rootPath !== "string" || !rootPath.trim()) return { status: "error", error: "Choose a SOTNRando directory first." };
    try {
      return { status: "ok", ...await listInstalledPresets(path.resolve(rootPath)) };
    } catch {
      return { status: "error", error: "Unable to read installed presets. Check the configured SOTNRando directory." };
    }
  });

  ipcMain.handle("options:list", () => {
    try {
      return { status: "ok", options: listOptions() };
    } catch (error) {
      console.error("Unable to load options", error);
      return { status: "error", error: "Unable to load options from the database." };
    }
  });

  ipcMain.handle("options:create", (_event, request: unknown) => {
    try {
      return { status: "created", option: createOption(request) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create the option.";
      return { status: "error", error: message };
    }
  });

  ipcMain.handle("options:update", (_event, id: unknown, request: unknown) => {
    try {
      return { status: "updated", option: updateOption(id, request) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update the option.";
      return { status: "error", error: message };
    }
  });

  ipcMain.handle("sotnrando:choose-path", async (event, currentPath: unknown) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: "Choose the SOTNRando directory",
      defaultPath: typeof currentPath === "string" && currentPath.trim() ? currentPath : defaultSotnRandoPath(),
      properties: ["openDirectory"]
    };
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };

    const rootPath = path.resolve(result.filePaths[0]);
    const pathError = await validateSotnRandoPath(rootPath);
    if (pathError) {
      const messageOptions = { type: "error" as const, title: "Invalid SOTNRando directory", message: pathError };
      if (owner) await dialog.showMessageBox(owner, messageOptions);
      else await dialog.showMessageBox(messageOptions);
      return { canceled: false, error: pathError };
    }
    return { canceled: false, path: rootPath };
  });

  ipcMain.handle("preset:export", async (event, request: unknown) => {
    if (!request || typeof request !== "object") return { status: "error", error: "Invalid export request." };
    const { sotnRandoPath, presetName, json } = request as Record<string, unknown>;
    if (typeof sotnRandoPath !== "string" || typeof presetName !== "string" || typeof json !== "string") {
      return { status: "error", error: "Invalid export request." };
    }

    const rootPath = path.resolve(sotnRandoPath);
    const pathError = await validateSotnRandoPath(rootPath);
    if (pathError) return { status: "error", error: pathError };

    let presetJson: unknown;
    try {
      presetJson = JSON.parse(json) as unknown;
    } catch {
      return { status: "error", error: "The generated preset is not valid JSON." };
    }

    if (!presetJson || typeof presetJson !== "object" || Array.isArray(presetJson)) {
      return { status: "error", error: "The generated preset must be a JSON object." };
    }
    const presetRecord = presetJson as Record<string, unknown>;
    const metadata = presetRecord.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return { status: "error", error: "The generated preset is missing metadata." };
    }
    const presetId = presetIdFromName(presetName);
    (metadata as Record<string, unknown>).id = presetId;

    const presetsDirectory = path.resolve(rootPath, "presets");
    const exportPath = path.resolve(presetsDirectory, `${presetId}.json`);
    if (path.dirname(exportPath) !== presetsDirectory) {
      return { status: "error", error: "The preset filename is invalid." };
    }


    if (await isDirectory(exportPath)) return { status: "error", error: "A directory already uses that preset name." };
    try {
      await stat(exportPath);
      const owner = BrowserWindow.fromWebContents(event.sender);
      const confirmation = {
        type: "warning" as const,
        title: "Replace preset?",
        message: `${path.basename(exportPath)} already exists.`,
        detail: "Exporting will replace the existing preset file.",
        buttons: ["Replace", "Cancel"],
        defaultId: 1,
        cancelId: 1
      };
      const response = owner ? await dialog.showMessageBox(owner, confirmation) : await dialog.showMessageBox(confirmation);
      if (response.response !== 0) return { status: "canceled" };
    } catch {
      // The target does not exist yet.
    }

    try {
      await writeFile(exportPath, `${JSON.stringify(presetJson, null, 2)}\n`, "utf8");
      await registerPreset(rootPath, presetId);
      await buildPresetFiles(rootPath);
      return { status: "exported", path: exportPath, presetId };
    } catch (error) {
      console.error("Unable to export preset", error);
      const detail = error instanceof Error ? error.message : "Unknown build error";
      return { status: "error", error: `The preset was not fully exported and built: ${detail}` };
    }
  });
}

if (squirrelStartup) {
  app.quit();
} else {
  if (process.platform === "win32") app.setAppUserModelId("com.squirrel.SOTNPresetGenerator.SOTNPresetGenerator");
  // Keep existing data when packaging adds a human-readable productName.
  const userDataPath = path.join(app.getPath("appData"), "sotn-preset-generator");
  mkdirSync(userDataPath, { recursive: true });
  app.setPath("userData", userDataPath);
  void app.whenReady().then(async () => {
    try {
      await initializeOptionsDatabase();
    } catch (error) {
      console.error("Unable to initialize the options database", error);
      dialog.showErrorBox("Database unavailable", "The options database could not be initialized.");
      app.quit();
      return;
    }
    registerWindowControls();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("before-quit", () => {
  optionsDatabase?.close();
  optionsDatabase = null;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
