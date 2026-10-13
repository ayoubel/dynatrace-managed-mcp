import { startEnvironmentConversation } from '../conversation-agent';
const host = 'HOST-1111111111111111';
function fixture() {
  const catalog = [
    'get_entity_details',
    'get_dashboard',
    'list_problems',
    'get_metric_details',
    'query_metrics_data',
  ].map((suffix) => ({
    name: 'dynatrace_managed_' + suffix,
    annotations: { readOnlyHint: true },
    inputSchema: { properties: { environment_alias: {} } },
    parse: (a: any) => a,
    invoke: async () =>
      JSON.stringify(
        suffix === 'get_dashboard'
          ? {
              id: 'dashboard',
              dashboardMetadata: { name: 'SRE' },
              tiles: [{ tileType: 'DATA_EXPLORER', queries: [{ metricSelector: 'builtin:host.cpu.usage' }] }],
            }
          : { entityId: host, displayName: 'server', properties: { osType: 'LINUX' } },
      ),
  }));
  const map = (v: any) => new Map([['prod', v]]);
  const ctx: any = {
    investigationOwner: 'owner',
    authClientManager: { validAliases: ['prod'], getBaseUrl: () => 'https://example/e/prod' },
    conversationTools: () => catalog,
    problemsClient: { listProblems: jest.fn().mockResolvedValue(map({ problems: [], totalCount: 0 })) },
    metricsClient: {
      getMetricDetails: jest.fn().mockImplementation((metricId: string) => map({ metricId, unit: 'Percent' })),
      queryMetrics: jest
        .fn()
        .mockImplementation((p: any) =>
          map({
            result: [
              {
                metricId: p.metricSelector,
                data: [{ dimensionMap: { 'dt.entity.host': host }, timestamps: [Number(p.to)-1000], values: [12] }],
              },
            ],
          }),
        ),
    },
  };
  return { ctx, catalog };
}
test('host analysis returns facts without a model and refresh retains the session', async () => {
  const { ctx } = fixture();
  const args: any = { environment_alias: 'prod', target: { kind: 'entity', id: host }, analyze: true };
  const r: any = await startEnvironmentConversation(ctx, args);
  expect(r.contextAnalysis.title).toBe('Hôte · server');
  expect(r.findings.some((f: any) => f.title === 'builtin:host.cpu.usage')).toBe(true);
  expect(ctx.problemsClient.listProblems.mock.calls[0][1].entitySelector).toBe('entityId("' + host + '")');
  expect(r.summary).not.toContain('question');
  const next: any = await startEnvironmentConversation(ctx, { ...args, investigationId: r.investigationId });
  expect(next.investigationId).toBe(r.investigationId);
  await expect(
    startEnvironmentConversation(
      { ...ctx, investigationOwner: 'foreign' },
      { ...args, investigationId: r.investigationId },
    ),
  ).rejects.toThrow();
});
test('environment and dashboard have results and explicit coverage limits', async () => {
  const { ctx } = fixture();
  const e: any = await startEnvironmentConversation(ctx, { environment_alias: 'prod', analyze: true });
  expect(e.findings.some((f: any) => f.title === 'Problèmes ouverts')).toBe(true);
  const d: any = await startEnvironmentConversation(ctx, {
    environment_alias: 'prod',
    target: { kind: 'dashboard', id: 'dashboard' },
    analyze: true,
  });
  expect(d.findings.some((f: any) => f.text.includes('builtin:host.cpu.usage'))).toBe(true);
  expect(d.limitations.some((s: string) => s.includes('non exécutées'))).toBe(true);
  expect(ctx.metricsClient.queryMetrics).not.toHaveBeenCalled();
});
test('missing scopes produce a limited report, never direct unpermitted reads', async () => {
  const { ctx } = fixture();
  ctx.conversationTools = () => [];
  const r: any = await startEnvironmentConversation(ctx, { environment_alias: 'prod', analyze: true });
  expect(r.status).toBe('partial');
  expect(ctx.problemsClient.listProblems).not.toHaveBeenCalled();
  expect(r.limitations.some((s: string) => s.includes('non autorisée'))).toBe(true);
});
test('out-of-window or different metric points cannot become current host findings', async () => {
  const { ctx } = fixture();
  ctx.metricsClient.queryMetrics = jest.fn().mockResolvedValue(
    new Map([
      [
        'prod',
        {
          result: [
            {
              metricId: 'other',
              data: [{ dimensionMap: { 'dt.entity.host': host }, timestamps: [Date.now()], values: [99] }],
            },
            {
              metricId: 'builtin:host.cpu.usage',
              data: [{ dimensionMap: { 'dt.entity.host': host }, timestamps: [1], values: [99] }],
            },
          ],
        },
      ],
    ]),
  );
  const r: any = await startEnvironmentConversation(ctx, {
    environment_alias: 'prod',
    target: { kind: 'entity', id: host },
    analyze: true,
  });
  expect(r.findings.some((f: any) => f.text.includes('99'))).toBe(false);
  expect(r.status).toBe('partial');
});
test('mismatching entity definitions are rejected before analysis', async () => {
  const { ctx, catalog } = fixture();
  catalog[0].invoke = async () => JSON.stringify({ entityId: 'HOST-2222222222222222' });
  await expect(
    startEnvironmentConversation(ctx, {
      environment_alias: 'prod',
      target: { kind: 'entity', id: host },
      analyze: true,
    }),
  ).rejects.toThrow('Identité');
  expect(ctx.metricsClient.queryMetrics).not.toHaveBeenCalled();
});
