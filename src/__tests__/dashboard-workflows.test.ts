import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { registerDashboardWorkflows } from '../dashboard-workflows';
import { dashboardDefinition } from '../tools/dashboard-tools';
import type { ExecutionProfile } from '../core/execution-policy';
const all = [
  'validate_dashboard',
  'create_dashboard',
  'get_dashboard',
  'validate_dashboard_update',
  'update_dashboard',
  'explain_problem',
];
async function session(profile: ExecutionProfile = 'general', allowed = all) {
  const server = new McpServer({ name: 'regression', version: '1.0.0' });
  server.registerPrompt('continue_investigation', { argsSchema: { investigationId: z.string() } }, () => ({
    messages: [{ role: 'user', content: { type: 'text', text: 'existing continuation' } }],
  }));
  const available = new Set(allowed.map((n) => `dynatrace_managed_${n}`));
  const refreshPermissions = jest.fn(async () => {});
  const write = jest.fn(async () => ({ content: [{ type: 'text' as const, text: 'unexpected write' }] }));
  server.registerTool('dynatrace_managed_create_dashboard', { inputSchema: {} }, write);
  const refresh = registerDashboardWorkflows(server, {
    profile,
    environmentAllowed: (a) => a === 'test',
    toolAvailable: (n) => available.has(n),
    refreshPermissions,
  });
  const client = new Client({ name: 'client', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return {
    client,
    available,
    refreshPermissions,
    refresh,
    write,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}
const args = { environment_alias: 'test', target: 'synthetic', owner: 'operations' };
const names = async (s: Awaited<ReturnType<typeof session>>) =>
  (await s.client.listPrompts()).prompts.map((p) => p.name).sort();
describe('Dashboard workflows', () => {
  test('preserves continuation and defaults design without writes', async () => {
    const s = await session();
    try {
      expect(await names(s)).toEqual([
        'continue_investigation',
        'dashboard-update',
        'incident-investigation',
        'infrastructure-health',
        'service-health',
      ]);
      expect(
        JSON.stringify(
          await s.client.getPrompt({ name: 'continue_investigation', arguments: { investigationId: 'existing' } }),
        ),
      ).toContain('existing continuation');
      for (const name of ['service-health', 'infrastructure-health']) {
        const text = JSON.stringify(await s.client.getPrompt({ name, arguments: args }));
        expect(text).toContain('design');
        expect(text).toContain('now-1h');
        expect(text).toContain('Missing data remains unknown');
      }
      expect(s.write).not.toHaveBeenCalled();
      expect(s.refreshPermissions).toHaveBeenCalledTimes(2);
    } finally {
      await s.close();
    }
  });
  test('incident profile excludes dashboard prompts even with write tools', async () => {
    const s = await session('incident-intelligence');
    try {
      expect(await names(s)).toEqual(['continue_investigation']);
      await expect(s.client.getPrompt({ name: 'service-health', arguments: args })).rejects.toThrow();
    } finally {
      await s.close();
    }
  });
  test('discovery follows revocation and recovery', async () => {
    const s = await session('general', []);
    try {
      expect(await names(s)).toEqual(['continue_investigation']);
      s.available.add('dynatrace_managed_validate_dashboard');
      s.refresh();
      expect(await names(s)).toEqual(['continue_investigation', 'infrastructure-health', 'service-health']);
      s.available.add('dynatrace_managed_explain_problem');
      s.refresh();
      expect(await names(s)).toContain('incident-investigation');
      s.available.clear();
      s.refresh();
      expect(await names(s)).toEqual(['continue_investigation']);
    } finally {
      await s.close();
    }
  });
  test('design works without create; explicit creation fails closed', async () => {
    const s = await session('general', ['validate_dashboard']);
    try {
      await expect(s.client.getPrompt({ name: 'service-health', arguments: args })).resolves.toBeDefined();
      await expect(
        s.client.getPrompt({ name: 'service-health', arguments: { ...args, mode: 'create' } }),
      ).rejects.toThrow('current permissions');
      expect(s.write).not.toHaveBeenCalled();
    } finally {
      await s.close();
    }
  });
  test('retrieval refresh blocks stale grants and refresh failures', async () => {
    const s = await session();
    try {
      s.refreshPermissions.mockImplementationOnce(async () => {
        s.available.clear();
      });
      await expect(s.client.getPrompt({ name: 'service-health', arguments: args })).rejects.toThrow(
        'current permissions',
      );
      s.available.add('dynatrace_managed_validate_dashboard');
      s.refreshPermissions.mockRejectedValueOnce(new Error('credential refresh failed'));
      await expect(s.client.getPrompt({ name: 'service-health', arguments: args })).rejects.toThrow(
        'credential refresh failed',
      );
      expect(s.write).not.toHaveBeenCalled();
    } finally {
      await s.close();
    }
  });
  test.each(['ALL_ENVIRONMENTS', 'test;other', 'unknown'])('rejects environment %s', async (alias) => {
    const s = await session();
    try {
      await expect(
        s.client.getPrompt({ name: 'service-health', arguments: { ...args, environment_alias: alias } }),
      ).rejects.toThrow();
    } finally {
      await s.close();
    }
  });
  test('rejects invalid mode and dashboard ID', async () => {
    const s = await session();
    try {
      await expect(
        s.client.getPrompt({ name: 'service-health', arguments: { ...args, mode: 'delete' } }),
      ).rejects.toThrow();
      await expect(
        s.client.getPrompt({
          name: 'dashboard-update',
          arguments: { environment_alias: 'test', dashboardId: 'bad', changes: 'synthetic' },
        }),
      ).rejects.toThrow();
    } finally {
      await s.close();
    }
  });
  test('incident uses shared Explain V1 evidence and continuation only', async () => {
    const s = await session();
    try {
      const text = JSON.stringify(
        await s.client.getPrompt({
          name: 'incident-investigation',
          arguments: { environment_alias: 'test', problemId: 'PROBLEM-123', owner: 'operations' },
        }),
      );
      for (const value of [
        'dynatrace_managed_explain_problem',
        'dynatrace_managed_continue_investigation',
        'Do not run a parallel investigation',
        'Preserve partial results, unknowns',
      ])
        expect(text).toContain(value);
      expect(s.write).not.toHaveBeenCalled();
    } finally {
      await s.close();
    }
  });
  test('update needs every current read, validation and write capability', async () => {
    const s = await session();
    try {
      const input = {
        environment_alias: 'test',
        dashboardId: 'a541e62f-99a2-43de-93b1-8d8b1ceee660',
        changes: 'one tile',
      };
      expect(JSON.stringify(await s.client.getPrompt({ name: 'dashboard-update', arguments: input }))).toContain(
        'Preserve filters, sharing, owner',
      );
      for (const capability of ['get_dashboard', 'validate_dashboard_update', 'update_dashboard']) {
        s.available.delete('dynatrace_managed_' + capability);
        await expect(s.client.getPrompt({ name: 'dashboard-update', arguments: input })).rejects.toThrow();
        s.refresh();
        expect(await names(s)).not.toContain('dashboard-update');
        s.available.add('dynatrace_managed_' + capability);
        s.refresh();
      }
      expect(s.write).not.toHaveBeenCalled();
    } finally {
      await s.close();
    }
  });
  test.each(['service-health', 'infrastructure-health', 'incident-investigation'])(
    '%s template has valid local shape and packaged guidance',
    (name) => {
      const root = join(__dirname, '../..'),
        template = JSON.parse(readFileSync(join(root, 'examples/dashboards', name + '.json'), 'utf8'));
      expect(dashboardDefinition.safeParse(template).success).toBe(true);
      expect(template.dashboardMetadata.shared).toBe(false);
      expect(template.dashboardMetadata.owner).toBe('REPLACE_WITH_OWNER');
      const files = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).files;
      expect(files).toContain('examples/dashboards');
      expect(files).toContain('.github/prompts/' + name + '.prompt.md');
      expect(files).toContain('docs/dashboard-workflows.md');
    },
  );
});
