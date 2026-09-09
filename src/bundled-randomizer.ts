import { cp, mkdtemp, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

async function validateInstallation(directory: string): Promise<void> {
  JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
  await readFile(path.join(directory, "tools", "build-presets"));
  if (!(await stat(path.join(directory, "presets"))).isDirectory()) throw new Error("Missing sotnrando presets directory.");
}

export function randomizerInstallPath(executablePath: string, squirrelInstall: boolean): string {
  const applicationDirectory = path.dirname(executablePath);
  // Squirrel replaces app-<version> on upgrades. Keep writable presets beside it.
  return path.join(squirrelInstall ? path.dirname(applicationDirectory) : applicationDirectory, "sotnrando");
}

export async function initializeBundledRandomizer(source: string, destination: string): Promise<string> {
  try {
    await stat(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const temporary = await mkdtemp(path.join(path.dirname(destination), ".sotnrando-install-"));
    try {
      const prepared = path.join(temporary, "sotnrando");
      await cp(source, prepared, { recursive: true, errorOnExist: true, force: false });
      await validateInstallation(prepared);
      await rename(prepared, destination);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
  // Reuse existing installs and their exported presets intact on upgrades.
  await validateInstallation(destination);
  return destination;
}
