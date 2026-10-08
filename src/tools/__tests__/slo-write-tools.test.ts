import { registerSloWriteTools, sloDefinition } from '../slo-write-tools';
import { ToolContext } from '../context';
import { permittedTool } from '../token-tool-access';
import { ManagedAuthClient } from '../../authentication/managed-auth-client';
const id = '12345678-1234-1234-1234-123456789abc';
const slo = {
  name: 'API',
  enabled: true as const,
  evaluationType: 'AGGREGATE' as const,
  filter: 'entityId("SERVICE-ABC")',
  metricExpression: 'builtin:service.successes.server.rate:splitBy()',
  metricName: 'daybreak_api',
  target: 99.9,
  warning: 99.95,
  timeframe: '-7d' as const,
};
function fixture(value: number | null = 99.96) {
  const callbacks = new Map<string, (args: any) => Promise<string>>();
  const create = jest.fn().mockResolvedValue({ id });
  const get = jest
    .fn()
    .mockResolvedValueOnce({ result: [{ data: [{ values: [value] }] }] })
    .mockResolvedValue(slo);
  registerSloWriteTools({
    tool: (name: any, _d: any, _s: any, _a: any, cb: any) => callbacks.set(name, cb),
    envAliasValidate: (a: string) => a === 'prod',
    authClientManager: {
      clients: [{ alias: 'prod', apiBaseUrl: 'https://example/e/prod', makeRequest: get, createSlo: create }],
      tokenFor: () => 'fake-token',
    },
  } as unknown as ToolContext);
  return { callbacks, create, get };
}
test('preview reads history without writing and distinguishes native validation', async () => {
  const f = fixture();
  const r = JSON.parse(await f.callbacks.get('dynatrace_managed_preview_slo')!({ environment_alias: 'prod', slo }));
  expect(r).toMatchObject({ valid: true, value: 99.96, created: false, nativeSloValidation: false });
  expect(f.create).not.toHaveBeenCalled();
  expect(f.get.mock.calls[0][2]).toMatchObject({ resolution: 'Inf', entitySelector: slo.filter, from: 'now-7d' });
});
test('creation preflights before one POST and verifies read-back', async () => {
  const f = fixture();
  const r = JSON.parse(await f.callbacks.get('dynatrace_managed_create_slo')!({ environment_alias: 'prod', slo }));
  expect(r).toMatchObject({ created: true, verified: true, id });
  expect(f.create).toHaveBeenCalledTimes(1);
  expect(f.create.mock.invocationCallOrder[0]).toBeGreaterThan(f.get.mock.invocationCallOrder[0]);
});
test('no data, invalid schema and multiple environments cannot create', async () => {
  const f = fixture(null);
  await expect(f.callbacks.get('dynatrace_managed_create_slo')!({ environment_alias: 'prod', slo })).rejects.toThrow();
  expect(f.create).not.toHaveBeenCalled();
  const g = fixture();
  await expect(
    g.callbacks.get('dynatrace_managed_create_slo')!({ environment_alias: 'ALL_ENVIRONMENTS', slo }),
  ).rejects.toThrow();
  expect(g.create).not.toHaveBeenCalled();
  expect(sloDefinition.safeParse({ ...slo, warning: 99 }).success).toBe(false);
  expect(sloDefinition.safeParse({ ...slo, id }).success).toBe(false);
});
test('successful write with failed read-back remains unverified, never retried', async () => {
  const f = fixture();
  f.get.mockRejectedValueOnce(new Error('read-back forbidden')); // queued after one preflight response
  const r = JSON.parse(await f.callbacks.get('dynatrace_managed_create_slo')!({ environment_alias: 'prod', slo }));
  expect(r).toMatchObject({ created: true, verified: false, id });
  expect(f.create).toHaveBeenCalledTimes(1);
});
test('creation needs read, metrics and write scopes in each environment', () => {
  expect(permittedTool('dynatrace_managed_create_slo', false, [['slo.write']])).toBe(false);
  expect(permittedTool('dynatrace_managed_create_slo', false, [['slo.write', 'slo.read', 'metrics.read']])).toBe(true);
  expect(
    permittedTool('dynatrace_managed_create_slo', false, [['slo.write', 'slo.read', 'metrics.read'], ['slo.read']]),
  ).toBe(false);
});
test('SLO creation extracts Location ID and redacts token-bearing errors', async () => {
  const client = new ManagedAuthClient({
    apiBaseUrl: 'https://example/e/prod',
    alias: 'prod',
    minimum_version: '1.328.0',
  });
  const post = jest.fn().mockResolvedValue({ headers: { location: 'https://example/e/prod/api/v2/slo/' + id } });
  (client as any).httpClient.post = post;
  expect(await client.createSlo('secret-token', slo)).toEqual({ id });
  expect(post).toHaveBeenCalledTimes(1);
  post.mockRejectedValue(new Error('secret-token'));
  await expect(client.createSlo('secret-token', slo)).rejects.toThrow('inspect Dynatrace');
});
