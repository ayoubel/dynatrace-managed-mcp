/** Supported repository-level API; importing this module starts no transport. */
export { explainProblem } from './explain';
export { executeInvestigation } from './execute';
export type { InvestigationOutcome, InvestigationOptions, InvestigationLimits } from './execute';
export type { InvestigationDependencies, ApiPayload, ApiResults } from './dependencies';
export { validateInvestigationReport, InvestigationReportSchema, ExplainReportSchemaV1 } from './report';
export type { InvestigationReport, ExplainReport } from './report';
export {
  ExplainRequestSchema,
  InvestigationSnapshotSchemaV1,
  assertEvidenceReferences,
} from '../../contracts/investigation';
export type { ExplainRequest, InvestigationSnapshotV1 } from '../../contracts/investigation';
export { EvidenceSchemaV1 } from '../../contracts/evidence';
export type { EvidenceV1, EvidenceSource } from '../../contracts/evidence';
