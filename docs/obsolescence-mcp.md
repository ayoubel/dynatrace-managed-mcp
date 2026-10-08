# Managed obsolescence audit — MCP engine

The obsolescence path owns its intelligence in this server: structured collection, version extraction, primary-source lifecycle references, compliance/coverage, campaigns and upgrade simulation. Daybreak starts a background job, displays the response and retains report history/exports. Other existing Daybreak features are outside this migration.

## Read-only tools

- `dynatrace_managed_get_runtime_inventory`: one structured page (1–100 entities) of instance/group/host/node properties, with opaque `nextPageKey`. Nested technologies and versioned modules are preserved. Arbitrary command-line metadata is omitted. Only `entities.read` is required.
- `dynatrace_managed_audit_obsolescence`: live audit for 1–5 aliases, category all/os/runtime/platform and anticipation 90/180/365 days. Collects up to 10 pages/type/environment. Counts, completeness, performance and internal API trace are explicit. No SaaS, Grail, external lifecycle project or write operation.
- `dynatrace_managed_combine_obsolescence_audits`: combines caller-supplied live reports from multiple MCP servers. Rejects mismatched policies and audit snapshots older than five minutes, recomputes verdicts/score and preserves environment boundaries. This tool does not independently attest the origin of caller-supplied data.

The response contract is version 3. Scoring lives in `src/capabilities/lifecycle.cjs`; collection in `lifecycle-audit.cjs`. CommonJS JavaScript is built with the TypeScript project (`allowJs`) to preserve the server's module format. No second scoring implementation is used by Daybreak in production. Its compatibility re-export is used only by existing development tests/probes, requiring the sibling in-house MCP checkout.

## Evidence and limitations

Verified live schemas: PROCESS_GROUP_INSTANCE exposes softwareTechnologies, appVersion, jvmClrVersion, jvmVendor, metadata, customPgMetadata and versionedModules. PROCESS_GROUP exposes softwareTechnologies. SERVICE exposes softwareTechnologies and application release/build fields; container entities expose image identity. Release/image/agent/module versions are not interchangeable with runtime versions.

The existing get_entity_details tool preserves full properties. It was not dropping versions. The previous Daybreak implementation inspected only 40 instances and extracted only softwareTechnologies. The structured tool removes this collection limit and retains extra version fields. Matching appVersion/JVM fallbacks are explicit, raw values are retained, duplicate unversioned detections do not create another missing component, and group versions remain contextual evidence rather than being assigned to all instances.

Additional full entity details were read for the 29 instances carrying Python, Redis, MongoDB, PostgreSQL, MySQL or Erlang detections. None supplied appVersion/JVM fields or version-labelled metadata in those reads. “Version missing” therefore means missing in the consulted evidence, not impossible to retrieve anywhere in Dynatrace. Services/image metadata may still provide context without proving each process version.

Support rules distinguish missing version, missing reference, edition/distribution context and unavailable/stale collection. PHP security support, known Go cycles and containerd policies extend the initial reference. Temurin is vendor-scoped: “at least” availability dates are lower bounds, never fabricated end-of-life dates. Patch currency, distribution backports, CVE exposure and commercial SLA are not certified by this lifecycle score.

Observations more than five minutes ahead of the audit clock have a distinct `clock_skew` qualification. Their version evidence remains available, but the global score is suppressed and the user is asked to verify workstation/Managed clocks and rerun. The 8 October 12:49 local report contained observations around 13:15; a subsequent live run returned coherent timestamps and 30 evaluable runtime components. The source of that temporary discrepancy was not established. Production evaluation uses collection completion time rather than a timestamp frozen before API calls.

Validation: TypeScript build, 334 MCP unit tests, 117 Daybreak tests and 35 live HTTP audit/export checks passed. Runtime: 520 component observations, 124 versions, 30 evaluated (20 conforming, 10 outside the support reference); 396 missing versions, 68 missing references, 26 support-context qualifications. Runtime global score is withheld at 6% coverage. OS: 13/13 evaluated, reference score 100%; Kubernetes: 8/8 evaluated, upstream reference score 0%.

Primary references:

- [Managed entity properties API](https://docs.dynatrace.com/docs/dynatrace-api/environment-api/entity-v2/get-entity)
- [PHP support](https://www.php.net/supported-versions.php), [historical EOL](https://www.php.net/eol.php)
- [Go security policy](https://go.dev/doc/security/policy), [release history](https://go.dev/doc/devel/release)
- [containerd releases](https://containerd.io/releases/)
- [Temurin availability](https://adoptium.net/support/)
- [NGINX releases](https://nginx.org/en/download.html) (release classification is context, not a universal package EOL rule)

On the tested environment: runtime inventory 252/252 instances and 106/106 groups, 124 versioned component observations. Five Managed API calls; full MCP round trip around 1.7 seconds, collection/scoring around 0.6 seconds and scoring around 29 ms. These are measurements on one environment, not a latency guarantee. A complete inventory still has low evaluation coverage because many versions or applicable support policies are absent; the global score remains suppressed below 60% coverage.
