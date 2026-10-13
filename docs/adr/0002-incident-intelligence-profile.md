# ADR 0002 — Fail-closed incident profile

Status: accepted for Sprint 01, 2026-10-13.

`readOnlyHint` is metadata, not an authorization boundary; the existing product includes guarded dashboard/SLO writes and conversation confirmations. Those features are preserved under the default `general` profile.

Decision: `DT_MCP_PROFILE=incident-intelligence` selects an explicit allowlist, requiring `readOnlyHint === true`. Unknown profile names abort startup. Registration and callback execution are both checked, including internal catalog invocation and token refresh enablement. Create/update/SLO writes, validators requiring write scopes, conversation/start/confirmation tools and unknown tools are not exposed. Existing direct core Explain forces `model:null`; the incident profile also forces Ollama off and disables OpenKit initialization, even if environment flags request them. No new AI interface is implemented before Sprint 04.

Gateway: `DAYBREAK_PROFILE=incident-intelligence` filters MCP discovery, rechecks calls at transport invocation, rejects confirmation methods and HTTP route, limits workbench starts to deterministic problem investigations, and forces the profile into stdio children. `scripts/start-extension.sh` selects both profiles. HTTP MCP connections must select the profile on their own server too; the Gateway's access controls still block writes to a general-profile remote.

The profile is immutable per MCP process. Token grants only further restrict tools; broad write-capable tokens cannot unlock writes. In the incident profile, cached environment metadata discovery does not require DataExport; scopes are already validated by token policy. The matrix probe distinguishes endpoint accessibility from observed token grants.

This is a loopback POC policy, not identity/authentication for shared network deployment. AuthN/ACL/TLS are prerequisites to any shared pilot.
