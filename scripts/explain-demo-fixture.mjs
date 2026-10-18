// Thin test MCP transport around the real Core; only Managed connector ports are simulated.
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {z} from 'zod';
const require=createRequire(import.meta.url),build=process.env.EXPLAIN_DEMO_BUILD,control=process.env.EXPLAIN_DEMO_CONTROL,audit=process.env.EXPLAIN_DEMO_AUDIT;
if(!build || !control || !audit)throw Error('Isolated demo configuration required');
const {executeInvestigation}=require(build+'/src/core/investigation-engine/index.js');
const {demoCases,demoPorts}=require(build+'/examples/explain-demo-fixtures.js');
const ns=process.env.EXPLAIN_DEMO_NAMESPACE || 'first',url='https://managed.example/e/'+ns;
const server=new McpServer({name:'explain-synthetic-demo',version:'1.0.0'}),annotations={readOnlyHint:true,destructiveHint:false};
const text=v=>({content:[{type:'text',text:typeof v==='string'?v:JSON.stringify(v)}]});
const record=v=>fs.appendFile(audit,JSON.stringify({namespace:ns,...v})+'\n');
server.registerTool('dynatrace_managed_get_environments_info',{annotations},async()=>text('- Environment Alias: prod\n- API URL: '+url+'\n- Valid Environment: Yes'));
server.registerTool('dynatrace_managed_list_problems',{annotations,inputSchema:{environment_alias:z.literal('prod')}},async()=>{
 await record({tool:'list_problems'});
 if(JSON.parse(await fs.readFile(control,'utf8')).catalogDisabled)return {...text('Synthetic startup catalog disabled'),isError:true};
 return text('Listing '+demoCases.length+' problems from environment prod.\n'+demoCases.map(id=>'problemId: '+id+'\ndisplayId: '+id+'\ntitle: SYNTHÉTIQUE Checkout '+id+'\nstatus: OPEN').join('\n'));
});
for(const name of ['dynatrace_managed_investigate_problem','dynatrace_managed_explain_problem'])server.registerTool(name,{annotations,inputSchema:{environment_alias:z.literal('prod'),problemId:z.string(),investigationId:z.string().optional()}},async args=>{
 const c=JSON.parse(await fs.readFile(control,'utf8'));await record({tool:name,args});
 if(name!=='dynatrace_managed_explain_problem')return {...text('Explain demo requires the Explain tool, not a legacy investigation'),isError:true};
 if(c.fail)return {...text('Error: synthetic private upstream detail'),isError:true};
 if(c.malformed)return text('{bad-json');
 if(c.expire && args.investigationId)return {...text('Error: Investigation expired or unavailable in this environment; start a new investigation'),isError:true};
 if(c.delay)await new Promise(r=>setTimeout(r,1000));
 if(!demoCases.includes(args.problemId))return {...text('Error: unknown synthetic problem'),isError:true};
 const {deps,problem,reads}=demoPorts(args.problemId,ns);
 if(c.fatal)deps.problemsClient.getProblemDetails=async()=>{throw Error('synthetic private upstream detail');};
 const outcome=await executeInvestigation(deps,args,{paceMs:0,limits:deps.investigationLimits});
 await record({scenario:problem.problemId,status:outcome.status,reads:reads.length});
 return outcome.status==='error'?{...text('Error: synthetic investigation unavailable'),isError:true}:text(outcome.report);
});
await server.connect(new StdioServerTransport());
