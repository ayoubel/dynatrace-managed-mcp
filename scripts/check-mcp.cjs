#!/usr/bin/env node
// Read-only MCP smoke check. Validation does not persist a dashboard.
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
(async () => {
  const transport = new StdioClientTransport({
    command: '/bin/sh',
    args: [path.resolve(root, option('--launcher', 'scripts/start-local.sh'))],
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === 'string')),
      DT_MCP_NODE: process.env.DT_MCP_NODE || process.execPath,
    },
    stderr: 'inherit',
  });
  const client = new Client({ name: 'dynatrace-managed-smoke-check', version: '1.0.0' });
  try {
    await client.connect(transport);
    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    const prompts = (await client.listPrompts()).prompts.map((prompt) => prompt.name);
    const validations = {};
    if (process.argv.includes('--validate-templates')) {
      const alias = option('--alias');
      if (!alias) throw new Error('--alias is required for template validation');
      if (!tools.includes('dynatrace_managed_validate_dashboard'))
        throw new Error('Dashboard validation tool unavailable');
      for (const name of ['service-health', 'infrastructure-health', 'incident-investigation']) {
        const dashboard = JSON.parse(readFileSync(path.join(root, 'examples/dashboards', name + '.json'), 'utf8'));
        dashboard.dashboardMetadata.owner = option('--owner', 'mcp-template-validation');
        const result = await client.callTool({
          name: 'dynatrace_managed_validate_dashboard',
          arguments: { environment_alias: alias, dashboard },
        });
        if (result.isError) throw new Error(`Template validation failed: ${name}`);
        validations[name] = 'accepted';
      }
    }
    console.log(JSON.stringify({ tools, prompts, validations, dashboardsModified: false }, null, 2));
  } finally {
    await client.close();
    await transport.close();
  }
})().catch(() => {
  console.error('MCP smoke check failed; inspect server diagnostics locally.');
  process.exitCode = 1;
});
