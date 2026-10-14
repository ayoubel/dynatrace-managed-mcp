import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { EvidenceSchemaV1 } from '../../contracts/evidence';
import { InvestigationSnapshotSchemaV1, assertEvidenceReferences } from '../../contracts/investigation';

// Additive validators for the existing wire format. Unknown legacy fields are retained.
const item = z
  .object({
    title: z.string(),
    text: z.string(),
    certainty: z.enum(['published', 'observed', 'unknown', 'conditional', 'hypothesis']),
    evidenceRefs: z.array(z.string()),
    condition: z.string().optional(),
    action: z.string().optional(),
  })
  .catchall(z.any());
const window = z.object({ from: z.number().finite(), to: z.number().finite() });
const measure = z.object({ value: z.number().finite(), unit: z.string(), text: z.string() });
export const ExplainReportSchemaV1 = z
  .object({
    version: z.literal(1),
    mode: z.literal('deterministic'),
    plan: z.string(),
    whatHappened: z
      .object({ summary: z.string(), status: z.string(), severity: z.string(), evidenceRefs: z.array(z.string()) })
      .catchall(z.any()),
    impact: z
      .object({
        affectedEntities: z.array(z.string()),
        impactedEntities: z.array(z.string()),
        unknowns: z.array(z.string()),
        evidenceRefs: z.array(z.string()),
      })
      .catchall(z.any()),
    whyItHappened: z
      .object({
        conclusion: item,
        mechanism: item,
        observations: z.array(item),
        hypotheses: z.array(item),
        unknowns: z.array(z.string()),
        comparisons: z.array(
          z
            .object({
              title: z.string(),
              metricId: z.string(),
              entityId: z.string(),
              aggregation: z.string(),
              baseline: measure,
              incident: measure,
              windows: z.object({ baseline: window, incident: window }),
              certainty: z.literal('observed'),
              evidenceRefs: z.array(z.string()),
            })
            .catchall(z.any()),
        ),
      })
      .catchall(z.any()),
    remediation: z
      .object({
        execution: z.literal('proposal-only'),
        immediate: z.array(item),
        shortTerm: z.array(item),
        prevention: z.array(item),
      })
      .catchall(z.any()),
    collection: z
      .object({
        observedAt: z.string().datetime(),
        bounded: z.literal(true),
        steps: z.array(
          z
            .object({ id: z.string(), task: z.string(), status: z.string(), reason: z.string().optional() })
            .catchall(z.any()),
        ),
      })
      .catchall(z.any()),
  })
  .catchall(z.any());
export const InvestigationReportSchema = z
  .object({
    version: z.literal(1),
    status: z.enum(['completed', 'partial']),
    investigationId: z.string().uuid(),
    environment: z.object({ alias: z.string(), url: z.string().url() }),
    problem: z.object({ id: z.string() }).catchall(z.any()),
    evidence: z.array(z.object({ id: z.string(), kind: z.string(), provenance: EvidenceSchemaV1 }).catchall(z.any())),
    investigation: InvestigationSnapshotSchemaV1,
    explain: ExplainReportSchemaV1,
    llm: z.object({ status: z.literal('disabled') }).catchall(z.any()),
    limitations: z.array(z.string()),
  })
  .catchall(z.any());
export type ExplainReport = z.infer<typeof ExplainReportSchemaV1>;
export type InvestigationReport = z.infer<typeof InvestigationReportSchema>;
export class InvestigationContractError extends Error {
  constructor() {
    super('Investigation output contract validation failed');
  }
}
/** Validate without projecting away legacy fields or changing their values. */
export function validateInvestigationReport(value: unknown): InvestigationReport {
  const parsed = InvestigationReportSchema.safeParse(value);
  if (!parsed.success) throw new InvestigationContractError();
  const report = value as InvestigationReport;
  try {
    const ids = new Set(report.evidence.map((e) => e.id));
    if (
      ids.size !== report.evidence.length ||
      report.status !== report.investigation.status ||
      report.investigationId !== report.investigation.investigationId ||
      report.problem.id !== report.investigation.problemId ||
      !isDeepStrictEqual(report.environment, report.investigation.environment) ||
      report.evidence.length !== report.investigation.evidence.length
    )
      throw new InvestigationContractError();
    for (const proof of report.evidence) {
      const canonical = report.investigation.evidence.find((e) => e.id === proof.id);
      if (
        proof.id !== proof.provenance.id ||
        proof.kind !== proof.provenance.type ||
        !isDeepStrictEqual(canonical, proof.provenance)
      )
        throw new InvestigationContractError();
    }
    assertEvidenceReferences(report, ids);
  } catch {
    throw new InvestigationContractError();
  }
  return report;
}
