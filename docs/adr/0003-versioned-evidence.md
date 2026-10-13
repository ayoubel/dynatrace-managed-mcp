# ADR 0003 — Additive, validated evidence snapshots

Status: accepted for Sprint 01, 2026-10-13.

Existing clients require report.version=1, evidence IDs, camelCase and Explain sections. Replacing the envelope would break them.

Decision: keep all legacy fields. Every collected proof receives `provenance` with schemaVersion `1.0`, snapshot ID, type, environment, entity, source API/method/parameters, collection timestamp, time range, optional measurement/unit/aggregation, optional reference, limitations and sanitized errors. The report receives `investigation`, a validated canonical collection snapshot with evidence, conclusions and collection errors. Zod 3.25.76, already resolved in the lockfile, is now a direct dependency. IDs are stable within the snapshot, not global across refreshes.

Record connector arguments at collection time. Embedded problem facts inherit Problems API provenance; fetched event details retain Events API provenance. Unsupported provenance is null with a limitation. Never infer unit/aggregation from a metric name or manufacture a UI URL. Only the pre-existing problem link is reused; other UI references remain null. Unknown/non-finite values normalize to null, not zero. Legacy arrays/series remain available for compatibility.

Output validation rejects duplicate IDs, environment mismatches, invalid measurements and unresolved evidence references. The reference check traverses all legacy nested evidenceRefs (including Explain and remediation), not just findings. A contract failure produces a generic error before caching or returning the collection. The partial report records failed/blocked collections, without upstream exception contents.

Scope: deterministic collection snapshots, including Explain, and their cached reuse. Legacy optional conversation/model responses remain outside the new conversational contract; Sprint 04/05 must validate their separate assertions and snapshot consistency before enabling them. The current active profile has no LLM conversation.
