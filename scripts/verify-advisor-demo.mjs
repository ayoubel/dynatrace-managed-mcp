import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { launchDemo, until } from './advisor-demo-runtime.mjs';
const require = createRequire(import.meta.url),
  option = (name) => {
    const i = process.argv.indexOf(name);
    return i < 0 ? undefined : process.argv[i + 1];
  };
const result = {
  status: 'RUNNING',
  synthetic: true,
  checks: [],
  limits: [
    'Managed HTTP port is synthetic; production tools and collector execute unchanged',
    'Calendar frozen at 2026-10-19; reference-stale case adds 110 days',
    'Embedded references are not refreshed from vendors',
    'Headless Chrome; no professional Managed compatibility certification',
  ],
};
const check = (id, detail) => {
  result.checks.push({ id, status: 'PASS', detail });
  console.log('PASS ' + id);
};
let runtime, context, page;
try {
  runtime = await launchDemo({ gatewayRoot: option('--gateway-root'), output: option('--output') });
  result.dir = runtime.dir;
  await fs.mkdir(runtime.dir + '/exports');
  await fs.mkdir(runtime.dir + '/screenshots');
  assert.equal((await runtime.get('/api/status')).hasSnapshot, false);
  const catalog = (await runtime.get('/api/environments')).environments;
  assert.equal(catalog.length, 2);
  const first = catalog.find((e) => e.url.endsWith('/first')),
    second = catalog.find((e) => e.url.endsWith('/second'));
  assert.ok(first && second);
  const done = async (id) => {
    const job = await until(async () => {
      const j = await runtime.get('/api/workbench/' + id);
      return !['running', 'executing'].includes(j.status) && j;
    }, 60000);
    await until(async () => !(await runtime.get('/api/workbench')).running);
    assert.equal(job.status, 'completed', JSON.stringify(job));
    return job;
  };
  const start = async (input = {}) => {
    const response = await runtime.post('/api/workbench/start', { kind: 'audit', input });
    assert.equal(response.status, 202, await response.clone().text());
    return done((await response.json()).id);
  };
  check('A01 standalone discovery without health snapshot', { environments: catalog.map((e) => e.id) });
  const jobs = {};
  for (const mode of [
    'RICH',
    'POOR',
    'MISSING_REFERENCE',
    'REFERENCE_STALE',
    'FUTURE_OBSERVATION',
    'OBSERVATION_STALE',
    'HTTP_CLOCK_SKEW',
    'PAGINATED',
    'PARTIAL',
    'API_FAILURE',
    'TIMEOUT',
  ]) {
    await runtime.control({ mode });
    const job = await start({ environmentId: first.id, category: 'all', anticipationDays: 180 }),
      r = job.result;
    jobs[mode] = job;
    assert.equal(r.version, 3);
    if (mode === 'TIMEOUT') assert.equal(r.rows.length, 0);
    else assert.ok(r.rows.length);
    assert.ok(r.rows.every((row) => row.environmentId === first.id));
    assert.match(r.referenceSnapshot.sha256, /^[a-f0-9]{64}$/);
    assert.equal(r.referenceSnapshot.liveVendorLookup, false);
    if (mode !== 'TIMEOUT') assert.ok(r.rows.some((row) => row.status === 'unknown'));
    if (mode === 'RICH') {
      assert.ok(r.rows.some((row) => row.status === 'action'));
      assert.ok(r.rows.some((row) => row.status === 'ok'));
      assert.ok(r.campaigns.length >= 4);
      assert.equal(r.assessment.inventoryComplete, true);
      assert.notEqual(r.assessment.score, null);
      assert.ok(r.rows.some((row) => row.reference?.endKind === 'minimum_availability'));
      assert.ok(r.entityProfiles.length);
    }
    if (mode === 'POOR') {
      assert.equal(r.assessment.score, null);
      assert.ok(r.rows.some((row) => !row.version));
    }
    if (mode === 'MISSING_REFERENCE')
      assert.ok(r.rows.some((row) => row.version === '999.1.0' && row.status === 'unknown'));
    if (mode === 'REFERENCE_STALE') {
      assert.ok(r.referenceSnapshot.entries.every((e) => e.reviewState === 'review_required'));
      assert.equal(r.assessment.score, null);
      assert.ok(!r.rows.some((row) => row.status === 'ok'));
    }
    const expectedAt = new Date(
      Date.parse('2026-10-19T12:00:00Z') + (mode === 'REFERENCE_STALE' ? 110 * 86400000 : 0),
    ).toISOString();
    assert.equal(r.evaluatedAt, expectedAt);
    assert.equal(r.referenceSnapshot.evaluatedAt, expectedAt);
    assert.ok(r.trace.length);
    assert.ok(r.trace.every((entry) => entry.at === expectedAt));
    assert.ok(r.rows.every((row) => row.collectedAt === expectedAt));
    if (['FUTURE_OBSERVATION', 'OBSERVATION_STALE'].includes(mode)) {
      const qualified = r.rows.filter((row) => row.version && row.reference);
      assert.ok(qualified.length);
      assert.ok(
        qualified.every(
          (row) =>
            row.status === 'unknown' &&
            row.qualification === (mode === 'FUTURE_OBSERVATION' ? 'clock_skew' : 'observation_stale'),
        ),
      );
      assert.equal(r.assessment.score, null);
    }
    if (mode === 'HTTP_CLOCK_SKEW') {
      assert.deepEqual(r.assessment.responseClockOffsetsMinutes, [12]);
      assert.equal(r.assessment.clockSkew, 0);
      assert.equal(r.assessment.score, jobs.RICH.result.assessment.score);
      assert.ok(r.rows.some((row) => row.observationClockOffsetMs === 12 * 60000));
    }
    if (mode === 'PAGINATED') assert.ok(r.inventories.some((i) => i.pages > 1));
    if (['PARTIAL', 'API_FAILURE', 'TIMEOUT'].includes(mode)) {
      assert.equal(r.assessment.inventoryComplete, false);
      assert.equal(r.assessment.score, null);
      assert.ok(r.inventories.some((i) => !i.complete));
    }
    if (mode === 'TIMEOUT') {
      assert.equal(r.collection.stoppedBy, 'timeout');
      assert.equal(r.trace.length, 1);
    }
    assert.ok(!JSON.stringify(job).includes('private upstream detail'));
    for (const format of ['json', 'md', 'html']) {
      const response = await fetch(runtime.origin + '/api/workbench/' + job.id + '/' + format);
      assert.equal(response.status, 200);
      const content = await response.text();
      assert.ok(content.includes(r.referenceSnapshot.sha256));
      if (format === 'json') assert.deepEqual(JSON.parse(content).result, r);
      else assert.ok(content.includes(expectedAt), 'Export must preserve the Core evaluation timestamp');
      if (format !== 'json') assert.ok(content.includes('Disponibilité au moins'));
      await fs.writeFile(runtime.dir + '/exports/' + mode + '.' + format, content);
    }
    check('A-' + mode, {
      job: job.id,
      rows: r.rows.length,
      campaigns: r.campaigns.length,
      assessment: r.assessment,
      collection: r.collection,
    });
  }
  await runtime.control({ mode: 'RICH' });
  const multi = await start({ category: 'all', anticipationDays: 365 });
  assert.ok(multi.result.rows.some((r) => r.environmentId === second.id));
  assert.ok(multi.result.rows.some((r) => r.environmentId === first.id));
  assert.equal(multi.result.referenceSnapshot.sha256, jobs.RICH.result.referenceSnapshot.sha256);
  assert.equal(multi.result.collection.sources.length, 2);
  check('A02 real MCP combination across two servers', { job: multi.id });
  for (const input of [{ environmentId: 'outside' }, { category: 'invented' }, { anticipationDays: 0 }]) {
    const r = await runtime.post('/api/workbench/start', { kind: 'audit', input });
    assert.equal(r.status, 400);
  }
  check('A03 invalid scope/category/horizon rejected');
  const { chromium } = require(option('--playwright') || 'playwright');
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'daybreak-advisor-chrome-'));
  result.profile = profile;
  context = await chromium.launchPersistentContext(profile, {
    executablePath: option('--chrome'),
    headless: true,
    acceptDownloads: true,
    args: [
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-sync',
      '--no-first-run',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
    ],
  });
  const blocked = [];
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.origin === runtime.origin || ['data:', 'about:', 'blob:'].includes(u.protocol)) return route.continue();
    blocked.push(u.origin);
    return route.abort();
  });
  page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(runtime.origin);
  await page.locator('[data-view="obsolescence"]').click();
  await page.waitForSelector('#audit-category');
  await page.selectOption('#audit-environment', first.id);
  await page.selectOption('#audit-category', 'all');
  await page.selectOption('#audit-horizon', '180');
  await runtime.control({ mode: 'RICH', delay: true });
  const launch = page.waitForResponse(
    (r) => r.url().endsWith('/api/workbench/start') && r.request().method() === 'POST',
  );
  await page.locator('[data-start-audit]').click();
  const response = await launch;
  assert.equal(response.status(), 202);
  const uiJob = await done((await response.json()).id);
  await runtime.control({ mode: 'RICH' });
  await page.waitForSelector('#audit-reference-snapshot');
  await page.waitForFunction(() => !!document.querySelector('[data-start-audit]:not([disabled])'));
  assert.equal((await runtime.get('/api/status')).hasSnapshot, false);
  check('W01 actual autonomous Web launch with no health snapshot', { job: uiJob.id });
  await page.screenshot({ path: runtime.dir + '/screenshots/advisor-overview.png', fullPage: true });
  await page.locator('#audit-reference-snapshot summary').click();
  assert.ok(
    (await page.locator('#audit-reference-snapshot').innerText()).includes(uiJob.result.referenceSnapshot.sha256),
  );
  await page.screenshot({ path: runtime.dir + '/screenshots/advisor-references.png', fullPage: true });
  await page.locator('#audit-reference-snapshot summary').click();
  check('W02 reference identity, precision and primary source provenance');
  await page.locator('.audit-status-filters [data-audit-filter="action"]').click();
  assert.ok(await page.locator('[data-audit-campaign]').count());
  await page.locator('[data-audit-campaign]').first().click();
  await page.locator('[data-audit-entity]').first().click();
  await page.waitForSelector('#audit-process-title');
  await page.screenshot({ path: runtime.dir + '/screenshots/advisor-entity.png', fullPage: true });
  await page.locator('[data-audit-back]').click();
  check('W03 priority campaign to entity evidence and back');
  await page.locator('#audit-search').fill('nonexistent-synthetic');
  await page.waitForFunction(() => !document.querySelector('[data-audit-campaign]'));
  await page.locator('[data-audit-reset]').click();
  assert.ok(await page.locator('[data-audit-campaign]').count());
  check('W04 search, filters and reset');
  await page.locator('.audit-export summary').click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Markdown ↓', exact: true }).click();
  const download = await downloadEvent;
  await download.saveAs(runtime.dir + '/exports/Web-UI.md');
  assert.ok(
    (await fs.readFile(runtime.dir + '/exports/Web-UI.md', 'utf8')).includes(uiJob.result.referenceSnapshot.sha256),
  );
  check('W05 actual Markdown download');
  await page.reload();
  await page.locator('[data-view="obsolescence"]').click();
  await page.waitForSelector('#audit-reference-snapshot');
  assert.ok(
    (await page.locator('#operation-result').innerText()).includes(uiJob.result.referenceSnapshot.sha256.slice(0, 12)),
  );
  check('W06 persisted report and scoped history');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: runtime.dir + '/screenshots/advisor-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  check('W07 mobile width without overflow');
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  check('W08 no JavaScript errors or external browser requests');
  const audit = await runtime.audit();
  assert.ok(audit.some((a) => a.tool === 'dynatrace_managed_combine_obsolescence_audits'));
  assert.ok(audit.filter((a) => a.tool).every((a) => a.tool.includes('obsolescence')));
  result.auditEntries = audit.length;
  check('A04 production read-only tools, synthetic HTTP port and outbound network guard');
  result.status = 'PASS';
} catch (e) {
  result.status = 'FAIL';
  result.error = e.stack;
  console.error(e.stack);
  process.exitCode = 1;
  if (page && runtime)
    await page.screenshot({ path: runtime.dir + '/screenshots/failure.png', fullPage: true }).catch(() => {});
} finally {
  await context?.close();
  await runtime?.stop();
  const file = runtime
    ? runtime.dir + '/acceptance.json'
    : path.resolve(option('--output') || os.tmpdir(), 'advisor-start-failure.json');
  await fs.writeFile(file, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: result.status, checks: result.checks.length, results: file }));
}
