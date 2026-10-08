const crypto = require('node:crypto');
// Curated primary-source release policies, not a vulnerability or entitlement database.
const lifecycleReferences = [
  ...[
    ['8', '2030-12'],
    ['11', '2027-10'],
    ['17', '2027-10'],
    ['21', '2029-12'],
    ['25', '2031-09'],
  ].map(([cycle, end]) => ({
    product: 'Java',
    cycle,
    end,
    edition: 'Eclipse Adoptium',
    endKind: 'minimum_availability',
    source: 'https://adoptium.net/support/',
    scope:
      'Disponibilité de builds Temurin annoncée au moins jusqu’à cette date ; SLA commercial et niveau de patch non certifiés',
  })),
  ...[
    ['7.4', '2022-11-28'],
    ['8.1', '2025-12-31'],
    ['8.2', '2026-12-31'],
    ['8.3', '2027-12-31'],
    ['8.4', '2028-12-31'],
  ].map(([cycle, end]) => ({
    product: 'PHP',
    cycle,
    end,
    source: ['7.4', '8.1'].includes(cycle)
      ? 'https://www.php.net/eol.php'
      : 'https://www.php.net/supported-versions.php',
    scope: 'Support sécurité upstream PHP ; backports/contrat de distribution non vérifiés',
  })),
  ...[
    ['1.20', '2024-02-06'],
    ['1.23', '2025-08-12'],
  ].map(([cycle, end]) => ({
    product: 'Go',
    cycle,
    end,
    source: 'https://go.dev/doc/devel/release',
    scope: 'Politique upstream : deux branches Go récentes ; échéance déduite de la sortie de N+2',
  })),
  ...[
    ['1.6', '2025-08-23'],
    ['1.7', '2026-09-30'],
    ['2.1', '2026-07-03'],
    ['2.2', '2026-11-06'],
    ['2.3', '2028-04-30'],
    ['2.4', '2027-05-16'],
  ].map(([cycle, end]) => ({
    product: 'containerd',
    cycle,
    end,
    source: 'https://containerd.io/releases/',
    scope: 'Support upstream containerd ; support fournisseur/distribution non vérifié',
  })),
  {
    product: 'Ubuntu',
    cycle: '18.04',
    end: '2023-05',
    source: 'https://ubuntu.com/about/release-cycle',
    scope: 'Maintenance de sécurité standard ; Ubuntu Pro/ESM non vérifié',
  },
  {
    product: 'Ubuntu',
    cycle: '26.04',
    end: '2031-05',
    source: 'https://ubuntu.com/about/release-cycle',
    scope: 'Maintenance de sécurité standard ; Ubuntu Pro/ESM non vérifié',
  },
  {
    product: 'Ubuntu',
    cycle: '20.04',
    end: '2025-05',
    source: 'https://ubuntu.com/about/release-cycle',
    scope: 'Maintenance de sécurité standard ; Ubuntu Pro/ESM non vérifié',
  },
  {
    product: 'Ubuntu',
    cycle: '22.04',
    end: '2027-05',
    source: 'https://ubuntu.com/about/release-cycle',
    scope: 'Maintenance de sécurité standard ; Ubuntu Pro/ESM non vérifié',
  },
  {
    product: 'Ubuntu',
    cycle: '24.04',
    end: '2029-05',
    source: 'https://ubuntu.com/about/release-cycle',
    scope: 'Maintenance de sécurité standard ; Ubuntu Pro/ESM non vérifié',
  },
  ...[
    ['1.28', '2024-10-22'],
    ['1.29', '2025-02-28'],
    ['1.30', '2025-07-15'],
    ['1.31', '2025-11-11'],
    ['1.32', '2026-02-28'],
    ['1.33', '2026-06-28'],
    ['1.34', '2026-10-27'],
    ['1.35', '2027-02-28'],
  ].map(([cycle, end]) => ({
    product: 'Kubernetes',
    cycle,
    end,
    source: 'https://kubernetes.io/releases/patch-releases/',
    scope: 'Support upstream ; support de la distribution et du fournisseur à vérifier',
  })),
  ...[
    ['16', '2023-09-11'],
    ['18', '2025-04-30'],
    ['20', '2026-04-30'],
    ['22', '2027-04-30'],
    ['24', '2028-04-30'],
    ['26', '2029-04-30'],
  ].map(([cycle, end]) => ({
    product: 'Node.js',
    cycle,
    end,
    source: 'https://github.com/nodejs/Release',
    scope: 'Support upstream ; contrat étendu non vérifié',
  })),
  ...[
    ['3.9', '2025-10-31'],
    ['3.10', '2026-10-01'],
    ['3.11', '2027-10'],
    ['3.12', '2028-10'],
    ['3.13', '2029-10'],
    ['3.14', '2030-10'],
  ].map(([cycle, end]) => ({
    product: 'Python',
    cycle,
    end,
    source: 'https://devguide.python.org/versions/',
    scope: 'Support upstream ; backports de la distribution non vérifiés',
  })),
].map((r) => ({
  ...r,
  verifiedAt: '2026-10-08',
  precision: r.end.length === 7 ? 'month' : 'day',
}));
function classifyLifecycle(product, version, now = Date.now(), anticipationDays = 180, edition = null) {
  const cycle =
    product === 'Java'
      ? String(version).match(/^1\.(\d+)/)?.[1] || String(version).match(/\d+/)?.[0]
      : product === 'Node.js'
        ? String(version).match(/\d+/)?.[0]
        : String(version).match(/\d+\.\d+/)?.[0];
  const reference = lifecycleReferences.find(
    (r) => r.product === product && r.cycle === cycle && (!r.edition || r.edition === edition),
  );
  if (!reference)
    return {
      status: 'unknown',
      qualification: ['Java', '.NET', 'LIBC', 'NGINX'].includes(product) ? 'support_context' : 'reference_missing',
      reason: ['Java', '.NET', 'LIBC', 'NGINX'].includes(product)
        ? 'Version connue ; politique éditeur/édition/distribution à préciser'
        : 'Version connue ; référence de support absente pour ce cycle',
      cycle,
      reference: null,
      policySource:
        {
          'Java': 'https://adoptium.net/support/',
          'NGINX': 'https://nginx.org/en/download.html',
          'LIBC': /musl/i.test(edition || '') ? 'https://musl.libc.org/' : 'https://www.gnu.org/software/libc/',
          '.NET': 'https://dotnet.microsoft.com/en-us/platform/support/policy',
        }[product] || null,
    };
  const start = Date.parse(reference.end + 'T00:00:00Z');
  const earliest = reference.precision === 'month' ? Date.parse(reference.end + '-01T00:00:00Z') : start;
  const latest =
    reference.precision === 'month'
      ? Date.UTC(Number(reference.end.slice(0, 4)), Number(reference.end.slice(5, 7)), 1)
      : start + 86400000;
  const stale = now - Date.parse(reference.verifiedAt) > 90 * 86400000;
  const minimumExpired = reference.endKind === 'minimum_availability' && now >= earliest;
  const status =
    stale || minimumExpired
      ? 'unknown'
      : now >= latest
        ? 'action'
        : now >= earliest || earliest - now <= anticipationDays * 86400000
          ? 'watch'
          : 'ok';
  return {
    status,
    cycle,
    reference,
    qualification: status === 'unknown' ? 'support_context' : null,
    reason: minimumExpired
      ? 'Horizon minimum de disponibilité atteint ; support à revalider, fin de support non prouvée'
      : stale
        ? 'Référence de support ancienne ; revalidation requise'
        : status === 'action'
          ? 'Fin du support de référence dépassée ; contrat/distribution à confirmer'
          : status === 'watch'
            ? `Échéance de support à préparer (${anticipationDays} jours), ou mois de transition`
            : 'Support de référence non échu',
    daysToEnd: Math.floor((earliest - now) / 86400000),
  };
}
function runtimeProduct(raw) {
  const key = String(raw || '');
  return /^(node[_. -]?js|node)$/i.test(key)
    ? 'Node.js'
    : /^python$/i.test(key)
      ? 'Python'
      : /^java$/i.test(key)
        ? 'Java'
        : /^go$/i.test(key)
          ? 'Go'
          : /^containerd$/i.test(key)
            ? 'containerd'
            : /^php(?:_fpm)?$/i.test(key)
              ? 'PHP'
              : /^dotnet$/i.test(key)
                ? '.NET'
                : /^kubernetes$/i.test(key)
                  ? 'Kubernetes'
                  : key || 'Runtime';
}
const runtimeEdition = (product, edition) =>
  product === 'Java' && /^(?:Eclipse )?Adoptium$/i.test(edition || '') ? 'Eclipse Adoptium' : edition || null;
