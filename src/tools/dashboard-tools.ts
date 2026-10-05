import { z } from 'zod';
import { ToolContext } from './context';

const dashboardBase = z.object({
  dashboardMetadata: z.object({ name: z.string().min(1), owner: z.string().min(1) }).passthrough(),
  tiles: z.array(z.object({
    name: z.string(), tileType: z.string(), bounds: z.object({}).passthrough(),
  }).passthrough()).max(100),
}).passthrough();
export const dashboardDefinition = dashboardBase.refine(value => !('id' in value), 'New dashboard must not include an id');
export const dashboardUpdateDefinition = dashboardBase.extend({ id: z.string().uuid().optional() });

export function registerDashboardTools(ctx: ToolContext): void {
  const environment_alias = z.string().refine(alias => alias !== 'ALL_ENVIRONMENTS' &&
    !alias.includes(';') && ctx.envAliasValidate(alias), 'Select exactly one configured environment');
  const selected = (alias: string) => {
    const client = ctx.authClientManager.clients.find(c => c.alias === alias);
    const token = ctx.authClientManager.tokenFor(alias);
    if (!client || !token) throw new Error('Environment or token unavailable');
    return { client, token };
  };
  ctx.tool<{ environment_alias: string; dashboardId: string; dashboard: z.infer<typeof dashboardUpdateDefinition> }>(
    'dynatrace_managed_update_dashboard',
    'Replace an existing Classic dashboard definition when explicitly requested. First retrieve the existing dashboard and preserve tiles/settings outside the requested changes. Supply the full definition, not a patch. Validates before PUT and checks read-back. Never retry blindly after a timeout.',
    { environment_alias, dashboardId: z.string().uuid(), dashboard: dashboardUpdateDefinition },
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    async ({ environment_alias: alias, dashboardId, dashboard }) => {
      if (dashboard.id !== undefined && dashboard.id !== dashboardId) throw new Error('Dashboard body ID must match dashboardId');
      const { client, token } = selected(alias);
      const endpoint = `/api/config/v1/dashboards/${encodeURIComponent(dashboardId)}`;
      // Require the target to exist; never use PUT to accidentally create a new resource.
      await client.makeRequest(endpoint, token);
      const definition = { ...dashboard, id: dashboardId };
      await client.postConfiguration(`${endpoint}/validator`, token, definition);
      await client.putConfiguration(endpoint, token, definition);
      const url = `${client.dashboardBaseUrl}/#dashboard;id=${encodeURIComponent(dashboardId)}`;
      try {
        const actual = await client.makeRequest<{ dashboardMetadata?: unknown; tiles?: unknown }>(endpoint, token);
        const equal = (a: unknown, b: unknown): boolean => {
          if (a === b) return true;
          if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equal(v, b[i]));
          if (a && b && typeof a === 'object' && typeof b === 'object') return Object.entries(a).every(([k, v]) => equal(v, (b as Record<string, unknown>)[k]));
          return false;
        };
        const verified = equal(definition.dashboardMetadata, actual.dashboardMetadata) && equal(definition.tiles, actual.tiles);
        return JSON.stringify({ id: dashboardId, updated: true, verified, url,
          ...(!verified ? { warning: 'PUT succeeded but read-back differs; inspect before retrying.' } : {}) });
      } catch {
        return JSON.stringify({ id: dashboardId, updated: true, verified: false, url,
          warning: 'PUT succeeded; read-back failed. Inspect before retrying.' });
      }
    });
  ctx.tool<{ environment_alias: string }>('dynatrace_managed_list_dashboards',
    'List Classic dashboards in one environment.', { environment_alias }, { readOnlyHint: true },
    async ({ environment_alias: alias }) => {
      const { client, token } = selected(alias);
      return JSON.stringify(await client.makeRequest('/api/config/v1/dashboards', token));
    });
  ctx.tool<{ environment_alias: string; dashboardId: string }>('dynatrace_managed_get_dashboard',
    'Read a Classic dashboard definition to inspect its tiles and filters.',
    { environment_alias, dashboardId: z.string().uuid() }, { readOnlyHint: true },
    async ({ environment_alias: alias, dashboardId }) => {
      const { client, token } = selected(alias);
      return JSON.stringify(await client.makeRequest(`/api/config/v1/dashboards/${encodeURIComponent(dashboardId)}`, token));
    });
  const validate = async (alias: string, dashboard: unknown) => {
    const { client, token } = selected(alias);
    await client.postConfiguration('/api/config/v1/dashboards/validator', token, dashboard);
    return { client, token };
  };
  ctx.tool<{ environment_alias: string; dashboard: z.infer<typeof dashboardDefinition> }>(
    'dynatrace_managed_validate_dashboard',
    'Validate a new Classic dashboard definition against Dynatrace. Does not create or change a dashboard.',
    { environment_alias, dashboard: dashboardDefinition }, { readOnlyHint: true },
    async ({ environment_alias: alias, dashboard }) => {
      await validate(alias, dashboard);
      return JSON.stringify({ valid: true, created: false });
    });
  ctx.tool<{ environment_alias: string; dashboard: z.infer<typeof dashboardDefinition> }>(
    'dynatrace_managed_create_dashboard',
    'Create a new Classic dashboard when the user explicitly requests creation. Validates first. Never overwrites an existing dashboard. Do not retry blindly after a timeout; creation may have succeeded.',
    { environment_alias, dashboard: dashboardDefinition },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    async ({ environment_alias: alias, dashboard }) => {
      const { client, token } = await validate(alias, dashboard);
      const result = await client.postConfiguration<{ id?: string; name?: string }>('/api/config/v1/dashboards', token, dashboard);
      if (!result?.id) return JSON.stringify({ created: true, verified: false, warning: 'API accepted creation but returned no ID; inspect dashboard list before retrying' });
      const url = `${client.dashboardBaseUrl}/#dashboard;id=${encodeURIComponent(result.id)}`;
      try {
        await client.makeRequest(`/api/config/v1/dashboards/${encodeURIComponent(result.id)}`, token);
        return JSON.stringify({ ...result, created: true, verified: true, url });
      } catch {
        return JSON.stringify({ ...result, created: true, verified: false, url,
          warning: 'Created successfully; read-back failed. Do not repeat creation.' });
      }
    });
}
