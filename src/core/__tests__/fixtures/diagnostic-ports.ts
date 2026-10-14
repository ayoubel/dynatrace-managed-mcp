import { fixture } from './quality-managed';
import corpus from './sprint-08-scenarios.json';
import type { InvestigationDependencies } from '../../investigation-engine';
export type CorpusScenario = (typeof corpus.scenarios)[number];
export { corpus };
const start = 1700000100000;
const latencyId = 'builtin:service.response.time';
const errorId = 'builtin:service.errors.server.rate';
// Framework-neutral simulation of the existing corpus, never a diagnostic implementation.
export function scenarioPorts(s: CorpusScenario) {
  const { dependencies: deps, problem } = fixture(s.base as Parameters<typeof fixture>[0]);
  problem.severityLevel = s.severity || 'PERFORMANCE';
  deps.executionProfile = 'incident-intelligence';
  deps.authClientManager.makeRequests = async () => new Map([['prod', { entities: [], totalCount: 0 }]]);
  const query = deps.metricsClient.queryMetrics;
  deps.metricsClient.queryMetrics = async (p: any) => {
    const response = await query(p);
    const data: any = structuredClone(response.get('prod'));
    const incident = Number(p.from) >= start;
    const isErrors = p.metricSelector.startsWith(errorId);
    if (isErrors && incident && ['api-error', 'timeout', 'malformed'].includes(s.mutation || '')) {
      if (s.mutation === 'api-error') throw Error('HTTP 503 fixture private detail');
      if (s.mutation === 'timeout') return new Promise(() => {});
      return new Map([['prod', { resolution: '5m', result: [{ metricId: p.metricSelector, data: 'malformed' }] }]]);
    }
    for (const r of data.result)
      for (const row of r.data) {
        const values = p.metricSelector.startsWith(latencyId) ? s.latency : isErrors ? s.errors || [1, 1] : [10, 10];
        row.values = row.values.map(() => values[Number(incident)]);
        if (s.mutation === 'extra-error-dimension' && isErrors && incident)
          row.dimensionMap['dt.entity.service_method'] = 'SERVICE_METHOD-AAAAAAAAAAAAAAAA';
        if (s.mutation === 'missing-bucket' && incident) {
          row.timestamps.splice(1, 1);
          row.values.splice(1, 1);
        }
        if (s.mutation === 'foreign-entity' && incident)
          row.dimensionMap['dt.entity.service'] = 'SERVICE-FFFFFFFFFFFFFFFF';
      }
    if (s.mutation === 'resolution' && incident) data.resolution = '1m';
    return new Map([['prod', data]]);
  };
  if (s.mutation === 'timeout') deps.investigationLimits = { timeoutMs: 10 };
  if (s.mutation === 'budget') deps.investigationLimits = { maxApiCalls: 7 };
  if (s.mutation === 'invalid-contract') {
    const contract = deps.metricsClient.getMetricDetails;
    deps.metricsClient.getMetricDetails = async (id: string) => {
      const map = await contract(id);
      const d = map.get('prod');
      if (id === errorId) {
        d.unit = 'Byte';
        d.aggregationTypes = ['sum'];
        d.dimensionDefinitions = [{ key: 'dt.entity.host' }];
      }
      return map;
    };
  }
  const reads: string[] = [];
  const apiMethods = new Set([
    'makeRequests',
    'getProblemDetails',
    'getEntityDetails',
    'getEventDetails',
    'queryEvents',
    'getMetricDetails',
    'listAvailableMetrics',
    'queryMetrics',
    'queryLogs',
  ]);
  for (const port of [
    deps.authClientManager,
    deps.problemsClient,
    deps.entitiesClient,
    deps.eventsClient,
    deps.metricsClient,
    deps.logsClient,
  ]) {
    for (const name of Object.keys(port))
      if (apiMethods.has(name)) {
        const original = port[name];
        port[name] = (...args: any[]) => {
          reads.push(name);
          return original(...args);
        };
      }
  }
  return { deps: deps as InvestigationDependencies, problem, reads };
}
