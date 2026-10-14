import { metricWindows, summarizeMetricPoints, scopedMetricSeries } from '../investigation-engine/metric-analysis';
import { summarizeDiskSeries } from '../../capabilities/problem-investigation';
const step = 300000;
test('windows use complete bucket ends and baseline precedes the actual start of long incidents', () => {
  const start = 1770000000000;
  const windows = metricWindows({ status: 'CLOSED', startTime: start, endTime: start + 10800000 }, start + 10800000)!;
  expect(windows.incident).toEqual({ from: start + 3600000, to: start + 10800000 });
  expect(windows.baseline).toEqual({ from: start - 7200000, to: start });
  expect(windows.clipped).toBe(true);
  expect(metricWindows({ status: 'CLOSED', startTime: start + 1, endTime: start + 600000 }, start + 600000)).toBeNull();
  expect(metricWindows({ status: 'CLOSED', startTime: start, endTime: start + 600000 }, start)).toBeNull();
  expect(metricWindows({ status: 'OPEN', startTime: start, endTime: -1 }, start + 600000)?.incident.to).toBe(
    start + 600000,
  );
});
test('deterministic mean, count and sum respect (from,to] bucket timestamps', () => {
  const result = summarizeMetricPoints(
    [0, step, step * 2, step * 3],
    [99, 10, 30, 99],
    { from: 0, to: step * 2 },
    step,
    true,
  )!;
  expect(result).toMatchObject({
    mean: 20,
    sum: 40,
    count: 2,
    partial: false,
    first: { t: step, v: 10 },
    last: { t: step * 2, v: 30 },
  });
  expect(summarizeMetricPoints([step * 2, step], [30, 10], { from: 0, to: step * 2 }, step, true)).toEqual(result);
});
test.each([
  [
    [step, step * 2],
    [null, 3],
  ],
  [[step], [2]],
  [
    [step, step],
    [2, 3],
  ],
  [[step, step * 2], [2]],
  [
    [step, step * 2 + 1],
    [2, 3],
  ],
  [
    [step, step * 3],
    [2, 3],
  ],
  [
    [step, NaN, step * 2],
    [2, 3, 4],
  ],
])('missing, duplicate or irregular series are partial: %j', (ts, values) => {
  expect(summarizeMetricPoints(ts, values, { from: 0, to: step * 2 }, step, true)?.partial).toBe(true);
});
test('empty, overflowing and invalid bounds have no usable summary', () => {
  expect(summarizeMetricPoints([], [])).toBeNull();
  expect(summarizeMetricPoints([step], [Infinity])).toBeNull();
  expect(summarizeMetricPoints([step, step * 2], [Number.MAX_VALUE, Number.MAX_VALUE])).toBeNull();
  expect(summarizeMetricPoints([step], [1], { from: 1, to: 0 })).toBeNull();
});
test('exact metric and entity are required; resolution, pagination and API ratios qualify coverage', () => {
  const data = {
    resolution: '5m',
    result: [
      {
        metricId: 'metric:avg',
        dataPointCountRatio: 1,
        data: [{ dimensionMap: { entity: 'S' }, timestamps: [step, step * 2], values: [1, 2] }],
      },
    ],
  };
  const read = (v: any) => scopedMetricSeries(v, { entity: 'S' }, 'metric', 'avg', { from: 0, to: step * 2 }, true);
  expect(read(data)?.partial).toBe(false);
  expect(read({ ...data, resolution: '10m' })?.partial).toBe(true);
  expect(read({ ...data, nextPageKey: 'next' })?.partial).toBe(true);
  expect(read({ ...data, result: [{ ...data.result[0], dimensionCountRatio: 0.5 }] })?.partial).toBe(false);
  expect(read({ ...data, result: [{ ...data.result[0], dimensionCountRatio: 1.1 }] })?.partial).toBe(true);
  expect(read({ ...data, result: [{ ...data.result[0], dimensionCountRatio: -1 }] })?.partial).toBe(true);
  expect(read({ ...data, result: [data.result[0], data.result[0]] })).toBeNull();
  expect(read({ ...data, result: [{ ...data.result[0], metricId: 'other' }] })).toBeNull();
  expect(read({ ...data, result: [{ ...data.result[0], dataPointCountRatio: '1' }] })?.partial).toBe(true);
  expect(
    read({
      ...data,
      result: [
        { ...data.result[0], data: [{ ...data.result[0].data[0], dimensionMap: { entity: 'S', endpoint: 'one' } }] },
      ],
    })?.partial,
  ).toBe(true);
});

test('disk wrapper preserves legacy summaries and qualifies complete bounded avg buckets', () => {
  const host = 'HOST-1111111111111111',
    disk = 'DISK-2222222222222222';
  const data = {
    resolution: '5m',
    result: [
      {
        metricId: 'builtin:host.disk.used:avg',
        data: [
          {
            dimensionMap: { 'dt.entity.host': host, 'dt.entity.disk': disk },
            timestamps: [0, step, step * 2],
            values: [999, 10, 20],
          },
        ],
      },
    ],
  };
  expect(summarizeDiskSeries(data, host, disk)).toMatchObject({ count: 3, max: 999 });
  expect(summarizeDiskSeries(data, host, disk, { from: 0, to: step * 2 }, 'builtin:host.disk.used')).toMatchObject({
    count: 2,
    min: 10,
    max: 20,
    partial: false,
  });
  expect(summarizeDiskSeries(data, host, disk, { from: 0, to: step * 3 }, 'builtin:host.disk.used')?.partial).toBe(
    true,
  );
  expect(summarizeDiskSeries(data, host, disk, { from: 0, to: step * 2 }, 'other')).toBeNull();
  const filtered = {
    ...data,
    result: [
      {
        ...data.result[0],
        metricId: `builtin:host.disk.used:filter(eq("dt.entity.disk",${disk}),eq("dt.entity.host",${host})):avg`,
      },
    ],
  };
  expect(summarizeDiskSeries(filtered, host, disk, { from: 0, to: step * 2 }, 'builtin:host.disk.used')?.partial).toBe(
    false,
  );
});
