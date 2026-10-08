import { auditManagedLifecycle } from '../lifecycle-audit.cjs';
import { softwareInventory, buildLifecycleReport, combineLifecycleReports } from '../lifecycle.cjs';

const now = Date.parse('2026-10-08T12:00:00Z');
const env = { alias: 'prod', id: 'env-a', url: 'https://managed.example/e/a' };
const instance = (properties: Record<string, unknown>, id = 'PROCESS_GROUP_INSTANCE-A') => ({
  entityId: id,
  type: 'PROCESS_GROUP_INSTANCE',
  environmentId: 'env-a',
  details: { entityId: id, lastSeenTms: now, properties },
});

test('entity profiles expose sibling technologies without attributing Nginx version to containerd or inflating assessment', () => {
  const entity = instance({
    processType: 'NGINX',
    softwareTechnologies: [
      { type: 'NGINX', version: 'nginx/1.24.0' },
      { type: 'LIBC', edition: 'musl', version: '1.2.3' },
      { type: 'CONTAINERD' },
    ],
  });
  const report = buildLifecycleReport([entity], [{ available: true, complete: true }], { now, category: 'runtime' });
  expect(report.assessment.total).toBe(3);
  expect(report.entityProfiles).toHaveLength(1);
  expect(report.entityProfiles[0].assessment).toMatchObject({
    status: 'unknown',
    evaluated: 0,
    total: 3,
    versionsKnown: 2,
  });
  expect(report.entityProfiles[0]).toMatchObject({ entityType: 'PROCESS_GROUP_INSTANCE', primaryTechnology: 'NGINX' });
  expect(report.entityProfiles[0].technologies.find((t: any) => t.product === 'NGINX').version).toBe('1.24.0');
  expect(report.entityProfiles[0].technologies.find((t: any) => t.product === 'containerd').version).toBeNull();
  expect(report.campaigns.find((c: any) => c.product === 'containerd')).toMatchObject({
    assets: 1,
    auditGroup: 'runtimes',
    entityLabel: 'instances de processus',
  });
  const combined = combineLifecycleReports([report], now);
  expect(combined.entityProfiles[0].technologies).toHaveLength(3);
  expect(combined.campaigns.find((c: any) => c.product === 'NGINX').auditGroup).toBe('technologies');
  expect(combined.campaigns.find((c: any) => c.product === 'containerd').auditGroup).toBe('runtimes');
});

test('process verdict preserves a known obsolete technology alongside unknown siblings', () => {
  const entity = instance({ softwareTechnologies: [{ type: 'GO', version: '1.20.6' }, { type: 'CONTAINERD' }] });
  const report = buildLifecycleReport([entity], [], { now, category: 'runtime' });
  expect(report.entityProfiles[0].assessment).toMatchObject({ status: 'action', evaluated: 1, total: 2, unknown: 1 });
  expect(report.entityProfiles[0].technologies.find((t: any) => t.product === 'containerd').status).toBe('unknown');
});

test('future observations retain version evidence and expose clock discrepancy separately from missing versions', () => {
  const entity = instance({ softwareTechnologies: [{ type: 'PHP', version: '8.1.20' }] });
  entity.details.lastSeenTms = now + 26 * 60000;
  const inventories = [{ available: true, complete: true }];
  const report = buildLifecycleReport([entity], inventories, { now, category: 'runtime' });
  expect(report.rows[0]).toMatchObject({ version: '8.1.20', status: 'unknown', qualification: 'clock_skew' });
  expect(report.assessment).toMatchObject({ clockSkew: 1, score: null, evaluated: 0 });
  expect(report.assessment.reason).toContain('Horloges');
  expect(report.campaigns[0].action).toContain('horloges');
  const refreshed = buildLifecycleReport([entity], inventories, { now: now + 27 * 60000, category: 'runtime' });
  expect(refreshed.rows[0].status).toBe('action');
  const combined = combineLifecycleReports([report], now);
  expect(combined.rows[0].qualification).toBe('clock_skew');
});

