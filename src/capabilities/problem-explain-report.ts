import { incidentWindow } from './published-problem-diagnosis';
import { explainRemediation } from './explain-remediation';
const clean=(v:any)=>String(v ?? '').slice(0,500);
const entityId=(v:any)=>typeof v==='string'?v:v?.id;
export interface ExplainItem {title:string;text:string;certainty:'published'|'observed'|'unknown'|'conditional'|'hypothesis';evidenceRefs:string[];condition?:string;action?:string;}
const formatMeasure=(value:number,unit:string)=>{
 const scales:Record<string,[number,string]>={MicroSecond:[1000,'ms'],MilliSecond:[1,'ms'],Second:[1,'s'],Percent:[1,'%'],Byte:[1,'octets']};
 const [scale,label]=scales[unit] || [1,unit];
 const converted=value/scale,seconds=label==='ms'&&Math.abs(converted)>=1000;
 const displayed=seconds?converted/1000:converted,displayUnit=seconds?'s':label;
 return {value:displayed,unit:displayUnit,text:displayed.toLocaleString('fr-FR',{maximumFractionDigits:seconds?3:2})+' '+displayUnit};
};
/** Directly renderable contract. Facts, hypotheses and conditional guidance stay in the MCP. */
export function buildExplainReport(problem:any,report:any) {
 const evidence=report.evidence || [];
 const source=evidence.find((e:any)=>e.kind==='problem'),refs=source?[source.id]:[];
 const ids=(rows:any[])=>[...new Set<string>(rows.map((e:any)=>entityId(e.entityId)).filter((id:any)=>typeof id==='string'))];
 const affected=ids(problem.affectedEntities || []),impacted=ids(problem.impactedEntities || []);
 const root=report.diagnosis?.publishedRootCause;
 const plan=report.scope?.diskId?'disk':[...affected,...impacted,root?.entityId].some(id=>id?.startsWith('SERVICE-')) && ['ERROR','PERFORMANCE'].includes(problem.severityLevel)?'service':[...affected,...impacted].some(id=>/^(HTTP_CHECK|SYNTHETIC_TEST)-/.test(id))?'synthetic':[...affected,...impacted].some(id=>id.startsWith('HOST-'))&&['RESOURCE_CONTENTION','PERFORMANCE','AVAILABILITY'].includes(problem.severityLevel)?'infrastructure':'generic';
 const item=(title:string,text:string,certainty:ExplainItem['certainty'],evidenceRefs=refs):ExplainItem=>({title,text,certainty,evidenceRefs});
 const entities=[...new Set([...affected,...impacted])].map(id=>{
   const published=[...(problem.affectedEntities || []),...(problem.impactedEntities || [])].find((e:any)=>entityId(e.entityId)===id);
   const detail=evidence.find((e:any)=>e.kind==='entity'&&e.entityId===id);
   const scope=(report.scope?.entities || []).find((e:any)=>e.entityId===id);
   return {id,name:clean(published?.name || detail?.name || scope?.name || (report.scope?.hostId===id?report.scope.hostName:null) || id),type:id.split('-')[0],evidenceRefs:[...refs,...(detail?[detail.id]:[])]};
 });
 const comparisons:any[]=[];
 for(const incident of evidence.filter((e:any)=>e.kind==='series'&&e.window==='incident')){
   const baseline=evidence.find((e:any)=>e.kind==='series'&&e.window==='baseline'&&e.metricId===incident.metricId&&e.entityId===incident.entityId);
   if(!baseline || !incident.unit || incident.unit!==baseline.unit || incident.count<2 || baseline.count<2 || [incident,baseline].some(e=>e.partial||e.gaps||e.truncated))continue;
   if(![incident.from,incident.to,baseline.from,baseline.to].every(Number.isFinite) || incident.to<=incident.from || baseline.to!==incident.from || incident.to-incident.from!==baseline.to-baseline.from)continue;
   const serviceComparison=plan==='service'&&incident.aggregation==='avg'&&baseline.aggregation==='avg'&&Number.isFinite(incident.mean)&&Number.isFinite(baseline.mean);
   const diskComparison=plan==='disk'&&Number.isFinite(incident.max)&&Number.isFinite(baseline.max);
   if(!serviceComparison&&!diskComparison)continue;
   const title=incident.metricId==='builtin:service.errors.server.rate'?'Erreurs côté serveur':incident.metricId==='builtin:service.response.time'?'Temps de réponse moyen':'Usage disque · maximum';
   const before=formatMeasure(serviceComparison?baseline.mean:baseline.max,baseline.unit),during=formatMeasure(serviceComparison?incident.mean:incident.max,incident.unit);
   comparisons.push({title,metricId:incident.metricId,entityId:incident.entityId,entityName:clean(evidence.find((e:any)=>e.kind==='entity'&&e.entityId===incident.entityId)?.name || root?.entityId===incident.entityId&&root.name || incident.entityId),baseline:before,incident:during,windows:{baseline:{from:baseline.from,to:baseline.to},incident:{from:incident.from,to:incident.to}},aggregation:serviceComparison?'avg':'max',certainty:'observed',evidenceRefs:[incident.id,baseline.id]});
 }
 const observations=(report.findings || []).filter((f:any)=>f.certainty==='observed'&&f.kind!=='context').map((f:any)=>item(f.title,f.text,'observed',f.evidenceRefs));
 if(plan==='disk'&&comparisons.length)for(const c of comparisons)observations.unshift(item('Comparaison disque',`Maximum incident : ${c.incident.text} ; précédent : ${c.baseline.text}. Cet écart ne démontre ni saturation ni cause.`,'observed',c.evidenceRefs));
 const hypotheses=(report.findings || []).filter((f:any)=>f.certainty==='hypothesis').map((f:any)=>item(f.title,f.text,'hypothesis',f.evidenceRefs));
 const timeline=report.timeline;
 const start=timeline?.startTime,end=timeline?.status==='OPEN'?Date.parse(report.collectedAt):timeline?.endTime;
 const durationMinutes=incidentWindow(problem,Date.parse(report.collectedAt))&&Number.isFinite(start)&&start>=0&&Number.isFinite(end)&&end>=start?(end-start)/60000:null;
 const declarations=evidence.filter((e:any)=>e.kind==='events'&&String(e.id).startsWith('published-event-')).flatMap((e:any)=>(e.events || []).map((event:any)=>({...event,evidenceRefs:[e.id]})));
 const named=entities.slice(0,3).map(e=>e.name).join(', ');
 const summary=clean(problem.title)+(named?' · '+named:'');
 return {version:1,mode:'deterministic',plan,
   whatHappened:{title:'Ce qui s’est passé',summary,status:clean(problem.status),severity:clean(problem.severityLevel),timeline,durationMinutes,eventContext:declarations,synthetic:declarations.some((e:any)=>e.synthetic),evidenceRefs:refs},
   impact:{title:'Impact',affectedEntities:affected,impactedEntities:impacted,entities,perEntity:source?.publishedImpacts || [],estimatedUsersTotal:null,partial:!!source?.partial,unknowns:!(source?.publishedImpacts || []).some((i:any)=>Number.isFinite(i.estimatedAffectedUsers))?['Impact utilisateur non quantifié.']:[],evidenceRefs:refs},
   whyItHappened:{title:'Pourquoi c’est arrivé',conclusion:root?item('Cause désignée par Davis',root.name || root.entityId,'published',root.evidenceRefs):item('Cause non établie','Aucune cause racine exploitable retournée par Dynatrace.','unknown'),mechanism:item('Mécanisme causal non confirmé','Les observations et corrélations ne suffisent pas à expliquer le mécanisme technique.','unknown'),comparisons,observations,hypotheses,unknowns:[...new Set(report.limitations || [])]},
   remediation:explainRemediation(plan,refs,!!root,!!report.scope?.hostId),
   collection:{observedAt:report.collectedAt,window:report.collectionWindow || null,bounded:true,steps:(report.trace || []).map((t:any)=>({id:t.id,task:t.kind,status:t.status,reason:t.reason}))},
 };
}
