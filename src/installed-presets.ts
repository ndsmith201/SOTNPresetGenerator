import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { InstalledPreset } from "./renderer/types";

export async function listInstalledPresets(rootPath: string): Promise<{ presets: InstalledPreset[]; warnings: string[] }> {
  const directory = path.join(rootPath, "presets");
  const entries = await readdir(directory, { withFileTypes: true });
  const presets: InstalledPreset[] = [];
  const warnings: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) continue;
    try {
      const json: unknown = JSON.parse(await readFile(path.join(directory, entry.name), "utf8"));
      if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error("Expected a JSON object.");
      const data = json as Record<string, unknown>;
      const metadata = data.metadata as Record<string, unknown> | undefined;
      presets.push({
        fileName: entry.name,
        name: typeof metadata?.name === "string" && metadata.name.trim() ? metadata.name : entry.name.slice(0, -5),
        json: data
      });
    } catch {
      warnings.push(`Unable to read ${entry.name}: expected a readable JSON object.`);
    }
  }
  return { presets: presets.sort((left, right) => left.name.localeCompare(right.name)), warnings };
}

// Exclusive creation also protects an installed file created after the library was loaded.
export async function writeNewPreset(filePath: string, json: unknown): Promise<void> {
  try {
    await writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("An installed preset already uses that filename. Rename your preset before exporting; installed presets are read-only.");
    }
    throw error;
  }
}