test('freshness follows bounded API response timing without refreshing stale observations', () => {
  const entity = instance({ softwareTechnologies: [{ type: 'PHP', version: '8.1.20' }] });
  const offset = 12 * 60000;
  const withClock = {
    ...entity,
    details: {
      ...entity.details,
      lastSeenTms: now + offset,
      responseTiming: { requestedAt: now - 100, receivedAt: now, serverAt: now + offset },
    },
  };
  const inventories = [{ available: true, complete: true }];
  const report = buildLifecycleReport([withClock], inventories, { now, category: 'runtime' });
  expect(report.rows[0]).toMatchObject({
    status: 'action',
    observedAt: now + offset,
    observationClockOffsetMs: offset,
  });
  expect(report.assessment).toMatchObject({ score: 0, clockSkew: 0, responseClockOffsetsMinutes: [12] });
  expect(combineLifecycleReports([report], now).assessment.score).toBe(0);
  withClock.details.lastSeenTms = now + offset - 25 * 3600000;
  expect(buildLifecycleReport([withClock], inventories, { now }).rows[0].qualification).toBe('observation_stale');
  withClock.details.lastSeenTms = now + 2 * 3600000;
  withClock.details.responseTiming.serverAt = now + 2 * 3600000;
  expect(buildLifecycleReport([withClock], inventories, { now }).rows[0].qualification).toBe('clock_skew');
});

test('runtime evidence uses matching JVM field, preserves raw versions and does not substitute release, image, module or agent versions', () => {
  const rows = softwareInventory(
    instance({
      processType: 'JAVA',
      jvmClrVersion: '21.0.5',
      jvmVendor: 'Eclipse Adoptium',
      softwareTechnologies: [{ type: 'JAVA', edition: 'Adoptium' }],
    }),
  );
  expect(rows[0]).toMatchObject({
    product: 'Java',
    version: '21.0.5',
    field: 'jvmClrVersion',
    edition: 'Eclipse Adoptium',
  });
  const missing = softwareInventory(
    instance({
      processType: 'PYTHON',
      installerVersion: '1.345',
      releasesVersion: '3.12',
      containerImageName: 'python:3.12',
      versionedModules: [{ name: 'python', version: '3.12' }],
    }),
  );
  expect(missing[0].version).toBeNull();
  expect(
    softwareInventory(instance({ softwareTechnologies: [{ type: 'NGINX', version: 'nginx/1.24.0' }] }))[0],
  ).toMatchObject({ version: '1.24.0', rawVersion: 'nginx/1.24.0' });
});

test('known/missing duplicate detections and known edition aliases do not inflate unknown counts', () => {
  const rows = softwareInventory(
    instance({
      softwareTechnologies: [
        { type: 'JAVA', edition: 'Adoptium' },
        { type: 'JAVA', edition: 'Eclipse Adoptium', version: '21.0.5' },
        { type: 'PHP', version: '8.1.20' },
        { type: 'PHP', edition: 'FPM', version: '8.1.20' },
      ],
    }),
  );
  expect(rows).toHaveLength(2);
});

test('version missing, reference missing, vendor context and failed collection have distinct reasons', () => {
  const report = buildLifecycleReport(
    [
      instance({
        softwareTechnologies: [
          { type: 'PYTHON' },
          { type: 'UNKNOWN', version: '2.3' },
          { type: 'JAVA', version: '21.0.5' },
        ],
      }),
    ],
    [],
    { now, category: 'runtime' },
  );
  expect(report.rows.map((r: any) => r.qualification).sort()).toEqual([
    'reference_missing',
    'support_context',
    'version_missing',
  ]);
});

