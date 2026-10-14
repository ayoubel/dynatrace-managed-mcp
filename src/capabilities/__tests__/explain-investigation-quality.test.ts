import { explainProblem } from '../../core/investigation-engine/explain';
import { buildExplainReport } from '../problem-explain-report';
import { assertEvidenceReferences, InvestigationSnapshotSchemaV1 } from '../../contracts/investigation';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const main = 'SERVICE-1111111111111111',
  dep = 'SERVICE-2222222222222222',
  other = 'SERVICE-3333333333333333';
const start = 1700000100000,
  end = start + 1800000;
const names = [
  'complete',
  'dependency-slow',
  'dependency-stable',
  'deployment',
  'errors-no-traffic',
  'missing-baseline',
  'no-context',
  'sparse',
  'budget',
  'ambiguous',
  'synthetic',
  'permissions',
  'dependency-no-metrics',
  'incomplete-series',
] as const;
type Scenario = (typeof names)[number];
function fixture(scenario: Scenario) {
  const map = (data: any) => Promise.resolve(new Map([['prod', data]]));
  const contextual = ['dependency-slow', 'dependency-stable', 'dependency-no-metrics', 'budget'].includes(scenario);
  const problem: any = {
    problemId: 'quality-' + scenario,
    title: 'Service performance',
    status: 'CLOSED',
    severityLevel: 'PERFORMANCE',
    startTime: start,
    endTime: end,
    affectedEntities: [{ entityId: { id: main } }],
    evidenceDetails: { details: [], totalCount: 0 },
    impactAnalysis: { impacts: [] },
  };
  if (scenario === 'budget')
    problem.evidenceDetails = {
      details: Array.from({ length: 3 }, (_, i) => ({ evidenceType: 'EVENT', eventId: 'published-' + i })),
      totalCount: 3,
    };
  const entity = {
    entityId: main,
    displayName: 'checkout',
    fromRelationships: {
      calls: contextual
        ? [{ id: dep, type: 'SERVICE' }, ...(scenario === 'budget' ? [{ id: other, type: 'SERVICE' }] : [])]
        : [],
    },
    toRelationships: { calls: [] },
  };
  const event = (synthetic = false) => ({
    eventId: 'deployment',
    eventType: 'CUSTOM_DEPLOYMENT',
    title: synthetic ? 'DAYBREAK TEST deployment' : 'Deployment published',
    startTime: start - 600000,
    endTime: start - 300000,
    entityId: { entityId: { id: main, type: 'SERVICE' } },
    properties: synthetic ? [{ key: 'daybreak.test', value: 'true' }] : [],
  });
  const dependencies: any = {
    investigationOwner: 'quality',
    ...(scenario === 'budget' ? { investigationLimits: { maxApiCalls: 18 } } : {}),
    authClientManager: {
      validAliases: ['prod'],
      getBaseUrl: () => 'https://managed.example/e/prod',
      makeRequests: jest.fn(),
    },
    tokenScopesFor: () =>
      scenario === 'permissions'
        ? ['problems.read']
        : ['problems.read', 'entities.read', 'metrics.read', 'events.read'],
    problemsClient: { getProblemDetails: () => map(problem) },
    entitiesClient: { getEntityDetails: () => map(entity) },
    eventsClient: {
      getEventDetails: () => map(event()),
      queryEvents: () =>
        map({
          events: ['deployment', 'synthetic'].includes(scenario) ? [event(scenario === 'synthetic')] : [],
          totalCount: ['deployment', 'synthetic'].includes(scenario) ? 1 : 0,
        }),
    },
    logsClient: { queryLogs: jest.fn() },
    metricsClient: {
      listAvailableMetrics: jest.fn(),
      getMetricDetails: (id: string) =>
        map(
          scenario === 'sparse'
            ? {}
            : {
                metricId: id,
                unit: id.includes('time') ? 'MicroSecond' : id.includes('Count') ? 'Count' : 'Percent',
                aggregationTypes: ['avg', 'value'],
                dimensionDefinitions: [{ key: 'dt.entity.service' }],
              },
        ),
      queryMetrics: (p: any) => {
        const id = p.entitySelector.match(/SERVICE-[A-F0-9]{16}/)[0],
          incident = Number(p.from) >= start;
        const count = (Number(p.to) - Number(p.from)) / 300000;
        let value = p.metricSelector.includes('time')
          ? incident
            ? 200
            : 100
          : p.metricSelector.includes('Count')
            ? 10
            : scenario === 'errors-no-traffic'
              ? incident
                ? 5
                : 1
              : 0;
        if (id === dep && scenario === 'dependency-stable') value = 100;
        const row = {
          dimensionMap: { 'dt.entity.service': id },
          timestamps: Array.from({ length: count }, (_, i) => Number(p.from) + (i + 1) * 300000),
          values: Array(count).fill(value),
        };
        if (scenario === 'incomplete-series') row.values[1] = null;
        const absent =
          (scenario === 'missing-baseline' && !incident) || (scenario === 'dependency-no-metrics' && id === dep);
        return map({
          resolution: '5m',
          result: absent
            ? []
            : [
                {
                  metricId: p.metricSelector,
                  data: scenario === 'ambiguous' && p.metricSelector.includes('time') ? [row, { ...row }] : [row],
                },
              ],
        });
      },
    },
  };
  return { dependencies, problem };
}
const examples: any = {};
test.each(names)('investigation quality, deterministic scenario %s', async (scenario) => {
  const { dependencies } = fixture(scenario);
  const report: any = await explainProblem(
    dependencies,
    { environment_alias: 'prod', problemId: 'quality-' + scenario },
    0,
  );
  const explain = report.explain,
    why = explain.whyItHappened,
    checks = explain.remediation.immediate;
  expect(explain.version).toBe(1);
  expect(InvestigationSnapshotSchemaV1.safeParse(report.investigation).success).toBe(true);
  expect(() => assertEvidenceReferences(report, new Set<string>(report.evidence.map((e: any) => e.id)))).not.toThrow();
  expect(report.cause.status).toBe('unknown');
  expect(why.mechanism.certainty).toBe('unknown');
  expect(explain.remediation.shortTerm).toEqual([]);
  expect(explain.remediation.prevention).toEqual([]);
  expect(JSON.stringify(checks)).not.toMatch(/redémarrer|rollback|purge|corriger la configuration/i);
  for (const item of [...why.observations, ...why.hypotheses, ...checks]) {
    expect(item.evidenceRefs.length).toBeGreaterThan(0);
    expect(item.text.length).toBeGreaterThan(20);
  }
  for (const item of why.observations) {
    expect(item.certainty).toBe('observed');
    expect(item.text).toContain('Limites');
  }
  for (const h of why.hypotheses) {
    expect(h.certainty).toBe('hypothesis');
    expect(h.text).toContain('Manque');
    expect(
      checks.some((c: any) => c.title === h.title && h.evidenceRefs.every((r: string) => c.evidenceRefs.includes(r))),
    ).toBe(true);
  }
  expect(new Set(checks.map((c: any) => c.title + '|' + c.text)).size).toBe(checks.length);
  if (['complete', 'no-context'].includes(scenario)) {
    expect(why.comparisons).toHaveLength(3);
    expect(why.hypotheses).toEqual([]);
    expect(checks.some((c: any) => c.text.includes('traces'))).toBe(true);
  }
  if (scenario === 'dependency-slow') {
    expect(why.observations.filter((o:any)=>o.title==='builtin:service.response.time')).toHaveLength(2);
    expect(why.observations.some((o:any)=>o.title.includes('Latence de dépendance'))).toBe(false);
    expect(why.hypotheses).toHaveLength(1);
    expect(checks[0].text).toContain(main + ' → ' + dep);
    expect(checks[0].text).toContain('spans');
  }
  if (scenario === 'dependency-stable') {
    expect(why.hypotheses).toEqual([]);
    expect(why.comparisons.find((c: any) => c.entityId === dep).baseline).toEqual(
      why.comparisons.find((c: any) => c.entityId === dep).incident,
    );
  }
  if (scenario === 'deployment') {
    expect(why.hypotheses).toHaveLength(1);
    expect(checks[0].text).toContain('version déployée');
  }
  if (scenario === 'errors-no-traffic') {
    expect(why.hypotheses.some((h: any) => h.title === 'Erreurs augmentées sans hausse du volume')).toBe(true);
    expect(checks.some((c: any) => c.text.includes('exceptions'))).toBe(true);
  }
  if (['missing-baseline', 'ambiguous', 'incomplete-series'].includes(scenario)) {
    expect(report.status).toBe('partial');
    expect(checks.some((c: any) => c.title === 'Compléter la comparaison temporelle')).toBe(true);
    if (scenario === 'missing-baseline') expect(why.comparisons).toEqual([]);
    if (scenario === 'ambiguous') expect(why.comparisons.some((c: any) => c.metricId.includes('time'))).toBe(false);
  }
  if (scenario === 'sparse') {
    expect(report.status).toBe('partial');
    expect(why.comparisons).toEqual([]);
    expect(why.hypotheses).toEqual([]);
    expect(checks).toHaveLength(1);
    expect(checks[0].title).toBe('Examiner les preuves publiées du problème');
  }
  if (scenario === 'budget') {
    expect(report.status).toBe('partial');
    expect(report.trace.some((t: any) => t.reason === 'Budget de collecte atteint')).toBe(true);
    expect(checks.some((c: any) => c.title === 'Compléter les lectures interrompues')).toBe(true);
  }
  if (scenario === 'synthetic') {
    expect(why.hypotheses).toEqual([]);
    expect(why.observations.some((o: any) => o.title === 'Déclaration synthétique ou de test')).toBe(true);
  }
  if (scenario === 'permissions') {
    expect(report.status).toBe('partial');
    expect(why.hypotheses).toEqual([]);
    expect(checks.some((c: any) => c.title === 'Vérifier les permissions de lecture')).toBe(true);
  }
  if (scenario === 'dependency-no-metrics') {
    expect(report.status).toBe('partial');
    expect(why.hypotheses).toEqual([]);
    expect(checks.some((c: any) => c.text.includes(dep) && c.title === 'Mesures manquantes de la dépendance')).toBe(
      true,
    );
  }
  if (['complete', 'dependency-slow', 'missing-baseline'].includes(scenario))
    examples[scenario] = {
      nature: 'simulated deterministic fixture',
      status: report.status,
      problem: fixture(scenario).problem,
      report,
      explain,
      evidence: report.evidence,
    };
});

