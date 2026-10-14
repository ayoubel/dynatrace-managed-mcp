import type { InvestigationDependencies } from './dependencies';
import { metricWindows, scopedMetricSeries } from './metric-analysis';
import { collectServiceContext } from './service-context';

export interface MetricCollection {
  read(key: string, scope: string, fn: () => Promise<Map<string, any>>): Promise<any>;
  evidenceId(): string;
  primaryEntity?: { entity: any; evidenceId: string };
}
const definitions = [
  {
    role: 'latency',
    id: 'builtin:service.response.time',
    aggregation: 'avg',
    units: ['MicroSecond', 'MilliSecond', 'Second'],
  },
  { role: 'errors', id: 'builtin:service.errors.server.rate', aggregation: 'avg', units: ['Percent'] },
  { role: 'requests', id: 'builtin:service.requestCount.total', aggregation: 'value', units: ['Count'] },
] as const;
const idOf = (value: any) => (typeof value === 'string' ? value : value?.id);

/** One published service: three metric checks plus bounded direct context; no MCP SDK. */
export async function runServiceSlowdown(
  dependencies: InvestigationDependencies,
  input: { environment_alias: string; serviceId: string; problem: any; now: number },
  collection?: MetricCollection,
) {
  const { environment_alias: alias, serviceId, problem, now } = input;
  if (
    !dependencies.authClientManager.validAliases.includes(alias) ||
    alias.includes(';') ||
    !/^SERVICE-[A-F0-9]{16}$/.test(serviceId)
  )
    throw Error('Invalid service scope');
  const published = [
    ...(problem.affectedEntities || []),
    ...(problem.impactedEntities || []),
    ...(problem.rootCauseEntity ? [problem.rootCauseEntity] : []),
  ];
  if (problem.severityLevel !== 'PERFORMANCE' || !published.some((e) => idOf(e.entityId) === serviceId))
    throw Error('SERVICE_SLOWDOWN requires a published performance service');
  const evidence: any[] = [],
    findings: any[] = [],
    limitations: string[] = [];
  const checks: any[] = [];
  const windows = metricWindows(problem, now);
  let latencyUnit: string | undefined;
  let latencyContractRef: string | undefined;
  let sequence = 0;
  const collectionStarted = Date.now();
  const reader = collection || {
    evidenceId: () => 'S' + sequence,
    async read(_key: string, scope: string, fn: () => Promise<Map<string, any>>) {
      sequence++;
      if (sequence > 18 || Date.now() - collectionStarted > 80000) return null;
      const scopes = dependencies.tokenScopesFor?.(alias);
      if (scopes && !scopes.includes(scope)) return null;
      try {
        return (await fn()).get(alias) ?? null;
      } catch {
        return null;
      }
    },
  };
  const playbook: any = {
    id: 'SERVICE_SLOWDOWN',
    version: 1,
    serviceId,
    status: 'partial',
    windows,
    checks,
    causalMechanism: 'unknown',
  };
  if (!windows) {
    limitations.push(
      'Fenêtres complètes incident/baseline insuffisantes : deux créneaux de 5 minutes minimum ; aucune anomalie affirmée.',
    );
    return { playbook, evidence, findings, limitations };
  }
  if (windows.clipped)
    limitations.push(
      'Fenêtre incidente bornée à deux heures et aux créneaux complets de 5 minutes ; les bords non alignés sont exclus.',
    );
  limitations.push(
    'Baseline immédiatement antérieure au début publié, non garantie saine ni représentative de la saisonnalité. Moyennes de créneaux non pondérées par les requêtes ; aucune causalité déduite.',
  );
  for (const metric of definitions) {
    const check: any = { role: metric.role, metricId: metric.id, status: 'insufficient_data', evidenceRefs: [] };
    checks.push(check);
    const descriptor = await reader.read('service-metric-contract', 'metrics.read', () =>
      dependencies.metricsClient.getMetricDetails(metric.id, alias),
    );
    if (
      descriptor?.metricId !== metric.id ||
      !metric.units.some((unit) => unit === descriptor.unit) ||
      !Array.isArray(descriptor.aggregationTypes) ||
      !descriptor.aggregationTypes.includes(metric.aggregation) ||
      !Array.isArray(descriptor.dimensionDefinitions) ||
      !descriptor.dimensionDefinitions.some((d: any) => d?.key === 'dt.entity.service')
    ) {
      limitations.push('Contrat Managed absent ou incompatible (unité/agrégation/dimension) : ' + metric.id);
      continue;
    }
    const contractId = reader.evidenceId();
    if (metric.role === 'latency') {
      latencyUnit = descriptor.unit;
      latencyContractRef = contractId;
    }
    evidence.push({
      id: contractId,
      kind: 'metric-contract',
      entityId: serviceId,
      metricId: metric.id,
      unit: descriptor.unit,
      aggregation: metric.aggregation,
      source: {
        api: 'metrics',
        method: 'GET',
        endpoint: '/api/v2/metrics/' + encodeURIComponent(metric.id),
        parameters: {},
      },
    });
    const periods: Record<string, any> = {};
    for (const label of ['incident', 'baseline'] as const) {
      const window = windows[label];
      const params = {
        metricSelector: metric.id + ':' + metric.aggregation,
        entitySelector: `entityId("${serviceId}")`,
        from: String(window.from),
        to: String(window.to),
        resolution: '5m',
      };
      const data = await reader.read('service-' + label, 'metrics.read', () =>
        dependencies.metricsClient.queryMetrics(params, alias),
      );
      const summary = scopedMetricSeries(
        data,
        { 'dt.entity.service': serviceId },
        metric.id,
        metric.aggregation,
        window,
        true,
      );
      if (!summary) {
        limitations.push('Série ' + label + ' absente ou ambiguë : ' + metric.id);
        continue;
      }
      const invalidValues = summary.min < 0 || (metric.role === 'errors' && summary.max > 100);
      const proof = {
        id: reader.evidenceId(),
        kind: 'series',
        entityId: serviceId,
        metricId: metric.id,
        unit: descriptor.unit,
        aggregation: metric.aggregation,
        window: label,
        ...window,
        ...summary,
        partial: summary.partial || invalidValues,
        windowBasis: windows.basis,
        timestampBasis: 'bucket-end',
        evidenceRefs: [contractId],
        source: { api: 'metrics', method: 'GET', endpoint: '/api/v2/metrics/query', parameters: params },
      };
      evidence.push(proof);
      periods[label] = proof;
      check.evidenceRefs.push(proof.id);
      if (proof.partial) limitations.push('Série ' + label + ' incomplète, irrégulière ou invalide : ' + metric.id);
    }
    const incident = periods.incident,
      baseline = periods.baseline;
    if (!incident || !baseline || incident.partial || baseline.partial || incident.count < 2 || baseline.count < 2)
      continue;
    const incidentValue = metric.role === 'requests' ? incident.sum : incident.mean;
    const baselineValue = metric.role === 'requests' ? baseline.sum : baseline.mean;
    const delta = incidentValue - baselineValue;
    const relativeChangePercent = baselineValue > 0 ? (delta / baselineValue) * 100 : null;
    if (!Number.isFinite(delta) || (relativeChangePercent !== null && !Number.isFinite(relativeChangePercent))) {
      limitations.push('Comparaison numérique non représentable : ' + metric.id);
      continue;
    }
    Object.assign(check, {
      status: 'compared',
      unit: descriptor.unit,
      aggregation: metric.aggregation,
      statistic: metric.role === 'requests' ? 'sum-of-bucket-counts' : 'mean-of-bucket-means',
      incidentValue,
      baselineValue,
      delta,
      relativeChangePercent,
      direction: delta > 0 ? 'increase' : delta < 0 ? 'decrease' : 'unchanged',
    });
    findings.push({
      kind: 'comparison',
      title: metric.id,
      certainty: 'observed',
      evidenceRefs: [contractId, ...check.evidenceRefs],
      text: `${serviceId} · ${check.statistic} : incident ${incidentValue.toFixed(2)} ${descriptor.unit} ; baseline ${baselineValue.toFixed(2)} ${descriptor.unit}. Écart descriptif ; aucune anomalie ni causalité affirmée.`,
    });
  }
  playbook.status = checks.every((c) => c.status === 'compared') ? 'completed' : 'partial';
  const contextual = await collectServiceContext(
    dependencies,
    { environment_alias: alias, serviceId, windows, latencyUnit, latencyContractRef, now },
    reader,
    reader.primaryEntity,
  );
  playbook.context = contextual.context;
  evidence.push(...contextual.evidence);
  findings.push(...contextual.findings);
  limitations.push(...contextual.limitations);
  return { playbook, evidence, findings, limitations };
}
