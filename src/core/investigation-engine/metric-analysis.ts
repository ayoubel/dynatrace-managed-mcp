export const METRIC_STEP_MS = 300000;
export interface MetricWindow {
  from: number;
  to: number;
}
export interface MetricPoint {
  t: number;
  v: number;
}

/** Managed timestamps mark bucket ends: retain only complete buckets in (from, to]. */
export function metricWindows(problem: any, now: number) {
  const start = problem.startTime;
  const end = problem.status === 'OPEN' ? now : problem.status === 'CLOSED' ? problem.endTime : NaN;
  if (![start, end, now].every(Number.isFinite) || start < 0 || end <= start || end > now) return null;
  const to = Math.floor(end / METRIC_STEP_MS) * METRIC_STEP_MS;
  const from = Math.ceil(Math.max(start, to - 7200000) / METRIC_STEP_MS) * METRIC_STEP_MS;
  const duration = to - from;
  const baselineTo = Math.floor(start / METRIC_STEP_MS) * METRIC_STEP_MS;
  if (duration < 2 * METRIC_STEP_MS || baselineTo < duration) return null;
  return {
    incident: { from, to },
    baseline: { from: baselineTo - duration, to: baselineTo },
    clipped: from > start || to < end,
    basis: 'complete-5m-buckets; baseline-before-problem-start',
  };
}

/** Pure calculation. Incomplete data stays descriptive and never qualifies a comparison. */
export function summarizeMetricPoints(
  timestamps: unknown,
  values: unknown,
  window?: MetricWindow,
  step = METRIC_STEP_MS,
  strictBuckets = false,
) {
  if (!Array.isArray(timestamps) || !Array.isArray(values) || !Number.isFinite(step) || step <= 0) return null;
  if (window && (![window.from, window.to].every(Number.isFinite) || window.to <= window.from)) return null;
  let invalid = timestamps.length !== values.length;
  const points: MetricPoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i],
      v = values[i];
    if (!Number.isSafeInteger(t) || t < 0) {
      invalid = true;
      continue;
    }
    if (window && (t <= window.from || t > window.to)) continue;
    if (!Number.isFinite(v)) {
      invalid = true;
      continue;
    }
    points.push({ t, v });
  }
  if (!points.length) return null;
  points.sort((a, b) => a.t - b.t || a.v - b.v);
  const duplicate = points.some((p, i) => i > 0 && p.t === points[i - 1].t);
  const unique = points.filter((p, i) => i === 0 || p.t !== points[i - 1].t);
  const irregular = unique.some((p, i) => i > 0 && p.t - unique[i - 1].t !== step);
  const expectedCount = window ? Math.ceil((window.to - window.from) / step) : null;
  const incomplete =
    !!window &&
    (strictBuckets
      ? unique.length !== expectedCount ||
        unique[0].t !== window.from + step ||
        unique.at(-1)!.t !== window.to ||
        unique.some((p) => p.t % step !== 0)
      : unique.length < Math.max(2, expectedCount!) ||
        unique[0].t - window.from > step ||
        window.to - unique.at(-1)!.t > step);
  const sum = unique.reduce((n, p) => n + p.v, 0);
  const mean = sum / unique.length;
  const delta = unique.at(-1)!.v - unique[0].v;
  if (![sum, mean, delta].every(Number.isFinite)) return null;
  return {
    count: unique.length,
    expectedCount,
    mean,
    sum,
    first: unique[0],
    last: unique.at(-1)!,
    delta,
    min: Math.min(...unique.map((p) => p.v)),
    max: Math.max(...unique.map((p) => p.v)),
    partial: invalid || duplicate || irregular || incomplete || unique.length > 100,
    gaps: invalid || duplicate || irregular || incomplete,
    truncated: unique.length > 100,
    points: unique.slice(-100),
  };
}

export function scopedMetricSeries(
  data: any,
  dimensions: Record<string, string>,
  metricId: string | undefined,
  aggregation: string,
  window?: MetricWindow,
  strictBuckets = false,
  exactSelector?: string,
) {
  if (!Array.isArray(data?.result)) return null;
  const rows = data.result
    .filter(
      (r: any) =>
        r &&
        (!metricId ||
          r.metricId === metricId ||
          r.metricId === metricId + ':' + aggregation ||
          (exactSelector !== undefined && r.metricId === exactSelector)),
    )
    .flatMap((r: any) => (Array.isArray(r.data) ? r.data : []).map((s: any) => ({ r, s })))
    .filter(({ s }: any) => s && Object.entries(dimensions).every(([k, v]) => s.dimensionMap?.[k] === v));
  if (rows.length !== 1) return null;
  const { r, s } = rows[0];
  const summary = summarizeMetricPoints(s.timestamps, s.values, window, METRIC_STEP_MS, strictBuckets);
  if (!summary) return null;
  const apiPartial =
    !!data.nextPageKey ||
    // These are query-budget ratios, not coverage percentages. Small finite ratios are normal.
    [r.dataPointCountRatio, r.dimensionCountRatio].some(
      (ratio) => ratio !== undefined && (!Number.isFinite(ratio) || ratio < 0 || ratio > 1),
    ) ||
    (strictBuckets && Object.keys(s.dimensionMap || {}).some((key) => !(key in dimensions))) ||
    (strictBuckets && data.resolution !== '5m' && data.resolution !== '300000');
  return { ...summary, partial: summary.partial || apiPartial, truncated: summary.truncated || apiPartial };
}
