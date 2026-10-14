import { explainProblem } from '../investigation-engine/explain';
import { fixture, main } from './fixtures/quality-managed';
import corpus from './fixtures/sprint-08-scenarios.json';
import { InvestigationSnapshotSchemaV1, assertEvidenceReferences } from '../../contracts/investigation';

const start = 1700000100000;
const latencyId = 'builtin:service.response.time';
const errorId = 'builtin:service.errors.server.rate';
const requestId = 'builtin:service.requestCount.total';

// Only connector ports are simulated. The collector, normalizer, playbook and Explain run unchanged.
function scenarioPorts(s: any) {
  const { dependencies: deps, problem } = fixture(s.base);
  problem.severityLevel = s.severity || 'PERFORMANCE';
  deps.executionProfile = 'incident-intelligence';
  deps.authClientManager.makeRequests = jest.fn(async () => new Map([['prod', { entities: [], totalCount: 0 }]]));
  const query = deps.metricsClient.queryMetrics;
  deps.metricsClient.queryMetrics = jest.fn(async (p: any) => {
    const response = await query(p);
    const data: any = structuredClone(response.get('prod'));
    const incident = Number(p.from) >= start;
    const isErrors = p.metricSelector.startsWith(errorId);
    if (isErrors && incident && ['api-error', 'timeout', 'malformed'].includes(s.mutation)) {
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
  });
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
        port[name] = jest.fn((...args: any[]) => {
          reads.push(name);
          return original(...args);
        });
      }
  }
  return { deps, problem, reads };
}

