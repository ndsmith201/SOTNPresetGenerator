import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyFile } from "node:fs/promises";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
  absWorkingDir: projectRoot,
  entryPoints: [path.join(projectRoot, "src", "renderer", "renderer.tsx")],
  outfile: path.join(projectRoot, "dist", "renderer", "renderer.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome130",
  define: { "process.env.NODE_ENV": '"production"' },
  minify: true,
  sourcemap: true,
  logLevel: "info"
});

await Promise.all(["index.html", "styles.css"].map((name) => copyFile(
  path.join(projectRoot, "src", "renderer", name),
  path.join(projectRoot, "dist", "renderer", name)
)));
