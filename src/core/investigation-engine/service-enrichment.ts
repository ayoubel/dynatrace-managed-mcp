import type { InvestigationDependencies } from './dependencies';
import type { MetricCollection } from './service-slowdown';
import { scopedMetricSeries } from './metric-analysis';
import { serviceCollectionLimits } from './collection-limits';

type Window = { from: number; to: number };
export type MetricContract = { descriptor: any; evidenceId: string };
type Output = { evidence: any[]; findings: any[]; limitations: string[]; partial?: boolean };
const metrics = {
  errors: {
    id: 'builtin:service.errors.server.rate',
    dimension: 'dt.entity.service',
    unit: ['Percent'],
    aggregation: 'avg',
  },
  requests: {
    id: 'builtin:service.requestCount.total',
    dimension: 'dt.entity.service',
    unit: ['Count'],
    aggregation: 'value',
  },
  keyLatency: {
    id: 'builtin:service.keyRequest.response.server',
    dimension: 'dt.entity.service_method',
    unit: ['MicroSecond', 'MilliSecond', 'Second'],
    aggregation: 'avg',
  },
  keyErrors: {
    id: 'builtin:service.keyRequest.errors.server.rate',
    dimension: 'dt.entity.service_method',
    unit: ['Percent'],
    aggregation: 'avg',
  },
  keyCount: {
    id: 'builtin:service.keyRequest.count.server',
    dimension: 'dt.entity.service_method',
    unit: ['Count'],
    aggregation: 'value',
  },
  cpu: { id: 'builtin:host.cpu.usage', dimension: 'dt.entity.host', unit: ['Percent'], aggregation: 'avg' },
  memory: { id: 'builtin:host.mem.usage', dimension: 'dt.entity.host', unit: ['Percent'], aggregation: 'avg' },
};
export async function metricContract(
  deps: InvestigationDependencies,
  reader: MetricCollection,
  alias: string,
  metric: { id: string; dimension: string; unit: string[]; aggregation: string },
  entityId: string,
  out: Output,
): Promise<MetricContract | undefined> {
  const existing = reader.metricContracts?.get(metric.id);
  if (existing && existing.descriptor.aggregationTypes?.includes(metric.aggregation)) return existing;
  const descriptor = await reader.read('metric-contract-' + metric.id, 'metrics.read', () =>
    deps.metricsClient.getMetricDetails(metric.id, alias),
  );
  if (
    descriptor?.metricId !== metric.id ||
    !metric.unit.includes(descriptor.unit) ||
    !descriptor.aggregationTypes?.includes(
      metric.aggregation === 'percentile(95)' ? 'percentile' : metric.aggregation,
    ) ||
    !descriptor.dimensionDefinitions?.some((d: any) => d.key === metric.dimension)
  ) {
    out.partial = true;
    out.limitations.push('Contrat complémentaire absent ou incompatible : ' + metric.id);
    return undefined;
  }
  const contract = { descriptor, evidenceId: reader.evidenceId() };
  out.evidence.push({
    id: contract.evidenceId,
    kind: 'metric-contract',
    metricId: metric.id,
    entityId,
    unit: descriptor.unit,
    aggregation: metric.aggregation,
  });
  reader.metricContracts?.set(metric.id, contract);
  return contract;
}
/** Qualifies complete exact scoped buckets; p95 remains a series of actual bucket p95 values. */
export async function collectMetricPair(
  deps: InvestigationDependencies,
  reader: MetricCollection,
  alias: string,
  input: {
    entityId: string;
    metricId: string;
    dimension: string;
    aggregation: string;
    contract: MetricContract;
    windows: { baseline: Window; incident: Window; basis: string };
    role: string;
    relationRefs?: string[];
  },
  out: Output,
) {
  const periods: Record<string, any> = {};
  for (const label of ['incident', 'baseline'] as const) {
    const w = input.windows[label];
    const params = {
      metricSelector: input.metricId + ':' + input.aggregation,
      entitySelector: `entityId("${input.entityId}")`,
      from: String(w.from),
      to: String(w.to),
      resolution: '5m',
    };
    const raw = await reader.read(input.role + '-' + input.metricId + '-' + label, 'metrics.read', () =>
      deps.metricsClient.queryMetrics(params, alias),
    );
    const summary = scopedMetricSeries(
      raw,
      { [input.dimension]: input.entityId },
      input.metricId,
      input.aggregation,
      w,
      true,
    );
    if (!summary) {
      out.partial = true;
      out.limitations.push(`Série ${label} absente ou ambiguë : ${input.metricId} · ${input.entityId}`);
      continue;
    }
    const proof = {
      id: reader.evidenceId(),
      kind: 'series',
      entityId: input.entityId,
      metricId: input.metricId,
      unit: input.contract.descriptor.unit,
      aggregation: input.aggregation,
      window: label,
      ...w,
      ...summary,
      partial:
        summary.partial || summary.min < 0 || (input.contract.descriptor.unit === 'Percent' && summary.max > 100),
      contextRole: input.role,
      windowBasis: input.windows.basis,
      timestampBasis: 'bucket-end',
      evidenceRefs: [input.contract.evidenceId, ...(input.relationRefs || [])],
    };
    out.evidence.push(proof);
    periods[label] = proof;
  }
  const i = periods.incident,
    b = periods.baseline;
  if (!i || !b || i.partial || b.partial || i.count < 2 || b.count < 2) {
    out.partial = true;
    return { status: 'insufficient_data', evidenceRefs: Object.values(periods).map((p) => p.id) };
  }
  const incidentValue = input.aggregation === 'value' ? i.sum : i.mean;
  const baselineValue = input.aggregation === 'value' ? b.sum : b.mean;
  const delta = incidentValue - baselineValue;
  if (!Number.isFinite(delta)) return { status: 'insufficient_data', evidenceRefs: [i.id, b.id] };
  const direction = delta > 0 ? 'increase' : delta < 0 ? 'decrease' : 'unchanged';
  out.findings.push({
    kind: 'comparison',
    title: input.metricId + ' · ' + input.aggregation,
    certainty: 'observed',
    entityId: input.entityId,
    window: input.windows.incident,
    evidenceRefs: [input.contract.evidenceId, ...(input.relationRefs || []), i.id, b.id],
    text: `${input.entityId} : baseline ${baselineValue} → observation ${incidentValue} ${i.unit}, ${input.aggregation}. Écart descriptif ; mécanisme causal inconnu.`,
  });
  return { status: 'compared', incidentValue, baselineValue, delta, direction, evidenceRefs: [i.id, b.id] };
}

