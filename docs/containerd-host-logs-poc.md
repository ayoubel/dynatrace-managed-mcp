# containerd version: bounded Host log POC

The existing read-only `dynatrace_managed_query_logs` tool now accepts optional
`hostId`. It compiles an exact `dt.entity.host` constraint with a literal content
phrase using Log Monitoring Classic search syntax. Without `hostId`, existing
query behaviour is preserved. Scoped queries accept letters, digits, spaces,
periods, underscores and hyphens only; unsupported expressions fail before any
request. No unscoped retry is performed.

Example tool arguments:

```json
{
  "environment_alias": "poc",
  "hostId": "HOST-D4CB688F84F77084",
  "query": "containerd",
  "from": "now-7d",
  "to": "now",
  "limit": 10
}
```

Live POC on 2026-10-08, through MCP, restricted to the Host linked to the
previously examined Nginx process:

| Search | Window | Limit | Returned records |
| --- | --- | --- | --- |
| containerd | 7 days | 10 | 0 |
| k3s | 7 days | 10 | 0 |
| Empty phrase (Host logs) | 24 hours | 1 | 0 |

The API accepted the scoped queries, but no evidence of a containerd version
was returned. This does not establish whether startup logs existed outside the
time windows, lacked Host enrichment, or were not collected/visible to this
token. Positive matching and version attribution remain unverified on live
logs. No version is inferred from Kubernetes, Go, image tags or shim names.
No audit enrichment, fleet scan or frontend change was introduced.

Validation: TypeScript build and 77 targeted logs/tool-limit tests passed,
including scope enforcement, expression rejection and no unscoped retry.

References:
- [Classic log search API](https://docs.dynatrace.com/docs/dynatrace-api/environment-api/log-monitoring-v2/get-search-logs)
- [Classic search examples](https://docs.dynatrace.com/docs/analyze-explore-automate/log-monitoring/log-processing/log-processing-examples)
- [Classic semantic attributes](https://docs.dynatrace.com/docs/analyze-explore-automate/log-monitoring/acquire-log-data/logs-classic-ingestion-api/log-classic-semantic-attributes)
