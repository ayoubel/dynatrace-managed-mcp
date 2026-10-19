import { auditManagedLifecycle } from '../lifecycle-audit.cjs';
import { buildLifecycleReport, combineLifecycleReports, lifecycleReferenceSnapshot } from '../lifecycle.cjs';
const now = Date.parse('2026-10-18T12:00:00Z'),
  env = { alias: 'synthetic', id: 'env-a', url: 'https://managed.example/e/a' };
const page = () =>
  new Map([
    [
      'synthetic',
      {
        totalCount: 1,
        entities: [{ entityId: 'HOST-A', lastSeenTms: now, properties: { osVersion: 'Ubuntu 22.04.5' } }],
      },
    ],
  ]);
test('autonomous audit stops launches after a stuck port, keeps prior evidence and cannot be mutated by a late response', async () => {
  let release: (value: any) => void = () => {};
  const getRuntimeInventory = jest
    .fn()
    .mockResolvedValueOnce(page())
    .mockImplementationOnce(() => new Promise((r) => (release = r)));
  const report = await auditManagedLifecycle({ getRuntimeInventory }, [env], {
    category: 'os',
    now,
    limits: { timeoutMs: 10 },
  });
  expect(getRuntimeInventory).toHaveBeenCalledTimes(2);
  expect(report.rows).toHaveLength(1);
  expect(report.collection).toMatchObject({ status: 'partial', stoppedBy: 'timeout' });
  expect(report.assessment.score).toBeNull();
  const before = JSON.stringify(report);
  release(page());
  await Promise.resolve();
  expect(JSON.stringify(report)).toBe(before);
});
test('global API budget preserves collected rows, exposes skipped inventories and never starts another port read', async () => {
  const getRuntimeInventory = jest.fn(async () => page());
  const r = await auditManagedLifecycle({ getRuntimeInventory }, [env], {
    category: 'os',
    now,
    limits: { maxApiCalls: 1 },
  });
  expect(getRuntimeInventory).toHaveBeenCalledTimes(1);
  expect(r.rows).toHaveLength(1);
  expect(r.inventories[1]).toMatchObject({ pages: 0, stopReason: 'api_budget', complete: false });
  expect(r.performance.apiCalls).toBe(1);
  expect(r.assessment.score).toBeNull();
});
test('global duration bounds a stuck request and stops all subsequent inventories', async () => {
  const getRuntimeInventory = jest.fn(() => new Promise(() => {}));
  const r = await auditManagedLifecycle({ getRuntimeInventory }, [env], {
    now,
    limits: { timeoutMs: 1000, maxDurationMs: 10 },
  });
  expect(getRuntimeInventory).toHaveBeenCalledTimes(1);
  expect(r.collection.stoppedBy).toBe('deadline');
  expect(r.inventories.every((i: any) => !i.complete)).toBe(true);
});
test('page cap and partial upstream inventory retain inspected subset without a global score', async () => {
  const getRuntimeInventory = jest.fn(
    async () => new Map([['synthetic', { ...page().get('synthetic'), nextPageKey: 'next', totalCount: 3 }]]),
  );
  const r = await auditManagedLifecycle({ getRuntimeInventory }, [env], {
    category: 'platform',
    now,
    limits: { maxPagesPerType: 1 },
  });
  expect(getRuntimeInventory).toHaveBeenCalledTimes(1);
  expect(r.inventories[0].stopReason).toBe('page_limit');
  expect(r.collection.status).toBe('partial');
  expect(r.assessment.score).toBeNull();
});
test.each([
  { maxApiCalls: 0 },
  { timeoutMs: NaN },
  { timeoutMs: 30001 },
  { maxPagesPerType: 11 },
  { maxDurationMs: -1 },
  { unknown: 1 },
])('invalid budget %p fails before any read', async (limits) => {
  const getRuntimeInventory = jest.fn();
  await expect(auditManagedLifecycle({ getRuntimeInventory }, [env], { limits })).rejects.toThrow(/limits/);
  expect(getRuntimeInventory).not.toHaveBeenCalled();
});
test('invalid category, duplicated environments and invalid clock fail before collection', async () => {
  const getRuntimeInventory = jest.fn();
  for (const [environments, options] of [
    [[env, env], {}],
    [[env], { category: 'saas' }],
    [[env], { now: Infinity }],
  ])
    await expect(auditManagedLifecycle({ getRuntimeInventory }, environments as any, options as any)).rejects.toThrow(
      /request/,
    );
  expect(getRuntimeInventory).not.toHaveBeenCalled();
});
test('empty scope is explicit, unavailable port messages stay sanitized, and oversized pages are rejected', async () => {
  const read = jest.fn(async () => page());
  const empty = await auditManagedLifecycle({ getRuntimeInventory: read }, [], { now });
  expect(read).not.toHaveBeenCalled();
  expect(empty.assessment.score).toBeNull();
  for (const getRuntimeInventory of [
    async () => {
      throw Error('private upstream token detail');
    },
    async () => new Map([['synthetic', { entities: Array(101).fill({ entityId: 'HOST-A' }) }]]),
  ]) {
    const r = await auditManagedLifecycle({ getRuntimeInventory }, [env], { category: 'platform', now });
    expect(r.assessment.score).toBeNull();
    expect(r.inventories[0].available).toBe(false);
    expect(JSON.stringify(r)).not.toContain('private upstream');
  }
});
test('reference snapshot identifies exact embedded policies without inventing a verification or an EOL date', () => {
  const snapshot = lifecycleReferenceSnapshot(now);
  expect(snapshot.liveVendorLookup).toBe(false);
  expect(snapshot.oldestVerifiedAt).toBe('2026-10-08');
  expect(snapshot.sha256).toMatch(/^[a-f0-9]{64}$/);
  const java = snapshot.entries.find((r: any) => r.product === 'Java');
  expect(java).toMatchObject({ endKind: 'minimum_availability', verifiedAt: '2026-10-08' });
  expect(
    lifecycleReferenceSnapshot(now + 100 * 86400000).entries.every((r: any) => r.reviewState === 'review_required'),
  ).toBe(true);
  const report = buildLifecycleReport([], [], { now });
  const combined = combineLifecycleReports(
    [{ ...report, referenceVerifiedAt: '2099-01-01', referenceSnapshot: { sha256: 'forged' } }],
    now,
  );
  expect(combined.referenceSnapshot).toEqual(snapshot);
  expect(combined.referenceVerifiedAt).toBe(snapshot.oldestVerifiedAt);
});
