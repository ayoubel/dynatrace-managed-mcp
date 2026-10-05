# Classic dashboard tools

The server supports listing, reading, validating, creating (POST), and updating (PUT) Classic dashboards.

`dynatrace_managed_update_dashboard` accepts `environment_alias`, `dashboardId`, and a complete `dashboard` definition. Retrieve the current definition, apply requested changes while preserving other tiles and settings, then call the update tool. PUT replaces the definition; it is not a partial patch. An optional body `id` must match `dashboardId`.

The tool checks that the target exists, validates at `/api/config/v1/dashboards/{id}/validator`, sends PUT to `/api/config/v1/dashboards/{id}`, and compares supplied metadata and tiles with a subsequent GET. It requires both `ReadConfig` and `WriteConfig`. Token-based filtering exposes it only when both scopes are available in every configured environment.

Successful PUT with failed or differing read-back returns `updated: true, verified: false`. Inspect before retrying after errors or timeouts. Concurrent edits can be overwritten; retrieve the current definition immediately before updating.

After building a changed server, restart it in the MCP client and refresh cached tools if necessary.
