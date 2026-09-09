import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const exportFirst = "Export and build the preset first.";
interface BuiltPreset {
  rootPath: string;
  presetId: string;
  jsonHash: string;
  buildHash: string;
}

async function hashFile(file: string): Promise<string> {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

// Tokens are issued only after a successful export/build in this app session.
export class BuiltPresetStore {
  private builds = new Map<string, BuiltPreset>();

  forget(rootPath: string, presetId: string): void {
    for (const [token, build] of this.builds) {
      if (build.rootPath === rootPath && build.presetId === presetId) this.builds.delete(token);
    }
  }

  async remember(rootPath: string, presetId: string): Promise<string> {
    this.forget(rootPath, presetId);
    const jsonHash = await hashFile(path.join(rootPath, "presets", `${presetId}.json`));
    const buildHash = await hashFile(path.join(rootPath, "build", "presets", `${presetId}.js`));
    const token = randomUUID();
    this.builds.set(token, { rootPath, presetId, jsonHash, buildHash });
    return token;
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
