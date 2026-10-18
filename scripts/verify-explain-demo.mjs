import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {launchDemo,until} from './explain-demo-runtime.mjs';
import {verifyNative} from './explain-demo-native.mjs';
const option=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];},require=createRequire(import.meta.url);
const result={status:'RUNNING',synthetic:true,checks:[],limits:['No real Managed or credentials','Davis attribution is published; technical mechanism remains unknown','Headless automated Chrome, not manual acceptance']};
const check=(id,detail)=>{result.checks.push({id,status:'PASS',detail});console.log('PASS '+id);};
let context,cdp,runtime,page;
try{
 const {chromium}=require(option('--playwright') || 'playwright'),chrome=option('--chrome'),extensionRoot=option('--extension-root');
 if(!chrome || !extensionRoot)throw Error('--chrome and --extension-root required for mandatory native acceptance');
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'daybreak-explain-chrome-'));result.profile=profile;
 context=await chromium.launchPersistentContext(profile,{executablePath:chrome,headless:true,acceptDownloads:true,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging','--disable-background-networking','--disable-component-update','--disable-default-apps','--disable-sync','--no-first-run','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
 cdp=await context.browser().newBrowserCDPSession();result.chrome=await cdp.send('Browser.getVersion');const loaded=await cdp.send('Extensions.loadUnpacked',{path:path.resolve(extensionRoot,'extension')});
 runtime=await launchDemo({gatewayRoot:option('--gateway-root'),output:option('--output'),extensionOrigin:'chrome-extension://'+loaded.id});result.dir=runtime.dir;result.origin=runtime.origin;
 await fs.mkdir(runtime.dir+'/screenshots');await fs.mkdir(runtime.dir+'/exports');
 const blocked=[];await context.route('**/*',route=>{const url=new URL(route.request().url());if(['about:','chrome-extension:','data:','blob:'].includes(url.protocol)||url.origin===runtime.origin)return route.continue();blocked.push(url.origin);return route.abort();});
 const {validateInvestigationReport}=require(runtime.build+'/src/core/investigation-engine/index.js');
 const environments=(await runtime.get('/api/extension/context')).environments,first=environments.find(e=>e.url.endsWith('/first')),second=environments.find(e=>e.url.endsWith('/second'));assert.ok(first&&second);assert.equal((await runtime.get('/api/extension/context')).localLlmDisabled,true);check('I01 isolation, two environments and unavailable LLM',{networkGuard:true});
 assert.equal((await runtime.get('/api/status')).hasSnapshot,false);check('I00 Explain starts without a Morning Check snapshot');
 const done=id=>until(async()=>{const job=await runtime.get('/api/workbench/'+id);return !['running','executing'].includes(job.status)&&job;});
 const start=async(env,id,extra={})=>{const response=await runtime.post('/api/workbench/start',{kind:'investigation',input:{layer:'services',environmentId:env,problemId:id,analysisMode:'explain',...extra}});assert.equal(response.status,202);return done((await response.json()).id);};
 const jobs={};
 for(const id of ['RICH','AMBIGUOUS','POOR','STALE','CONTRADICTORY','S02','S08','S08-timeout','S08-budget']){
  const job=await start(first.id,id);assert.equal(job.status,'completed');const report=validateInvestigationReport(job.result.problemInvestigations[0]);jobs[id]=job;
  assert.equal(report.problem.id,id);assert.equal(report.environment.url,first.url);assert.equal(report.llm.status,'disabled');assert.equal(report.explain.whyItHappened.mechanism.certainty,'unknown');
  const why=report.explain.whyItHappened;
  const invocation=(await runtime.audit()).filter(e=>e.tool?.startsWith('dynatrace_managed_')).at(-1);assert.equal(invocation.tool,'dynatrace_managed_explain_problem');assert.equal(invocation.args.problemId,id);
  if(id==='RICH'){assert.equal(why.conclusion.certainty,'published');assert.ok(why.conclusion.evidenceRefs.length);assert.equal(report.diagnosis.rootCauseEvidence.length,1);assert.ok(why.comparisons.length);}
  else assert.equal(why.conclusion.certainty,'unknown');
  if(id==='AMBIGUOUS')assert.ok(why.hypotheses.length>=2);
  if(['POOR','STALE'].includes(id)){assert.equal(report.status,'partial');assert.equal(why.comparisons.length,0);}
  if(['CONTRADICTORY','S08','S08-timeout','S08-budget'].includes(id))assert.equal(report.status,'partial');
  for(const format of ['json','md','html']){const response=await fetch(runtime.origin+'/api/workbench/'+job.id+'/'+format);assert.equal(response.status,200);const content=await response.text();assert.ok(content.includes(id));assert.ok(!content.includes('private upstream detail'));await fs.writeFile(runtime.dir+'/exports/'+id+'.'+format,content);}
  check('E-'+id,{job:job.id,status:report.status,evidence:report.evidence.length,hypotheses:why.hypotheses.length,conclusion:why.conclusion.certainty});
 }
 const secondJob=await start(second.id,'RICH');assert.equal(secondJob.result.problemInvestigations[0].environment.url,second.url);assert.notEqual(secondJob.id,jobs.RICH.id);assert.notEqual(secondJob.result.problemInvestigations[0].investigationId,jobs.RICH.result.problemInvestigations[0].investigationId);check('I02 environment and investigation isolation');
 const original=JSON.stringify(jobs.RICH.initialProblemReports);await runtime.control({expire:true});const refreshed=await start(first.id,'RICH',{continue:true,sourceJobId:jobs.RICH.id,action:'explain'});assert.equal(refreshed.id,jobs.RICH.id);assert.equal(JSON.stringify(refreshed.initialProblemReports),original);assert.ok(refreshed.sessionTurns.at(-1).sessionRenewal);check('E-refresh bounded session renewal and immutable original');
 for(const control of [{fail:true},{malformed:true},{fatal:true}]){await runtime.control(control);const failed=await start(first.id,'RICH',{continue:true,sourceJobId:jobs.RICH.id,action:'explain'});assert.equal(failed.status,'failed');assert.ok(!failed.sessionTurns.at(-1).report);assert.equal(JSON.stringify(failed.initialProblemReports),original);assert.ok(!JSON.stringify(failed).includes('private upstream detail'));check('F-'+Object.keys(control)[0],{previousReportPreserved:true});}
 await runtime.control({});
 const invalid=await runtime.post('/api/workbench/start',{kind:'investigation',input:{environmentId:first.id,problemId:'bad;selector',analysisMode:'explain'}});assert.equal(invalid.status,400);
 const forbidden=await runtime.post('/api/workbench/confirm',{});assert.equal(forbidden.status,403);check('I03 invalid input and write refusal');
 page=await context.newPage();await page.setViewportSize({width:1440,height:1000});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(runtime.origin+'/workspace');await page.waitForFunction(()=>!!document.documentElement.dataset.loadedMs);assert.equal(await page.locator('#launch-explain').isDisabled(),true);
 await page.selectOption('#environment',first.id);await page.getByRole('button',{name:'Choisir un problème ouvert',exact:true}).click();await page.waitForSelector('#problem-list option[value="RICH"]',{state:'attached'});await page.selectOption('#problem-list','RICH');assert.equal(await page.inputValue('#problem-id'),'RICH');
 await runtime.control({delay:true});await page.getByRole('button',{name:'Lancer Explain',exact:true}).click();await page.waitForSelector('.status-strip');assert.match(await page.locator('#content').innerText(),/cours/);await page.waitForFunction(()=>document.querySelector('.status-strip')?.textContent.includes('Terminée'));await runtime.control({});
 await page.waitForFunction(()=>!document.getElementById('launch-explain').disabled);
 assert.ok((await page.locator('.executive-conclusion').innerText()).includes('Cause désignée par Davis'));assert.ok((await page.locator('#content').innerText()).includes('120 utilisateurs estimés'));
 const uiJob=new URLSearchParams(new URL(page.url()).hash.slice(1)).get('job');await page.screenshot({path:runtime.dir+'/screenshots/web-rich.png',fullPage:true});check('W01 initial Web launch from empty selection, real progress, published cause and impact',{job:uiJob});
 await page.locator('.evidence-link').first().click();await page.waitForSelector('.proof-detail[open]');await page.screenshot({path:runtime.dir+'/screenshots/web-evidence.png',fullPage:true});await page.getByRole('button',{name:'← Retour au constat',exact:true}).click();assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('evidence-link')),true);check('W02 proof navigation and focus return');
 const downloadEvent=page.waitForEvent('download');await page.getByRole('link',{name:'Exporter le dossier (.md)',exact:true}).click();const download=await downloadEvent;await download.saveAs(runtime.dir+'/exports/Web-UI.md');assert.ok((await fs.readFile(runtime.dir+'/exports/Web-UI.md','utf8')).includes('RICH'));check('W03 actual Web Markdown download');
 await page.getByRole('button',{name:'Historique',exact:true}).click();assert.ok((await page.locator('#workspace-panel').innerText()).includes('Analyse initiale'));check('W04 history');
 for(const id of ['AMBIGUOUS','POOR','STALE','CONTRADICTORY']){await page.goto(runtime.origin+'/workspace/#job='+jobs[id].id);await page.waitForSelector('.status-strip');await page.screenshot({path:runtime.dir+'/screenshots/web-'+id.toLowerCase()+'.png',fullPage:true});assert.ok((await page.locator('#content').innerText()).includes(id));}check('W05 ambiguous, sparse, stale and contradictory reports render');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:runtime.dir+'/screenshots/web-mobile.png',fullPage:true});check('W06 mobile width without horizontal overflow');
 await page.setViewportSize({width:1440,height:1000});await page.goto(runtime.origin+'/workspace/#job='+uiJob);await page.waitForSelector('.status-strip');const contentBefore=await page.locator('#content').innerText();await page.route('**/api/investigations',r=>r.abort());await page.getByRole('button',{name:'Recharger la liste',exact:true}).click();await page.waitForFunction(()=>document.getElementById('message').textContent.includes('indisponible'));assert.equal(await page.locator('#content').innerText(),contentBefore);await page.unroute('**/api/investigations');check('W07 actionable network failure preserves report');
 assert.deepEqual(errors,[]);check('W08 no Web JavaScript errors');
 result.native=await verifyNative({context,cdp,extensionId:loaded.id,origin:runtime.origin,dir:runtime.dir,jobId:uiJob,problemId:'RICH'});check('N01 actual MV3 worker, native sidePanel, real Gateway/Core, evidence and focus',result.native);
 assert.deepEqual(blocked,[]);const audit=await runtime.audit();assert.ok(audit.filter(e=>e.scenario==='RICH').length>=3);result.auditEntries=audit.length;check('I04 only isolated application origin and no professional calls');result.status='PASS';
}catch(e){result.status='FAIL';result.error=e.stack;console.error(e.stack);process.exitCode=1;if(page&&runtime)await page.screenshot({path:runtime.dir+'/screenshots/failure.png',fullPage:true}).catch(()=>{});}
finally{await context?.close();await runtime?.stop();const target=runtime?runtime.dir+'/acceptance.json':path.resolve(option('--output')||os.tmpdir(),'explain-demo-start-failure.json');await fs.writeFile(target,JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,checks:result.checks.length,results:target}));}
