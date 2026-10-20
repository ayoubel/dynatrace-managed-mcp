// Operator-invoked offline review/import/selection. Never imported by a collector.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateCatalogue, canonical, digest, verifyBundle, readJson, versionPattern } = require('./catalogue.cjs');
function approveCandidate(candidate, { reviewedBy, expectedSha256, privateKey, evidenceRoot, now = Date.now() } = {}) {
  if (digest(candidate) !== expectedSha256) throw Error('Candidate changed since review');
  const catalogue = validateCatalogue(candidate, { approved: false });
  if (typeof reviewedBy !== 'string' || !reviewedBy.trim() || !privateKey)
    throw Error('Explicit reviewer and signing key required');
  const at = new Date(now).toISOString();
  for (const source of catalogue.sources.filter((s) => s.evidenceState === 'archived')) {
    if (!evidenceRoot || !source.localEvidencePath || !/^[a-f0-9]{64}\.txt$/.test(source.localEvidencePath))
      throw Error('Archived source bytes required for review');
    const content = fs.readFileSync(path.join(evidenceRoot, source.localEvidencePath));
    if (crypto.createHash('sha256').update(content).digest('hex') !== source.contentSha256)
      throw Error('Source evidence integrity mismatch');
  }
  catalogue.review = { ...catalogue.review, state: 'approved', reviewedBy, reviewedAt: at };
  catalogue.publishedAt = at;
  for (const entry of catalogue.entries)
    if (entry.verificationState === 'pending') {
      entry.verifiedAt = at;
      entry.verificationState = 'verified';
    }
  validateCatalogue(catalogue);
  const key = crypto.createPrivateKey(privateKey);
  if (key.asymmetricKeyType !== 'ed25519') throw Error('Ed25519 signing key required');
  const manifest = {
    catalogueVersion: catalogue.catalogueVersion,
    sha256: digest(catalogue),
    signature: crypto.sign(null, Buffer.from(canonical(catalogue)), key).toString('base64'),
  };
  return { catalogue, manifest };
}
function installBundle(root, catalogue, manifest, trustedPublicKey) {
  const loaded = verifyBundle(catalogue, manifest, trustedPublicKey);
  if (!trustedPublicKey) throw Error('Operator-trusted public key required');
  const versions = path.join(root, 'versions'),
    target = path.join(versions, catalogue.catalogueVersion);
  fs.mkdirSync(versions, { recursive: true, mode: 0o700 });
  if (fs.existsSync(target)) {
    const existing = verifyBundle(
      readJson(path.join(target, 'catalogue.json')),
      readJson(path.join(target, 'manifest.json')),
      trustedPublicKey,
    );
    if (existing.sha256 !== loaded.sha256) throw Error('Catalogue version already exists with different content');
    return loaded;
  }
  const staged = fs.mkdtempSync(path.join(versions, '.incoming-'));
  try {
    fs.writeFileSync(path.join(staged, 'catalogue.json'), canonical(catalogue) + '\n', { flag: 'wx', mode: 0o444 });
    fs.writeFileSync(path.join(staged, 'manifest.json'), JSON.stringify(manifest) + '\n', { flag: 'wx', mode: 0o444 });
    fs.renameSync(staged, target);
  } catch (error) {
    fs.rmSync(staged, { recursive: true, force: true });
    throw error;
  }
  return loaded;
}
function selectVersion(root, version, trustedPublicKey, { expectedCurrent = null, reason, now = Date.now() } = {}) {
  if (!versionPattern.test(version) || !trustedPublicKey || !reason?.trim())
    throw Error('Version, trusted key and selection reason required');
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const lock = path.join(root, 'selection.lock');
  const fd = fs.openSync(lock, 'wx', 0o600); // No concurrent selector can overwrite a decision.
  let temporary;
  try {
    const currentFile = path.join(root, 'current.json');
    const previous = fs.existsSync(currentFile) ? readJson(currentFile) : null;
    if ((previous?.sha256 || null) !== expectedCurrent) throw Error('Selected catalogue changed since review');
    const dir = path.join(root, 'versions', version);
    const loaded = verifyBundle(
      readJson(path.join(dir, 'catalogue.json')),
      readJson(path.join(dir, 'manifest.json')),
      trustedPublicKey,
    );
    const next = { catalogueVersion: version, sha256: loaded.sha256 };
    const history = path.join(root, 'history');
    fs.mkdirSync(history, { recursive: true, mode: 0o700 });
    // The journal records intent; the selected current.json remains the authority if interrupted.
    fs.writeFileSync(
      path.join(history, crypto.randomUUID() + '.json'),
      JSON.stringify({ previous, next, reason, at: new Date(now).toISOString() }) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    temporary = currentFile + '.' + crypto.randomUUID() + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(next) + '\n', { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, currentFile);
    return next;
  } finally {
    if (temporary && fs.existsSync(temporary)) fs.unlinkSync(temporary);
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}
module.exports = { approveCandidate, installBundle, selectVersion };
