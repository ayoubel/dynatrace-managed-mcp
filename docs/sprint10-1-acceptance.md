# Sprint 10.1 — isolated acceptance tools

Production MCP/Core sources and entry points remain unchanged. See the seven SPRINT_10_1 documents in the sibling sre-morning-check repository for evidence, scope and activation conditions. No Managed credentials or production endpoints are needed.

With the existing Node/dependencies, from this repository:

```sh
.poc-runtime/bin/node scripts/validate-sprint09.mjs
.poc-runtime/bin/node scripts/validate-sprint10-1.mjs
.poc-runtime/bin/node scripts/validate-sprint10-1-web-candidate.mjs
```

The first command compiles into a temporary build and runs existing suites. The second exercises the real Gateway, SDK stdio fixture adapter, real Core, corpus connector ports, sessions/history and backup/restore. It scrubs the child environment, uses a temporary HOME/data/config/build, disables models/telemetry, binds ephemeral IPv4 loopback ports excluding 4318, and preloads sprint10-1-network-guard.mjs to deny outgoing sockets. Numeric bind addresses remain resolvable without DNS traffic. This is application-level isolation for known test code, not an OS sandbox against malicious native code.

The third command copies only source/assets/tests/scripts/package metadata, never professional data/config, applies the deferred Web error patch to that private copy and runs its 187 tests. It verifies the original Web asset hash remains unchanged. Git must already be installed; its existing binary is resolved before using the minimal child environment. No Xcode agreement, install, download, push or history operation is performed.

For browser acceptance, append `--serve` to the second command. It announces its isolated URL and directory. Create the directory's `stop` file to finish cleanly; after one hour the session times out and stops its own children. Temporary artifacts are retained privately. `--gateway-root PATH_FROM_CANDIDATE` selects the tested private candidate source; data/config always remain in a fresh directory. `--extension-origin chrome-extension://ID` selects the exact Chrome test-profile origin (32 letters a–p); the default is synthetic, not a real extension identity.

The adapter sprint10-1-fixture-mcp.mjs never loads production connectors. Its control.json file accepts fixture flags `expire`, `fail`, and `malformed`. Expiration is a simulated exact Core error at the SDK boundary, not a 30-minute wall-clock TTL wait. Actual Core owner/environment/problem/TTL behavior remains covered by existing tests. Audit metadata contains only corpus tool names and synthetic arguments/counts.

With --serve, three deliberately degraded presentation jobs are added after the 13-job restoration checks. They test absent evidence/optional fields, untrusted labels/URLs and missing references; they are not claimed as contract-valid Core output. The 24 acceptance checks distinguish Gateway execution status from report completion. A completed job may contain a partial report.

The browser extension's initial panel attempts saved.gateway or 4318 by default. Do not open it in a test profile before pre-seeding the isolated Gateway URL in its service worker storage. See the detailed manual Chrome checklist; the personal profile must not be modified.

No native Chrome or real Managed success is inferred from HTTP/DOM tests. The complete synthetic chain uses a test MCP adapter; existing real MCP loopback integrations are a separate proof. Activation remains a separately authorized operation.
