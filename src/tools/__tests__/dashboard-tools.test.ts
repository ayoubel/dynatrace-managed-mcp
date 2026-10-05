import { dashboardDefinition, registerDashboardTools } from '../dashboard-tools';
import { ToolContext } from '../context';
import { permittedTool } from '../token-tool-access';

const dashboard = {
  dashboardMetadata: { name: 'Test', owner: 'owner' },
  tiles: [
    { name: 'Notes', tileType: 'MARKDOWN', bounds: { top: 0, left: 0, width: 300, height: 150 }, markdown: 'Test' },
  ],
};
function fixture() {
  const callbacks = new Map<string, (args: any) => Promise<string>>();
  const post = jest.fn().mockResolvedValue({ id: 'abc' });
  const put = jest.fn().mockResolvedValue(undefined);
  const get = jest.fn().mockResolvedValue(dashboard);
  registerDashboardTools({
    tool: (name: string, _description: unknown, _schema: unknown, _annotations: unknown, cb: any) =>
      callbacks.set(name, cb),
    envAliasValidate: (alias: string) => alias === 'test',
    authClientManager: {
      clients: [
        {
          alias: 'test',
          apiBaseUrl: 'https://example/e/test',
          postConfiguration: post,
          putConfiguration: put,
          makeRequest: get,
        },
      ],
      tokenFor: () => 'fake-token',
    },
  } as unknown as ToolContext);
  return { callbacks, post, put, get };
}
test('create validates before writing, then verifies and returns URL', async () => {
  const f = fixture();
  const result = JSON.parse(
    await f.callbacks.get('dynatrace_managed_create_dashboard')!({ environment_alias: 'test', dashboard }),
  );
  expect(f.post.mock.calls.map((c) => c[0])).toEqual([
    '/api/config/v1/dashboards/validator',
    '/api/config/v1/dashboards',
  ]);
  expect(result).toMatchObject({ created: true, verified: true, id: 'abc' });
  expect(result.url).toContain('id=abc');
});
test('validation rejection prevents creation', async () => {
  const f = fixture();
  f.post.mockRejectedValueOnce(new Error('Invalid tile'));
  await expect(
    f.callbacks.get('dynatrace_managed_create_dashboard')!({ environment_alias: 'test', dashboard }),
  ).rejects.toThrow('Invalid tile');
  expect(f.post).toHaveBeenCalledTimes(1);
});
test('failed read-back reports created rather than suggesting retry', async () => {
  const f = fixture();
  f.get.mockRejectedValue(new Error('Forbidden'));
  const result = JSON.parse(
    await f.callbacks.get('dynatrace_managed_create_dashboard')!({ environment_alias: 'test', dashboard }),
  );
  expect(result).toMatchObject({ created: true, verified: false });
});
test('new dashboard rejects ID and preserves tile-specific JSON', () => {
  expect(dashboardDefinition.safeParse({ ...dashboard, id: 'existing' }).success).toBe(false);
  expect(dashboardDefinition.parse(dashboard).tiles[0].markdown).toBe('Test');
});
test('only mapped dashboard write operation is exposed with WriteConfig', () => {
  expect(permittedTool('dynatrace_managed_create_dashboard', false, [['WriteConfig']])).toBe(true);
  expect(permittedTool('dynatrace_managed_create_dashboard', false, [['ReadConfig']])).toBe(false);
  expect(permittedTool('unknown', false, [['WriteConfig']])).toBe(false);
});

const dashboardId = '5649c3bb-44c7-4373-b15b-77950f77b31a';
const args = { environment_alias: 'test', dashboardId, dashboard };
const tool = 'dynatrace_managed_update_dashboard';
test('update checks existence, validates, PUTs full payload and verifies in order', async () => {
  const f = fixture();
  const endpoint = `/api/config/v1/dashboards/${dashboardId}`;
  const result = JSON.parse(await f.callbacks.get(tool)!(args));
  expect(f.post).toHaveBeenCalledWith(`${endpoint}/validator`, 'fake-token', { ...dashboard, id: dashboardId });
  expect(f.put).toHaveBeenCalledWith(endpoint, 'fake-token', { ...dashboard, id: dashboardId });
  expect(f.get.mock.invocationCallOrder[0]).toBeLessThan(f.post.mock.invocationCallOrder[0]);
  expect(f.post.mock.invocationCallOrder[0]).toBeLessThan(f.put.mock.invocationCallOrder[0]);
  expect(f.put.mock.invocationCallOrder[0]).toBeLessThan(f.get.mock.invocationCallOrder[1]);
  expect(result).toMatchObject({ updated: true, verified: true, id: dashboardId });
});
test('mismatched ID prevents requests', async () => {
  const f = fixture();
  await expect(f.callbacks.get(tool)!({ ...args, dashboard: { ...dashboard, id: 'other' } })).rejects.toThrow(
    'must match',
  );
  expect(f.get).not.toHaveBeenCalled();
  expect(f.put).not.toHaveBeenCalled();
});
test('missing target prevents PUT', async () => {
  const f = fixture();
  f.get.mockRejectedValueOnce(new Error('Not found'));
  await expect(f.callbacks.get(tool)!(args)).rejects.toThrow('Not found');
  expect(f.post).not.toHaveBeenCalled();
  expect(f.put).not.toHaveBeenCalled();
});
test('validation rejection prevents PUT', async () => {
  const f = fixture();
  f.post.mockRejectedValueOnce(new Error('Invalid'));
  await expect(f.callbacks.get(tool)!(args)).rejects.toThrow('Invalid');
  expect(f.put).not.toHaveBeenCalled();
});
test('PUT failure is surfaced without retry', async () => {
  const f = fixture();
  f.put.mockRejectedValueOnce(new Error('Timeout'));
  await expect(f.callbacks.get(tool)!(args)).rejects.toThrow('Timeout');
  expect(f.put).toHaveBeenCalledTimes(1);
});
test('failed read-back reports successful update unverified', async () => {
  const f = fixture();
  f.get.mockResolvedValueOnce(dashboard).mockRejectedValueOnce(new Error('Forbidden'));
  expect(JSON.parse(await f.callbacks.get(tool)!(args))).toMatchObject({ updated: true, verified: false });
});
test('different read-back reports unverified', async () => {
  const f = fixture();
  f.get.mockResolvedValueOnce(dashboard).mockResolvedValueOnce({ ...dashboard, tiles: [] });
  expect(JSON.parse(await f.callbacks.get(tool)!(args))).toMatchObject({ updated: true, verified: false });
});
test('update requires read and write in all environments', () => {
  expect(permittedTool(tool, false, [['WriteConfig']])).toBe(false);
  expect(permittedTool(tool, false, [['WriteConfig', 'ReadConfig']])).toBe(true);
  expect(permittedTool(tool, false, [['WriteConfig', 'ReadConfig'], ['ReadConfig']])).toBe(false);
});
