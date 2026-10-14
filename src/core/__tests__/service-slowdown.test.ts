import { runServiceSlowdown } from '../investigation-engine/service-slowdown';
import { explainProblem } from '../investigation-engine/explain';
import { explainManagedProblem } from '../../capabilities/problem-explain';
import { InvestigationSnapshotSchemaV1 } from '../../contracts/investigation';
import type { InvestigationDependencies } from '../investigation-engine/dependencies';
const serviceId = 'SERVICE-1111111111111111',
  start = 1770000000000,
  end = start + 1800000;
function fixture() {
  const problem = {
    problemId: 'slow',
    severityLevel: 'PERFORMANCE',
    status: 'CLOSED',
    title: 'Service response time degradation',
    startTime: start,
    endTime: end,
    affectedEntities: [{ entityId: { id: serviceId }, name: 'checkout' }],
    evidenceDetails: { details: [], totalCount: 0 },
    impactAnalysis: { impacts: [] },
  };
  const map = (v: any) => Promise.resolve(new Map([['prod', v]]));
  const deps: InvestigationDependencies = {
    investigationOwner: 'sprint02',
    executionProfile: 'incident-intelligence',
    authClientManager: {
      validAliases: ['prod'],
      getBaseUrl: () => 'https://managed.example/e/prod',
      makeRequests: jest.fn(),
    },
    tokenScopesFor: () => ['problems.read', 'entities.read', 'events.read', 'metrics.read'],
    problemsClient: { getProblemDetails: jest.fn(() => map(problem)) },
    entitiesClient: { getEntityDetails: jest.fn(() => map({ entityId: serviceId, displayName: 'checkout' })) },
    eventsClient: { getEventDetails: jest.fn(), queryEvents: jest.fn(() => map({ events: [] })) },
    logsClient: { queryLogs: jest.fn() },
    metricsClient: {
      listAvailableMetrics: jest.fn(),
      getMetricDetails: jest.fn((id) =>
        map({
          metricId: id,
          unit: id.includes('time') ? 'MicroSecond' : id.includes('Count') ? 'Count' : 'Percent',
          aggregationTypes: id.includes('Count') ? ['auto', 'value'] : ['auto', 'avg'],
          dimensionDefinitions: [{ key: 'dt.entity.service' }],
        }),
      ),
      queryMetrics: jest.fn((p) => {
        const incident = Number(p.from) >= start;
        const values = p.metricSelector.includes('time')
          ? incident
            ? [600000, 700000, 800000, 900000, 700000, 800000]
            : [100000, 110000, 90000, 120000, 100000, 80000]
          : p.metricSelector.includes('Count')
            ? [300, 310, 290, 300, 320, 280]
            : incident
              ? [2, 3, 4, 2, 3, 4]
              : [0, 0, 0, 0, 0, 0];
        return map({
          resolution: '5m',
          result: [
            {
              metricId: p.metricSelector,
              dataPointCountRatio: 1,
              dimensionCountRatio: 1,
              data: [
                {
                  dimensionMap: { 'dt.entity.service': serviceId },
                  timestamps: values.map((_, i) => Number(p.from) + (i + 1) * 300000),
                  values,
                },
              ],
            },
          ],
        });
      }),
    },
  };
  return { deps, problem, input: { environment_alias: 'prod', serviceId, problem, now: end } };
}
test('v1 directly compares three realistic simulated series without MCP and describes no cause', async () => {
  const { deps, input } = fixture();
  const result = await runServiceSlowdown(deps, input);
  expect(result.playbook).toMatchObject({
    id: 'SERVICE_SLOWDOWN',
    version: 1,
    status: 'completed',
    causalMechanism: 'unknown',
  });
  expect(result.playbook.checks[0]).toMatchObject({
    incidentValue: 750000,
    baselineValue: 100000,
    relativeChangePercent: 650,
  });
  expect(result.playbook.checks[1].relativeChangePercent).toBeNull();
  expect(result.playbook.checks[2]).toMatchObject({
    aggregation: 'value',
    statistic: 'sum-of-bucket-counts',
    incidentValue: 1800,
    baselineValue: 1800,
  });
  expect(deps.metricsClient.queryMetrics).toHaveBeenCalledTimes(6);
  expect(result.evidence.filter(e=>['series','metric-contract'].includes(e.kind))).toHaveLength(9);
  expect(result.findings.every((f) => f.certainty === 'observed' && f.evidenceRefs.length === 3)).toBe(true);
  expect(result.limitations.join(' ')).toContain('non garantie saine');
});
test.each(['empty', 'baseline', 'resolution', 'duplicate', 'wrong-entity', 'pagination', 'invalid-values', 'error'])(
  'insufficient %s data never asserts a latency comparison',
  async (kind) => {
    const { deps, input } = fixture();
    const original = deps.metricsClient.queryMetrics;
    deps.metricsClient.queryMetrics = jest.fn(async (p) => {
      if (kind === 'error') throw Error('secret-token');
      const map = await original(p, 'prod'),
        d = map.get('prod')!,
        row = d.result[0].data[0];
      if (kind === 'empty' || (kind === 'baseline' && Number(p.from) < start)) row.values = [];
      if (kind === 'resolution') d.resolution = '10m';
      if (kind === 'duplicate') row.timestamps[1] = row.timestamps[0];
      if (kind === 'wrong-entity') row.dimensionMap['dt.entity.service'] = 'SERVICE-2222222222222222';
      if (kind === 'pagination') d.nextPageKey = 'next';
      if (kind === 'invalid-values') row.values[0] = -1;
      return map;
    });
    const result = await runServiceSlowdown(deps, input);
    expect(result.playbook.status).toBe('partial');
    expect(result.playbook.checks[0].status).toBe('insufficient_data');
    expect(result.findings).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('secret-token');
  },
);
test.each(['unit', 'dimension', 'aggregation', 'id'])('incompatible descriptor %s prevents queries', async (kind) => {
  const { deps, input } = fixture();
  const original = deps.metricsClient.getMetricDetails;
  deps.metricsClient.getMetricDetails = jest.fn(async (id) => {
    const map = await original(id, 'prod'),
      d = map.get('prod')!;
    if (kind === 'unit') d.unit = 'Byte';
    if (kind === 'dimension') d.dimensionDefinitions = [];
    if (kind === 'aggregation') d.aggregationTypes = ['auto'];
    if (kind === 'id') d.metricId = 'other';
    return map;
  });
  const r = await runServiceSlowdown(deps, input);
  expect(deps.metricsClient.queryMetrics).not.toHaveBeenCalled();
  expect(r.playbook.status).toBe('partial');
});
test('scope, performance eligibility, short windows and missing scopes fail safely', async () => {
  const { deps, input } = fixture();
  await expect(runServiceSlowdown(deps, { ...input, serviceId: 'SERVICE-2222222222222222' })).rejects.toThrow();
  await expect(runServiceSlowdown(deps, { ...input, environment_alias: 'other' })).rejects.toThrow();
  await expect(
    runServiceSlowdown(deps, { ...input, problem: { ...input.problem, severityLevel: 'ERROR' } }),
  ).rejects.toThrow();
  expect(
    (await runServiceSlowdown(deps, { ...input, problem: { ...input.problem, endTime: start + 300000 } })).evidence,
  ).toEqual([]);
  deps.tokenScopesFor = () => ['problems.read'];
  expect((await runServiceSlowdown(deps, input)).playbook.status).toBe('partial');
  expect(deps.metricsClient.queryMetrics).not.toHaveBeenCalled();
});
test('Explain integration preserves v1 contracts, provenance, volume units and MCP parity', async () => {
  const { deps } = fixture();
  const direct = await explainProblem(deps, { environment_alias: 'prod', problemId: 'slow' }, 0);
  const adapter = await explainManagedProblem(deps as any, { environment_alias: 'prod', problemId: 'slow' }, 0);
  expect(direct.playbook.status).toBe('completed');
  expect(direct.explain.whyItHappened).toEqual(adapter.explain.whyItHappened);
  expect(direct.version).toBe(1);
  expect(InvestigationSnapshotSchemaV1.safeParse(direct.investigation).success).toBe(true);
  const series = direct.evidence.filter((e: any) => e.kind === 'series');
  expect(series).toHaveLength(6);
  expect(
    series.every(
      (e: any) =>
        e.provenance.source.endpoint === '/api/v2/metrics/query' && e.provenance.measurement.samples.length === 6,
    ),
  ).toBe(true);
  expect(direct.explain.whyItHappened.comparisons[2]).toMatchObject({
    title: 'Volume de requêtes',
    aggregation: 'value',
    incident: { value: 1800, unit: 'Count' },
  });
  expect(direct.explain.whyItHappened.mechanism.certainty).toBe('unknown');
  expect(direct.llm.status).toBe('disabled');
  const volume = series.find((e: any) => e.window === 'incident' && e.metricId.includes('Count'));
  expect(volume.provenance.measurement).toMatchObject({
    value: 1800,
    unit: 'Count',
    aggregation: 'value',
    summary: { sum: 1800 },
  });
});

