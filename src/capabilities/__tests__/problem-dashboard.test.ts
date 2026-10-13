import { prepareProblemDashboard } from '../problem-dashboard';
import { investigateManagedProblem, updateInvestigationConversation } from '../problem-investigation';
import { ToolContext } from '../../tools/context';
test('dashboard helper derives exact Host/Disk metric filter from verified context, rejects fabricated metrics', async () => {
  const ctx = {
    investigationOwner: 'demo',
    authClientManager: { validAliases: ['prod'], getBaseUrl: () => 'https://example/e/demo' },
    tokenScopesFor: () => ['problems.read'],
    problemsClient: {
      getProblemDetails: async () => new Map([['prod', { problemId: 'P', status: 'OPEN', affectedEntities: [] }]]),
    },
  } as unknown as ToolContext;
  const report: any = await investigateManagedProblem(ctx, { environment_alias: 'prod', problemId: 'P' }, 'demo', {
    paceMs: 0,
    model: null,
  });
  report.scope = {
    hostId: 'HOST-1111111111111111',
    diskId: 'DISK-2222222222222222',
    metricId: 'builtin:host.disk.usedPct',
  };
  updateInvestigationConversation(ctx, 'prod', report.investigationId, report, []);
  const args = { environment_alias: 'prod', investigationId: report.investigationId, name: 'Disk', owner: 'sre' };
  const proposal = prepareProblemDashboard(ctx, args);
  expect(proposal.created).toBe(false);
  expect(proposal.metricSelector).toContain(
    'and(eq("dt.entity.host","HOST-1111111111111111"),eq("dt.entity.disk","DISK-2222222222222222"))',
  );
  expect(proposal.arguments.dashboard.dashboardMetadata.owner).toBe('sre');
  expect(() => prepareProblemDashboard(ctx, { ...args, metricId: 'invented' })).toThrow('métrique');
  report.evidence.push({ id: 'service-metric', metricId: 'builtin:service.response.time', entityId: 'SERVICE-3333333333333333' });
  updateInvestigationConversation(ctx, 'prod', report.investigationId, report, []);
  const service = prepareProblemDashboard(ctx, { ...args, metricId: 'builtin:service.response.time' });
  expect(service.metricSelector).toContain('eq("dt.entity.service","SERVICE-3333333333333333")');
  expect(service.metricSelector).not.toContain('dt.entity.host');
  expect(service.metricSelector).not.toContain('dt.entity.disk');
  report.evidence.push({ id: 'other-service', metricId: 'builtin:service.response.time', entityId: 'SERVICE-4444444444444444' });
  updateInvestigationConversation(ctx, 'prod', report.investigationId, report, []);
  expect(() => prepareProblemDashboard(ctx, { ...args, metricId: 'builtin:service.response.time' })).toThrow('entité précise');
  expect(() => prepareProblemDashboard({ ...ctx, investigationOwner: 'other' }, args)).toThrow('unavailable');
});
