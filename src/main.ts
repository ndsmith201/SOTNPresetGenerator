import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { OpenDialogOptions } from "electron";
import { execFile } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const OPTION_CATEGORIES = ["world", "items", "challenge", "relics", "gameplay"] as const;
const WRITE_TYPES = ["char", "short", "word", "long", "string"] as const;

type OptionCategory = (typeof OPTION_CATEGORIES)[number];
type WriteType = (typeof WRITE_TYPES)[number];

interface StoredOption {
  id: number;
  comment: string;
  category: OptionCategory;
  type: WriteType;
  value: string;
  address: string | null;
  gameInit: boolean;
  rawJson: boolean;
  additionalWrites: Record<string, unknown>[];
}

interface StoredOptionRow extends Omit<StoredOption, "additionalWrites" | "gameInit" | "rawJson"> {
  game_init: number;
  raw_json: number;
  additional_writes_json: string | null;
}

let optionsDatabase: DatabaseSync | null = null;

function getOptionsDatabase(): DatabaseSync {
  if (!optionsDatabase) throw new Error("The options database is not available.");
  return optionsDatabase;
}

function migrateOptionsCategories(database: DatabaseSync): void {
  const table = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'options'")
    .get() as { sql?: string } | undefined;
  if (!table?.sql || (table.sql.includes("'relics'") && table.sql.includes("'gameplay'"))) return;

  const columns = new Set(
    (database.prepare("PRAGMA table_info(options)").all() as unknown as { name: string }[]).map((column) => column.name)
  );
  const addressExpression = columns.has("address") ? "address" : "NULL";
  const gameInitExpression = columns.has("game_init") ? "game_init" : "0";
  const rawJsonExpression = columns.has("raw_json") ? "raw_json" : "0";
  const additionalWritesExpression = columns.has("additional_writes_json") ? "additional_writes_json" : "NULL";

  database.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN IMMEDIATE;
    ALTER TABLE options RENAME TO options_before_relic_category;
    CREATE TABLE options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment TEXT NOT NULL CHECK (length(trim(comment)) > 0),
      category TEXT NOT NULL CHECK (category IN ('world', 'items', 'challenge', 'relics', 'gameplay')),
      type TEXT NOT NULL CHECK (type IN ('char', 'short', 'word', 'long', 'string')),
      value TEXT NOT NULL CHECK (length(trim(value)) > 0),
      address TEXT CHECK (address IS NULL OR length(trim(address)) > 0),
      game_init INTEGER NOT NULL DEFAULT 0 CHECK (game_init IN (0, 1)),
      raw_json INTEGER NOT NULL DEFAULT 0 CHECK (raw_json IN (0, 1)),
      additional_writes_json TEXT CHECK (
        additional_writes_json IS NULL OR
        (json_valid(additional_writes_json) AND json_type(additional_writes_json) = 'array')
      ),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO options (id, comment, category, type, value, address, game_init, raw_json, additional_writes_json, created_at, updated_at)
    SELECT id, comment, category, type, value, ${addressExpression}, ${gameInitExpression}, ${rawJsonExpression}, ${additionalWritesExpression}, created_at, updated_at
    FROM options_before_relic_category;
    DROP TABLE options_before_relic_category;
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

function migrateOptionalWriteFields(database: DatabaseSync): void {
  const columns = new Set(
    (database.prepare("PRAGMA table_info(options)").all() as unknown as { name: string }[]).map((column) => column.name)
  );
  if (!columns.has("address")) {
    database.exec(
      "ALTER TABLE options ADD COLUMN address TEXT CHECK (address IS NULL OR length(trim(address)) > 0)"
    );
  }
  if (!columns.has("additional_writes_json")) {
    database.exec(
      "ALTER TABLE options ADD COLUMN additional_writes_json TEXT CHECK (additional_writes_json IS NULL OR (json_valid(additional_writes_json) AND json_type(additional_writes_json) = 'array'))"
    );
  }
  if (!columns.has("game_init")) {
    database.exec("ALTER TABLE options ADD COLUMN game_init INTEGER NOT NULL DEFAULT 0 CHECK (game_init IN (0, 1))");
  }
  if (!columns.has("raw_json")) {
    database.exec("ALTER TABLE options ADD COLUMN raw_json INTEGER NOT NULL DEFAULT 0 CHECK (raw_json IN (0, 1))");
  }
}

async function initializeOptionsDatabase(): Promise<void> {
  const schemaPath = path.join(app.getAppPath(), "database", "schema.sql");
  const seedPath = path.join(app.getAppPath(), "database", "seed.sql");
  const databasePath = path.join(app.getPath("userData"), "options.sqlite");
  const [schema, seed] = await Promise.all([readFile(schemaPath, "utf8"), readFile(seedPath, "utf8")]);
  optionsDatabase = new DatabaseSync(databasePath);
  migrateOptionsCategories(optionsDatabase);
  optionsDatabase.exec(schema);
  migrateOptionalWriteFields(optionsDatabase);
  optionsDatabase.exec(seed);
}

function listOptions(): StoredOption[] {
  const rows = getOptionsDatabase()
    .prepare(
      "SELECT id, comment, category, type, value, address, game_init, raw_json, additional_writes_json FROM options ORDER BY category, comment, id"
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
  const { game_init: gameInit, raw_json: rawJson, additional_writes_json: _additionalWritesJson, ...option } = row;
  return { ...option, gameInit: Boolean(gameInit), rawJson: Boolean(rawJson), additionalWrites };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createOption(request: unknown): StoredOption {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("Invalid option request.");
  }

  const candidate = request as Record<string, unknown>;
  const comment = typeof candidate.comment === "string" ? candidate.comment.trim() : "";
  const category = candidate.category;
  const type = candidate.type;
  const value = typeof candidate.value === "string" ? candidate.value.trim() : "";
  const rawJson = candidate.rawJson ?? false;
  const requestedAddress = typeof candidate.address === "string" && candidate.address.trim() ? candidate.address.trim() : null;
  const requestedGameInit = candidate.gameInit ?? false;
  const requestedAdditionalWrites = candidate.additionalWrites ?? [];

  if (!comment) throw new Error("Enter an option comment.");
  if (!OPTION_CATEGORIES.includes(category as OptionCategory)) throw new Error("Choose a valid category.");
  if (!WRITE_TYPES.includes(type as WriteType)) throw new Error("Choose a valid write type.");
  if (!value) throw new Error("Enter an option value.");
  if (typeof rawJson !== "boolean") throw new Error("Raw JSON must be a checkbox value.");
  if (requestedAddress && !/^0x[0-9a-f]+$/i.test(requestedAddress)) throw new Error("Address must be a hexadecimal value beginning with 0x.");
  if (typeof requestedGameInit !== "boolean") throw new Error("Game init must be a checkbox value.");
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
  const additionalWrites = rawJson ? [] : requestedAdditionalWrites;
  const additionalWritesJson = additionalWrites.length > 0 ? JSON.stringify(additionalWrites) : null;

  const result = getOptionsDatabase()
    .prepare(
      "INSERT INTO options (comment, category, type, value, address, game_init, raw_json, additional_writes_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(comment, category as OptionCategory, type as WriteType, value, address, gameInit ? 1 : 0, rawJson ? 1 : 0, additionalWritesJson);
  const row = getOptionsDatabase()
    .prepare(
      "SELECT id, comment, category, type, value, address, game_init, raw_json, additional_writes_json FROM options WHERE id = ?"
    )
    .get(result.lastInsertRowid) as unknown as StoredOptionRow | undefined;
  if (!row) throw new Error("The option was saved but could not be reloaded.");
  return hydrateStoredOption(row);
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
      sandbox: true
    }
  });

  void window.loadFile(path.join(__dirname, "../src/renderer/index.html"));

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

app.on("before-quit", () => {
  optionsDatabase?.close();
  optionsDatabase = null;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