beforeEach(() => jest.useFakeTimers({ now: 1791971700000, doNotFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => jest.useRealTimers());

test.each(corpus.scenarios)('$id diagnostic accuracy, provenance, caution and next checks', async (s: any) => {
  const { deps, problem, reads } = scenarioPorts(s);
  const report: any = await explainProblem(deps, { environment_alias: 'prod', problemId: problem.problemId }, 0);
  const why = report.explain.whyItHappened;
  const next = report.explain.remediation.immediate;
  const proofs = new Map<string, any>(report.evidence.map((e: any) => [e.id, e]));
  const comparison = (metricId: string) =>
    why.comparisons.find((c: any) => c.metricId === metricId && c.entityId === main);
  const hints = (title: string) => next.some((c: any) => c.title === title);

  expect(report.explain.version).toBe(1);
  expect(report.llm.status).toBe('disabled');
  expect(InvestigationSnapshotSchemaV1.safeParse(report.investigation).success).toBe(true);
  expect(() => assertEvidenceReferences(report, new Set(proofs.keys()))).not.toThrow();
  expect(() => assertEvidenceReferences(report, new Set([...proofs.keys()].filter((id) => id !== 'E1')))).toThrow();
  expect(proofs.size).toBe(report.evidence.length);
  expect(report.cause.status).toBe('unknown');
  expect(why.mechanism.certainty).toBe('unknown');
  expect(report.explain.remediation.shortTerm).toEqual([]);
  expect(report.explain.remediation.prevention).toEqual([]);
  for (const item of [...why.observations, ...why.hypotheses, ...next]) {
    expect(item.evidenceRefs.length).toBeGreaterThan(0);
    for (const ref of item.evidenceRefs) expect(proofs.has(ref)).toBe(true);
  }
  for (const c of next) {
    expect(c.certainty).toBe('conditional');
    if (c.action)
      expect(['metrics', 'events', 'context', 'logs', 'recovery', 'trend', 'threshold']).toContain(c.action);
    expect(c.text).not.toMatch(/redémarrer|rollback|purger/i);
  }
  for (const h of why.hypotheses) {
    expect(h.certainty).toBe('hypothesis');
    expect(
      next.some((c: any) => c.title === h.title && h.evidenceRefs.every((ref: string) => c.evidenceRefs.includes(ref))),
    ).toBe(true);
  }
  // Validate the arithmetic against collected raw units, not display values or prebuilt expected reports.
  for (const c of why.comparisons) {
    const series = c.evidenceRefs.map((ref: string) => proofs.get(ref));
    expect(series).toHaveLength(2);
    const baseline = series.find((e: any) => e.window === 'baseline');
    const incident = series.find((e: any) => e.window === 'incident');
    expect(baseline.to).toBeLessThanOrEqual(start);
    expect(incident.from).toBeGreaterThanOrEqual(start);
    expect(baseline.to - baseline.from).toBe(incident.to - incident.from);
    for (const e of series) {
      expect(e.entityId).toBe(c.entityId);
      expect(e.metricId).toBe(c.metricId);
      expect(e.aggregation).toBe(c.aggregation);
      expect(e.partial).toBe(false);
      expect(e.points.length).toBe(6);
      expect(e.mean).toBe(e.points.reduce((n: number, p: any) => n + p.v, 0) / e.count);
      expect(e.provenance.timeRange).toEqual({ from: e.from, to: e.to });
      expect(e.provenance.entityId).toBe(e.entityId);
      expect(e.provenance.source.method).toBe('GET');
      expect(e.provenance.source.parameters).toMatchObject({
        from: String(e.from),
        to: String(e.to),
        resolution: '5m',
      });
      expect(e.provenance.measurement.value).toBe(e.metricId === requestId ? e.sum : e.mean);
      const scale = e.unit === 'MicroSecond' ? (c[e.window].unit === 's' ? 1000000 : 1000) : 1;
      expect(c[e.window].value).toBeCloseTo((e.metricId === requestId ? e.sum : e.mean) / scale, 10);
      expect(
        why.observations.some((o: any) => c.evidenceRefs.every((ref: string) => o.evidenceRefs.includes(ref))),
      ).toBe(true);
    }
  }
  expect(reads.length).toBeLessThanOrEqual(deps.investigationLimits?.maxApiCalls ?? (s.severity === 'ERROR' ? 18 : 48));
  const latency = comparison(latencyId);
  if (['S01', 'S10', 'S01-unit-boundary'].includes(s.id)) {
    expect(latency).toBeDefined();
    expect(hints('Localiser le temps passé dans le service')).toBe(true);
    expect(why.hypotheses).toEqual([]);
    expect(report.status).toBe('completed');
  }
  if (s.id.startsWith('S02')) {
    expect(why.comparisons.filter((c: any) => c.metricId === latencyId)).toHaveLength(2);
    const h = why.hypotheses.find((h: any) => h.title === 'Latence également augmentée sur la dépendance');
    expect(h).toBeDefined();
    expect(h.evidenceRefs.some((ref: string) => proofs.get(ref).kind === 'service-relations')).toBe(true);
  }
  if (s.id === 'S03' || s.id === 'S03-error') {
    expect(latency.baseline.value).toBe(latency.incident.value);
    expect(comparison(errorId)).toMatchObject({ baseline: { value: 1 }, incident: { value: 5 } });
    expect(hints('Localiser le temps passé dans le service')).toBe(false);
    if (s.id === 'S03') {
      expect(comparison(requestId)).toMatchObject({ baseline: { value: 60 }, incident: { value: 60 } });
      expect(hints('Erreurs augmentées sans hausse du volume')).toBe(true);
    } else expect(report.playbook).toBeUndefined();
  }
  if (s.id === 'S04') {
    expect(report.status).toBe('partial');
    expect(why.comparisons).toEqual([]);
    expect(report.evidence.some((e: any) => e.kind === 'series' && e.window === 'baseline')).toBe(false);
    expect(hints('Compléter la comparaison temporelle')).toBe(true);
  }
  if (s.id === 'S05') {
    expect(latency).toBeDefined();
    expect(comparison(errorId)).toBeUndefined();
    expect(why.hypotheses).toEqual([]);
    expect(report.status).toBe('partial');
  }
  if (s.id.startsWith('S06')) {
    expect(why.observations.some((o: any) => o.title === 'Événement contextuel publié')).toBe(true);
    expect(hints('Changement publié proche de la hausse de latence')).toBe(true);
  }
  if (s.id === 'S07-unit-boundary-decrease') {
    expect(why.hypotheses).toEqual([]);
    expect(next).toEqual([]);
    expect(proofs.get(latency.evidenceRefs[0]).mean).toBe(900000);
  }
  if (s.id === 'S07') {
    expect(why.comparisons).toHaveLength(3);
    expect(why.comparisons.every((c: any) => c.baseline.value === c.incident.value)).toBe(true);
    expect(why.hypotheses).toEqual([]);
    expect(next).toEqual([]);
  }
  if (s.id.startsWith('S08')) {
    expect(report.status).toBe('partial');
    expect(latency).toBeDefined();
    if (s.mutation === 'malformed')
      expect(report.limitations.some((l: string) => l.includes('Série incident absente ou ambiguë'))).toBe(true);
    else expect(report.investigation.errors.length).toBeGreaterThan(0);
    expect(why.unknowns.length).toBeGreaterThan(0);
    expect(JSON.stringify(report)).not.toContain('fixture private detail');
    if (s.mutation === 'timeout') {
      expect(report.trace.some((t: any) => /Timeout/.test(t.reason))).toBe(true);
      expect(deps.metricsClient.queryMetrics.mock.calls.at(-1)[0].metricSelector).toBe(errorId + ':avg');
      expect(reads.at(-1)).toBe('queryMetrics');
    }
    if (s.mutation === 'budget')
      expect(report.trace.some((t: any) => t.reason === 'Budget de collecte atteint')).toBe(true);
  }
  if (s.id.startsWith('S09')) {
    expect(report.status).toBe('partial');
    expect(why.comparisons).toEqual([]);
    expect(hints('Compléter la comparaison temporelle')).toBe(true);
  }
  if (s.id === 'S03-error-invalid-contract' || s.id === 'S03-error-invalid-values') {
    expect(report.status).toBe('partial');
    expect(comparison(errorId)).toBeUndefined();
    expect(why.hypotheses).toEqual([]);
    if (s.mutation === 'invalid-contract')
      expect(
        deps.metricsClient.queryMetrics.mock.calls.some(([p]: any[]) => p.metricSelector.startsWith(errorId)),
      ).toBe(false);
  }
});

test('corpus replay preserves diagnostic facts and Explain under a frozen clock', async () => {
  for (const id of ['S01', 'S03-error', 'S06', 'S09']) {
    const s = corpus.scenarios.find((s) => s.id === id)!;
    const a = scenarioPorts(s),
      b = scenarioPorts(s);
    const first: any = await explainProblem(a.deps, { environment_alias: 'prod', problemId: a.problem.problemId }, 0);
    const second: any = await explainProblem(b.deps, { environment_alias: 'prod', problemId: b.problem.problemId }, 0);
    expect(first.explain).toEqual(second.explain);
    expect(first.findings).toEqual(second.findings);
    expect(first.evidence).toEqual(second.evidence);
    expect(first.status).toBe(second.status);
  }
});
