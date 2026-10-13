# ADR 0001 — Investigation Engine and adapters

Status: accepted for Sprint 01, 2026-10-13. Reference main: `c7f8f01bec62fe2768a640737d844947f18b6356`.

The current investigation/Explain collectors and deterministic rules are reusable. Rewriting them or transferring them into the Gateway would duplicate domain logic. Their `ToolContext` dependency prevented a clear transport boundary.

Decision: preserve `src/capabilities/` implementations. The deterministic use case is `src/core/investigation-engine/explain.ts`; it accepts structural `InvestigationDependencies` ports and a validated `ExplainRequest`. `problem-investigation.ts`, `general-problem-evidence.ts`, and `explain-service-evidence.ts` now consume these ports. Their transitive runtime dependencies contain no MCP SDK. API parameter types are type-only imports from the existing connector modules. Legacy payload shapes remain during this first extraction; new public evidence is validated.

`src/adapters/mcp/investigation-dependencies.ts` projects the existing ToolContext to these ports. `src/capabilities/problem-explain.ts` preserves the old function signature as a compatibility adapter. Registration/catalogs/token validation remain in the MCP layer. Session storage remains bounded process memory (100 sessions, 30 minutes), shared by the old and direct use cases; it is not yet injectable or durable. Explicit owner/environment/URL boundaries are retained.

Repository ownership:

- `dynatrace-managed-mcp-poc`: connectors, collection, comparisons, rules, evidence contracts, capability probes, core execution policy, optional inactive model implementation, MCP adapter. Future HTTP adapter belongs here.
- `sre-morning-check`: application HTTP routes, jobs, state, sessions, registry, rendering/export, application access policy. No new baseline, diagnosis, correlation or playbook logic.
- `daybreak-browser-extension`: active URL context and rendering; no API tokens, direct Managed calls or domain rules. Unchanged by Sprint 01.
- `daybreak-managed-ef2-poc`: excluded.

Consequences: minimal file movement, a direct test without starting MCP, existing Explain tests preserved. `context-analysis`, conversation agent and other domains still depend on ToolContext; extracting them is deferred. No second engine, Python, FastAPI, LangChain/LangGraph or new HTTP service.
