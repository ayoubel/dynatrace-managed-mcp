import { investigateManagedProblem, resolveInvestigationAction, summarizeDiskSeries } from '../problem-investigation';
import { ToolContext } from '../../tools/context';
import { permittedTool } from '../../tools/token-tool-access';
const host = 'HOST-1111111111111111',
  disk = 'DISK-2222222222222222';
const selector = `(builtin:host.disk.used):filter(eq("dt.entity.disk",${disk}),eq("dt.entity.host",${host}))`;
function fixture() {
  const mapped = (data: any) => new Map([['prod', data]]);
  const event: any = {
    startTime: Date.now() - 3600000,
    eventId: 'e',
    properties: [
      { key: 'dt.event.metric_selector', value: selector },
      { key: 'dt.event.metric_threshold', value: '100.0' },
      { key: 'dt.settings.object_id', value: 'safe_id' },
      { key: 'dt.event.description', value: 'Disk above normal' },
    ],
  };
  const problem: any = {
    problemId: 'P',
    title: 'TEST',
    status: 'OPEN',
    affectedEntities: [{ entityId: { id: host } }],
    evidenceDetails: { details: [{ evidenceType: 'EVENT', data: event }] },
  };
  const query = jest
    .fn()
    .mockImplementation(async () =>
      mapped({
        result: [
          {
            data: [
              {
                dimensionMap: { 'dt.entity.host': host, 'dt.entity.disk': disk },
                timestamps: [Date.now() - 600000, Date.now() - 300000],
                values: [1000, 2000],
              },
            ],
          },
        ],
      }),
    );
  const rule = {
    schemaId: 'builtin:anomaly-detection.metric-events',
    value: {
      queryDefinition: { type: 'METRIC_SELECTOR', metricSelector: selector },
      modelProperties: { type: 'STATIC_THRESHOLD', threshold: 100, alertCondition: 'ABOVE' },
    },
  };
  const ctx = {
    authClientManager: {
      validAliases: ['prod', 'other'],
      getBaseUrl: (a: string) => 'https://example/e/' + a,
      makeRequests: jest.fn().mockResolvedValue(mapped(rule)),
    },
    problemsClient: { getProblemDetails: jest.fn().mockImplementation(async () => mapped(problem)) },
    eventsClient: { getEventDetails: jest.fn().mockResolvedValue(mapped(event)) },
    metricsClient: { getMetricDetails: jest.fn().mockResolvedValue(mapped({ unit: 'Byte' })), queryMetrics: query },
    entitiesClient: {
      getEntityDetails: jest
        .fn()
        .mockImplementation(async (id: string) =>
          mapped({
            entityId: id,
            displayName: id === disk ? '/pods/uuid/volumes/nfs-volume' : 'host',
            properties: { filesystemType: 'nfs4' },
          }),
        ),
    },
    logsClient: { queryLogs: jest.fn().mockResolvedValue(mapped({ results: [] })) },
    tokenScopesFor: () => ['problems.read', 'entities.read', 'events.read', 'metrics.read', 'logs.read'],
  } as unknown as ToolContext;
  return { ctx, problem, event, query, rule };
}
const run = (ctx: ToolContext, args: any = { environment_alias: 'prod', problemId: 'P' }, owner = 'user') =>
  investigateManagedProblem(ctx, args, owner, { paceMs: 0 });
