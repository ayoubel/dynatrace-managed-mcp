import type { InvestigationDependencies } from './dependencies';
import type { EvidenceSource } from '../../contracts/evidence';
import { InvestigationSnapshotSchemaV1, assertEvidenceReferences } from '../../contracts/investigation';

// Capture the actual connector arguments, including metadata reads; never reconstruct selectors from titles.
export function recordingDependencies(
  input: InvestigationDependencies,
  record: (source: EvidenceSource) => void,
): InvestigationDependencies {
  const source = (api: EvidenceSource['api'], endpoint: string, params: Record<string, any> = {}) => {
    record({
      api,
      method: 'GET',
      endpoint,
      parameters: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)),
    });
  };
  return {
    ...input,
    authClientManager: {
      validAliases: input.authClientManager.validAliases,
      getBaseUrl: (alias) => input.authClientManager.getBaseUrl(alias),
      makeRequests: (endpoint, params, alias) => {
        source('settings', endpoint, params);
        return input.authClientManager.makeRequests(endpoint, params, alias);
      },
    },
    problemsClient: {
      getProblemDetails: (id, alias) => {
        source('problems', '/api/v2/problems/' + encodeURIComponent(id), { fields: 'evidenceDetails,impactAnalysis' });
        return input.problemsClient.getProblemDetails(id, alias);
      },
    },
    entitiesClient: {
      getEntityDetails: (id, alias) => {
        source('entities', '/api/v2/entities/' + encodeURIComponent(id), {});
        return input.entitiesClient.getEntityDetails(id, alias);
      },
    },
    eventsClient: {
      getEventDetails: (id, alias) => {
        source('events', '/api/v2/events/' + encodeURIComponent(id));
        return input.eventsClient.getEventDetails(id, alias);
      },
      queryEvents: (params, alias) => {
        source('events', '/api/v2/events', params);
        return input.eventsClient.queryEvents(params, alias);
      },
    },
    metricsClient: {
      getMetricDetails: (id, alias) => {
        source('metrics', '/api/v2/metrics/' + encodeURIComponent(id));
        return input.metricsClient.getMetricDetails(id, alias);
      },
      listAvailableMetrics: (alias, params = {}) => {
        source('metrics', '/api/v2/metrics', params);
        return input.metricsClient.listAvailableMetrics(alias, params);
      },
      queryMetrics: (params, alias) => {
        source('metrics', '/api/v2/metrics/query', params);
        return input.metricsClient.queryMetrics(params, alias);
      },
    },
    logsClient: {
      queryLogs: (params, alias) => {
        source('logs', '/api/v2/logs/search', {
          query: params.hostId
            ? `dt.entity.host="${params.hostId}"` + (params.query.trim() ? ` AND content="${params.query.trim()}"` : '')
            : params.query,
          from: params.from,
          to: params.to,
          limit: Math.min(params.limit || 100, 1000),
          sort: params.sort || '-timestamp',
        });
        return input.logsClient.queryLogs(params, alias);
      },
    },
  };
}
const text = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null);
const number = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export function attachInvestigationContract(report: any): void {
  const problem = report.trace.find((t: any) => t.kind === 'problem');
  const evidence = report.evidence.map((proof: any) => {
    const trace =
      report.trace.find((t: any) => t.id === proof.id) ||
      (proof.kind === 'alert-rule'
        ? report.trace.find((t: any) => t.kind === 'alert-rule' && t.status === 'ok')
        : undefined);
    const eventId =
      text(proof.eventId) || (String(proof.id).startsWith('published-event-') ? text(proof.events?.[0]?.id) : null);
    const event = eventId
      ? report.trace.find(
          (t: any) => t.source?.endpoint === '/api/v2/events/' + encodeURIComponent(eventId) && t.status === 'ok',
        )
      : undefined;
    const inherited =
      ['impact', 'trigger', 'alert-rule'].includes(proof.kind) || String(proof.id).startsWith('published-event-');
    const origin = trace || event || (inherited ? problem : undefined);
    const limitations: string[] = [];
    const eventData = proof.kind === 'events' && proof.events?.length === 1 ? proof.events[0] : undefined;
    const timestamp = (value: unknown) => {
      const v = number(value);
      return v !== null && v >= 0 ? v : null;
    };
    const from =
      timestamp(proof.from) ??
      timestamp(proof.startTime) ??
      timestamp(eventData?.startTime) ??
      text(origin?.source?.parameters?.from);
    const to =
      timestamp(proof.to) ??
      timestamp(proof.endTime) ??
      timestamp(eventData?.endTime) ??
      text(origin?.source?.parameters?.to);
    if (from === null || to === null)
      limitations.push('Exact time window not returned; relative request bounds may remain explicit.');
    if (!origin?.source) limitations.push('Collection source not verified for this derived evidence.');
    if (proof.partial || proof.gaps || proof.truncated) limitations.push('Partial, missing or truncated data.');
    if (proof.kind !== 'problem') limitations.push('No verified Dynatrace UI link available for this evidence.');
    const provenance = {
      schemaVersion: '1.0',
      id: proof.id,
      type: proof.kind,
      environment: report.environment,
      entityId:
        text(proof.entityId) ||
        text(proof.diskId) ||
        text(proof.hostId) ||
        (['trigger', 'available-space'].includes(proof.kind) ? text(report.scope?.diskId) : null),
      source: origin?.source || null,
      collectedAt: origin?.collectedAt || report.collectedAt,
      timeRange: { from, to },
      measurement: ['series', 'available-space'].includes(proof.kind)
        ? {
            metricId: text(proof.metricId),
            value: number(proof.mean) ?? number(proof.last?.v),
            unit: text(proof.unit),
            aggregation:
              text(proof.aggregation) ||
              (/\:avg$/.test(origin?.source?.parameters?.metricSelector || '') ? 'avg' : null),
            samples: (proof.points || [])
              .filter((point: any) => number(point.t) !== null && number(point.v) !== null)
              .slice(-100)
              .map((point: any) => ({ timestamp: point.t, value: point.v })),
            summary: Object.fromEntries(
              ['count', 'mean', 'min', 'max', 'delta']
                .filter((key) => number(proof[key]) !== null)
                .map((key) => [key, proof[key]]),
            ),
          }
        : null,
      reference: proof.kind === 'problem' && report.problemUrl ? { kind: 'problem', url: report.problemUrl } : null,
      limitations,
      errors:
        origin?.status === 'unavailable'
          ? [{ code: 'collection_unavailable', message: 'Collection unavailable.' }]
          : [],
    };
    proof.provenance = provenance;
    return provenance;
  });
  assertEvidenceReferences(report, new Set<string>(evidence.map((e: any) => e.id)));
  const parsed = InvestigationSnapshotSchemaV1.safeParse({
    schemaVersion: '1.0',
    investigationId: report.investigationId,
    problemId: report.problem.id,
    environment: report.environment,
    status: report.status,
    generatedAt: report.completedAt,
    evidence,
    limitations: report.limitations,
    errors: report.trace
      .filter((t: any) => t.status !== 'ok')
      .map((t: any) => ({
        collectionId: t.id,
        code: 'collection_unavailable',
        message: t.reason || 'Collection unavailable.',
      })),
    conclusions: report.findings.map((f: any) => ({
      statement: f.text,
      certainty: f.certainty,
      evidenceRefs: f.evidenceRefs,
    })),
  });
  if (!parsed.success) throw new Error('Investigation output contract validation failed');
  report.investigation = parsed.data;
}
