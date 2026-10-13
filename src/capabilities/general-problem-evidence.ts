import { normalizeExplainEvent } from './explain-event-context';
import { collectExplainServiceEvidence } from './explain-service-evidence';
import { incidentWindow } from './published-problem-diagnosis';
import type { InvestigationDependencies } from '../core/investigation-engine/dependencies';
type Reader = (key: string, scope: string, fn: () => Promise<Map<string, any>>) => Promise<any>;
const validEntity = /^[A-Z][A-Z0-9_]*-[A-F0-9]{16}$/;
const idOf = (v: any) => typeof v === 'string' ? v : v?.id;
const clean = (v: any) => String(v ?? '').slice(0, 500);
/** All entities must originate in this problem; no model supplied selectors/IDs. */
export async function collectGeneralEvidence(ctx: InvestigationDependencies, alias: string, problem: any, result: any, read: Reader) {
  const window = incidentWindow(problem);
  const interval = window ? {from:String(window.from), to:String(window.to)} : {from:'now-2h', to:'now'};
  result.collectionWindow = {...interval, basis:window ? 'incident' : 'recent-context', partial:window?.partial || false};
  if (!window) result.limitations.push('Fenêtre incidente inexploitable : lectures récentes de contexte, sans reconstitution de l’incident.');
  const ids: string[] = [...new Set<string>([
    ...(problem.rootCauseEntity ? [problem.rootCauseEntity] : []),
    ...(problem.affectedEntities || []), ...(problem.impactedEntities || []),
  ].map((e: any) => idOf(e.entityId)).filter((id: any) => typeof id === 'string' && validEntity.test(id)))];
  result.scope = {entities: []};
  result.coverage = {partial: ids.length > 3 || !ids.length};
  result.evidence.push({id: 'impact', kind: 'impact', severityLevel: problem.severityLevel,
    impactLevel: problem.impactLevel, affected: ids, status: problem.status});
  result.findings.push({kind: 'impact', title: 'Impact publié',
    text: `${ids.length} entité(s) désignée(s) par Dynatrace · état ${clean(problem.status)}${problem.severityLevel ? ' · ' + clean(problem.severityLevel) : ''}.`,
    evidenceRefs: ['impact'], certainty: 'published'});
  if (ids.length > 3) result.limitations.push('Contexte borné aux trois premières entités du problème ; impact non exhaustif.');
  const ref = () => result.trace.at(-1).id;
  const fact = (kind: string, title: string, text: string, evidenceRefs: string[]) => result.findings.push({kind, title, text, evidenceRefs, certainty: 'observed'});
  for (const id of ids.slice(0, 3)) {
    const entity = await read('entity-context', 'entities.read', () => ctx.entitiesClient.getEntityDetails(id, alias));
    if (entity?.entityId !== id) {result.limitations.push('Détails d’entité absents : ' + id); continue;}
    const type = id.slice(0, id.lastIndexOf('-'));
    const entityRef = ref();
    const name = clean(entity.displayName || id);
    const context = {entityId: id, type, name};
    result.scope.entities.push(context);
    if (type === 'HOST' && !result.scope.hostId) {result.scope.hostId = id; result.scope.hostName = name;}
    const relations = Object.entries({...entity.fromRelationships, ...entity.toRelationships}).slice(0, 10)
      .map(([relation, values]: any) => ({relation, entities: (Array.isArray(values) ? values : []).slice(0, 10).map((v: any) => ({id: v.id, type: v.type}))}));
    result.evidence.push({id: entityRef, kind: 'entity', ...context, relations});
    fact('context', type + ' concerné', name, [entityRef, 'impact']);
    if (['overview', 'events'].includes(result.action)) {
      const events = await read('entity-events', 'events.read', () => ctx.eventsClient.queryEvents({
        entitySelector: `entityId("${id}")`, ...interval, pageSize: 10,
      }, alias));
      if (events && Array.isArray(events.events)) {
        const eventRef = ref();
        result.evidence.push({id: eventRef, kind: 'events', entityId: id, returned: events.events.length,
          partial: !!events.nextPageKey || events.totalCount > events.events.length,
          events: events.events.slice(0, 10).map(normalizeExplainEvent)});
        fact('events', 'Événements · ' + name, `${events.events.length} événement(s) retourné(s) sur la fenêtre collectée ; une proximité temporelle ne prouve pas un lien causal.`, [eventRef]);
        if (events.nextPageKey || events.totalCount > events.events.length) result.limitations.push('Événements tronqués pour ' + name);
      }
    }
    if(result.explainRequested && type==='SERVICE' && ['ERROR','PERFORMANCE'].includes(problem.severityLevel) && ['overview','metrics','trend'].includes(result.action)) {
      await collectExplainServiceEvidence(ctx,alias,problem,result,id,read);
    } else if (['overview', 'metrics', 'trend', 'recovery'].includes(result.action)) {
      // Discover metrics appropriate to the exact affected entity. Never substitute CPU
      // or a title-derived metric as the explanation of an unrelated problem.
      const catalog = await read('entity-metric-catalog', 'metrics.read', () => ctx.metricsClient.listAvailableMetrics(alias, {
        entitySelector: `entityId("${id}")`, pageSize: 100, fields: 'unit,dimensionDefinitions', writtenSince: interval.from,
        text: type==='HOST'?'builtin:host':type==='SERVICE'?'builtin:service':type==='HTTP_CHECK'?'builtin:synthetic.http':type==='SYNTHETIC_TEST'?'builtin:synthetic.browser':undefined,
      }));
      const dimensionKey:Record<string,string>={HOST:'dt.entity.host',SERVICE:'dt.entity.service',HTTP_CHECK:'dt.entity.http_check',SYNTHETIC_TEST:'dt.entity.synthetic_test'};
      const prefixes:Record<string,RegExp>={HOST:/^builtin:host\.(cpu|mem|disk|net)\./,SERVICE:/^builtin:service\.(errors|response|request|availability)/,HTTP_CHECK:/^builtin:synthetic\.http\./,SYNTHETIC_TEST:/^builtin:synthetic\.browser\./};
      const dimensions = (catalog?.metrics || []).filter((m: any) =>
        /^(?:builtin:)?[A-Za-z0-9_.-]{1,180}$/.test(m.metricId || '') &&
        !/(?:^|[.:])(billing|ddu|cost)(?:[.:]|$)/i.test(m.metricId) &&
        (prefixes[type]?.test(m.metricId) || (result.eventMetricIds || []).includes(m.metricId)) &&
        (m.dimensionDefinitions || []).some((d: any) => d.key===dimensionKey[type]));
      if (catalog?.nextPageKey || catalog?.totalCount > (catalog?.metrics?.length || 0)) {result.limitations.push('Catalogue métrique partiel pour ' + name);result.coverage.partial=true;}
      const preferred:Record<string,string[]>={HOST:['builtin:host.cpu.usage','builtin:host.mem.usage'],SERVICE:['builtin:service.errors.server.rate','builtin:service.response.time'],HTTP_CHECK:['builtin:synthetic.http.availability','builtin:synthetic.http.duration'],SYNTHETIC_TEST:['builtin:synthetic.browser.availability','builtin:synthetic.browser.duration']};
      const priority=(m:any)=>((result.eventMetricIds || []).includes(m.metricId)?1000:0)+(preferred[type]?.includes(m.metricId)?100-preferred[type].indexOf(m.metricId):0);
      const ranked = [...dimensions].sort((a: any, b: any) => priority(b)-priority(a));
      if (!dimensions.length) {result.limitations.push('Aucune métrique opérationnelle pertinente avec dimension exacte pour ' + name);result.coverage.partial=true;}
      for (const metric of ranked.slice(0, 2)) {
        const data = await read('entity-metric', 'metrics.read', () => ctx.metricsClient.queryMetrics({
          metricSelector: metric.metricId, entitySelector: `entityId("${id}")`, ...interval, resolution: '5m',
        }, alias));
        const rows = (data?.result || []).flatMap((r: any) => (r.data || []).map((s: any) => ({r, s})))
          .filter(({r,s}: any) => (r.metricId===metric.metricId || r.metricId===metric.metricId+':avg') && s.dimensionMap?.[dimensionKey[type]]===id);
        if (rows.length !== 1) {result.limitations.push('Série absente ou multidimensionnelle pour ' + metric.metricId);result.coverage.partial=true; continue;}
        const {r, s} = rows[0];
        const numericWindow=Number.isFinite(Number(interval.from))&&Number.isFinite(Number(interval.to));
        const points = (s.timestamps || []).map((t: any, i: number) => ({t, v: s.values?.[i]}))
          .filter((p: any) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.t<=Date.now()+300000 && (!numericWindow || p.t>=Number(interval.from)&&p.t<Number(interval.to))).sort((a: any, b: any) => a.t - b.t);
        if (!points.length) {result.limitations.push('Mesures absentes pour ' + metric.metricId);result.coverage.partial=true; continue;}
        const first = points[0], last = points.at(-1);
        const partial = !!data.nextPageKey || r.dataPointCountRatio < 1 || r.dimensionCountRatio < 1 || points.length > 100 ||
          points.length !== s.timestamps.length || points.some((p: any, i: number) => i > 0 && p.t - points[i - 1].t > 300000);
        const metricRef = ref();
        result.evidence.push({id: metricRef, kind: 'series', entityId: id, metricId: metric.metricId, unit: metric.unit || null,
          from:numericWindow?Number(interval.from):null,to:numericWindow?Number(interval.to):null,window:window?'incident':'recent-context',first, last, count: points.length, delta: last.v - first.v, partial, points: points.slice(-100)});
        fact('metrics', clean(metric.displayName || metric.metricId), `${last.v} ${metric.unit || '(unité non retournée)'} au dernier point, ${points.length} point(s). Mesure descriptive ; aucun seuil ni mécanisme causal déduit.`, [metricRef]);
        if (partial) result.limitations.push('Série partielle pour ' + metric.metricId);
        if (last.t > Date.now() + 300000) result.limitations.push('Horodatage futur : mesure non qualifiée comme état actuel.');
      }
    }
    if (result.action === 'logs' && type === 'HOST') {
      const logs = await read('host-logs', 'logs.read', () => ctx.logsClient.queryLogs({hostId: id, query: '', ...interval, limit: 10}, alias));
      if (Array.isArray(logs?.results)) {
        const logRef = ref();
        result.evidence.push({id: logRef, kind: 'logs', entityId: id, returned: logs.results.length, partial: !!logs.nextSliceKey,
          matches: logs.results.slice(0, 10).map((l: any) => ({timestamp: l.timestamp, status: l.status}))});
        fact('logs', 'Logs · ' + name, `${logs.results.length} résultat(s) retourné(s). Le contenu brut n’est pas envoyé au modèle ; aucun lien causal attesté.`, [logRef]);
      }
    }
  }
  if (result.action === 'logs' && !result.scope.hostId) result.limitations.push('Aucun Host explicitement affecté ; aucune recherche de logs globale exécutée.');
  if (!ids.length) result.limitations.push('Aucune entité affectée exploitable dans les preuves du problème.');
  result.nextSteps = [{id: 'context', label: 'Entités'}, {id: 'events', label: 'Événements'}, {id: 'metrics', label: 'Métriques'}, {id: 'logs', label: 'Logs'}, {id: 'recovery', label: 'État actuel'}];
}
