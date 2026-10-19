// Real production tools and EntitiesApiClient; only the Managed HTTP port is synthetic.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
const require = createRequire(import.meta.url),
  build = process.env.ADVISOR_DEMO_BUILD,
  control = process.env.ADVISOR_DEMO_CONTROL,
  audit = process.env.ADVISOR_DEMO_AUDIT;
if (!build || !control || !audit) throw Error('Isolated Advisor configuration required');
const { registerEntitiesTools } = require(build + '/tools/entities-tools.js');
const { EntitiesApiClient } = require(build + '/capabilities/entities-api.js');
const ns = process.env.ADVISOR_DEMO_NAMESPACE || 'first',
  url = 'https://managed.example/e/' + ns;
const server = new McpServer({ name: 'advisor-synthetic-demo', version: '1.0.0' });
const text = (value) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
});
const record = (value) => fs.appendFile(audit, JSON.stringify({ namespace: ns, ...value }) + '\n');
const readControl = async () => JSON.parse(await fs.readFile(control, 'utf8'));
const fixedNow = Date.parse('2026-10-19T12:00:00Z');
let clock = fixedNow;
Date.now = () => clock;
server.registerTool('dynatrace_managed_get_environments_info', { annotations: { readOnlyHint: true } }, async () =>
  text('- Environment Alias: prod\n- API URL: ' + url + '\n- Valid Environment: Yes'),
);
function inventory(type, mode) {
  const rows = [];
  const add = (properties, index = 1) =>
    rows.push({
      entityId: type + '-' + (ns === 'first' ? 'A' : 'B').repeat(15) + index,
      type,
      displayName: 'SYNTHÉTIQUE ' + ns + ' ' + type + ' ' + index,
      lastSeenTms: clock,
      properties,
    });
  if (type === 'HOST')
    add(mode === 'POOR' ? { osType: 'LINUX' } : { osType: 'LINUX', osVersion: 'Ubuntu 20.04.6 LTS' });
  if (type === 'KUBERNETES_NODE') add({ kubeletVersion: '1.34.0' });
  if (type === 'PROCESS_GROUP_INSTANCE') {
    if (mode === 'POOR') {
      add({ processType: 'PYTHON' });
      return rows;
    }
    add({ processType: 'NODE_JS', softwareTechnologies: [{ type: 'NODE_JS', version: '18.20.8' }] });
    add({ processType: 'NODE_JS', softwareTechnologies: [{ type: 'NODE_JS', version: '22.14.0' }] }, 2);
    add(
      {
        processType: 'JAVA',
        jvmClrVersion: '21.0.8',
        jvmVendor: 'Eclipse Adoptium',
        softwareTechnologies: [{ type: 'JAVA', edition: 'Eclipse Adoptium', version: '21.0.8' }],
      },
      3,
    );
    add({ processType: 'PYTHON', softwareTechnologies: [{ type: 'PYTHON' }] }, 4);
    add({ softwareTechnologies: [{ type: 'NGINX', version: '1.24.0' }, { type: 'CONTAINERD' }] }, 5);
    add({ processType: 'PYTHON', softwareTechnologies: [{ type: 'PYTHON', version: '3.12.4' }] }, 6);
    if (mode === 'MISSING_REFERENCE')
      add({ processType: 'NODE_JS', softwareTechnologies: [{ type: 'NODE_JS', version: '999.1.0' }] }, 7);
  }
  if (type === 'PROCESS_GROUP') add({ processType: 'JAVA', jvmClrVersion: '17.0.9' });
  return rows;
}
const auth = {
  validAliases: ['prod'],
  getBaseUrl: () => url,
  makeRequests: async (endpoint, params) => {
    const c = await readControl(),
      mode = c.mode || 'RICH';
    clock = fixedNow + (mode === 'REFERENCE_STALE' ? 110 * 86400000 : 0);
    const [cursorType, cursorPage] = String(params.nextPageKey || '').split(':');
    const type = params.entitySelector?.match(/type\("([^"\)]+)"\)/)?.[1] || cursorType;
    await record({ connector: endpoint, params, mode, type });
    if (endpoint !== '/api/v2/entities') throw Error('Unexpected synthetic connector endpoint');
    if (mode === 'API_FAILURE' && type === 'HOST') throw Error('synthetic private upstream detail');
    if (mode === 'TIMEOUT' && type === 'HOST') return new Promise(() => {});
    if (c.delay) await new Promise((r) => setTimeout(r, 300));
    const all = inventory(type, mode),
      page = Number(cursorPage || 0);
    let entities = all,
      nextPageKey;
    if (mode === 'PAGINATED' && all.length > 1) {
      entities = all.slice(page * 2, page * 2 + 2);
      if ((page + 1) * 2 < all.length) nextPageKey = type + ':' + (page + 1);
    }
    if (mode === 'PARTIAL' && type === 'PROCESS_GROUP_INSTANCE') nextPageKey = type + ':repeat';
    return new Map([
      [
        'prod',
        {
          entities,
          totalCount: all.length,
          nextPageKey,
          responseTiming: { requestedAt: clock - 1, receivedAt: clock, serverAt: clock },
        },
      ],
    ]);
  },
};
const allowed = new Set([
  'dynatrace_managed_audit_obsolescence',
  'dynatrace_managed_combine_obsolescence_audits',
  'dynatrace_managed_get_runtime_inventory',
]);
registerEntitiesTools({
  authClientManager: auth,
  entitiesClient: new EntitiesApiClient(auth),
  envAliasValidate: (a) => a === 'prod' || a === 'ALL_ENVIRONMENTS',
  tool: (name, description, inputSchema, annotations, fn) => {
    if (!allowed.has(name)) return;
    if (annotations.readOnlyHint !== true) throw Error('Demo write tool refused');
    server.registerTool(name, { description, inputSchema, annotations }, async (args) => {
      const c = await readControl();
      clock = fixedNow + (c.mode === 'REFERENCE_STALE' ? 110 * 86400000 : 0);
      await record({ tool: name, args });
      return text(await fn(args));
    });
  },
});
await server.connect(new StdioServerTransport());