test('long incident uses a disjoint pre-start baseline and Explain retains the comparison', async () => {
  const { deps, problem } = fixture();
  problem.endTime = start + 10800000;
  deps.metricsClient.queryMetrics = jest.fn((p) => {
    const count = (Number(p.to) - Number(p.from)) / 300000;
    const incident = Number(p.from) > start;
    return Promise.resolve(
      new Map([
        [
          'prod',
          {
            resolution: '5m',
            result: [
              {
                metricId: p.metricSelector,
                data: [
                  {
                    dimensionMap: { 'dt.entity.service': serviceId },
                    timestamps: Array.from({ length: count }, (_, i) => Number(p.from) + (i + 1) * 300000),
                    values: Array(count).fill(
                      p.metricSelector.includes('time')
                        ? incident
                          ? 200000
                          : 100000
                        : p.metricSelector.includes('Count')
                          ? 200
                          : 1,
                    ),
                  },
                ],
              },
            ],
          },
        ],
      ]),
    );
  });
  const report = await explainProblem(deps, { environment_alias: 'prod', problemId: 'slow' }, 0);
  expect(report.playbook.status).toBe('completed');
  expect(report.playbook.windows.baseline.to).toBe(start);
  expect(report.playbook.windows.incident.from).toBe(start + 3600000);
  expect(report.explain.whyItHappened.comparisons).toHaveLength(3);
});
