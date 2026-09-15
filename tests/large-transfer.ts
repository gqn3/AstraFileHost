import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {owner,report,origin} from './helpers.js';
const GiB=1024**3,MiB=1024**2;
const client=await owner();
for(const old of (await client.request('/uploads')).items){if(/^acceptance-(1|5|20)GiB-(cryptographic-random|generated-zero-stream)\.bin$/.test(old.name)&&['UPLOADING','FAILED','CREATED'].includes(old.state))await client.request(`/uploads/${old.id}/abort`,'POST',{});}const sizes=(process.env.TEST_GIB??'1,5,20').split(',').map(Number);const results:any[]=[];
for(const gib of sizes){
 const size=gib*GiB;const real=gib===1;const content=real?'cryptographic-random':'generated-zero-stream';
 const state=await client.request('/uploads','POST',{name:`acceptance-${gib}GiB-${content}.bin`,size,mime:'application/octet-stream',fingerprint:createHash('sha256').update(`${Date.now()}-${gib}`).digest('hex')});
 const count=Math.ceil(size/state.partSize);let sent=0;const sourceHash=createHash('sha256');let apiPeak=0;const memorySamples:number[]=[];const start=performance.now();
 const zero=Buffer.alloc(state.partSize);const cachedChecksum=createHash('sha256').update(zero).digest('base64');let firstETag='';
 async function send(n:number,buffer:Buffer,checksum:string){let etag='';for(let attempt=0;attempt<6;attempt++){try{const s=await client.request(`/uploads/${state.id}/sign`,'POST',{parts:[{number:n,checksum}]});const response=await fetch(s.parts[0].url,{method:'PUT',headers:s.parts[0].headers,body:buffer as unknown as BodyInit});assert.equal(response.status,200,'Multipart storage PUT failed');etag=response.headers.get('etag')!;break;}catch(e){if(attempt===5)throw e;await new Promise(r=>setTimeout(r,1000*2**attempt));}}await client.request(`/uploads/${state.id}/ack`,'POST',{number:n,etag});if(n===1)firstETag=etag;sent+=buffer.length;}
 const first=real?randomBytes(state.partSize):zero;sourceHash.update(first);await send(1,first,real?createHash('sha256').update(first).digest('base64'):cachedChecksum);
 const interrupted=await client.request(`/uploads/${state.id}`);assert.equal(interrupted.parts.length,1);assert.equal(interrupted.parts[0].etag,firstETag);
 if(gib===20){
  if(origin!=='https://localhost:18543')throw Error('Restart acceptance requires the isolated localhost TLS stack; no unrelated service will be restarted.');
  const restart=spawnSync('docker',['compose','-f','infra/compose/acceptance.yml','restart','astrafile-api','astrafile-worker'],{windowsHide:true,stdio:'pipe'});
  assert.equal(restart.status,0,'AstraFile acceptance restart failed');
  for(let n=0;n<100;n++){await new Promise(resolve=>setTimeout(resolve,200));try{const res=await fetch(origin+'/health/ready');if(res.ok&&n>15)break;}catch{}}
  const after=await client.request(`/uploads/${state.id}`);assert.equal(after.parts[0].etag,firstETag);console.info('20 GiB acceptance: API/worker restart recovered the existing part.');
 }
 for(let n=2;n<=count;){
  const batch:Promise<void>[]=[];
  for(let j=0;j<4&&n<=count;j++,n++){const len=Math.min(state.partSize,size-(n-1)*state.partSize);const buffer=real?randomBytes(len):len===zero.length?zero:zero.subarray(0,len);sourceHash.update(buffer);batch.push(send(n,buffer,real||len!==zero.length?createHash('sha256').update(buffer).digest('base64'):cachedChecksum));}
  await Promise.all(batch);
  if(n%32<4||n>count){const metrics=await client.request('/admin/overview');apiPeak=Math.max(apiPeak,metrics.system.apiMemory);memorySamples.push(metrics.system.apiMemory);console.info(`${gib} GiB: ${(sent/GiB).toFixed(2)} GiB uploaded; API RSS ${(metrics.system.apiMemory/MiB).toFixed(0)} MiB`);}
 }
 const before=await client.request(`/uploads/${state.id}`);assert.equal(before.parts.length,count);assert.equal(before.parts[0].etag,firstETag);
 const complete=await client.request(`/uploads/${state.id}/complete`,'POST',{});const uploadSeconds=(performance.now()-start)/1000;const sha256=sourceHash.digest('hex');
 const grant=await client.request(`/files/${complete.fileId}/download`,'POST',{});const downloadStart=performance.now();const response=await fetch(grant.url);assert.equal(response.status,200);assert.equal(Number(response.headers.get('content-length')),size);const downloaded=createHash('sha256');let received=0;for await(const b of response.body!){downloaded.update(b);received+=b.byteLength;}
 const downloadSeconds=(performance.now()-downloadStart)/1000;assert.equal(received,size);assert.equal(downloaded.digest('hex'),sha256);
 const ranged=await fetch(grant.url,{headers:{Range:`bytes=${size-MiB}-${size-1}`}});assert.equal(ranged.status,206);assert.equal((await ranged.arrayBuffer()).byteLength,MiB);
 const result={gib,bytes:size,content,parts:count,partMiB:state.partSize/MiB,concurrency:4,uploadSeconds,uploadMBps:size/uploadSeconds/1e6,downloadSeconds,downloadMBps:size/downloadSeconds/1e6,apiPeakRssMiB:apiPeak/MiB,apiMemorySamples:memorySamples,sha256,integrity:true,resumedWithoutResendingPart1:true,apiWorkerRestartVerified:gib===20,range206:true};results.push(result);await report(sizes.length===3?'large-transfers':`large-transfers-${sizes.join('-')}GiB`,{date:new Date().toISOString(),environment:`Windows localhost / Docker Desktop S3 via ${origin}; not remote server bandwidth`,results});
 await client.request('/files/bulk','POST',{ids:[complete.fileId],action:'delete'});await client.request('/files/bulk','POST',{ids:[complete.fileId],action:'purge',confirm:'DELETE PERMANENTLY'});console.info(`PASS ${gib} GiB: ${result.uploadMBps.toFixed(1)} MB/s upload, ${result.downloadMBps.toFixed(1)} MB/s download, SHA-256 matched.`);
}
console.info('Large-file acceptance completed. Detailed measurements saved without credentials.');
