import { ToolContext } from '../tools/context';
import { investigateManagedProblem, investigationContext } from './problem-investigation';
export async function explainManagedProblem(ctx:ToolContext,args:{environment_alias:string;problemId:string;investigationId?:string},paceMs=1100) {
  if(args.investigationId && investigationContext(ctx,args.environment_alias,args.investigationId,ctx.investigationOwner).report.problem?.id !== args.problemId)
    throw Error('Problem does not match this investigation');
  return investigateManagedProblem(ctx,{...args,action:'overview'},ctx.investigationOwner,{paceMs,model:null,explain:true});
}
