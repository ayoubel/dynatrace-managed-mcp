import type { InvestigationDependencies } from './dependencies';
/** Operational collection bounds, never anomaly thresholds. Depth remains exactly one. */
export function serviceCollectionLimits(deps: Pick<InvestigationDependencies, 'investigationLimits'>) {
  const input = deps.investigationLimits || {};
  const bound = (value: number | undefined, fallback: number, max: number) => {
    const n = value ?? fallback;
    if (!Number.isSafeInteger(n) || n < 1 || n > max) throw Error('Invalid investigation collection limit');
    return n;
  };
  return {
    maxApiCalls: bound(input.maxApiCalls, 48, 60),
    maxCandidates: bound(input.maxCandidates, 4, 8),
    maxDependencies: bound(input.maxDependencies, 2, 4),
    maxKeyRequests: bound(input.maxKeyRequests, 2, 4),
    timeoutMs: bound(input.timeoutMs, 12000, 30000),
    maxDurationMs: bound(input.maxDurationMs, 80000, 120000),
    maxResponseBytes: bound(input.maxResponseBytes, 3000000, 5000000),
    maxTotalBytes: bound(input.maxTotalBytes, 10000000, 20000000),
    depth: 1,
  };
}
/** Does not pretend to cancel a connector that has no AbortSignal port. Callers stop further reads on timeout. */
export async function boundedResponse<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Collection timeout')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