/** Additional collections run only on explicitly published topology, no name matching or recursion. */
export async function collectServiceEnrichment(
  deps: InvestigationDependencies,
  reader: MetricCollection,
  alias: string,
  serviceId: string,
  entity: any,
  topologyRef: string,
  windows: any,
  now: number,
  out: Output,
) {
  const limits = serviceCollectionLimits(deps);
  out.limitations.push(
    'Traces/PurePaths/spans bruts non collectés : aucune API publique Managed vérifiée. Vérification manuelle nécessaire ; représentativité et rétention inconnues.',
  );
  const latency = reader.metricContracts?.get('builtin:service.response.time');
  if (latency?.descriptor.aggregationTypes?.includes('percentile')) {
    await collectMetricPair(
      deps,
      reader,
      alias,
      {
        entityId: serviceId,
        metricId: 'builtin:service.response.time',
        dimension: 'dt.entity.service',
        aggregation: 'percentile(95)',
        contract: latency,
        windows,
        role: 'primary-tail',
      },
      out,
    );
    out.limitations.push(
      'p95 retourné par Managed par créneau ; moyenne des p95 de créneaux, pas percentile global ni percentile calculé à partir de moyennes.',
    );
  } else out.limitations.push('Latence de queue non évaluée : agrégation percentile non confirmée par le contrat.');
  if (entity?.entityId !== serviceId) return;
  // One bounded page of officially linked key requests; IDs alone never establish ownership.
  const params = {
    entitySelector: `type(SERVICE_METHOD),fromRelationships.isServiceMethodOfService(type(SERVICE),entityId("${serviceId}"))`,
    from: String(windows.baseline.from),
    to: String(windows.incident.to),
    pageSize: limits.maxKeyRequests,
    fields: '+fromRelationships',
  };
  const response = await reader.read('linked-key-requests', 'entities.read', () =>
    deps.authClientManager.makeRequests('/api/v2/entities', params, alias),
  );
  if (Array.isArray(response?.entities)) {
    const ref = reader.evidenceId();
    out.evidence.push({
      id: ref,
      kind: 'entity-list',
      entityId: serviceId,
      returned: response.entities.length,
      partial: !!response.nextPageKey || response.totalCount > response.entities.length,
    });
    const requests = response.entities
      .slice(0, limits.maxKeyRequests)
      .filter(
        (e: any) =>
          /^SERVICE_METHOD-[A-F0-9]{16}$/.test(e.entityId) &&
          e.fromRelationships?.isServiceMethodOfService?.some((r: any) => r.id === serviceId && r.type === 'SERVICE'),
      )
      .sort((a: any, b: any) => a.entityId.localeCompare(b.entityId));
    if (
      requests.length !== response.entities.length ||
      response.nextPageKey ||
      response.totalCount > response.entities.length
    )
      out.limitations.push(
        'Key requests : page limitée ou relations non confirmées ; aucune exhaustivité des endpoints.',
      );
    if (!requests.length)
      out.limitations.push(
        'Aucune key request explicitement liée dans la page collectée ; endpoints réels et requêtes lentes inconnus.',
      );
    for (const request of requests) {
      const relationId = ref + '-' + request.entityId;
      out.evidence.push({
        id: relationId,
        kind: 'request-relations',
        entityId: request.entityId,
        serviceId,
        from: now,
        to: now,
        evidenceRefs: [ref],
      });
      let latencyComparison: any;
      for (const metric of [metrics.keyLatency, metrics.keyErrors, metrics.keyCount]) {
        // Failure rate and volume deepen only a key request with a qualified measured latency increase.
        if (metric !== metrics.keyLatency && latencyComparison?.direction !== 'increase') continue;
        const contract = await metricContract(deps, reader, alias, metric, request.entityId, out);
        if (!contract) continue;
        const result = await collectMetricPair(
          deps,
          reader,
          alias,
          {
            entityId: request.entityId,
            metricId: metric.id,
            dimension: metric.dimension,
            aggregation: metric.aggregation,
            contract,
            windows,
            role: 'key-request',
            relationRefs: [relationId],
          },
          out,
        );
        if (metric === metrics.keyLatency) latencyComparison = result;
      }
    }
  } else {
    out.partial = true;
    out.limitations.push(
      'Key requests indisponibles ; examiner manuellement les requêtes du service, sans endpoint inventé.',
    );
  }
  // Record process identity without inferring host ownership from names.
  for (const [relation, type] of [
    ['runsOnProcessGroupInstance', 'PROCESS_GROUP_INSTANCE'],
    ['runsOn', 'PROCESS_GROUP'],
  ] as const) {
    const ids = (Array.isArray(entity.fromRelationships?.[relation]) ? entity.fromRelationships[relation] : [])
      .filter((r: any) => r.type === type && new RegExp('^' + type + '-[A-F0-9]{16}$').test(r.id))
      .map((r: any) => r.id)
      .sort()
      .slice(0, 2);
    for (const id of ids)
      out.evidence.push({
        id: topologyRef + '-' + id,
        kind: 'infrastructure-relations',
        entityId: id,
        serviceId,
        relation,
        from: now,
        to: now,
        evidenceRefs: [topologyRef],
      });
  }
  const hosts = (Array.isArray(entity.fromRelationships?.runsOnHost) ? entity.fromRelationships.runsOnHost : [])
    .filter((r: any) => r.type === 'HOST' && /^HOST-[A-F0-9]{16}$/.test(r.id))
    .map((r: any) => r.id)
    .sort();
  if (!hosts.length) {
    out.limitations.push('Aucun hôte explicitement lié au service ; corrélation infrastructure non évaluée.');
    return;
  }
  if (hosts.length > 1)
    out.limitations.push(
      'Infrastructure bornée au premier hôte explicitement lié par ID ; les autres hôtes ne sont pas évalués.',
    );
  const host = hosts[0],
    relationId = topologyRef + '-' + host;
  out.evidence.push({
    id: relationId,
    kind: 'infrastructure-relations',
    entityId: host,
    serviceId,
    relation: 'runsOnHost',
    from: now,
    to: now,
    evidenceRefs: [topologyRef],
  });
  for (const metric of [metrics.cpu, metrics.memory]) {
    const contract = await metricContract(deps, reader, alias, metric, host, out);
    if (contract)
      await collectMetricPair(
        deps,
        reader,
        alias,
        {
          entityId: host,
          metricId: metric.id,
          dimension: metric.dimension,
          aggregation: metric.aggregation,
          contract,
          windows,
          role: 'service-host',
          relationRefs: [relationId],
        },
        out,
      );
  }
  out.limitations.push(
    'Relations infrastructure actuelles ; placement historique, contention, saturation et causalité non démontrés par les moyennes CPU/mémoire.',
  );
}

