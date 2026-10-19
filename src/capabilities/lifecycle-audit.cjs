const { performance } = require('node:perf_hooks');
const { buildLifecycleReport, lifecycleReferences } = require('./lifecycle.cjs');
const auditCollectionDefaults = Object.freeze({
  maxApiCalls: 200,
  maxPagesPerType: 10,
  timeoutMs: 12000,
  maxDurationMs: 80000,
});
function collectionLimits(input = {}) {
  const caps = { maxApiCalls: 200, maxPagesPerType: 10, timeoutMs: 30000, maxDurationMs: 120000 };
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !Object.hasOwn(caps, k))
  )
    throw Error('Invalid audit collection limits');
  return Object.fromEntries(
    Object.entries(auditCollectionDefaults).map(([key, fallback]) => {
      const value = input[key] ?? fallback;
      if (!Number.isSafeInteger(value) || value < 1 || value > caps[key])
        throw Error('Invalid audit collection limits');
      return [key, value];
    }),
  );
}
async function boundedInventory(read, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(read),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Object.assign(Error('Audit collection timeout'), { code: 'timeout' })),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// The collector owns evidence and scoring. Daybreak only launches and renders its result.
/**
 * @param {any} client
 * @param {any[]} environments
 * @param {{category?: string, anticipationDays?: number, now?: number, limits?: any}} options
 */
async function auditManagedLifecycle(
  client,
  environments,
  { category = 'all', anticipationDays = 180, now: fixedNow = undefined, limits: inputLimits = {} } = {},
) {
  if (
    !Array.isArray(environments) ||
    environments.length > 5 ||
    environments.some((e) => !e || typeof e.alias !== 'string' || !e.alias || typeof (e.id || e.alias) !== 'string') ||
    new Set(environments.map((e) => e.id || e.alias)).size !== environments.length ||
    new Set(environments.map((e) => e.alias)).size !== environments.length ||
    !['all', 'os', 'runtime', 'platform'].includes(category) ||
    ![90, 180, 365].includes(anticipationDays) ||
    (fixedNow !== undefined && (!Number.isFinite(fixedNow) || !Number.isFinite(new Date(fixedNow).getTime())))
  )
    throw Error('Invalid audit request');
  if (typeof client?.getRuntimeInventory !== 'function') throw Error('Audit inventory read port required');
  const limits = collectionLimits(inputLimits);
  const start = performance.now(),
    entities = [],
    inventories = [],
    trace = [];
  let halted = null;
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
      return (
        u.href.replace(/\/$/, '') +
        (/^PROCESS_GROUP_INSTANCE-/.test(id) ? '/#processdetails;id=' : '/ui/entity/') +
        encodeURIComponent(id)
      );
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
        if (halted || trace.length >= limits.maxApiCalls || performance.now() - start >= limits.maxDurationMs) {
          halted ||= trace.length >= limits.maxApiCalls ? 'api_budget' : 'deadline';
          inventory.available = false;
          inventory.stopReason = halted;
          break;
        }
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
        let deadlineLimited = false;
        try {
          const remaining = limits.maxDurationMs - (performance.now() - start);
          deadlineLimited = remaining <= limits.timeoutMs;
          const result = await boundedInventory(
            () => client.getRuntimeInventory(env.alias, type, 100, cursor, 'now-24h', 'now'),
            Math.max(1, Math.ceil(Math.min(limits.timeoutMs, remaining))),
          );
          const page = result.get(env.alias);
          inventory.pages++;
          if (!Array.isArray(page?.entities) || page.entities.length > 100) throw Error('Inventory page unavailable');
          entry.status = 'ok';
          entry.responseTiming = page.responseTiming || null;
          entry.returned = page.entities.length;
          if (Number.isInteger(page.totalCount)) inventory.total = page.totalCount;
          for (const e of page.entities) {
            if (typeof e?.entityId !== 'string' || !e.entityId.startsWith(type + '-') || seen.has(e.entityId)) continue;
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
        } catch (error) {
          entry.status = 'unavailable';
          inventory.stopReason = error?.code === 'timeout' ? (deadlineLimited ? 'deadline' : 'timeout') : 'unavailable';
          if (error?.code === 'timeout') halted = inventory.stopReason;
          entry.reason =
            error?.code === 'timeout'
              ? 'Délai de collecte dépassé ; lectures suivantes arrêtées'
              : 'Permission, connexion ou page indisponible';
          inventory.available = false;
          break;
        } finally {
          entry.durationMs = Math.round(performance.now() - callStart);
        }
      } while (cursor && inventory.pages < limits.maxPagesPerType);
      inventory.returned = inventory.inspected = seen.size;
      inventory.complete = inventory.available && !cursor && inventory.total === seen.size;
      if (!inventory.complete && !inventory.stopReason)
        inventory.stopReason = cursor
          ? 'page_limit'
          : inventory.total === null
            ? 'total_unknown'
            : 'inventory_mismatch';
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
    collection: {
      status: inventories.length && inventories.every((i) => i.complete) ? 'completed' : 'partial',
      limits,
      stoppedBy: halted,
    },
    trace,
    performance: {
      durationMs: Math.round(performance.now() - start),
      scoringMs: Math.round(performance.now() - scoringStart),
      apiCalls: trace.length,
    },
    limitations: [
      'Support upstream/standard ; contrats étendus, backports et conformité réglementaire non certifiés.',
      'Inventaires paginés : 10 pages de 100 entités par type et environnement ; plafond de 5 environnements.',
      'Collecte bornée en appels, pages et durée ; après timeout, aucune lecture suivante. Le port historique ne garantit pas l’annulation d’une requête déjà lancée.',
      'Version du groupe distincte de la preuve sur une instance. Version de release/image/agent distincte du runtime.',
      'Version manquante signifie absente des champs consultés, pas impossible à obtenir dans tout Dynatrace.',
      'Référentiel : Ubuntu, Kubernetes, Node.js, Python, PHP, Java Temurin, cycles Go et containerd vérifiés. Autres politiques à qualifier.',
    ],
  };
}

exports.auditManagedLifecycle = auditManagedLifecycle;
exports.auditCollectionDefaults = auditCollectionDefaults;
