import { app, autoUpdater, BrowserWindow, dialog, ipcMain, safeStorage, shell } from "electron";
import type { OpenDialogOptions } from "electron";
import { execFile } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import { mkdirSync } from "node:fs";
import squirrelStartup from "electron-squirrel-startup";
import { deleteUserOption, initializeOptionsCatalog } from "./options-database";
import { listInstalledPresets, writeNewPreset } from "./installed-presets";
import { initializeBundledRandomizer, randomizerInstallPath } from "./bundled-randomizer";
import { BuiltPresetStore, generatePatch } from "./preset-generation";
import { CommunityService } from "./community-service";
import { AppUpdater } from "./app-updater";
import type { CommunityRequest } from "./community-types";

const execFileAsync = promisify(execFile);
let builtPresets = new BuiltPresetStore();
let generatingPreset = false;
let community: CommunityService | null = null;
let updater: AppUpdater | null = null;
let squirrelInstalled = false;
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
  primaryWrite?: Record<string, unknown>;
}

interface StoredOptionRow extends Omit<StoredOption, "primaryWrite" | "additionalWrites" | "gameInit" | "statEdit" | "rawJson" | "readOnly"> {
  primary_write_json: string | null;
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
      "SELECT id, comment, description, read_only, category, type, value, address, game_init, stat_edit, raw_json, additional_writes_json, primary_write_json FROM options ORDER BY category, comment, id"
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
  const { primary_write_json: primarySource, read_only: readOnly, game_init: gameInit, stat_edit: statEdit, raw_json: rawJson, additional_writes_json: _additionalWritesJson, ...option } = row;
  return { ...option, ...(primarySource ? { primaryWrite: JSON.parse(primarySource) } : {}), readOnly: Boolean(readOnly), gameInit: Boolean(gameInit), statEdit: Boolean(statEdit), rawJson: Boolean(rawJson), additionalWrites };
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
  if (description.length > 10000) throw new Error("Description must be 10,000 characters or fewer.");
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
  const primaryWrite = rawJson ? undefined : candidate.primaryWrite;
  if (primaryWrite !== undefined) {
    if (!isRecord(primaryWrite) || primaryWrite.type !== type || String(primaryWrite.value) !== value || (primaryWrite.address ?? null) !== address) {
      throw new Error("The first write must match the option's type, value, and address.");
    }
  }
  return { comment, description, category: category as OptionCategory, type: type as WriteType, value, address, gameInit, statEdit, rawJson, additionalWrites, ...(primaryWrite ? { primaryWrite: primaryWrite as Record<string, unknown> } : {}) };
}

function loadOption(id: number): StoredOption {
  const row = getOptionsDatabase()
    .prepare(
      "SELECT id, comment, description, read_only, category, type, value, address, game_init, stat_edit, raw_json, additional_writes_json, primary_write_json FROM options WHERE id = ?"
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
      "INSERT INTO options (comment, description, category, type, value, address, game_init, stat_edit, raw_json, additional_writes_json, primary_write_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(option.comment, option.description, option.category, option.type, option.value, option.address, option.gameInit ? 1 : 0, option.statEdit ? 1 : 0, option.rawJson ? 1 : 0, additionalWritesJson, option.primaryWrite ? JSON.stringify(option.primaryWrite) : null);
  return loadOption(Number(result.lastInsertRowid));
}

function updateOption(id: unknown, request: unknown): StoredOption {
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) throw new Error("Invalid option id.");
  if (loadOption(id).readOnly) throw new Error("This registered option is read-only.");
  const option = validateOptionRequest(request);
  const additionalWritesJson = option.additionalWrites.length > 0 ? JSON.stringify(option.additionalWrites) : null;
  const result = getOptionsDatabase()
    .prepare(
      "UPDATE options SET comment = ?, description = ?, category = ?, type = ?, value = ?, address = ?, game_init = ?, stat_edit = ?, raw_json = ?, additional_writes_json = ?, primary_write_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND read_only = 0"
    )
    .run(option.comment, option.description, option.category, option.type, option.value, option.address, option.gameInit ? 1 : 0, option.statEdit ? 1 : 0, option.rawJson ? 1 : 0, additionalWritesJson, option.primaryWrite ? JSON.stringify(option.primaryWrite) : null, id);
  if (result.changes !== 1) throw new Error("The option could not be found.");
  return loadOption(id);
}

let bundledSotnRandoPath: string | null = null;

