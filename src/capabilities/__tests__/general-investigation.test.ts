import { investigateManagedProblem, investigationContext } from '../problem-investigation';
import { LocalInvestigationModel, InvestigationModel } from '../local-investigation-model';
import { ToolContext } from '../../tools/context';
import { permittedTool } from '../../tools/token-tool-access';
const host='HOST-1111111111111111', service='SERVICE-2222222222222222';
function fixture(id=host) {
  const map=(data:any)=>new Map([['prod',data]]);
  const problem={problemId:'P',displayId:'P-123',title:'Incident',status:'OPEN',severityLevel:'ERROR',affectedEntities:[{entityId:{id}}]};
  const query=jest.fn().mockResolvedValue(map({result:[{metricId:'builtin:host.cpu.usage',data:[{dimensionMap:{'dt.entity.host':id},timestamps:[Date.now()-600000,Date.now()-300000],values:[10,20]}]}]}));
  const ctx={authClientManager:{validAliases:['prod'],getBaseUrl:()=> 'https://example/e/prod'},
    problemsClient:{getProblemDetails:jest.fn().mockResolvedValue(map(problem))},
    entitiesClient:{getEntityDetails:jest.fn().mockResolvedValue(map({entityId:id,displayName:'demo-host'}))},
    eventsClient:{queryEvents:jest.fn().mockResolvedValue(map({events:[],totalCount:0}))},
    metricsClient:{listAvailableMetrics:jest.fn().mockResolvedValue(map({metrics:[{metricId:'builtin:host.cpu.usage',unit:'Percent',dimensionDefinitions:[{key:'dt.entity.host'}]}]})),queryMetrics:query},
    logsClient:{queryLogs:jest.fn().mockResolvedValue(map({results:[]}))},
    tokenScopesFor:()=>['problems.read','entities.read','metrics.read','events.read','logs.read'],
  } as unknown as ToolContext;
  return {ctx,query,problem};
}
const run=(ctx:ToolContext,args:any,model:InvestigationModel|null=null)=>investigateManagedProblem(ctx,{environment_alias:'prod',...args},'user',{paceMs:0,model});
test('non-disk problems collect exact affected entities, scoped events and metrics without claiming a cause',async()=>{
  const f=fixture(),r:any=await run(f.ctx,{problemId:'P'});
  expect(r.problem.displayId).toBe('P-123');expect(r.scope.hostId).toBe(host);
  expect(f.query.mock.calls[0][0].entitySelector).toBe(`entityId("${host}")`);
  expect(r.findings.some((x:any)=>x.kind==='metrics')).toBe(true);expect(r.cause.status).toBe('unknown');
  expect(r.nextSteps.map((x:any)=>x.id)).toContain('events');
  expect(investigationContext(f.ctx,'prod',r.investigationId,'user').report.problem.id).toBe('P');
  expect(()=>investigationContext(f.ctx,'prod',r.investigationId,'other')).toThrow('unavailable');
});
test('missing scopes and malicious selectors cannot produce broad reads',async()=>{
  const f=fixture();
  f.ctx.metricsClient.listAvailableMetrics=jest.fn().mockResolvedValue(new Map([['prod',{metrics:[{metricId:'builtin:host.cpu.usage:splitBy()',dimensionDefinitions:[{key:'dt.entity.host'}]}]}]]));
  await run(f.ctx,{problemId:'P'});expect(f.query).not.toHaveBeenCalled();
  f.ctx.tokenScopesFor=()=>['problems.read'];
  const r:any=await run(f.ctx,{problemId:'P'});expect(r.status).toBe('partial');expect(r.scope.entities).toEqual([]);
});
test('service logs do not escape into an environment-wide search',async()=>{
  const f=fixture(service);const r:any=await run(f.ctx,{problemId:'P',action:'logs'});
  expect(f.ctx.logsClient.queryLogs).not.toHaveBeenCalled();expect(r.limitations.join(' ')).toContain('Aucun Host');
});
test('natural questions use cached context and retain conversation in the same session',async()=>{
  const f=fixture(),initial:any=await run(f.ctx,{problemId:'P'});
  const model={plan:jest.fn().mockResolvedValue('answer'),answer:jest.fn().mockResolvedValue({answer:'Host : demo-host.',evidenceRefs:['E2']})};
  const calls=(f.ctx.problemsClient.getProblemDetails as jest.Mock).mock.calls.length;
  const next:any=await run(f.ctx,{investigationId:initial.investigationId,question:'Sur quel Host est ce problème ?'},model);
  expect(next.investigationId).toBe(initial.investigationId);expect(next.answer.answer).toContain('demo-host');
  expect((f.ctx.problemsClient.getProblemDetails as jest.Mock).mock.calls).toHaveLength(calls);expect(next.collectedAt).toBe(initial.collectedAt);
  expect(investigationContext(f.ctx,'prod',initial.investigationId,'user').conversation).toHaveLength(1);
  await run(f.ctx,{investigationId:initial.investigationId,question:'Et son état ?'},model);
  expect(model.plan.mock.calls[1][2]).toHaveLength(1);
});
test('model chooses bounded re-reads; outages preserve facts without keyword fallback',async()=>{
  const f=fixture(),initial:any=await run(f.ctx,{problemId:'P'});
  const model={plan:jest.fn().mockResolvedValue('events'),answer:jest.fn().mockResolvedValue({answer:'Aucun événement retourné.',evidenceRefs:['E3']})};
  const next:any=await run(f.ctx,{investigationId:initial.investigationId,question:'Relis les événements'},model);
  expect(next.investigationId).toBe(initial.investigationId);expect(next.action).toBe('events');
  model.plan.mockRejectedValue(Error('secret-token'));
  const unavailable:any=await run(f.ctx,{investigationId:initial.investigationId,question:'les logs ?'},model);
  expect(unavailable.llm.status).toBe('unavailable');expect(JSON.stringify(unavailable)).not.toContain('secret-token');
  expect(unavailable.problem.id).toBe('P');expect(f.ctx.logsClient.queryLogs).not.toHaveBeenCalled();
});
test('local adapter rejects cloud endpoints/models and invented evidence references',async()=>{
  expect(()=>new LocalInvestigationModel('https://external.example')).toThrow('loopback');
  expect(()=>new LocalInvestigationModel('http://127.0.0.1:11434','model:cloud')).toThrow('Local model');
  const fetcher=jest.fn().mockImplementation(async(url,options)=>{
    expect(options.redirect).toBe('error');
    return {ok:true,json:async()=>url.endsWith('/tags')?{models:[{name:'qwen3:1.7b'}]}:{done:true,message:{content:JSON.stringify({answer:'fake',evidenceRefs:['invented']})}}};
  });
  const model=new LocalInvestigationModel(undefined,undefined,fetcher as any);
  await expect(model.answer('Host ?', {evidence:[{id:'E1'}]}, [])).rejects.toThrow('Unverifiable');
  expect(permittedTool('dynatrace_managed_collect_problem_evidence',true,[['problems.read']])).toBe(true);
  expect(permittedTool('dynatrace_managed_get_investigation_context',true,[['metrics.read']])).toBe(false);
});
test('disabled local model preserves deterministic diagnosis and incident-scoped reads',async()=>{
 const before=process.env.DT_MCP_OLLAMA_ENABLED;process.env.DT_MCP_OLLAMA_ENABLED='false';
 try { const f=fixture();Object.assign(f.problem,{status:'CLOSED',startTime:1000,endTime:721000,rootCauseEntity:{entityId:{id:service},name:'dependency'},evidenceDetails:{details:[]},impactAnalysis:{impacts:[]}});
 const r:any=await investigateManagedProblem(f.ctx,{environment_alias:'prod',problemId:'P'},'user',{paceMs:0});
 expect(r.llm.status).toBe('disabled');expect(r.diagnosis.mode).toBe('deterministic');expect(r.cause.status).toBe('unknown');
 expect(f.query.mock.calls[0][0]).toMatchObject({from:'1000',to:'721000'});
 expect(r.diagnosis.publishedRootCause.entityId).toBe(service);
 }finally{if(before===undefined)delete process.env.DT_MCP_OLLAMA_ENABLED;else process.env.DT_MCP_OLLAMA_ENABLED=before;}
});

