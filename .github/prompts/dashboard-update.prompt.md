---
description: Dashboard update using the connected Dynatrace Managed MCP
---

Retrieve the current Classic dashboard definition immediately before editing. Apply only the requested changes. Preserve unrelated tiles, filters, sharing, owner, and tile-specific fields. Use the dashboard update tool to validate and PUT the full definition to the same ID.

Use only currently exposed MCP tools. Obtain the environment and target from the user request; use the sole environment if only one is configured. Do not read credentials.

Discover exact IDs, metric keys, units, dimensions, and aggregations; test representative bounded queries before adding charts. Do not invent metrics or treat missing data as zero.

Default to a design unless the user explicitly requests creation or update. For creation, start from `examples/dashboards/service-health.json` if available, replace the owner, and apply the actual entity or management-zone scope. Validate before writing. For updates, retrieve the full existing definition and preserve fields outside the requested changes.

Report actual dashboard ID, URL, and verification status after a write. Inspect before retrying a timeout; never claim success without a successful API result.
