// Reusable isolated runtime: actual Gateway + SDK transport + Core, simulated Managed ports.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const pause=ms=>new Promise(r=>setTimeout(r,ms));
export async function until(fn,ms=30000){const end=Date.now()+ms;let last;while(Date.now()<end){try{const value=await fn();if(value)return value;}catch(e){last=e;}await pause(100);}throw Error('Demo wait timed out: '+(last?.message || fn.toString().slice(0,140)));}
export async function launchDemo({gatewayRoot,output=os.tmpdir(),initialJobs,initialHistory,extensionOrigin='chrome-extension://'+'a'.repeat(32)}){
 if(!gatewayRoot)throw Error('--gateway-root is required');
 if(!/^chrome-extension:\/\/[a-p]{32}$/.test(extensionOrigin))throw Error('Invalid isolated extension origin');
 await fs.access(path.join(gatewayRoot,'src/server.mjs'));
 await fs.mkdir(output,{recursive:true});const dir=await fs.mkdtemp(path.join(output,'explain-demo-'));await fs.chmod(dir,0o700);
 const build=path.join(dir,'build'),runtime=path.join(dir,'runtime');await fs.mkdir(runtime);await fs.mkdir(path.join(runtime,'data'));await fs.mkdir(path.join(dir,'tmp'));
 const env={PATH:path.dirname(process.execPath)+':/usr/bin:/bin',HOME:dir,TMPDIR:path.join(dir,'tmp'),DAYBREAK_PROFILE:'incident-intelligence',DT_MCP_PROFILE:'incident-intelligence',DAYBREAK_DISABLE_LOCAL_LLM:'true',DT_MCP_OLLAMA_ENABLED:'false',DT_MCP_DISABLE_TELEMETRY:'true',DT_MCP_ENABLE_TELEMETRY:'false',LOG_OUTPUT:'disabled',DAYBREAK_EXTENSION_ORIGIN:extensionOrigin,DOTENV_CONFIG_PATH:path.join(dir,'empty.env'),NODE_OPTIONS:'--import='+pathToFileURL(path.join(root,'scripts/sprint10-1-network-guard.mjs')).href,EXPLAIN_DEMO_BUILD:build,EXPLAIN_DEMO_CONTROL:path.join(dir,'control.json'),EXPLAIN_DEMO_AUDIT:path.join(dir,'audit.jsonl')};
 await fs.writeFile(env.DOTENV_CONFIG_PATH,'');await fs.writeFile(env.EXPLAIN_DEMO_CONTROL,JSON.stringify({catalogDisabled:true}));
 const built=spawnSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'--project',path.join(root,'tsconfig.reference.json'),'--outDir',build],{cwd:root,env:{PATH:env.PATH},encoding:'utf8'});
 await fs.writeFile(path.join(dir,'build.log'),built.stdout+built.stderr);if(built.status!==0)throw Error('Demo compilation failed; see '+dir+'/build.log');
 await fs.symlink(path.join(root,'node_modules'),path.join(build,'node_modules'));
 const network=spawnSync(process.execPath,['--input-type=module','-e',"import net from 'node:net';for(const f of [()=>fetch('https://managed.example'),()=>net.connect(4318,'127.0.0.1')]){try{f();process.exit(2)}catch(e){if(!e.message.includes('network isolation'))throw e}}"],{env,encoding:'utf8'});
 if(network.status!==0)throw Error('Network isolation self-test failed');
 const config=path.join(dir,'mcp.json');await fs.writeFile(config,JSON.stringify({servers:Object.fromEntries(['first','second'].map(ns=>[ns,{command:process.execPath,args:[path.join(root,'scripts/explain-demo-fixture.mjs')],env:{...env,EXPLAIN_DEMO_NAMESPACE:ns}}]))}),{mode:0o600});
 if(initialHistory) {const history=initialHistory({config});if(!Array.isArray(history))throw Error('Synthetic history must be an array');await fs.writeFile(path.join(runtime,'data/history.json'),JSON.stringify(history));}
 if(initialJobs) {const jobs=initialJobs({config});if(!Array.isArray(jobs))throw Error('Synthetic jobs must be an array');await fs.writeFile(path.join(runtime,'data/workbench.json'),JSON.stringify(jobs));}
 for(const name of ['src','public'])await fs.symlink(path.join(gatewayRoot,name),path.join(runtime,name));
 await fs.writeFile(path.join(runtime,'.local-config.json'),JSON.stringify({mcpConfig:config}),{mode:0o600});
 const lease=net.createServer();await new Promise((resolve,reject)=>{lease.once('error',reject);lease.listen(0,'127.0.0.1',resolve);});const port=lease.address().port;await new Promise(r=>lease.close(r));if(port===4318)throw Error('Professional port refused');
 const origin='http://127.0.0.1:'+port,log=await fs.open(path.join(dir,'gateway.log'),'w',0o600);
 const child=spawn(process.execPath,[path.join(gatewayRoot,'src/server.mjs')],{cwd:runtime,env:{...env,PORT:String(port)},stdio:['ignore',log.fd,log.fd]});
 const get=async route=>{const response=await fetch(origin+route);if(!response.ok)throw Error('HTTP '+response.status+' '+route);return response.json();};
 const post=async(route,body)=>{const {csrf}=await get('/api/status');return fetch(origin+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(body)});};
 const stop=async()=>{if(child.exitCode===null && child.signalCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await Promise.race([exited,pause(5000)]);if(child.exitCode===null && child.signalCode===null)throw Error('Isolated Gateway did not stop gracefully; PID '+child.pid);}await log.close();};
 try{await until(async()=>{if(child.exitCode!==null)throw Error('Gateway exited: '+await fs.readFile(path.join(dir,'gateway.log'),'utf8'));const c=await get('/api/extension/context');return !c.discovering && c.environments.length===2;});await until(async()=>!(await get('/api/status')).progress?.running);await fs.writeFile(env.EXPLAIN_DEMO_CONTROL,'{}');}
 catch(e){await stop();throw e;}
 await fs.writeFile(path.join(dir,'runtime.json'),JSON.stringify({synthetic:true,origin,pid:child.pid,dir,gatewayRoot,build,networkIsolation:'outgoing sockets/fetch blocked in Gateway and fixture children'},null,2));
 return {dir,build,origin,get,post,stop,control:value=>fs.writeFile(env.EXPLAIN_DEMO_CONTROL,JSON.stringify(value)),audit:async()=>((await fs.readFile(env.EXPLAIN_DEMO_AUDIT,'utf8').catch(()=>'' )).trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)))};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const option=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
 const runtime=await launchDemo({gatewayRoot:option('--gateway-root'),output:option('--output'),extensionOrigin:option('--extension-origin')});
 console.log('SYNTHETIC ONLY — '+runtime.origin+'/workspace\nArtifacts: '+runtime.dir+'\nStop with Ctrl-C; only this isolated runtime is stopped.');
 let closing=false;const close=async()=>{if(closing)return;closing=true;await runtime.stop();process.exitCode=0;};process.once('SIGINT',close);process.once('SIGTERM',close);
}
