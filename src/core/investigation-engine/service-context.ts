import type { InvestigationDependencies } from './dependencies';
import type { MetricCollection } from './service-slowdown';
import { scopedMetricSeries } from './metric-analysis';
import { normalizeExplainEvent } from '../../capabilities/explain-event-context';

export const MAX_SERVICE_DEPENDENCIES = 2;
export const CONTEXT_LOOKBACK_MS = 1800000; // Collection bound, never an anomaly/causality threshold.
type Window = { from: number; to: number };
type Windows = { baseline: Window; incident: Window; basis: string };
const service = /^SERVICE-[A-F0-9]{16}$/;
const noCause = 'Contexte descriptif ; proximité temporelle et relation calls ne démontrent aucune causalité.';

/** Only direct calls with a published FROM/TO position; no title/name inference or recursion. */
export function directServiceRelations(entity: any, serviceId: string) {
  if (!service.test(serviceId) || entity?.entityId !== serviceId)
    return { available: false, partial: true, outgoing: [], incoming: [] };
  let partial = false;
  const read = (position: any) => {
    if (!position || typeof position !== 'object' || Array.isArray(position)) {
      partial = true;
      return [];
    }
    if (position.calls === undefined) return [];
    if (!Array.isArray(position.calls)) {
      partial = true;
      return [];
    }
    if (position.calls.length > 100) partial = true;
    const ids: string[] = [];
    for (const row of position.calls.slice(0, 100)) {
      if (!service.test(row?.id || '') || row?.type !== 'SERVICE') {
        partial = true;
        continue;
      }
      if (row.id !== serviceId) ids.push(row.id);
    }
    return [...new Set(ids)].sort();
  };
  const outgoing = read(entity.fromRelationships),
    incoming = read(entity.toRelationships);
  return { available: true, partial, outgoing, incoming };
}

const eventCategories: Record<string, string> = {
  PERFORMANCE_EVENT: 'performance',
  SERVICE_SLOWDOWN: 'performance',
  AVAILABILITY_EVENT: 'availability',
  CUSTOM_DEPLOYMENT: 'deployment',
  CUSTOM_CONFIGURATION: 'change',
  DEPLOYMENT_CHANGED_CHANGE: 'deployment',
  DEPLOYMENT_CHANGED_NEW: 'deployment',
  DEPLOYMENT_CHANGED_REMOVED: 'deployment',
};
/** Managed EntityStub and legacy ID shapes. Missing/foreign entity and invalid time never become observations. */
export function qualifyServiceEvents(data: any, entityId: string, incident: Window) {
  if (
    !service.test(entityId) ||
    !Number.isSafeInteger(incident?.from) ||
    !Number.isSafeInteger(incident?.to) ||
    incident.from < 0 ||
    incident.to <= incident.from ||
    !Array.isArray(data?.events)
  )
    return { available: false, partial: true, observations: [], rejected: 0 };
  let partial =
    !!data.nextPageKey || data.totalCount > data.events.length || !!data.warnings?.length || data.events.length > 10;
  const observations: any[] = [],
    seen = new Set<string>();
  let rejected = 0;
  for (const raw of data.events.slice(0, 10)) {
    const event = normalizeExplainEvent(raw);
    const stub = raw?.entityId;
    const actual = typeof stub === 'string' ? stub : stub?.entityId?.id || stub?.id;
    const start = event.startTime,
      end = event.endTime;
    if (
      !event.id ||
      actual !== entityId ||
      start === null ||
      !Number.isSafeInteger(start) ||
      (raw.endTime !== undefined && raw.endTime !== null && end === null) ||
      (end !== null && (!Number.isSafeInteger(end) || end < start))
    ) {
      partial = true;
      rejected++;
      continue;
    }
    const category = eventCategories[event.type];
    const overlaps =
      start <= incident.to && (end === null ? raw.status === 'OPEN' || start >= incident.from : end >= incident.from);
    const before = start >= Math.max(0, incident.from - CONTEXT_LOOKBACK_MS) && start < incident.from;
    if (!category || (!overlaps && !before) || seen.has(event.id)) {
      rejected++;
      continue;
    }
    seen.add(event.id);
    observations.push({
      ...event,
      entityId,
      category,
      timing: overlaps ? 'during' : 'before',
      qualification: event.synthetic ? 'synthetic-declaration' : 'confirmed-observation',
      interpretationLimit: noCause,
    });
  }
  return { available: true, partial, observations, rejected };
}

