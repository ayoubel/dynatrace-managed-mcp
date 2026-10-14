import { explainManagedProblem } from '../problem-explain';
import { buildExplainReport } from '../problem-explain-report';
import { scopedExplainSeries } from '../explain-service-evidence';
import { investigationContext } from '../problem-investigation';
import { permittedTool } from '../../tools/token-tool-access';
const service='SERVICE-1111111111111111',root='SERVICE-2222222222222222',host='HOST-3333333333333333';
function fixture(){
 const start=Math.floor((Date.now()-3600000)/300000)*300000,end=start+600000,map=(v:any)=>new Map([['prod',v]]);
 const problem={problemId:'problem',status:'CLOSED',severityLevel:'ERROR',title:'Failure rate increase',startTime:start,endTime:end,affectedEntities:[{entityId:{id:service}}],rootCauseEntity:{entityId:{id:root},name:'External dependency'},evidenceDetails:{totalCount:1,details:[{evidenceType:'METRIC',entity:{entityId:{id:root}},rootCauseRelevant:true}]},impactAnalysis:{impacts:[{impactedEntity:{entityId:{id:service},name:'web'},estimatedAffectedUsers:120}]}};
 const query=jest.fn().mockImplementation(async(p:any)=>map({resolution:'5m',result:[{metricId:p.metricSelector,data:[{dimensionMap:{'dt.entity.service':p.entitySelector.match(/SERVICE-[A-F0-9]+/)?.[0]},timestamps:[Number(p.from)+300000,Number(p.from)+600000],values:Number(p.from)===start?[20,40]:[1,1]}]}]}));
 const ctx:any={investigationOwner:'owner',authClientManager:{validAliases:['prod'],getBaseUrl:()=> 'https://example/e/prod'},tokenScopesFor:()=>['problems.read','metrics.read','entities.read','events.read'],problemsClient:{getProblemDetails:jest.fn().mockResolvedValue(map(problem))},entitiesClient:{getEntityDetails:jest.fn().mockImplementation(async(id:string)=>map({entityId:id,displayName:id}))},eventsClient:{queryEvents:jest.fn().mockResolvedValue(map({events:[]}))},metricsClient:{getMetricDetails:jest.fn().mockImplementation(async(metricId:string)=>map({metricId,unit:metricId.includes('time')?'MicroSecond':'Percent'})),queryMetrics:query}};
 return {ctx,problem,query,start,end};
}
test('Explain works without a model, investigates root entity first and returns sections with comparisons and conditional remediation',async()=>{
 const f=fixture(),r:any=await explainManagedProblem(f.ctx,{environment_alias:'prod',problemId:'problem'},0);
 expect(r.explain.mode).toBe('deterministic');expect(r.explain.plan).toBe('service');expect(r.explain.whatHappened.status).toBe('CLOSED');
 expect(r.explain.impact.perEntity[0].estimatedAffectedUsers).toBe(120);expect(r.explain.impact.estimatedUsersTotal).toBeNull();
 expect(r.explain.whyItHappened.conclusion.certainty).toBe('published');expect(r.explain.whyItHappened.mechanism.certainty).toBe('unknown');
 expect(r.explain.whyItHappened.observations.some((i:any)=>i.title==='builtin:service.errors.server.rate')).toBe(true);
 expect(r.explain.whyItHappened.observations.some((i:any)=>i.title==='Comparaison disque')).toBe(false);
 expect(f.query.mock.calls[0][0].entitySelector).toContain(root);expect(f.query.mock.calls[1][0]).toMatchObject({from:String(f.start-600000),to:String(f.start)});
 expect(r.explain.remediation.execution).toBe('proposal-only');expect(r.explain.remediation.shortTerm.every((i:any)=>i.condition)).toBe(true);
 const stored=investigationContext(f.ctx,'prod',r.investigationId,'owner');expect(stored.report.explain).toEqual(r.explain);
 const next:any=await explainManagedProblem(f.ctx,{environment_alias:'prod',problemId:'problem',investigationId:r.investigationId},0);expect(next.investigationId).toBe(r.investigationId);
 await expect(explainManagedProblem(f.ctx,{environment_alias:'prod',problemId:'other',investigationId:r.investigationId},0)).rejects.toThrow('match');
 await expect(explainManagedProblem({...f.ctx,investigationOwner:'other'},{environment_alias:'prod',problemId:'problem',investigationId:r.investigationId},0)).rejects.toThrow('unavailable');
});
test('absence of scopes, metadata or cause cannot generate a comparison or asserted fix',async()=>{
 const f=fixture();f.ctx.tokenScopesFor=()=>['problems.read'];delete (f.problem as any).rootCauseEntity;
 const r:any=await explainManagedProblem(f.ctx,{environment_alias:'prod',problemId:'problem'},0);
 expect(f.query).not.toHaveBeenCalled();expect(r.status).toBe('partial');expect(r.explain.whyItHappened.conclusion.certainty).toBe('unknown');
 expect(r.explain.whyItHappened.observations).toEqual([]);expect(r.explain.remediation.shortTerm[0].certainty).toBe('conditional');
 expect(permittedTool('dynatrace_managed_explain_problem',true,[['problems.read']])).toBe(true);
 expect(permittedTool('dynatrace_managed_explain_problem',true,[['metrics.read']])).toBe(false);
});
test('series reject wrong entity, multiple dimensions, missing values and do not qualify a partial baseline',()=>{
 const data=(rows:any[])=>({result:[{data:rows}]});const row={dimensionMap:{'dt.entity.service':service},timestamps:[10,20],values:[1,2]};
 expect(scopedExplainSeries(data([{...row,dimensionMap:{'dt.entity.service':root}}]),service,0,30)).toBeNull();
 expect(scopedExplainSeries(data([row,row]),service,0,30)).toBeNull();
 expect(scopedExplainSeries(data([{...row,values:[null,2]}]),service,0,30)?.partial).toBe(true);
 const r:any={scope:{},findings:[],evidence:[{id:'E1',kind:'problem'}],limitations:[]};
 const e=buildExplainReport({title:'Unclassified',affectedEntities:[{entityId:{id:host}}]},r);
 expect(e.plan).toBe('generic');expect(e.impact.unknowns).toHaveLength(1);expect(e.remediation.shortTerm).toEqual([]);
});
test('extension contract names entities and shows qualified units without adding users or guessing endpoints',async()=>{
 const f=fixture();(f.problem.affectedEntities[0] as any).name='next';
 const r:any=await explainManagedProblem(f.ctx,{environment_alias:'prod',problemId:'problem'},0);
 expect(r.explain.impact.entities[0].name).toBe('next');expect(r.explain.whatHappened.durationMinutes).toBe(10);
 expect(r.explain.whyItHappened.comparisons[0]).toMatchObject({title:'Erreurs côté serveur',entityId:root,baseline:{unit:'%'},incident:{unit:'%'}});
 expect(r.explain.whyItHappened.comparisons[1].incident).toMatchObject({value:0.03,unit:'ms'});
 expect(r.explain.remediation.shortTerm).toHaveLength(3);expect(r.explain.remediation.shortTerm.every((i:any)=>i.steps.length===3&&i.validation&&i.condition&&!i.action)).toBe(true);
 expect(r.explain.remediation.immediate.some((i:any)=>i.action==='logs')).toBe(false);
 expect(JSON.stringify(r.explain)).not.toContain('/_next/image');expect(r.explain.whyItHappened.hypotheses).toEqual([]);
});
test('comparison display rejects a partial series and a baseline from another entity',()=>{
 const problem={title:'Errors',severityLevel:'ERROR',affectedEntities:[{entityId:service}]};
 const series={kind:'series',metricId:'builtin:service.errors.server.rate',entityId:service,unit:'Percent',aggregation:'avg',count:2,mean:20};
 const report={scope:{},evidence:[{id:'I',...series,window:'incident'},{id:'B',...series,entityId:root,window:'baseline'}],findings:[],limitations:[]};
 expect(buildExplainReport(problem,report).whyItHappened.comparisons).toEqual([]);
 report.evidence[1]={id:'B',...series,window:'baseline',partial:true} as any;
 expect(buildExplainReport(problem,report).whyItHappened.comparisons).toEqual([]);
});
test('comparison requires adjacent equal windows and retains accurate seconds, with no fabricated endpoint or total impact',()=>{
 const series={kind:'series',metricId:'builtin:service.response.time',entityId:service,unit:'Second',aggregation:'avg',count:2,mean:6.188};
 const r:any={scope:{},collectedAt:new Date().toISOString(),evidence:[{id:'P',kind:'problem',publishedImpacts:[{estimatedAffectedUsers:120},{estimatedAffectedUsers:120}]},{id:'I',...series,window:'incident',from:10000,to:20000},{id:'B',...series,mean:0.074,window:'baseline',from:0,to:10000}],findings:[],limitations:[]};
 const p={title:'Slow requests',severityLevel:'PERFORMANCE',affectedEntities:[{entityId:service}]};
 let e=buildExplainReport(p,r);expect(e.whyItHappened.comparisons[0].incident.value).toBe(6.188);expect(e.impact.estimatedUsersTotal).toBeNull();
 r.evidence[2].from=1000;e=buildExplainReport(p,r);expect(e.whyItHappened.comparisons).toEqual([]);
});
test('service query rejects a returned metric different from the requested metric',()=>{
 const row={dimensionMap:{'dt.entity.service':service},timestamps:[10,20],values:[1,2]};
 expect(scopedExplainSeries({result:[{metricId:'other',data:[row]}]},service,0,30,'builtin:service.errors.server.rate')).toBeNull();
});

test('mixed service and Host performance incidents retain service plan; invalid duration remains unknown',()=>{
 const report:any={evidence:[],findings:[],limitations:[],scope:{hostId:'HOST-1111111111111111'},timeline:{status:'CLOSED',startTime:1000,endTime:Date.now()+3600000},collectedAt:new Date().toISOString()};
 const problem:any={title:'Mixed',status:'CLOSED',severityLevel:'PERFORMANCE',startTime:report.timeline.startTime,endTime:report.timeline.endTime,affectedEntities:[{entityId:'HOST-1111111111111111'},{entityId:'SERVICE-2222222222222222'}]};
 const result=buildExplainReport(problem,report);expect(result.plan).toBe('service');expect(result.whatHappened.durationMinutes).toBeNull();
});
