import { z } from 'zod';
import { ToolContext } from './context';
import { investigateManagedProblem, InvestigationAction } from '../capabilities/problem-investigation';
export function registerInvestigationTools(ctx: ToolContext): void {
  const environment_alias = z
    .string()
    .refine((a) => ctx.authClientManager.validAliases.includes(a), 'Choose one environment');
  ctx.tool<{ environment_alias: string; problemId: string }>(
    'dynatrace_managed_investigate_problem',
    'Read-only Managed problem investigation. MCP owns evidence selection, disk timelines and user-facing interpretation. Unverified thresholds and unsupported root causes remain explicit. One problem, one Disk; optional permissions degrade coverage.',
    { environment_alias, problemId: z.string().min(1).max(200) },
    { readOnlyHint: true },
    async (args) => JSON.stringify(await investigateManagedProblem(ctx, args, ctx.investigationOwner)),
  );
  ctx.tool<{ environment_alias: string; investigationId: string; action?: InvestigationAction; question?: string }>(
    'dynatrace_managed_continue_investigation',
    'Continue a server-side investigation within 30 minutes, keeping its exact environment/problem/Disk context. Supported intents only: threshold, trend, logs, recovery, writers. Re-reads evidence; no external LLM or writes. Restart or expiry requires a new investigation.',
    {
      environment_alias,
      investigationId: z.string().uuid(),
      action: z.enum(['threshold', 'trend', 'logs', 'recovery', 'writers']).optional(),
      question: z.string().min(1).max(300).optional(),
    },
    { readOnlyHint: true },
    async (args) => JSON.stringify(await investigateManagedProblem(ctx, args, ctx.investigationOwner)),
  );
}
