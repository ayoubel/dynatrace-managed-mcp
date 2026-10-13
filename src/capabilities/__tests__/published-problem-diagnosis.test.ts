import { enrichPublishedDiagnosis, incidentWindow } from '../published-problem-diagnosis';
function report() { return {evidence:[{id:'E1',kind:'problem'}],findings:[],limitations:[]}; }
test('published impact remains per entity and root cause does not become a causal mechanism',()=>{
 const r:any=report();enrichPublishedDiagnosis({status:'CLOSED',startTime:1000,endTime:721000,
 rootCauseEntity:{entityId:{id:'SERVICE-1111111111111111'},name:'dependency'},
 evidenceDetails:{totalCount:1,details:[{rootCauseRelevant:true,displayName:'Failure rate',entity:{entityId:{id:'SERVICE-1111111111111111'}}}]},
 impactAnalysis:{impacts:[{estimatedAffectedUsers:120,impactedEntity:{name:'web'}},{estimatedAffectedUsers:120,impactedEntity:{name:'api'}}]}},r);
 expect(r.diagnosis.publishedRootCause.entityId).toBe('SERVICE-1111111111111111');
 expect(r.diagnosis.causalMechanism).toBe('unknown');expect(r.diagnosis.rootCauseEvidence).toHaveLength(1);
 expect(r.findings.filter((f:any)=>f.kind==='impact')).toHaveLength(2);expect(r.findings.some((f:any)=>f.text.includes('240'))).toBe(false);
 expect(r.findings.find((f:any)=>f.kind==='timeline').text).toContain('12.0');
});
test('missing Davis data and invalid dates cannot imply no impact, recovery or an invented duration',()=>{
 const r:any=report();enrichPublishedDiagnosis({status:'OPEN',startTime:Date.now()+600000,endTime:-1},r);
 expect(r.timeline.endTime).toBeNull();expect(r.findings).toEqual([]);
 expect(r.diagnosis.publishedRootCause).toBeNull();expect(r.limitations.join(' ')).toContain('non retournées');
 expect(incidentWindow({status:'CLOSED',startTime:10,endTime:0})).toBeNull();
});
test('incident collection is historical, bounded and truncated evidence is explicit',()=>{
 const r:any=report();enrichPublishedDiagnosis({status:'CLOSED',startTime:1000,endTime:10801000,
 evidenceDetails:{totalCount:25,details:Array.from({length:25},()=>({rootCauseRelevant:true}))}},r);
 expect(incidentWindow({status:'CLOSED',startTime:1000,endTime:10801000})).toEqual({from:3601000,to:10801000,partial:true});
 expect(r.evidence[0].publishedEvidence).toHaveLength(20);expect(r.limitations.join(' ')).toContain('partielles');
});
