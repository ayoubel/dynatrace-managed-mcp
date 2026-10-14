// Synthetic Managed payloads shared with the existing Sprint 04 quality suite. No live requests.
export const main = 'SERVICE-1111111111111111',
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
export function fixture(scenario: Scenario) {
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
