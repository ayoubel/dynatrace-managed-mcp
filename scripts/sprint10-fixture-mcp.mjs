// Test-only MCP adapter: synthetic connector ports; never configures Managed credentials.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createRequire } from 'node:module';
import { z } from 'zod';
const require = createRequire(import.meta.url);
const build = process.env.SPRINT10_FIXTURE_BUILD;
if (!build) throw Error('Isolated fixture build required');
const { executeInvestigation } = require(build + '/src/core/investigation-engine/index.js');
const { corpus, scenarioPorts } = require(build + '/src/core/__tests__/fixtures/diagnostic-ports.js');
const server = new McpServer({ name: 'sprint10-synthetic', version: '1.0.0' });
const annotations = { readOnlyHint: true, destructiveHint: false };
server.registerTool('dynatrace_managed_get_environments_info', { annotations }, async () => ({
  content: [
    {
      type: 'text',
      text: '- Environment Alias: prod\n- API URL: https://managed.example/e/fixture\n- Valid Environment: Yes',
    },
  ],
}));
for (const name of ['dynatrace_managed_investigate_problem', 'dynatrace_managed_explain_problem']) {
  server.registerTool(
    name,
    {
      annotations,
      inputSchema: {
        environment_alias: z.literal('prod'),
        problemId: z.string(),
        investigationId: z.string().optional(),
      },
    },
    async (args) => {
      const { deps, problem } = scenarioPorts(corpus.scenarios.find((s) => s.id === 'S01'));
      if (args.problemId !== problem.problemId) throw Error('Unknown fixture problem');
      const result = await executeInvestigation(deps, args, { paceMs: 0 });
      if (result.status === 'error')
        return { isError: true, content: [{ type: 'text', text: 'Error: fixture collection unavailable' }] };
      return { content: [{ type: 'text', text: JSON.stringify(result.report) }] };
    },
  );
}
await server.connect(new StdioServerTransport());
