import { recordingDependencies, attachInvestigationContract } from '../core/investigation-engine/provenance';
import { normalizeExplainEvent } from './explain-event-context';
import { randomUUID } from 'node:crypto';
import type { InvestigationDependencies } from '../core/investigation-engine/dependencies';
import { collectGeneralEvidence } from './general-problem-evidence';
import { enrichPublishedDiagnosis, incidentWindow } from './published-problem-diagnosis';
import { buildExplainReport } from './problem-explain-report';
import { configuredInvestigationModel, InvestigationModel } from './local-investigation-model';

export type InvestigationAction = 'overview' | 'trend' | 'logs' | 'recovery' | 'writers' | 'threshold' | 'context' | 'events' | 'metrics';
const entityId = (value: any): string | undefined => (typeof value === 'string' ? value : value?.id);
const clean = (value: any): string => String(value ?? '').slice(0, 500);
const idPattern = /^(HOST|DISK)-[A-F0-9]{16}$/;
const sessions = new Map<
  string,
  { owner: string; alias: string; url: string; problemId?: string; diskId?: string; expires: number; steps: any[]; report: any; conversation: any[] }
>();
const ttl = 30 * 60 * 1000;
export function resolveInvestigationAction(question: string): InvestigationAction | null {
  const text = question
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/workload|pod|ecritur|nfs|writer|process|origine/.test(text)) return 'writers';
  if (/seuil|threshold|declench|alerte|trigger/.test(text)) return 'threshold';
  if (/log/.test(text)) return 'logs';
  if (/retabli|normal|recover|actuel|current|resolu|ferme/.test(text)) return 'recovery';
  if (/croissance|growth|trend|tendance|avant|pendant|compar|evol/.test(text)) return 'trend';
  return null;
}
export function summarizeDiskSeries(response: any, hostId: string, diskId: string) {
  const rows = (response?.result || [])
    .flatMap((r: any) => (r.data || []).map((s: any) => ({ r, s })))
    .filter(
      ({ s }: any) => s.dimensionMap?.['dt.entity.host'] === hostId && s.dimensionMap?.['dt.entity.disk'] === diskId,
    );
  if (rows.length !== 1) return null;
  const { r, s } = rows[0];
  const points = (s.timestamps || [])
    .map((t: number, i: number) => ({ t, v: s.values?.[i] }))
    .filter((p: any) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a: any, b: any) => a.t - b.t);
  if (!points.length) return null;
  const first = points[0],
    last = points[points.length - 1];
  const truncated =
    !!response.nextPageKey ||
    (Number.isFinite(r.dataPointCountRatio) && r.dataPointCountRatio < 1) ||
    (Number.isFinite(r.dimensionCountRatio) && r.dimensionCountRatio < 1) ||
    points.length > 100;
  return {
    first,
    last,
    count: points.length,
    delta: last.v - first.v,
    min: Math.min(...points.map((p: any) => p.v)),
    max: Math.max(...points.map((p: any) => p.v)),
    gaps:
      points.length !== (s.timestamps || []).length ||
      points.some((p: any, i: number) => i > 0 && p.t - points[i - 1].t > 300000),
    truncated,
    points: points.slice(-100),
  };
}
export async function investigateManagedProblem(
  inputDependencies: InvestigationDependencies,
  args: {
    environment_alias: string;
    problemId?: string;
    investigationId?: string;
    action?: InvestigationAction;
    question?: string;
  },
  owner = 'stdio',
  options: {paceMs: number; model?: InvestigationModel | null; explain?: boolean} = { paceMs: 1100 },
) {
  const ctx = recordingDependencies(inputDependencies, source => { trace.at(-1).source = source; trace.at(-1).collectedAt = new Date().toISOString(); });
  if (ctx.executionProfile === 'incident-intelligence') options = { ...options, model: null };
  const alias = args.environment_alias;
  if (!ctx.authClientManager.validAliases.includes(alias) || alias === 'ALL_ENVIRONMENTS' || alias.includes(';'))
    throw Error('Choose one valid environment');
  const url = ctx.authClientManager.getBaseUrl(alias);
  const now = Date.now();
  for (const [id, session] of sessions) if (session.expires < now) sessions.delete(id);
  const prior = args.investigationId ? sessions.get(args.investigationId) : undefined;
  if (args.investigationId && (!prior || prior.owner !== owner || prior.alias !== alias || prior.url !== url))
    throw Error('Investigation expired or unavailable in this environment; start a new investigation');
  if (args.question && prior) {
    const model = options.model === undefined ? configuredInvestigationModel() : options.model;
    if (model) {
      let result = structuredClone(prior.report);
      result.trace = [];
      try {
        const plan = await model.plan(args.question, prior.report, prior.conversation);
        if (plan !== 'answer' && plan !== 'clarify') {
          result = await investigateManagedProblem(inputDependencies, {
            environment_alias: alias, investigationId: args.investigationId, action: plan,
          }, owner, {...options, model: null});
        } else result.trace = [];
        const response = plan === 'clarify' ? {answer: 'Peux-tu préciser la vérification souhaitée ? Cette investigation permet uniquement des lectures des preuves du problème.', evidenceRefs: [], needsClarification: true} : await model.answer(args.question, {...result, selectionAction: plan}, prior.conversation);
        if (!response.needsClarification && !response.evidenceRefs.length) throw Error('No supporting evidence');
        result.answer = response;
        result.answeredAt = new Date().toISOString();
        result.summary = response.answer;
        result.action = plan;
        result.status = response.needsClarification ? 'needs_clarification' : result.status;
        result.llm = {provider: 'ollama-local', status: 'completed', mode: 'fact-selection'};
        result.limitations = [...new Set([...result.limitations, 'Le modèle local sélectionne les lectures et les faits ; les valeurs et conclusions sont construites par le MCP. La pertinence de la sélection reste à vérifier.'])];
        if (plan === 'answer' || plan === 'clarify') result.steps = [...prior.steps, {action: plan, collectedAt: result.answeredAt, summary: result.summary}].slice(-10);
        const current = sessions.get(args.investigationId!)!;
        current.expires = Date.now() + ttl;
        result.expiresAt = new Date(current.expires).toISOString();
        current.report = structuredClone(result);
        current.steps = result.steps;
        current.conversation = [...prior.conversation, {question: args.question, answer: response.answer}].slice(-6);
        return result;
      } catch {
        // Never expose errors containing inference or API request data; no keyword fallback.
        delete result.answer;
        return {...result, status: 'partial', action: 'answer', summary: 'Réponse locale indisponible ou non vérifiable. Les constats précédents restent disponibles.',
          llm: {provider: 'ollama-local', status: 'unavailable'},
          limitations: [...result.limitations, 'Ollama indisponible, réponse incomplète ou références de preuves invalides.']};
      }
    }
  }
  const action = args.question ? resolveInvestigationAction(args.question) : args.action || 'overview';
  if (!action)
    return {
      version: 1,
      status: 'needs_clarification',
      investigationId: args.investigationId,
      environment: { alias, url },
      summary: 'Choisir une piste : seuil, tendance, logs, rétablissement ou origine des écritures.',
      llm: { status: ctx.executionProfile === 'incident-intelligence' || options.model === null ? 'disabled' : process.env.DT_MCP_OLLAMA_ENABLED === 'true' ? 'available' : 'disabled' },
    nextSteps: actions(),
    };
  const problemId = prior?.problemId || args.problemId;
  if (!problemId || problemId.length > 200) throw Error('A problem ID is required');
  const scopes = ctx.tokenScopesFor?.(alias);
  const trace: any[] = [],
    evidence: any[] = [],
    findings: any[] = [],
    limitations: string[] = [];
  let lastRead = 0;
  const read = async (key: string, scope: string, fn: () => Promise<Map<string, any>>) => {
    const item: any = { id: 'E' + (trace.length + 1), kind: key, collectedAt: new Date().toISOString(), status: 'ok' };
    trace.push(item);
    if (scopes && !scopes.includes(scope)) {
      item.status = 'unavailable';
      item.reason = 'Permission absente : ' + scope;
      return null;
    }
    if (Date.now() - now > 80000 || trace.length > 18) {
      item.status = 'unavailable';
      item.reason = 'Budget de collecte atteint';
      return null;
    }
    const gap = Math.max(0, options.paceMs - (Date.now() - lastRead));
    if (gap) await new Promise((resolve) => setTimeout(resolve, gap));
    lastRead = Date.now();
    // All subreads are sequential and bounded; never expose upstream exceptions or credentials.
    try {
      const map = await fn();
      const value = map.get(alias);
      if (!value || typeof value !== 'object') throw Error();
      return value;
    } catch {
      item.status = 'unavailable';
      item.reason = 'Permission, connexion ou données indisponibles';
      return null;
    }
  };
  const fact = (kind: string, title: string, text: string, refs: string[], certainty = 'observed') =>
    findings.push({ kind, title, text, evidenceRefs: refs, certainty });
  const problem: any = await read('problem', 'problems.read', () =>
    ctx.problemsClient.getProblemDetails(problemId, alias),
  );
  if (problem?.problemId !== problemId) throw Error('Problem details unavailable; no diagnosis produced');
  evidence.push({
    id: trace[0].id,
    kind: 'problem',
    problemId,
    title: clean(problem.title),
    status: problem.status,
    startTime: problem.startTime,
    endTime: problem.endTime,
    rootCauseEntity: problem.rootCauseEntity || null,
  });
  const rawEvidence = (problem.evidenceDetails?.details || []).slice(0, 10);
  const affectedIds = [
    ...new Set(
      [...(problem.affectedEntities || []), ...(problem.impactedEntities || [])]
        .map((e: any) => entityId(e.entityId))
        .filter((id: any) => typeof id === 'string'),
    ),
  ];
  const events: any[] = [];
  if(rawEvidence.length>3)limitations.push('Contexte détaillé limité aux trois premières preuves de l’incident.');
  for (const e of rawEvidence.slice(0, 3)) {
    let event = e.data;
    if (!Array.isArray(event?.properties) && e.eventId)
      event = await read('event', 'events.read', () => ctx.eventsClient.getEventDetails(e.eventId, alias));
    if (event && typeof event==='object' && (event.eventId || event.eventType)) events.push(event);
  }
    for (const [i, event] of events.entries()) evidence.push({id: 'published-event-' + i, kind: 'events', returned: 1,
      events: [normalizeExplainEvent(event)]});
  const diskEvents = events
    .map((e) => ({ event: e, properties: Object.fromEntries((Array.isArray(e.properties)?e.properties:[]).map((p: any) => [p.key, p.value])) }))
    .filter(({ properties: p }) =>
      /^\(?builtin:host\.disk\.(used|usedPct)\)?(?=:|$)/.test(p['dt.event.metric_selector'] || ''),
    );
  const selected = diskEvents.find(
    ({ properties: p }) => !prior?.diskId || p['dt.event.metric_selector'].includes(prior.diskId),
  );
  const result: any = {
    version: 1,
    investigationId: args.investigationId || randomUUID(),
    environment: { alias, url },
    problem: { id: problemId, displayId: problem.displayId, title: clean(problem.title), status: problem.status, startTime: problem.startTime },
    collectedAt: new Date().toISOString(),
    action,
    explainRequested: options.explain === true || !!prior?.report.explain,
    findings,
    evidence,
    trace,
    limitations,
    llm: {status:options.model === null || ctx.executionProfile === 'incident-intelligence' ? 'disabled' : process.env.DT_MCP_OLLAMA_ENABLED === 'true' ? 'available' : 'disabled'},
    nextSteps: actions(),
    scope: null,
    cause: { status: 'unknown', text: 'La cause de cet incident n’est pas établie par les preuves collectées.' },
  };
  if (problem.rootCauseEntity) {
    fact(
      'davis',
      'Entité désignée par Davis',
      clean(
        problem.rootCauseEntity.name ||
          problem.rootCauseEntity.displayName ||
          entityId(problem.rootCauseEntity.entityId),
      ),
      ['E1'],
      'published',
    );
    limitations.push(
      'Une entité désignée par Davis ne constitue pas à elle seule une explication du mécanisme causal.',
    );
  }
  const useDisk = selected && !['context', 'events', 'metrics'].includes(action);
  if (useDisk) {
    const p = selected.properties,
      selector = String(p['dt.event.metric_selector']);
    const hosts = [...new Set(selector.match(/HOST-[A-F0-9]{16}/g) || [])];
    const disks = [...new Set(selector.match(/DISK-[A-F0-9]{16}/g) || [])];
    const hostId = hosts.length === 1 ? hosts[0] : null,
      diskId = disks.length === 1 ? disks[0] : null;
    const metricId = selector.match(/builtin:host\.disk\.(?:usedPct|used)/)?.[0];
    // Only the narrow disk path is executable. Never forward arbitrary event selectors/formulas.
    const safeSelector =
      hostId &&
      diskId &&
      metricId &&
      idPattern.test(hostId) &&
      idPattern.test(diskId) &&
      /^\(?builtin:host\.disk\.(used|usedPct)\)?:filter\(eq\("dt.entity.disk",DISK-[A-F0-9]{16}\),eq\("dt.entity.host",HOST-[A-F0-9]{16}\)\)$/.test(
        selector,
      );
    if (!safeSelector || !affectedIds.includes(hostId)) {
      limitations.push(
        'Sélecteur disque non pris en charge ou Host non confirmé dans l’impact du problème ; aucune requête élargie exécutée.',
      );
    } else {
      result.scope = { hostId, diskId, metricId };
      result.cause.text = 'L’origine des écritures sur ce volume reste inconnue.';
      const triggerId = 'trigger';
      evidence.push({
        id: triggerId,
        kind: 'trigger',
        eventId: selected.event.eventId,
        startTime: selected.event.startTime,
        metricSelector: selector,
        reportedThreshold: clean(p['dt.event.metric_threshold']),
        description: clean(p['dt.event.description']),
      });
      fact(
        'trigger',
        'Usage disque signalé par Dynatrace',
        'Dynatrace a publié un événement d’usage disque sur ce volume. La condition exacte de déclenchement dépend de la règle d’alerte.',
        [triggerId],
        'published',
      );
      const metric = await read('metric-contract', 'metrics.read', () =>
        ctx.metricsClient.getMetricDetails(metricId, alias),
      );
      const contractRef = trace[trace.length - 1].id;
      if (metric)
        evidence.push({
          id: contractRef,
          kind: 'metric-contract',
          metricId,
          unit: metric.unit,
          description: clean(metric.description),
        });
      const host = await read('host', 'entities.read', () => ctx.entitiesClient.getEntityDetails(hostId, alias));
      if (host?.entityId === hostId) {
        result.scope.hostName = clean(host.displayName);
        evidence.push({id: trace[trace.length - 1].id, kind: 'entity', entityId: hostId, type: 'HOST', name: result.scope.hostName});
      }
      const disk = await read('disk', 'entities.read', () => ctx.entitiesClient.getEntityDetails(diskId, alias));
      const diskRef = trace[trace.length - 1].id;
      if (disk?.entityId === diskId) {
        result.scope.diskName = clean(disk.displayName);
        result.scope.filesystem = clean(disk.properties?.filesystemType);
        evidence.push({
          id: diskRef,
          kind: 'disk',
          diskId,
          name: result.scope.diskName,
          filesystem: result.scope.filesystem,
        });
        if (/^nfs/i.test(result.scope.filesystem))
          fact(
            'storage',
            'Volume NFS',
            'Le volume est distant. Les écritures peuvent provenir d’autres clients ; ce Host seul ne permet pas d’en identifier l’auteur.',
            [diskRef],
          );
      }
      const settingId = p['dt.settings.object_id'];
      let rule: any = null;
      if (typeof settingId === 'string' && /^[A-Za-z0-9_-]{1,600}$/.test(settingId))
        rule = await read('alert-rule', 'settings.read', () =>
          ctx.authClientManager.makeRequests('/api/v2/settings/objects/' + encodeURIComponent(settingId), {}, alias),
        );
      // Only an unchanged, exact selector and a static rule can qualify threshold units. Never convert a raw event value alone.
      const model = rule?.value?.modelProperties,
        query = rule?.value?.queryDefinition;
      const verified =
        rule?.schemaId === 'builtin:anomaly-detection.metric-events' &&
        model?.type === 'STATIC_THRESHOLD' &&
        query?.type === 'METRIC_SELECTOR' &&
        query?.metricSelector === selector &&
        Number.isFinite(model.threshold) &&
        String(p['dt.event.metric_threshold']).trim() !== '' &&
        Number.isFinite(Number(p['dt.event.metric_threshold'])) &&
        model.threshold === Number(p['dt.event.metric_threshold']) &&
        ['ABOVE', 'BELOW'].includes(model.alertCondition) &&
        !!metric?.unit;
      evidence.push({
        id: 'rule',
        kind: 'alert-rule',
        verified: !!verified,
        reportedThreshold: clean(p['dt.event.metric_threshold']),
        ...(verified
          ? {
              threshold: model.threshold,
              unit: metric.unit,
              condition: model.alertCondition,
              violatingSamples: model.violatingSamples,
              samples: model.samples,
            }
          : {}),
      });
      if (verified)
        fact(
          'rule',
          'Règle d’alerte relue',
          `Règle statique : ${model.alertCondition === 'ABOVE' ? 'au-dessus' : 'en dessous'} de ${model.threshold} ${metric.unit}. La configuration actuelle correspond aux propriétés de l’événement ; elle ne prouve pas l’historique de ses modifications.`,
          ['rule', triggerId, contractRef],
        );
      else
        limitations.push(
          'Seuil publié non interprété : configuration, modèle ou transformation non vérifiés. Le seuil brut reste dans les preuves.',
        );
      const metricQuery = (id: string) =>
        `${id}:filter(eq("dt.entity.disk",${diskId}),eq("dt.entity.host",${hostId})):avg`;
      const windows = [{ label: 'recent', from: 'now-2h', to: 'now' }];
      if (Number.isFinite(selected.event.startTime) && selected.event.startTime > 0)
        windows.push({
          label: 'incident',
          from: new Date(selected.event.startTime - 3600000).toISOString(),
          to: new Date(selected.event.startTime + 3600000).toISOString(),
        });
      if (result.explainRequested) {
        const incident = incidentWindow(problem);
        windows.splice(1);
        if (incident) {
          windows.push({label:'incident',from:String(incident.from),to:String(incident.to)});
          const duration=incident.to-incident.from;
          if (duration>0 && incident.from>=duration) windows.push({label:'baseline',from:String(incident.from-duration),to:String(incident.from)});
          if(incident.partial) limitations.push('Fenêtre disque incidente limitée aux deux dernières heures.');
        } else limitations.push('Dates incidentes invalides : comparaison disque non disponible.');
      }
      for (const window of windows) {
        const data = await read('disk-' + window.label, 'metrics.read', () =>
          ctx.metricsClient.queryMetrics(
            {
              metricSelector: metricQuery(metricId),
              entitySelector: `entityId("${hostId}")`,
              resolution: '5m',
              from: window.from,
              to: window.to,
            },
            alias,
          ),
        );
        const checkedData = result.explainRequested && window.label !== 'recent' ? { ...data, result:(data?.result || []).map((r:any)=>({...r,data:(r.data || []).map((s:any)=>({...s,values:(s.timestamps || []).map((t:number,i:number)=>t >= Number(window.from) && t < Number(window.to) ? s.values?.[i] : null)}))})) } : data;
        const summary = summarizeDiskSeries(checkedData, hostId, diskId),
          ref = trace[trace.length - 1].id;
        if (!summary) {
          limitations.push('Mesures ' + window.label + ' absentes, ambiguës ou sans dimensions confirmées.');
          continue;
        }
        evidence.push({
          id: ref,
          kind: 'series',
          window: window.label,
          entityId: diskId,
          hostId,
          from: Number(window.from),
          to: Number(window.to),
          metricId,
          unit: metric?.unit || null,
          ...summary,
        });
        if (summary.last.t > Date.now() + 300000)
          limitations.push(
            'Horodatage des mesures postérieur au poste : ces observations ne sont pas qualifiées comme état actuel.',
          );
        if (summary.gaps || summary.truncated)
          limitations.push('Série ' + window.label + ' partielle ; tendance descriptive, non exhaustive.');
        if (window.label === 'recent' && metric?.unit === 'Byte') {
          fact(
            'usage',
            'Espace utilisé observé',
            `${(summary.last.v / 1073741824).toFixed(2)} GiB au dernier point retourné.`,
            [ref],
          );
          fact(
            'trend',
            'Évolution de l’usage',
            `${summary.delta >= 0 ? '+' : ''}${(summary.delta / 1048576).toFixed(2)} MiB entre le premier et le dernier point (${summary.count} points). Cette variation ne prouve ni anomalie ni cause.`,
            [ref],
          );
        } else if (window.label === 'recent' && metric?.unit === 'Percent')
          fact('usage', 'Occupation observée', `${summary.last.v.toFixed(2)} % au dernier point retourné.`, [ref]);
      }
      const freeMetric = await read('free-contract', 'metrics.read', () =>
        ctx.metricsClient.getMetricDetails('builtin:host.disk.avail', alias),
      );
      const freeData = await read('disk-available', 'metrics.read', () =>
        ctx.metricsClient.queryMetrics(
          {
            metricSelector: metricQuery('builtin:host.disk.avail'),
            entitySelector: `entityId("${hostId}")`,
            resolution: '5m',
            from: 'now-2h',
            to: 'now',
          },
          alias,
        ),
      );
      const free = summarizeDiskSeries(freeData, hostId, diskId),
        freeRef = trace[trace.length - 1].id;
      if (free && freeMetric?.unit === 'Byte') {
        evidence.push({ id: freeRef, kind: 'available-space', unit: 'Byte', ...free });
        fact(
          'capacity',
          'Espace disponible observé',
          `${(free.last.v / 1073741824).toFixed(2)} GiB disponibles au point retourné. Les lectures ne démontrent pas à elles seules une saturation ; les points peuvent différer de ceux de l’incident.`,
          [freeRef],
        );
      } else limitations.push('Espace disponible non évaluable ; aucune conclusion de saturation.');
      const logs = await read('host-logs', 'logs.read', () =>
        ctx.logsClient.queryLogs({ hostId, query: 'No space left', from: 'now-24h', to: 'now', limit: 10 }, alias),
      );
      const logsRef = trace[trace.length - 1].id;
      if (logs && Array.isArray(logs.results)) {
        evidence.push({
          id: logsRef,
          kind: 'logs',
          hostId,
          phrase: 'No space left',
          returned: logs.results.length,
          partial: !!logs.nextSliceKey,
          matches: logs.results
            .slice(0, 10)
            .map((l: any) => ({
              timestamp: l.timestamp,
              mentionsMount: !!result.scope.diskName && String(l.content).includes(result.scope.diskName),
            })),
        });
        fact(
          'logs',
          'Logs de stockage',
          `${logs.results.length} résultat(s) pour « No space left » sur ce Host, sur 24 h. ${logs.results.length ? 'Ces messages ne prouvent pas l’auteur des écritures ni leur lien avec ce Disk.' : 'Aucun résultat ne garantit ni l’absence d’erreur ni la couverture des logs.'}`,
          [logsRef],
        );
      }
      if (action === 'writers' || action === 'overview') {
        const uid = result.scope.diskName?.match(/\/pods\/([0-9a-f-]{36})\//i)?.[1];
        const nodeId = p['dt.entity.kubernetes_node'];
        if (uid && /^KUBERNETES_NODE-[A-F0-9]{16}$/.test(nodeId || '')) {
          const node = await read('kubernetes-node', 'entities.read', () =>
            ctx.entitiesClient.getEntityDetails(nodeId, alias),
          );
          const podIds = [
            ...new Set(
              Object.values({ ...node?.fromRelationships, ...node?.toRelationships }).flatMap((rows: any) =>
                Array.isArray(rows)
                  ? rows
                      .filter(
                        (r: any) =>
                          r.type === 'CLOUD_APPLICATION_INSTANCE' &&
                          /^CLOUD_APPLICATION_INSTANCE-[A-F0-9]{16}$/.test(r.id),
                      )
                      .map((r: any) => r.id)
                  : [],
              ),
            ),
          ] as string[];
          for (const podId of podIds.slice(0, 3)) {
            const pod = await read('pod-context', 'entities.read', () =>
              ctx.entitiesClient.getEntityDetails(podId, alias),
            );
            if (
              pod?.entityId === podId &&
              Object.entries(pod.properties || {}).some(
                ([key, value]) => /uid/i.test(key) && String(value).toLowerCase() === uid.toLowerCase(),
              )
            ) {
              const ref = trace[trace.length - 1].id;
              evidence.push({
                id: ref,
                kind: 'pod-context',
                entityId: podId,
                name: clean(pod.displayName),
                namespace: clean(pod.properties?.namespaceName),
                uid,
              });
              fact(
                'context',
                'Pod associé au montage',
                clean(pod.displayName) +
                  ' correspond à l’UID du chemin de montage. Cela identifie un contexte, pas la preuve que ce pod produit les écritures.',
                [ref, diskRef],
              );
            }
          }
          limitations.push(
            podIds.length
              ? 'Contexte Kubernetes borné à 3 pods du node ; une correspondance de montage ne prouve pas les écritures.'
              : 'Relations pod du node non retournées ; auteur des écritures non identifié.',
          );
        }
      }
      if (action === 'writers')
        fact(
          'next-check',
          'Identifier les écritures',
          'Confirmer le pod et le volume associés à ce montage, puis examiner le stockage distant et ses clients. Le chemin de montage seul ne permet pas d’attribuer les écritures.',
          [diskRef],
          'hypothesis',
        );
      if (diskEvents.length > 1)
        limitations.push('Investigation ciblée sur un seul Disk ; autres événements disque non examinés.');
    }
  } else {
    result.eventMetricIds = [...new Set(events.map(e => (Array.isArray(e.properties)?e.properties:[]).find((p: any) => p.key === 'dt.event.metric_selector')?.value)
      .map(value => String(value || '').match(/^\(?((?:builtin:)?[A-Za-z0-9_.-]+)\)?(?=:|$)/)?.[1]).filter(Boolean))];
    await collectGeneralEvidence(ctx, alias, problem, result, read);
    if (['writers', 'threshold'].includes(action)) limitations.push('Cette piste spécialisée ne dispose pas de preuves suffisantes pour ce problème.');
  }
  limitations.push(
    'Cause technique non déduite d’une simple corrélation. Lectures bornées ; aucun accès direct au filesystem, aucune commande exécutée.',
  );
  result.summary = useDisk && result.scope
    ? 'Usage disque signalé · origine des écritures à confirmer'
    : 'Problème relu · impact, entités et preuves disponibles';
  enrichPublishedDiagnosis(problem, result);
  if(result.explainRequested) result.explain=buildExplainReport(problem,result);
  delete result.explainRequested;
  delete result.explainMetricsCollected;
  result.status = trace.some((t) => t.status !== 'ok') || evidence.some(e => e.gaps || e.truncated || e.partial) || result.coverage?.partial ? 'partial' : 'completed';
  delete result.eventMetricIds;
  result.completedAt = new Date().toISOString();
  result.problemUrl = url + '/#problems/problemdetails;pid=' + encodeURIComponent(problemId);
  result.steps = [...(prior?.steps || []), { action, collectedAt: result.collectedAt, summary: result.summary }].slice(
    -10,
  );
  attachInvestigationContract(result);
  while (sessions.size >= 100 && !sessions.has(result.investigationId)) sessions.delete(sessions.keys().next().value!);
  sessions.set(result.investigationId, {
    owner,
    alias,
    url,
    problemId,
    diskId: result.scope?.diskId || prior?.diskId,
    expires: Date.now() + ttl,
    steps: result.steps,
    report: structuredClone(result),
    conversation: prior?.conversation || [],
  });
  result.expiresAt = new Date(Date.now() + ttl).toISOString();
  return result;
}
export function investigationContext(ctx: InvestigationDependencies, alias: string, id: string, owner = 'stdio') {
  const session = sessions.get(id);
  if (!session || session.expires < Date.now() || session.owner !== owner || session.alias !== alias ||
      session.url !== ctx.authClientManager.getBaseUrl(alias)) throw Error('Investigation expired or unavailable in this environment');
  return {report: structuredClone(session.report), conversation: structuredClone(session.conversation), expiresAt: new Date(session.expires).toISOString()};
}
/** Register an environment conversation without fabricating a Dynatrace problem. */
export function createEnvironmentConversation(ctx: InvestigationDependencies, alias: string, target: any = {kind:'environment'}) {
  if (!ctx.authClientManager.validAliases.includes(alias)) throw Error('Environment unavailable');
  const url = ctx.authClientManager.getBaseUrl(alias), id = randomUUID(), expires = Date.now() + ttl;
  const report:any = {
    version:1, investigationId:id, sessionKind:'environment', environment:{alias,url}, problem:null,
    llm:{status:process.env.DT_MCP_OLLAMA_ENABLED === 'true' ? 'available' : 'disabled'}, contextTarget:target, scope:{entities:[]}, evidence:[], findings:[], trace:[], nextSteps:[], steps:[],
    summary:'Conversation sur cet environnement.', status:'completed', collectedAt:new Date().toISOString(),
    expiresAt:new Date(expires).toISOString(), limitations:['Session MCP : 30 minutes ; perdue au redémarrage.'],
  };
  for(const [key, session] of sessions) if(session.expires < Date.now()) sessions.delete(key);
  while(sessions.size >= 100) sessions.delete(sessions.keys().next().value!);
  sessions.set(id,{owner:ctx.investigationOwner || 'stdio',alias,url,expires,steps:[],report:structuredClone(report),conversation:[]});
  return report;
}
function actions() {
  return [
    { id: 'threshold', label: 'Vérifier la règle' },
    { id: 'trend', label: 'Comparer la tendance' },
    { id: 'logs', label: 'Examiner les logs' },
    { id: 'recovery', label: 'Relire l’état' },
    { id: 'writers', label: 'Origine des écritures' },
  ];
}

export function updateInvestigationConversation(ctx:InvestigationDependencies,alias:string,id:string,report:any,conversation:any[]) {
  investigationContext(ctx,alias,id,ctx.investigationOwner);
  const session=sessions.get(id)!;session.expires=Date.now()+ttl;report.expiresAt=new Date(session.expires).toISOString();session.report=structuredClone(report);session.conversation=structuredClone(conversation);
}
