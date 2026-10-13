import type { MetricListParams, MetricQueryParams } from '../../capabilities/metrics-api';
import type { EventQueryParams } from '../../capabilities/events-api';
import type { LogQueryParams } from '../../capabilities/logs-api';
import type { ExecutionProfile } from '../execution-policy';

// Structural ports: no SDK, registration, HTTP request, credential or server objects.
// API payloads retain legacy shapes in this first extraction; validated evidence is the public output.
export type ApiPayload = Record<string, any>;
export type ApiResults = Promise<Map<string, ApiPayload>>;
export interface InvestigationDependencies {
  authClientManager: {
    validAliases: string[];
    getBaseUrl(alias: string): string;
    makeRequests<T>(
      endpoint: string,
      params: Record<string, string | number | boolean | undefined>,
      alias: string,
    ): Promise<Map<string, T>>;
  };
  problemsClient: { getProblemDetails(id: string, alias: string): ApiResults };
  entitiesClient: { getEntityDetails(id: string, alias: string): ApiResults };
  eventsClient: {
    getEventDetails(id: string, alias: string): ApiResults;
    queryEvents(params: EventQueryParams, alias: string): ApiResults;
  };
  metricsClient: {
    getMetricDetails(id: string, alias: string): ApiResults;
    listAvailableMetrics(alias: string, params?: MetricListParams): ApiResults;
    queryMetrics(params: MetricQueryParams, alias: string): ApiResults;
  };
  logsClient: { queryLogs(params: LogQueryParams, alias: string): ApiResults };
  investigationOwner?: string;
  tokenScopesFor?: (alias: string) => string[] | undefined;
  executionProfile?: ExecutionProfile;
}
