import { ToolContext } from '../tools/context';
import { incidentWindow } from './published-problem-diagnosis';
type Reader=(key:string,scope:string,fn:()=>Promise<Map<string,any>>)=>Promise<any>;
export function scopedExplainSeries(data:any,id:string,from:number,to:number,metricId?:string) {
 const rows=(data?.result || []).filter((r:any)=>!metricId || r.metricId===metricId || r.metricId===metricId+':avg').flatMap((r:any)=>(r.data || []).map((s:any)=>({r,s}))).filter(({s}:any)=>s.dimensionMap?.['dt.entity.service']===id);
 if(rows.length!==1)return null;
 const {r,s}=rows[0];const all=(s.timestamps || []).map((t:any,i:number)=>({t,v:s.values?.[i]}));
 const points=all.filter((p:any)=>Number.isFinite(p.t)&&Number.isFinite(p.v)&&p.t>=from&&p.t<to).sort((a:any,b:any)=>a.t-b.t);
 if(!points.length)return null;
 const partial=!!data.nextPageKey || r.dataPointCountRatio<1 || r.dimensionCountRatio<1 || points.length>100 || points.length!==all.length || points.some((p:any,i:number)=>i>0&&p.t-points[i-1].t>300000);
 return {count:points.length,mean:points.reduce((n:number,p:any)=>n+p.v,0)/points.length,first:points[0],last:points.at(-1),partial,points:points.slice(-100)};
}
export async function collectExplainServiceEvidence(ctx:ToolContext,alias:string,problem:any,result:any,id:string,read:Reader) {
 const partial=()=>{result.coverage={...result.coverage,partial:true};};
 const window=incidentWindow(problem);
 if(!window || window.to<=window.from || window.from<window.to-window.from){partial();result.limitations.push('Fenêtre de référence comparable indisponible ; aucune comparaison service.');return;}
 const duration=window.to-window.from;
 const candidates=problem.severityLevel==='ERROR'?['builtin:service.errors.server.rate','builtin:service.response.time']:['builtin:service.response.time','builtin:service.errors.server.rate'];
 for(const metricId of candidates){
   if((result.explainMetricsCollected || 0)>=2)break;
   result.explainMetricsCollected=(result.explainMetricsCollected || 0)+1;
   const contract=await read('service-metric-contract','metrics.read',()=>ctx.metricsClient.getMetricDetails(metricId,alias));
   if(contract?.metricId!==metricId || !contract.unit){partial();result.limitations.push('Contrat métrique non confirmé : '+metricId);continue;}
   const refs:string[]=[],series:any[]=[];
   for(const period of [{window:'incident',from:window.from,to:window.to},{window:'baseline',from:window.from-duration,to:window.from}]){
     const response=await read('service-'+period.window,'metrics.read',()=>ctx.metricsClient.queryMetrics({metricSelector:metricId+':avg',entitySelector:`entityId("${id}")`,from:String(period.from),to:String(period.to),resolution:'5m'},alias));
     const data=scopedExplainSeries(response,id,period.from,period.to,metricId);
     if(!data){result.limitations.push('Série '+period.window+' absente ou ambiguë : '+metricId);continue;}
     const ref=result.trace.at(-1).id;refs.push(ref);series.push({...data,window:period.window});
     result.evidence.push({id:ref,kind:'series',entityId:id,metricId,unit:contract.unit,aggregation:'avg',window:period.window,from:period.from,to:period.to,...data});
   }
   if(series.length===2 && series.every(s=>s.count>=2&&!s.partial)){
     const incident=series.find(s=>s.window==='incident'),baseline=series.find(s=>s.window==='baseline');
     result.findings.push({kind:'comparison',title:metricId,text:`${id} · moyenne incidente ${incident.mean.toFixed(2)} ${contract.unit} ; référence précédente ${baseline.mean.toFixed(2)} ${contract.unit}. Même entité et agrégation ; différence descriptive, sans causalité déduite.`,evidenceRefs:refs,certainty:'observed'});
   }else {partial();result.limitations.push('Comparaison non qualifiée : points insuffisants ou série partielle pour '+metricId);}
 }
}
