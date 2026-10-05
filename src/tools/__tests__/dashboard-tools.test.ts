import { dashboardDefinition, registerDashboardTools } from '../dashboard-tools';
import { ToolContext } from '../context';
import { permittedTool } from '../token-tool-access';

const dashboard = { dashboardMetadata: { name: 'Test', owner: 'owner' },
  tiles: [{ name: 'Notes', tileType: 'MARKDOWN', bounds: { top: 0, left: 0, width: 300, height: 150 }, markdown: 'Test' }] };
function fixture() {
  const callbacks = new Map<string, (args: any) => Promise<string>>();
  const post = jest.fn().mockResolvedValue({ id: 'abc' });
  const get = jest.fn().mockResolvedValue(dashboard);
  registerDashboardTools({
    tool: (name: string, _description: unknown, _schema: unknown, _annotations: unknown, cb: any) => callbacks.set(name, cb),
    envAliasValidate: (alias: string) => alias === 'test',
    authClientManager: { clients: [{ alias: 'test', dashboardBaseUrl: 'https://example/e/test', postConfiguration: post, makeRequest: get }], tokenFor: () => 'fake-token' },
  } as unknown as ToolContext);
  return { callbacks, post, get };
}
test('create validates before writing, then verifies and returns URL', async () => {
  const f = fixture();
  const result = JSON.parse(await f.callbacks.get('dynatrace_managed_create_dashboard')!({environment_alias:'test',dashboard}));
  expect(f.post.mock.calls.map(c => c[0])).toEqual(['/api/config/v1/dashboards/validator','/api/config/v1/dashboards']);
  expect(result).toMatchObject({created:true,verified:true,id:'abc'});
  expect(result.url).toContain('id=abc');
});
test('validation rejection prevents creation', async () => {
  const f = fixture(); f.post.mockRejectedValueOnce(new Error('Invalid tile'));
  await expect(f.callbacks.get('dynatrace_managed_create_dashboard')!({environment_alias:'test',dashboard})).rejects.toThrow('Invalid tile');
  expect(f.post).toHaveBeenCalledTimes(1);
});
test('failed read-back reports created rather than suggesting retry', async () => {
  const f = fixture(); f.get.mockRejectedValue(new Error('Forbidden'));
  const result = JSON.parse(await f.callbacks.get('dynatrace_managed_create_dashboard')!({environment_alias:'test',dashboard}));
  expect(result).toMatchObject({created:true,verified:false});
});
test('new dashboard rejects ID and preserves tile-specific JSON', () => {
  expect(dashboardDefinition.safeParse({...dashboard,id:'existing'}).success).toBe(false);
  expect(dashboardDefinition.parse(dashboard).tiles[0].markdown).toBe('Test');
});
test('only mapped dashboard write operation is exposed with WriteConfig', () => {
  expect(permittedTool('dynatrace_managed_create_dashboard', false, [['WriteConfig']])).toBe(true);
  expect(permittedTool('dynatrace_managed_create_dashboard', false, [['ReadConfig']])).toBe(false);
  expect(permittedTool('unknown', false, [['WriteConfig']])).toBe(false);
});
