import { z } from 'zod';
import { createHash } from 'node:crypto';
import { ToolContext } from './context';
import {
  DiscoverEntitiesArgs,
  EnvironmentScopedArgs,
  GetEntityDetailsArgs,
  GetEntityRelationshipsArgs,
  GetEntityTypeDetailsArgs,
} from './types';
import { EntitiesApiClient } from '../capabilities/entities-api';
import { MAX_ENTITIES_LIMIT } from './limits';
import { auditManagedLifecycle } from '../capabilities/lifecycle-audit.cjs';
import { combineLifecycleReports } from '../capabilities/lifecycle.cjs';

export function registerEntitiesTools(ctx: ToolContext): void {
  const categorySchema = z.enum(['all', 'os', 'runtime', 'platform']);
  ctx.tool<{
    environment_alias: string;
    category?: string;
    anticipationDays?: number;
    environment_ids?: Record<string, string>;
  }>(
    'dynatrace_managed_audit_obsolescence',
    'Collect live Managed software evidence with pagination, classify lifecycle support and calculate compliance/coverage plus maintenance campaigns. All intelligence runs inside MCP. No SaaS, Grail or writes. Unknown data remains unknown; this is not a regulatory certificate.',
    {
      environment_alias: z
        .string()
        .refine((alias) => ctx.envAliasValidate(alias), { message: 'Invalid environment alias' }),
      category: categorySchema.optional(),
      anticipationDays: z.union([z.literal(90), z.literal(180), z.literal(365)]).optional(),
      environment_ids: z.record(z.string(), z.string().regex(/^[a-f0-9]{24}$/)).optional(),
    },
    { readOnlyHint: true },
    async ({ environment_alias, category = 'all', anticipationDays = 180, environment_ids = {} }) => {
      const aliases =
        environment_alias === 'ALL_ENVIRONMENTS'
          ? ctx.authClientManager.validAliases
          : environment_alias.split(',').map((a) => a.trim());
      if (!aliases.length || aliases.length > 5 || aliases.some((a) => !ctx.authClientManager.validAliases.includes(a)))
        throw Error('One to five valid environments are required');
      const environments = [...new Set(aliases)].map((alias) => ({
        alias,
        id:
          environment_ids[alias] ||
          createHash('sha256')
            .update(ctx.authClientManager.getBaseUrl(alias) + '\0' + alias)
            .digest('hex')
            .slice(0, 24),
        url: ctx.authClientManager.getBaseUrl(alias),
      }));
      return JSON.stringify(
        await auditManagedLifecycle(ctx.entitiesClient, environments, { category, anticipationDays }),
      );
    },
  );
  ctx.tool<{ reports: any[] }>(
    'dynatrace_managed_combine_obsolescence_audits',
    'Combine caller-supplied MCP audit reports across servers and recalculate compliance in MCP without re-reading Managed. Evidence must come from live audit_obsolescence reports with matching policies. Does not independently attest caller-supplied evidence.',
    {
      reports: z
        .array(
          z
            .object({
              version: z.literal(3),
              category: categorySchema,
              anticipationDays: z.union([z.literal(90), z.literal(180), z.literal(365)]),
              evaluatedAt: z.string(),
              rows: z.array(z.record(z.string(), z.unknown())).max(10000),
              inventories: z.array(z.record(z.string(), z.unknown())).max(100),
              referenceVerifiedAt: z.string(),
              limitations: z.array(z.string()),
            })
            .passthrough(),
        )
        .min(1)
        .max(5),
    },
    { readOnlyHint: true },
    async ({ reports }) => JSON.stringify(combineLifecycleReports(reports)),
  );
  ctx.tool<{
    environment_alias: string;
    type?: 'PROCESS_GROUP_INSTANCE' | 'PROCESS_GROUP' | 'HOST' | 'KUBERNETES_NODE';
    pageSize?: number;
    nextPageKey?: string;
    from?: string;
    to?: string;
  }>(
    'dynatrace_managed_get_runtime_inventory',
    'Read one structured page of Managed runtime evidence, retaining nested technology type/edition/version and version-specific properties. Follow nextPageKey for complete inventory. A group version is not proof of every instance version. No release/image/agent versions are substituted for runtime versions.',
    {
      environment_alias: z
        .string()
        .refine((alias) => ctx.envAliasValidate(alias) && ctx.authClientManager.validAliases.includes(alias), {
          message: 'One valid environment alias is required',
        }),
      type: z.enum(['PROCESS_GROUP_INSTANCE', 'PROCESS_GROUP', 'HOST', 'KUBERNETES_NODE']).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
      nextPageKey: z.string().min(1).max(4096).optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    },
    { readOnlyHint: true },
    async ({ environment_alias, type = 'PROCESS_GROUP_INSTANCE', pageSize, nextPageKey, from, to }) => {
      const pages = await ctx.entitiesClient.getRuntimeInventory(
        environment_alias,
        type,
        pageSize,
        nextPageKey,
        from,
        to,
      );
      const page = pages.get(environment_alias);
      if (!page) throw new Error('Runtime inventory response unavailable');
      return JSON.stringify({ environment: environment_alias, type, ...page });
    },
  );
  ctx.tool<EnvironmentScopedArgs>(
    'dynatrace_managed_list_entity_types',
    'List all available entity types in the Managed cluster to understand what types of entities can be monitored.',
    {
      environment_alias: z
        .string()
        .describe(
          'Specify which environment to be queried, by supplying the environment alias as returned ' +
            'by get_environments_info. Can use `ALL_ENVIRONMENTS` to retrieve data from all environments in ' +
            'one request to MCP.',
        )
        .refine((alias) => ctx.envAliasValidate(alias), {
          message: 'Environment alias(es) not valid. Options are: ' + ctx.authClientManager.validAliases.join(', '),
        }),
    },
    {
      readOnlyHint: true,
    },
    async ({ environment_alias }) => {
      const responses = await ctx.entitiesClient.listEntityTypes(environment_alias);
      return ctx.entitiesClient.formatEntityTypeList(responses);
    },
  );

  ctx.tool<GetEntityTypeDetailsArgs>(
    'dynatrace_managed_get_entity_type_details',
    'Get details of an entity type.',
    {
      type: z.string().describe('Name of the entity type, such as SERVICE, APPLICATION, HOST, etc'),
      environment_alias: z
        .string()
        .describe(
          'Specify which environment to be queried, by supplying the environment alias as returned ' +
            'by get_environments_info. Can use `ALL_ENVIRONMENTS` to retrieve data from all environments in ' +
            'one request to MCP.',
        )
        .refine((alias) => ctx.envAliasValidate(alias), {
          message: 'Environment alias(es) not valid. Options are: ' + ctx.authClientManager.validAliases.join(', '),
        }),
    },
    {
      readOnlyHint: true,
    },
    async ({ type, environment_alias }) => {
      const response = await ctx.entitiesClient.getEntityTypeDetails(type, environment_alias);
      return ctx.entitiesClient.formatEntityTypeDetails(response);
    },
  );

  ctx.tool<DiscoverEntitiesArgs>(
    'dynatrace_managed_discover_entities',
    `Discover entities in the Managed cluster using EntitySelector syntax. REQUIRED: Must specify
    entitySelector with exactly ONE entity type only. Results include entity properties, tags,
    management zones, and relationship counts for comprehensive topology analysis.`,
    {
      entitySelector: z.string().describe(
        `Entity selector to filter the entities. CRITICAL: Must include exactly ONE entity type
          like type("SERVICE") - multiple types NOT supported. Examples: type("SERVICE"),
          entityId("ID1"), entityName.contains("name"), entityName.equals("exact"), tag("key:value"), mzName("zone"),
          healthState("HEALTHY").`,
      ),
      mzSelector: z
        .string()
        .optional()
        .describe(
          `Optional management zone selector to further scope the query. Use mzId(123,456) for zone IDs
          or mzName("Bookstore-FS","Stocks") for zone names. Can combine: mzId(123),mzName("Production").
          Works alongside entitySelector.`,
        ),
      from: z
        .string()
        .optional()
        .describe('Start time for entity observation timeframe (ISO format or relative like "now-3d")'),
      to: z
        .string()
        .optional()
        .describe('End time for entity observation timeframe (ISO format or relative like "now")'),
      limit: z
        .number()
        .max(MAX_ENTITIES_LIMIT)
        .optional()
        .describe(
          `Maximum number of entities to return. Use this when user specifies a count (e.g., "first 10 entities" → limit: 10). If not specified, returns up to API limit: ${EntitiesApiClient.API_PAGE_SIZE}. Cannot exceed ${MAX_ENTITIES_LIMIT}`,
        ),
      sort: z
        .string()
        .optional()
        .describe('Sort order for entities. Use "name" for ascending, "-name" for descending by display name.'),
      environment_alias: z
        .string()
        .describe(
          'Specify which environment to be queried, by supplying the environment alias as returned ' +
            'by get_environments_info. Can use `ALL_ENVIRONMENTS` to retrieve data from all environments in ' +
            'one request to MCP.',
        )
        .refine((alias) => ctx.envAliasValidate(alias), {
          message: 'Environment alias(es) not valid. Options are: ' + ctx.authClientManager.validAliases.join(', '),
        }),
    },
    {
      readOnlyHint: true,
    },
    async ({ entitySelector, mzSelector, from, to, limit, sort, environment_alias }) => {
      const responses = await ctx.entitiesClient.queryEntities(
        {
          entitySelector: entitySelector,
          pageSize: limit,
          mzSelector: mzSelector,
          from: from,
          to: to,
          sort: sort,
        },
        environment_alias,
      );
      return ctx.entitiesClient.formatEntityList(responses);
    },
  );

  ctx.tool<GetEntityDetailsArgs>(
    'dynatrace_managed_get_entity_details',
    'Get detailed information about a specific entity.',
    {
      entityId: z.string().describe('The entity ID to get details for'),
      environment_alias: z
        .string()
        .describe(
          'Specify which environment to be queried, by supplying the environment alias as returned ' +
            'by get_environments_info. Can use `ALL_ENVIRONMENTS` to retrieve data from all environments in ' +
            'one request to MCP.',
        )
        .refine((alias) => ctx.envAliasValidate(alias), {
          message: 'Environment alias(es) not valid. Options are: ' + ctx.authClientManager.validAliases.join(', '),
        }),
    },
    {
      readOnlyHint: true,
    },
    async ({ entityId, environment_alias }) => {
      const response = await ctx.entitiesClient.getEntityDetails(entityId, environment_alias);
      return ctx.entitiesClient.formatEntityDetails(response);
    },
  );

  ctx.tool<GetEntityRelationshipsArgs>(
    'dynatrace_managed_get_entity_relationships',
    'Get relationships that a specific entity has "to" and "from" other entities.',
    {
      entityId: z.string().describe('The entity ID to get relationships for'),
      environment_alias: z
        .string()
        .describe(
          'Specify which environment to be queried, by supplying the environment alias as returned ' +
            'by get_environments_info. Can use `ALL_ENVIRONMENTS` to retrieve data from all environments in ' +
            'one request to MCP.',
        )
        .refine((alias) => ctx.envAliasValidate(alias), {
          message: 'Environment alias(es) not valid. Options are: ' + ctx.authClientManager.validAliases.join(', '),
        }),
    },
    {
      readOnlyHint: true,
    },
    async ({ entityId, environment_alias }) => {
      const responses = await ctx.entitiesClient.getEntityRelationships(entityId, environment_alias);
      return ctx.entitiesClient.formatEntityRelationships(responses);
    },
  );
}
