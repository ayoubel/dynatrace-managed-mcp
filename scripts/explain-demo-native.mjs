// Native MV3 acceptance against the actual isolated Gateway; no Chrome API shim.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {until} from './explain-demo-runtime.mjs';
export async function verifyNative({context,cdp,extensionId,origin,dir,jobId,problemId}){
 const worker=context.serviceWorkers().find(w=>w.url().includes(extensionId)) || await context.waitForEvent('serviceworker',{predicate:w=>w.url().includes(extensionId)});
 await worker.evaluate(async base=>chrome.storage.local.set({gateway:base}),origin);
 const url='chrome-extension://'+extensionId+'/src/sidepanel/index.html',helper=await context.newPage();await helper.goto(url);await helper.waitForFunction(()=>document.getElementById('content')?.getAttribute('aria-busy')==='false');
 const windowId=await helper.evaluate(async()=>(await chrome.windows.getCurrent()).id),before=new Set((await cdp.send('Target.getTargets')).targetInfos.map(t=>t.targetId));
 await helper.evaluate(windowId=>{const b=document.createElement('button');b.id='demo-native';b.textContent='Open test sidepanel';b.onclick=()=>chrome.sidePanel.open({windowId}).then(()=>window.nativeOpened=true);document.body.prepend(b);},windowId);
 await helper.locator('#demo-native').click();await helper.waitForFunction(()=>window.nativeOpened);
 const target=await until(async()=>(await cdp.send('Target.getTargets')).targetInfos.find(t=>!before.has(t.targetId)&&t.url===url));
 const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});let sequence=0;const pending=new Map();
 const listener=e=>{if(e.sessionId!==sessionId)return;const value=JSON.parse(e.message),p=pending.get(value.id);if(p){pending.delete(value.id);clearTimeout(p.timer);value.error?p.reject(Error(value.error.message)):p.resolve(value.result);}};cdp.on('Target.receivedMessageFromTarget',listener);
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Native CDP timeout'));},6000);pending.set(id,{resolve,reject,timer});cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(reject);});
 const evaluate=async(fn,arg)=>{const r=await send('Runtime.evaluate',{expression:'('+fn.toString()+')('+JSON.stringify(arg)+')',awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);return r.result?.value;};
 try{
  await until(()=>evaluate(()=>document.getElementById('content')?.getAttribute('aria-busy')==='false'));await helper.goto('about:blank');
  await evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Analyses récentes').click());await until(()=>evaluate(()=>document.querySelectorAll('.problem').length));
  await evaluate(id=>{const b=[...document.querySelectorAll('.problem')].find(b=>b.textContent.includes(id));if(!b)throw Error('Demo job missing');b.click();},jobId);
  await until(()=>evaluate(id=>document.getElementById('compact-id')?.textContent===id,problemId));assert.equal(await evaluate(()=>chrome.runtime.id),extensionId);
  const screenshot=async name=>{const s=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(dir+'/screenshots/'+name+'.png',Buffer.from(s.data,'base64'));};
  await screenshot('chrome-report');
  assert.ok((await evaluate(()=>document.querySelector('.section-why')?.textContent || '')).includes('Cause désignée par Davis'));
  await evaluate(()=>document.querySelector('.section-why').scrollIntoView());await screenshot('chrome-conclusion');
  await evaluate(()=>{const b=document.querySelector('.section-why .evidence-link') || document.querySelector('.evidence-link');b.focus();b.click();});await until(()=>evaluate(()=>!!document.querySelector('.proof-detail[open]')));await screenshot('chrome-evidence');
  await evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='← Retour au constat').click());assert.equal(await evaluate(()=>document.activeElement.classList.contains('evidence-link')),true);
  const storage=await worker.evaluate(async()=>chrome.storage.session.get(null));assert.ok(!JSON.stringify(storage).includes('120 utilisateur'));assert.ok(!JSON.stringify(storage).includes('evidenceRefs'));
  return {target:target.targetId,extensionId,realWorker:true,realSidePanel:true,proofAndFocus:true,storageKeys:Object.keys(storage)};
 }finally{cdp.off('Target.receivedMessageFromTarget',listener);await cdp.send('Target.detachFromTarget',{sessionId}).catch(()=>{});await helper.close();}
}
