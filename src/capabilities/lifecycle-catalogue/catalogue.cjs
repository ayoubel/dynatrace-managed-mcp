// Offline-only catalogue validation, matching and loading. No network imports.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { z } = require('zod');
const bundled = require('./catalogue-v1.json');
const bundledManifest = require('./manifest-v1.json');
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const officialHosts = new Set([
  'adoptium.net',
  'www.php.net',
  'go.dev',
  'containerd.io',
  'ubuntu.com',
  'kubernetes.io',
  'github.com',
  'raw.githubusercontent.com',
  'devguide.python.org',
  'nginx.org',
  'dotnet.microsoft.com',
  'mariadb.org',
  'musl.libc.org',
  'www.gnu.org',
]);
const officialUrls = new Set([
  'https://adoptium.net/support/',
  'https://www.php.net/eol.php',
  'https://www.php.net/supported-versions.php',
  'https://go.dev/doc/devel/release',
  'https://containerd.io/releases/',
  'https://ubuntu.com/about/release-cycle',
  'https://kubernetes.io/releases/patch-releases/',
  'https://github.com/nodejs/Release',
  'https://raw.githubusercontent.com/nodejs/Release/main/schedule.json',
  'https://devguide.python.org/versions/',
  'https://nginx.org/en/download.html',
  'https://nginx.org/en/security_advisories.html',
  'https://dotnet.microsoft.com/en-us/platform/support/policy',
  'https://github.com/dotnet/core/blob/main/release-notes/releases-index.json',
  'https://mariadb.org/about/#maintenance-policy',
  'https://musl.libc.org/',
  'https://www.gnu.org/software/libc/',
]);
const text = z.string().min(1).max(4000);
const timestamp = z.string().datetime({ offset: true });
const ids = z
  .array(text)
  .min(1)
  .max(100)
  .refine((a) => new Set(a).size === a.length, 'Duplicate source IDs');
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const uncertainty = z
  .object({
    state: z.enum([
      'none',
      'missing_policy',
      'ambiguous_identity',
      'conditional_entitlement',
      'missing_milestone',
      'disputed',
      'minimum_bound',
      'legacy_provenance',
    ]),
    explanation: text,
  })
  .strict();
const kinds = z.enum([
  'release',
  'active_support_end',
  'security_support_end',
  'extended_support_end',
  'end_of_availability',
]);
const date = z.discriminatedUnion('precision', [
  z
    .object({
      precision: z.literal('day'),
      value: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine(
          (v) => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
          'Invalid calendar day',
        ),
    })
    .strict(),
  z.object({ precision: z.literal('month'), value: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).strict(),
  z.object({ precision: z.literal('unknown'), value: z.null() }).strict(),
]);
const source = z
  .object({
    id: text,
    url: z.string().url(),
    publisher: text,
    authority: z.literal('official'),
    evidenceState: z.enum(['archived', 'legacy_unverified']),
    retrievedAt: timestamp.nullable(),
    contentSha256: hash.nullable(),
    repositoryRevision: text.nullable(),
    parserRevision: text,
    localEvidencePath: text.nullable(),
  })
  .strict();
const milestone = z
  .object({
    kind: kinds,
    meaning: z.enum(['announced', 'derived', 'minimum_bound', 'unknown']),
    date,
    scope: text,
    sourceIds: ids,
    derivation: z.object({ ruleId: text, inputSourceIds: ids }).strict().nullable(),
    uncertainty,
  })
  .strict();
const entry = z
  .object({
    id: text,
    vendorId: text,
    productId: text,
    aliases: z.array(text).max(50),
    scope: z
      .object({
        edition: text.nullable(),
        distribution: text.nullable(),
        os: text.nullable(),
        architecture: text.nullable(),
        editionRequirement: z.enum(['required', 'not_applicable']),
        supportChannel: text,
        entitlement: z.enum(['not_required', 'required_unverified', 'explicit_evidence_required']),
      })
      .strict(),
    version: z
      .object({
        scheme: z.enum(['semver', 'java', 'distro']),
        kind: z.enum(['major', 'majorMinor', 'exact', 'range']),
        expression: text,
      })
      .strict(),
    evaluationMilestone: z.enum(['security_support_end', 'end_of_availability']),
    milestones: z.array(milestone).min(1).max(10),
    verifiedAt: timestamp.nullable(),
    verificationState: z.enum(['legacy_record', 'pending', 'verified']),
    sourceIds: ids,
    uncertainty,
  })
  .strict();
const catalogueSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    catalogueVersion: z.string().regex(versionPattern),
    publishedAt: timestamp,
    review: z
      .object({
        state: z.enum(['pending', 'approved']),
        reviewedBy: text.nullable(),
        reviewedAt: timestamp.nullable(),
        changeSummary: text,
      })
      .strict(),
    sources: z.array(source).min(1).max(1000),
    entries: z.array(entry).min(1).max(10000),
  })
  .strict();
