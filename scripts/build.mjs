import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await promisify(execFile)(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc')], {
  cwd: root, windowsHide: true, maxBuffer: 10 * 1024 * 1024
});
await import('./build-renderer.mjs');
