import { z } from 'zod';
import { ToolContext } from './context';

export const sloDefinition = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(1000).optional(),
    enabled: z.literal(true),
    evaluationType: z.literal('AGGREGATE'),
    filter: z.string().min(1).max(1000),
    metricExpression: z.string().min(1).max(2000),
    metricName: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),
    target: z.number().gt(0).lt(100),
    warning: z.number().gt(0).max(100),
    timeframe: z.enum(['-1d', '-7d', '-30d']),
  })
  .strict()
  .refine((s) => s.warning >= s.target, 'Warning must be at least target');

export function registerSloWriteTools(ctx: ToolContext): void {
  const environment_alias = z
    .string()
    .refine(
      (alias) => alias !== 'ALL_ENVIRONMENTS' && !alias.includes(';') && ctx.envAliasValidate(alias),
      'Select exactly one configured environment',
    );
  const selected = (alias: string) => {
    const client = ctx.authClientManager.clients.find((c) => c.alias === alias);
    const token = ctx.authClientManager.tokenFor(alias);
    if (!client || !token || !environment_alias.safeParse(alias).success) throw new Error('Environment unavailable');
    return { client, token };
  };
  const preview = async (alias: string, input: z.infer<typeof sloDefinition>) => {
    const slo = sloDefinition.parse(input);
    const { client, token } = selected(alias);
    const response = await client.makeRequest<{ result?: { data?: { values?: (number | null)[] }[] }[] }>(
      '/api/v2/metrics/query',
      token,
      {
        metricSelector: slo.metricExpression,
        entitySelector: slo.filter,
        from: 'now' + slo.timeframe,
        to: 'now',
        resolution: 'Inf',
      },
    );
    const values =
      response.result
        ?.flatMap((r) => r.data?.flatMap((d) => d.values || []) || [])
        .filter((v) => typeof v === 'number' && Number.isFinite(v)) || [];
    const valid = values.length === 1 && values[0]! >= 0 && values[0]! <= 100;
    return {
      valid,
      value: valid ? values[0] : null,
      validationKind: 'schema-and-metrics-preflight',
      nativeSloValidation: false,
      created: false,
    };
  };
  ctx.tool<{ environment_alias: string; slo: z.infer<typeof sloDefinition> }>(
    'dynatrace_managed_preview_slo',
    'Check a Classic SLO schema and query its expression over its proposed period. Read-only historical estimate, not native SLO evaluation or a configuration validator. Does not create a SLO.',
    { environment_alias, slo: sloDefinition },
    { readOnlyHint: true },
    async ({ environment_alias: alias, slo }) => JSON.stringify(await preview(alias, slo)),
  );
  ctx.tool<{ environment_alias: string; slo: z.infer<typeof sloDefinition> }>(
    'dynatrace_managed_create_slo',
    'Create one Classic SLO only after explicit user approval of the definition. Checks expression before POST, reads back the created definition. Never retry blindly: a timeout can follow successful creation.',
    { environment_alias, slo: sloDefinition },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    async ({ environment_alias: alias, slo: input }) => {
      const slo = sloDefinition.parse(input);
      if (!(await preview(alias, slo)).valid) throw new Error('No usable historical metric value; creation blocked');
      const { client, token } = selected(alias);
      const result = await client.createSlo(token, slo);
      if (!result.id)
        return JSON.stringify({
          created: true,
          verified: false,
          warning: 'Creation accepted without readable Location ID; inspect SLO list before retrying',
        });
      try {
        const actual = await client.makeRequest<Record<string, unknown>>(
          '/api/v2/slo/' + encodeURIComponent(result.id),
          token,
        );
        const verified = Object.entries(slo).every(([k, v]) => actual[k] === v);
        return JSON.stringify({
          id: result.id,
          created: true,
          verified,
          url: client.apiBaseUrl,
          ...(!verified ? { warning: 'Read-back differs; inspect before retrying' } : {}),
        });
      } catch {
        return JSON.stringify({
          id: result.id,
          created: true,
          verified: false,
          url: client.apiBaseUrl,
          warning: 'Read-back failed; do not repeat creation',
        });
      }
    },
  );
}
