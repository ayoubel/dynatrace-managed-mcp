import type { ToolRegistrar } from '../../tools/context';
import type { ZodRawShape } from 'zod';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { assertToolPermitted, permitsTool, type ExecutionProfile } from '../../core/execution-policy';
export function profiledTools(register: ToolRegistrar, profile: ExecutionProfile): ToolRegistrar {
  return <TArgs = undefined>(
    name: string,
    description: string,
    schema: ZodRawShape,
    annotations: ToolAnnotations,
    callback: (args: TArgs) => Promise<string>,
  ) => {
    if (!permitsTool(profile, name, annotations.readOnlyHint)) return;
    register<TArgs>(name, description, schema, annotations, async (args: TArgs) => {
      assertToolPermitted(profile, name, annotations.readOnlyHint);
      return callback(args);
    });
  };
}