test('repeated rendering is deterministic and does not change stored report facts or status', () => {
  const report: any = {
    status: 'partial',
    evidence: [{ id: 'P', kind: 'problem' }],
    findings: [],
    limitations: ['Baseline absente'],
    scope: {},
    collectedAt: '2026-10-14T08:00:00.000Z',
  };
  const problem = { title: 'Few proofs', affectedEntities: [], severityLevel: 'PERFORMANCE' };
  const before = JSON.stringify(report);
  expect(buildExplainReport(problem, report)).toEqual(buildExplainReport(problem, report));
  expect(JSON.stringify(report)).toBe(before);
});

const capturePath = resolve(__dirname, '../../../validation/sprint-03-5/initial-job.json');
(existsSync(capturePath) ? test : test.skip)(
  'real Managed sparse capture reuses evidence with no live calls or invented cause',
  () => {
    const job = JSON.parse(readFileSync(capturePath, 'utf8'));
    const report = job.result.problemInvestigations[0];
    const before = JSON.stringify(report);
    const raw = report.evidence.find((e: any) => e.kind === 'problem');
    // Rebuild the published problem envelope from the preserved report and evidence.
    const problem = {
      ...report.problem,
      severityLevel: report.explain.whatHappened.severity,
      affectedEntities: report.explain.impact.affectedEntities.map((entityId: string) => ({ entityId })),
      impactedEntities: report.explain.impact.impactedEntities.map((entityId: string) => ({ entityId })),
    };
    const explain = buildExplainReport(problem, report);
    expect(raw).toBeDefined();
    expect(report.status).toBe('partial');
    expect(explain.plan).toBe('disk');
    expect(explain.whyItHappened.comparisons).toEqual([]);
    expect(explain.remediation.shortTerm).toEqual([]);
    expect(explain.remediation.immediate.length).toBeGreaterThan(0);
    expect(JSON.stringify(report)).toBe(before);
    expect(() =>
      assertEvidenceReferences(explain, new Set<string>(report.evidence.map((e: any) => e.id))),
    ).not.toThrow();
    examples['managed-sparse'] = {
      nature: 'real Managed capture, offline replay; no new live validation',
      status: report.status,
      explain,
    };
  },
);

afterAll(() => {
  if (process.env.DAYBREAK_QUALITY_EXAMPLES) {
    mkdirSync(process.env.DAYBREAK_QUALITY_EXAMPLES, { recursive: true, mode: 0o700 });
    writeFileSync(resolve(process.env.DAYBREAK_QUALITY_EXAMPLES, 'examples.json'), JSON.stringify(examples, null, 2), {
      mode: 0o600,
    });
  }
});
