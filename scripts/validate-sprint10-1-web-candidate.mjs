// Validate the deferred frontend patch without changing assets served by the active Gateway.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gateway = path.resolve(root, '../sre-morning-check');
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'daybreak-sprint10-1-candidate-'));
await fs.chmod(dir, 0o700);
const copy = path.join(dir, 'sre-morning-check');
await fs.mkdir(copy);
const file = path.join(gateway, 'public/workspace/api.js');
const hash = async () =>
  crypto
    .createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');
const before = await hash();
for (const name of ['public', 'src', 'test', 'scripts'])
  await fs.cp(path.join(gateway, name), path.join(copy, name), { recursive: true });
await fs.copyFile(path.join(gateway, 'package.json'), path.join(copy, 'package.json'));
await fs.symlink(path.join(gateway, 'node_modules'), path.join(copy, 'node_modules'));
for (const name of ['dynatrace-managed-mcp-poc', 'daybreak-browser-extension'])
  await fs.symlink(path.resolve(root, '..', name), path.join(dir, name));
const env = {
  PATH: path.dirname(process.execPath) + ':/usr/bin:/bin',
  HOME: dir,
  TMPDIR: dir,
  DT_MCP_DISABLE_TELEMETRY: 'true',
  DT_MCP_OLLAMA_ENABLED: 'false',
  LOG_OUTPUT: 'disabled',
};
const git = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
assert.ok(path.isAbsolute(git), 'Existing Git binary required');
const patch = path.join(gateway, 'docs/patches/sprint10-1-web-errors.patch');
for (const args of [
  ['apply', '--check', patch],
  ['apply', patch],
]) {
  const r = spawnSync(git, args, { cwd: copy, env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
}
const files = (await fs.readdir(path.join(copy, 'test')))
  .filter((n) => n.endsWith('.test.mjs') || n === 'incident-profile-http.integration.mjs')
  .sort();
const tested = spawnSync(process.execPath, ['--test', ...files.map((n) => path.join(copy, 'test', n))], {
  cwd: copy,
  env,
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});
const log = (tested.stdout || '') + (tested.stderr || '');
await fs.writeFile(path.join(dir, 'gateway-tests.log'), log, { mode: 0o600 });
assert.equal(await hash(), before, 'Original Web asset must remain unchanged');
assert.equal(tested.status, 0, log.slice(-3000));
assert.match(log, /(?:#|ℹ) pass 187/);
const result = {
  pass: true,
  tests: 187,
  originalAssetUnchanged: true,
  candidateGateway: copy,
  patchAppliedToOriginal: false,
};
await fs.writeFile(path.join(dir, 'results.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
console.log(JSON.stringify(result));
