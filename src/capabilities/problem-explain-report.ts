import { incidentWindow } from './published-problem-diagnosis';
import { explainRemediation } from './explain-remediation';
const clean = (v: any) => String(v ?? '').slice(0, 500);
const entityId = (v: any) => (typeof v === 'string' ? v : v?.id);
export interface ExplainItem {
  title: string;
  text: string;
  certainty: 'published' | 'observed' | 'unknown' | 'conditional' | 'hypothesis';
  evidenceRefs: string[];
  condition?: string;
  action?: string;
}
const formatMeasure = (value: number, unit: string) => {
  const scales: Record<string, [number, string]> = {
    MicroSecond: [1000, 'ms'],
    MilliSecond: [1, 'ms'],
    Second: [1, 's'],
    Percent: [1, '%'],
    Byte: [1, 'octets'],
  };
  const [scale, label] = scales[unit] || [1, unit];
  const converted = value / scale,
    seconds = label === 'ms' && Math.abs(converted) >= 1000;
  const displayed = seconds ? converted / 1000 : converted,
    displayUnit = seconds ? 's' : label;
  return {
    value: displayed,
    unit: displayUnit,
    text: displayed.toLocaleString('fr-FR', { maximumFractionDigits: seconds ? 3 : 2 }) + ' ' + displayUnit,
  };
};
/** Directly renderable contract. Facts, hypotheses and conditional guidance stay in the MCP. */
export function buildExplainReport(problem: any, report: any) {
  const evidence = report.evidence || [];
  const source = evidence.find((e: any) => e.kind === 'problem'),
    refs = source ? [source.id] : [];
  const ids = (rows: any[]) => [
    ...new Set<string>(rows.map((e: any) => entityId(e.entityId)).filter((id: any) => typeof id === 'string')),
  ];
  const affected = ids(problem.affectedEntities || []),
    impacted = ids(problem.impactedEntities || []);
  const root = report.diagnosis?.publishedRootCause;
  const plan = report.scope?.diskId
    ? 'disk'
    : [...affected, ...impacted, root?.entityId].some((id) => id?.startsWith('SERVICE-')) &&
        ['ERROR', 'PERFORMANCE'].includes(problem.severityLevel)
      ? 'service'
      : [...affected, ...impacted].some((id) => /^(HTTP_CHECK|SYNTHETIC_TEST)-/.test(id))
        ? 'synthetic'
        : [...affected, ...impacted].some((id) => id.startsWith('HOST-')) &&
            ['RESOURCE_CONTENTION', 'PERFORMANCE', 'AVAILABILITY'].includes(problem.severityLevel)
          ? 'infrastructure'
          : 'generic';
  const item = (
    title: string,
    text: string,
    certainty: ExplainItem['certainty'],
    evidenceRefs = refs,
  ): ExplainItem => ({ title, text, certainty, evidenceRefs });
  const entities = [...new Set([...affected, ...impacted])].map((id) => {
    const published = [...(problem.affectedEntities || []), ...(problem.impactedEntities || [])].find(
      (e: any) => entityId(e.entityId) === id,
    );
    const detail = evidence.find((e: any) => e.kind === 'entity' && e.entityId === id);
    const scope = (report.scope?.entities || []).find((e: any) => e.entityId === id);
    return {
      id,
      name: clean(
        published?.name ||
          detail?.name ||
          scope?.name ||
          (report.scope?.hostId === id ? report.scope.hostName : null) ||
          id,
      ),
      type: id.split('-')[0],
      evidenceRefs: [...refs, ...(detail ? [detail.id] : [])],
    };
  });
  const comparisons: any[] = [];
  for (const incident of evidence.filter((e: any) => e.kind === 'series' && e.window === 'incident')) {
    const baselines = evidence.filter(
      (e: any) =>
        e.kind === 'series' &&
        e.window === 'baseline' &&
        e.metricId === incident.metricId &&
        e.aggregation === incident.aggregation &&
        e.entityId === incident.entityId,
    );
    const incidents = evidence.filter(
      (e: any) =>
        e.kind === 'series' &&
        e.window === 'incident' &&
        e.metricId === incident.metricId &&
        e.aggregation === incident.aggregation &&
        e.entityId === incident.entityId,
    );
    if (baselines.length !== 1 || incidents.length !== 1) continue;
    const baseline = baselines[0];
    if (
      !baseline ||
      !incident.unit ||
      incident.unit !== baseline.unit ||
      incident.count < 2 ||
      baseline.count < 2 ||
      [incident, baseline].some((e) => e.partial || e.gaps || e.truncated)
    )
      continue;
    if (
      ![incident.from, incident.to, baseline.from, baseline.to].every(Number.isFinite) ||
      incident.from < 0 ||
      baseline.from < 0 ||
      incident.to <= incident.from ||
      baseline.to <= baseline.from ||
      (baseline.to !== incident.from &&
        !(
          incident.windowBasis === 'complete-5m-buckets; baseline-before-problem-start' &&
          baseline.windowBasis === incident.windowBasis &&
          baseline.to <= incident.from
        )) ||
      incident.to - incident.from !== baseline.to - baseline.from
    )
      continue;
    if (incident.aggregation !== baseline.aggregation) continue;
    const serviceComparison =
      plan === 'service' &&
      ['avg', 'percentile(95)'].includes(incident.aggregation) &&
      baseline.aggregation === incident.aggregation &&
      Number.isFinite(incident.mean) &&
      Number.isFinite(baseline.mean);
    const volumeComparison =
      plan === 'service' &&
      incident.unit === 'Count' &&
      incident.aggregation === 'value' &&
      baseline.aggregation === 'value' &&
      Number.isFinite(incident.sum) &&
      Number.isFinite(baseline.sum);
    const diskComparison = plan === 'disk' && Number.isFinite(incident.max) && Number.isFinite(baseline.max);
    if (!serviceComparison && !volumeComparison && !diskComparison) continue;
    const metricTitles: Record<string, string> = {
      'builtin:service.keyRequest.response.server': 'Temps de réponse de la key request',
      'builtin:service.keyRequest.errors.server.rate': 'Erreurs de la key request',
      'builtin:host.cpu.usage': 'Utilisation CPU de l’hôte · moyenne',
      'builtin:host.mem.usage': 'Utilisation mémoire de l’hôte · moyenne',
    };
    const title =
      metricTitles[incident.metricId] ||
      (incident.metricId === 'builtin:service.errors.server.rate'
        ? 'Erreurs côté serveur'
        : incident.metricId === 'builtin:service.response.time'
          ? incident.aggregation === 'percentile(95)'
            ? 'Latence de queue · moyenne des p95 par créneau'
            : 'Temps de réponse moyen'
          : volumeComparison
            ? 'Volume de requêtes'
            : plan === 'service'
              ? 'Comparaison métrique · ' + incident.metricId
              : 'Usage disque · maximum');
    const before = formatMeasure(
        serviceComparison ? baseline.mean : volumeComparison ? baseline.sum : baseline.max,
        baseline.unit,
      ),
      during = formatMeasure(
        serviceComparison ? incident.mean : volumeComparison ? incident.sum : incident.max,
        incident.unit,
      );
    comparisons.push({
      title,
      metricId: incident.metricId,
      entityId: incident.entityId,
      entityName: clean(
        evidence.find((e: any) => e.kind === 'entity' && e.entityId === incident.entityId)?.name ||
          (root?.entityId === incident.entityId && root.name) ||
          incident.entityId,
      ),
      baseline: before,
      incident: during,
      windows: {
        baseline: { from: baseline.from, to: baseline.to },
        incident: { from: incident.from, to: incident.to },
      },
      aggregation: serviceComparison ? incident.aggregation : volumeComparison ? 'value' : 'max',
      certainty: 'observed',
      evidenceRefs: [incident.id, baseline.id],
    });
  }
  const observations = (report.findings || [])
    .filter((f: any) => f.certainty === 'observed' && f.kind !== 'context')
    .map((f: any) => item(f.title, f.text, 'observed', f.evidenceRefs));
  if (plan === 'disk' && comparisons.length)
    for (const c of comparisons)
      observations.unshift(
        item(
          'Comparaison disque',
          `Maximum incident : ${c.incident.text} ; précédent : ${c.baseline.text}. Cet écart ne démontre ni saturation ni cause.`,
          'observed',
          c.evidenceRefs,
        ),
      );
  const hypotheses = (report.findings || [])
    .filter(
      (f: any) => f.certainty === 'hypothesis' && !['dependency-context', 'service-event-context'].includes(f.kind),
    )
    .map((f: any) => item(f.title, f.text, 'hypothesis', f.evidenceRefs));
  const remediation = explainRemediation(plan, refs, !!root, !!report.scope?.hostId);
  const unknowns = [...new Set<string>(report.limitations || [])];
  enrichInvestigationPresentation(
    report,
    comparisons,
    observations,
    hypotheses,
    remediation,
    refs,
    affected.find((id) => id.startsWith('SERVICE-')),
    unknowns,
  );
  const timeline = report.timeline;
  const start = timeline?.startTime,
    end = timeline?.status === 'OPEN' ? Date.parse(report.collectedAt) : timeline?.endTime;
  const durationMinutes =
    incidentWindow(problem, Date.parse(report.collectedAt)) &&
    Number.isFinite(start) &&
    start >= 0 &&
    Number.isFinite(end) &&
    end >= start
      ? (end - start) / 60000
      : null;
  const declarations = evidence
    .filter((e: any) => e.kind === 'events' && String(e.id).startsWith('published-event-'))
    .flatMap((e: any) => (e.events || []).map((event: any) => ({ ...event, evidenceRefs: [e.id] })));
  const named = entities
    .slice(0, 3)
    .map((e) => e.name)
    .join(', ');
  const summary = clean(problem.title) + (named ? ' · ' + named : '');
  return {
    version: 1,
    mode: 'deterministic',
    plan,
    whatHappened: {
      title: 'Ce qui s’est passé',
      summary,
      status: clean(problem.status),
      severity: clean(problem.severityLevel),
      timeline,
      durationMinutes,
      eventContext: declarations,
      synthetic: declarations.some((e: any) => e.synthetic),
      evidenceRefs: refs,
    },
    impact: {
      title: 'Impact',
      affectedEntities: affected,
      impactedEntities: impacted,
      entities,
      perEntity: source?.publishedImpacts || [],
      estimatedUsersTotal: null,
      partial: !!source?.partial,
      unknowns: !(source?.publishedImpacts || []).some((i: any) => Number.isFinite(i.estimatedAffectedUsers))
        ? ['Impact utilisateur non quantifié.']
        : [],
      evidenceRefs: refs,
    },
    whyItHappened: {
      title: 'Pourquoi c’est arrivé',
      conclusion: root
        ? item('Cause désignée par Davis', root.name || root.entityId, 'published', root.evidenceRefs)
        : item('Cause non établie', 'Aucune cause racine exploitable retournée par Dynatrace.', 'unknown'),
      mechanism: item(
        'Mécanisme causal non confirmé',
        'Les observations et corrélations ne suffisent pas à expliquer le mécanisme technique.',
        'unknown',
      ),
      comparisons,
      observations,
      hypotheses,
      unknowns: [...new Set(unknowns)],
    },
    remediation,
    collection: {
      observedAt: report.collectedAt,
      window: report.collectionWindow || null,
      bounded: true,
      steps: (report.trace || []).map((t: any) => ({ id: t.id, task: t.kind, status: t.status, reason: t.reason })),
    },
  };
}