/** Same exact windows/unit/aggregation as primary latency, descriptive direction only. */
export function compareDependencyLatency(incident: any, baseline: any) {
  if (
    !incident ||
    !baseline ||
    incident.partial !== false ||
    baseline.partial !== false ||
    !Number.isSafeInteger(incident.count) ||
    !Number.isSafeInteger(baseline.count) ||
    !Number.isFinite(incident.min) ||
    !Number.isFinite(baseline.min) ||
    incident.count < 2 ||
    baseline.count < 2 ||
    incident.min < 0 ||
    baseline.min < 0
  )
    return { status: 'insufficient_data' };
  const delta = incident.mean - baseline.mean;
  const relativeChangePercent = baseline.mean > 0 ? (delta / baseline.mean) * 100 : null;
  if (!Number.isFinite(delta) || (relativeChangePercent !== null && !Number.isFinite(relativeChangePercent)))
    return { status: 'insufficient_data' };
  return {
    status: 'compared',
    baselineValue: baseline.mean,
    incidentValue: incident.mean,
    delta,
    relativeChangePercent,
    direction: delta > 0 ? 'increase' : delta < 0 ? 'decrease' : 'unchanged',
  };
}

/** Maximum eight reads standalone, seven with the already collected primary entity; shared Explain budget wins. */
export async function collectServiceContext(
  deps: Pick<InvestigationDependencies, 'entitiesClient' | 'eventsClient' | 'metricsClient'>,
  input: {
    environment_alias: string;
    serviceId: string;
    windows: Windows;
    latencyUnit?: string;
    latencyContractRef?: string;
    now: number;
  },
  reader: MetricCollection,
  primary?: { entity: any; evidenceId: string },
) {
  const { environment_alias: alias, serviceId, windows, latencyUnit, now } = input;
  if (
    !service.test(serviceId) ||
    !Number.isSafeInteger(now) ||
    ![windows?.incident, windows?.baseline].every(
      (w) =>
        w && Number.isSafeInteger(w.from) && Number.isSafeInteger(w.to) && w.from >= 0 && w.to > w.from && w.to <= now,
    ) ||
    windows.baseline.to > windows.incident.from ||
    windows.baseline.to - windows.baseline.from !== windows.incident.to - windows.incident.from ||
    windows.incident.to - windows.incident.from > 7200000
  )
    throw Error('Invalid contextual service window');
  const evidence: any[] = [],
    findings: any[] = [],
    limitations: string[] = [];
  const entity =
    primary?.entity ||
    (await reader.read('service-topology', 'entities.read', () =>
      deps.entitiesClient.getEntityDetails(serviceId, alias),
    ));
  const topologyRef = primary?.evidenceId || reader.evidenceId();
  const topology = directServiceRelations(entity, serviceId);
  const selected = topology.outgoing.slice(0, MAX_SERVICE_DEPENDENCIES);
  const context: any = {
    status: 'completed',
    topology,
    inspectedDependencies: selected,
    dependencies: [],
    events: [],
    maxDependencies: MAX_SERVICE_DEPENDENCIES,
    depth: 1,
  };
  const limited = (text: string) => {
    limitations.push(text);
    context.status = 'partial';
  };
  limitations.push(
    'Topologie collectée à présent ; la présence historique de la relation pendant l’incident n’est pas attestée. ' +
      noCause,
  );
  if (!topology.available || topology.partial)
    limited('Dépendances absentes, incomplètes ou indisponibles : aucune topologie complète affirmée.');
  if (topology.outgoing.length > MAX_SERVICE_DEPENDENCIES)
    limited(
      'Dépendances sortantes bornées aux deux premiers IDs triés ; aucune sélection causale ni exploration récursive.',
    );
  if (topology.available) {
    evidence.push({
      id: topologyRef + '-calls',
      kind: 'service-relations',
      entityId: serviceId,
      from: now,
      to: now,
      outgoing: topology.outgoing.slice(0, 2),
      incoming: topology.incoming.slice(0, 2),
      partial: topology.partial || topology.outgoing.length > 2 || topology.incoming.length > 2,
      evidenceRefs: [topologyRef],
      source: { api: 'entities', method: 'GET', endpoint: '/api/v2/entities/' + serviceId, parameters: {} },
    });
    // In Explain the primary entity proof is supplied; standalone creates its own proof.
    if (!primary)
      evidence.push({
        id: topologyRef,
        kind: 'entity',
        entityId: serviceId,
        name: entity.displayName || serviceId,
        source: { api: 'entities', method: 'GET', endpoint: '/api/v2/entities/' + serviceId, parameters: {} },
      });
    for (const id of selected)
      findings.push({
        kind: 'dependency-context',
        qualification: 'investigation-lead',
        title: 'Piste d’investigation · dépendance sortante',
        certainty: 'hypothesis',
        evidenceRefs: [topologyRef + '-calls'],
        entityId: id,
        window: { from: now, to: now },
        signal: 'direct-outgoing-calls',
        interpretationLimit: noCause,
        text: `${serviceId} → ${id} : relation sortante calls observée à ${new Date(now).toISOString()}. Service à examiner ; relation historique et cause non démontrées.`,
      });
    if (!selected.length)
      limitations.push(
        'Aucune dépendance sortante SERVICE dans la réponse ; les relations entrantes ne sont pas utilisées comme dépendances sortantes.',
      );
  }
  const eventsFor = async (id: string) => {
    const params = {
      from: String(Math.max(0, windows.incident.from - CONTEXT_LOOKBACK_MS)),
      to: String(windows.incident.to),
      pageSize: 10,
      entitySelector: `entityId("${id}")`,
    };
    const raw = await reader.read('service-context-events', 'events.read', () =>
      deps.eventsClient.queryEvents(params, alias),
    );
    const qualified = qualifyServiceEvents(raw, id, windows.incident);
    context.events.push({ entityId: id, ...qualified });
    if (!qualified.available || qualified.partial)
      limited('Événements indisponibles, incomplets ou non qualifiables pour ' + id);
    if (!qualified.available) return;
    const ref = reader.evidenceId();
    evidence.push({
      id: ref,
      kind: 'events',
      entityId: id,
      from: Number(params.from),
      to: Number(params.to),
      partial: qualified.partial,
      returned: raw.events.length,
      events: qualified.observations,
      source: { api: 'events', method: 'GET', endpoint: '/api/v2/events', parameters: params },
    });
    for (const event of qualified.observations)
      findings.push({
        kind: 'service-event-context',
        qualification: event.synthetic ? 'synthetic-declaration' : 'confirmed-observation',
        title: (event.synthetic ? 'Déclaration de test · ' : 'Événement observé · ') + event.category,
        certainty: event.synthetic ? 'hypothesis' : 'observed',
        evidenceRefs: [ref],
        entityId: id,
        signal: event.type,
        window: { from: event.startTime, to: event.endTime },
        interpretationLimit: noCause,
        text: `${id} · ${event.type} · début ${new Date(event.startTime).toISOString()} · ${event.timing === 'during' ? 'recouvre la fenêtre étudiée' : 'commence dans les 30 minutes précédentes'}. ${event.synthetic ? 'Déclaration synthétique, aucune dégradation réelle prouvée. ' : ''}${noCause}`,
      });
    if (!qualified.observations.length)
      limitations.push(
        'Aucun événement contextuel qualifié dans la page collectée pour ' +
          id +
          ' ; absence de changement ou de panne non démontrée.',
      );
  };
  await eventsFor(serviceId);
  for (const id of selected) {
    const refs: string[] = [],
      summaries: Record<string, any> = {};
    if (['MicroSecond', 'MilliSecond', 'Second'].includes(latencyUnit || ''))
      for (const label of ['incident', 'baseline'] as const) {
        const w = windows[label],
          params = {
            metricSelector: 'builtin:service.response.time:avg',
            entitySelector: `entityId("${id}")`,
            from: String(w.from),
            to: String(w.to),
            resolution: '5m',
          };
        const data = await reader.read('dependency-latency-' + label, 'metrics.read', () =>
          deps.metricsClient.queryMetrics(params, alias),
        );
        const summary = scopedMetricSeries(
          data,
          { 'dt.entity.service': id },
          'builtin:service.response.time',
          'avg',
          w,
          true,
        );
        if (!summary) continue;
        const ref = reader.evidenceId();
        refs.push(ref);
        summaries[label] = summary;
        evidence.push({
          id: ref,
          kind: 'series',
          entityId: id,
          metricId: 'builtin:service.response.time',
          unit: latencyUnit,
          aggregation: 'avg',
          window: label,
          ...w,
          ...summary,
          partial: summary.partial || summary.min < 0,
          contextRole: 'direct-dependency',
          windowBasis: windows.basis,
          timestampBasis: 'bucket-end',
          evidenceRefs: [topologyRef + '-calls', ...(input.latencyContractRef ? [input.latencyContractRef] : [])],
          source: { api: 'metrics', method: 'GET', endpoint: '/api/v2/metrics/query', parameters: params },
        });
      }
    const comparison = compareDependencyLatency(summaries.incident, summaries.baseline);
    context.dependencies.push({ entityId: id, unit: latencyUnit || null, windows, ...comparison, evidenceRefs: refs });
    if (comparison.status !== 'compared') limited('Latence de dépendance insuffisante ou contrat indisponible : ' + id);
    else
      findings.push({
        kind: 'dependency-latency',
        qualification: 'confirmed-observation',
        title: 'Latence de dépendance · ' + comparison.direction,
        certainty: 'observed',
        entityId: id,
        window: windows.incident,
        windows,
        signal: 'latency-' + comparison.direction,
        evidenceRefs: [topologyRef + '-calls', ...refs],
        interpretationLimit: noCause,
        text: `${id} · moyenne baseline ${comparison.baselineValue} ${latencyUnit} (${new Date(windows.baseline.from).toISOString()} → ${new Date(windows.baseline.to).toISOString()}) ; observation ${comparison.incidentValue} ${latencyUnit} (${new Date(windows.incident.from).toISOString()} → ${new Date(windows.incident.to).toISOString()}) ; différence ${comparison.delta} ${latencyUnit}. Écart descriptif, sans seuil d’anomalie. ${noCause}`,
      });
    await eventsFor(id);
  }
  if (!findings.length) limitations.push('Aucune donnée contextuelle exploitable dans ce périmètre borné.');
  return { context, evidence, findings, limitations, causalMechanism: 'unknown' as const };
}
