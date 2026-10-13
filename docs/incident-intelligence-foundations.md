# Incident Intelligence foundations — Sprint 01

Activate the strict backend profile with `DT_MCP_PROFILE=incident-intelligence`. Default: `general`, preserving existing dashboard/SLO/optional conversation functionality. Do not enable Ollama in the active incident workflow. In Daybreak, use `DAYBREAK_PROFILE=incident-intelligence`, or the existing `scripts/start-extension.sh`, which now sets both profiles and disables the local model. Unknown profiles fail closed.

Core entry point (in repository TypeScript tests):

```ts
import { explainProblem } from '../src/core/investigation-engine/explain';
const report = await explainProblem(dependencies, {
  environment_alias: 'prod', problemId: 'actual-internal-problem-id',
});
```

`dependencies` implements `InvestigationDependencies`: explicit Problems/Entities/Events/Metrics/Logs read ports, environment lookup and read-only Settings access, owner and optional observed scope function. No ToolContext, tool registration, server object or MCP SDK. Default pacing remains 1100 ms; tests may choose 0. Retain the existing collection budget (18 launches/80-second launch window): this is not yet an end-to-end cancellation guarantee. Core/server share bounded memory sessions; restart loses them.

The compatibility MCP tool `dynatrace_managed_explain_problem` calls exactly that use case. Its old envelope remains (`version:1`, Explain sections, findings/evidence/trace). New fields: `evidence[].provenance` and `investigation.schemaVersion:"1.0"`; schemas live in `src/contracts`. Referenced IDs must resolve within the snapshot; unsupported links, provenance and measurements are explicitly absent. Consumers should display limitations rather than silently fill values.

New read-only MCP tool: `dynatrace_managed_get_environment_capabilities({environment_alias})`. Its matrix includes version/scopes provenance, available/unavailable/unverified rows, errors and limits. Defaults: 6 launches, 8 s total, 2 s/probe, 256 KiB responses. Four data API probes only, pageSize=1, no cursor follow-up. Logs/settings remain unverified. No SaaS Grail/DQL/AppEngine endpoints. Real Managed compatibility remains unqualified until a client environment is available.

Suggested Dynatrace grants: `problems.read` required for Explain; `entities.read`, `metrics.read`, `events.read` for enrichment; `logs.read` and `settings.read` optional specialized reads. `DataExport` may permit the legacy cluster-version endpoint depending on Managed setup; lack of permission makes version unknown, not a blocker for fact-only Explain. Do not request `WriteConfig`, `slo.write`, or ingest grants for this profile. Scope lookup is a read-only credential validation POST and may be inaccessible in some environments; distinguish unknown grants from inaccessible APIs. Actual grants and endpoints must be verified per client.

Validation commands with the project Node runtime on this workstation:

```sh
.poc-runtime/bin/node node_modules/typescript/bin/tsc --build
.poc-runtime/bin/node node_modules/jest/bin/jest.js --selectProjects unit --runInBand
.poc-runtime/bin/node node_modules/jest/bin/jest.js --selectProjects integration --runInBand --runTestsByPath tests/integration/token-refresh.integration.test.ts tests/integration/incident-profile.integration.test.ts
```

Use Node >=26.5.1 <27 and installed lockfile dependencies on other machines. No runtime download, external inference or real incident creation is needed for these tests. The architecture and limitations are recorded in ADR 0001–0004.
