import type {FastifyInstance} from 'fastify';
import {env} from '../../../packages/config/index.js';
export type TrafficSample={received:number;sent:number;at:number};
export function parseTraffic(text:string,bucket:string,at=Date.now()):TrafficSample{
 if(!text.includes('SeaweedFS_'))throw Error('INVALID_STORAGE_METRICS');
 let received=0,sent=0;
 for(const line of text.split('\n')){
  const match=/^SeaweedFS_s3_bucket_traffic_(received|sent)_bytes_total\{bucket="((?:[^"\\]|\\.)*)"\}\s+([\d.eE+-]+)$/.exec(line);
  if(!match||JSON.parse(`"${match[2]}"`)!==bucket)continue;
  const value=Number(match[3]);if(!Number.isFinite(value)||value<0)throw Error('INVALID_STORAGE_COUNTER');
  if(match[1]==='received')received=value;else sent=value;
 }
 return {received,sent,at};
}
export function trafficRate(previous:TrafficSample|undefined,current:TrafficSample){
 const windowSeconds=previous?(current.at-previous.at)/1000:0;
 if(!previous||windowSeconds<=0||current.received<previous.received||current.sent<previous.sent)return null;
 return {uploadBytesPerSecond:(current.received-previous.received)/windowSeconds,downloadBytesPerSecond:(current.sent-previous.sent)/windowSeconds,windowSeconds};
}
let sample:TrafficSample|undefined,rate:ReturnType<typeof trafficRate>=null,healthy=false;
const note='Storage body bytes sampled every 10 seconds. Counters update when requests finish, and include background integrity reads. They are not instantaneous client network speed or quota accounting.';
export function transferSnapshot(){return {available:healthy&&!!sample&&Date.now()-sample.at<30000&&rate!==null,...(rate??{}),sampledAt:sample?new Date(sample.at).toISOString():null,receivedBytes:sample?.received??null,sentBytes:sample?.sent??null,note};}
export function transferMetrics(app:FastifyInstance){
 if(!env.S3_METRICS_ENDPOINT)return;
 let busy=false,stopped=false,timer:ReturnType<typeof setInterval>;
 const poll=async()=>{if(busy||stopped)return;busy=true;try{
  const response=await fetch(env.S3_METRICS_ENDPOINT!,{signal:AbortSignal.timeout(3000)});
  if(!response.ok||!response.body)throw Error('STORAGE_METRICS_UNAVAILABLE');
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4*1024**2)throw Error('METRICS_TOO_LARGE');chunks.push(value);}}finally{await reader.cancel();}
  const current=parseTraffic(Buffer.concat(chunks).toString('utf8'),env.S3_BUCKET);rate=trafficRate(sample,current);sample=current;healthy=true;
 }catch{healthy=false;sample=undefined;rate=null;}finally{busy=false;}};
 app.addHook('onReady',async()=>{await poll();timer=setInterval(()=>void poll(),10000);timer.unref();});
 app.addHook('onClose',async()=>{stopped=true;clearInterval(timer);});
}
