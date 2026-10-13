import { z } from 'zod';
import { EvidenceSchemaV1 } from '../evidence';
export const ExplainRequestSchema = z
  .object({
    environment_alias: z.string().min(1).max(200),
    problemId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),
    investigationId: z.string().uuid().optional(),
  })
  .strict();
export type ExplainRequest = z.infer<typeof ExplainRequestSchema>;
export const InvestigationSnapshotSchemaV1 = z
  .object({
    schemaVersion: z.literal('1.0'),
    investigationId: z.string().uuid(),
    problemId: z.string(),
    environment: z.object({ alias: z.string().min(1), url: z.string().url() }),
    status: z.enum(['completed', 'partial']),
    generatedAt: z.string().datetime(),
    evidence: z.array(EvidenceSchemaV1),
    limitations: z.array(z.string()),
    errors: z.array(
      z.object({ collectionId: z.string(), code: z.literal('collection_unavailable'), message: z.string() }),
    ),
    conclusions: z.array(
      z.object({
        statement: z.string(),
        certainty: z.enum(['observed', 'published', 'hypothesis', 'unknown', 'conditional']),
        evidenceRefs: z.array(z.string()),
      }),
    ),
  })
  .superRefine((snapshot, ctx) => {
    const ids = new Set<string>();
    for (const evidence of snapshot.evidence) {
      if (ids.has(evidence.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate evidence ID' });
      ids.add(evidence.id);
      if (
        evidence.environment.alias !== snapshot.environment.alias ||
        evidence.environment.url !== snapshot.environment.url
      )
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Evidence environment mismatch' });
    }
    for (const conclusion of snapshot.conclusions)
      for (const ref of conclusion.evidenceRefs)
        if (!ids.has(ref)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Unresolved evidence reference' });
  });
export type InvestigationSnapshotV1 = z.infer<typeof InvestigationSnapshotSchemaV1>;
export function assertEvidenceReferences(report: unknown, ids: ReadonlySet<string>): void {
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'evidenceRefs') {
        if (!Array.isArray(child) || child.some((ref) => typeof ref !== 'string' || !ids.has(ref)))
          throw new Error('Invalid investigation evidence references');
      } else if (child && typeof child === 'object') visit(child);
    }
  }
  visit(report);
}
