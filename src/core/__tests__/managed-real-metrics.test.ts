import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scopedMetricSeries } from '../investigation-engine/metric-analysis';

/** Sanitized Managed shape: synthetic values/IDs and shifted timestamps. */
const captured = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/managed-metrics-sanitized.json'), 'utf8'));
const windows = captured.windows;
const service = 'SERVICE-0000000000000001';

test.each([
  ['builtin:service.response.time', 'avg'],
  ['builtin:service.errors.server.rate', 'avg'],
  ['builtin:service.requestCount.total', 'value'],
])('real complete %s series is not rejected because query budget ratios are small', (metricId, aggregation) => {
  const result = captured.result.find((r: any) => r.metricId === metricId + ':' + aggregation);
  expect(result.dataPointCountRatio).toBeGreaterThan(0);
  expect(result.dataPointCountRatio).toBeLessThan(1);
  const summary = scopedMetricSeries(
    captured,
    { 'dt.entity.service': service },
    metricId,
    aggregation,
    windows.observation,
    true,
  )!;
  expect(summary).toMatchObject({ count: 6, expectedCount: 6, partial: false, gaps: false, truncated: false });
});

test('actual missing bucket and paginated capture remain partial despite valid small budget ratios', () => {
  const missing = structuredClone(captured);
  const row = missing.result[0].data.find((s: any) => s.dimensionMap['dt.entity.service'] === service);
  const index = row.timestamps.findIndex((t: number) => t > windows.observation.from && t <= windows.observation.to);
  row.timestamps.splice(index, 1);
  row.values.splice(index, 1);
  const read = (data: any) =>
    scopedMetricSeries(
      data,
      { 'dt.entity.service': service },
      'builtin:service.response.time',
      'avg',
      windows.observation,
      true,
    );
  expect(read(missing)).toMatchObject({ count: 5, partial: true, gaps: true });
  expect(read({ ...captured, nextPageKey: 'derived-test-page' })?.partial).toBe(true);
});