const canonical = (value) => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  return value && typeof value === 'object'
    ? Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((k) => [k, sort(value[k])]),
      )
    : value;
}
const digest = (value) => crypto.createHash('sha256').update(canonical(value)).digest('hex');
const tuple = (v) => v.split('.').map(Number).concat([0, 0]).slice(0, 3);
const compare = (a, b) => {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};
function matcherBounds(m) {
  if (m.kind === 'major' && /^\d+$/.test(m.expression)) return [tuple(m.expression), [Number(m.expression) + 1, 0, 0]];
  if (m.kind === 'majorMinor' && /^\d+\.\d+$/.test(m.expression)) {
    const v = tuple(m.expression);
    return [v, [v[0], v[1] + 1, 0]];
  }
  if (m.kind === 'exact' && /^\d+\.\d+\.\d+$/.test(m.expression)) {
    const v = tuple(m.expression);
    return [v, [v[0], v[1], v[2] + 1]];
  }
  const range = m.kind === 'range' && m.expression.match(/^>=(\d+\.\d+\.\d+) <(\d+\.\d+\.\d+)$/);
  if (range && compare(tuple(range[1]), tuple(range[2])) < 0) return [tuple(range[1]), tuple(range[2])];
  throw Error('Unsupported catalogue version matcher');
}
function validateCatalogue(input, { approved = true } = {}) {
  const c = catalogueSchema.parse(input),
    sources = new Map();
  if (approved && (c.review.state !== 'approved' || !c.review.reviewedBy || !c.review.reviewedAt))
    throw Error('Catalogue requires approval');
  for (const s of c.sources) {
    const u = new URL(s.url);
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.port ||
      !officialHosts.has(u.hostname) ||
      !officialUrls.has(s.url)
    )
      throw Error('Untrusted catalogue source');
    if (sources.has(s.id)) throw Error('Duplicate source');
    sources.set(s.id, s);
    if (s.evidenceState === 'archived' && (!s.retrievedAt || !s.contentSha256))
      throw Error('Archived source evidence required');
    if (s.evidenceState === 'legacy_unverified' && (s.retrievedAt !== null || s.contentSha256 !== null))
      throw Error('Legacy provenance cannot assert archived evidence');
    if (approved && s.retrievedAt && Date.parse(s.retrievedAt) > Date.parse(c.review.reviewedAt))
      throw Error('Source retrieved after review');
  }
  const seen = new Set(),
    aliases = new Map();
  for (const e of c.entries) {
    if (seen.has(e.id)) throw Error('Duplicate entry');
    seen.add(e.id);
    matcherBounds(e.version);
    if (e.verificationState === 'legacy_record') {
      const original = bundled.entries.find((b) => b.id === e.id);
      if (
        !original ||
        canonical(e) !== canonical(original) ||
        e.sourceIds.some((id) => canonical(sources.get(id)) !== canonical(bundled.sources.find((s) => s.id === id)))
      )
        throw Error('Legacy provenance is restricted to unchanged baseline entries');
    }
    for (const alias of [e.productId, ...e.aliases]) {
      const previous = aliases.get(alias);
      if (previous && previous !== e.productId) throw Error('Conflicting product alias');
      aliases.set(alias, e.productId);
    }
    if (e.scope.editionRequirement === 'required' && !e.scope.edition) throw Error('Edition required');
    if (e.scope.editionRequirement === 'not_applicable' && e.scope.edition)
      throw Error('Unexpected edition constraint');
    if (approved && (!e.verifiedAt || e.verificationState === 'pending'))
      throw Error('Entry requires verification review');
    if (approved && Date.parse(e.verifiedAt) > Date.parse(c.review.reviewedAt))
      throw Error('Entry verification occurs after review');
    if (
      e.verificationState === 'verified' &&
      (!e.verifiedAt ||
        e.sourceIds.some(
          (id) =>
            sources.get(id)?.evidenceState !== 'archived' ||
            Date.parse(sources.get(id).retrievedAt) > Date.parse(e.verifiedAt),
        ))
    )
      throw Error('Verified entry requires archived official evidence before verification');
    const milestones = new Set();
    for (const m of e.milestones) {
      if (milestones.has(m.kind)) throw Error('Duplicate milestone');
      milestones.add(m.kind);
      if ((m.meaning === 'unknown') !== (m.date.precision === 'unknown'))
        throw Error('Unknown milestone must retain unknown date');
      if (m.meaning === 'minimum_bound' && m.kind !== 'end_of_availability')
        throw Error('Minimum availability is not EOS');
      if (m.kind === e.evaluationMilestone && m.kind === 'end_of_availability' && m.meaning !== 'minimum_bound')
        throw Error('Availability may only supply a minimum bound for assessment');
      if ((m.meaning === 'minimum_bound') !== (m.uncertainty.state === 'minimum_bound'))
        throw Error('Minimum-bound uncertainty must be explicit');
      if ((m.meaning === 'derived') !== Boolean(m.derivation))
        throw Error('Derived milestone requires a derivation rule');
      for (const id of [...e.sourceIds, ...m.sourceIds, ...(m.derivation?.inputSourceIds || [])])
        if (!sources.has(id)) throw Error('Unknown source ID');
      if ([...m.sourceIds, ...(m.derivation?.inputSourceIds || [])].some((id) => !e.sourceIds.includes(id)))
        throw Error('Milestone source must be included in entry provenance');
    }
    if (!milestones.has(e.evaluationMilestone)) throw Error('Assessment milestone missing');
    // Compare only exact dates, without inventing order inside month intervals.
    const dates = ['release', 'active_support_end', 'security_support_end', 'extended_support_end']
      .map((k) => e.milestones.find((m) => m.kind === k))
      .filter((m) => m && m.date.precision === 'day');
    for (let i = 1; i < dates.length; i++)
      if (dates[i].date.value < dates[i - 1].date.value) throw Error('Conflicting lifecycle dates');
  }
  for (let i = 0; i < c.entries.length; i++)
    for (let j = i + 1; j < c.entries.length; j++) {
      const a = c.entries[i],
        b = c.entries[j];
      if (
        a.productId !== b.productId ||
        !['edition', 'distribution', 'os', 'architecture'].every(
          (k) => !a.scope[k] || !b.scope[k] || a.scope[k] === b.scope[k],
        )
      )
        continue;
      const [al, ah] = matcherBounds(a.version),
        [bl, bh] = matcherBounds(b.version);
      if (compare(al, bh) < 0 && compare(bl, ah) < 0) throw Error('Overlapping catalogue policies');
    }
  return c;
}
function referenceFor(c, e) {
  const m = e.milestones.find((m) => m.kind === e.evaluationMilestone);
  const qualified = (state) => ['none', 'minimum_bound', 'legacy_provenance'].includes(state);
  if (!m || m.date.value === null || !qualified(e.uncertainty.state) || !qualified(m.uncertainty.state)) return null;
  // Stable projection preserves the 43-entry compatibility hash and public fields.
  return {
    product: e.productId,
    cycle: e.version.expression,
    end: m.date.value,
    ...(e.scope.edition ? { edition: e.scope.edition } : {}),
    ...(m.meaning === 'minimum_bound' ? { endKind: 'minimum_availability' } : {}),
    source: c.sources.find((s) => s.id === m.sourceIds[0]).url,
    scope: m.scope,
    verifiedAt: e.verifiedAt?.slice(0, 10),
    precision: m.date.precision,
  };
}
function prepare(c) {
  const catalogue = validateCatalogue(c);
  return {
    catalogue,
    sha256: digest(catalogue),
    references: catalogue.entries.map((e) => referenceFor(catalogue, e)).filter((r) => r !== null),
  };
}
function findReference(loaded, product, version, edition) {
  const c = loaded.catalogue;
  const matches = c.entries.filter((e) => {
    if (e.productId !== product && !e.aliases.includes(product)) return false;
    if (e.scope.editionRequirement === 'required' && e.scope.edition !== edition) return false;
    if (e.scope.distribution || e.scope.os || e.scope.architecture || e.scope.entitlement !== 'not_required')
      return false;
    const cycle =
      e.version.kind === 'major' && e.version.scheme === 'java'
        ? String(version).match(/^1\.(\d+)/)?.[1] || String(version).match(/\d+/)?.[0]
        : String(version).match(/\d+(?:\.\d+){0,2}/)?.[0];
    if (!cycle) return false;
    const [lo, hi] = matcherBounds(e.version),
      v = tuple(cycle);
    return compare(v, lo) >= 0 && compare(v, hi) < 0;
  });
  return matches.length === 1 ? referenceFor(c, matches[0]) : null;
}
function readJson(file) {
  if (fs.statSync(file).size > 5 * 1024 * 1024) throw Error('Catalogue file too large');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function verifyBundle(bundle, manifest, publicKey) {
  const loaded = prepare(bundle);
  const shape = z
    .object({ catalogueVersion: z.string().regex(versionPattern), sha256: hash, signature: text.nullable() })
    .strict()
    .parse(manifest);
  if (shape.catalogueVersion !== bundle.catalogueVersion || shape.sha256 !== loaded.sha256)
    throw Error('Catalogue integrity mismatch');
  if (
    publicKey &&
    (!shape.signature ||
      !crypto.verify(null, Buffer.from(canonical(bundle)), publicKey, Buffer.from(shape.signature, 'base64')))
  )
    throw Error('Catalogue signature invalid');
  return loaded;
}
const bundledLoaded = verifyBundle(bundled, bundledManifest);
function loadCatalogue({
  root = process.env.DT_MCP_LIFECYCLE_CATALOGUE_DIR,
  publicKey = process.env.DT_MCP_LIFECYCLE_CATALOGUE_PUBLIC_KEY,
} = {}) {
  if (!root) return structuredClone(bundledLoaded);
  if (!publicKey) throw Error('External catalogue requires an operator-trusted public key');
  const selected = z
    .object({ catalogueVersion: z.string().regex(versionPattern), sha256: hash })
    .strict()
    .parse(readJson(path.join(root, 'current.json')));
  const dir = path.join(root, 'versions', selected.catalogueVersion);
  const loaded = verifyBundle(
    readJson(path.join(dir, 'catalogue.json')),
    readJson(path.join(dir, 'manifest.json')),
    fs.readFileSync(publicKey),
  );
  if (loaded.sha256 !== selected.sha256) throw Error('Selected catalogue integrity mismatch');
  return loaded;
}
module.exports = {
  jsonSchema: require('./catalogue-v1.schema.json'),
  catalogueSchema,
  validateCatalogue,
  canonical,
  digest,
  matcherBounds,
  prepare,
  findReference,
  referenceFor,
  readJson,
  verifyBundle,
  loadCatalogue,
  versionPattern,
};
