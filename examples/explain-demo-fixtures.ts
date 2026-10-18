// Synthetic connector payloads only. No expected diagnostic or report is injected.
import { corpus, scenarioPorts } from '../src/core/__tests__/fixtures/diagnostic-ports';
import { fixture, main } from '../src/core/__tests__/fixtures/quality-managed';
export const demoCases = [
  'RICH',
  'AMBIGUOUS',
  'POOR',
  'STALE',
  'CONTRADICTORY',
  'S02',
  'S08',
  'S08-timeout',
  'S08-budget',
];
export function demoPorts(id: string, namespace = 'first') {
  const source =
    id === 'AMBIGUOUS' || id === 'S02' ? 'S02' : id === 'CONTRADICTORY' ? 'S05' : id.startsWith('S08') ? id : 'S01';
  const scenario = corpus.scenarios.find((s) => s.id === source);
  if (!demoCases.includes(id) || !scenario) throw Error('Unknown synthetic demo scenario');
  let { deps, problem, reads } = scenarioPorts(scenario);
  if (id === 'POOR') {
    const sparse = fixture('sparse');
    deps = sparse.dependencies;
    problem = sparse.problem;
    reads = [];
    for (const port of [deps.problemsClient, deps.entitiesClient, deps.eventsClient, deps.metricsClient])
      for (const method of Object.keys(port)) {
        const target = port as any,
          original = target[method];
        if (typeof original === 'function')
          target[method] = (...args: any[]) => {
            reads.push(method);
            return original(...args);
          };
      }
  }
  problem.problemId = id;
  problem.title = 'SYNTHÉTIQUE · Checkout · ' + id;
  if (id === 'RICH') {
    problem.rootCauseEntity = {
      entityId: { id: main, type: 'SERVICE' },
      name: 'Checkout désigné par Davis (simulation)',
    };
    problem.evidenceDetails = {
      totalCount: 1,
      details: [
        {
          evidenceType: 'METRIC',
          displayName: 'Latence Checkout',
          entity: { entityId: { id: main, type: 'SERVICE' }, name: 'Checkout' },
          rootCauseRelevant: true,
          startTime: problem.startTime,
        },
      ],
    };
    problem.impactAnalysis = {
      impacts: [
        {
          impactType: 'SERVICE',
          impactedEntity: { entityId: { id: main }, name: 'Checkout' },
          estimatedAffectedUsers: 120,
        },
      ],
    };
  }
  if (id === 'AMBIGUOUS') {
    const deployment = scenarioPorts(corpus.scenarios.find((s) => s.id === 'S06')!);
    deps.eventsClient.queryEvents = deployment.deps.eventsClient.queryEvents;
  }
  if (id === 'STALE') {
    const query = deps.metricsClient.queryMetrics.bind(deps.metricsClient);
    deps.metricsClient.queryMetrics = async (...args: Parameters<typeof query>) => {
      const response = await query(...args);
      const value: any = structuredClone(response.get('prod'));
      for (const metric of value.result || [])
        for (const series of metric.data || []) series.timestamps = series.timestamps.map((t: number) => t - 86400000);
      return new Map([['prod', value]]);
    };
  }
  deps.executionProfile = 'incident-intelligence';
  deps.authClientManager.getBaseUrl = () => 'https://managed.example/e/' + namespace;
  deps.authClientManager.makeRequests = async <T>() =>
    new Map<string, T>([['prod', { entities: [], totalCount: 0 } as T]]);
  deps.investigationOwner = 'synthetic-demo-' + namespace;
  return { deps, problem, reads };
}
