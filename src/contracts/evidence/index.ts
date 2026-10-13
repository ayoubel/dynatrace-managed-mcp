import { z } from 'zod';
const finite = z.number().finite();
const parameter = z.union([z.string(), finite, z.boolean()]);
export const EvidenceSourceSchema = z.object({
  api: z.enum(['problems', 'entities', 'events', 'metrics', 'logs', 'settings']),
  method: z.literal('GET'),
  endpoint: z.string().startsWith('/api/'),
  parameters: z.record(parameter),
});
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;
export const EvidenceSchemaV1 = z.object({
  schemaVersion: z.literal('1.0'),
  id: z.string().min(1),
  type: z.string().min(1),
  environment: z.object({ alias: z.string().min(1), url: z.string().url() }),
  entityId: z.string().nullable(),
  source: EvidenceSourceSchema.nullable(),
  collectedAt: z.string().datetime(),
  timeRange: z.object({ from: z.union([finite, z.string()]).nullable(), to: z.union([finite, z.string()]).nullable() }),
  measurement: z
    .object({
      metricId: z.string().nullable(),
      value: finite.nullable(),
      unit: z.string().nullable(),
      aggregation: z.string().nullable(),
      samples: z.array(z.object({ timestamp: finite, value: finite })).max(100),
      summary: z.record(finite),
    })
    .nullable(),
  reference: z.object({ url: z.string().url(), kind: z.literal('problem') }).nullable(),
  limitations: z.array(z.string()),
  errors: z.array(z.object({ code: z.string(), message: z.string() })),
});
export type EvidenceV1 = z.infer<typeof EvidenceSchemaV1>;
