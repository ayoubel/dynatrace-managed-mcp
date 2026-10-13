import type { ToolContext } from '../../tools/context';
import type { InvestigationDependencies } from '../../core/investigation-engine/dependencies';
/** Project only the business ports; MCP callbacks and catalogs do not cross this boundary. */
export function investigationDependencies(ctx: ToolContext): InvestigationDependencies {
  return {
    authClientManager: ctx.authClientManager,
    problemsClient: ctx.problemsClient,
    metricsClient: ctx.metricsClient,
    logsClient: ctx.logsClient,
    eventsClient: ctx.eventsClient,
    entitiesClient: ctx.entitiesClient,
    investigationOwner: ctx.investigationOwner,
    tokenScopesFor: ctx.tokenScopesFor,
    executionProfile: ctx.executionProfile,
  };
}
