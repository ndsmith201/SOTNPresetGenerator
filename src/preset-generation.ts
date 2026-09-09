import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { DatabaseSync } from "node:sqlite";
import type { SuccessfulExport } from "./renderer/export-state";

const execFileAsync = promisify(execFile);
const exportFirst = "Export and build the preset first.";
interface BuiltPreset {
  rootPath: string;
  presetId: string;
  jsonHash: string;
  buildHash: string;
  localPresetId: string | null;
  previewJson: string | null;
}

async function hashFile(file: string): Promise<string> {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

// Persist both the build proof and the draft snapshot; a saved UI flag alone
// cannot establish that the exported files still match after a restart.
export class BuiltPresetStore {
  private builds = new Map<string, BuiltPreset>();

  constructor(private database?: DatabaseSync) {
    if (!database) return;
    database.exec(`
      CREATE TABLE IF NOT EXISTS preset_exports (
        token TEXT PRIMARY KEY,
        root_path TEXT NOT NULL,
        preset_id TEXT NOT NULL,
        json_hash TEXT NOT NULL,
        build_hash TEXT NOT NULL,
        local_preset_id TEXT,
        preview_json TEXT,
        UNIQUE(root_path, preset_id)
      )
    `);
    const rows = database.prepare(`
      SELECT token, root_path AS rootPath, preset_id AS presetId,
        json_hash AS jsonHash, build_hash AS buildHash,
        local_preset_id AS localPresetId, preview_json AS previewJson
      FROM preset_exports
    `).all() as unknown as (BuiltPreset & { token: string })[];
    for (const { token, ...build } of rows) this.builds.set(token, build);
  }

  forget(rootPath: string, presetId: string): void {
    this.database?.prepare("DELETE FROM preset_exports WHERE root_path = ? AND preset_id = ?").run(rootPath, presetId);
    for (const [token, build] of this.builds) {
      if (build.rootPath === rootPath && build.presetId === presetId) this.builds.delete(token);
    }
  }

  async remember(rootPath: string, presetId: string, snapshot?: Pick<SuccessfulExport, "localPresetId" | "json">): Promise<string> {
    this.forget(rootPath, presetId);
    const jsonHash = await hashFile(path.join(rootPath, "presets", `${presetId}.json`));
    const buildHash = await hashFile(path.join(rootPath, "build", "presets", `${presetId}.js`));
    const token = randomUUID();
    const localPresetId = snapshot?.localPresetId ?? null;
    const previewJson = snapshot?.json ?? null;
    this.database?.prepare(`
      INSERT INTO preset_exports (token, root_path, preset_id, json_hash, build_hash, local_preset_id, preview_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(token, rootPath, presetId, jsonHash, buildHash, localPresetId, previewJson);
    this.builds.set(token, { rootPath, presetId, jsonHash, buildHash, localPresetId, previewJson });
    return token;
  }

  async listSuccessfulExports(): Promise<Record<string, SuccessfulExport>> {
    const exports: Record<string, SuccessfulExport> = {};
    for (const [token, build] of this.builds) {
      try {
        await this.resolve(token);
      } catch {
        continue;
      }
      if (build.localPresetId && build.previewJson) {
        exports[JSON.stringify([build.rootPath, build.presetId])] = {
          localPresetId: build.localPresetId,
          directory: build.rootPath,
          json: build.previewJson,
          buildToken: token
        };
      }
    }
    return exports;
  }

  async resolve(token: unknown): Promise<BuiltPreset> {
    const build = typeof token === "string" ? this.builds.get(token) : undefined;
    if (!build) throw new Error(exportFirst);
    try {
      const jsonHash = await hashFile(path.join(build.rootPath, "presets", `${build.presetId}.json`));
      const buildHash = await hashFile(path.join(build.rootPath, "build", "presets", `${build.presetId}.js`));
      if (jsonHash !== build.jsonHash || buildHash !== build.buildHash) throw new Error(exportFirst);
      return build;
    } catch {
      this.database?.prepare("DELETE FROM preset_exports WHERE token = ?").run(token as string);
      this.builds.delete(token as string);
      throw new Error("The exported preset or build has changed. Export and build the preset first.");
    }
  }
}

export async function generatePatch(build: BuiltPreset, executablePath: string, outputPath: string): Promise<void> {
  if (path.extname(outputPath).toLowerCase() !== ".ppf") throw new Error("Choose a .ppf output file.");
  const temporary = await mkdtemp(path.join(path.dirname(outputPath), ".sotn-generate-"));
  try {
    const presetFile = path.join(temporary, "preset.json");
    await copyFile(path.join(build.rootPath, "presets", `${build.presetId}.json`), presetFile);
    if (await hashFile(presetFile) !== build.jsonHash) throw new Error(exportFirst);
    const patchFile = path.join(temporary, "patch.ppf");
    // yargs otherwise mistakes a packaged Electron Node subprocess for a GUI
    // app and treats the script filename as a positional seed URL.
    const bootstrap = "process.defaultApp = true; require(process.argv[1]);";
    await execFileAsync(executablePath, ["-e", bootstrap, path.join(build.rootPath, "randomize"), "--preset-file", presetFile, "--out", patchFile], {
      cwd: build.rootPath,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      windowsHide: true,
      timeout: 5 * 60 * 1000,
      maxBuffer: 20 * 1024 * 1024
    });
    if ((await stat(patchFile)).size === 0) throw new Error("The randomizer produced an empty patch.");
    // Keep the previous output intact if generation fails or times out.
    await rename(patchFile, outputPath);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
