import { ToolContext } from '../tools/context';
function scrub(value: any): any {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/(token|authorization|password|secret|cookie|api.?key)/i.test(key))
        .map(([key, item]) => [key, scrub(item)]),
    );
  return typeof value === 'string' ? value.replace(/dt0[a-zA-Z0-9]{1,8}\.[A-Za-z0-9._-]+/g, '[secret retiré]') : value;
}
/** Bounded, read-only context analysis. API facts remain distinct from inferred health. */
export async function analyzeContext(ctx: ToolContext, report: any, detail: any) {
  const alias = report.environment.alias,
    target = report.contextTarget,
    to = Date.now(),
    from = to - 2 * 60 * 60 * 1000;
  report.collectionWindow =
    target.kind === 'entity'
      ? { from, to, resolution: '5m' }
      : target.kind === 'environment'
        ? { from: to - 24 * 60 * 60 * 1000, to }
        : null;
  const deadline = Date.now() + 75000;
  const permitted = (suffix: string) =>
    (ctx.conversationTools?.() || []).some(
      (t) => t.name === 'dynatrace_managed_' + suffix && t.annotations.readOnlyHint === true,
    );
  const fact = (title: string, text: string, refs: string[]) =>
    report.findings.push({ kind: 'context', title, text, certainty: 'observed', evidenceRefs: refs });
  let seq = report.toolResults?.length || 0;
  const read = async (suffix: string, call: () => Promise<Map<string, any>>) => {
    if (Date.now() >= deadline) {
      report.limitations.push('Budget de collecte atteint : ' + suffix);
      return null;
    }
    if (!permitted(suffix)) {
      report.limitations.push('Lecture non autorisée : ' + suffix);
      return null;
    }
    const id = 'C' + ++seq,
      at = new Date().toISOString();
    try {
      const value = (await call()).get(alias);
      if (!value || value.error) throw Error('Unavailable');
      report.evidence.push({ id, kind: suffix, data: value });
      report.trace.push({ id, tool: 'dynatrace_managed_' + suffix, status: 'ok', at });
      return { id, value };
    } catch {
      report.trace.push({ id, tool: 'dynatrace_managed_' + suffix, status: 'unavailable', at });
      report.limitations.push('Lecture indisponible : ' + suffix);
      return null;
    }
  };
  report.contextAnalysis = { version: 1, mode: 'deterministic', kind: target.kind, title: 'Bilan de l’environnement' };
  if (target.kind === 'entity') {
    const name = detail?.displayName || target.id;
    report.contextAnalysis.title = (target.id.startsWith('HOST-') ? 'Hôte · ' : 'Service · ') + name;
    fact('Identité', name + ' · ' + target.id, ['C1']);
    const props = detail?.properties || {};
    const values = ['osType', 'osVersion', 'monitoringMode']
      .filter((k) => props[k] !== undefined)
      .map((k) => k + ' : ' + String(props[k]));
    if (values.length) fact('Configuration', values.join(' · '), ['C1']);
  }
  if (['environment', 'entity'].includes(target.kind)) {
    const p = await read('list_problems', () =>
      ctx.problemsClient.listProblems(alias, {
        from: 'now-24h',
        to: 'now',
        status: 'OPEN',
        pageSize: 50,
        ...(target.kind === 'entity' ? { entitySelector: 'entityId("' + target.id + '")' } : {}),
      }),
    );
    if (p) {
      const rows = p.value.problems || [];
      fact(
        'Problèmes ouverts',
        rows.length +
          ' retourné(s) sur les dernières 24 h' +
          (p.value.totalCount !== undefined ? ' · ' + p.value.totalCount + ' au total' : ''),
        [p.id],
      );
      for (const problem of rows.slice(0, 8))
        fact(problem.displayId || 'Problème', problem.title || 'Titre non disponible', [p.id]);
      if (p.value.nextPageKey || p.value.totalCount > rows.length)
        report.limitations.push('Liste limitée à 50 problèmes ; les pages suivantes ne sont pas collectées.');
      if (target.kind === 'environment') {
        const groups: Record<string, number> = {};
        const ids = new Set<string>();
        for (const problem of rows) {
          groups[problem.severityLevel || 'UNKNOWN'] = (groups[problem.severityLevel || 'UNKNOWN'] || 0) + 1;
          for (const e of problem.affectedEntities || []) if (e.entityId?.id) ids.add(e.entityId.id);
        }
        fact(
          'Répartition de la page',
          Object.entries(groups)
            .map(([k, n]) => k + ' : ' + n)
            .join(' · ') || 'Aucun problème retourné',
          [p.id],
        );
        fact('Entités affectées sur cette page', String(ids.size), [p.id]);
      }
    }
  }
  if (target.kind === 'entity') {
    const host = target.id.startsWith('HOST-');
    const metrics = host
      ? ['builtin:host.cpu.usage', 'builtin:host.mem.usage', 'builtin:host.disk.usedPct']
      : ['builtin:service.errors.server.rate', 'builtin:service.response.time'];
    for (const metricId of metrics) {
      const contract = await read('get_metric_details', () => ctx.metricsClient.getMetricDetails(metricId, alias));
      if (!contract || contract.value.metricId !== metricId || !contract.value.unit) {
        report.limitations.push('Contrat métrique non confirmé : ' + metricId);
        continue;
      }
      const series = await read('query_metrics_data', () =>
        ctx.metricsClient.queryMetrics(
          {
            metricSelector: metricId + ':avg',
            entitySelector: 'entityId("' + target.id + '")',
            from: String(from),
            to: String(to),
            resolution: '5m',
          },
          alias,
        ),
      );
      if (!series) continue;
      let count = 0;
      seriesRows: for (const result of series.value.result || [])
        if (result.metricId === metricId || result.metricId === metricId + ':avg')
          for (const row of result.data || []) {
            const dimension = host ? 'dt.entity.host' : 'dt.entity.service';
            if (row.dimensionMap?.[dimension] !== target.id) continue;
            const points = (row.values || [])
              .map((v: any, i: number) => ({ v, t: row.timestamps?.[i] }))
              .filter((p: any) => Number.isFinite(p.v) && Number.isFinite(p.t) && p.t >= from && p.t <= to)
              .sort((a: any, b: any) => a.t - b.t);
            if (!points.length) continue;
            const last = points.at(-1),
              disk = row.dimensionMap?.['dt.entity.disk'];
            fact(
              metricId + (disk ? ' · ' + disk : ''),
              last.v +
                ' ' +
                contract.value.unit +
                ' · dernier point ' +
                new Date(last.t).toISOString() +
                ' · min ' +
                Math.min(...points.map((p: any) => p.v)) +
                ' / max ' +
                Math.max(...points.map((p: any) => p.v)) +
                ' sur 2 h',
              [contract.id, series.id],
            );
            count++;
            if (count >= 5) {
              report.limitations.push('Restitution limitée à 5 séries pour ' + metricId);
              break seriesRows;
            }
          }
      if (series.value.result?.some((r: any) => r.data?.some((row: any) => row.values?.some((v: any) => v === null))))
        report.limitations.push('Points manquants : statistiques sur les points disponibles uniquement.');
      if (!count) report.limitations.push('Aucun point précisément rattaché à cette entité : ' + metricId);
      if (series.value.nextPageKey) report.limitations.push('Séries paginées : couverture partielle.');
    }
    report.limitations.push(
      'Mesures récentes sur 2 h ; aucun seuil ni diagnostic de saturation déduit de ces valeurs seules.',
    );
  }
  if (target.kind === 'dashboard') {
    const d = detail?.dashboard || detail;
    report.contextAnalysis.title = 'Dashboard · ' + (d?.dashboardMetadata?.name || target.id);
    const tiles = Array.isArray(d?.tiles) ? d.tiles : [];
    fact('Structure', tiles.length + ' tuile(s) · propriétaire : ' + (d?.dashboardMetadata?.owner || 'non renseigné'), [
      'C1',
    ]);
    const empty = tiles.filter(
      (t: any) =>
        !['MARKDOWN', 'HEADER'].includes(t.tileType) &&
        !(
          t.queries?.some((q: any) => q.metricSelector) ||
          t.metricExpressions?.length ||
          t.filterConfig ||
          t.assignedEntities?.length
        ),
    );
    fact('Tuiles à vérifier', empty.length + ' sans configuration de données reconnue (heuristique)', ['C1']);
    for (const t of tiles.slice(0, 12)) {
      const selectors = [
        ...(t.queries || []).map((q: any) => q.metricSelector).filter(Boolean),
        ...(t.metricExpressions || []),
      ];
      fact(t.name || t.tileType || 'Tuile', selectors.join(' · ') || 'Aucun sélecteur métrique explicite reconnu', [
        'C1',
      ]);
    }
    if (d?.dashboardFilter) fact('Filtres du dashboard', JSON.stringify(d.dashboardFilter), ['C1']);
    report.limitations.push(
      'Définition examinée uniquement : valeurs des tuiles non exécutées. Les filtres et la période sélectionnés dans le navigateur ne sont pas collectés.',
    );
    if (tiles.length > 12) report.limitations.push('Détail limité aux 12 premières tuiles.');
  }
  if (target.kind === 'metric') {
    report.contextAnalysis.title = 'Métrique · ' + target.id;
    fact('Contrat métrique', String(detail?.displayName || target.id) + ' · unité : ' + (detail?.unit || 'inconnue'), [
      'C1',
    ]);
    report.limitations.push('Contrat seulement ; aucune série sans entité explicitement choisie.');
  }
  report.summary = report.contextAnalysis.title + ' · lectures MCP terminées.';
  report.status =
    report.trace.some((t: any) => t.status !== 'ok') ||
    report.limitations.some((v: string) =>
      /non autorisée|non confirmé|indisponible|Aucun point|partielle|pages suivantes|Budget|Points manquants|limitée à 5/.test(
        v,
      ),
    )
      ? 'partial'
      : 'completed';
  Object.assign(report, scrub(report));
  return report;
}
