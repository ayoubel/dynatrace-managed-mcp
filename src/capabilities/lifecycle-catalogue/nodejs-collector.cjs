// Optional connected maintenance adapter. Advisor never imports this module.
const { validateCatalogue, digest, canonical } = require('./catalogue.cjs');
const scheduleUrl = 'https://raw.githubusercontent.com/nodejs/Release/main/schedule.json';
async function collectNodeSchedule({ fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const response = await fetchImpl(scheduleUrl, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Error('Official Node.js schedule unavailable');
  const content = await response.text();
  if (Buffer.byteLength(content) > 1024 * 1024) throw Error('Official schedule too large');
  // Retain raw bytes for an operator's evidence archive, never as executable code.
  return { url: scheduleUrl, content, retrievedAt: new Date(now).toISOString() };
}
function normalizeNodeSchedule(base, snapshot, version) {
  const candidate = validateCatalogue(base, { approved: false });
  if (snapshot.url !== scheduleUrl || !Number.isFinite(Date.parse(snapshot.retrievedAt)))
    throw Error('Official Node.js source required');
  if (Buffer.byteLength(snapshot.content) > 1024 * 1024) throw Error('Official schedule too large');
  const schedule = JSON.parse(snapshot.content);
  if (!schedule || Array.isArray(schedule) || typeof schedule !== 'object') throw Error('Invalid official schedule');
  const template = candidate.entries.find((e) => e.vendorId === 'nodejs' && e.productId === 'Node.js');
  if (!template) throw Error('Node.js policy template required');
  const entries = [];
  for (const [key, value] of Object.entries(schedule)) {
    if (!/^v[1-9]\d*$/.test(key)) continue;
    if (
      !value ||
      typeof value !== 'object' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.end || '') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.start || '')
    )
      throw Error('Schedule format changed; review required');
    const e = structuredClone(template),
      cycle = key.slice(1);
    e.id = 'nodejs:' + cycle;
    e.version = { scheme: 'semver', kind: 'major', expression: cycle };
    e.sourceIds = ['nodejs-schedule'];
    e.verifiedAt = null;
    e.verificationState = 'pending';
    e.uncertainty = { state: 'none', explanation: 'Official schedule candidate; verification requires human review' };
    const milestone = (kind, date) => ({
      kind,
      meaning: 'announced',
      date: { precision: 'day', value: date },
      scope: template.milestones[0].scope,
      sourceIds: e.sourceIds,
      derivation: null,
      uncertainty: {
        state: 'none',
        explanation: 'Official upstream schedule; extended commercial support not evaluated',
      },
    });
    e.milestones = [milestone('release', value.start), milestone('security_support_end', value.end)];
    entries.push(e);
  }
  if (!entries.length) throw Error('Empty official schedule; review required');
  const newer = version?.match(/^(\d+)\.(\d+)\.(\d+)$/),
    old = candidate.catalogueVersion.split('.').map(Number);
  if (
    !newer ||
    !newer
      .slice(1)
      .map(Number)
      .some((n, i, a) => a.slice(0, i).every((v, j) => v === old[j]) && n > old[i])
  )
    throw Error('A newer catalogue version is required');
  candidate.catalogueVersion = version;
  candidate.publishedAt = snapshot.retrievedAt;
  candidate.review = {
    state: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    changeSummary: 'Node.js official schedule candidate; inspect withdrawals, dates and coverage before approval',
  };
  candidate.entries = candidate.entries.filter((e) => e.productId !== 'Node.js').concat(entries);
  candidate.sources = candidate.sources
    .filter((s) => s.id !== 'nodejs-schedule')
    .concat({
      id: 'nodejs-schedule',
      url: scheduleUrl,
      publisher: 'Node.js Release project',
      authority: 'official',
      evidenceState: 'archived',
      retrievedAt: snapshot.retrievedAt,
      contentSha256: require('node:crypto').createHash('sha256').update(snapshot.content).digest('hex'),
      repositoryRevision: null,
      parserRevision: 'nodejs-schedule-v1',
      localEvidencePath: require('node:crypto').createHash('sha256').update(snapshot.content).digest('hex') + '.txt',
    });
  return validateCatalogue(candidate, { approved: false });
}
function catalogueDiff(before, after) {
  validateCatalogue(before, { approved: false });
  validateCatalogue(after, { approved: false });
  const prior = new Map(before.entries.map((e) => [e.id, e])),
    next = new Map(after.entries.map((e) => [e.id, e]));
  return {
    before: before.catalogueVersion,
    after: after.catalogueVersion,
    candidateSha256: digest(after),
    added: [...next.keys()].filter((k) => !prior.has(k)),
    removed: [...prior.keys()].filter((k) => !next.has(k)),
    changed: [...next.keys()].filter((k) => prior.has(k) && canonical(prior.get(k)) !== canonical(next.get(k))),
    pendingVerification: after.entries.filter((e) => e.verificationState === 'pending').map((e) => e.id),
    sourceChanges: after.sources
      .filter((s) => !before.sources.some((b) => canonical(b) === canonical(s)))
      .map((s) => s.id),
  };
}
module.exports = { scheduleUrl, collectNodeSchedule, normalizeNodeSchedule, catalogueDiff };
