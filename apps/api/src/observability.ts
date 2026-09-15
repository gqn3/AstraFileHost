import {Registry,collectDefaultMetrics,Histogram,Gauge,Counter} from '@prometheus-io/client';
import type {FastifyInstance} from 'fastify';
import {one,query} from '../../../packages/database/index.js';
import {support} from './auth.js';
import {transferMetrics,transferSnapshot} from './transfer-metrics.js';
export const registry=new Registry();
collectDefaultMetrics({register:registry,prefix:'astrafile_'});
const requests=new Counter({name:'astrafile_api_requests_total',help:'Completed control-plane requests',labelNames:['method','route','status'],registers:[registry]});
const latency=new Histogram({name:'astrafile_api_latency_seconds',help:'Control-plane response latency',labelNames:['route'],buckets:[.005,.01,.025,.05,.1,.25,.5,1,2,5,15,30],registers:[registry]});
new Gauge({name:'astrafile_upload_sessions',help:'Upload sessions by state',labelNames:['state'],registers:[registry],async collect(){this.reset();for(const row of await query('SELECT state,count(*)::int count FROM uploads GROUP BY state'))this.set({state:row.state},row.count);}});
new Gauge({name:'astrafile_uploaded_bytes',help:'Verified completed object bytes',registers:[registry],async collect(){const row=await one("SELECT COALESCE(sum(size),0)::bigint bytes FROM uploads WHERE state='AVAILABLE'");this.set(row!.bytes);}});
new Gauge({name:'astrafile_download_authorized_bytes',help:'Reserved bytes for issued download authorizations; not measured wire bytes',registers:[registry],async collect(){const row=await one('SELECT COALESCE(sum(bytes_authorized),0)::bigint bytes FROM downloads');this.set(row!.bytes);}});
new Gauge({name:'astrafile_failed_jobs',help:'Persistent jobs currently failed',registers:[registry],async collect(){const row=await one("SELECT count(*)::int n FROM background_jobs WHERE status='FAILED'");this.set(row!.n);}});
export async function observability(app:FastifyInstance){
 transferMetrics(app);
 for(const direction of ['upload','download'] as const)new Gauge({name:`astrafile_storage_${direction}_bytes_per_second`,help:'Storage body-byte rate sampled at request completion; includes internal reads',registers:[registry],collect(){const value=transferSnapshot();if(value.available)this.set(value[`${direction}BytesPerSecond`]!);else this.set(Number.NaN);}});
 app.addHook('onResponse',async(req,reply)=>{const route=req.routeOptions.url??'unmatched';requests.inc({method:req.method,route,status:String(reply.statusCode)});latency.observe({route},reply.elapsedTime/1000);});
 app.get('/api/admin/metrics',async(req,reply)=>{support(req);return reply.type(registry.contentType).send(await registry.metrics());});
}
