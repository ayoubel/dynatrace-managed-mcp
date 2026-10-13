export type ExecutionProfile = 'general' | 'incident-intelligence';
export function executionProfile(value = process.env.DT_MCP_PROFILE): ExecutionProfile {
  if (value === undefined || value === '' || value === 'general') return 'general';
  if (value === 'incident-intelligence') return value;
  throw new Error('Unknown execution profile');
}
const incidentTools = new Set(
  [
    'get_environments_info',
    'get_environment_capabilities',
    'list_problems',
    'get_problem_details',
    'explain_problem',
    'investigate_problem',
    'continue_investigation',
    'collect_problem_evidence',
    'get_investigation_context',
    'list_entity_types',
    'get_entity_type_details',
    'discover_entities',
    'get_entity_details',
    'get_entity_relationships',
    'list_events',
    'get_event_details',
    'list_available_metrics',
    'get_metric_details',
    'query_metrics_data',
    'query_logs',
  ].map((name) => 'dynatrace_managed_' + name),
);
export function permitsTool(profile: ExecutionProfile, name: string, readOnly: boolean | undefined): boolean {
  return profile === 'general' || (readOnly === true && incidentTools.has(name));
}
export function assertToolPermitted(profile: ExecutionProfile, name: string, readOnly: boolean | undefined): void {
  if (!permitsTool(profile, name, readOnly))
    throw new Error('Tool forbidden by incident-intelligence read-only profile');
}
