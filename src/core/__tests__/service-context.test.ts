import {
  directServiceRelations,
  qualifyServiceEvents,
  compareDependencyLatency,
  CONTEXT_LOOKBACK_MS,
} from '../investigation-engine/service-context';
import { runServiceSlowdown } from '../investigation-engine/service-slowdown';
import { explainProblem } from '../investigation-engine/explain';
import { InvestigationSnapshotSchemaV1 } from '../../contracts/investigation';
const main = 'SERVICE-1111111111111111',
  dep = 'SERVICE-2222222222222222',
  incoming = 'SERVICE-3333333333333333';
const start = Math.floor((Date.now() - 3600000) / 300000) * 300000,
  end = start + 1800000;
const window = { from: start, to: end };
function fixture() {
  const map = (v: any) => Promise.resolve(new Map([['prod', v]]));
  const problem = {
    problemId: 'context',
    title: 'Slow service',
    severityLevel: 'PERFORMANCE',
    status: 'CLOSED',
    startTime: start,
    endTime: end,
    affectedEntities: [{ entityId: { id: main } }],
    evidenceDetails: { details: [], totalCount: 0 },
    impactAnalysis: { impacts: [] },
  };
  const entity = {
    entityId: main,
    displayName: 'checkout',
    fromRelationships: { calls: [{ id: dep, type: 'SERVICE' }] },
    toRelationships: { calls: [{ id: incoming, type: 'SERVICE' }] },
  };
  const deps: any = {
    authClientManager: {
      validAliases: ['prod'],
      getBaseUrl: () => 'https://managed.example/e/prod',
      makeRequests: jest.fn(),
    },
    problemsClient: { getProblemDetails: jest.fn(() => map(problem)) },
    entitiesClient: { getEntityDetails: jest.fn(() => map(entity)) },
    eventsClient: { getEventDetails: jest.fn(), queryEvents: jest.fn(() => map({ events: [], totalCount: 0 })) },
    logsClient: { queryLogs: jest.fn() },
    metricsClient: {
      listAvailableMetrics: jest.fn(),
      getMetricDetails: jest.fn((id: string) =>
        map({
          metricId: id,
          unit: id.includes('time') ? 'MicroSecond' : id.includes('Count') ? 'Count' : 'Percent',
          aggregationTypes: ['avg', 'value'],
          dimensionDefinitions: [{ key: 'dt.entity.service' }],
        }),
      ),
      queryMetrics: jest.fn((p: any) => {
        const id = p.entitySelector.match(/SERVICE-[A-F0-9]{16}/)[0],
          incident = Number(p.from) >= start;
        const value = p.metricSelector.includes('time')
          ? incident
            ? 200
            : 100
          : p.metricSelector.includes('Count')
            ? 10
            : 0;
        const count = (Number(p.to) - Number(p.from)) / 300000;
        return map({
          resolution: '5m',
          result: [
            {
              metricId: p.metricSelector,
              data: [
                {
                  dimensionMap: { 'dt.entity.service': id },
                  timestamps: Array.from({ length: count }, (_, i) => Number(p.from) + (i + 1) * 300000),
                  values: Array(count).fill(value),
                },
              ],
            },
          ],
        });
      }),
    },
  };
  return { deps, problem, entity, input: { environment_alias: 'prod', serviceId: main, problem, now: end + 300000 } };
}
const event = (extra: any = {}) => ({
  eventId: 'event-1',
  eventType: 'PERFORMANCE_EVENT',
  entityId: { entityId: { id: main, type: 'SERVICE' } },
  startTime: start + 300000,
  endTime: start + 600000,
  status: 'CLOSED',
  properties: [],
  ...extra,
});
test.each([
  'SERVICE_SLOWDOWN',
  'PERFORMANCE_EVENT',
  'AVAILABILITY_EVENT',
  'CUSTOM_DEPLOYMENT',
  'CUSTOM_CONFIGURATION',
  'DEPLOYMENT_CHANGED_CHANGE',
  'DEPLOYMENT_CHANGED_NEW',
  'DEPLOYMENT_CHANGED_REMOVED',
])('Managed supported event type %s is contextual only', (eventType) => {
  const r = qualifyServiceEvents({ events: [event({ eventType })] }, main, window);
  expect(r.observations).toHaveLength(1);
  expect(r.observations[0].interpretationLimit).toContain('aucune causalité');
});
test('sanitized Managed capture shape preserves relation direction and nested EntityStub without promoting an old test', () => {
  const capture = require('./fixtures/managed-context-sanitized.json');
  const [mainEntity, external] = capture.entities;
  expect(directServiceRelations(mainEntity, mainEntity.entityId).outgoing).toHaveLength(2);
  expect(directServiceRelations(external, external.entityId)).toMatchObject({
    outgoing: [],
    incoming: expect.any(Array),
  });
  expect(directServiceRelations(external, external.entityId).incoming).toHaveLength(4);
  const actualEvent = capture.event;
  expect(actualEvent.entityId.entityId.id).toBe(external.entityId);
  expect(
    qualifyServiceEvents({ events: [actualEvent] }, external.entityId, capture.incident).observations,
  ).toEqual([]);
});
test('directional topology never treats callers as outgoing and sorts/de-duplicates direct calls', () => {
  const { entity } = fixture();
  entity.fromRelationships.calls.push({ id: dep, type: 'SERVICE' });
  expect(directServiceRelations(entity, main)).toEqual({
    available: true,
    partial: false,
    outgoing: [dep],
    incoming: [incoming],
  });
  expect(directServiceRelations({ entityId: main }, main)).toMatchObject({ available: true, partial: true });
  expect(directServiceRelations({ ...entity, entityId: dep }, main).available).toBe(false);
});
test.each(['during', 'before', 'outside', 'foreign', 'invalid', 'synthetic', 'old-open', 'missing-end'])(
  'events qualify %s deterministically',
  (kind) => {
    const extra: any = {};
    if (kind === 'before') {
      extra.startTime = start - 600000;
      extra.endTime = start - 300000;
      extra.eventType = 'CUSTOM_DEPLOYMENT';
    }
    if (kind === 'outside') {
      extra.startTime = start - CONTEXT_LOOKBACK_MS - 600000;
      extra.endTime = start - CONTEXT_LOOKBACK_MS - 300000;
    }
    if (kind === 'foreign') extra.entityId = dep;
    if (kind === 'invalid') extra.endTime = start - 1;
    if (kind === 'synthetic') extra.properties = [{ key: 'daybreak.test', value: 'true' }];
    if (kind === 'old-open') {
      extra.startTime = start - 86400000;
      extra.endTime = null;
      extra.status = 'OPEN';
    }
    if (kind === 'missing-end') {
      extra.startTime = start - 86400000;
      extra.endTime = null;
    }
    const r = qualifyServiceEvents({ events: [event(extra)] }, main, window);
    expect(r.observations.length).toBe(['outside', 'foreign', 'invalid', 'missing-end'].includes(kind) ? 0 : 1);
    if (kind === 'before') expect(r.observations[0].timing).toBe('before');
    if (kind === 'synthetic') expect(r.observations[0].qualification).toBe('synthetic-declaration');
    if (['foreign', 'invalid'].includes(kind)) expect(r.partial).toBe(true);
  },
);
test('unsupported event types, duplicate IDs, missing pages and malformed payloads stay explicit', () => {
  expect(
    qualifyServiceEvents(
      { events: [event(), event(), event({ eventId: 'other', eventType: 'CUSTOM_INFO' })], nextPageKey: 'next' },
      main,
      window,
    ),
  ).toMatchObject({ partial: true, rejected: 2 });
  expect(qualifyServiceEvents(null, main, window).available).toBe(false);
  expect(qualifyServiceEvents({ events: [event()] }, main, { from: NaN, to: end }).available).toBe(false);
  expect(
    compareDependencyLatency({ mean: 200, min: 200, partial: false }, { mean: 100, min: 100, count: 6, partial: false })
      .status,
  ).toBe('insufficient_data');
  expect(
    compareDependencyLatency(
      { mean: 200, min: 200, count: 6, partial: true },
      { mean: 100, min: 100, count: 6, partial: false },
    ).status,
  ).toBe('insufficient_data');
});
test.each(['increased', 'stable', 'missing', 'api-error', 'no-relations', 'no-events', 'permissions', 'cap'])(
  'playbook context %s preserves metric checks and unknown cause',
  async (kind) => {
    const { deps, entity, input } = fixture();
    if (kind === 'no-relations') entity.fromRelationships.calls = [];
    if (kind === 'no-events') deps.eventsClient.queryEvents = jest.fn(() => Promise.resolve(new Map([['prod', {}]])));
    if (kind === 'api-error')
      deps.eventsClient.queryEvents = jest.fn(() => {
        throw Error('secret-token');
      });
    if (kind === 'permissions') deps.tokenScopesFor = () => ['metrics.read'];
    if (kind === 'cap')
      entity.fromRelationships.calls = [
        ...entity.fromRelationships.calls,
        { id: incoming, type: 'SERVICE' },
        { id: 'SERVICE-4444444444444444', type: 'SERVICE' },
      ];
    const original = deps.metricsClient.queryMetrics;
    deps.metricsClient.queryMetrics = jest.fn(async (p: any) => {
      const r = await original(p);
      const row = r.get('prod').result[0].data[0];
      if (p.entitySelector.includes(dep) && kind === 'stable') row.values.fill(100);
      if (p.entitySelector.includes(dep) && kind === 'missing') row.values[0] = null;
      return r;
    });
    const r = await runServiceSlowdown(deps, input);
    expect(r.playbook.checks.every((c: any) => c.status === 'compared')).toBe(true);
    expect(r.playbook.causalMechanism).toBe('unknown');
    expect(JSON.stringify(r)).not.toContain('secret-token');
    expect(r.playbook.context.inspectedDependencies.length).toBeLessThanOrEqual(2);
    expect(deps.entitiesClient.getEntityDetails).toHaveBeenCalledTimes(kind === 'permissions' ? 0 : 1);
    if (['increased', 'stable'].includes(kind))
      expect(r.playbook.context.dependencies[0]).toMatchObject({
        status: 'compared',
        direction: kind === 'stable' ? 'unchanged' : 'increase',
      });
    if (kind === 'missing') expect(r.playbook.context.dependencies[0].status).toBe('insufficient_data');
    if (kind === 'cap') expect(r.limitations.join(' ')).toContain('bornées');
    if (kind === 'permissions') expect(deps.eventsClient.queryEvents).not.toHaveBeenCalled();
    expect(r.findings.every((f: any) => ['observed', 'hypothesis'].includes(f.certainty))).toBe(true);
  },
);
test('Explain reuses the primary entity and existing sections, verifies all evidence references', async () => {
  const { deps } = fixture();
  deps.eventsClient.queryEvents = jest.fn((p: any) =>
    Promise.resolve(
      new Map([
        [
          'prod',
          {
            events: p.entitySelector.includes(main)
              ? [event({ eventType: 'CUSTOM_CONFIGURATION', startTime: start - 600000, endTime: start - 300000 })]
              : [],
            totalCount: p.entitySelector.includes(main) ? 1 : 0,
          },
        ],
      ]),
    ),
  );
  const r = await explainProblem(deps, { environment_alias: 'prod', problemId: 'context' }, 0);
  expect(r.explain.whyItHappened.comparisons).toHaveLength(4);
  expect(r.explain.whyItHappened.observations.some((f: any) => f.title==='Événement contextuel publié')).toBe(true);
  expect(r.explain.whyItHappened.hypotheses.map((h:any)=>h.title)).toEqual(['Latence également augmentée sur la dépendance','Changement publié proche de la hausse de latence']);
  expect(r.explain.whyItHappened.mechanism.certainty).toBe('unknown');
  expect(r.diagnosis.causalMechanism).toBe('unknown');
  expect(deps.entitiesClient.getEntityDetails).toHaveBeenCalledTimes(1);
  expect(InvestigationSnapshotSchemaV1.safeParse(r.investigation).success).toBe(true);
  expect(r.evidence.find((e: any) => e.kind === 'service-relations').provenance.source.endpoint).toBe(
    '/api/v2/entities/' + main,
  );
  expect(
    r.evidence
      .filter((e: any) => e.contextRole === 'direct-dependency')
      .every((e: any) => e.provenance.source.endpoint === '/api/v2/metrics/query'),
  ).toBe(true);
});
test('existing shared read budget blocks extra context without changing the three primary comparisons', async () => {
  const { deps, problem, entity } = fixture();
  entity.fromRelationships.calls.push({ id: incoming, type: 'SERVICE' });
  problem.evidenceDetails.details = Array.from({ length: 3 }, (_, i) => ({
    evidenceType: 'EVENT',
    eventId: 'published-' + i,
  })) as any;
  deps.eventsClient.getEventDetails = jest.fn((id: string) =>
    Promise.resolve(new Map([['prod', event({ eventId: id })]])),
  );
  const r = await explainProblem(deps, { environment_alias: 'prod', problemId: 'context' }, 0);
  expect(r.playbook.checks.every((c: any) => c.status === 'compared')).toBe(true);
  expect(r.trace.some((t: any) => t.reason === 'Budget de collecte atteint')).toBe(true);
  expect(r.playbook.context.status).toBe('partial');
  expect(r.trace.filter((t: any) => t.status === 'ok').length).toBeLessThanOrEqual(18);
  expect(r.diagnosis.causalMechanism).toBe('unknown');
});