test('generic collector rejects billing metrics and wrong entity dimensions before queries',async()=>{
 const f=fixture();f.ctx.metricsClient.listAvailableMetrics=jest.fn().mockResolvedValue(new Map([['prod',{metrics:[
 {metricId:'builtin:billing.ddu.metrics.byEntity',dimensionDefinitions:[{key:'dt.entity.host'}]},
 {metricId:'builtin:host.cpu.usage',dimensionDefinitions:[{key:'dt.entity.service'}]}]}]]));
 const r:any=await run(f.ctx,{problemId:'P'});expect(f.query).not.toHaveBeenCalled();expect(r.status).toBe('partial');
 expect(r.limitations.join(' ')).toContain('opérationnelle pertinente');
});
test('generic collector rejects mismatched response metrics and out of incident points',async()=>{
 const f=fixture();Object.assign(f.problem,{status:'CLOSED',startTime:1000,endTime:721000});
 f.query.mockResolvedValue(new Map([['prod',{result:[{metricId:'other',data:[{dimensionMap:{'dt.entity.host':host},timestamps:[2000],values:[1]}]}]}]]));
 let r:any=await run(f.ctx,{problemId:'P'});expect(r.evidence.some((e:any)=>e.kind==='series')).toBe(false);
 f.query.mockResolvedValue(new Map([['prod',{result:[{metricId:'builtin:host.cpu.usage',data:[{dimensionMap:{'dt.entity.host':host},timestamps:[0,2000,800000],values:[90,10,90]}]}]}]]));
 r=await run(f.ctx,{problemId:'P'});const series=r.evidence.find((e:any)=>e.kind==='series');expect(series.points).toEqual([{t:2000,v:10}]);expect(series.partial).toBe(true);expect(r.status).toBe('partial');
});
test('Explain preserves synthetic incident declarations separately from observations and cause',async()=>{
 const f=fixture();Object.assign(f.problem,{startTime:Date.now()-600000,evidenceDetails:{details:[{data:{eventId:'evt',eventType:'CUSTOM_ALERT',title:'Test',properties:[{key:'daybreak.test',value:'true'},{key:'dt.event.description',value:'Cause asserted by producer, not verified'},{key:'daybreak.test.change',value:'Deployment declared'}]}}]}});
 const r:any=await investigateManagedProblem(f.ctx,{environment_alias:'prod',problemId:'P'},'user',{paceMs:0,model:null,explain:true});
 expect(r.explain.whatHappened.synthetic).toBe(true);expect(r.explain.whatHappened.eventContext[0]).toMatchObject({provenance:'event-declaration',description:'Cause asserted by producer, not verified'});
 expect(r.explain.whyItHappened.conclusion.certainty).toBe('unknown');expect(r.findings.some((v:any)=>v.text==='Cause asserted by producer, not verified')).toBe(false);
});

test('Host resource metrics outrank network error noise in a mixed catalogue',async()=>{
 const f=fixture();const metric=(metricId:string)=>({metricId,unit:'Percent',dimensionDefinitions:[{key:'dt.entity.host'}]});
 f.ctx.metricsClient.listAvailableMetrics=jest.fn().mockResolvedValue(new Map([['prod',{metrics:[metric('builtin:host.net.nic.packets.errors'),metric('builtin:host.mem.usage'),metric('builtin:host.cpu.usage'),metric('builtin:billing.ddu.metrics.byEntity')]}]]));
 await run(f.ctx,{problemId:'P'});expect(f.query.mock.calls.map(call=>call[0].metricSelector)).toEqual(['builtin:host.cpu.usage','builtin:host.mem.usage']);
});
