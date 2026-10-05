---
description: Service health using the connected Dynatrace Managed MCP
---

Discover the selected SERVICE entities. Build a Classic dashboard covering latency, error rate, throughput, and open problems where metrics exist.

Use only currently exposed MCP tools. Obtain the environment and target from the user request; use the sole environment if only one is configured. Do not read credentials.

Discover exact IDs, metric keys, units, dimensions, and aggregations; test representative bounded queries before adding charts. Do not invent metrics or treat missing data as zero.

Default to a design unless the user explicitly requests creation or update. For creation, start from `examples/dashboards/service-health.json` if available, replace the owner, and apply the actual entity or management-zone scope. Validate before writing. For updates, retrieve the full existing definition and preserve fields outside the requested changes.

Report actual dashboard ID, URL, and verification status after a write. Inspect before retrying a timeout; never claim success without a successful API result.
