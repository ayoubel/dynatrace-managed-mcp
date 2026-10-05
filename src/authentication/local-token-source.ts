import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { loadFromFile, resolvePath } from '../utils/config-loader';
import {
  buildConfigTokenMap,
  ManagedEnvironmentConfig,
  parseManagedEnvironmentConfig,
  validateEnvironments,
} from '../utils/environment';

/** Reload credentials without mutating process.env or redirecting clients to new endpoints. */
export function createLocalTokenSource(
  initial: ManagedEnvironmentConfig[],
  configFile: string | undefined,
  tokenEnvFile: string | undefined,
  environment: NodeJS.ProcessEnv = { ...process.env },
): () => Map<string, string> {
  if (tokenEnvFile && !configFile) throw new Error('DT_MCP_TOKEN_ENV_FILE requires DT_CONFIG_FILE');
  const resolvedConfigFile = configFile ? resolvePath(configFile, environment) : undefined;
  const resolvedEnvFile = tokenEnvFile ? resolvePath(tokenEnvFile, environment) : undefined;
  const fileOwnedVariables = new Set<string>();
  return () => {
    try {
      if (!resolvedConfigFile) return buildConfigTokenMap(initial);
      const variables = { ...environment };
      if (resolvedEnvFile) {
        // File values, including removal, override startup values for referenced credentials.
        const fileVariables = parseEnv(readFileSync(resolvedEnvFile, 'utf8'));
        const references = [...readFileSync(resolvedConfigFile, 'utf8').matchAll(/\$\{([A-Za-z_]\w*)}/g)];
        const startupSecrets = new Set(initial.map((config) => config.apiToken));
        for (const [, key] of references) {
          if (key in fileVariables || fileOwnedVariables.has(key) || startupSecrets.has(variables[key] ?? '')) {
            fileOwnedVariables.add(key);
            variables[key] = fileVariables[key];
          }
        }
      }
      const configs = loadFromFile(resolvedConfigFile, true, variables).map(parseManagedEnvironmentConfig);
      const validation = validateEnvironments(configs);
      if (validation.errors.length || configs.length !== initial.length) throw new Error('Configuration changed');
      for (const original of initial) {
        const current = configs.find((config) => config.alias === original.alias);
        if (
          !current ||
          current.apiUrl !== original.apiUrl ||
          current.environmentId !== original.environmentId ||
          current.httpProxy !== original.httpProxy ||
          current.httpsProxy !== original.httpsProxy
        ) {
          throw new Error('Environment routing changed');
        }
      }
      return buildConfigTokenMap(configs);
    } catch {
      // Parser errors can contain source excerpts, so never propagate them.
      throw new Error(
        'Local credential configuration unavailable or changed; restore it or restart after environment changes',
      );
    }
  };
}
