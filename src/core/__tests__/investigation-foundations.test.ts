import { explainProblem } from '../investigation-engine/explain';
import { explainManagedProblem } from '../../capabilities/problem-explain';
import { investigationContext } from '../../capabilities/problem-investigation';
import type { InvestigationDependencies } from '../investigation-engine/dependencies';
import { InvestigationSnapshotSchemaV1, assertEvidenceReferences } from '../../contracts/investigation';
import { executionProfile, permitsTool, assertToolPermitted } from '../execution-policy';
import { registerAllTools } from '../../tools';
import type { ToolContext } from '../../tools/context';
import { discoverCapabilities } from '../capabilities/discover';

function fixture(): InvestigationDependencies {
  const alias = 'prod',
    service = 'SERVICE-1111111111111111',
    from = Date.now() - 3600000,
    to = from + 600000;
  const map = (data: any) => Promise.resolve(new Map([[alias, data]]));
  return {
    executionProfile: 'incident-intelligence',
    investigationOwner: 'core-test',
    authClientManager: {
      validAliases: [alias],
      getBaseUrl: () => 'https://managed.example/e/prod',
      makeRequests: jest.fn(),
    },
    tokenScopesFor: () => ['problems.read', 'entities.read', 'events.read', 'metrics.read'],
    problemsClient: {
      getProblemDetails: jest.fn(() =>
        map({
          problemId: 'problem',
          title: 'Latency',
          severityLevel: 'PERFORMANCE',
          status: 'CLOSED',
          startTime: from,
          endTime: to,
          affectedEntities: [{ entityId: { id: service } }],
          evidenceDetails: { details: [], totalCount: 0 },
          impactAnalysis: { impacts: [] },
        }),
      ),
    },
    entitiesClient: { getEntityDetails: jest.fn(() => map({ entityId: service, displayName: 'payments' })) },
    eventsClient: { getEventDetails: jest.fn(), queryEvents: jest.fn(() => map({ events: [] })) },
    logsClient: { queryLogs: jest.fn() },
    metricsClient: {
      listAvailableMetrics: jest.fn(),
      getMetricDetails: jest.fn((id) => map({ metricId: id, unit: id.includes('time') ? 'MicroSecond' : 'Percent' })),
      queryMetrics: jest.fn((params) =>
        map({
          result: [
            {
              metricId: params.metricSelector,
              data: [
                {
                  dimensionMap: { 'dt.entity.service': service },
                  timestamps: [Number(params.from) + 1000, Number(params.from) + 301000],
                  values: [2, 4],
                },
              ],
            },
          ],
        }),
      ),
    },
  };
}
test('direct core Explain runs with structural ports only and validates the additive evidence snapshot', async () => {
  const deps = fixture();
  const report = await explainProblem(deps, { environment_alias: 'prod', problemId: 'problem' }, 0);
  expect(report.explain.mode).toBe('deterministic');
  expect(report.llm.status).toBe('disabled');
  expect(InvestigationSnapshotSchemaV1.parse(report.investigation).evidence.length).toBe(report.evidence.length);
  const metric = report.evidence.find((e: any) => e.kind === 'series');
  expect(metric.provenance.source).toMatchObject({
    method: 'GET',
    endpoint: '/api/v2/metrics/query',
    parameters: {
      metricSelector: metric.metricId + ':avg',
      from: String(metric.from),
      to: String(metric.to),
      resolution: '5m',
    },
  });
  expect(metric.provenance.reference).toBeNull();
  expect(report.evidence[0].provenance.source.parameters).toEqual({ fields: 'evidenceDetails,impactAnalysis' });
  expect(report.evidence[0].provenance.reference.url).toBe(report.problemUrl);
  expect(investigationContext(deps, 'prod', report.investigationId, 'core-test').report.investigation).toEqual(
    report.investigation,
  );
  const adapter = await explainManagedProblem(
    { ...deps, tool: jest.fn() } as unknown as ToolContext,
    { environment_alias: 'prod', problemId: 'problem' },
    0,
  );
  expect(adapter.explain.whyItHappened).toEqual(report.explain.whyItHappened);
});
test('core rejects invalid request and owner/environment replay before unauthorized collection', async () => {
  const deps = fixture();
  await expect(explainProblem(deps, { environment_alias: 'prod;other', problemId: 'problem' }, 0)).rejects.toThrow();
  await expect(explainProblem(deps, { environment_alias: 'prod', problemId: 'bad;selector' }, 0)).rejects.toThrow();
  expect(deps.problemsClient.getProblemDetails).not.toHaveBeenCalled();
  const report = await explainProblem(deps, { environment_alias: 'prod', problemId: 'problem' }, 0);
  await expect(
    explainProblem(
      { ...deps, investigationOwner: 'other' },
      { environment_alias: 'prod', problemId: 'problem', investigationId: report.investigationId },
      0,
    ),
  ).rejects.toThrow('unavailable');
});
test('missing metrics, failed optional reads and absent Davis produce partial qualified output', async () => {
  const deps = fixture();
  (deps.metricsClient.queryMetrics as jest.Mock).mockRejectedValue(Error('secret-token'));
  const report = await explainProblem(deps, { environment_alias: 'prod', problemId: 'problem' }, 0);
  expect(report.status).toBe('partial');
  expect(report.explain.whyItHappened.comparisons).toEqual([]);
  expect(report.explain.whyItHappened.conclusion.certainty).toBe('unknown');
  expect(JSON.stringify(report)).not.toContain('secret-token');
});
test('contracts reject duplicate IDs, unknown references, wrong environment and non-finite measurement', async () => {
  const report = await explainProblem(fixture(), { environment_alias: 'prod', problemId: 'problem' }, 0);
  const snapshot = report.investigation;
  for (const mutate of [
    (s: any) => s.evidence.push(structuredClone(s.evidence[0])),
    (s: any) => s.conclusions.push({ statement: 'unsupported', certainty: 'observed', evidenceRefs: ['missing'] }),
    (s: any) => (s.evidence[0].environment.alias = 'other'),
    (s: any) => (s.evidence.find((e: any) => e.measurement).measurement.value = Infinity),
  ]) {
    const bad = structuredClone(snapshot);
    mutate(bad);
    expect(InvestigationSnapshotSchemaV1.safeParse(bad).success).toBe(false);
  }
  expect(() =>
    assertEvidenceReferences({ explain: { nested: [{ evidenceRefs: ['unknown'] }] } }, new Set(['E1'])),
  ).toThrow('references');
});
test('profile is fail-closed even for a mislabeled confirmation or newly added read-only tool', () => {
  expect(executionProfile('general')).toBe('general');
  expect(() => executionProfile('typo')).toThrow();
  for (const name of [
    'create_dashboard',
    'update_dashboard',
    'create_slo',
    'confirm_conversation_action',
    'new_tool',
    'converse_investigation',
  ]) {
    expect(permitsTool('incident-intelligence', 'dynatrace_managed_' + name, true)).toBe(false);
    expect(() => assertToolPermitted('incident-intelligence', 'dynatrace_managed_' + name, true)).toThrow();
  }
  expect(permitsTool('incident-intelligence', 'dynatrace_managed_explain_problem', undefined)).toBe(false);
  expect(permitsTool('general', 'dynatrace_managed_create_dashboard', false)).toBe(true);
});
test.each([false, true])('real tool registration exposes no writes or confirmations (httpMode=%s)', (httpMode) => {
  const tools: Array<{ name: string; readOnly?: boolean }> = [];
  registerAllTools({
    ...fixture(),
    envAliasValidate: () => true,
    httpMode,
    initErrors: [],
    tool: (name: string, _description: string, _schema: unknown, annotations: any) =>
      tools.push({ name, readOnly: annotations.readOnlyHint }),
  } as unknown as ToolContext);
  expect(tools.map((t) => t.name)).toContain('dynatrace_managed_explain_problem');
  expect(tools.map((t) => t.name)).toContain('dynatrace_managed_get_environment_capabilities');
  expect(tools.every((t) => t.readOnly === true && !/confirm|create|update|validate_dashboard/.test(t.name))).toBe(
    true,
  );
});
function connector() {
  return {
    validatedScopes: ['problems.read'],
    read: jest.fn(async (endpoint: string) =>
      endpoint.includes('clusterversion')
        ? { version: '1.346.0' }
        : endpoint.endsWith('problems')
          ? { problems: [] }
          : endpoint.endsWith('entities')
            ? { entities: [] }
            : endpoint.endsWith('metrics')
              ? { metrics: [] }
              : { events: [] },
    ),
  };
}
test('capability matrix observes version and API responses rather than inferring all capabilities from scopes', async () => {
  const c = connector(),
    matrix = await discoverCapabilities('prod', c);
  expect(matrix.version).toMatchObject({ status: 'observed', value: '1.346.0' });
  expect(matrix.scopes.values).toEqual(['problems.read']);
  expect(matrix.capabilities.filter((c) => c.status === 'available')).toHaveLength(4);
  expect(matrix.capabilities.find((c) => c.name === 'logs')?.status).toBe('unverified');
  expect(matrix.requests).toBe(5);
  expect(c.read).toHaveBeenCalledTimes(5);
});
test.each([401, 403, 404, 429, 500])(
  'capability matrix classifies HTTP %s without echoing sensitive upstream payload',
  async (status) => {
    const c = {
      read: jest.fn().mockRejectedValue({ response: { status, data: 'secret-token' }, message: 'secret-token' }),
      scopes: jest.fn().mockRejectedValue(Error('secret-token')),
    };
    const matrix = await discoverCapabilities('prod', c);
    expect(matrix.version.value).toBeNull();
    expect(matrix.scopes.status).toBe('unverified');
    expect(matrix.requests).toBe(6);
    expect(matrix.capabilities[0].status).toBe([401, 403, 404].includes(status) ? 'unavailable' : 'unverified');
    expect(JSON.stringify(matrix)).not.toContain('secret-token');
  },
);
test('fallback and malformed API responses never become observed capabilities', async () => {
  const matrix = await discoverCapabilities('prod', {
    read: jest.fn(async () => ({ version: '1.328.0', observed: false })),
  });
  expect(matrix.version.status).toBe('unverified');
  expect(matrix.version.value).toBeNull();
  expect(matrix.capabilities.every((c) => c.status === 'unverified')).toBe(true);
});
test('probe budget and propagated cancellation bound a connector that never resolves', async () => {
  const read = jest.fn((_path, _params, options) => {
    expect(options.signal).toBeInstanceOf(AbortSignal);
    return new Promise<never>(() => {});
  });
  const matrix = await discoverCapabilities('prod', { read }, { deadlineMs: 10, probeTimeoutMs: 10, maxRequests: 1 });
  expect(matrix.requests).toBe(1);
  expect(read).toHaveBeenCalledTimes(1);
  expect(read.mock.calls[0][2].signal.aborted).toBe(true);
  expect(
    matrix.capabilities.every(
      (c) => c.reason === 'budget-exhausted' || c.reason === 'not-probed-in-foundations-profile',
    ),
  ).toBe(true);
  expect(matrix.errors[0].code).toBe('timeout');
});
test('invalid budgets and multi-environment discovery cannot launch reads', async () => {
  const c = connector();
  await expect(discoverCapabilities('ALL_ENVIRONMENTS', c)).rejects.toThrow();
  await expect(discoverCapabilities('prod;other', c)).rejects.toThrow();
  await expect(discoverCapabilities('prod', c, { maxRequests: 7 })).rejects.toThrow();
  expect(c.read).not.toHaveBeenCalled();
});

test('fetched published event evidence retains its actual Events API provenance', async () => {
  const deps = fixture();
  const details = await deps.problemsClient.getProblemDetails('problem', 'prod');
  details.get('prod')!.evidenceDetails = { details: [{ eventId: 'event-1' }], totalCount: 1 };
  (deps.problemsClient.getProblemDetails as jest.Mock).mockResolvedValue(details);
  (deps.eventsClient.getEventDetails as jest.Mock).mockResolvedValue(
    new Map([
      [
        'prod',
        {
          eventId: 'event-1',
          eventType: 'CUSTOM_ALERT',
          title: 'Published event',
          startTime: Date.now() - 600000,
          endTime: Date.now() - 300000,
        },
      ],
    ]),
  );
  const report = await explainProblem(deps, { environment_alias: 'prod', problemId: 'problem' }, 0);
  expect(report.evidence.find((proof: any) => proof.id === 'published-event-0').provenance.source).toMatchObject({
    api: 'events',
    endpoint: '/api/v2/events/event-1',
  });
});