function defaultSotnRandoPath(): string {
  return bundledSotnRandoPath ?? path.join(app.getPath("documents"), "GitHub", "sotnrando");
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
  ipcMain.handle("updates:state", () => updater?.getState() ?? { phase: "idle", currentVersion: app.getVersion() });
  const updateActions: Record<string, () => void | Promise<void>> = {
    "updates:install": () => { if (!updater) throw new Error("Updates are unavailable."); updater.install(); },
    "updates:restart": () => { if (!updater) throw new Error("Updates are unavailable."); updater.restart(); },
    "updates:download": async () => {
      const release = updater?.getState().release;
      if (!release) throw new Error("No update is available.");
      await shell.openExternal(release.pageUrl);
    }
  };
  for (const [channel, action] of Object.entries(updateActions)) {
    ipcMain.handle(channel, async event => {
      if (event.senderFrame !== event.sender.mainFrame) return { status: "error", error: "Invalid update request." };
      try { await action(); return { status: "ok" }; }
      catch (error) { return { status: "error", error: error instanceof Error ? error.message : "Unable to update." }; }
    });
  }
  ipcMain.handle("community:request", (event, request: CommunityRequest) => {
    if (event.senderFrame !== event.sender.mainFrame || !community) return { status: "error", error: "Community service is unavailable." };
    return community.request(request);
  });
  ipcMain.handle("sotnrando:default-path", () => bundledSotnRandoPath);
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

  ipcMain.handle("options:delete", (_event, id: unknown) => {
    try {
      deleteUserOption(getOptionsDatabase(), id);
      return { status: "deleted" };
    } catch (error) {
      return { status: "error", error: error instanceof Error ? error.message : "Unable to delete the option." };
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
    if (generatingPreset) return { status: "error", error: "Wait for patch generation to finish before exporting." };
    if (!request || typeof request !== "object") return { status: "error", error: "Invalid export request." };
    const { sotnRandoPath, presetName, json, localPresetId } = request as Record<string, unknown>;
    if (typeof sotnRandoPath !== "string" || typeof presetName !== "string" || typeof json !== "string" || typeof localPresetId !== "string" || !localPresetId) {
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
      builtPresets.forget(rootPath, presetId);
      await writeFile(exportPath, `${JSON.stringify(presetJson, null, 2)}\n`, "utf8");
      await registerPreset(rootPath, presetId);
      await buildPresetFiles(rootPath);
      const buildToken = await builtPresets.remember(rootPath, presetId, { localPresetId, json });
      return { status: "exported", path: exportPath, presetId, buildToken };
    } catch (error) {
      console.error("Unable to export preset", error);
      const detail = error instanceof Error ? error.message : "Unknown build error";
      return { status: "error", error: `The preset was not fully exported and built: ${detail}` };
    }
  });

  ipcMain.handle("preset:successful-exports", () => builtPresets.listSuccessfulExports());

  ipcMain.handle("preset:generate", async (event, buildToken: unknown) => {
    if (generatingPreset) return { status: "error", error: "A patch is already being generated." };
    generatingPreset = true;
    try {
      const build = await builtPresets.resolve(buildToken);
      const owner = BrowserWindow.fromWebContents(event.sender);
      const options = {
        title: "Save generated PPF patch",
        defaultPath: path.join(app.getPath("documents"), `${build.presetId}-${Date.now()}.ppf`),
        filters: [{ name: "PPF patch", extensions: ["ppf"] }]
      };
      const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { status: "canceled" };
      await builtPresets.resolve(buildToken);
      await generatePatch(build, process.execPath, result.filePath);
      shell.showItemInFolder(result.filePath);
      return { status: "generated", path: result.filePath };
    } catch (error) {
      console.error("Unable to generate patch", error);
      return { status: "error", error: error instanceof Error ? error.message : "Unable to generate the patch." };
    } finally {
      generatingPreset = false;
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
      builtPresets = new BuiltPresetStore(getOptionsDatabase());
    } catch (error) {
      console.error("Unable to initialize the options database", error);
      dialog.showErrorBox("Database unavailable", "The options database could not be initialized.");
      app.quit();
      return;
    }
    try {
      const database = getOptionsDatabase();
      database.exec("CREATE TABLE IF NOT EXISTS community_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
      community = new CommunityService({
        database,
        builds: builtPresets,
        createOption: (input) => ({ ...createOption(input) }),
        loadOption: (id) => ({ ...loadOption(id) }),
        storage: {
          read: (key) => database.prepare("SELECT value FROM community_settings WHERE key = ?").get(key)?.value as string | undefined,
          write: (key, value) => {
            if (value === null) database.prepare("DELETE FROM community_settings WHERE key = ?").run(key);
            else database.prepare("INSERT OR REPLACE INTO community_settings (key, value) VALUES (?, ?)").run(key, value);
          },
          encrypt: (value) => {
            if (!safeStorage.isEncryptionAvailable() || (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text")) return null;
            return safeStorage.encryptString(value).toString("base64");
          },
          decrypt: (value) => safeStorage.decryptString(Buffer.from(value, "base64"))
        }
      });
    } catch {
      console.error("Unable to initialize community settings. Local editing remains available.");
    }
    if (app.isPackaged) {
      try {
        const executablePath = app.getPath("exe");
        const applicationDirectory = path.dirname(executablePath);
        const squirrelInstall = process.platform === "win32"
          && /^app-\d+\./.test(path.basename(applicationDirectory))
          && await isFile(path.join(applicationDirectory, "..", "Update.exe"));
        squirrelInstalled = squirrelInstall;
        bundledSotnRandoPath = await initializeBundledRandomizer(
          path.join(process.resourcesPath, "sotnrando"),
          randomizerInstallPath(executablePath, squirrelInstall)
        );
      } catch (error) {
        console.error("Unable to initialize bundled sotnrando", error);
        dialog.showErrorBox("SOTNRando unavailable", "The bundled randomizer could not be prepared. Make sure the application is installed in a writable directory. You can also choose an existing SOTNRando directory from the Settings menu.");
      }
    }
    updater = new AppUpdater({
      currentVersion: app.getVersion(), enabled: app.isPackaged && process.platform === "win32",
      arch: process.arch, squirrelInstalled, updater: autoUpdater,
      onState: state => { for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send("updates:state-changed", state); },
      log: error => console.warn("App update", error)
    });
    registerWindowControls();
    createWindow();
    // The installer holds a lock during its first launch; let it finish first.
    const updateTimer = setTimeout(() => { void updater?.check(); }, process.argv.includes("--squirrel-firstrun") ? 10_000 : 1_000);
    updateTimer.unref();

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