test('collector follows pagination, retrieves group evidence and never attributes group version to an instance', async () => {
  const getRuntimeInventory = jest.fn(
    async (_alias: string, type: string, _size: number, cursor?: string) =>
      new Map([
        [
          'prod',
          type === 'PROCESS_GROUP'
            ? {
                totalCount: 1,
                entities: [
                  {
                    entityId: 'PROCESS_GROUP-G',
                    lastSeenTms: now,
                    properties: { softwareTechnologies: [{ type: 'PYTHON', version: '3.12.1' }] },
                  },
                ],
              }
            : cursor
              ? {
                  totalCount: 2,
                  entities: [
                    {
                      entityId: 'PROCESS_GROUP_INSTANCE-B',
                      lastSeenTms: now,
                      properties: { softwareTechnologies: [{ type: 'PHP', version: '8.1.20' }] },
                    },
                  ],
                }
              : {
                  totalCount: 2,
                  nextPageKey: 'next',
                  entities: [
                    {
                      entityId: 'PROCESS_GROUP_INSTANCE-A',
                      lastSeenTms: now,
                      fromRelationships: { isInstanceOf: [{ id: 'PROCESS_GROUP-G', type: 'PROCESS_GROUP' }] },
                      properties: { softwareTechnologies: [{ type: 'PYTHON' }] },
                    },
                  ],
                },
        ],
      ]),
  );
  const report = await auditManagedLifecycle({ getRuntimeInventory }, [env], { category: 'runtime', now });
  expect(getRuntimeInventory).toHaveBeenCalledTimes(3);
  expect(getRuntimeInventory.mock.calls[0].slice(4)).toEqual(['now-24h', 'now']);
  expect(report.inventories.every((i: any) => i.complete)).toBe(true);
  const python = report.rows.find((r: any) => r.product === 'Python');
  expect(python?.version).toBeNull();
  expect(python?.relatedEvidence[0]).toMatchObject({ version: '3.12.1', entityId: 'PROCESS_GROUP-G' });
  expect(report.rows.find((r: any) => r.product === 'PHP')?.status).toBe('action');
});

test('failed page and repeated cursor preserve inspected subset and suppress global score', async () => {
  const client = {
    getRuntimeInventory: jest.fn(
      async () =>
        new Map([
          [
            'prod',
            {
              totalCount: 2,
              nextPageKey: 'loop',
              entities: [{ entityId: 'HOST-A', lastSeenTms: now, properties: { osVersion: 'Ubuntu 22.04.5' } }],
            },
          ],
        ]),
    ),
  };
  const report = await auditManagedLifecycle(client, [env], { category: 'os', now });
  expect(report.assessment.score).toBeNull();
  expect(report.inventories[0].inspected).toBe(1);
  expect(report.inventories[0].complete).toBe(false);
  expect(client.getRuntimeInventory.mock.calls.length).toBeLessThan(10);
});

test('multiple environments remain isolated and aggregation rejects incompatible audit policies', () => {
  const make = (id: string) => ({
    ...buildLifecycleReport(
      [{ ...instance({ softwareTechnologies: [{ type: 'PHP', version: '8.2.1' }] }), environmentId: id }],
      [{ environmentId: id, available: true, complete: true }],
      { now, category: 'runtime' },
    ),
    version: 3,
    referenceVerifiedAt: '2026-10-08',
    limitations: [],
  });
  const a = make('a'),
    b = make('b');
  expect(combineLifecycleReports([a, b], now).rows).toHaveLength(2);
  expect(combineLifecycleReports([a, a], now).rows).toHaveLength(1);
  expect(() => combineLifecycleReports([a, { ...b, anticipationDays: 365 }], now)).toThrow(/policies/);
});

test('Java availability is vendor-scoped, legacy Java 8 is normalized, minimum availability is never a fabricated EOL', () => {
  const entity = instance({ softwareTechnologies: [{ type: 'JAVA', edition: 'Adoptium', version: '1.8.0_422' }] });
  const report = buildLifecycleReport([entity], [], { now, category: 'runtime' });
  expect(report.rows[0]).toMatchObject({ cycle: '8', status: 'ok' });
  expect(report.campaigns[0].end).toBe('Au moins 2030-12');
  const future = buildLifecycleReport(
    [{ ...entity, details: { ...entity.details, lastSeenTms: Date.parse('2031-01-02') } }],
    [],
    { now: Date.parse('2031-01-02'), category: 'runtime' },
  );
  expect(future.rows[0].status).toBe('unknown');
});

test('combination recalculates verdicts instead of trusting caller scores and rejects stale audit snapshots', () => {
  const base = {
    ...buildLifecycleReport(
      [instance({ softwareTechnologies: [{ type: 'PHP', version: '8.1.20' }] })],
      [{ available: true, complete: true }],
      { now, category: 'runtime' },
    ),
    version: 3,
    referenceVerifiedAt: '2026-10-08',
    limitations: [],
  };
  const forged = { ...base, rows: base.rows.map((r: any) => ({ ...r, status: 'ok' })), assessment: { score: 100 } };
  expect(combineLifecycleReports([forged], now).assessment.score).toBe(0);
  expect(() => combineLifecycleReports([base], now + 300001)).toThrow(/stale/);
});
