import { metricWindows, scopedMetricSeries } from '../core/investigation-engine/metric-analysis';
import { runServiceSlowdown } from '../core/investigation-engine/service-slowdown';
import type { InvestigationDependencies } from '../core/investigation-engine/dependencies';
type Reader=(key:string,scope:string,fn:()=>Promise<Map<string,any>>)=>Promise<any>;
export function scopedExplainSeries(data:any,id:string,from:number,to:number,metricId?:string,strictBuckets=false) {
 return scopedMetricSeries(data, {'dt.entity.service':id}, metricId, 'avg', {from,to},strictBuckets);
}
export async function collectExplainServiceEvidence(ctx:InvestigationDependencies,alias:string,problem:any,result:any,id:string,read:Reader,primaryEntity?:{entity:any;evidenceId:string}) {
 const partial=()=>{result.coverage={...result.coverage,partial:true};};
 if(problem.severityLevel==='PERFORMANCE') {
   if(result.playbook) {partial();result.limitations.push('SERVICE_SLOWDOWN v1 borné au premier service publié ; service supplémentaire non analysé : '+id);return;}
   const analysis=await runServiceSlowdown(ctx,{environment_alias:alias,serviceId:id,problem,now:Date.parse(result.collectedAt)}, {read,evidenceId:()=>result.trace.at(-1).id,primaryEntity});
   result.playbook=analysis.playbook;result.evidence.push(...analysis.evidence);result.findings.push(...analysis.findings);result.limitations.push(...analysis.limitations);
   if(analysis.playbook.status==='partial'||analysis.playbook.context?.status==='partial')partial();
   return;
 }

 const windows=metricWindows(problem,Date.parse(result.collectedAt));
 if(!windows){partial();result.limitations.push('Fenêtre de référence comparable indisponible ; aucune comparaison service.');return;}
 if(windows.clipped)result.limitations.push('Fenêtre service limitée aux créneaux complets ; baseline avant le début publié.');
 const candidates=problem.severityLevel==='ERROR'?['builtin:service.errors.server.rate','builtin:service.response.time']:['builtin:service.response.time','builtin:service.errors.server.rate'];
 for(const metricId of candidates){
   if((result.explainMetricsCollected || 0)>=2)break;
   result.explainMetricsCollected=(result.explainMetricsCollected || 0)+1;
   const contract=await read('service-metric-contract','metrics.read',()=>ctx.metricsClient.getMetricDetails(metricId,alias));
   if(contract?.metricId!==metricId || !contract.unit){partial();result.limitations.push('Contrat métrique non confirmé : '+metricId);continue;}
   const refs:string[]=[],series:any[]=[];
   for(const period of [{window:'incident',...windows.incident},{window:'baseline',...windows.baseline}]){
     const response=await read('service-'+period.window,'metrics.read',()=>ctx.metricsClient.queryMetrics({metricSelector:metricId+':avg',entitySelector:`entityId("${id}")`,from:String(period.from),to:String(period.to),resolution:'5m'},alias));
     const data=scopedExplainSeries(response,id,period.from,period.to,metricId,true);
     if(!data){result.limitations.push('Série '+period.window+' absente ou ambiguë : '+metricId);continue;}
     const ref=result.trace.at(-1).id;refs.push(ref);series.push({...data,window:period.window});
     result.evidence.push({id:ref,kind:'series',entityId:id,metricId,unit:contract.unit,aggregation:'avg',window:period.window,from:period.from,to:period.to,windowBasis:windows.basis,timestampBasis:'bucket-end',...data});
   }
   if(series.length===2 && series.every(s=>s.count>=2&&!s.partial)){
     const incident=series.find(s=>s.window==='incident'),baseline=series.find(s=>s.window==='baseline');
     result.findings.push({kind:'comparison',title:metricId,text:`${id} · moyenne incidente ${incident.mean.toFixed(2)} ${contract.unit} ; référence précédente ${baseline.mean.toFixed(2)} ${contract.unit}. Même entité et agrégation ; différence descriptive, sans causalité déduite.`,evidenceRefs:refs,certainty:'observed'});
   }else {partial();result.limitations.push('Comparaison non qualifiée : points insuffisants ou série partielle pour '+metricId);}
 }
}