export async function deepenDependency(
  deps: InvestigationDependencies,
  reader: MetricCollection,
  alias: string,
  id: string,
  windows: any,
  relationRef: string,
  out: Output,
) {
  const entity = await reader.read('dependency-identity-' + id, 'entities.read', () =>
    deps.entitiesClient.getEntityDetails(id, alias),
  );
  if (entity?.entityId === id) {
    const ref = reader.evidenceId();
    out.evidence.push({
      id: ref,
      kind: 'entity',
      entityId: id,
      name: id,
      serviceType: entity.properties?.serviceType || null,
      databaseVendor: entity.properties?.serviceType === 'DATABASE' ? entity.properties?.databaseVendor || null : null,
      evidenceRefs: [relationRef],
    });
    if (entity.properties?.serviceType === 'DATABASE')
      out.findings.push({
        kind: 'database-context',
        title: 'Dépendance base de données publiée',
        certainty: 'observed',
        entityId: id,
        evidenceRefs: [ref, relationRef],
        text: `${id} : serviceType DATABASE publié. Latence du service DB uniquement ; requête SQL précise inconnue.`,
      });
  } else out.limitations.push('Nature technique de la dépendance non confirmée : ' + id);
  for (const metric of [metrics.errors, metrics.requests]) {
    const contract = reader.metricContracts?.get(metric.id);
    if (contract)
      await collectMetricPair(
        deps,
        reader,
        alias,
        {
          entityId: id,
          metricId: metric.id,
          dimension: metric.dimension,
          aggregation: metric.aggregation,
          contract,
          windows,
          role: 'direct-dependency',
          relationRefs: [relationRef],
        },
        out,
      );
  }
}