function softwareInventory(entity) {
  const p = entity.details?.properties || {},
    rows = [];
  const add = (product, version, field, category = 'runtime', edition = null, evidence = []) =>
    rows.push({
      product,
      rawVersion: version ? String(version) : null,
      version: version ? String(version).replace(/^(?:nginx\/|go(?=\d)|v(?=\d))/, '') : null,
      evidence,
      field,
      category,
      edition: runtimeEdition(product, edition),
      entityType: entity.type,
      entityId: entity.entityId,
      environmentId: entity.environmentId,
      name: entity.displayName,
      observedAt: entity.details?.lastSeenTms || null,
      observationClockOffsetMs: responseClockOffset(entity.details?.responseTiming),
    });
  if (['HOST', 'KUBERNETES_NODE'].includes(entity.type)) {
    // Managed nodes expose kernel version in osVersion and distribution in osInfo.
    const os = String((entity.type === 'KUBERNETES_NODE' ? p.osInfo : null) || p.osVersion || '');
    add(
      /Ubuntu/i.test(os) ? 'Ubuntu' : p.osType || 'OS',
      os.match(/Ubuntu\s+(\d+\.\d+(?:\.\d+)?)/i)?.[1] || os || null,
      entity.type === 'KUBERNETES_NODE' && p.osInfo ? 'osInfo' : 'osVersion',
      'os',
    );
    rows.at(-1).rawVersion = os || null;
    if (entity.type === 'HOST')
      add(
        'OneAgent',
        p.agentVersion || p.installerVersion,
        p.agentVersion ? 'agentVersion' : 'installerVersion',
        'monitoring',
      );
  }
  if (entity.type === 'KUBERNETES_NODE') add('Kubernetes', p.kubeletVersion, 'kubeletVersion', 'platform');
  for (const tech of Array.isArray(p.softwareTechnologies) ? p.softwareTechnologies : []) {
    const raw = String(tech.type || tech.name || '');
    const product = runtimeProduct(raw);
    const primary = runtimeProduct(p.processType);
    const fallbackField =
      product === primary && ['Java', '.NET'].includes(product) && p.jvmClrVersion
        ? 'jvmClrVersion'
        : product === primary &&
            ['NGINX', 'PHP', 'Node.js', 'Python'].includes(product) &&
            /^(?:nginx\/|v)?\d+\.\d+/.test(String(p.appVersion || ''))
          ? 'appVersion'
          : null;
    const version = tech.version || (fallbackField ? p[fallbackField] : null);
    add(
      product,
      version,
      tech.version || !fallbackField ? 'softwareTechnologies' : fallbackField,
      product === 'Kubernetes' ? 'platform' : /^DYNATRACE$/i.test(product) ? 'monitoring' : 'runtime',
      tech.edition || (product === 'Java' ? p.jvmVendor : null) || null,
    );
  }
  if (['PROCESS_GROUP', 'PROCESS_GROUP_INSTANCE'].includes(entity.type) && !rows.length) {
    const product = runtimeProduct(p.processType);
    const field = ['Java', '.NET'].includes(product) ? 'jvmClrVersion' : null;
    add(product, field ? p[field] : null, field || 'softwareTechnologies', 'runtime', p.jvmVendor || null);
  }
  // An unversioned detection alongside a versioned detection of the same technology is not another missing asset.
  return rows.filter((r) =>
    r.version
      ? !(
          !r.edition &&
          rows.some((other) => other.product === r.product && other.version === r.version && other.edition)
        )
      : !rows.some(
          (other) =>
            other.product === r.product &&
            other.version &&
            (!r.edition || !other.edition || r.edition === other.edition),
        ),
  );
}
function auditInventory(entities, now = Date.now(), anticipationDays = 180) {
  const observedEntities = new Map(entities.map((e) => [e.environmentId + '\0' + e.entityId, e]));
  const rows = entities.flatMap(softwareInventory).map((r) => ({
    ...r,
    ...(r.version
      ? classifyLifecycle(r.product, r.version, now, anticipationDays, r.edition)
      : {
          status: 'unknown',
          qualification: observedEntities.get(r.environmentId + '\0' + r.entityId)?.details
            ? 'version_missing'
            : 'collection_incomplete',
          reason: 'Version absente des champs Dynatrace consultés',
          reference: null,
        }),
  }));
  rows.sort(
    (a, b) =>
      ['action', 'watch', 'unknown', 'ok'].indexOf(a.status) - ['action', 'watch', 'unknown', 'ok'].indexOf(b.status),
  );
  return rows;
}

