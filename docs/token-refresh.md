# Token refresh and tool discovery

In stdio mode, enable `DT_MCP_FILTER_TOKEN_TOOLS=true`. The local launcher already does this. Configure `DT_CONFIG_FILE` plus `DT_MCP_TOKEN_ENV_FILE` to a local `.env` file containing the variables referenced by the environment config.

The server reads the credential source every five seconds, before tools/list, and before tool execution. A changed token triggers a scope lookup immediately. Unchanged tokens reuse scope metadata for 60 seconds; set `DT_MCP_SCOPE_REFRESH_MS` to change this cache lifetime (minimum 1000 ms). This also detects changed scopes or revoked tokens without a token-string change, within the cache lifetime plus a poll interval while idle.

The same validated credential snapshot controls both discovery and API calls. All configured environments must validate; the exposed tools use their permissions' intersection. Supported tools still have explicit API-scope mappings: a scope does not invent a tool that the server has not implemented.

Filtered startup verifies connectivity and credentials through token lookup rather than requiring unrelated metrics or cluster-version permissions. It checks the minimum cluster version when `DataExport` is present. With narrower credentials, the version is not verified; the configured server's minimum supported version still applies.

After a successful refresh, the server enables/disables registered tools and sends MCP `notifications/tools/list_changed` when the inventory changes. It does not need a restart to reload token-file edits. Client caches can still require a manual refresh; execution checks current permissions even if an agent remembers an old tool.

Invalid/disabled tokens, unreadable files, removed token variables, or invalid configuration disable the inventory and clear active credentials. The server does not silently retain the previous token. Restore valid credentials to recover automatically. Changes to environment aliases, URLs, proxies, or environment count require a restart.

Refresh and tool calls are serialized so a token cannot change midway through a multi-step dashboard write. A running call finishes with its original snapshot; the next queued call checks the new source. This means a long-running call can delay the idle poll. Dynatrace still enforces permissions on each API request.

Changing an environment variable in a different terminal cannot change a running process's environment. Edit the configured token file, or restart for credentials supplied only through process environment variables or inline JSON. Do not delete the previous token file until the replacement is saved; use an atomic file replacement where possible.

HTTP mode continues to use caller-supplied tokens per request. Local token-file reload/filtering is stdio-only. No token or scope cache is written to disk.

Protocol reference: [MCP tool-list changes](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).
