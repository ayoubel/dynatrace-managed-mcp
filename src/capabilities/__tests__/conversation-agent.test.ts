import { z } from 'zod';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import {
  converseInvestigation,
  confirmConversationAction,
  ConversationModel,
  conversationData,
  startEnvironmentConversation,
  LocalConversationModel,
} from '../conversation-agent';
import { investigateManagedProblem, investigationContext } from '../problem-investigation';
import { ToolContext, ConversationTool } from '../../tools/context';
import { permittedTool } from '../../tools/token-tool-access';
const uuid = '5649c3bb-44c7-4373-b15b-77950f77b31a';
function tool(
  name: string,
  shape: any,
  readOnly = true,
  cb: any = jest.fn().mockResolvedValue('{"valid":true}'),
): ConversationTool {
  const schema = z.object(shape).strict();
  return {
    name: 'dynatrace_managed_' + name,
    description: name,
    inputSchema: toJsonSchemaCompat(schema),
    annotations: { readOnlyHint: readOnly },
    parse: (a) => schema.parse(a),
    invoke: cb,
  };
}
async function fixture() {
  const available: ConversationTool[] = [],
    ctx = {
      investigationOwner: 'tester',
      authClientManager: { validAliases: ['prod'], getBaseUrl: () => 'https://example/e/' + uuid },
      tokenScopesFor: () => ['problems.read'],
      problemsClient: {
        getProblemDetails: jest
          .fn()
          .mockResolvedValue(
            new Map([
              ['prod', { problemId: 'P', displayId: 'P-123', title: 'CPU', status: 'OPEN', affectedEntities: [] }],
            ]),
          ),
      },
      conversationTools: () => available,
    } as unknown as ToolContext;
  const report: any = await investigateManagedProblem(ctx, { environment_alias: 'prod', problemId: 'P' }, 'tester', {
    paceMs: 0,
    model: null,
  });
  return {
    ctx,
    available,
    args: { environment_alias: 'prod', investigationId: report.investigationId, question: 'Question' },
    report,
  };
}
function model(names: string[], args: any[], answer = 'Réponse'): ConversationModel {
  return {
    choose: jest.fn().mockImplementation(() => Promise.resolve(names.shift() || 'answer')),
    arguments: jest.fn().mockImplementation(() => Promise.resolve(args.shift())),
    respond: jest.fn().mockResolvedValue({ answer, evidenceRefs: ['ENV'] }),
  };
}
test('cached environment context and exchanges are supplied to local model with same investigation', async () => {
  const f = await fixture(),
    m = model(['answer'], [], 'Environnement ' + uuid);
  const r = await converseInvestigation(f.ctx, { ...f.args, question: 'Quel est mon environnement ?' }, m);
  expect(r.investigationId).toBe(f.report.investigationId);
  expect(r.summary).toContain(uuid);
  expect((m.choose as jest.Mock).mock.calls[0][0].context.environment.id).toBe(uuid);
  expect(f.ctx.problemsClient.getProblemDetails).toHaveBeenCalledTimes(1);
  await converseInvestigation(f.ctx, { ...f.args, question: 'Et son alias ?' }, m);
  expect((m.choose as jest.Mock).mock.calls[1][0].history[0].question).toContain('environnement');
});
test('dynamic tool catalog schemas support chained reads and bind the alias; results are retained', async () => {
  const f = await fixture(),
    cb = jest.fn().mockResolvedValue('{"entityId":"HOST-123","displayName":"Host A"}');
  f.available.push(tool('discover_entities', { environment_alias: z.string(), entitySelector: z.string() }, true, cb));
  const m = model(['dynatrace_managed_discover_entities', 'answer'], [{ entitySelector: 'type(HOST)' }]);
  const r = await converseInvestigation(f.ctx, f.args, m);
  expect(cb).toHaveBeenCalledWith({ environment_alias: 'prod', entitySelector: 'type(HOST)' });
  expect((m.respond as jest.Mock).mock.calls[0][0].results[0].data).toContain('Host A');
  expect(r.availableTools[0].name).toContain('discover_entities');
});
test('parameterless environment lookup uses its exact schema and stays scoped to the investigation', async () => {
  const f = await fixture(), invoke = jest.fn();
  f.available.push(tool('get_environments_info', {}, true, invoke));
  const m = model(['dynatrace_managed_get_environments_info', 'answer'], []);
  const result = await converseInvestigation(f.ctx, f.args, m);
  expect(m.arguments).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
  expect(result.trace[0].status).toBe('ok');
  expect(result.toolResults[0].data.environment.id).toBe(uuid);
});
test('environment sessions require no problem and can converse with scoped memory', async () => {
  const f=await fixture();
  const report=await startEnvironmentConversation(f.ctx,{environment_alias:'prod'});
  expect(report.problem).toBeNull();expect(report.sessionKind).toBe('environment');
  const m=model(['answer'],[], 'Environnement '+uuid);
  const next=await converseInvestigation(f.ctx,{...f.args,investigationId:report.investigationId},m);
  expect(next.problem).toBeNull();expect(next.investigationId).toBe(report.investigationId);
  await expect(startEnvironmentConversation(f.ctx,{environment_alias:'other'})).rejects.toThrow();
  expect(permittedTool('dynatrace_managed_start_conversation',true,[['metrics.read']])).toBe(true);
  expect(permittedTool('dynatrace_managed_converse_investigation',true,[['ReadConfig']])).toBe(true);
  expect(permittedTool('dynatrace_managed_start_conversation',true,[['unknown']])).toBe(false);
});
test('local adapter accepts exact MCP names and constrains answer references to available facts',async()=>{
  let choice='dynatrace_managed_list_dashboards';const bodies:any[]=[];
  const fetcher=jest.fn(async(url:any,options:any)=>{
    if(String(url).endsWith('/tags'))return {ok:true,json:async()=>({models:[{name:'qwen3:1.7b'}]})};
    const body=JSON.parse(options.body);bodies.push(body);
    return {ok:true,json:async()=>({done:true,message:{content:JSON.stringify(body.format.properties.tool?{tool:choice}:{answer:'Demo',evidenceRefs:['ENV']})}})};
  }) as unknown as typeof fetch;
  const local=new LocalConversationModel(undefined,undefined,fetcher),data={question:'Demo',context:{environment:{id:uuid},evidence:[{id:'E1'}]},history:[],results:[{id:'C1',data:'demo'}]};
  const available=[tool('list_dashboards',{environment_alias:z.string()})];
  expect(await local.choose(data,available)).toBe('dynatrace_managed_list_dashboards');
  choice='list_dashboards';expect(await local.choose(data,available)).toBe('dynatrace_managed_list_dashboards');
  await local.respond(data);expect(bodies.at(-1).format.properties.evidenceRefs.items.enum).toEqual(['ENV','E1','C1']);
});
test('page context uses only an authorized read in the selected environment and blocks missing permissions',async()=>{
  const f=await fixture(),read=jest.fn().mockResolvedValue('{"entityId":"HOST-1111111111111111","displayName":"Host demo"}');
  await expect(startEnvironmentConversation(f.ctx,{environment_alias:'prod',target:{kind:'entity',id:'HOST-1111111111111111'}})).rejects.toThrow('indisponible');
  f.available.push(tool('get_entity_details',{environment_alias:z.string(),entityId:z.string()},true,read));
  const r=await startEnvironmentConversation(f.ctx,{environment_alias:'prod',target:{kind:'entity',id:'HOST-1111111111111111'}});
  expect(read).toHaveBeenCalledWith({environment_alias:'prod',entityId:'HOST-1111111111111111'});
  expect(r.scope.entities[0].entityId).toBe('HOST-1111111111111111');expect(r.toolResults[0].data.displayName).toBe('Host demo');
  await expect(converseInvestigation({...f.ctx,investigationOwner:'other'},{...f.args,investigationId:r.investigationId},model(['answer'],[]))).rejects.toThrow('unavailable');
});
test('model cannot change environment, invoke an unknown tool or fabricate citations', async () => {
  const f = await fixture(),
    cb = jest.fn();
  f.available.push(tool('query', { environment_alias: z.string(), selector: z.string().optional() }, true, cb));
  await converseInvestigation(
    f.ctx,
    f.args,
    model(['dynatrace_managed_query', 'answer'], [{ environment_alias: 'other' }]),
  );
  expect(cb).not.toHaveBeenCalled();
  const unknown=model(['unregistered'], []);
  await converseInvestigation(f.ctx,f.args,unknown);
  expect((unknown.respond as jest.Mock).mock.calls[0][0].toolUnavailable).toBe(true);
  expect(cb).not.toHaveBeenCalled();
  const m = model(['answer'], []);
  (m.respond as jest.Mock).mockResolvedValue({ answer: 'X', evidenceRefs: ['invented'] });
  await expect(converseInvestigation(f.ctx, f.args, m)).rejects.toThrow('vérifiable');
});
test('write proposals validate without invoking writes; confirmation is owner-bound and single-use', async () => {
  const f = await fixture(),
    write = jest.fn().mockResolvedValue('{"created":true,"verified":true}'),
    validate = jest.fn().mockResolvedValue('{"valid":true}');
  const shape = {
    environment_alias: z.string(),
    dashboard: z.object({
      dashboardMetadata: z.object({ name: z.string(), owner: z.string() }),
      tiles: z.array(z.any()),
    }),
  };
  f.available.push(tool('create_dashboard', shape, false, write), tool('validate_dashboard', shape, true, validate));
  const input = { dashboard: { dashboardMetadata: { name: 'CPU', owner: 'sre' }, tiles: [] } };
  const r = await converseInvestigation(f.ctx, f.args, model(['dynatrace_managed_create_dashboard'], [input]));
  expect(write).not.toHaveBeenCalled();
  expect(validate).toHaveBeenCalledTimes(1);
  expect(r.pendingAction.arguments.environment_alias).toBe('prod');
  await expect(
    confirmConversationAction({ ...f.ctx, investigationOwner: 'other' }, { ...f.args, approvalId: r.pendingAction.id }),
  ).rejects.toThrow('unavailable');
  const result = await confirmConversationAction(f.ctx, { ...f.args, approvalId: r.pendingAction.id });
  expect(result.summary).toContain('vérifiée');
  expect(write).toHaveBeenCalledTimes(1);
  await expect(confirmConversationAction(f.ctx, { ...f.args, approvalId: r.pendingAction.id })).rejects.toThrow(
    'consommée',
  );
});
test('failed write consumes approval, never retries, and keeps prior problem findings', async () => {
  const f = await fixture(),
    write = jest.fn().mockRejectedValue(Error('secret upstream'));
  const shape = { environment_alias: z.string(), slo: z.object({ name: z.string() }) };
  f.available.push(tool('create_slo', shape, false, write), tool('preview_slo', shape));
  const r = await converseInvestigation(
    f.ctx,
    f.args,
    model(['dynatrace_managed_create_slo'], [{ slo: { name: 'test' } }]),
  );
  const result = await confirmConversationAction(f.ctx, { ...f.args, approvalId: r.pendingAction.id });
  expect(result.summary).toContain('incertain');
  expect(JSON.stringify(result)).not.toContain('secret upstream');
  expect(result.problem.id).toBe('P');
  await expect(confirmConversationAction(f.ctx, { ...f.args, approvalId: r.pendingAction.id })).rejects.toThrow();
  expect(write).toHaveBeenCalledTimes(1);
});
test('secrets are stripped before inference and permission policy remains fail closed', () => {
  expect(conversationData({ token: 'SECRET', nested: { authorization: 'SECRET', value: 'ok' } })).toEqual({
    nested: { value: 'ok' },
  });
  expect(permittedTool('dynatrace_managed_converse_investigation', true, [['problems.read']])).toBe(true);
  expect(permittedTool('dynatrace_managed_confirm_conversation_action', false, [['problems.read']])).toBe(false);
  expect(
    permittedTool('dynatrace_managed_confirm_conversation_action', false, [['problems.read', 'WriteConfig']]),
  ).toBe(true);
});
test('expired confirmation and revoked tool exposure cannot dispatch a write', async () => {
  const f = await fixture(),
    write = jest.fn().mockResolvedValue('{}'),
    shape = { environment_alias: z.string(), slo: z.object({ name: z.string() }) };
  f.available.push(tool('create_slo', shape, false, write), tool('preview_slo', shape));
  const r = await converseInvestigation(
    f.ctx,
    f.args,
    model(['dynatrace_managed_create_slo'], [{ slo: { name: 'demo' } }]),
  );
  f.available.splice(0, 1);
  await expect(confirmConversationAction(f.ctx, { ...f.args, approvalId: r.pendingAction.id })).rejects.toThrow(
    'autorisé',
  );
  expect(write).not.toHaveBeenCalled();
});
test('identical reads do not loop in one turn and failures remain available to the model', async () => {
  const f = await fixture(),
    read = jest.fn().mockRejectedValue(Error('private upstream'));
  f.available.push(tool('list_dashboards', { environment_alias: z.string() }, true, read));
  const m = model(['dynatrace_managed_list_dashboards', 'answer'], [{}]);
  const r = await converseInvestigation(f.ctx, f.args, m);
  expect(read).toHaveBeenCalledTimes(1);
  expect((m.choose as jest.Mock).mock.calls[1][1]).toEqual([]);
  expect(JSON.stringify(r)).not.toContain('private upstream');
});
test('confirmed preview is complete even beyond presentation limits; fresh reads are not served from old cache',async()=>{
  const f=await fixture(),shape={environment_alias:z.string(),dashboard:z.object({dashboardMetadata:z.object({name:z.string(),owner:z.string()}),tiles:z.array(z.any())})};
  const write=jest.fn().mockResolvedValue('{"created":true,"verified":true,"id":"resource"}');f.available.push(tool('create_dashboard',shape,false,write),tool('validate_dashboard',shape));
  const tiles=Array.from({length:35},(_,i)=>({name:'Tile '+i,markdown:'x'.repeat(5000)}));
  const r=await converseInvestigation(f.ctx,f.args,model(['dynatrace_managed_create_dashboard'],[{dashboard:{dashboardMetadata:{name:'Demo',owner:'sre'},tiles}}]));
  expect(r.pendingAction.arguments.dashboard.tiles).toEqual(tiles);
  await confirmConversationAction(f.ctx,{...f.args,approvalId:r.pendingAction.id});
  const next=model(['answer'],[]);await converseInvestigation(f.ctx,f.args,next);expect(JSON.stringify((next.choose as jest.Mock).mock.calls[0][0].results)).toContain('resource');
  const read=jest.fn().mockResolvedValue('{"dashboards":[]}');f.available.push(tool('list_dashboards',{environment_alias:z.string()},true,read));
  await converseInvestigation(f.ctx,f.args,model(['dynatrace_managed_list_dashboards','answer'],[{}]));
  await converseInvestigation(f.ctx,f.args,model(['dynatrace_managed_list_dashboards','answer'],[{}]));expect(read).toHaveBeenCalledTimes(2);
});
test('same tool can read different IDs in one turn without duplicate calls',async()=>{
  const f=await fixture(),read=jest.fn().mockResolvedValue('{}');f.available.push(tool('get_entity_details',{environment_alias:z.string(),entityId:z.string()},true,read));
  await converseInvestigation(f.ctx,f.args,model(['dynatrace_managed_get_entity_details','dynatrace_managed_get_entity_details','answer'],[{entityId:'HOST-A'},{entityId:'HOST-B'}]));expect(read).toHaveBeenCalledTimes(2);
});
