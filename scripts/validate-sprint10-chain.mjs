// Isolated Web API client -> real Gateway -> SDK stdio MCP fixture adapter -> real Core -> synthetic Managed ports.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gateway = path.resolve(root, '../sre-morning-check');
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'daybreak-sprint10-chain-'));
await fs.chmod(dir, 0o700);
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(DT_|DAYBREAK_|SPRINT10_)/.test(k)));
Object.assign(env, {
  DT_MCP_OLLAMA_ENABLED: 'false',
  DT_MCP_DISABLE_TELEMETRY: 'true',
  DAYBREAK_PROFILE: 'incident-intelligence',
  DAYBREAK_EXTENSION_ORIGIN: 'chrome-extension://' + 'a'.repeat(32),
  DAYBREAK_DISABLE_LOCAL_LLM: 'true',
  LOG_OUTPUT: 'disabled',
  SPRINT10_FIXTURE_BUILD: dir,
});
const compiled = spawnSync(
  process.execPath,
  [
    path.join(root, 'node_modules/typescript/bin/tsc'),
    '--project',
    path.join(root, 'tsconfig.reference.json'),
    '--outDir',
    dir,
  ],
  { cwd: root, env, encoding: 'utf8' },
);
if (compiled.status !== 0) throw Error(compiled.stdout + compiled.stderr);
await fs.symlink(path.join(root, 'node_modules'), path.join(dir, 'node_modules'));
const runtime = path.join(dir, 'runtime');
await fs.mkdir(path.join(runtime, 'data'), { recursive: true });
await fs.symlink(path.join(gateway, 'public'), path.join(runtime, 'public'));
await fs.symlink(path.join(gateway, 'src'), path.join(runtime, 'src'));
await fs.writeFile(
  path.join(runtime, 'fixture-config.json'),
  JSON.stringify({
    servers: {
      fixture: { command: process.execPath, args: [path.join(root, 'scripts/sprint10-fixture-mcp.mjs')], env },
    },
  }),
  { mode: 0o600 },
);
await fs.writeFile(
  path.join(runtime, '.local-config.json'),
  JSON.stringify({ mcpConfig: path.join(runtime, 'fixture-config.json') }),
);
const reserve = createServer();
await new Promise((r) => reserve.listen(0, '127.0.0.1', r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
assert.notEqual(port, 4318);
const origin = 'http://127.0.0.1:' + port;
const child = spawn(process.execPath, [path.join(gateway, 'src/server.mjs')], {
  cwd: runtime,
  env: { ...env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (b) => (output += b));
child.stderr.on('data', (b) => (output += b));
const pause = () => new Promise((r) => setTimeout(r, 50));
const deadline = Date.now() + 30000;
async function until(fn) {
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw Error('Fixture Gateway exited: ' + output);
    const value = await fn();
    if (value) return value;
    await pause();
  }
  throw Error('Fixture chain timeout: ' + output);
}
try {
  await until(async () => output.includes('Morning check :'));
  const catalog = await until(async () => {
    const r = await fetch(origin + '/api/extension/context');
    const c = await r.json();
    return c.environments?.some((e) => e.status === 'available') && c;
  });
  await until(async () => {
    const s = await (await fetch(origin + '/api/status')).json();
    return !s.progress?.running;
  });
  const { gatewayApi } = await import(pathToFileURL(path.join(gateway, 'public/workspace/api.js')));
  const api = gatewayApi((url, opts = {}) => {
    assert.ok(url.startsWith('/'));
    return fetch(origin + url, { ...opts, headers: { ...opts.headers, Origin: origin } });
  });
  const csrf = (await (await fetch(origin + '/api/status')).json()).csrf;
  // Use explicitly authorized extension-origin start to exercise the direct investigation path.
  const extension = 'chrome-extension://' + 'a'.repeat(32);
  const environment = catalog.environments[0];
  const start = await fetch(origin + '/api/workbench/start', {
    method: 'POST',
    headers: { 'Origin': extension, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify({
      kind: 'investigation',
      input: { layer: 'infra', problemId: 'quality-complete', environmentId: environment.id, analysisMode: 'explain' },
    }),
  });
  assert.equal(
    start.status,
    202,
    await start.text().then((t) => {
      try {
        return JSON.parse(t).error || t;
      } catch {
        return t;
      }
    }),
  );
  const listed = await until(async () => {
    const list = await api.list();
    return list.jobs?.some((j) => j.status === 'completed') && list;
  });
  const job = await api.job(listed.jobs[0].id);
  const report = job.result.problemInvestigations[0];
  assert.equal(report.llm.status, 'disabled');
  assert.equal(report.investigation.schemaVersion, '1.0');
  assert.ok(report.evidence.length > 0);
  assert.equal(report.explain.whyItHappened.mechanism.certainty, 'unknown');
  const page = await fetch(origin + '/workspace');
  assert.equal(page.status, 200);
  for (const asset of ['app.js', 'api.js', 'model.js', 'shared/investigation-view.js'])
    assert.equal((await fetch(origin + '/workspace/' + asset)).status, 200);
  console.log(
    JSON.stringify({
      pass: true,
      port,
      evidence: report.evidence.length,
      transport: 'Web API -> Gateway -> SDK MCP fixture -> Core -> synthetic Managed ports',
      nativeBrowser: false,
      managedReal: false,
      dataDirectory: dir,
    }),
  );
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    const stopped = new Promise((r) => child.once('exit', r));
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    await stopped;
    clearTimeout(timer);
  }
}
