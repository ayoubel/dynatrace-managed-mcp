const { performance } = require('node:perf_hooks');
const { buildLifecycleReport, lifecycleReferences } = require('./lifecycle.cjs');

// The collector owns evidence and scoring. Daybreak only launches and renders its result.
/**
 * @param {any} client
 * @param {any[]} environments
 * @param {{category?: string, anticipationDays?: number, now?: number}} options
 */
async function auditManagedLifecycle(
  client,
  environments,
  { category = 'all', anticipationDays = 180, now: fixedNow = undefined } = {},
) {
  const now = fixedNow ?? Date.now();
  const start = performance.now(),
    entities = [],
    inventories = [],
    trace = [];
  const types =
    category === 'os'
      ? ['HOST', 'KUBERNETES_NODE']
      : category === 'platform'
        ? ['KUBERNETES_NODE']
        : category === 'runtime'
          ? ['PROCESS_GROUP_INSTANCE', 'PROCESS_GROUP']
          : ['HOST', 'KUBERNETES_NODE', 'PROCESS_GROUP_INSTANCE', 'PROCESS_GROUP'];
  const environmentId = (env) => env.id || env.alias;
  const entityUrl = (env, id) => {
    try {
      const u = new URL(env.url);
      if (!['http:', 'https:'].includes(u.protocol)) return '';
      u.username = '';
      u.password = '';
      u.search = '';
      u.hash = '';
      return u.href.replace(/\/$/, '') + '/ui/entity/' + encodeURIComponent(id);
    } catch {
      return '';
    }
  };
  for (const env of environments) {
    const collected = [];
    for (const type of types) {
      const inventory = {
        environmentId: environmentId(env),
        environmentName: env.alias,
        type,
        returned: 0,
        inspected: 0,
        total: null,
        available: true,
        complete: false,
        pages: 0,
      };
      inventories.push(inventory);
      const seen = new Set(),
        cursors = new Set();
      let cursor;
      do {
        const entry = {
          id: environmentId(env) + ':R' + (trace.length + 1),
          tool: 'dynatrace_managed_get_runtime_inventory',
          environmentId: environmentId(env),
          environment: env.alias,
          args: { type, pageSize: 100 },
          at: new Date().toISOString(),
          status: 'pending',
        };
        trace.push(entry);
        const callStart = performance.now();
        try {
          const result = await client.getRuntimeInventory(
            env.alias,
            type,
            100,
            cursor,
            new Date(now - 86400000).toISOString(),
            new Date(now).toISOString(),
          );
          const page = result.get(env.alias);
          inventory.pages++;
          if (!Array.isArray(page?.entities)) throw Error('Inventory page unavailable');
          entry.status = 'ok';
          entry.returned = page.entities.length;
          if (Number.isInteger(page.totalCount)) inventory.total = page.totalCount;
          for (const e of page.entities) {
            if (!e.entityId?.startsWith(type + '-') || seen.has(e.entityId)) continue;
            seen.add(e.entityId);
            collected.push({
              entityId: e.entityId,
              type,
              displayName: e.displayName || e.entityId,
              environmentId: environmentId(env),
              environmentName: env.alias,
              url: entityUrl(env, e.entityId),
              traceId: entry.id,
              collectedAt: entry.at,
              details: e,
            });
          }
          cursor = page.nextPageKey;
          if (cursor && cursors.has(cursor)) throw Error('Repeated pagination cursor');
          if (cursor) cursors.add(cursor);
        } catch {
          entry.status = 'unavailable';
          entry.reason = 'Permission, connexion ou page indisponible';
          inventory.available = false;
          break;
        } finally {
          entry.durationMs = Math.round(performance.now() - callStart);
        }
      } while (cursor && inventory.pages < 10);
      inventory.returned = inventory.inspected = seen.size;
      inventory.complete = inventory.available && !cursor && inventory.total === seen.size;
    }
    const groups = collected.filter((e) => e.type === 'PROCESS_GROUP');
    for (const e of collected.filter((e) => e.type !== 'PROCESS_GROUP')) {
      const links = [
        ...Object.values(e.details.fromRelationships || {}),
        ...Object.values(e.details.toRelationships || {}),
      ].flat();
      e.runtimeContext = groups.filter((g) =>
        links.some((link) => link.id === g.entityId && link.type === 'PROCESS_GROUP'),
      );
      entities.push(e);
    }
  }
  const scoringStart = performance.now();
  const report = buildLifecycleReport(entities, inventories, {
    category,
    anticipationDays,
    now: fixedNow ?? Date.now(),
    scopeComplete: environments.length <= 5,
  });
  return {
    ...report,
    version: 3,
    engine: 'dynatrace-managed-mcp',
    provenance: 'live_managed_entities',
    referenceVerifiedAt: lifecycleReferences[0].verifiedAt,
    trace,
    performance: {
      durationMs: Math.round(performance.now() - start),
      scoringMs: Math.round(performance.now() - scoringStart),
      apiCalls: trace.length,
    },
    limitations: [
      'Support upstream/standard ; contrats étendus, backports et conformité réglementaire non certifiés.',
      'Inventaires paginés : 10 pages de 100 entités par type et environnement ; plafond de 5 environnements.',
      'Version du groupe distincte de la preuve sur une instance. Version de release/image/agent distincte du runtime.',
      'Version manquante signifie absente des champs consultés, pas impossible à obtenir dans tout Dynatrace.',
      'Référentiel : Ubuntu, Kubernetes, Node.js, Python, PHP, Java Temurin, cycles Go et containerd vérifiés. Autres politiques à qualifier.',
    ],
  };
}

exports.auditManagedLifecycle = auditManagedLifecycle;