const auditPolicy = Object.freeze({
  id: 'standard-support-v1',
  label: 'Support standard / upstream actif',
  minimumCoverage: 60,
  observationHours: 24,
  referenceDays: 90,
});

// HTTP Date may come from a reverse proxy. Bounded response evidence adjusts
// observation freshness only; lifecycle calendar dates keep the audit clock.
function responseClockOffset(timing) {
  if (
    !timing ||
    !Number.isFinite(timing.serverAt) ||
    !Number.isFinite(timing.receivedAt) ||
    !Number.isFinite(timing.requestedAt)
  )
    return 0;
  const duration = timing.receivedAt - timing.requestedAt;
  const offset = timing.serverAt - timing.receivedAt;
  return duration >= 0 && duration <= 30000 && Math.abs(offset) <= 3600000 ? offset : 0;
}
function observationNow(row, now) {
  const offset = row.observationClockOffsetMs;
  return now + (Number.isFinite(offset) && Math.abs(offset) <= 3600000 ? offset : 0);
}

// A unit is one component/version/edition on one entity in one environment.
function lifecycleAssessment(rows, inventories, { scopeComplete = true } = {}) {
  const eligible = rows.filter((r) => r.category !== 'monitoring');
  const evaluated = eligible.filter((r) => ['ok', 'watch', 'action'].includes(r.status));
  const conforming = evaluated.filter((r) => r.status === 'ok' || (r.status === 'watch' && r.daysToEnd > 0));
  const coverage = eligible.length ? Math.round((100 * evaluated.length) / eligible.length) : 0;
  const assessedScore = evaluated.length ? Math.round((100 * conforming.length) / evaluated.length) : null;
  const clockSkew = eligible.filter((r) => r.qualification === 'clock_skew').length;
  const responseClockOffsetsMinutes = [
    ...new Set(
      eligible.map((r) => Math.round((r.observationClockOffsetMs || 0) / 60000)).filter((n) => Math.abs(n) > 5),
    ),
  ];
  const inventoryComplete =
    scopeComplete && inventories.length > 0 && inventories.every((i) => i.available && i.complete);
  const publish =
    !clockSkew &&
    inventoryComplete &&
    evaluated.length / eligible.length >= auditPolicy.minimumCoverage / 100 &&
    evaluated.length > 0;
  return {
    total: eligible.length,
    evaluated: evaluated.length,
    conforming: conforming.length,
    unknown: eligible.length - evaluated.length,
    coverage,
    assessedScore,
    score: publish ? assessedScore : null,
    inventoryComplete,
    clockSkew,
    responseClockOffsetsMinutes,
    clockNotice: responseClockOffsetsMinutes.length
      ? `Horloge de réponse HTTP Dynatrace : ${responseClockOffsetsMinutes.map((n) => (n > 0 ? '+' : '') + n + ' min').join(', ')}. Fraîcheur évaluée avec cette horloge ; synchronisation à vérifier.`
      : null,
    reason: !eligible.length
      ? 'Aucun composant observé'
      : !inventoryComplete
        ? 'Inventaire incomplet'
        : clockSkew
          ? 'Horloges incohérentes : relancer après synchronisation'
          : coverage < auditPolicy.minimumCoverage
            ? 'Couverture insuffisante'
            : null,
    policy: auditPolicy,
  };
}

