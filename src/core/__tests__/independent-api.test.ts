import {
  executeInvestigation,
  explainProblem,
  validateInvestigationReport,
  ExplainReportSchemaV1,
} from '../investigation-engine';
import { corpus, scenarioPorts } from './fixtures/diagnostic-ports';
import { explainManagedProblem } from '../../capabilities/problem-explain';
import { investigationDependencies } from '../../adapters/mcp/investigation-dependencies';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root = path.resolve(__dirname, '../../..');
const ports = (id: string) => scenarioPorts(corpus.scenarios.find((s) => s.id === id)!);
beforeEach(() => jest.useFakeTimers({ now: 1791971700000, doNotFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => jest.useRealTimers());

test('public runtime graph excludes transports, configuration and static cycles', () => {
  const graph = new Map<string, string[]>();
  const visit = (file: string) => {
    if (graph.has(file)) return;
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const edges: string[] = [];
    graph.set(file, edges);
    for (const n of source.statements) {
      if (
        !(ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) ||
        !n.moduleSpecifier ||
        !ts.isStringLiteral(n.moduleSpecifier)
      )
        continue;
      if ((ts.isImportDeclaration(n) && n.importClause?.isTypeOnly) || (ts.isExportDeclaration(n) && n.isTypeOnly))
        continue;
      const spec = n.moduleSpecifier.text;
      expect(spec).not.toMatch(
        /modelcontextprotocol|authentication|adapters|tools[\/]|local-investigation-model|telemetry|logger|config-loader|sre-morning-check|browser-extension|^(node:)?(http|https|net|tls|fs)$/,
      );
      if (!spec.startsWith('.')) {
        expect(['zod', 'node:crypto', 'node:util']).toContain(spec);
        continue;
      }
      const base = path.resolve(path.dirname(file), spec);
      const resolved = [base + '.ts', path.join(base, 'index.ts')].find(existsSync);
      expect(resolved).toBeDefined();
      edges.push(resolved!);
      visit(resolved!);
    }
  };
  const entry = path.join(root, 'src/core/investigation-engine/index.ts');
  visit(entry);
  const active = new Set<string>(),
    done = new Set<string>();
  const acyclic = (file: string) => {
    expect(active.has(file)).toBe(false);
    if (done.has(file)) return;
    active.add(file);
    for (const next of graph.get(file)!) acyclic(next);
    active.delete(file);
    done.add(file);
  };
  acyclic(entry);
  expect([...graph.keys()].some((p) => p.endsWith('/service-slowdown.ts'))).toBe(true);
});

test('cold Node reference consumer runs all 22 fixtures with transport/model/fs imports and import-time timers blocked', () => {
  jest.useRealTimers();
  const run = spawnSync(process.execPath, [path.join(root, 'scripts/run-reference-client.mjs'), '--all', '--json'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
  });
  if (run.status !== 0) throw Error(run.stdout + run.stderr);
  expect(run.status).toBe(0);
  const rows = JSON.parse(run.stdout);
  expect(rows).toHaveLength(22);
  for (const row of rows) expect(row).toMatchObject({ referencesValid: true, llm: 'disabled', mechanism: 'unknown' });
  expect(rows.find((r: any) => r.scenario === 'S01').comparisons[0]).toMatchObject({
    baseline: 100,
    incident: 300,
    unit: 'ms',
  });
  expect(rows.find((r: any) => r.scenario === 'S08-budget')).toMatchObject({ status: 'partial', reads: 7 });
}, 30000);

test.each(['S01', 'S02', 'S03', 'S04', 'S06', 'S08', 'S09', 'S10'])(
  'public API executes %s with the existing contracts and preserved proofs',
  async (id) => {
    const { deps, problem, reads } = ports(id);
    const result = await executeInvestigation(
      deps,
      { environment_alias: 'prod', problemId: problem.problemId },
      { paceMs: 0 },
    );
    expect(result.status).toBe(['S04', 'S08', 'S09'].includes(id) ? 'partial' : 'completed');
    if (result.status === 'error') throw Error(result.error.code);
    expect(validateInvestigationReport(result.report)).toBe(result.report);
    expect(ExplainReportSchemaV1.safeParse(result.report.explain).success).toBe(true);
    expect(result.report.evidence.some((e) => e.kind === 'problem')).toBe(true);
    expect(reads.length).toBeLessThanOrEqual(48);
    expect(result.report.llm.status).toBe('disabled');
    expect(result.report.explain.whyItHappened.mechanism.certainty).toBe('unknown');
  },
);

test.each(['S01-unit-boundary', 'S03-error-invalid-contract', 'S03-error-invalid-values'])(
  'public entry preserves %s (D08-01/02/03)',
  async (id) => {
    const { deps, problem } = ports(id);
    const r = await executeInvestigation(
      deps,
      { environment_alias: 'prod', problemId: problem.problemId },
      { paceMs: 0 },
    );
    if (r.status === 'error') throw Error(r.error.code);
    const why = r.report.explain.whyItHappened;
    if (id === 'S01-unit-boundary')
      expect(
        r.report.explain.remediation.immediate.some((c) => c.title === 'Localiser le temps passé dans le service'),
      ).toBe(true);
    else {
      expect(r.status).toBe('partial');
      expect(why.comparisons.some((c) => c.metricId === 'builtin:service.errors.server.rate')).toBe(false);
    }
  },
);

test('explicit call budget overrides dependency defaults, keeps acquired evidence and does not mutate ports', async () => {
  const { deps, problem, reads } = ports('S01');
  const r = await executeInvestigation(
    deps,
    { environment_alias: 'prod', problemId: problem.problemId },
    { paceMs: 0, limits: { maxApiCalls: 7 } },
  );
  expect(r.status).toBe('partial');
  expect(reads).toHaveLength(7);
  expect(deps.investigationLimits).toBeUndefined();
  if (r.status === 'error') throw Error();
  expect(r.report.explain.whyItHappened.comparisons.some((c) => c.metricId === 'builtin:service.response.time')).toBe(
    true,
  );
});

test('normalization limitations stay distinct from collection failures', async () => {
  for (const id of ['S08', 'S08-malformed']) {
    const { deps, problem } = ports(id);
    const r = await executeInvestigation(
      deps,
      { environment_alias: 'prod', problemId: problem.problemId },
      { paceMs: 0 },
    );
    if (r.status === 'error') throw Error();
    expect(r.status).toBe('partial');
    expect(r.report.investigation.errors.length > 0).toBe(id === 'S08');
    expect(r.report.limitations.some((l) => l.includes('Série incident absente ou ambiguë'))).toBe(true);
    expect(JSON.stringify(r)).not.toContain('fixture private detail');
  }
});

test('invalid requests and limits fail before collection; fatal reads return a sanitized error', async () => {
  const { deps, problem, reads } = ports('S01');
  for (const [input, options] of [
    [{ environment_alias: 'prod', problemId: 'bad;id' }, {}],
    [{ environment_alias: 'prod', problemId: problem.problemId }, { limits: { maxApiCalls: 0 } }],
    [{ environment_alias: 'prod', problemId: problem.problemId }, { paceMs: NaN }],
  ] as any[]) {
    expect(await executeInvestigation(deps, input, options)).toMatchObject({
      status: 'error',
      error: { code: 'invalid_input' },
    });
  }
  expect(reads).toHaveLength(0);
  deps.problemsClient.getProblemDetails = async () => {
    throw Error('private upstream credential');
  };
  const failed = await executeInvestigation(
    deps,
    { environment_alias: 'prod', problemId: problem.problemId },
    { paceMs: 0 },
  );
  expect(failed).toMatchObject({ status: 'error', error: { code: 'execution_failed' } });
  expect(JSON.stringify(failed)).not.toContain('credential');
  expect(failed).not.toHaveProperty('report');
});

test('contract validation rejects broken references, duplicate IDs, divergent provenance and missing Explain sections', async () => {
  const { deps, problem } = ports('S01');
  const report = await explainProblem(deps, { environment_alias: 'prod', problemId: problem.problemId }, 0);
  const mutations = [
    (r: any) => r.explain.whyItHappened.mechanism.evidenceRefs.push('missing'),
    (r: any) => r.evidence.push(r.evidence[0]),
    (r: any) => (r.evidence[0].provenance.type = 'other'),
    (r: any) => delete r.explain.impact,
  ];
  for (const mutate of mutations) {
    const broken = structuredClone(report);
    mutate(broken);
    expect(() => validateInvestigationReport(broken)).toThrow('contract validation failed');
  }
});

test.each(['S01', 'S08', 'S08-budget'])(
  'MCP adapter returns the identical legacy report for %s including limits',
  async (id) => {
    const a = ports(id),
      b = ports(id);
    const ctx: any = {
      ...b.deps,
      httpMode: true,
      tool: () => {
        throw Error('No registration needed');
      },
    };
    expect(investigationDependencies(ctx).investigationLimits).toEqual(b.deps.investigationLimits);
    const direct = await explainProblem(a.deps, { environment_alias: 'prod', problemId: a.problem.problemId }, 0);
    const adapted = await explainManagedProblem(ctx, { environment_alias: 'prod', problemId: b.problem.problemId }, 0);
    const normalize = (r: any) => ({
      ...r,
      investigationId: 'id',
      investigation: { ...r.investigation, investigationId: 'id' },
    });
    expect(normalize(adapted)).toEqual(normalize(direct));
  },
);

test('sessions require only explicit owner/environment/problem boundaries, never a MCP session', async () => {
  const { deps, problem } = ports('S01');
  const args = { environment_alias: 'prod', problemId: problem.problemId };
  const first = await explainProblem(deps, args, 0);
  expect((await explainProblem(deps, { ...args, investigationId: first.investigationId }, 0)).investigationId).toBe(
    first.investigationId,
  );
  await expect(
    explainProblem({ ...deps, investigationOwner: 'other' }, { ...args, investigationId: first.investigationId }, 0),
  ).rejects.toThrow('unavailable');
  await expect(
    explainProblem(deps, { ...args, problemId: 'other', investigationId: first.investigationId }, 0),
  ).rejects.toThrow('does not match');
});
