import { ToolContext } from '../tools/context';
import { investigationContext } from './problem-investigation';
/** Portable deterministic construction. Returns a proposal, never writes or validates remotely. */
export function prepareProblemDashboard(
  ctx: ToolContext,
  args: { environment_alias: string; investigationId: string; name: string; owner: string; metricId?: string },
) {
  const { report } = investigationContext(ctx, args.environment_alias, args.investigationId, ctx.investigationOwner);
  const known = new Set(
    [report.scope?.metricId, ...(report.evidence || []).map((e: any) => e.metricId)].filter(Boolean),
  );
  const metric = args.metricId || report.scope?.metricId || (known.size === 1 ? [...known][0] : undefined);
  if (!metric || !known.has(metric) || !/^(?:builtin:)?[A-Za-z0-9_.-]+$/.test(metric))
    throw Error('Préciser une métrique présente dans les preuves');
  const scope = report.scope || {};
  const associated = [...new Set((report.evidence || []).filter((e: any) => e.metricId === metric && e.entityId).map((e: any) => e.entityId))];
  const entities = associated.length ? associated.map((entityId: any) => ({entityId, type: entityId.split('-')[0]})) :
    scope.metricId === metric && scope.hostId ? [{ entityId: scope.hostId, type: 'HOST' }] : scope.entities || [];
  if (entities.length !== 1 || !/^[A-Z_]+-[A-F0-9]{16}$/.test(entities[0].entityId))
    throw Error('Choisir une entité précise du problème');
  const entity = entities[0],
    dimension = 'dt.entity.' + String(entity.type || entity.entityId.split('-')[0]).toLowerCase();
  if (metric.startsWith('builtin:host.') && entity.type !== 'HOST' || metric.startsWith('builtin:service.') && entity.type !== 'SERVICE')
    throw Error('Entité incompatible avec la métrique');
  const filters = [`eq("${dimension}","${entity.entityId}")`],
    dimensions = [dimension];
  if (scope.diskId && metric.startsWith('builtin:host.disk.')) {
    if (!/^DISK-[A-F0-9]{16}$/.test(scope.diskId)) throw Error('Disk non vérifiable');
    filters.push(`eq("dt.entity.disk","${scope.diskId}")`);
    dimensions.push('dt.entity.disk');
  }
  const metricSelector =
    metric +
    ':filter(' +
    (filters.length > 1 ? 'and(' + filters.join(',') + ')' : filters[0]) +
    '):splitBy(' +
    dimensions.map((d) => '"' + d + '"').join(',') +
    '):avg';
  const dashboard = {
    dashboardMetadata: {
      name: args.name,
      owner: args.owner,
      shared: false,
      dashboardFilter: { timeframe: '-2h', managementZone: null },
    },
    tiles: [
      {
        name: metric,
        tileType: 'DATA_EXPLORER',
        configured: true,
        bounds: { top: 0, left: 0, width: 608, height: 304 },
        customName: metric,
        queries: [{ id: 'A', metricSelector, enabled: true, timeAggregation: 'DEFAULT', splitBy: [] }],
        metricExpressions: [metricSelector],
        queriesSettings: { resolution: '', foldAggregation: 'AUTO' },
        visualConfig: {
          type: 'GRAPH_CHART',
          rules: [],
          global: { seriesType: 'LINE', hideLegend: false, theme: 'DEFAULT' },
        },
      },
    ],
  };
  return {
    tool: 'dynatrace_managed_create_dashboard',
    arguments: { environment_alias: args.environment_alias, dashboard },
    metricSelector,
    created: false,
  };
}
