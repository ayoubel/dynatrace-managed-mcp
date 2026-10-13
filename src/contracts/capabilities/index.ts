import { z } from 'zod';
export const CapabilityMatrixSchemaV1 = z.object({
  schemaVersion: z.literal('1.0'),
  environment: z.string().min(1),
  collectedAt: z.string().datetime(),
  version: z.object({
    status: z.enum(['observed', 'unverified']),
    value: z.string().nullable(),
    source: z.literal('/api/v1/config/clusterversion'),
  }),
  scopes: z.object({
    status: z.enum(['observed', 'unverified']),
    values: z.array(z.string()),
    source: z.enum(['token-lookup', 'validated-token-snapshot', 'none']),
  }),
  capabilities: z.array(
    z.object({
      name: z.string(),
      endpoint: z.string(),
      requiredScope: z.string(),
      status: z.enum(['available', 'unavailable', 'unverified']),
      reason: z.string(),
    }),
  ),
  errors: z.array(z.object({ probe: z.string(), code: z.string(), status: z.number().int().optional() })),
  limitations: z.array(z.string()),
  requests: z.number().int().nonnegative(),
});
export type CapabilityMatrixV1 = z.infer<typeof CapabilityMatrixSchemaV1>;
