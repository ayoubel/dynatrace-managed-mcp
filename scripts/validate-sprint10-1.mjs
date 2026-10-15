// Reproducible isolated functional acceptance; never uses active data/config/builds.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, request } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gatewayFlag = process.argv.indexOf('--gateway-root');
const gateway =
  gatewayFlag >= 0 ? path.resolve(process.argv[gatewayFlag + 1]) : path.resolve(root, '../sre-morning-check');
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'daybreak-sprint10-1-'));
await fs.chmod(dir, 0o700);
const build = path.join(dir, 'build');
const results = [];
const children = new Set();
const controlPath = path.join(dir, 'control.json');
const auditPath = path.join(dir, 'audit.jsonl');
const originFlag = process.argv.indexOf('--extension-origin');
const extension = originFlag >= 0 ? process.argv[originFlag + 1] : 'chrome-extension://' + 'a'.repeat(32);
assert.match(extension || '', /^chrome-extension:\/\/[a-p]{32}$/);
const env = {
  PATH: path.dirname(process.execPath) + ':/usr/bin:/bin',
  HOME: dir,
  TMPDIR: dir,
  DAYBREAK_PROFILE: 'incident-intelligence',
  DT_MCP_PROFILE: 'incident-intelligence',
  DAYBREAK_DISABLE_LOCAL_LLM: 'true',
  DT_MCP_OLLAMA_ENABLED: 'false',
  DT_MCP_DISABLE_TELEMETRY: 'true',
  DT_MCP_ENABLE_TELEMETRY: 'false',
  DAYBREAK_EXTENSION_ORIGIN: extension,
  LOG_OUTPUT: 'disabled',
  DOTENV_CONFIG_PATH: path.join(dir, 'empty.env'),
  NODE_OPTIONS: '--import=' + path.join(root, 'scripts/sprint10-1-network-guard.mjs'),
  SPRINT101_BUILD: build,
  SPRINT101_CONTROL: controlPath,
  SPRINT101_AUDIT: auditPath,
};
await fs.writeFile(env.DOTENV_CONFIG_PATH, '');
const setControl = (value) => fs.writeFile(controlPath, JSON.stringify(value));
await setControl({});
const pause = () => new Promise((r) => setTimeout(r, 50));
async function until(fn, ms = 30000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const v = await fn();
    if (v) return v;
    await pause();
  }
  throw Error('Acceptance wait timed out');
}
async function check(id, label, fn) {
  const observed = await fn();
  results.push({ id, label, status: 'PASS', observed: observed ?? 'Assertions satisfied' });
  console.log(id + ' PASS ' + label);
}
const compiled = spawnSync(
  process.execPath,
  [
    path.join(root, 'node_modules/typescript/bin/tsc'),
    '--project',
    path.join(root, 'tsconfig.reference.json'),
    '--outDir',
    build,
  ],
  { cwd: root, env: { PATH: env.PATH }, encoding: 'utf8' },
);
assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
await fs.symlink(path.join(root, 'node_modules'), path.join(build, 'node_modules'));
const require = (await import('node:module')).createRequire(import.meta.url);
const { validateInvestigationReport } = require(path.join(build, 'src/core/investigation-engine/index.js'));
const configPath = path.join(dir, 'fixture-config.json');
await fs.writeFile(
  configPath,
  JSON.stringify({
    servers: Object.fromEntries(
      ['first', 'second'].map((ns) => [
        ns,
        {
          command: process.execPath,
          args: [path.join(root, 'scripts/sprint10-1-fixture-mcp.mjs')],
          env: { ...env, SPRINT101_NAMESPACE: ns },
        },
      ]),
    ),
  }),
  { mode: 0o600 },
);
async function prepare(runtime) {
  await fs.mkdir(path.join(runtime, 'data'), { recursive: true, mode: 0o700 });
  for (const name of ['src', 'public']) await fs.symlink(path.join(gateway, name), path.join(runtime, name));
  await fs.writeFile(path.join(runtime, '.local-config.json'), JSON.stringify({ mcpConfig: configPath }), {
    mode: 0o600,
  });
}
async function stop(instance) {
  if (instance.child.exitCode !== null || instance.child.signalCode !== null) return;
  const done = new Promise((r) => instance.child.once('exit', r));
  instance.child.kill('SIGTERM');
  const timer = setTimeout(() => instance.child.kill('SIGKILL'), 5000);
  await done;
  clearTimeout(timer);
  children.delete(instance.child);
  assert.equal(instance.child.exitCode, 0, instance.output());
}
async function launch(runtime, expectFailure = false) {
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, '127.0.0.1', r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  assert.notEqual(port, 4318);
  const child = spawn(process.execPath, [path.join(gateway, 'src/server.mjs')], {
    cwd: runtime,
    env: { ...env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);
  let output = '';
  child.stdout.on('data', (b) => (output += b));
  child.stderr.on('data', (b) => (output += b));
  const i = { child, port, origin: 'http://127.0.0.1:' + port, output: () => output, runtime };
  if (expectFailure) {
    await until(() => child.exitCode !== null);
    children.delete(child);
    assert.notEqual(child.exitCode, 0);
    return i;
  }
  await until(() => {
    if (child.exitCode !== null) throw Error(output);
    return output.includes('Morning check :');
  });
  await until(async () => {
    const c = await (await fetch(i.origin + '/api/extension/context')).json();
    return !c.discovering && c.environments.length === 2;
  });
  await until(async () => !(await (await fetch(i.origin + '/api/status')).json()).progress?.running);
  return i;
}
const get = async (i, route, options = {}) => {
  const r = await fetch(i.origin + route, options);
  return { status: r.status, headers: r.headers, data: await r.json() };
};
async function post(i, route, body, origin = extension, token) {
  const csrf = token ?? (await get(i, '/api/status')).data.csrf;
  return get(i, route, {
    method: 'POST',
    headers: { 'Origin': origin, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
async function start(i, environmentId, problemId, extra = {}) {
  const r = await post(i, '/api/workbench/start', {
    kind: 'investigation',
    input: { layer: 'infra', environmentId, problemId, analysisMode: 'explain', ...extra },
  });
  assert.equal(r.status, 202, JSON.stringify(r.data));
  return until(async () => {
    const j = await get(i, '/api/workbench/' + r.data.id);
    return !['running', 'executing'].includes(j.data.status) && j.data;
  });
}
async function hashes(runtime) {
  const out = {};
  for (const name of (await fs.readdir(path.join(runtime, 'data'))).sort())
    out[name] = crypto
      .createHash('sha256')
      .update(await fs.readFile(path.join(runtime, 'data', name)))
      .digest('hex');
  return out;
}
let current;
try {
  await check('A01', 'Network guard rejects fetch and direct TCP before Gateway startup', async () => {
    const r = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import net from 'node:net'; for(const f of [()=>fetch('https://managed.example'),()=>net.connect(4318,'127.0.0.1')]){try{f();process.exit(2)}catch(e){if(!e.message.includes('network isolation'))throw e}}",
      ],
      { env, encoding: 'utf8' },
    );
    assert.equal(r.status, 0, r.stderr);
  });
  const runtime = path.join(dir, 'runtime');
  await prepare(runtime);
  current = await launch(runtime);
  const environments = (await get(current, '/api/extension/context')).data.environments;
  const first = environments.find((e) => e.url.endsWith('/first')),
    second = environments.find((e) => e.url.endsWith('/second'));
  await check('B01', 'Real Gateway startup, synthetic catalog, empty jobs, LLM disabled', async () => {
    assert.equal((await get(current, '/api/investigations')).data.jobs.length, 0);
    assert.equal((await get(current, '/api/extension/context')).data.localLlmDisabled, true);
    assert.equal((await get(current, '/api/extension/problems?environmentId=' + first.id)).data.problems.length, 22);
    assert.doesNotMatch(current.output(), /acceptance private|API_TOKEN|Bearer /);
    return { environments: 2, automaticDiscovery: true, startupRefreshAttempt: true, professionalRequests: 0 };
  });
  await check('B02', 'Every declared Web and legacy asset resolves with CSP and nosniff', async () => {
    const { paths } = await import(pathToFileURL(path.join(gateway, 'src/backend/api/static-assets.mjs')));
    for (const route of Object.keys(paths)) {
      const r = await fetch(current.origin + route);
      assert.equal(r.status, 200, route);
      assert.ok(r.headers.get('content-security-policy'));
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      await r.arrayBuffer();
    }
    return Object.keys(paths).length + ' routes';
  });
  const jobs = [];
  for (const scenario of [
    'S01',
    'S02',
    'S03',
    'S04',
    'S06',
    'S08',
    'S09',
    'S10',
    'S08-budget',
    'S08-timeout',
    'S08-malformed',
  ]) {
    await check('D-' + scenario, 'Web API -> real Gateway -> SDK fixture -> real Core -> simulated ports', async () => {
      const j = await start(current, first.id, scenario);
      jobs.push(j);
      assert.equal(j.status, 'completed');
      const report = validateInvestigationReport(j.result.problemInvestigations[0]);
      assert.equal(report.problem.id, scenario);
      assert.equal(report.environment.url, first.url);
      assert.equal(report.llm.status, 'disabled');
      assert.equal(report.explain.whyItHappened.mechanism.certainty, 'unknown');
      const expected = ['S04', 'S08', 'S09', 'S08-budget', 'S08-timeout', 'S08-malformed'].includes(scenario)
        ? 'partial'
        : 'completed';
      assert.equal(report.status, expected);
      const audit = (await fs.readFile(auditPath, 'utf8'))
        .trim()
        .split('\n')
        .map(JSON.parse)
        .findLast((a) => a.scenario === scenario);
      assert.ok(audit.reads <= (scenario === 'S08-budget' ? 7 : 48));
      if (scenario === 'S08') assert.ok(report.investigation.errors.length);
      if (scenario === 'S08-malformed') assert.equal(report.investigation.errors.length, 0);
      return {
        job: j.id,
        execution: j.status,
        report: report.status,
        evidence: report.evidence.length,
        reads: audit.reads,
        referencesValid: true,
        llm: report.llm.status,
      };
    });
  }
  const original = jobs[0];
  await check('E01', 'Synthetic refresh preserves job and independent previous snapshot', async () => {
    const j = await start(current, first.id, 'S01', { continue: true, sourceJobId: original.id, action: 'explain' });
    assert.equal(j.id, original.id);
    assert.equal(j.sessionTurns.length, 1);
    assert.deepEqual(j.initialProblemReports, original.initialProblemReports);
  });
  await check(
    'E02',
    'Expired Core-session response renews Explain exactly once over actual SDK transport',
    async () => {
      await setControl({ expire: true });
      const before = (await fs.readFile(auditPath, 'utf8')).trim().split('\n').length;
      const j = await start(current, first.id, 'S01', { continue: true, sourceJobId: original.id, action: 'explain' });
      assert.equal(j.status, 'completed');
      assert.ok(j.sessionTurns.at(-1).sessionRenewal);
      const calls = (await fs.readFile(auditPath, 'utf8'))
        .trim()
        .split('\n')
        .slice(before)
        .map(JSON.parse)
        .filter((a) => a.args);
      assert.equal(calls.length, 2);
      assert.ok(calls[0].args.investigationId);
      assert.equal(calls[1].args.investigationId, undefined);
      await setControl({});
    },
  );
  await check('E03', 'Failed refresh retains previous report; malformed MCP payload creates no report', async () => {
    const prior = (await get(current, '/api/workbench/' + original.id)).data;
    await setControl({ fail: true });
    const j = await start(current, first.id, 'S01', { continue: true, sourceJobId: original.id, action: 'explain' });
    assert.equal(j.status, 'failed');
    assert.equal(j.sessionTurns.at(-1).report, undefined);
    assert.deepEqual(j.result, prior.result);
    assert.doesNotMatch(JSON.stringify(j), /private upstream/);
    await setControl({ malformed: true });
    const bad = await start(current, first.id, 'S08');
    assert.equal(bad.status, 'failed');
    assert.equal(bad.result, null);
    await setControl({});
  });
  await check('E04', 'Problem/environment context isolation and invalid identifier rejection', async () => {
    for (const [envId, problemId] of [
      [first.id, 'S02'],
      [second.id, 'S01'],
    ]) {
      const r = await post(current, '/api/workbench/start', {
        kind: 'investigation',
        input: {
          layer: 'infra',
          environmentId: envId,
          problemId,
          continue: true,
          sourceJobId: original.id,
          action: 'explain',
        },
      });
      assert.equal(r.status, 400);
    }
    const bad = await post(current, '/api/workbench/start', {
      kind: 'investigation',
      input: { layer: 'infra', environmentId: first.id, problemId: '../bad' },
    });
    assert.equal(bad.status, 400);
    const other = await start(current, second.id, 'S01');
    assert.equal(other.result.problemInvestigations[0].environment.url, second.url);
    assert.equal(other.result.problemInvestigations[0].environmentId, second.id);
  });
  await check('G01', 'Host/Origin/CSRF/CORS and incident write/LLM actions denied', async () => {
    const hostStatus = await new Promise((resolve, reject) => {
      const req = request(current.origin + '/api/status', { headers: { Host: 'evil.invalid' } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(hostStatus, 403);
    assert.equal((await post(current, '/api/workbench/start', {}, 'http://evil.invalid')).status, 403);
    assert.equal((await post(current, '/api/workbench/start', {}, extension, 'wrong')).status, 403);
    assert.equal((await post(current, '/api/workbench/confirm', {})).status, 403);
    assert.equal((await post(current, '/api/workbench/start', { kind: 'dashboard', input: {} })).status, 403);
    assert.equal(
      (await post(current, '/api/workbench/start', { kind: 'investigation', input: { question: 'use model' } })).status,
      403,
    );
    const good = await get(current, '/api/status', { headers: { Origin: extension } });
    assert.equal(good.headers.get('access-control-allow-origin'), extension);
    const wrong = await get(current, '/api/status', { headers: { Origin: 'chrome-extension://' + 'b'.repeat(32) } });
    assert.equal(wrong.status, 403);
    const caps = (await get(current, '/api/capabilities')).data;
    for (const e of caps.environments) for (const t of e.tools) assert.equal(t.readOnly, true);
  });
  await check('B03', 'Investigation exports JSON/Markdown/HTML and legacy history routes', async () => {
    for (const fmt of ['json', 'md', 'html']) {
      const r = await fetch(current.origin + '/api/workbench/' + original.id + '/' + fmt);
      assert.equal(r.status, 200);
      assert.ok(r.headers.get('content-disposition'));
      assert.ok((await r.text()).length);
    }
    assert.equal((await get(current, '/api/history')).status, 200);
    assert.equal((await get(current, '/api/snapshot')).status, 200);
  });
  await check('F01', 'Clean stop, complete synthetic state backup, byte-identical restore', async () => {
    await stop(current);
    const before = await hashes(runtime);
    const originalJobs = JSON.parse(await fs.readFile(path.join(runtime, 'data/workbench.json')));
    const originalHistory = JSON.parse(await fs.readFile(path.join(runtime, 'data/history.json')));
    await fs.cp(path.join(runtime, 'data'), path.join(dir, 'backup/data'), { recursive: true });
    await fs.copyFile(path.join(runtime, '.local-config.json'), path.join(dir, 'backup/.local-config.json'));
    await fs.copyFile(configPath, path.join(dir, 'backup/fixture-config.json'));
    const restored = path.join(dir, 'restored');
    await prepare(restored);
    await fs.cp(path.join(dir, 'backup/data'), path.join(restored, 'data'), { recursive: true });
    assert.deepEqual(await hashes(restored), before);
    current = await launch(restored);
    const list = (await get(current, '/api/investigations')).data.jobs;
    assert.equal(list.length, 13);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(restored, 'data/workbench.json'))), originalJobs);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(restored, 'data/history.json'))), originalHistory);
    assert.equal((await get(current, '/api/history')).data.length, originalHistory.length);
    const j = (await get(current, '/api/workbench/' + original.id)).data;
    assert.equal(j.sessionTurns.length, 3);
    assert.equal(j.sessionTurns.at(-1).status, 'failed');
    assert.deepEqual(j.initialProblemReports, original.initialProblemReports);
    assert.equal((await get(current, '/api/workbench/' + original.id + '/json')).data.id, original.id);
    return {
      jobs: list.length,
      originalJob: original.id,
      hashesBeforeRestart: before,
      configIdentity: 'Stable absolute fixture-config path preserved; changing it changes catalog IDs',
    };
  });
  await check('F02', 'Corrupt synthetic JSON fails startup without overwriting; valid restore recovers', async () => {
    await stop(current);
    const restored = current.runtime;
    const file = path.join(restored, 'data/workbench.json'),
      valid = await fs.readFile(file);
    await fs.writeFile(file, '{corrupt synthetic');
    const broken = await launch(restored, true);
    assert.match(broken.output(), /JSON|invalide|Invalid|Unexpected/);
    assert.equal(await fs.readFile(file, 'utf8'), '{corrupt synthetic');
    await fs.writeFile(file, valid);
    current = await launch(restored);
    assert.equal((await get(current, '/api/investigations')).data.jobs.length, 13);
  });
  await check('F03', 'Concurrent in-process JSON writes serialize and leave no temporary files', async () => {
    const { writeJson } = await import(pathToFileURL(path.join(gateway, 'src/backend/persistence/json-store.mjs')));
    const file = path.join(dir, 'concurrent.json');
    await Promise.all(Array.from({ length: 80 }, (_, n) => writeJson(file, { n })));
    assert.equal(JSON.parse(await fs.readFile(file)).n, 79);
    assert.equal((await fs.readdir(dir)).filter((n) => n.includes('.tmp')).length, 0);
    return '80 writes, single writer process; no inter-process lock or fsync guarantee';
  });
  await check('F04', 'All three exports survive restore with identical synthetic job content', async () => {
    const saved = JSON.parse(await fs.readFile(path.join(dir, 'backup/data/workbench.json'))).find(
      (j) => j.id === original.id,
    );
    const { workbenchMarkdown, workbenchHtml } = await import(
      pathToFileURL(path.join(gateway, 'src/backend/investigations/workbench.mjs'))
    );
    const md = await fetch(current.origin + '/api/workbench/' + saved.id + '/md');
    const html = await fetch(current.origin + '/api/workbench/' + saved.id + '/html');
    assert.equal(md.status, 200);
    assert.equal(html.status, 200);
    assert.equal(await md.text(), workbenchMarkdown(saved));
    assert.equal(await html.text(), workbenchHtml(saved));
    const { approval, ...exported } = saved;
    assert.deepEqual((await get(current, '/api/workbench/' + saved.id + '/json')).data, exported);
  });
  // UI robustness seeds are deliberately invalid presentation data, never claimed as Core output.
  if (process.argv.includes('--serve')) {
    await stop(current);
    const file = path.join(current.runtime, 'data/workbench.json');
    const saved = JSON.parse(await fs.readFile(file));
    for (const kind of ['no-evidence', 'unsafe-labels', 'missing-reference']) {
      const j = structuredClone(jobs[1]);
      j.id = crypto.randomUUID();
      j.title = 'UI-' + kind;
      j.input.problemId = j.title;
      j.sessionTurns = [];
      for (const r of [j.initialProblemReports[0], j.result.problemInvestigations[0]]) {
        r.problem.id = j.title;
        r.problem.title = j.title;
        if (kind === 'no-evidence') {
          r.evidence = [];
          r.investigation = undefined;
          r.explain = undefined;
          r.findings = [];
          r.nextSteps = [];
          r.status = 'partial';
        }
        if (kind === 'unsafe-labels') {
          r.explain = undefined;
          r.problem.title = '<img src=x onerror=alert(1)>';
          r.problem.url = 'javascript:alert(1)';
          r.findings = [
            {
              title: '<script>alert(1)</script>',
              text: 'Untrusted synthetic text',
              certainty: 'observed',
              evidenceRefs: [],
            },
          ];
        }
        if (kind === 'missing-reference') {
          r.explain = undefined;
          r.findings = [
            {
              title: 'Synthetic missing reference',
              text: 'Unknown',
              certainty: 'unknown',
              evidenceRefs: ['missing-fixture'],
            },
          ];
        }
      }
      saved.push(j);
    }
    await fs.writeFile(file, JSON.stringify(saved));
    current = await launch(current.runtime);
  }
  await fs.writeFile(
    path.join(dir, 'results.json'),
    JSON.stringify(
      {
        results,
        productionRequests: 0,
        nativeChrome: false,
        realManaged: false,
        runtime: current.runtime,
        origin: current.origin,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log('ACCEPTANCE_RESULTS ' + path.join(dir, 'results.json'));
  if (process.argv.includes('--serve')) {
    console.log('BROWSER_ACCEPTANCE ' + current.origin + '/workspace');
    await until(async () => {
      try {
        await fs.access(path.join(dir, 'stop'));
        return true;
      } catch {
        return false;
      }
    }, 3600000);
  }
} catch (error) {
  await fs.writeFile(path.join(dir, 'failure.json'), JSON.stringify({ results, error: error.stack }, null, 2), {
    mode: 0o600,
  });
  console.error('ACCEPTANCE_FAILURE ' + dir, error);
  process.exitCode = 1;
} finally {
  for (const child of children)
    if (child.exitCode === null && child.signalCode === null) {
      const done = new Promise((r) => child.once('exit', r));
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
      await done;
      clearTimeout(timer);
    }
}