test('disk evidence drives scoped collection; raw threshold is not promoted without settings permission', async () => {
  const f = fixture(),
    r: any = await run(f.ctx);
  expect(r.scope).toMatchObject({ hostId: host, diskId: disk, filesystem: 'nfs4' });
  expect(r.cause.status).toBe('unknown');
  expect(r.findings.some((x: any) => x.kind === 'rule')).toBe(false);
  expect(r.evidence.find((x: any) => x.kind === 'alert-rule')).toMatchObject({
    verified: false,
    reportedThreshold: '100.0',
  });
  expect(
    f.query.mock.calls.every(
      ([args]) => args.entitySelector === `entityId("${host}")` && args.metricSelector.includes(disk),
    ),
  ).toBe(true);
  expect(r.findings.find((x: any) => x.kind === 'logs').text).toContain('ne garantit');
  expect(r.evidence.find((x: any) => x.kind === 'logs').matches).toEqual([]);
});
test('static threshold is qualified only after exact matching rule and metric contract', async () => {
  const f = fixture();
  f.ctx.tokenScopesFor = () => ['problems.read', 'entities.read', 'metrics.read', 'settings.read'];
  const r: any = await run(f.ctx);
  expect(r.evidence.find((x: any) => x.kind === 'alert-rule')).toMatchObject({
    verified: true,
    unit: 'Byte',
    threshold: 100,
  });
  f.rule.value.queryDefinition.metricSelector = selector + ':scale(100)';
  const transformed: any = await run(f.ctx);
  expect(transformed.evidence.find((x: any) => x.kind === 'alert-rule').verified).toBe(false);
});
test('wrong Disk, missing dimensions, gaps and truncated data cannot become complete measurements', () => {
  const data = {
    result: [
      {
        dataPointCountRatio: 0.5,
        data: [
          {
            dimensionMap: { 'dt.entity.host': host, 'dt.entity.disk': disk },
            timestamps: [1000, 301000, 601000],
            values: [1, null, 3],
          },
        ],
      },
    ],
  };
  expect(summarizeDiskSeries(data, host, 'DISK-3333333333333333')).toBeNull();
  const s = summarizeDiskSeries(data, host, disk)!;
  expect(s.gaps).toBe(true);
  expect(s.truncated).toBe(true);
  expect(s.count).toBe(2);
});
test('host outside actual impact or arbitrary selectors never trigger metric or log calls', async () => {
  const f = fixture();
  f.problem.affectedEntities = [];
  await run(f.ctx);
  expect(f.query).not.toHaveBeenCalled();
  expect(f.ctx.logsClient.queryLogs).not.toHaveBeenCalled();
  f.problem.affectedEntities = [{ entityId: { id: host } }];
  f.event.properties[0].value = selector + ':splitBy():sort(value(avg,descending))';
  await run(f.ctx);
  expect(f.query).not.toHaveBeenCalled();
});
test('event details are read when inline evidence omits properties', async () => {
  const f = fixture();
  f.problem.evidenceDetails.details = [{ eventId: 'e' }];
  const r: any = await run(f.ctx);
  expect(f.ctx.eventsClient.getEventDetails).toHaveBeenCalledWith('e', 'prod');
  expect(r.scope.diskId).toBe(disk);
});
test('missing reads and secret-bearing upstream exceptions yield explicit unavailable evidence', async () => {
  const f = fixture();
  (f.ctx.metricsClient.queryMetrics as jest.Mock).mockRejectedValue(Error('TOKEN=secret'));
  const r: any = await run(f.ctx);
  expect(r.status).toBe('partial');
  expect(JSON.stringify(r)).not.toContain('secret');
  expect(r.findings.some((x: any) => x.kind === 'usage')).toBe(false);
});
test('continuation preserves context, rereads problem and rejects other owner/environment/expired sessions', async () => {
  const f = fixture(),
    r: any = await run(f.ctx);
  const next: any = await run(f.ctx, {
    environment_alias: 'prod',
    investigationId: r.investigationId,
    question: 'quelle est la tendance ?',
  });
  expect(next.scope.diskId).toBe(disk);
  expect(next.steps).toHaveLength(2);
  expect(next.action).toBe('trend');
  await expect(
    run(f.ctx, { environment_alias: 'prod', investigationId: r.investigationId }, 'other-user'),
  ).rejects.toThrow('expired');
  await expect(run(f.ctx, { environment_alias: 'other', investigationId: r.investigationId })).rejects.toThrow(
    'expired',
  );
  const original = Date.now;
  jest.spyOn(Date, 'now').mockImplementation(() => original() + 31 * 60000);
  try {
    await expect(run(f.ctx, { environment_alias: 'prod', investigationId: r.investigationId })).rejects.toThrow(
      'expired',
    );
  } finally {
    jest.restoreAllMocks();
  }
});
test('unsupported free text asks for clarification without API calls; unknown cause stays unknown', async () => {
  const f = fixture(),
    r: any = await run(f.ctx, { environment_alias: 'prod', problemId: 'P', question: 'supprime le volume' });
  expect(r.status).toBe('needs_clarification');
  expect(f.ctx.problemsClient.getProblemDetails).not.toHaveBeenCalled();
  expect(resolveInvestigationAction('origine des écritures')).toBe('writers');
});
test('scopes expose the portable read-only tools through problems.read only', () => {
  expect(permittedTool('dynatrace_managed_investigate_problem', true, [['problems.read']])).toBe(true);
  expect(permittedTool('dynatrace_managed_continue_investigation', true, [['metrics.read']])).toBe(false);
  expect(permittedTool('dynatrace_managed_continue_investigation', false, [['problems.read']])).toBe(false);
});
