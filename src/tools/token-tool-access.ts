// Explicit mappings fail closed for tools added in future releases.
const groups: Record<string, string[]> = {
  'entities.read': ['list_entity_types', 'get_entity_type_details', 'discover_entities', 'get_entity_details', 'get_entity_relationships'],
  DataExport: ['get_environments_info'],
  'events.read': ['list_events', 'get_event_details'],
  'logs.read': ['query_logs'],
  'metrics.read': ['list_available_metrics', 'query_metrics_data', 'get_metric_details'],
  'problems.read': ['list_problems', 'get_problem_details'],
  'securityProblems.read': ['list_security_problems', 'get_security_problem_details'],
  'slo.read': ['list_slos', 'get_slo_details'],
  ReadConfig: ['list_dashboards', 'get_dashboard'],
  WriteConfig: ['validate_dashboard', 'create_dashboard', 'update_dashboard'],
};
export const toolScopes = new Map<string, string>(Object.entries(groups).flatMap(([scope, tools]) =>
  tools.map(tool => [`dynatrace_managed_${tool}`, scope] as const)));

export function permittedTool(name: string, readOnly: boolean | undefined, scopes: string[][]): boolean {
  const required = toolScopes.get(name);
  // Multiple environments use the intersection so every exposed tool is usable in each.
  const supportedWrite = ['dynatrace_managed_create_dashboard', 'dynatrace_managed_update_dashboard'].includes(name) && readOnly === false;
  return (readOnly === true || supportedWrite) && required !== undefined && scopes.length > 0 &&
    scopes.every(environmentScopes => environmentScopes.includes(required) && (name !== 'dynatrace_managed_update_dashboard' || environmentScopes.includes('ReadConfig')));
}
