/** Event declarations are context supplied by the producer, never confirmed causes. */
const sensitiveKey = /token|password|passwd|secret|authorization|credential|api[-_.]?key|expected|__proto__|constructor|prototype/i;
const permittedKey = /^(?:dt\.event\.description|daybreak\.test(?:\.(?:scenario|app|context|deployment|observations|resource|change|dependency|locations|constraint)(?:\.[a-z0-9_.-]+)?)?|(?:app|context|deployment|observations)(?:\.[a-z0-9_.-]+)?)$/i;
function own(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}
function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return '';
  let input = String(value);
  try { input = decodeURIComponent(input); } catch { /* Keep malformed text as text. */ }
  // Reject secret-bearing declarations as a whole, rather than exposing surrounding fragments.
  if (/(?:https?:\/\/)[^\s/@]+:[^\s/@]+@|\b(?:Bearer|Basic)\s+\S+|\bdt0[a-z0-9]{2,4}\.[a-z0-9._-]+|\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+|(?:token|password|passwd|secret|authorization|api[-_.]?key)\s*[=:]\s*\S+/i.test(input)) return '[expurgé]';
  return input.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, limit);
}
export function normalizeExplainEvent(event: unknown) {
  const raw = own(event, 'properties');
  const properties: {key: string; value: string}[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw)) for (const property of raw.slice(0, 100)) {
    const key = own(property, 'key'), value = own(property, 'value');
    if (typeof key !== 'string' || key.length > 120 || sensitiveKey.test(key) || !permittedKey.test(key) || seen.has(key)) continue;
    const normalized = text(value, 1000);
    if (!normalized) continue;
    seen.add(key); properties.push({key, value: normalized});
    if (properties.length === 20) break;
  }
  const description = text(own(event, 'description'), 2000) || properties.find(p => p.key === 'dt.event.description')?.value || '';
  const date = (key: string) => { const value = own(event, key); return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null; };
  return {
    id: text(own(event, 'eventId'), 250), type: text(own(event, 'eventType'), 120), title: text(own(event, 'title'), 500),
    startTime: date('startTime'), endTime: date('endTime'), description, properties,
    provenance: 'event-declaration' as const,
    synthetic: properties.some(p => p.key === 'daybreak.test' && p.value === 'true'),
  };
}
