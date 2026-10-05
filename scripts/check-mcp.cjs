#!/usr/bin/env node
// Read-only MCP tool discovery check. Does not modify dashboards.
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
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
    console.log(JSON.stringify({ tools, dashboardsModified: false }, null, 2));
  } finally {
    await client.close();
    await transport.close();
  }
})().catch(() => {
  console.error('MCP smoke check failed; inspect server diagnostics locally.');
  process.exitCode = 1;
});
