import {openDB} from 'idb';
import {api} from '../api.js';
import {validateBrowserEndpoint} from '../../../../packages/validation/endpoints.js';
class TransferFailure extends Error { constructor(message:string,public retryable=true){super(message);} }
export type Transfer={id:string;ownerId:string;name:string;size:number;lastModified:number;fingerprint:string;partSize:number;state:'preparing'|'uploading'|'paused'|'failed'|'finalizing'|'complete'|'waiting';completed:Record<number,{etag:string;size:number}>;bytes:number;rate:number;average:number;active:number;retries:number;error?:string;shareSecret?:string;fileId?:string;updatedAt:number;};
const db=openDB('astrafile-uploads',1,{upgrade(db){db.createObjectStore('sessions',{keyPath:'id'});}});
const worker=new Worker(new URL('./hash.worker.ts',import.meta.url),{type:'module'});
let hashId=0;const pending=new Map<number,{resolve:(v:string)=>void;reject:(e:Error)=>void}>();
worker.onmessage=e=>{const p=pending.get(e.data.id);if(p){pending.delete(e.data.id);e.data.error?p.reject(Error(e.data.error)):p.resolve(e.data.hash);}};
worker.onerror=()=>{for(const p of pending.values())p.reject(new TransferFailure('File hashing could not start. Reload this page and reselect the original file.',false));pending.clear();};
const digest=(data:{file?:File;blob?:Blob})=>new Promise<string>((resolve,reject)=>{const id=++hashId;pending.set(id,{resolve,reject});worker.postMessage({id,...data});});
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
type Runtime={file:File;paused:boolean;cancelled:boolean;running:boolean;xhrs:Set<XMLHttpRequest>;inflight:Map<number,number>;limit:number;maxLimit:number;success:number;started:number;startBytes:number;samples:{at:number;bytes:number}[];};
export class UploadEngine {
 transfers:Transfer[]=[];private runtimes=new Map<string,Runtime>();private listeners=new Set<()=>void>();private version=0;private ownerId:string|null|undefined=undefined;
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};getSnapshot=()=>this.version;
 private emit(){this.version++;this.listeners.forEach(fn=>fn());}
 private async persist(t:Transfer){const {shareSecret,...checkpoint}=t;await(await db).put('sessions',{...checkpoint,rate:0,average:0,active:0,updatedAt:Date.now()});}
 async load(ownerId:string|null){
  if(this.ownerId===ownerId)return;
  this.ownerId=ownerId;
  for(const t of this.transfers)await this.pause(t.id);
  this.runtimes.clear();this.transfers=[];this.emit();
  if(!ownerId)return;
  const saved=await(await db).getAll('sessions');for(const checkpoint of saved){delete checkpoint.slug;delete checkpoint.shareSecret;await(await db).put('sessions',checkpoint);}
  // Adopt older checkpoints only after the API proves the current account owns them.
  for(const t of saved)if(!t.ownerId){try{await api(`/uploads/${t.id}`);t.ownerId=ownerId;await this.persist(t);}catch{}}
  if(this.ownerId!==ownerId)return;
  this.transfers=saved.filter(t=>t.ownerId===ownerId).map(t=>({...t,state:t.state==='complete'?'complete':'paused',rate:0,active:0}));this.emit();
 }
 async add(file:File,folderId?:string){
  await api('/auth/guest','POST',{});const me=await api('/auth/me');await this.load(me.user.id);const fingerprint=await digest({file});
  let t=this.transfers.find(t=>t.fingerprint===fingerprint&&t.state!=='complete');
  if(t){await this.resume(t.id,file);return;}
  const session=await api('/uploads','POST',{name:file.name,size:file.size,mime:file.type||'application/octet-stream',fingerprint,folderId});
  t={id:session.id,ownerId:this.ownerId!,fileId:session.fileId,name:file.name,size:file.size,lastModified:file.lastModified,fingerprint,partSize:session.partSize,state:'waiting',completed:{},bytes:0,rate:0,average:0,active:0,retries:0,updatedAt:Date.now()};this.transfers.unshift(t);await this.persist(t);this.emit();
  this.runtimes.set(t.id,this.runtime(file,session.concurrency));void this.run(t);
 }
 private runtime(file:File,limit=4):Runtime{limit=Math.max(1,Math.min(8,limit));return {file,paused:false,cancelled:false,running:false,xhrs:new Set(),inflight:new Map(),limit,maxLimit:limit,success:0,started:performance.now(),startBytes:0,samples:[]};}
 async resume(id:string,file?:File){const t=this.transfers.find(t=>t.id===id)!;if(!t)return;const old=this.runtimes.get(id);if(old?.running)return;
  const f=file??old?.file;if(!f)throw Error('Reselect the original file to resume.');if(await digest({file:f})!==t.fingerprint)throw Error('This is not the original file. Name, size, modification time and sampled content must match.');
  const state=await api(`/uploads/${id}`);if(state.state==='AVAILABLE'){const completed=await api(`/uploads/${id}/complete`,'POST',{});Object.assign(t,{state:'complete',bytes:t.size,shareSecret:completed.shareSecret});await this.persist(t);this.emit();return;}
  if(!['UPLOADING','FAILED','FINALIZING'].includes(state.state))throw Error('This upload session is no longer available.');
  t.completed={};for(const p of state.parts)t.completed[p.number]={etag:p.etag,size:p.size};t.bytes=Object.values(t.completed).reduce((a,p)=>a+p.size,0);t.error=undefined;
  const r=this.runtime(f,state.concurrency);r.startBytes=t.bytes;this.runtimes.set(id,r);void this.run(t);
 }
 async pause(id:string){const t=this.transfers.find(t=>t.id===id),r=this.runtimes.get(id);if(!t||!r)return;r.paused=true;for(const x of r.xhrs)x.abort();t.state='paused';t.rate=0;t.active=0;await this.persist(t);this.emit();}
 async cancel(id:string){const t=this.transfers.find(t=>t.id===id),r=this.runtimes.get(id);if(r){r.cancelled=true;r.paused=true;for(const x of r.xhrs)x.abort();}await api(`/uploads/${id}/abort`,'POST',{});this.transfers=this.transfers.filter(t=>t.id!==id);this.runtimes.delete(id);await(await db).delete('sessions',id);this.emit();}
 async dismiss(id:string){this.transfers=this.transfers.filter(t=>t.id!==id);await(await db).delete('sessions',id);this.emit();}
 private progress(t:Transfer,r:Runtime){const done=Object.values(t.completed).reduce((a,p)=>a+p.size,0);t.bytes=Math.min(t.size,done+[...r.inflight.values()].reduce((a,b)=>a+b,0));const now=performance.now();r.samples.push({at:now,bytes:t.bytes});r.samples=r.samples.filter(s=>now-s.at<5000);const first=r.samples[0];if(first&&now-first.at>200)t.rate=Math.max(0,(t.bytes-first.bytes)/((now-first.at)/1000));t.average=Math.max(0,(t.bytes-r.startBytes)/((now-r.started)/1000));t.active=r.xhrs.size;this.emit();}
 private put(t:Transfer,r:Runtime,n:number,url:string,headers:Record<string,string>,blob:Blob){return new Promise<string>((resolve,reject)=>{
  try{validateBrowserEndpoint(window.location.origin,url);}catch(e){reject(new TransferFailure((e as Error).message,false));return;}
  const x=new XMLHttpRequest();r.xhrs.add(x);x.open('PUT',url);x.timeout=30*60000;for(const[k,v]of Object.entries(headers))x.setRequestHeader(k,v);
  x.upload.onprogress=e=>{r.inflight.set(n,e.loaded);this.progress(t,r);};
  const clean=()=>{r.xhrs.delete(x);r.inflight.delete(n);};
  x.onload=()=>{clean();if(x.status>=200&&x.status<300){const etag=x.getResponseHeader('ETag');etag?resolve(etag):reject(new TransferFailure('Storage did not expose ETag. The storage response configuration needs repair.',false));}else reject(new TransferFailure(`Storage returned HTTP ${x.status}`,x.status===403||x.status===408||x.status===429||x.status>=500));};
  x.onerror=()=>{clean();reject(new TransferFailure('The browser could not reach storage. Check the connection and the storage HTTPS certificate; confirmed parts are retained.'));};x.ontimeout=()=>{clean();reject(new TransferFailure('Part timed out; confirmed parts are retained.'));};x.onabort=()=>{clean();reject(Error('Paused'));};
  if(r.paused){clean();reject(Error('Paused'));return;}x.send(blob);
 });}
 private async part(t:Transfer,r:Runtime,n:number){
  const blob=r.file.slice((n-1)*t.partSize,Math.min(t.size,n*t.partSize));const checksum=await digest({blob});
  for(let attempt=0;attempt<6;attempt++){
   if(r.paused||r.cancelled)return;
   try{const signed=await api(`/uploads/${t.id}/sign`,'POST',{parts:[{number:n,checksum}]});if(r.paused)return;const etag=await this.put(t,r,n,signed.parts[0].url,signed.parts[0].headers,blob);t.completed[n]={etag,size:blob.size};await this.persist(t);
    // A lost progress acknowledgement must not retransmit a successful part.
    // Completion and resume independently reconcile authoritative ListParts.
    await api(`/uploads/${t.id}/ack`,'POST',{number:n,etag}).catch(()=>{});r.success++;if(r.success%12===0&&r.limit<r.maxLimit)r.limit++;this.progress(t,r);return;}
   catch(e){if(r.paused||r.cancelled)return;r.limit=Math.max(1,r.limit-1);t.error=(e as Error).message;this.emit();if(e instanceof TransferFailure&&!e.retryable||attempt===5)throw e;t.retries++;await wait(Math.min(15000,1000*2**attempt)*(0.7+Math.random()*0.6));}
  }
 }
 private async run(t:Transfer){
  const r=this.runtimes.get(t.id)!;if(r.running)return;
  // Bound total browser memory and connections across multiple selected files.
  // A single file uses up to eight parallel parts; subsequent files wait their turn.
  if([...this.runtimes.values()].some(other=>other!==r&&other.running)){t.state='waiting';this.emit();return;}
  r.running=true;t.state='uploading';t.error=undefined;this.emit();const running=new Set<Promise<void>>();let error:unknown;
  try{
   const count=Math.ceil(t.size/t.partSize);let next=1;
   while((next<=count||running.size)&&!r.paused){
    while(next<=count&&running.size<r.limit&&!r.paused){const n=next++;if(t.completed[n])continue;const job=this.part(t,r,n).catch(e=>{error=e;r.paused=true;for(const x of r.xhrs)x.abort();}).finally(()=>running.delete(job));running.add(job);}
    if(running.size)await Promise.race(running);
   }
   await Promise.all(running);if(r.cancelled)return;if(error)throw error;if(r.paused){t.state='paused';return;}
   t.state='finalizing';this.emit();const result=await api(`/uploads/${t.id}/complete`,'POST',{});Object.assign(t,{state:'complete',bytes:t.size,shareSecret:result.shareSecret,fileId:result.fileId,error:undefined});
  }catch(e){t.state='failed';t.error=(e as Error).message;}
  finally{r.running=false;t.rate=0;t.active=0;if(!r.cancelled){await this.persist(t);this.emit();}const next=this.transfers.find(v=>v.state==='waiting'&&this.runtimes.has(v.id));if(next)void this.run(next);}
 }
}
export const uploads=new UploadEngine();
window.addEventListener('offline',()=>{for(const t of uploads.transfers)if(t.state==='uploading')void uploads.pause(t.id);});