function buildLifecycleReport(
  entities,
  inventories,
  { now = Date.now(), category = 'all', anticipationDays = 180, scopeComplete = true } = {},
) {
  const seen = new Set();
  const entityLookup = new Map(entities.map((e) => [e.environmentId + '\0' + e.entityId, e]));
  const softwareRows = auditInventory(entities, now, anticipationDays)
    .filter((r) => {
      if (r.category === 'monitoring') return false;
      const key = JSON.stringify([r.environmentId, r.entityId, r.product, r.version, r.edition]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((r) => {
      const entity = entityLookup.get(r.environmentId + '\0' + r.entityId);
      const observed = Number(r.observedAt);
      const sourceNow = observationNow(r, now);
      const fresh =
        observed > 0 &&
        observed <= sourceNow + 300000 &&
        sourceNow - observed <= auditPolicy.observationHours * 3600000;
      const evaluated = !fresh
        ? {
            ...r,
            status: 'unknown',
            qualification:
              observed > sourceNow + 300000
                ? 'clock_skew'
                : entity?.details
                  ? 'observation_stale'
                  : 'collection_incomplete',
            reason:
              observed > sourceNow + 300000
                ? 'Observation Dynatrace dans le futur : vérifier les horloges du poste et de Managed, puis relancer'
                : 'Observation absente ou ancienne',
          }
        : r.reference?.precision === 'month' && r.status === 'watch' && r.daysToEnd <= 0
          ? {
              ...r,
              status: 'unknown',
              qualification: 'support_context',
              reason: 'Mois de fin de support ; date exacte à confirmer',
            }
          : r;
      return {
        ...evaluated,
        environmentName: entity?.environmentName,
        url: entity?.url || '',
        traceId: entity?.traceId,
        collectedAt: entity?.collectedAt,
        relatedEvidence: (entity?.runtimeContext || []).flatMap((group) =>
          softwareInventory(group)
            .filter((g) => g.product === r.product && g.version)
            .map((g) => ({
              entityId: group.entityId,
              entityType: group.type,
              version: g.version,
              rawVersion: g.rawVersion,
              edition: g.edition,
              field: g.field,
              observedAt: g.observedAt,
              traceId: group.traceId,
              url: group.url,
              scope: 'Version du groupe ; non attribuée à cette instance',
            })),
        ),
        modulesAvailable: entity?.details?.properties?.versionedModules?.length || 0,
      };
    });
  const rows = softwareRows.filter((r) => category === 'all' || r.category === category);
  const entityProfiles = softwareProfiles(softwareRows, entityLookup);
  const assessment = lifecycleAssessment(rows, inventories, { scopeComplete });
  const campaigns = maintenanceCampaigns(rows, assessment);
  return {
    version: 2,
    evaluatedAt: new Date(now).toISOString(),
    category,
    anticipationDays,
    rows,
    entityProfiles,
    inventories,
    assessment,
    campaigns,
  };
}

function combineLifecycleReports(reports, now = Date.now()) {
  if (
    !reports.length ||
    reports.some((r) => r.category !== reports[0].category || r.anticipationDays !== reports[0].anticipationDays)
  )
    throw Error('Audit policies must match');
  if (
    reports.some(
      (r) =>
        !Number.isFinite(Date.parse(r.evaluatedAt)) ||
        now - Date.parse(r.evaluatedAt) > 300000 ||
        Date.parse(r.evaluatedAt) > now + 300000,
    )
  )
    throw Error('Audit evidence is stale; run a new live audit before combining');
  const seen = new Set();
  const rows = reports
    .flatMap((r) => r.rows)
    .map((r) => {
      const observed = Number(r.observedAt);
      const sourceNow = observationNow(r, now);
      if (!observed || observed > sourceNow + 300000 || sourceNow - observed > auditPolicy.observationHours * 3600000)
        return {
          ...r,
          status: 'unknown',
          qualification: observed > sourceNow + 300000 ? 'clock_skew' : 'observation_stale',
          reason:
            observed > sourceNow + 300000
              ? 'Observation Dynatrace dans le futur : vérifier les horloges du poste et de Managed, puis relancer'
              : 'Observation absente ou ancienne',
        };
      if (!r.version)
        return {
          ...r,
          status: 'unknown',
          qualification: 'version_missing',
          reason: 'Version absente des champs Dynatrace consultés',
          reference: null,
        };
      const verdict = classifyLifecycle(r.product, r.version, now, reports[0].anticipationDays, r.edition);
      if (verdict.reference?.precision === 'month' && verdict.status === 'watch' && verdict.daysToEnd <= 0)
        return {
          ...r,
          ...verdict,
          status: 'unknown',
          qualification: 'support_context',
          reason: 'Mois de fin de support ; date exacte à confirmer',
        };
      return { ...r, ...verdict };
    })
    .filter((r) => {
      const key = JSON.stringify([r.environmentId, r.entityId, r.product, r.version, r.edition]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const inventories = reports.flatMap((r) => r.inventories);
  const assessment = lifecycleAssessment(rows, inventories);
  return {
    version: 3,
    evaluatedAt: new Date(now).toISOString(),
    category: reports[0].category,
    anticipationDays: reports[0].anticipationDays,
    rows,
    inventories,
    assessment,
    entityProfiles: softwareProfiles(rows),
    campaigns: maintenanceCampaigns(rows, assessment),
    referenceVerifiedAt: reports[0].referenceVerifiedAt,
    limitations: [...new Set(reports.flatMap((r) => r.limitations || []))],
    provenance: 'caller_supplied_audits',
  };
}
function softwareProfiles(rows, entities = new Map()) {
  const profiles = new Map();
  for (const row of rows) {
    const key = row.environmentId + '\0' + row.entityId;
    if (!profiles.has(key)) {
      const entity = entities.get(key);
      const links = Object.values(entity?.details?.fromRelationships || {})
        .flat()
        .filter((link) => ['HOST', 'PROCESS_GROUP', 'CONTAINER_GROUP_INSTANCE', 'KUBERNETES_NODE'].includes(link.type));
      profiles.set(key, {
        environmentId: row.environmentId,
        entityId: row.entityId,
        entityType: row.entityType,
        name: row.name,
        url: row.url,
        primaryTechnology: entity ? runtimeProduct(entity.details?.properties?.processType) : null,
        relationships: links.map((link) => ({ entityId: link.id, entityType: link.type })),
        technologies: [],
      });
    }
    const {
      product,
      version,
      rawVersion,
      edition,
      category,
      status,
      qualification,
      reason,
      reference,
      field,
      observedAt,
      traceId,
      policySource,
    } = row;
    profiles.get(key).technologies.push({
      product,
      version,
      rawVersion,
      edition,
      category,
      status,
      qualification,
      reason,
      reference,
      field,
      observedAt,
      traceId,
      policySource,
    });
  }
  return [...profiles.values()].map((profile) => {
    const technologies = profile.technologies;
    const evaluated = technologies.filter((t) => ['ok', 'watch', 'action'].includes(t.status)).length;
    const unknown = technologies.length - evaluated;
    const status = technologies.some((t) => t.status === 'action')
      ? 'action'
      : unknown
        ? 'unknown'
        : technologies.some((t) => t.status === 'watch')
          ? 'watch'
          : 'ok';
    return {
      ...profile,
      assessment: {
        status,
        evaluated,
        total: technologies.length,
        unknown,
        versionsKnown: technologies.filter((t) => t.version).length,
        reason:
          status === 'action'
            ? 'Au moins une technologie hors support de référence'
            : status === 'unknown'
              ? 'Versions ou politiques de support à compléter'
              : status === 'watch'
                ? 'Au moins une échéance à anticiper'
                : 'Technologies évaluées sous support de référence',
      },
    };
  });
}
function maintenanceCampaigns(rows, assessment) {
  const grouped = new Map();
  for (const row of rows) {
    const key = JSON.stringify([
      row.environmentId,
      row.product,
      row.cycle || row.version,
      row.edition,
      row.category,
      row.status,
      row.qualification || null,
    ]);
    if (!grouped.has(key))
      grouped.set(key, {
        id: crypto.createHash('sha256').update(key).digest('hex').slice(0, 16),
        environmentId: row.environmentId,
        environmentName: row.environmentName,
        product: row.product,
        cycle: row.cycle || null,
        category: row.category,
        edition: row.edition,
        status: row.status,
        qualification: row.qualification || null,
        rows: [],
      });
    grouped.get(key).rows.push(row);
  }
  const priority = { action: 0, watch: 1, unknown: 2, ok: 3 };
  return [...grouped.values()]
    .map((c) => ({
      ...c,
      assets: new Set(c.rows.map((r) => r.entityId)).size,
      entityLabel: c.rows.every((r) => r.entityType === 'PROCESS_GROUP_INSTANCE')
        ? 'instances de processus'
        : c.rows.every((r) => r.entityType === 'HOST')
          ? 'hosts'
          : c.rows.every((r) => r.entityType === 'KUBERNETES_NODE')
            ? 'nodes Kubernetes'
            : 'entités',
      versions: [...new Set(c.rows.map((r) => r.version).filter(Boolean))],
      end: c.rows[0].reference?.end
        ? (c.rows[0].reference.endKind === 'minimum_availability' ? 'Au moins ' : '') + c.rows[0].reference.end
        : null,
      gainPoints:
        c.status === 'action' && assessment.evaluated ? Math.round((100 * c.rows.length) / assessment.evaluated) : null,
      projectedScore:
        c.status === 'action' && assessment.evaluated
          ? Math.round(
              (100 * (assessment.conforming + c.rows.filter((r) => r.status === 'action').length)) /
                assessment.evaluated,
            )
          : null,
      action:
        c.status === 'action'
          ? 'Vérifier le support contractuel puis préparer la mise à niveau'
          : c.status === 'watch'
            ? c.rows[0].reference?.endKind === 'minimum_availability'
              ? 'Revalider l’horizon de disponibilité des builds auprès de l’éditeur'
              : 'Planifier la mise à niveau avant l’échéance'
            : c.status === 'unknown'
              ? c.qualification === 'clock_skew'
                ? 'Vérifier les horloges du poste et de Managed, puis relancer l’audit'
                : c.qualification === 'version_missing'
                  ? 'Vérifier les preuves du groupe et les champs de version exposés'
                  : c.qualification === 'reference_missing'
                    ? 'Ajouter une référence de support pour cette version'
                    : c.qualification === 'support_context'
                      ? 'Préciser la politique éditeur, édition ou distribution'
                      : 'Compléter ou actualiser la collecte'
              : 'Conserver cette version sous surveillance',
    }))
    .sort(
      (a, b) => priority[a.status] - priority[b.status] || b.assets - a.assets || a.product.localeCompare(b.product),
    );
}

exports.lifecycleReferences = lifecycleReferences;
exports.auditPolicy = auditPolicy;
exports.classifyLifecycle = classifyLifecycle;
exports.runtimeProduct = runtimeProduct;
exports.softwareInventory = softwareInventory;
exports.auditInventory = auditInventory;
exports.lifecycleAssessment = lifecycleAssessment;
exports.buildLifecycleReport = buildLifecycleReport;
exports.combineLifecycleReports = combineLifecycleReports;
