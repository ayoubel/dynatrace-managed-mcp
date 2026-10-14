import type { InvestigationDependencies } from './dependencies';
import { explainProblem } from './explain';
import { ExplainRequestSchema, type ExplainRequest } from '../../contracts/investigation';
import { serviceCollectionLimits } from './collection-limits';
import { InvestigationContractError, type InvestigationReport } from './report';
export type InvestigationLimits = NonNullable<InvestigationDependencies['investigationLimits']>;
export interface InvestigationOptions {
  limits?: InvestigationLimits;
  paceMs?: number;
}
export type InvestigationOutcome =
  | { status: 'completed' | 'partial'; report: InvestigationReport }
  | { status: 'error'; error: { code: 'invalid_input' | 'execution_failed' | 'invalid_output'; message: string } };
/** Same deterministic engine as MCP. No exception contents or connector data leak on failure. */
export async function executeInvestigation(
  dependencies: InvestigationDependencies,
  input: ExplainRequest,
  options: InvestigationOptions = {},
): Promise<InvestigationOutcome> {
  const ports: InvestigationDependencies = {
    ...dependencies,
    executionProfile: 'incident-intelligence',
    investigationLimits: options.limits ?? dependencies.investigationLimits,
  };
  const paceMs = options.paceMs ?? 1100;
  let args: ExplainRequest;
  try {
    args = ExplainRequestSchema.parse(input);
    serviceCollectionLimits(ports);
    if (!Number.isFinite(paceMs) || paceMs < 0 || paceMs > 5000) throw Error();
  } catch {
    return {
      status: 'error',
      error: { code: 'invalid_input', message: 'Invalid investigation request or execution limits.' },
    };
  }
  try {
    const report: InvestigationReport = await explainProblem(ports, args, paceMs);
    return { status: report.status, report };
  } catch (error) {
    return {
      status: 'error',
      error:
        error instanceof InvestigationContractError
          ? { code: 'invalid_output', message: 'Investigation output contract validation failed.' }
          : { code: 'execution_failed', message: 'Investigation unavailable; no diagnostic report produced.' },
    };
  }
}
