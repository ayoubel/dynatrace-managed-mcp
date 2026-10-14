import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Existing Jest/MCP tests, isolated compiled runtime. Never replaces the active dist.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'daybreak-sprint08-'));
fs.chmodSync(temp, 0o700);
const gateway = path.resolve(root, '../sre-morning-check');
const extension = path.resolve(root, '../daybreak-browser-extension');
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('DT_') && !key.startsWith('DAYBREAK_')),
);
Object.assign(env, {
  DT_MCP_DISABLE_TELEMETRY: 'true',
  DT_MCP_ENABLE_TELEMETRY: 'false',
  DT_MCP_OLLAMA_ENABLED: 'false',
  LOG_OUTPUT: 'disabled',
  DOTENV_CONFIG_PATH: path.join(temp, 'empty.env'),
});
fs.writeFileSync(env.DOTENV_CONFIG_PATH, '');
function fingerprints() {
  const files = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else files.push(p);
    }
  }
  for (const dir of [path.join(root, 'dist'), path.join(root, 'poc'), path.join(gateway, 'data')]) walk(dir);
  for (const p of [path.join(root, '.env'), path.join(gateway, '.local-config.json')])
    if (fs.existsSync(p)) files.push(p);
  return Object.fromEntries(
    files.sort().map((p) => [p, crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]),
  );
}
const before = fingerprints();
const results = {};
function run(label, args, cwd) {
  const r = spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  fs.writeFileSync(path.join(temp, label + '.log'), (r.stdout || '') + (r.stderr || ''), { mode: 0o600 });
  results[label] = { exitCode: r.status, error: r.error?.message };
  console.log(label + ': ' + (r.status === 0 ? 'PASS' : 'FAIL'));
  if (r.status !== 0) console.log((r.stderr || r.stdout || '').slice(-3500));
  return r.status === 0;
}
for (const name of ['node_modules', 'src', 'tsconfig.json', 'tsconfig.test.json'])
  fs.symlinkSync(path.join(root, name), path.join(temp, name));
fs.copyFileSync(path.join(root, 'package.json'), path.join(temp, 'package.json'));
const compiled = run(
  'typescript',
  [
    path.join(root, 'node_modules/typescript/bin/tsc'),
    '--project',
    path.join(root, 'tsconfig.json'),
    '--outDir',
    path.join(temp, 'dist'),
  ],
  temp,
);
if (compiled) {
  run(
    'engine',
    [
      path.join(root, 'node_modules/jest/bin/jest.js'),
      '--config',
      path.join(root, 'jest.config.js'),
      '--runInBand',
      '--forceExit',
      '--json',
      '--outputFile',
      path.join(temp, 'engine-results.json'),
    ],
    temp,
  );
  if (fs.existsSync(path.join(temp, 'engine-results.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(temp, 'engine-results.json')));
    results.engine = {
      ...results.engine,
      passed: j.numPassedTests,
      failed: j.numFailedTests,
      skipped: j.numPendingTests,
      passedSuites: j.numPassedTestSuites,
      skippedSuites: j.numPendingTestSuites,
    };
    results.corpus = j.testResults
      .find((t) => t.name.endsWith('/diagnostic-corpus.test.ts'))
      ?.assertionResults.map((t) => ({ name: t.fullName, status: t.status }));
  }
}
for (const [label, cwd] of [
  ['gateway', gateway],
  ['extension', extension],
]) {
  if (!fs.existsSync(cwd)) {
    results[label] = { notExecuted: 'Sibling repository absent' };
    continue;
  }
  run(
    label,
    [
      '--test',
      ...fs
        .readdirSync(path.join(cwd, 'test'))
        .filter((n) => n.endsWith('.test.mjs'))
        .sort()
        .map((n) => path.join(cwd, 'test', n)),
    ],
    cwd,
  );
  const log = fs.readFileSync(path.join(temp, label + '.log'), 'utf8');
  for (const key of ['pass', 'fail', 'skipped'])
    results[label][key] = Number(log.match(new RegExp('(?:#|ℹ) ' + key + ' ([0-9]+)'))?.[1] ?? NaN);
}
results.preservation = {
  unchanged: JSON.stringify(before) === JSON.stringify(fingerprints()),
  files: Object.keys(before).length,
  productionRequests: 0,
};
fs.writeFileSync(path.join(temp, 'summary.json'), JSON.stringify(results, null, 2), { mode: 0o600 });
console.log(JSON.stringify(results, null, 2));
console.log('Private isolated logs: ' + temp);
if (
  !compiled ||
  Object.values(results).some((r) => r?.exitCode !== undefined && r.exitCode !== 0) ||
  !results.preservation.unchanged
)
  process.exitCode = 1;
