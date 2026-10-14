import { explainProblem } from '../investigation-engine/explain';
import { buildExplainReport } from '../../capabilities/problem-explain-report';
import { serviceCollectionLimits } from '../investigation-engine/collection-limits';
import { InvestigationSnapshotSchemaV1, assertEvidenceReferences } from '../../contracts/investigation';
import { mkdirSync, writeFileSync } from 'node:fs';

const main = 'SERVICE-1111111111111111',
  a = 'SERVICE-2222222222222222',
  b = 'SERVICE-3333333333333333',
  c = 'SERVICE-4444444444444444';
const host = 'HOST-5555555555555555',
  request = 'SERVICE_METHOD-6666666666666666';
const start = 1700000100000,
  end = start + 1800000;
const scenarios = [
  'stable',
  'slow',
  'multiple',
  'no-dependency-metrics',
  'deployment-before',
  'deployment-after',
  'errors',
  'traffic-only',
  'endpoint',
  'database',
  'infrastructure',
  'no-traces',
  'missing-baseline',
  'ambiguous',
  'permissions',
  'budget',
  'synthetic',
  'no-evidence',
  'contradictory-time',
  'tail',
] as const;
type Scenario = (typeof scenarios)[number];
function fixture(scenario: Scenario) {
  const map = (x: any) => Promise.resolve(new Map([['prod', x]]));
  const calls: any[] = ['stable', 'slow', 'multiple', 'no-dependency-metrics', 'database'].includes(scenario)
    ? [{ id: a, type: 'SERVICE' }]
    : [];
  if (scenario === 'multiple') calls.push({ id: b, type: 'SERVICE' }, { id: c, type: 'SERVICE' });
  const problem = {
    problemId: 'deep-' + scenario,
    title: 'Synthetic fixture only',
    status: 'CLOSED',
    severityLevel: 'PERFORMANCE',
    startTime: start,
    endTime: end,
    affectedEntities: [{ entityId: { id: main } }],
    impactedEntities: scenario === 'multiple' ? [{ entityId: { id: c } }] : [],
    evidenceDetails: { details: [], totalCount: 0 },
    impactAnalysis: { impacts: [] },
  };
  const entity = {
    entityId: main,
    displayName: 'fixture',
    fromRelationships: {
      calls,
      ...(scenario === 'infrastructure' ? { runsOnHost: [{ id: host, type: 'HOST' }] } : {}),
    },
    toRelationships: { calls: [{ id: b, type: 'SERVICE' }] },
  };
  const metricsCalls: any[] = [],
    reads: string[] = [];
  const deps: any = {
    investigationOwner: 'deep-fixture',
    ...(scenario === 'budget' ? { investigationLimits: { maxApiCalls: 12 } } : {}),
    tokenScopesFor: () =>
      scenario === 'permissions'
        ? ['problems.read', 'entities.read']
        : ['problems.read', 'entities.read', 'metrics.read', 'events.read'],
    authClientManager: {
      validAliases: ['prod'],
      getBaseUrl: () => 'https://managed.example/e/prod',
      makeRequests: jest.fn((endpoint: string) => {
        reads.push(endpoint);
        return map({
          entities:
            scenario === 'endpoint'
              ? [
                  {
                    entityId: request,
                    fromRelationships: { isServiceMethodOfService: [{ id: main, type: 'SERVICE' }] },
                  },
                ]
              : [],
          totalCount: scenario === 'endpoint' ? 1 : 0,
        });
      }),
    },
    problemsClient: {
      getProblemDetails: () => {
        reads.push('problem');
        return map(problem);
      },
    },
    entitiesClient: {
      getEntityDetails: jest.fn((id: string) => {
        reads.push('entity:' + id);
        return map(
          id === main
            ? entity
            : {
                entityId: id,
                properties: {
                  serviceType: scenario === 'database' ? 'DATABASE' : 'WEB_SERVICE',
                  databaseVendor: 'synthetic-vendor',
                },
                fromRelationships: {},
                toRelationships: {},
              },
        );
      }),
    },
    eventsClient: {
      getEventDetails: jest.fn(),
      queryEvents: (params: any) => {
        reads.push('events');
        const id = params.entitySelector.match(/SERVICE-[A-F0-9]{16}/)[0];
        const hasEvent =
          id === main &&
          ['deployment-before', 'deployment-after', 'synthetic', 'contradictory-time'].includes(scenario);
        return map({
          events: hasEvent
            ? [
                {
                  eventId: 'fixture-change',
                  eventType: 'CUSTOM_DEPLOYMENT',
                  title: scenario === 'synthetic' ? 'DAYBREAK TEST deployment' : 'Published change',
                  startTime: scenario === 'deployment-after' ? end + 300000 : start - 300000,
                  endTime:
                    scenario === 'contradictory-time'
                      ? start - 600000
                      : scenario === 'deployment-after'
                        ? end + 600000
                        : start - 100000,
                  entityId: { entityId: { id, type: 'SERVICE' } },
                  properties: scenario === 'synthetic' ? [{ key: 'daybreak.test', value: 'true' }] : [],
                },
              ]
            : [],
          totalCount: hasEvent ? 1 : 0,
        });
      },
    },
    logsClient: { queryLogs: jest.fn() },
    metricsClient: {
      listAvailableMetrics: jest.fn(),
      getMetricDetails: jest.fn((id: string) => {
        reads.push('contract:' + id);
        if (scenario === 'no-evidence') return map({});
        return map({
          metricId: id,
          unit:
            id.includes('time') || id.includes('response')
              ? 'MicroSecond'
              : id.includes('Count') || id.includes('count')
                ? 'Count'
                : 'Percent',
          aggregationTypes: ['avg', 'value', 'percentile'],
          dimensionDefinitions: [
            {
              key: id.includes('keyRequest')
                ? 'dt.entity.service_method'
                : id.includes('host.')
                  ? 'dt.entity.host'
                  : 'dt.entity.service',
            },
          ],
        });
      }),
      queryMetrics: jest.fn((params: any) => {
        reads.push('metrics');
        metricsCalls.push(params);
        const id = params.entitySelector.match(/(?:SERVICE_METHOD|SERVICE|HOST)-[A-F0-9]{16}/)[0];
        const incident = Number(params.from) >= start;
        if ((scenario === 'missing-baseline' && !incident) || (scenario === 'no-dependency-metrics' && id === a))
          return map({ resolution: '5m', result: [{ metricId: params.metricSelector, data: [] }] });
        let value = 100;
        if (params.metricSelector.includes('time') || params.metricSelector.includes('response')) {
          const increase =
            id === main ? scenario !== 'traffic-only' : id === a ? scenario !== 'stable' : id === b ? false : true;
          value = incident && increase ? 200 : 100;
          if (params.metricSelector.includes('percentile')) value *= 3;
        } else if (params.metricSelector.includes('Count') || params.metricSelector.includes('count'))
          value = incident && scenario === 'traffic-only' ? 200 : 100;
        else if (params.metricSelector.includes('host.')) value = incident ? 60 : 20;
        else value = incident && scenario === 'errors' && id === main ? 5 : 1;
        const count = (Number(params.to) - Number(params.from)) / 300000;
        const dimension = id.startsWith('HOST')
          ? 'dt.entity.host'
          : id.startsWith('SERVICE_METHOD')
            ? 'dt.entity.service_method'
            : 'dt.entity.service';
        const series = {
          dimensionMap: { [dimension]: id },
          timestamps: Array.from({ length: count }, (_, i) => Number(params.from) + (i + 1) * 300000),
          values: Array(count).fill(value),
        };
        return map({
          resolution: '5m',
          result: [
            {
              metricId: params.metricSelector,
              data:
                scenario === 'ambiguous' && params.metricSelector.includes('time')
                  ? [series, structuredClone(series)]
                  : [series],
            },
          ],
        });
      }),
    },
  };
  return { deps, problem, entity, reads, metricsCalls };
}
const results: Record<string, any> = {};
test.each(scenarios)('deep investigation %s preserves exact proof contracts and cautious checks', async (scenario) => {
  const { deps, problem, reads } = fixture(scenario);
  const report = await explainProblem(deps, { environment_alias: 'prod', problemId: problem.problemId }, 0);
  results[scenario] = { nature: 'synthetic-fixture', problem, report };
  expect(InvestigationSnapshotSchemaV1.safeParse(report.investigation).success).toBe(true);
  assertEvidenceReferences(report, new Set(report.evidence.map((e: any) => e.id)));
  expect(new Set(report.evidence.map((e: any) => e.id)).size).toBe(report.evidence.length);
  expect(report.diagnosis.causalMechanism).toBe('unknown');
  expect(report.explain.version).toBe(1);
  expect(report.explain.whyItHappened.mechanism.certainty).toBe('unknown');
  expect(reads.length).toBeLessThanOrEqual(scenario === 'budget' ? 12 : 48);
  for (const proof of report.evidence) {
    expect(proof.provenance.source?.method).toBe('GET');
    if (proof.kind === 'series') {
      expect(proof.provenance.source.endpoint).toBe('/api/v2/metrics/query');
      expect(proof.provenance.measurement.unit).toBe(proof.unit);
      expect(proof.provenance.timeRange).toEqual({ from: proof.from, to: proof.to });
    }
  }
  const why = report.explain.whyItHappened,
    checks = report.explain.remediation.immediate;
  for (const h of why.hypotheses) expect(checks.some((v: any) => v.title === h.title)).toBe(true);
  expect(report.explain.remediation.shortTerm).toEqual([]);
  expect(report.explain.remediation.prevention).toEqual([]);
  const dependencyLeads = why.hypotheses.filter(
    (h: any) => h.title === 'Latence également augmentée sur la dépendance',
  );
  if (scenario === 'stable') expect(dependencyLeads).toHaveLength(0);
  if (['slow', 'database'].includes(scenario)) expect(dependencyLeads).toHaveLength(1);
  if (scenario === 'multiple') {
    expect(report.playbook.context.inspectedDependencies).toEqual([c, a]);
    expect(report.playbook.context.dependencies.find((d: any) => d.entityId === b).direction).toBe('unchanged');
    expect(
      deps.metricsClient.getMetricDetails.mock.calls.filter(
        (args: any[]) => args[0] === 'builtin:service.errors.server.rate',
      ),
    ).toHaveLength(1);
  }
  if (scenario === 'no-dependency-metrics') {
    expect(dependencyLeads).toHaveLength(0);
    expect(checks.some((v: any) => v.title === 'Mesures manquantes de la dépendance')).toBe(true);
  }
  if (scenario === 'deployment-before')
    expect(why.hypotheses.some((h: any) => h.title.includes('Changement publié'))).toBe(true);
  if (scenario === 'deployment-after') {
    expect(why.hypotheses.some((h: any) => h.title.includes('Changement publié'))).toBe(false);
    expect(why.observations.some((o: any) => o.text.includes('suit la fenêtre'))).toBe(true);
  }
  if (scenario === 'errors') expect(why.hypotheses.some((h: any) => h.title.includes('Erreurs augmentées'))).toBe(true);
  if (scenario === 'traffic-only') {
    expect(checks.some((h: any) => h.title === 'Localiser le temps passé dans le service')).toBe(false);
    expect(why.hypotheses).toHaveLength(0);
  }
  if (scenario === 'endpoint') {
    expect(why.hypotheses.some((h: any) => h.title === 'Key request à examiner')).toBe(true);
    expect(why.comparisons.filter((c: any) => c.entityId === request)).toHaveLength(3);
    expect(why.comparisons.find((c: any) => c.entityId === request).title).toBe('Temps de réponse de la key request');
  }
  if (scenario === 'database') {
    expect(why.observations.some((o: any) => o.title === 'Dépendance base de données publiée')).toBe(true);
    expect(report.evidence.find((e: any) => e.entityId === a && e.kind === 'entity').serviceType).toBe('DATABASE');
  }
  if (scenario === 'infrastructure') {
    expect(why.hypotheses.some((h: any) => h.title === 'Signaux infrastructure à examiner')).toBe(true);
    expect(why.comparisons.filter((c: any) => c.entityId === host)).toHaveLength(2);
    expect(why.comparisons.find((c: any) => c.metricId === 'builtin:host.cpu.usage').title).toContain('CPU');
  }
  if (scenario === 'no-traces') expect(why.unknowns.some((v: string) => v.includes('Traces brutes'))).toBe(true);
  if (['missing-baseline', 'no-evidence'].includes(scenario)) expect(why.comparisons).toHaveLength(0);
  if (scenario === 'ambiguous') expect(why.comparisons.some((c: any) => c.metricId.includes('time'))).toBe(false);
  if (['permissions', 'budget', 'no-evidence'].includes(scenario)) expect(report.status).toBe('partial');
  if (scenario === 'budget')
    expect(report.trace.some((t: any) => t.reason === 'Budget de collecte atteint')).toBe(true);
  if (scenario === 'synthetic') expect(why.hypotheses.some((h: any) => h.title.includes('Changement'))).toBe(false);
  if (scenario === 'contradictory-time')
    expect(why.observations.some((o: any) => o.title === 'Événement contextuel publié')).toBe(false);
  if (scenario === 'tail') {
    expect(why.comparisons.filter((c: any) => c.metricId === 'builtin:service.response.time')).toHaveLength(2);
    expect(checks.some((v: any) => v.title === 'Examiner les requêtes de queue')).toBe(true);
    expect(why.comparisons.find((c: any) => c.aggregation === 'percentile(95)').incident.value).toBe(0.6);
    expect(why.comparisons.find((c: any) => c.aggregation === 'avg').incident.value).toBe(0.2);
  }
  const copy = structuredClone(report);
  expect(buildExplainReport(problem, copy)).toEqual(buildExplainReport(problem, copy));
  expect(copy).toEqual(report);
});

