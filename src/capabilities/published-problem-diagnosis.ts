/** Deterministic interpretation of published facts; no model, inferred cause or remediation. */
const clean = (v: unknown) => String(v ?? '').slice(0, 500);
const idOf = (v: any) => typeof v === 'string' ? v : v?.id;
export function incidentWindow(problem: any, now = Date.now()) {
  const start = problem.startTime;
  const end = problem.status === 'OPEN' ? now : problem.endTime;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end > now + 300000) return null;
  // Bounded collection, explicitly qualified when an incident exceeds the window.
  return {from: Math.max(start, end - 7200000), to: end, partial: end - start > 7200000};
}
export function enrichPublishedDiagnosis(problem: any, report: any) {
  const ref = report.evidence.find((e: any) => e.kind === 'problem')?.id;
  if (!ref) return;
  const add = (kind: string, title: string, text: string) => report.findings.push({kind, title, text, evidenceRefs:[ref], certainty:'published'});
  const source = report.evidence.find((e: any) => e.id === ref);
  const raw = Array.isArray(problem.evidenceDetails?.details) ? problem.evidenceDetails.details : [];
  const details = raw.slice(0, 20).map((e: any) => ({
    evidenceType:clean(e.evidenceType), displayName:clean(e.displayName), entityId:idOf(e.entity?.entityId),
    entityName:clean(e.entity?.name), rootCauseRelevant:e.rootCauseRelevant === true,
    startTime:Number.isFinite(e.startTime) ? e.startTime : null,
  }));
  source.publishedEvidence = details;
  source.evidenceTotal = problem.evidenceDetails?.totalCount ?? raw.length;
  if (raw.length > 20 || Number(problem.evidenceDetails?.totalCount) > raw.length)
    report.limitations.push('Preuves Davis partielles : vingt éléments maximum dans la synthèse.');
  if (!problem.evidenceDetails) report.limitations.push('Preuves détaillées Davis non retournées.');
  const impacts = (Array.isArray(problem.impactAnalysis?.impacts) ? problem.impactAnalysis.impacts : []).slice(0, 20).map((i: any) => ({
    impactType:clean(i.impactType), entityId:idOf(i.impactedEntity?.entityId), entityName:clean(i.impactedEntity?.name),
    estimatedAffectedUsers:Number.isFinite(i.estimatedAffectedUsers) && i.estimatedAffectedUsers >= 0 ? i.estimatedAffectedUsers : null,
  }));
  source.publishedImpacts = impacts;
  source.partial = raw.length > 20 || Number(problem.evidenceDetails?.totalCount) > raw.length || (problem.impactAnalysis?.impacts?.length || 0) > 20;
  for (const impact of impacts) add('impact', 'Impact publié · ' + (impact.entityName || impact.entityId || impact.impactType),
    impact.estimatedAffectedUsers === null ? 'Nombre d’utilisateurs affectés non retourné.' : `${impact.estimatedAffectedUsers} utilisateur(s) affecté(s), estimation Dynatrace pour cette entité ; impacts non additionnés.`);
  if (!problem.impactAnalysis) report.limitations.push('Analyse détaillée d’impact non retournée.');
  if (problem.impactAnalysis?.impacts?.length > 20) report.limitations.push('Analyse d’impact limitée aux vingt premiers éléments.');
  const window = incidentWindow(problem);
  report.timeline = {startTime:Number.isFinite(problem.startTime) ? problem.startTime : null,
    endTime:problem.status === 'CLOSED' && Number.isFinite(problem.endTime) && problem.endTime >= problem.startTime ? problem.endTime : null,
    status:clean(problem.status), evidenceRefs:[ref]};
  if (window) {
    const duration = (window.to - problem.startTime) / 60000;
    add('timeline','Chronologie publiée', `${problem.status === 'CLOSED' ? 'Incident clos' : 'Incident ouvert'} · ${duration.toFixed(1)} minute(s)${problem.status === 'OPEN' ? ' à la collecte' : ''}.`);
    if (window.partial) report.limitations.push('Incident supérieur à deux heures : lectures générales limitées aux deux dernières heures de l’incident.');
  } else report.limitations.push('Fenêtre de l’incident absente ou incohérente ; durée non calculée.');
  const rootId = idOf(problem.rootCauseEntity?.entityId);
  report.diagnosis = {
    mode:'deterministic', publishedRootCause:rootId ? {entityId:rootId,name:clean(problem.rootCauseEntity.name),evidenceRefs:[ref]} : null,
    causalMechanism:'unknown', rootCauseEvidence:details.filter((e: any) => e.rootCauseRelevant),
    observations:report.findings.filter((f: any) => f.certainty === 'observed'),
    uncertainties:[...new Set(report.limitations)],
    nextChecks:rootId ? ['Vérifier les preuves de l’entité désignée par Davis.', 'Comparer ses mesures pendant l’incident et avant celui-ci.'] : ['Obtenir les preuves de l’incident avant de conclure à une cause.'],
  };
}
