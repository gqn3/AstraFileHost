import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {owner,origin,report} from './helpers.js';
if(origin!=='https://localhost:18543')throw Error('This check only operates on the isolated localhost acceptance services.');
const client=await owner();
function command(args:string[]){const r=spawnSync('docker',args,{windowsHide:true,encoding:'utf8'});assert.equal(r.status,0,'AstraFile-owned Docker operation failed');return r.stdout;}
const worker='astrafile-acceptance-astrafile-worker-1';
const before=JSON.parse(command(['inspect',worker]))[0];assert.equal(before.Config.Labels['com.docker.compose.project'],'astrafile-acceptance');assert.equal(before.Config.Labels['com.docker.compose.service'],'astrafile-worker');
try{
 command(['stop','--time','30',worker]);
 const health=await client.request('/admin/health');assert.equal(health.healthy,false);assert.equal(health.services.find((s:any)=>s.name==='worker').healthy,false);
 const readiness=await fetch(origin+'/health/ready');assert.equal(readiness.status,503);
}finally{command(['start',worker]);}
let healthy=false;for(let n=0;n<40;n++){await new Promise(r=>setTimeout(r,500));if((await fetch(origin+'/health/ready')).ok){healthy=true;break;}}assert.ok(healthy,'Worker did not recover');
const after=JSON.parse(command(['inspect',worker]))[0];assert.notEqual(after.State.StartedAt,before.State.StartedAt);assert.equal(after.Config.User,'10001:10001');assert.equal(after.HostConfig.ReadonlyRootfs,true);assert.deepEqual(after.HostConfig.CapDrop,['ALL']);
await report('service-restart',{date:new Date().toISOString(),readinessDetectsMissingWorker:true,workerRestartRecovered:true,workerRunsAsNonRoot:true,workerFilesystemReadOnly:true,workerCapabilitiesDropped:true,services:(await client.request('/admin/health')).services});
console.info('PASS worker stop/restart, readiness transitions, non-root identity and restricted container');
