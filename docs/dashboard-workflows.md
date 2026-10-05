# Dashboard workflows

The server exposes four MCP prompts: `service-health`, `infrastructure-health`, `incident-investigation`, and `dashboard-update`. Prompts guide the agent; they do not execute API calls or grant permissions.

The first three accept `environment_alias`, `target`, and `owner`, plus optional `mode` (`design` by default or `create`), `from` (`now-1h`), and `to` (`now`). `dashboard-update` accepts `environment_alias`, `dashboardId`, and `changes`. Choose them in your client's MCP prompt picker; in VS Code, MCP prompts are available through chat slash commands. Equivalent workspace prompts are in `.github/prompts/`.

| Workflow               | Intended content                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| Service health         | Discovered services, latency, errors, throughput, and open problems                      |
| Infrastructure health  | Discovered hosts, CPU, memory, disk, availability, and open problems                     |
| Incident investigation | Affected entities, trends during the incident window, problems, and evidence timeline    |
| Dashboard update       | Retrieve, preserve unrelated content, apply requested changes, validate, PUT, and verify |

## Reusable Classic JSON templates

`examples/dashboards/` contains three private dashboard starting definitions. They include context/runbook Markdown, open problems, and built-in service/host health or incident evidence tiles. They do not hard-code environment-specific metric keys or entity IDs.

Replace `REPLACE_WITH_OWNER`, rename the dashboard, and apply actual entity filters or the management-zone filter before creating it. The templates' initial service/host scope spans that entity type in the chosen environment. Narrow it to your intended target. Add metric charts only after discovering metric definitions and testing representative queries; missing data must be reported, not replaced with invented values. Server validation is required for the target environment.

Examples:

- “Design a service health dashboard for payments in environment managed over the last hour. Discover available metrics and report missing data. Do not create it yet.”
- “Create a private infrastructure dashboard for hosts in management zone Production, owned by operations. Include verified CPU, memory, disk, availability, and open-problem tiles.”
- “Design an incident dashboard for service checkout from 14:00 to 16:00 UTC on the incident date. Include an evidence timeline and affected-entity trends.”
- “Update dashboard <ID> by adding a CPU trend for these hosts. Preserve all existing tiles, filters, sharing, and other settings.”

Creation requires the exposed create tool; updates require the exposed update tool. If either is unavailable, the agent should provide a definition and explain what it could not execute. Never claim a live write merely because a template was generated.

PUT replaces the full dashboard definition. Retrieve it immediately before modifying it; concurrent edits may be overwritten. Keep an export of the previous definition when making substantial changes.

Schema reference: [Dynatrace Classic tile models](https://docs.dynatrace.com/docs/dynatrace-api/configuration-api/dashboards-api/dashboards-api-tile-models).
