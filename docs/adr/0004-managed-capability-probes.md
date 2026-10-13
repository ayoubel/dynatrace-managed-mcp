# ADR 0004 — Bounded Managed capability observation

Status: accepted for Sprint 01, 2026-10-13.

An available API or token scope cannot be inferred from a minimum-version fallback. Discovery must not collect an unbounded inventory or use SaaS-only endpoints.

Decision: `discoverCapabilities` uses an injected connector independent of MCP. One environment/caller only; six request launches maximum, eight-second default deadline, two-second per-probe timeout, cancellation propagated, connector response ceiling 256 KiB, no retry, pagination or redirect. Observes actual clusterversion, validated token scope snapshot or read-only apiTokens/lookup, then bounded one-page Problems/Host entities/metric catalog/Events reads. POST token lookup validates credentials without modifying Managed. Logs/settings remain explicitly unverified to avoid collecting broad sensitive data during discovery.

API rows are available only for valid successful response shapes. 401/403/404/405 are unavailable for this probe/caller; 429/timeouts/network/server errors and exhausted budgets stay unverified, with typed sanitized errors. No raw payload, token or exception message is returned. An empty successful array proves endpoint access, not incident coverage. Observed grants remain separate from successful API calls; one-page probes do not certify a version or tenant-wide rights.

The old getClusterVersion fallback remains for compatibility but carries observed:false and is never stored or shown as confirmed version. Existing environment catalog reports unknown/unverified in that case. No fresh cache persists capability results; each call observes its current authorized credential snapshot. Product orchestration/caching is deferred.
