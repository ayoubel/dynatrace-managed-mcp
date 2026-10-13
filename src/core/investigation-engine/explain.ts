import type { InvestigationDependencies } from './dependencies';
import { ExplainRequestSchema, type ExplainRequest } from '../../contracts/investigation';
import { investigateManagedProblem, investigationContext } from '../../capabilities/problem-investigation';

/** Public deterministic use case: no server, SDK, registration or model required. */
export async function explainProblem(dependencies: InvestigationDependencies, input: ExplainRequest, paceMs = 1100) {
  const args = ExplainRequestSchema.parse(input);
  if (!Number.isFinite(paceMs) || paceMs < 0 || paceMs > 5000) throw new Error('Invalid collection pacing');
  if (
    args.investigationId &&
    investigationContext(dependencies, args.environment_alias, args.investigationId, dependencies.investigationOwner)
      .report.problem?.id !== args.problemId
  )
    throw new Error('Problem does not match this investigation');
  return investigateManagedProblem(dependencies, { ...args, action: 'overview' }, dependencies.investigationOwner, {
    paceMs,
    model: null,
    explain: true,
  });
}
