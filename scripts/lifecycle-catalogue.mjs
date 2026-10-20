// Optional operator CLI. No command is called by an Advisor investigation.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  loadCatalogue,
  validateCatalogue,
  digest,
  readJson,
  prepare,
} = require('../src/capabilities/lifecycle-catalogue/catalogue.cjs');
const {
  collectNodeSchedule,
  normalizeNodeSchedule,
  catalogueDiff,
} = require('../src/capabilities/lifecycle-catalogue/nodejs-collector.cjs');
const { approveCandidate, installBundle, selectVersion } = require('../src/capabilities/lifecycle-catalogue/store.cjs');
const args = process.argv.slice(3),
  command = process.argv[2];
const opt = (name) => {
  const i = args.indexOf('--' + name);
  return i < 0 ? undefined : args[i + 1];
};
const required = (name) => {
  const v = opt(name);
  if (!v || v.startsWith('--')) throw Error('--' + name + ' is required');
  return v;
};
const write = (file, value) =>
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
try {
  if (command === 'collect-nodejs') {
    const output = required('output'),
      evidence = required('evidence-dir');
    // Offline normalizing from a previously archived snapshot is also supported.
    const snapshot = opt('snapshot') ? readJson(opt('snapshot')) : await collectNodeSchedule();
    const candidate = normalizeNodeSchedule(loadCatalogue().catalogue, snapshot, required('version'));
    fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });
    const source = candidate.sources.find((s) => s.id === 'nodejs-schedule'),
      raw = path.join(evidence, source.localEvidencePath);
    if (
      fs.existsSync(raw) &&
      require('node:crypto').createHash('sha256').update(fs.readFileSync(raw)).digest('hex') !== source.contentSha256
    )
      throw Error('Existing source archive is corrupt');
    if (!fs.existsSync(raw)) fs.writeFileSync(raw, snapshot.content, { flag: 'wx', mode: 0o600 });
    write(output, candidate);
    console.log(JSON.stringify(catalogueDiff(loadCatalogue().catalogue, candidate), null, 2));
  } else if (command === 'validate') {
    const candidate = readJson(required('candidate'));
    validateCatalogue(candidate, { approved: false });
    console.log(JSON.stringify({ valid: true, state: candidate.review.state, sha256: digest(candidate) }));
  } else if (command === 'diff') {
    const before = opt('before') ? readJson(opt('before')) : loadCatalogue().catalogue,
      after = readJson(required('candidate'));
    const diff = catalogueDiff(before, after);
    // Optional product/version samples show actual classification changes, without selecting the candidate.
    if (opt('samples')) {
      const { classifyLifecycle } = require('../src/capabilities/lifecycle.cjs'),
        now = Date.now();
      const preview = structuredClone(after);
      for (const e of preview.entries)
        if (e.verificationState === 'pending') {
          e.verifiedAt = new Date(now).toISOString();
          e.verificationState = 'verified';
        }
      preview.review = {
        ...preview.review,
        state: 'approved',
        reviewedBy: 'UNAPPROVED PREVIEW',
        reviewedAt: new Date(now).toISOString(),
      };
      const proposed = prepare(preview),
        prior = prepare(before);
      diff.previewOnly = true;
      diff.verdicts = readJson(opt('samples')).map((s) => ({
        product: s.product,
        version: s.version,
        edition: s.edition || null,
        before: classifyLifecycle(s.product, s.version, now, 180, s.edition || null, prior),
        proposed: classifyLifecycle(s.product, s.version, now, 180, s.edition || null, proposed),
      }));
    }
    console.log(JSON.stringify(diff, null, 2));
  } else if (command === 'approve') {
    const bundle = approveCandidate(readJson(required('candidate')), {
      reviewedBy: required('reviewed-by'),
      expectedSha256: required('expected-sha256'),
      privateKey: fs.readFileSync(required('private-key')),
      evidenceRoot: opt('evidence-dir'),
    });
    // Output is a review artifact. Approval does not import or select a runtime version.
    write(required('output'), bundle);
    console.log(
      JSON.stringify({ signed: true, version: bundle.catalogue.catalogueVersion, sha256: bundle.manifest.sha256 }),
    );
  } else if (command === 'import') {
    const bundle = readJson(required('bundle'));
    const loaded = installBundle(
      required('store'),
      bundle.catalogue,
      bundle.manifest,
      fs.readFileSync(required('public-key')),
    );
    console.log(
      JSON.stringify({
        installed: true,
        selected: false,
        version: loaded.catalogue.catalogueVersion,
        sha256: loaded.sha256,
      }),
    );
  } else if (command === 'select' || command === 'rollback') {
    const expected = required('expected-current');
    const selected = selectVersion(required('store'), required('version'), fs.readFileSync(required('public-key')), {
      expectedCurrent: expected === 'none' ? null : expected,
      reason: required('reason'),
    });
    console.log(JSON.stringify(selected));
  } else if (command === 'inspect') {
    const loaded = loadCatalogue();
    console.log(
      JSON.stringify(
        {
          catalogueVersion: loaded.catalogue.catalogueVersion,
          sha256: loaded.sha256,
          entries: loaded.catalogue.entries.length,
          legacyProvenance: loaded.catalogue.entries.filter((e) => e.verificationState === 'legacy_record').length,
        },
        null,
        2,
      ),
    );
  } else
    throw Error('Command required: collect-nodejs | validate | diff | approve | import | select | rollback | inspect');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
