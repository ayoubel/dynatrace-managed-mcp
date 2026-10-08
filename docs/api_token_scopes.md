# API Token scopes

Different tools call specific endpoints which require specific API Token scope to work properly

| Tool                                             | Endpoint                        | Scope                   |
| ------------------------------------------------ | ------------------------------- | ----------------------- |
| `dynatrace_managed_list_entity_types`            | `/api/v2/entityTypes`           | `entities.read`         |
| `dynatrace_managed_get_entity_type_details`      | `/api/v2/entityTypes/{type}`    | `entities.read`         |
| `dynatrace_managed_discover_entities`            | `/api/v2/entities`              | `entities.read`         |
| `dynatrace_managed_get_entity_details`           | `/api/v2/entities/{entityId}`   | `entities.read`         |
| `dynatrace_managed_get_entity_relationships`     | `/api/v2/entities/{entityId}`   | `entities.read`         |
| `dynatrace_managed_get_environments_info`        | `/api/v1/config/clusterversion` | `DataExport `           |
| `dynatrace_managed_list_events`                  | `/api/v2/events`                | `events.read`           |
| `dynatrace_managed_get_event_details`            | `/api/v2/events/{eventId}`      | `events.read`           |
| `dynatrace_managed_query_logs`                   | `/api/v2/logs/search`           | `logs.read`             |
| `dynatrace_managed_list_available_metrics`       | `/api/v2/metrics`               | `metrics.read`          |
| `dynatrace_managed_query_metrics_data`           | `/api/v2/metrics/query`         | `metrics.read`          |
| `dynatrace_managed_get_metric_details`           | `/api/v2/metrics/{metricKey}`   | `metrics.read`          |
| `dynatrace_managed_list_problems`                | `/api/v2/problems`              | `problems.read`         |
| `dynatrace_managed_get_problem_details`          | `/api/v2/problems/{problemId}`  | `problems.read`         |
| `dynatrace_managed_list_security_problems`       | `/api/v2/securityProblems`      | `securityProblems.read` |
| `dynatrace_managed_get_security_problem_details` | `/api/v2/securityProblems/{id}` | `securityProblems.read` |
| `dynatrace_managed_list_slos`                    | `/api/v2/slo`                   | `slo.read`              |
| `dynatrace_managed_get_slo_details`              | `/api/v2/slo/{id}`              | `slo.read`              |

| `dynatrace_managed_preview_slo` | `/api/v2/metrics/query` | `metrics.read` |
| `dynatrace_managed_create_slo` | `/api/v2/slo` | `slo.write` |

Creation also requires `metrics.read` for historical preflight and `slo.read` for read-back.

#### Unique scopes

| Tool                                   | Endpoint                              | Scope         |
| -------------------------------------- | ------------------------------------- | ------------- |
| `dynatrace_managed_list_dashboards`    | `/api/config/v1/dashboards`           | `ReadConfig`  |
| `dynatrace_managed_get_dashboard`      | `/api/config/v1/dashboards/{id}`      | `ReadConfig`  |
| `dynatrace_managed_validate_dashboard` | `/api/config/v1/dashboards/validator` | `WriteConfig` |
| `dynatrace_managed_create_dashboard`   | `/api/config/v1/dashboards`           | `WriteConfig` |
| `dynatrace_managed_update_dashboard`   | `/api/config/v1/dashboards/{id}`      | `WriteConfig` |

Update also reads the target before and after PUT, requiring `ReadConfig`.

1. `entities.read`
2. `DataExport`
3. `events.read`
4. `logs.read`
5. `metrics.read`
6. `problems.read`
7. `securityProblems.read`
8. `slo.read`

## Classic SLO creation

`dynatrace_managed_preview_slo` checks a strict definition and queries its metric expression over the proposed period. It returns a historical estimate; it is not a native SLO evaluation or configuration validator. Missing, multiple or invalid percentage values block creation.

`dynatrace_managed_create_slo` requires the intersection of `slo.write`, `slo.read` and `metrics.read` before being exposed. It repeats the read-only check, sends one POST, extracts the created ID from the Location header and reads the definition back. An accepted creation without successful read-back is marked unverified. Never repeat blindly after a timeout or an unverified result; inspect the SLO list first. Explicit user approval of the proposed definition is required by the client before calling this tool.

Supported creation definitions: enabled Classic SLO, AGGREGATE evaluation, target between 0 and 100 exclusive, warning from target through 100, one configured environment, period 1/7/30 days. Existing SLO read tools retain their current behavior.
