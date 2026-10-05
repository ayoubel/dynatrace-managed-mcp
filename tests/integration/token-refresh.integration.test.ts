import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';

/** Full stdio transport and real tool registry, using fake credentials and a loopback API only. */
describe('Local token rotation over MCP', () => {
  let api: Server, dir: string, client: Client, transport: StdioClientTransport;
  let lookups = 0,
    versionRequests = 0,
    notifications = 0,
    writeScopes = true;
  const dashboardTokens: string[] = [];
  let onNotification: (() => void) | undefined;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mcp-token-integration-'));
    api = createServer((req, res) => {
      const token = String(req.headers.authorization).replace('Api-Token ', '');
      res.setHeader('Content-Type', 'application/json');
      if (req.url?.endsWith('/api/v2/apiTokens/lookup')) {
        lookups++;
        const scopes =
          token === 'reader' ? ['problems.read'] : writeScopes ? ['ReadConfig', 'WriteConfig'] : ['ReadConfig'];
        res.end(JSON.stringify({ enabled: token !== 'invalid', scopes }));
      } else if (req.url?.endsWith('/api/v1/config/clusterversion')) {
        versionRequests++;
        res.statusCode = 403;
        res.end(JSON.stringify({ error: { message: 'Token lacks cluster-version permission' } }));
      } else if (req.url?.endsWith('/api/config/v1/dashboards')) {
        dashboardTokens.push(token);
        res.end(JSON.stringify({ dashboards: [] }));
      } else {
        res.statusCode = 404;
        res.end('{}');
      }
    });
    await new Promise<void>((done) => api.listen(0, '127.0.0.1', done));
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify([
        {
          apiEndpointUrl: `http://127.0.0.1:${(api.address() as AddressInfo).port}`,
          environmentId: 'env',
          alias: 'test',
          apiToken: '${ROTATING_TOKEN}',
        },
      ]),
    );
    writeFileSync(join(dir, '.env'), 'ROTATING_TOKEN=reader\n');
    const env = Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
    );
    transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--env-file=' + join(dir, '.env'), resolve('dist/index.js')],
      env: {
        ...env,
        DT_CONFIG_FILE: join(dir, 'config.json'),
        DT_MCP_TOKEN_ENV_FILE: join(dir, '.env'),
        DT_MCP_FILTER_TOKEN_TOOLS: 'true',
        DT_MCP_SCOPE_REFRESH_MS: '1000',
        DT_MCP_ENABLE_TELEMETRY: 'false',
        LOG_OUTPUT: 'disabled',
      },
      stderr: 'pipe',
    });
    client = new Client({ name: 'rotation-test', version: '1.0.0' });
    client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      notifications++;
      onNotification?.();
    });
    await client.connect(transport);
  });
  afterAll(async () => {
    await client?.close();
    await transport?.close();
    await new Promise<void>((done) => api?.close(() => done()));
    rmSync(dir, { recursive: true, force: true });
  });
  test('rotates, updates tools, rejects invalid credentials, recovers and detects same-token scope changes', async () => {
    const names = async () => (await client.listTools()).tools.map((tool) => tool.name);
    expect(await names()).toContain('dynatrace_managed_list_problems');
    expect(await names()).not.toContain('dynatrace_managed_update_dashboard');
    expect(lookups).toBe(1);
    expect(versionRequests).toBe(0);
    writeFileSync(join(dir, '.env'), 'ROTATING_TOKEN=writer\n');
    expect(await names()).toContain('dynatrace_managed_update_dashboard');
    expect(await names()).not.toContain('dynatrace_managed_list_problems');
    await client.callTool({ name: 'dynatrace_managed_list_dashboards', arguments: { environment_alias: 'test' } });
    expect(dashboardTokens).toEqual(['writer']);
    expect(lookups).toBe(2);
    const prompts = await client.listPrompts();
    expect(prompts.prompts.map((p) => p.name)).toContain('service-health');
    const prompt = await client.getPrompt({
      name: 'service-health',
      arguments: { environment_alias: 'test', target: 'payments', owner: 'operations' },
    });
    expect(JSON.stringify(prompt)).toContain('design');
    writeFileSync(join(dir, '.env'), 'ROTATING_TOKEN=invalid\n');
    const rejected = await client.callTool({
      name: 'dynatrace_managed_list_dashboards',
      arguments: { environment_alias: 'test' },
    });
    expect(rejected.isError).toBe(true);
    expect(dashboardTokens).toHaveLength(1);
    expect(await names()).toHaveLength(0);
    writeFileSync(join(dir, '.env'), 'ROTATING_TOKEN=writer\n');
    expect(await names()).toContain('dynatrace_managed_update_dashboard');
    writeScopes = false;
    await new Promise<void>((done) => setTimeout(done, 1100));
    expect(await names()).not.toContain('dynatrace_managed_update_dashboard');
    expect(await names()).toContain('dynatrace_managed_list_dashboards');
    expect(notifications).toBeGreaterThan(0);
  });
  test('idle poll sends a tool-list change without a discovery request', async () => {
    const changed = new Promise<void>((done, reject) => {
      const timeout = setTimeout(() => reject(new Error('Missing idle tool-list notification')), 6500);
      onNotification = () => {
        clearTimeout(timeout);
        done();
      };
    });
    writeFileSync(join(dir, '.env'), 'ROTATING_TOKEN=reader\n');
    try {
      await changed;
      expect((await client.listTools()).tools.map((tool) => tool.name)).toContain('dynatrace_managed_list_problems');
    } finally {
      onNotification = undefined;
    }
  });
});
