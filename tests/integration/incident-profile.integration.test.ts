import { spawn } from 'node:child_process';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';

describe('Incident Intelligence over the existing MCP adapter', () => {
  let api: Server, client: Client, transport: StdioClientTransport;
  const requests: Array<{ method?: string; path: string }> = [];
  beforeAll(async () => {
    api = createServer((req, res) => {
      requests.push({ method: req.method, path: req.url || '' });
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/e/env/api/v2/apiTokens/lookup')
        return res.end(
          JSON.stringify({
            enabled: true,
            scopes: ['problems.read', 'entities.read', 'metrics.read', 'events.read', 'WriteConfig', 'slo.write'],
          }),
        );
      if (req.url === '/e/env/api/v1/config/clusterversion') return res.end(JSON.stringify({ version: '1.346.0' }));
      if (req.url?.startsWith('/e/env/api/v2/problems/problem'))
        return res.end(
          JSON.stringify({
            problemId: 'problem',
            title: 'Minimal',
            status: 'CLOSED',
            startTime: Date.now() - 600000,
            endTime: Date.now() - 300000,
            affectedEntities: [],
            evidenceDetails: { details: [], totalCount: 0 },
            impactAnalysis: { impacts: [] },
          }),
        );
      if (req.url?.startsWith('/e/env/api/v2/problems')) return res.end(JSON.stringify({ problems: [] }));
      if (req.url?.startsWith('/e/env/api/v2/entities')) return res.end(JSON.stringify({ entities: [] }));
      if (req.url?.startsWith('/e/env/api/v2/metrics')) return res.end(JSON.stringify({ metrics: [] }));
      if (req.url?.startsWith('/e/env/api/v2/events')) return res.end(JSON.stringify({ events: [] }));
      res.statusCode = 404;
      res.end('{}');
    });
    await new Promise<void>((done) => api.listen(0, '127.0.0.1', done));
    const env = Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
    );
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve('dist/index.js')],
      env: {
        ...env,
        DT_ENVIRONMENT_CONFIGS: JSON.stringify([
          {
            apiEndpointUrl: `http://127.0.0.1:${(api.address() as AddressInfo).port}`,
            environmentId: 'env',
            alias: 'test',
            apiToken: 'fake-reader',
          },
        ]),
        DT_MCP_PROFILE: 'incident-intelligence',
        DT_MCP_FILTER_TOKEN_TOOLS: 'true',
        DT_MCP_OLLAMA_ENABLED: 'true',
        DT_MCP_ENABLE_TELEMETRY: 'false',
        LOG_OUTPUT: 'disabled',
      },
      stderr: 'pipe',
    });
    client = new Client({ name: 'incident-profile-test', version: '1.0.0' });
    await client.connect(transport);
  });
  afterAll(async () => {
    await client?.close();
    await transport?.close();
    await new Promise<void>((done) => api?.close(() => done()));
  });
  test('strict discovery and execution block writes and confirmation with a write-capable token', async () => {
    const tools = (await client.listTools()).tools;
    expect(tools.some((t) => t.name === 'dynatrace_managed_explain_problem')).toBe(true);
    expect(tools.some((t) => t.name === 'dynatrace_managed_get_environments_info')).toBe(true);
    const catalog = await client.callTool({ name: 'dynatrace_managed_get_environments_info', arguments: {} });
    expect(JSON.stringify(catalog)).toContain('Version: unknown');
    expect(JSON.stringify(catalog)).not.toContain('Minimum Version Check: PASSED');
    expect(
      tools.every((t) => t.annotations?.readOnlyHint === true && !/confirm|create|update|converse/.test(t.name)),
    ).toBe(true);
    for (const name of ['create_dashboard', 'update_dashboard', 'create_slo', 'confirm_conversation_action']) {
      const result = await client.callTool({
        name: 'dynatrace_managed_' + name,
        arguments: { environment_alias: 'test' },
      });
      expect(result.isError).toBe(true);
    }
    expect(requests.filter((r) => r.method !== 'GET' && !r.path.endsWith('/apiTokens/lookup'))).toEqual([]);
  });
  test('Explain still returns legacy fields plus the validated snapshot, with Ollama forced off', async () => {
    const response = await client.callTool({
      name: 'dynatrace_managed_explain_problem',
      arguments: { environment_alias: 'test', problemId: 'problem' },
    });
    expect(response.isError).not.toBe(true);
    const report = JSON.parse((response.content as Array<{ text: string }>)[0].text);
    expect(report.version).toBe(1);
    expect(report.explain.mode).toBe('deterministic');
    expect(report.investigation.schemaVersion).toBe('1.0');
    expect(report.llm.status).toBe('disabled');
  });
  test('the same profile blocks writes over the stateless HTTP MCP adapter', async () => {
    const reserve = createServer();
    await new Promise<void>((done) => reserve.listen(0, '127.0.0.1', done));
    const port = (reserve.address() as AddressInfo).port;
    await new Promise<void>((done) => reserve.close(() => done()));
    const child = spawn(process.execPath, [resolve('dist/index.js'), '--http', '--port', String(port)], {
      env: {
        ...process.env,
        DT_MCP_PROFILE: 'incident-intelligence',
        DT_MCP_FILTER_TOKEN_TOOLS: 'false',
        DT_MCP_OLLAMA_ENABLED: 'true',
        DT_MCP_ENABLE_TELEMETRY: 'false',
        LOG_OUTPUT: 'disabled',
        DT_ENVIRONMENT_CONFIGS: JSON.stringify([
          {
            apiEndpointUrl: `http://127.0.0.1:${(api.address() as AddressInfo).port}`,
            environmentId: 'env',
            alias: 'test',
          },
        ]),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const httpTransport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
      requestInit: { headers: { 'X-Dynatrace-Tokens': 'test=fake-reader' } },
    });
    const httpClient = new Client({ name: 'incident-http-test', version: '1.0.0' });
    try {
      let ready = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        if (child.exitCode !== null) throw Error('HTTP server exited during startup');
        try {
          await fetch(`http://127.0.0.1:${port}/mcp`);
          ready = true;
          break;
        } catch {
          await new Promise((done) => setTimeout(done, 100));
        }
      }
      if (!ready) throw Error('HTTP server startup timeout');
      await httpClient.connect(httpTransport);
      const tools = (await httpClient.listTools()).tools;
      expect(tools.some((t) => t.name === 'dynatrace_managed_explain_problem')).toBe(true);
      expect(
        tools.every((t) => t.annotations?.readOnlyHint === true && !/confirm|create|update|converse/.test(t.name)),
      ).toBe(true);
      const refused = await httpClient.callTool({
        name: 'dynatrace_managed_confirm_conversation_action',
        arguments: { environment_alias: 'test', approvalId: 'stale' },
      });
      expect(refused.isError).toBe(true);
    } finally {
      await httpClient.close();
      await httpTransport.close();
      if (child.exitCode === null) {
        const stopped = new Promise<void>((done) => child.once('exit', () => done()));
        child.kill('SIGTERM');
        const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
        await stopped;
        clearTimeout(timer);
      }
    }
  }, 15000);
  test('capabilities are exposed on the same adapter and stay caller-bound', async () => {
    const response = await client.callTool({
      name: 'dynatrace_managed_get_environment_capabilities',
      arguments: { environment_alias: 'test' },
    });
    expect(response.isError).not.toBe(true);
    const matrix = JSON.parse((response.content as Array<{ text: string }>)[0].text);
    expect(matrix.version.value).toBe('1.346.0');
    expect(matrix.capabilities[0].status).toBe('available');
    const denied = await client.callTool({
      name: 'dynatrace_managed_get_environment_capabilities',
      arguments: { environment_alias: 'outside' },
    });
    expect(denied.isError).toBe(true);
  });
});
