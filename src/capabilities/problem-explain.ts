import type { ToolContext } from '../tools/context';
import { investigationDependencies } from '../adapters/mcp/investigation-dependencies';
import { explainProblem } from '../core/investigation-engine/explain';
import type { ExplainRequest } from '../contracts/investigation';
/** Compatibility adapter for existing MCP consumers. Business execution is transport-independent. */
export function explainManagedProblem(ctx: ToolContext, args: ExplainRequest, paceMs = 1100) {
  return explainProblem(investigationDependencies(ctx), args, paceMs);
}