test('strict limits reject invalid configuration before any API read', async () => {
  expect(() => serviceCollectionLimits({ investigationLimits: { maxCandidates: 9 } })).toThrow();
  const { deps, problem, reads } = fixture('slow');
  deps.investigationLimits = { maxApiCalls: 1000 };
  await expect(explainProblem(deps, { environment_alias: 'prod', problemId: problem.problemId }, 0)).rejects.toThrow();
  expect(reads).toEqual([]);
});
test('timeout preserves primary facts and stops further connector requests', async () => {
  const { deps, problem, reads } = fixture('stable');
  deps.investigationLimits = { timeoutMs: 10 };
  deps.eventsClient.queryEvents = () => {
    reads.push('pending-event');
    return new Promise(() => {});
  };
  const report = await explainProblem(deps, { environment_alias: 'prod', problemId: problem.problemId }, 0);
  expect(reads.at(-1)).toBe('pending-event');
  expect(report.status).toBe('partial');
  expect(report.explain.whyItHappened.comparisons).toHaveLength(3);
  expect(report.trace.some((t: any) => t.reason?.includes('Timeout'))).toBe(true);
});
test('response volume bound preserves the already collected problem and stops enrichment', async () => {
  const { deps, problem } = fixture('stable');
  deps.investigationLimits = { maxResponseBytes: 1000 };
  const entityRead = deps.entitiesClient.getEntityDetails;
  deps.entitiesClient.getEntityDetails = async (id: string) =>
    new Map([['prod', { ...(await entityRead(id)).get('prod'), description: 'x'.repeat(2000) }]]);
  const report = await explainProblem(deps, { environment_alias: 'prod', problemId: problem.problemId }, 0);
  expect(report.status).toBe('partial');
  expect(report.trace.some((t: any) => t.reason === 'Budget de volume atteint')).toBe(true);
});
test('foreign key request ownership cannot be inferred from names or query selector', async () => {
  const { deps, problem } = fixture('endpoint');
  deps.authClientManager.makeRequests = () =>
    Promise.resolve(
      new Map([
        [
          'prod',
          {
            entities: [
              {
                entityId: request,
                displayName: 'main endpoint',
                fromRelationships: { isServiceMethodOfService: [{ id: a, type: 'SERVICE' }] },
              },
            ],
          },
        ],
      ]),
    );
  const report = await explainProblem(deps, { environment_alias: 'prod', problemId: problem.problemId }, 0);
  expect(report.evidence.some((e: any) => e.kind === 'request-relations')).toBe(false);
  expect(report.explain.whyItHappened.hypotheses.some((h: any) => h.title === 'Key request à examiner')).toBe(false);
});
afterAll(() => {
  if (process.env.DAYBREAK_DEEP_EXAMPLES) {
    mkdirSync('validation/sprint-05', { recursive: true });
    writeFileSync('validation/sprint-05/examples.json', JSON.stringify(results, null, 2), { mode: 0o600 });
  }
});

test('dependency selection and findings remain deterministic under shuffled topology input', async () => {
  jest.useFakeTimers({ now: 1791971700000 });
  try {
    const first = fixture('multiple'),
      second = fixture('multiple');
    second.entity.fromRelationships.calls.reverse();
    const a = await explainProblem(first.deps, { environment_alias: 'prod', problemId: first.problem.problemId }, 0);
    const b = await explainProblem(second.deps, { environment_alias: 'prod', problemId: second.problem.problemId }, 0);
    expect(a.playbook.context).toEqual(b.playbook.context);
    expect(a.explain).toEqual(b.explain);
    expect(first.metricsCalls).toEqual(second.metricsCalls);
  } finally {
    jest.useRealTimers();
  }
});
