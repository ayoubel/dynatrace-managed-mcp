import type { ManagedAuthClientManager } from '../../authentication/managed-auth-client';
import type { CapabilityConnector } from '../../core/capabilities/discover';
/** Caller-bound connector; never exposes tokens in the result or error text. */
export function capabilityConnector(
  manager: ManagedAuthClientManager,
  alias: string,
  validatedScopes?: string[],
): CapabilityConnector {
  const client = manager.clients.find((c) => c.alias === alias),
    token = manager.tokenFor(alias);
  if (!client || !token || !manager.validAliases.includes(alias))
    throw new Error('Environment unavailable for this caller');
  return {
    validatedScopes,
    read: (endpoint, params, options) =>
      client.makeRequest(endpoint, token, params, {
        signal: options.signal,
        timeout: options.timeoutMs,
        maxContentLength: 262144,
      }),
    scopes: (options) =>
      client.getTokenScopes(token, { signal: options.signal, timeout: options.timeoutMs, maxContentLength: 262144 }),
  };
}
