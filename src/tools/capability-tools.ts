import { z } from 'zod';
import type { ToolContext } from './context';
import { discoverCapabilities } from '../core/capabilities/discover';
import { capabilityConnector } from '../connectors/dynatrace-managed/capabilities';
export function registerCapabilityTools(ctx: ToolContext): void {
  ctx.tool<{ environment_alias: string }>(
    'dynatrace_managed_get_environment_capabilities',
    'Discover one caller-authorized Managed environment: observed version/scopes and bounded read-only API availability probes. Unknown stays explicit; no SaaS-only APIs, data pagination or writes. At most six calls and eight seconds.',
    {
      environment_alias: z
        .string()
        .refine(
          (alias) =>
            alias !== 'ALL_ENVIRONMENTS' && !alias.includes(';') && ctx.authClientManager.validAliases.includes(alias),
          'Choose one environment',
        ),
    },
    { readOnlyHint: true },
    async (args) =>
      JSON.stringify(
        await discoverCapabilities(
          args.environment_alias,
          capabilityConnector(
            ctx.authClientManager,
            args.environment_alias,
            ctx.tokenScopesFor?.(args.environment_alias),
          ),
        ),
      ),
  );
}
