import { z } from 'zod';
import { explainManagedProblem } from '../capabilities/problem-explain';
import { ToolContext } from './context';
import { investigateManagedProblem, investigationContext, InvestigationAction } from '../capabilities/problem-investigation';
export function registerInvestigationTools(ctx: ToolContext): void {
  const environment_alias = z
    .string()
    .refine((a) => ctx.authClientManager.validAliases.includes(a), 'Choose one environment');
  ctx.tool<{environment_alias:string;problemId:string;investigationId?:string}>(
    'dynatrace_managed_explain_problem',
    'Explain one Managed problem without any LLM: what happened, per-entity impact, Davis cause versus unknown mechanism, observations, incident/baseline comparisons and conditional remediation. Read-only and bounded; optional investigationId refreshes the same owner-bound session.',
    {environment_alias,problemId:z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),investigationId:z.string().uuid().optional()},
    {readOnlyHint:true},async args=>JSON.stringify(await explainManagedProblem(ctx,args)),
  );
  ctx.tool<{ environment_alias: string; problemId: string }>(
    'dynatrace_managed_investigate_problem',
    'Read-only Managed investigation for any problem: published impact, affected entities, scoped events and metrics. Disk evidence uses the specialized path. Coverage is bounded and optional permissions degrade it; no guaranteed root cause.',
    { environment_alias, problemId: z.string().min(1).max(200) },
    { readOnlyHint: true },
    async (args) => JSON.stringify(await investigateManagedProblem(ctx, args, ctx.investigationOwner)),
  );
  ctx.tool<{ environment_alias: string; investigationId: string; action?: InvestigationAction; question?: string }>(
    'dynatrace_managed_continue_investigation',
    'Continue the same environment/problem investigation within 30 minutes. Natural questions use explicitly enabled loopback Ollama; context can answer without new API reads. Scoped read-only collection only, no cloud fallback. Restart/expiry requires a new investigation.',
    {
      environment_alias,
      investigationId: z.string().uuid(),
      action: z.enum(['threshold', 'trend', 'logs', 'recovery', 'writers', 'context', 'events', 'metrics']).optional(),
      question: z.string().min(1).max(300).optional(),
    },
    { readOnlyHint: true },
    async (args) => JSON.stringify(await investigateManagedProblem(ctx, args, ctx.investigationOwner)),
  );
  ctx.tool<{environment_alias: string; problemId: string}>(
    'dynatrace_managed_collect_problem_evidence',
    'Collect published impact and entity context for any Managed problem, without title-based diagnosis. One problem/environment; bounded read-only evidence.',
    {environment_alias, problemId: z.string().min(1).max(200)}, {readOnlyHint: true},
    async args => JSON.stringify(await investigateManagedProblem(ctx, {...args, action: 'context'}, ctx.investigationOwner)),
  );
  ctx.tool<{environment_alias: string; investigationId: string}>(
    'dynatrace_managed_get_investigation_context',
    'Read the cached report and recent conversation for the same owner/environment session. No fresh API reads; preserve observation timestamps.',
    {environment_alias, investigationId: z.string().uuid()}, {readOnlyHint: true},
    async args => JSON.stringify(investigationContext(ctx, args.environment_alias, args.investigationId, ctx.investigationOwner)),
  );
}
