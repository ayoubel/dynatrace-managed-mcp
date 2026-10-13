import { CapabilityMatrixSchemaV1, type CapabilityMatrixV1 } from '../../contracts/capabilities';
export interface CapabilityConnector {
  read(
    endpoint: string,
    params: Record<string, string | number>,
    options: { signal: AbortSignal; timeoutMs: number },
  ): Promise<unknown>;
  scopes?(options: { signal: AbortSignal; timeoutMs: number }): Promise<string[]>;
  validatedScopes?: string[];
}
const probes = [
  {
    name: 'problems',
    endpoint: '/api/v2/problems',
    requiredScope: 'problems.read',
    params: { pageSize: 1, from: 'now-5m' },
    field: 'problems',
  },
  {
    name: 'entities',
    endpoint: '/api/v2/entities',
    requiredScope: 'entities.read',
    params: { pageSize: 1, entitySelector: 'type(HOST)', from: 'now-5m' },
    field: 'entities',
  },
  {
    name: 'metrics',
    endpoint: '/api/v2/metrics',
    requiredScope: 'metrics.read',
    params: { pageSize: 1 },
    field: 'metrics',
  },
  {
    name: 'events',
    endpoint: '/api/v2/events',
    requiredScope: 'events.read',
    params: { pageSize: 1, from: 'now-5m' },
    field: 'events',
  },
];
export async function discoverCapabilities(
  environment: string,
  connector: CapabilityConnector,
  options: { maxRequests?: number; deadlineMs?: number; probeTimeoutMs?: number } = {},
): Promise<CapabilityMatrixV1> {
  if (!environment || environment === 'ALL_ENVIRONMENTS' || environment.includes(';'))
    throw new Error('Choose one environment');
  const maxRequests = options.maxRequests ?? 6,
    deadlineMs = options.deadlineMs ?? 8000,
    probeTimeoutMs = options.probeTimeoutMs ?? 2000;
  if (
    !Number.isInteger(maxRequests) ||
    maxRequests < 1 ||
    maxRequests > 6 ||
    !Number.isFinite(deadlineMs) ||
    deadlineMs < 1 ||
    deadlineMs > 10000 ||
    !Number.isFinite(probeTimeoutMs) ||
    probeTimeoutMs < 1 ||
    probeTimeoutMs > 3000
  )
    throw new Error('Invalid capability probe budget');
  const start = Date.now();
  const result: CapabilityMatrixV1 = {
    schemaVersion: '1.0',
    environment,
    collectedAt: new Date().toISOString(),
    version: { status: 'unverified', value: null, source: '/api/v1/config/clusterversion' },
    scopes: { status: 'unverified', values: [], source: 'none' },
    capabilities: [],
    errors: [],
    requests: 0,
    limitations: [
      'A successful bounded probe is not version certification or proof of data coverage.',
      'Scopes describe this credential snapshot, not user identity or global environment permissions.',
    ],
  };
  const execute = async (
    probe: string,
    fn: (options: { signal: AbortSignal; timeoutMs: number }) => Promise<unknown>,
  ): Promise<{ ok: boolean; data?: unknown; reason: string; unavailable?: boolean }> => {
    const remaining = deadlineMs - (Date.now() - start);
    if (result.requests >= maxRequests || remaining <= 0) return { ok: false, reason: 'budget-exhausted' };
    result.requests++;
    const timeoutMs = Math.max(1, Math.min(probeTimeoutMs, remaining)),
      controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Object.assign(new Error('Probe timed out'), { code: 'timeout' }));
        }, timeoutMs);
      });
      const data = await Promise.race([
        Promise.resolve().then(() => fn({ signal: controller.signal, timeoutMs })),
        timeout,
      ]);
      return { ok: true, data, reason: 'successful-probe' };
    } catch (error) {
      const raw = error as { response?: { status?: number }; code?: string };
      const status = raw?.response?.status;
      const code =
        status === 401
          ? 'unauthorized'
          : status === 403
            ? 'forbidden'
            : status === 404 || status === 405
              ? 'api-unavailable'
              : status === 429
                ? 'rate-limited'
                : controller.signal.aborted || raw?.code === 'ECONNABORTED'
                  ? 'timeout'
                  : 'connection-or-response-error';
      result.errors.push({ probe, code, ...(Number.isInteger(status) ? { status } : {}) });
      return { ok: false, reason: code, unavailable: [401, 403, 404, 405].includes(status || 0) };
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  if (connector.validatedScopes && connector.validatedScopes.every((s) => typeof s === 'string'))
    result.scopes = {
      status: 'observed',
      values: [...new Set(connector.validatedScopes)],
      source: 'validated-token-snapshot',
    };
  else if (connector.scopes) {
    const scopes = await execute('scopes', (opts) => connector.scopes!(opts));
    if (scopes.ok && Array.isArray(scopes.data) && scopes.data.every((s) => typeof s === 'string'))
      result.scopes = { status: 'observed', values: [...new Set(scopes.data)], source: 'token-lookup' };
    else if (scopes.ok) result.errors.push({ probe: 'scopes', code: 'invalid-response' });
  }
  const version = await execute('version', (opts) => connector.read('/api/v1/config/clusterversion', {}, opts));
  const payload = version.data as { version?: unknown; observed?: boolean } | undefined;
  if (
    version.ok &&
    payload?.observed !== false &&
    typeof payload?.version === 'string' &&
    /^1\.\d+\.\d+(?:[.-][A-Za-z0-9.-]+)?$/.test(payload.version)
  )
    result.version = { ...result.version, status: 'observed', value: payload.version };
  else if (version.ok) result.errors.push({ probe: 'version', code: 'invalid-or-fallback-version' });
  for (const probe of probes) {
    const tested = await execute(probe.name, (opts) =>
      connector.read(probe.endpoint, probe.params as Record<string, string | number>, opts),
    );
    const valid =
      tested.ok &&
      tested.data !== null &&
      typeof tested.data === 'object' &&
      Array.isArray((tested.data as Record<string, unknown>)[probe.field]);
    if (tested.ok && !valid) result.errors.push({ probe: probe.name, code: 'invalid-response' });
    result.capabilities.push({
      name: probe.name,
      endpoint: probe.endpoint,
      requiredScope: probe.requiredScope,
      status: valid ? 'available' : tested.unavailable ? 'unavailable' : 'unverified',
      reason: tested.ok && !valid ? 'invalid-response' : tested.reason,
    });
  }
  for (const [name, endpoint, requiredScope] of [
    ['logs', '/api/v2/logs/search', 'logs.read'],
    ['settings', '/api/v2/settings/objects', 'settings.read'],
  ])
    result.capabilities.push({
      name,
      endpoint,
      requiredScope,
      status: 'unverified',
      reason: 'not-probed-in-foundations-profile',
    });
  if (result.version.status === 'unverified')
    result.limitations.push('Managed version not observed; no minimum-version fallback is certified.');
  return CapabilityMatrixSchemaV1.parse(result);
}
