// Acceptance-only SDK adapter. All connector data comes from the existing synthetic corpus.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import { z } from 'zod';
const require = createRequire(import.meta.url);
const build = process.env.SPRINT101_BUILD;
if (!build || !process.env.SPRINT101_CONTROL) throw Error('Isolated acceptance configuration required');
const { executeInvestigation } = require(build + '/src/core/investigation-engine/index.js');
const { corpus, scenarioPorts } = require(build + '/src/core/__tests__/fixtures/diagnostic-ports.js');
const ns = process.env.SPRINT101_NAMESPACE || 'first';
const url = 'https://managed.example/e/' + ns;
const server = new McpServer({ name: 'sprint10.1-synthetic', version: '1.0.0' });
const annotations = { readOnlyHint: true, destructiveHint: false };
const text = (value) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
});
const audit = (value) => fs.appendFile(process.env.SPRINT101_AUDIT, JSON.stringify({ namespace: ns, ...value }) + '\n');
async function control() {
  return JSON.parse(await fs.readFile(process.env.SPRINT101_CONTROL, 'utf8'));
}
server.registerTool('dynatrace_managed_get_environments_info', { annotations }, async () => {
  await audit({ tool: 'environments' });
  return text('- Environment Alias: prod\n- API URL: ' + url + '\n- Valid Environment: Yes');
});
server.registerTool(
  'dynatrace_managed_list_problems',
  { annotations, inputSchema: { environment_alias: z.literal('prod') } },
  async () => {
    await audit({ tool: 'list_problems' });
    return text(
      'Listing 22 problems from environment prod.\n' +
        corpus.scenarios
          .map((s) => 'problemId: ' + s.id + '\ndisplayId: ' + s.id + '\ntitle: Synthetic ' + s.id + '\nstatus: OPEN')
          .join('\n'),
    );
  },
);
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
      const c = await control();
      await audit({ tool: name, args });
      if (c.fail) return { ...text('Error: acceptance private upstream detail'), isError: true };
      if (c.malformed) return text('{bad-json');
      if (c.expire && args.investigationId)
        return {
          ...text('Error: Investigation expired or unavailable in this environment; start a new investigation'),
          isError: true,
        };
      const s = corpus.scenarios.find((s) => s.id === args.problemId);
      if (!s) return { ...text('Error: unknown fixture'), isError: true };
      const { deps, problem, reads } = scenarioPorts(s);
      problem.problemId = args.problemId;
      deps.authClientManager.getBaseUrl = () => url;
      deps.investigationOwner = 'acceptance-' + ns;
      const result = await executeInvestigation(deps, args, { paceMs: 0, limits: deps.investigationLimits });
      await audit({ scenario: s.id, status: result.status, reads: reads.length });
      if (result.status === 'error') return { ...text('Error: fixture execution unavailable'), isError: true };
      return text(result.report);
    },
  );
}
await server.connect(new StdioServerTransport());
