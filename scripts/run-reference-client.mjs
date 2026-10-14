import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'daybreak-core-client-'));
fs.chmodSync(temp, 0o700);
const env = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith('DT_') && !k.startsWith('DAYBREAK_')),
);
const compiled = spawnSync(
  process.execPath,
  [
    path.join(root, 'node_modules/typescript/bin/tsc'),
    '--project',
    path.join(root, 'tsconfig.reference.json'),
    '--outDir',
    temp,
  ],
  { cwd: root, env, encoding: 'utf8' },
);
if (compiled.status !== 0) {
  console.error(compiled.stdout + compiled.stderr);
  process.exit(1);
}
fs.symlinkSync(path.join(root, 'node_modules'), path.join(temp, 'node_modules'));
const result = spawnSync(
  process.execPath,
  [path.join(temp, 'examples/reference-client.js'), ...process.argv.slice(2)],
  { cwd: temp, env, stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