/** Presentation of collected facts only: primary comparisons, topology, then temporal context.
 * This order is not a causal ranking. No additional collection or anomaly threshold. */
function enrichInvestigationPresentation(
  report: any,
  comparisons: any[],
  observations: ExplainItem[],
  hypotheses: ExplainItem[],
  remediation: any,
  problemRefs: string[],
  serviceId: string | undefined,
  unknowns: string[],
) {
  const evidence: any[] = report.evidence || [];
  const byId = new Map<string, any>(evidence.map((e) => [e.id, e]));
  const valid = (refs: string[]) => refs.length > 0 && refs.every((ref) => byId.has(ref));
  // Rule decisions use collected units. Display formatting may switch ms to s per value.
  const isIncreased = (comparison: any) => {
    const series = comparison.evidenceRefs.map((ref: string) => byId.get(ref));
    const before = series.find((e: any) => e?.window === 'baseline');
    const during = series.find((e: any) => e?.window === 'incident');
    const value = (e: any) =>
      comparison.aggregation === 'value' ? e?.sum : comparison.aggregation === 'max' ? e?.max : e?.mean;
    return (
      before?.unit === during?.unit &&
      Number.isFinite(value(before)) &&
      Number.isFinite(value(during)) &&
      value(during) > value(before)
    );
  };
  const period = (w: any) =>
    Number.isFinite(w?.from) && Number.isFinite(w?.to)
      ? `${new Date(w.from).toISOString()} → ${new Date(w.to).toISOString()}`
      : 'période exacte indisponible';
  const immediate: ExplainItem[] = [];
  const check = (title: string, text: string, reason: string, refs: string[], action?: string) => {
    if (!valid(refs) || immediate.some((i) => i.title === title && i.text === text)) return;
    immediate.push({
      title,
      text,
      condition: reason,
      certainty: 'conditional',
      evidenceRefs: [...new Set(refs)],
      ...(action ? { action } : {}),
    });
  };
  const lead = (
    title: string,
    fact: string,
    missing: string,
    refs: string[],
    verification: string,
    action?: string,
  ) => {
    if (!valid(refs)) return;
    hypotheses.push({
      title,
      text: `Faits : ${fact} Piste à vérifier ; aucune causalité démontrée. Manque : ${missing}`,
      condition: missing,
      certainty: 'hypothesis',
      evidenceRefs: [...new Set(refs)],
    });
    check(title, verification, `${fact} Manque : ${missing}`, refs, action);
  };
  // Reconstruct metric observations from qualified pairs; a stale finding cannot bypass qualification.
  const metricTitles = new Set(
    (report.findings || [])
      .filter((f: any) => ['comparison', 'dependency-latency'].includes(f.kind))
      .map((f: any) => f.title),
  );
  const retained = observations
    .filter((o) => !metricTitles.has(o.title) && o.title !== 'Comparaison disque' && valid(o.evidenceRefs))
    .map((o) => {
      const proofs = o.evidenceRefs.map((id) => byId.get(id));
      const entities = [...new Set(proofs.map((e) => e.entityId || e.hostId || e.diskId).filter(Boolean))];
      return {
        ...o,
        text: `${o.text} Entités : ${entities.join(', ') || 'périmètre publié du problème'}. Période : ${period(proofs.find((e) => e.kind === 'series') || proofs.find((e) => Number.isFinite(e.from)) || report.collectionWindow)}. Limites : ${proofs.some((e) => e.partial || e.gaps || e.truncated) ? 'données partielles ; ' : ''}ce constat ne démontre pas un mécanisme causal.`,
      };
    });
  observations.splice(0, observations.length);
  const primary = report.playbook?.serviceId || serviceId;
  comparisons.sort((a, b) => Number(b.entityId === primary) - Number(a.entityId === primary));
  for (const c of comparisons) {
    const proofs = c.evidenceRefs.map((id: string) => byId.get(id));
    const limits = [
      ...new Set([
        'Comparaison descriptive ; aucune anomalie ni causalité démontrée.',
        'Baseline précédente non garantie saine ou représentative ; agrégation conservée.',
        ...proofs.flatMap((e: any) => e.provenance?.limitations || []),
      ]),
    ];
    observations.push({
      title: c.metricId,
      text: `${c.entityId} · ${c.title} : ${c.baseline.text} → ${c.incident.text}. Baseline ${period(c.windows.baseline)} ; observation ${period(c.windows.incident)} ; agrégation ${c.aggregation}. Limites : ${limits.join(' ')}`,
      certainty: 'observed',
      evidenceRefs: c.evidenceRefs,
    });
  }
  observations.push(...retained);
  const relations = evidence.filter((e) => e.kind === 'service-relations');
  for (const relation of relations)
    for (const id of relation.outgoing || []) {
      observations.push({
        title: 'Dépendance directe publiée',
        text: `${relation.entityId} → ${id} : relation sortante calls collectée ${period(relation)}. Limites : ${relation.partial ? 'topologie partielle ; ' : ''}présence historique et flux effectif pendant l’incident non attestés.`,
        certainty: 'observed',
        evidenceRefs: [relation.id],
      });
      const main = comparisons.find(
        (c) => c.entityId === relation.entityId && c.metricId === 'builtin:service.response.time',
      );
      const dependency = comparisons.find((c) => c.entityId === id && c.metricId === 'builtin:service.response.time');
      const sameWindows = main && dependency && JSON.stringify(main.windows) === JSON.stringify(dependency.windows);
      if (sameWindows && isIncreased(main) && isIncreased(dependency)) {
        const refs = [relation.id, ...main.evidenceRefs, ...dependency.evidenceRefs];
        lead(
          'Latence également augmentée sur la dépendance',
          `${relation.entityId} et ${id} augmentent sur les mêmes fenêtres (${period(main.windows.incident)}).`,
          'chemin réel des appels, durée passée dans la dépendance et chronologie des requêtes',
          refs,
          `Examiner les traces distribuées ${relation.entityId} → ${id} sur ${period(main.windows.incident)} ; vérifier les durées des spans et les erreurs de cet appel.`,
        );
      } else if (!dependency) {
        unknowns.push(
          `Relation ${relation.entityId} → ${id} observée ; variation de latence de ${id} inconnue faute de comparaison qualifiée.`,
        );
        check(
          'Mesures manquantes de la dépendance',
          `Comparer la latence de ${id} sur les fenêtres de ${relation.entityId} et vérifier le contrat métrique et la couverture avant toute interprétation.`,
          'Relation calls publiée ; comparaison de dépendance indisponible ou ambiguë.',
          [relation.id],
          'metrics',
        );
      }
    }
  const primaryLatency = comparisons.find(
    (c) => c.entityId === primary && c.metricId === 'builtin:service.response.time',
  );
  for (const proof of evidence.filter((e) => e.kind === 'events' && !String(e.id).startsWith('published-event-'))) {
    if ((proof.events || []).some((e: any) => e.category))
      for (let i = observations.length - 1; i >= 0; i--)
        if (observations[i].evidenceRefs.includes(proof.id)) observations.splice(i, 1);
    for (const event of proof.events || []) {
      if (!event.category) continue; // Only events already qualified by the existing context collector.
      const synthetic = !!event.synthetic;
      if (synthetic)
        unknowns.push(`Événement de test publié sur ${proof.entityId} ; dégradation réelle et impact non démontrés.`);
      const fact = `${proof.entityId} · ${event.type} · ${period({ from: event.startTime, to: event.endTime })} · ${event.timing === 'before' ? 'précède' : event.timing === 'after' ? 'suit' : 'recouvre'} la fenêtre étudiée.`;
      // Existing event finding is replaced by this bounded declaration, including synthetic origin.
      observations.push({
        title: synthetic ? 'Déclaration synthétique ou de test' : 'Événement contextuel publié',
        text: `${fact} Limites : ${synthetic ? 'déclaration de test ; aucune dégradation réelle démontrée.' : 'contenu, impact et causalité non vérifiés.'}${proof.partial ? ' Réponse événementielle partielle.' : ''}`,
        certainty: 'observed',
        evidenceRefs: [proof.id],
      });
      if (
        !synthetic &&
        event.timing !== 'after' &&
        ['deployment', 'change'].includes(event.category) &&
        primaryLatency &&
        isIncreased(primaryLatency) &&
        [primary, ...relations.filter((r) => r.entityId === primary).flatMap((r) => r.outgoing || [])].includes(
          proof.entityId,
        )
      ) {
        const topologyRefs =
          proof.entityId === primary
            ? []
            : relations
                .filter((r) => r.entityId === primary && (r.outgoing || []).includes(proof.entityId))
                .map((r) => r.id);
        lead(
          'Changement publié proche de la hausse de latence',
          fact,
          'contenu du changement, version effectivement exécutée et comportement avant/après ; début précis de dégradation non déterminé par les moyennes',
          [proof.id, ...topologyRefs, ...primaryLatency.evidenceRefs],
          `Vérifier le contenu du changement sur ${proof.entityId}, sa version déployée et les traces avant/après ${period(primaryLatency.windows.incident)} ; rechercher un lien technique avec les requêtes ralenties.`,
        );
      }
    }
  }
  for (const relation of evidence.filter(
    (e) => e.kind === 'request-relations' || e.kind === 'infrastructure-relations',
  )) {
    observations.push({
      title:
        relation.kind === 'request-relations' ? 'Key request explicitement liée' : 'Infrastructure explicitement liée',
      text: `${relation.serviceId} → ${relation.entityId} · relation publiée à ${period(relation)}. Présence historique inconnue ; aucune causalité démontrée.`,
      certainty: 'observed',
      evidenceRefs: [relation.id],
    });
    const measures = comparisons.filter((c) => c.entityId === relation.entityId);
    const increased = measures.filter((c) => isIncreased(c));
    if (increased.length) {
      const refs = [relation.id, ...increased.flatMap((c) => c.evidenceRefs)];
      const isRequest = relation.kind === 'request-relations';
      lead(
        isRequest ? 'Key request à examiner' : 'Signaux infrastructure à examiner',
        `${relation.entityId} · ${increased.map((c) => c.title + ' : ' + c.baseline.text + ' → ' + c.incident.text).join('; ')} · fenêtre ${period(increased[0].windows.incident)}.`,
        isRequest
          ? 'répartition des appels, traces, exceptions et représentativité des key requests ; contribution au temps global non quantifiée'
          : 'placement historique, contention effective et lien technique avec les requêtes du service',
        refs,
        isRequest
          ? `Examiner les requêtes ${relation.entityId} du service ${relation.serviceId}, comparer erreurs et traces sur ${period(increased[0].windows.incident)} ; ne pas généraliser aux endpoints non configurés.`
          : `Examiner CPU/mémoire et événements de ${relation.entityId} sur ${period(increased[0].windows.incident)}, confirmer le placement de ${relation.serviceId} pendant l’incident.`,
      );
    } else if (!measures.length && relation.kind === 'infrastructure-relations' && relation.relation === 'runsOnHost') {
      check(
        'Métriques de l’hôte associé indisponibles',
        `Vérifier la couverture CPU/mémoire de ${relation.entityId} pendant l’incident et confirmer le placement historique du service.`,
        'Relation explicite publiée ; aucune paire métrique comparable.',
        [relation.id],
        'metrics',
      );
    }
  }
  const errors = comparisons.find((c) => c.entityId === primary && c.metricId === 'builtin:service.errors.server.rate');
  const traffic = comparisons.find(
    (c) => c.entityId === primary && c.metricId === 'builtin:service.requestCount.total',
  );
  if (
    errors &&
    traffic &&
    JSON.stringify(errors.windows) === JSON.stringify(traffic.windows) &&
    isIncreased(errors) &&
    !isIncreased(traffic)
  )
    lead(
      'Erreurs augmentées sans hausse du volume',
      `${primary} : erreurs ${errors.baseline.text} → ${errors.incident.text} ; requêtes ${traffic.baseline.text} → ${traffic.incident.text}, sur ${period(errors.windows.incident)}.`,
      'types d’erreurs, exceptions et répartition des requêtes',
      [...errors.evidenceRefs, ...traffic.evidenceRefs],
      `Examiner les erreurs et exceptions de ${primary} sur ${period(errors.windows.incident)} et comparer les endpoints et types de requêtes à la baseline.`,
    );
  if (primaryLatency && isIncreased(primaryLatency) && !hypotheses.length)
    check(
      'Localiser le temps passé dans le service',
      `Examiner les traces de ${primary} sur ${period(primaryLatency.windows.incident)} et comparer les durées des spans à la baseline ${period(primaryLatency.windows.baseline)}.`,
      'Hausse mesurée de latence ; mécanisme technique et répartition du temps inconnus.',
      primaryLatency.evidenceRefs,
    );
  const tail = comparisons.find((c) => c.entityId === primary && c.aggregation === 'percentile(95)');
  if (tail && isIncreased(tail))
    check(
      'Examiner les requêtes de queue',
      `Comparer les requêtes lentes de ${primary} sur ${period(tail.windows.incident)} à la baseline ; examiner les traces disponibles dans Managed.`,
      'Hausse de la moyenne des p95 de créneaux ; percentile global, échantillonnage et mécanisme inconnus.',
      tail.evidenceRefs,
    );
  if ((report.limitations || []).some((s: string) => s.includes('Traces/PurePaths')))
    unknowns.push(
      'Traces brutes non accessibles via une API publique Managed vérifiée ; les vérifications de traces proposées sont manuelles dans Managed.',
    );
  const compared = new Set(comparisons.flatMap((c) => c.evidenceRefs));
  const incomplete = evidence.filter((e) => e.kind === 'series' && !compared.has(e.id));
  if (incomplete.length)
    unknowns.push('Mesures présentes sans paire complète, unique et comparable ; variation et mécanisme inconnus.');
  for (const e of incomplete) {
    if (!Number.isFinite(e.count) || e.count < 1) continue;
    const volume = e.aggregation === 'value' && e.unit === 'Count';
    const value = Number.isFinite(volume ? e.sum : e.mean)
      ? formatMeasure(volume ? e.sum : e.mean, e.unit || 'unité inconnue').text
      : 'valeur agrégée indisponible';
    observations.push({
      title: 'Mesure sans comparaison qualifiée',
      text: `${e.entityId || e.hostId || 'Entité inconnue'} · ${e.metricId} · ${period(e)} : ${e.count} points ; ${volume ? 'somme' : 'moyenne'} ${value}. Limites : série partielle, baseline absente ou paire ambiguë ; aucune variation affirmée.`,
      certainty: 'observed',
      evidenceRefs: [e.id],
    });
  }
  if (
    incomplete.length ||
    (report.limitations || []).some((s: string) =>
      /baseline (absente|insuffisante)|référence comparable indisponible|Série .*absente|Fenêtres complètes .*insuffisantes/i.test(
        s,
      ),
    )
  )
    check(
      'Compléter la comparaison temporelle',
      'Vérifier le contrat métrique, les buckets manquants et une baseline complète de même durée sur la même entité ; étendre la collecte si nécessaire.',
      'Comparaison absente, partielle ou ambiguë ; variation non concluante.',
      incomplete.length ? incomplete.map((e) => e.id) : problemRefs,
      'metrics',
    );
  const unavailable = (report.trace || []).filter((t: any) => t.status !== 'ok');
  for (const t of unavailable)
    unknowns.push(
      `Lecture ${t.kind} non obtenue : ${t.reason || 'données indisponibles'}. Le signal correspondant reste inconnu.`,
    );
  if (!comparisons.length)
    unknowns.push(
      'Aucune variation métrique qualifiée ; les preuves publiées ne suffisent pas à établir un mécanisme technique.',
    );
  if (unavailable.some((t: any) => /Budget/.test(t.reason || '')))
    check(
      'Compléter les lectures interrompues',
      'Relancer uniquement les lectures manquantes dans une collecte bornée après la fin de l’opération, en conservant les rapports précédents.',
      'Budget API atteint ; absence de réponse ne signifie pas absence de signal.',
      problemRefs,
    );
  if (unavailable.some((t: any) => /^Permission absente/.test(t.reason || '')))
    check(
      'Vérifier les permissions de lecture',
      'Faire vérifier par le propriétaire du token les scopes de lecture indiqués dans la trace avant de reprendre les lectures manquantes.',
      'Permissions de lecture explicitement absentes ; données inconnues.',
      problemRefs,
    );
  if (!comparisons.length && !immediate.length)
    check(
      'Examiner les preuves publiées du problème',
      'Relire les événements et les entités explicitement associés au problème ; identifier la mesure et sa fenêtre avant une investigation ciblée.',
      'Peu de preuves exploitables ; cause et comparaison non établies.',
      problemRefs,
      'events',
    );
  for (const h of hypotheses)
    if (!h.condition) {
      h.condition = 'Mécanisme technique non confirmé ; données complémentaires nécessaires.';
      h.text += ` Manque : ${h.condition}`;
      check(h.title, `Vérifier les entités et observations référencées : ${h.text}`, h.condition, h.evidenceRefs);
    }
  observations.splice(0, observations.length, ...observations.filter((o) => valid(o.evidenceRefs)));
  hypotheses.splice(0, hypotheses.length, ...hypotheses.filter((h) => valid(h.evidenceRefs)));
  // Existing contract fields; no unconfirmed corrective operation in Explain.
  remediation.title = 'Prochaines vérifications';
  remediation.immediate = immediate;
  remediation.shortTerm = [];
  remediation.prevention = [];
  remediation.policyVersion = 'managed-explain-2026-10-14';
}
