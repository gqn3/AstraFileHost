import {createHash,randomBytes} from 'node:crypto';
import {statfs} from 'node:fs/promises';
import {Redis} from 'ioredis';
import {env,GiB} from '../../../packages/config/index.js';
import {one,query,settings,type DB} from '../../../packages/database/index.js';
import {rateReference} from '../../../packages/privacy/index.js';
import {entitlements} from './entitlements.js';
export const redis=new Redis(env.REDIS_URL,{maxRetriesPerRequest:2,enableReadyCheck:true,lazyConnect:true});
redis.on('error',()=>{});
export const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export const randomToken=()=>randomBytes(32).toString('base64url');
export class ApiError extends Error {constructor(public statusCode:number,message:string,public code='REQUEST_FAILED'){super(message);}}
export function requireValue<T>(v:T|null|undefined,message='Not found'):T {if(!v)throw new ApiError(404,message);return v;}
export async function limited(key:string,max:number,seconds:number) {
 const n=Number(await redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",1,`astrafile:rate:${rateReference(key)}`,seconds));
 if(n>max)throw new ApiError(429,'Too many requests. Please try again later.','RATE_LIMITED');
}
export async function disk() {const d=await statfs(env.STORAGE_DISK_PATH);return {freeBytes:d.bavail*d.bsize,totalBytes:d.blocks*d.bsize,usedBytes:(d.blocks-d.bfree)*d.bsize};}
export async function writable(){const s=await settings();if(s.maintenance||s.readOnly)throw new ApiError(503,'Uploads and changes are temporarily paused.','READ_ONLY');return s;}
export async function reserve(ownerId:string,size:number,db:DB) {
 await db.query('SELECT pg_advisory_xact_lock(74392102)');
 const s=await settings(db);const d=await disk();
 const reserved=await one("SELECT COALESCE(sum(size),0)::bigint bytes FROM uploads WHERE state IN ('CREATED','UPLOADING','FINALIZING','FAILED') AND error_code IS DISTINCT FROM 'INIT_FAILED'",[],db);
 if(d.freeBytes-Number(reserved!.bytes)-size<Math.max(s.minimumFreeGiB,s.criticalFreeGiB)*GiB)throw new ApiError(507,'Storage is low on free space. Please try again after capacity is available.','LOW_DISK');
 const u=requireValue(await one('SELECT * FROM users WHERE id=$1 FOR UPDATE',[ownerId],db));
 const quota=(await entitlements(ownerId,db)).effective;
 const balances=requireValue(await one('SELECT used_bytes,reserved_bytes,incomplete_uploads FROM account_storage_usage WHERE owner_id=$1',[ownerId],db));
 if(balances.incomplete_uploads>=Math.min(quota.concurrentUploads,s.incompleteUploadLimit))throw new ApiError(429,'Your concurrent upload limit has been reached. Resume or cancel an existing upload.','UPLOAD_CONCURRENCY');
 if(balances.reserved_bytes+size>s.incompleteReservedGiB*GiB)throw new ApiError(413,'Your incomplete upload reservation limit has been reached.','RESERVATION_LIMIT');
 if(size>quota.fileBytes)throw new ApiError(413,'File exceeds your single-file limit.','FILE_QUOTA');
 if(balances.used_bytes+balances.reserved_bytes+size>quota.storageBytes)throw new ApiError(413,'Your storage quota is full.','STORAGE_QUOTA');
 const period=await one("SELECT COALESCE(sum(size) FILTER(WHERE created_at>=date_trunc('day',now())),0)::bigint daily, COALESCE(sum(size) FILTER(WHERE created_at>=date_trunc('month',now())),0)::bigint monthly FROM uploads WHERE owner_id=$1 AND state NOT IN ('ABORTED','EXPIRED') AND error_code IS DISTINCT FROM 'INIT_FAILED'",[ownerId],db);
 if(period!.daily+size>quota.dailyBytes||period!.monthly+size>quota.monthlyBytes)throw new ApiError(429,'Your upload allowance for this period is exhausted.','UPLOAD_QUOTA');
}
export async function bandwidth(ownerId:string,size:number,db:DB) {
 const u=requireValue(await one('SELECT * FROM users WHERE id=$1 FOR UPDATE',[ownerId],db));
 const quota=(await entitlements(ownerId,db)).effective;
 const grants=await one("SELECT count(*)::int n FROM downloads WHERE owner_id=$1 AND created_at>now()-interval '15 minutes'",[ownerId],db);
 if(grants!.n>=quota.concurrentDownloads)throw new ApiError(429,'The file owner’s active download grant limit has been reached. Grants expire after 15 minutes.','DOWNLOAD_CONCURRENCY');
 const row=await one("SELECT COALESCE(sum(bytes_authorized),0)::bigint bytes FROM downloads WHERE owner_id=$1 AND created_at>=date_trunc('month',now())",[ownerId],db);
 if(row!.bytes+size>quota.bandwidthBytes)throw new ApiError(429,'The file owner’s monthly download allowance has been reached.','BANDWIDTH_QUOTA');
}
export async function enqueue(kind:string,target:string,detail:unknown={},db?:DB) {await query("INSERT INTO background_jobs(kind,target,detail) VALUES($1,$2,$3) ON CONFLICT(kind,target) DO UPDATE SET status='PENDING',updated_at=now(),error=NULL WHERE background_jobs.status IN ('FAILED','COMPLETED')",[kind,target,JSON.stringify(detail)],db);}
