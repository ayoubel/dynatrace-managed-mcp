import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import baseline from '../../../test-fixtures/lifecycle-catalogue-baseline.json';
import { classifyLifecycle, buildLifecycleReport, combineLifecycleReports } from '../lifecycle.cjs';
const {
  loadCatalogue,
  validateCatalogue,
  digest,
  canonical,
  findReference,
} = require('../lifecycle-catalogue/catalogue.cjs');
const { approveCandidate, installBundle, selectVersion } = require('../lifecycle-catalogue/store.cjs');
const {
  collectNodeSchedule,
  normalizeNodeSchedule,
  catalogueDiff,
  scheduleUrl,
} = require('../lifecycle-catalogue/nodejs-collector.cjs');
const now = Date.parse('2026-10-19T12:00:00Z');
const original = () => loadCatalogue({ root: null }).catalogue;
const snapshot = () => ({
  url: scheduleUrl,
  retrievedAt: new Date(now).toISOString(),
  content: JSON.stringify({
    v22: { start: '2024-04-24', end: '2027-04-30' },
    v24: { start: '2025-05-06', end: '2028-04-30' },
  }),
});
let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daybreak-catalogue-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

test('lossless JSON migration retains all 43 references and the existing reference hash', () => {
  const loaded = loadCatalogue();
  expect(loaded.references).toEqual(baseline.cases.map((c) => c.reference));
  expect(loaded.references).toHaveLength(43);
  const hash = crypto.createHash('sha256').update(JSON.stringify(loaded.references)).digest('hex');
  expect(buildLifecycleReport([], [], { now }).referenceSnapshot.sha256).toBe(hash);
  expect(
    loaded.catalogue.sources.every(
      (s: any) => s.contentSha256 === null && s.retrievedAt === null && s.evidenceState === 'legacy_unverified',
    ),
  ).toBe(true);
});
test.each(baseline.cases)(
  'old verdicts and precise freshness boundaries stay stable: $reference.product $reference.cycle',
  (c) => {
    for (const sample of c.checks)
      expect(
        classifyLifecycle(
          c.reference.product,
          c.reference.cycle + '.0',
          sample.now,
          180,
          (c.reference as any).edition || null,
        ),
      ).toEqual(sample.result);
  },
);
test('matching supports exact and bounded ranges without executable expressions or lost edition constraints', () => {
  const c = original(),
    e = c.entries.find((e: any) => e.productId === 'Node.js' && e.version.expression === '22');
  c.entries = [e];
  e.version = { scheme: 'semver', kind: 'range', expression: '>=22.1.0 <23.0.0' };
  e.verificationState = 'pending';
  const loaded = { catalogue: validateCatalogue(c, { approved: false }) };
  expect(findReference(loaded, 'Node.js', '22.1.0', null)).not.toBeNull();
  expect(findReference(loaded, 'Node.js', '22.0.9', null)).toBeNull();
  expect(findReference(loaded, 'Node.js', '23.0.0', null)).toBeNull();
  e.version = { scheme: 'semver', kind: 'exact', expression: '22.1.0' };
  expect(findReference({ catalogue: validateCatalogue(c, { approved: false }) }, 'Node.js', '22.1.1', null)).toBeNull();
  const b = loadCatalogue();
  expect(findReference(b, 'Java', '1.8.0', null)).toBeNull();
  expect(findReference(b, 'Java', '1.8.0', 'Eclipse Adoptium').cycle).toBe('8');
  expect(findReference(b, 'NGINX', '1.24.0', null)).toBeNull();
});
test.each([
  'duplicate',
  'overlap',
  'wildcard-overlap',
  'alias',
  'date',
  'url',
  'source',
  'minimum',
  'derivation',
  'unknown',
  'scope',
  'verified',
])('invalid catalogues fail closed: %s', (kind) => {
  const c = original(),
    e = c.entries[0];
  if (kind === 'duplicate') c.entries.push(structuredClone(e));
  if (kind === 'overlap') {
    const copy = structuredClone(e);
    copy.id += '-copy';
    c.entries.push(copy);
  }
  if (kind === 'wildcard-overlap') {
    const copy = structuredClone(e);
    copy.id += '-copy';
    copy.scope.edition = null;
    copy.scope.editionRequirement = 'not_applicable';
    c.entries.push(copy);
  }
  if (kind === 'alias') c.entries[1].aliases = ['PHP'];
  if (kind === 'date') e.milestones[0].date = { precision: 'day', value: '2026-02-30' };
  if (kind === 'url') c.sources[0].url = 'https://github.com/untrusted/policy';
  if (kind === 'source') e.sourceIds = ['missing'];
  if (kind === 'minimum') e.milestones[0].kind = 'security_support_end';
  if (kind === 'derivation') e.milestones[0].meaning = 'derived';
  if (kind === 'unknown') e.milestones[0].meaning = 'unknown';
  if (kind === 'scope') e.scope.edition = null;
  if (kind === 'verified') e.verificationState = 'verified';
  expect(() => validateCatalogue(c)).toThrow();
});
test('deterministic payload hash ignores object key ordering but detects policy changes', () => {
  const c = original(),
    reordered = Object.fromEntries(Object.entries(c).reverse());
  expect(digest(reordered)).toBe(digest(c));
  expect(canonical({ b: 2, a: 1 })).toBe(canonical({ a: 1, b: 2 }));
  const before = digest(c);
  c.entries[0].milestones[0].date.value = '2030-11';
  expect(digest(c)).not.toBe(before);
});
test('official Node collector creates an unapproved candidate, never advances verification or runtime selection', async () => {
  const fetchImpl = jest.fn(async (url: string, options: any) => {
    expect(url).toBe(scheduleUrl);
    expect(options.redirect).toBe('error');
    return { ok: true, text: async () => snapshot().content };
  });
  const captured = await collectNodeSchedule({ fetchImpl, now });
  const before = original(),
    candidate = normalizeNodeSchedule(before, captured, '1.1.0');
  expect(
    candidate.entries
      .filter((e: any) => e.productId === 'Node.js')
      .every((e: any) => e.verifiedAt === null && e.verificationState === 'pending'),
  ).toBe(true);
  expect(() => validateCatalogue(candidate)).toThrow(/approval/);
  expect(catalogueDiff(before, candidate).removed).toContain('nodejs:18');
  expect(digest(original())).toBe(digest(before));
  expect(() => normalizeNodeSchedule(before, { ...captured, url: 'https://example.com' }, '1.1.0')).toThrow();
  expect(() => normalizeNodeSchedule(before, { ...captured, content: '{}' }, '1.1.0')).toThrow();
  expect(() => normalizeNodeSchedule(before, { ...captured, content: '{"v22":{"end":"broken"}}' }, '1.1.0')).toThrow();
  expect(() => normalizeNodeSchedule(before, captured, '0.9.9')).toThrow();
});
test('release dates and disputed milestones cannot be used as support verdicts', () => {
  const c = normalizeNodeSchedule(original(), snapshot(), '1.1.0');
  const e = c.entries.find((e: any) => e.productId === 'Node.js');
  e.milestones[1].uncertainty = { state: 'disputed', explanation: 'Conflicting official declarations' };
  expect(findReference({ catalogue: validateCatalogue(c, { approved: false }) }, 'Node.js', '22.1.0', null)).toBeNull();
  e.evaluationMilestone = 'release';
  expect(() => validateCatalogue(c, { approved: false })).toThrow();
});
test('signed offline import, activation and rollback keep immutable snapshots and original verification ages', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const secret = privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pub = publicKey.export({ type: 'spki', format: 'pem' });
  const keyfile = path.join(dir, 'trust.pem');
  fs.writeFileSync(keyfile, pub);
  const sign = (c: any) =>
    approveCandidate(c, {
      expectedSha256: digest(c),
      reviewedBy: 'Test reviewer',
      privateKey: secret,
      now,
      evidenceRoot: dir,
    });
  const base = sign(original());
  installBundle(dir, base.catalogue, base.manifest, pub);
  const first = selectVersion(dir, '1.0.0', pub, { reason: 'Select reviewed baseline' });
  expect(loadCatalogue({ root: dir, publicKey: keyfile }).sha256).toBe(first.sha256);
  const candidate = normalizeNodeSchedule(original(), snapshot(), '1.1.0');
  const source = candidate.sources.find((s: any) => s.id === 'nodejs-schedule');
  fs.writeFileSync(path.join(dir, source.localEvidencePath), snapshot().content);
  const next = sign(candidate);
  installBundle(dir, next.catalogue, next.manifest, pub);
  expect(loadCatalogue({ root: dir, publicKey: keyfile }).sha256).toBe(first.sha256); // Import alone never selects.
  const selected = selectVersion(dir, '1.1.0', pub, { expectedCurrent: first.sha256, reason: 'Reviewed Node update' });
  expect(loadCatalogue({ root: dir, publicKey: keyfile }).catalogue.catalogueVersion).toBe('1.1.0');
  const oldReport = buildLifecycleReport([], [], { now });
  const previousRoot = process.env.DT_MCP_LIFECYCLE_CATALOGUE_DIR,
    previousKey = process.env.DT_MCP_LIFECYCLE_CATALOGUE_PUBLIC_KEY;
  try {
    process.env.DT_MCP_LIFECYCLE_CATALOGUE_DIR = dir;
    process.env.DT_MCP_LIFECYCLE_CATALOGUE_PUBLIC_KEY = keyfile;
    const current = buildLifecycleReport(
      [
        {
          entityId: 'PROCESS_GROUP_INSTANCE-A',
          type: 'PROCESS_GROUP_INSTANCE',
          environmentId: 'env',
          details: {
            lastSeenTms: now,
            properties: { softwareTechnologies: [{ type: 'NODE_JS', version: '18.20.8' }] },
          },
        },
      ],
      [{ available: true, complete: true }],
      { now },
    );
    expect(current.referenceSnapshot.catalogue.version).toBe('1.1.0');
    expect(current.referenceSnapshot.provenance).toBe('versioned_reference_catalog');
    expect(current.rows[0]).toMatchObject({ status: 'unknown', qualification: 'reference_missing' });
    expect(() => combineLifecycleReports([oldReport], now)).toThrow(/catalogue/);
    const missingIdentity = structuredClone(oldReport);
    delete (missingIdentity.referenceSnapshot as any).catalogue;
    expect(() => combineLifecycleReports([missingIdentity], now)).toThrow(/catalogue/);
  } finally {
    if (previousRoot === undefined) delete process.env.DT_MCP_LIFECYCLE_CATALOGUE_DIR;
    else process.env.DT_MCP_LIFECYCLE_CATALOGUE_DIR = previousRoot;
    if (previousKey === undefined) delete process.env.DT_MCP_LIFECYCLE_CATALOGUE_PUBLIC_KEY;
    else process.env.DT_MCP_LIFECYCLE_CATALOGUE_PUBLIC_KEY = previousKey;
  }
  expect(() => selectVersion(dir, '1.0.0', pub, { expectedCurrent: first.sha256, reason: 'Stale decision' })).toThrow(
    /changed/,
  );
  selectVersion(dir, '1.0.0', pub, { expectedCurrent: selected.sha256, reason: 'Rollback' });
  const restored = loadCatalogue({ root: dir, publicKey: keyfile });
  expect(restored.catalogue.entries[0].verifiedAt).toBe('2026-10-08T00:00:00.000Z');
  expect(fs.readdirSync(path.join(dir, 'history'))).toHaveLength(3);
  expect(fs.existsSync(path.join(dir, 'versions/1.1.0/catalogue.json'))).toBe(true);
  expect(() => installBundle(dir, next.catalogue, { ...next.manifest, sha256: 'a'.repeat(64) }, pub)).toThrow(
    /integrity/,
  );
  const forged = structuredClone(next.catalogue);
  forged.entries.find((e: any) => e.productId === 'Node.js').milestones[1].date.value = '2027-05-01';
  expect(() => installBundle(dir, forged, { ...next.manifest, sha256: digest(forged) }, pub)).toThrow(/signature/);
  expect(() =>
    approveCandidate(candidate, { reviewedBy: 'Test', expectedSha256: 'a'.repeat(64), privateKey: secret, now }),
  ).toThrow(/changed/);
  expect(() =>
    approveCandidate(candidate, { reviewedBy: 'Test', expectedSha256: digest(candidate), privateKey: secret, now }),
  ).toThrow(/bytes/);
  const changedVersion = sign(forged);
  expect(() => installBundle(dir, changedVersion.catalogue, changedVersion.manifest, pub)).toThrow(/already exists/);
  expect(() => loadCatalogue({ root: dir, publicKey: path.join(dir, 'absent') })).toThrow();
  expect(() => loadCatalogue({ root: dir, publicKey: null })).toThrow(/trusted/);
  fs.writeFileSync(
    path.join(dir, 'current.json'),
    JSON.stringify({ catalogueVersion: '../../outside', sha256: 'a'.repeat(64) }),
  );
  expect(() => loadCatalogue({ root: dir, publicKey: keyfile })).toThrow();
});
test('legacy provenance cannot be used to introduce or alter policy without new evidence', () => {
  const changed = original();
  changed.entries[0].milestones[0].date.value = '2031-12';
  expect(() => validateCatalogue(changed)).toThrow(/unchanged baseline/);
  const added = original(),
    e = structuredClone(added.entries[0]);
  e.id = 'java-new';
  e.version.expression = '99';
  added.entries.push(e);
  expect(() => validateCatalogue(added)).toThrow(/unchanged baseline/);
});
test('combined reports accept bundled legacy evidence but reject mixed catalogue identities', () => {
  const report = buildLifecycleReport([], [], { now });
  expect(() =>
    combineLifecycleReports(
      [
        report,
        {
          ...report,
          referenceSnapshot: {
            ...report.referenceSnapshot,
            catalogue: { ...report.referenceSnapshot.catalogue, sha256: 'a'.repeat(64) },
          },
        },
      ],
      now,
    ),
  ).toThrow(/catalogue/);
  const legacy = structuredClone(report);
  delete (legacy.referenceSnapshot as any).catalogue;
  expect(combineLifecycleReports([legacy], now).referenceSnapshot.catalogue.version).toBe('1.0.0');
});
