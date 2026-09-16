import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export async function exportRandoToolsPreset(
  directory: string | undefined,
  presetId: string,
  json: string,
  confirmReplace: (filePath: string) => Promise<boolean>
): Promise<{ status: "exported"; path: string } | { status: "skipped" | "canceled" }> {
  if (!directory?.trim()) return { status: "skipped" };
  const root = path.resolve(directory);
  try {
    if (!(await stat(root)).isDirectory()) return { status: "skipped" };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "skipped" };
    throw error;
  }
  const presetsDirectory = path.join(root, "presets");
  const filePath = path.resolve(presetsDirectory, `${presetId}.json`);
  if (path.dirname(filePath) !== presetsDirectory) throw new Error("The preset filename is invalid.");
  // Never recreate a missing installation or its parent directories.
  try { await mkdir(presetsDirectory); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  try {
    await writeFile(filePath, json, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (!(await stat(filePath)).isFile()) throw new Error("A directory already uses that preset name in RandoTools.");
    if (!(await confirmReplace(filePath))) return { status: "canceled" };
    await writeFile(filePath, json, "utf8");
  }
  return { status: "exported", path: filePath };
}
