import {createHash} from 'node:crypto';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {spawn} from 'node:child_process';
import {mkdir,stat,unlink,writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import path from 'node:path';
import {pool,one,query,tx,settings,audit} from '../../../packages/database/index.js';
import {storage} from '../../../packages/storage/index.js';
import {encryptedBackupStream} from '../../../packages/privacy/backup.js';
import {env,GiB} from '../../../packages/config/index.js';
import {redis,disk,enqueue} from '../../api/src/lib.js';
import {pruneVersions} from '../../api/src/cloud.js';
import {finalize} from '../../api/src/uploads.js';
let stopping=false;
async function connectWorker(){for(let attempt=0;;attempt++){try{return await pool.connect();}catch(e){if(attempt>=30)throw e;await new Promise(resolve=>setTimeout(resolve,2000));}}}
const leader=await connectWorker();
const lock=await leader.query('SELECT pg_try_advisory_lock(74392104) locked');
if(!lock.rows[0].locked){console.info('Another AstraFile worker owns the job lease.');process.exit(0);}
leader.on('error',()=>{process.exitCode=1;stopping=true;});
await query("UPDATE background_jobs SET status='PENDING',updated_at=now() WHERE status='RUNNING'");
async function beat(){await redis.set('astrafile:worker:heartbeat',Date.now(),'EX',90);if(process.platform!=='win32')await writeFile('/tmp/astrafile-worker-heartbeat',String(Date.now()),{mode:0o600});}
const heartbeat=setInterval(()=>beat().catch(()=>{}),15000);
await beat();
async function purge(objectId:string){
 await tx(async db=>{const o=await one('SELECT * FROM file_objects WHERE id=$1 FOR UPDATE',[objectId],db);if(!o)return;const live=await one("SELECT 1 FROM files WHERE object_id=$1 AND state NOT IN ('PURGED','EXPIRED') LIMIT 1",[objectId],db);if(live||await one('SELECT 1 FROM file_versions WHERE object_id=$1 LIMIT 1',[objectId],db))return;await storage.remove(o.object_key);await query("UPDATE file_objects SET state='PURGED' WHERE id=$1",[objectId],db);await audit(null,'storage.purged',objectId,{},null,db);});
}
async function cleanup(){
 const s=await settings();
 for(const row of await query('SELECT DISTINCT file_id FROM file_versions'))await tx(db=>pruneVersions(row.file_id,db));
 const expired=await query("SELECT id,object_id FROM files WHERE expires_at<now() AND state NOT IN ('PURGED','EXPIRED','PROCESSING')");
 for(const f of expired)await tx(async db=>{await query("UPDATE files SET state='EXPIRED' WHERE id=$1 AND expires_at<now()",[f.id],db);await enqueue('purge',f.object_id,{},db);await audit(null,'file.expired',f.id,{},null,db);});
 await query('UPDATE shares SET enabled=false,version=version+1 WHERE enabled AND expires_at<now()');
 const trash=await query("SELECT id,object_id FROM files WHERE state='DELETED' AND deleted_at<now()-$1*interval '1 day'",[s.trashDays]);
 for(const f of trash)await tx(async db=>{await query("UPDATE files SET state='PURGED' WHERE id=$1 AND state='DELETED'",[f.id],db);await enqueue('purge',f.object_id,{},db);await audit(null,'trash.expired',f.id,{},null,db);});
 const folders=await query("WITH RECURSIVE tree AS (SELECT id FROM folders WHERE deleted_at<now()-$1*interval '1 day' UNION SELECT f.id FROM folders f JOIN tree t ON f.parent_id=t.id) SELECT f.id,f.object_id FROM files f WHERE folder_id IN (SELECT id FROM tree) AND state NOT IN ('PURGED','PROCESSING')",[s.trashDays]);
 for(const f of folders){await query("UPDATE files SET state='PURGED' WHERE id=$1",[f.id]);await enqueue('purge',f.object_id);}
 const stale=await query("SELECT u.*,o.object_key,m.storage_upload_id FROM uploads u JOIN file_objects o ON o.id=u.object_id LEFT JOIN multipart_sessions m ON m.upload_id=u.id WHERE u.state IN ('CREATED','UPLOADING','FAILED','FINALIZING') AND u.expires_at<now() LIMIT 100");
 for(const u of stale){let complete=false;try{const head=await storage.head(u.object_key);complete=head.size===u.size;}catch(e){if((e as {$metadata?:{httpStatusCode:number}}).$metadata?.httpStatusCode!==404)throw e;}if(complete){await finalize(u.id,u.owner_id);continue;}await tx(async db=>{const locked=await one('SELECT state FROM uploads WHERE id=$1 FOR UPDATE',[u.id],db);if(!locked||locked.state==='AVAILABLE')return;if(u.storage_upload_id)await storage.abort(u.object_key,u.storage_upload_id);await query("UPDATE uploads SET state='EXPIRED',updated_at=now() WHERE id=$1",[u.id],db);await query("UPDATE files SET state='PURGED' WHERE id=$1",[u.file_id],db);await query("UPDATE file_objects SET state='PURGED' WHERE id=$1",[u.object_id],db);await audit(null,'upload.expired',u.id,{},null,db);});}
 await query("DELETE FROM security_events WHERE created_at<now()-$1*interval '1 day'",[s.privacyRetentionDays]);
 let cursor='0';do{const result=await redis.scan(cursor,'MATCH','astrafile:rate:*','COUNT',200);cursor=result[0];const legacy=result[1].filter(key=>!/^astrafile:rate:[A-Za-z0-9_-]+:[a-f0-9]{64}$/.test(key));if(legacy.length)await redis.del(...legacy);}while(cursor!=='0');
 await query('DELETE FROM support_access WHERE expires_at<now()');
 await query("DELETE FROM support_tickets WHERE status='CLOSED' AND closed_at<now()-interval '90 days'");
 await query('DELETE FROM email_verifications WHERE expires_at<now()');
 await query('DELETE FROM ip_blocks WHERE expires_at<now()');
 for(const table of ['sessions','uploads','downloads','audit_logs','security_events'])await query(`UPDATE ${table} SET ip=NULL WHERE ip IS NOT NULL AND created_at<now()-$1*interval '1 day'`,[s.privacyRetentionDays]);
 await query('DELETE FROM sessions WHERE expires_at<now()');await query('DELETE FROM share_access WHERE expires_at<now()');await query("DELETE FROM password_resets WHERE expires_at<now()-interval '1 day'");await query("DELETE FROM storage_usage WHERE created_at<now()-interval '30 days'");
 return {expiredFiles:expired.length,expiredUploads:stale.length,trash:trash.length};
}
async function reconcile(){
 let orphanObjects=0,orphanUploads=0,missingObjects=0;const threshold=Date.now()-72*3600000;
 for await(const o of storage.objects()){if(!o.Key||!/^objects\/[a-f0-9-]{36}$/.test(o.Key))continue;const exists=await one('SELECT id,state FROM file_objects WHERE object_key=$1',[o.Key]);if(!exists){orphanObjects++;if(o.LastModified&&o.LastModified.getTime()<threshold){await storage.remove(o.Key);await audit(null,'orphan.object.removed',o.Key);}}else if(exists.state==='PURGED')await purge(exists.id);}
 for await(const u of storage.multipart()){if(!u.Key||!u.UploadId||!u.Initiated||u.Initiated.getTime()>=threshold)continue;const exists=await one('SELECT 1 FROM multipart_sessions WHERE storage_upload_id=$1',[u.UploadId]);if(!exists&&/^objects\/[a-f0-9-]{36}$/.test(u.Key)){orphanUploads++;await storage.abort(u.Key,u.UploadId);await audit(null,'orphan.multipart.aborted',u.Key);}}
 const objects=await query("SELECT id,object_key FROM file_objects WHERE state='AVAILABLE'");
 for(const o of objects){try{await storage.head(o.object_key);}catch(e){if((e as {$metadata?:{httpStatusCode:number}}).$metadata?.httpStatusCode!==404)throw e;missingObjects++;await query("UPDATE file_objects SET state='BLOCKED' WHERE id=$1",[o.id]);await audit(null,'storage.object.missing',o.id);}}
 return {orphanObjects,orphanUploads,missingObjects};
}
async function statistics(){const d=await disk(),s=await settings();const active=await one("SELECT count(*)::int n FROM uploads WHERE state IN ('CREATED','UPLOADING','FINALIZING')");await query('INSERT INTO storage_usage(used_bytes,free_bytes,total_bytes,active_uploads) VALUES($1,$2,$3,$4)',[d.usedBytes,d.freeBytes,d.totalBytes,active!.n]);if(d.freeBytes<s.warningFreeGiB*GiB){const recent=await one("SELECT 1 FROM notifications WHERE kind='LOW_DISK' AND created_at>now()-interval '1 hour'");if(!recent)await query("INSERT INTO notifications(kind,message) VALUES('LOW_DISK',$1)",[`Storage free space: ${(d.freeBytes/GiB).toFixed(1)} GiB.`]);}return d;}
async function checksum(id:string){const o=await one('SELECT * FROM file_objects WHERE id=$1',[id]);if(!o||o.sha256||o.state==='PURGED')return {};const digest=createHash('sha256');const stream=await storage.stream(o.object_key) as Readable;let bytes=0;for await(const chunk of stream){digest.update(chunk);bytes+=chunk.length;}if(bytes!==o.size)throw Error('HASH_SIZE_MISMATCH');const sha256=digest.digest('hex');await query('UPDATE file_objects SET sha256=$2 WHERE id=$1',[id,sha256]);return {sha256,bytes};}
async function scan(id:string){
 if(!env.SCAN_COMMAND)throw Error('SCANNER_NOT_CONFIGURED');const o=await one('SELECT * FROM file_objects WHERE id=$1',[id]);if(!o||o.state==='PURGED')return {};
 const child=spawn(env.SCAN_COMMAND,['--no-summary','-'],{stdio:['pipe','ignore','ignore'],shell:false});
 const exit=new Promise<number>((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve(code??2));});const timer=setTimeout(()=>child.kill('SIGTERM'),3600000);
 try{await pipeline(await storage.stream(o.object_key) as Readable,child.stdin);const code=await exit;if(code>1)throw Error('SCAN_FAILED');await tx(async db=>{await query('UPDATE file_objects SET state=$2 WHERE id=$1',[id,code===1?'BLOCKED':'AVAILABLE'],db);await query("UPDATE files SET state=$2 WHERE object_id=$1 AND state='QUARANTINED'",[id,code===1?'BLOCKED':'AVAILABLE'],db);await audit(null,code===1?'malware.detected':'scan.clean',id,{},null,db);});return {clean:code===0};}finally{clearTimeout(timer);}
}
async function backup(){
 const dir=process.env.BACKUP_DIR??path.resolve('.local/backups');await mkdir(dir,{recursive:true,mode:0o700});
 const filename=path.join(dir,`astrafile-${new Date().toISOString().replace(/[:.]/g,'-')}.dump.enc`);
 const dbUrl=new URL(env.DATABASE_URL);const local=process.platform==='win32'&&env.NODE_ENV==='development';const executable=local?'docker':process.env.PG_DUMP??'pg_dump';const args=local?['exec','astrafile-local-astrafile-postgres-1','pg_dump','-U','astrafile','-d','astrafile','-Fc','--no-owner','--no-acl']:['-Fc','--no-owner','--no-acl','-h',dbUrl.hostname,'-p',dbUrl.port||'5432','-U',decodeURIComponent(dbUrl.username),dbUrl.pathname.slice(1)];const child=spawn(executable,args,{env:{...process.env,PGPASSWORD:decodeURIComponent(dbUrl.password)},stdio:['ignore','pipe','ignore'],shell:false,windowsHide:true});
 const completion=new Promise<number>((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve(code??1));});
 const [,code]=await Promise.all([pipeline(encryptedBackupStream(child.stdout),createWriteStream(filename,{flags:'wx',mode:0o600})),completion]);if(code!==0)throw Error('DATABASE_BACKUP_FAILED');const info=await stat(filename);if(info.size<100)throw Error('DATABASE_BACKUP_EMPTY');await audit(null,'backup.created',path.basename(filename),{bytes:info.size,verified:'dump-created; restoration requires separate restore-check'});return {file:path.basename(filename),bytes:info.size,restoreVerified:false};
}
let nextCleanup=0,nextStats=0,nextReconcile=0,nextBackup=0;
async function loop(){
 while(!stopping){
  try{
   await leader.query('SELECT 1');const now=Date.now();
   if(now>=nextCleanup){await enqueue('cleanup','scheduled');nextCleanup=now+60000;}
   if(now>=nextStats){await enqueue('statistics','scheduled');nextStats=now+60000;}
   if(now>=nextReconcile){await enqueue('reconcile','scheduled');nextReconcile=now+6*3600000;}
   if(now>=nextBackup&&process.env.BACKUP_ENABLED==='true'){await enqueue('backup','scheduled');nextBackup=now+86400000;}
   const job=await tx(db=>one("UPDATE background_jobs SET status='RUNNING',attempts=attempts+1,updated_at=now() WHERE id=(SELECT id FROM background_jobs WHERE status='PENDING' OR (status='FAILED' AND attempts<5 AND updated_at<now()-power(2,attempts)*interval '1 minute') ORDER BY CASE WHEN kind='hash' THEN 1 ELSE 0 END,created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *",[],db));
   if(job){try{let detail;switch(job.kind){case 'cleanup':detail=await cleanup();break;case 'reconcile':detail=await reconcile();break;case 'statistics':detail=await statistics();break;case 'hash':detail=await checksum(job.target);break;case 'purge':await purge(job.target);detail={};break;case 'scan':detail=await scan(job.target);break;case 'backup':detail=await backup();break;default:throw Error('UNKNOWN_JOB');}await query("UPDATE background_jobs SET status='COMPLETED',detail=$2,error=NULL,updated_at=now() WHERE id=$1",[job.id,JSON.stringify(detail??{})]);}catch(e){await query("UPDATE background_jobs SET status='FAILED',error=$2,updated_at=now() WHERE id=$1",[job.id,(e as {code?:string}).code??(e as Error).name]);console.error(JSON.stringify({event:'job.failed',kind:job.kind,id:job.id,errorType:(e as Error).name}));}}
   else await new Promise(resolve=>setTimeout(resolve,1000));
  }catch(e){console.error(JSON.stringify({event:'worker.error',errorType:(e as Error).name}));await new Promise(resolve=>setTimeout(resolve,5000));}
 }
 clearInterval(heartbeat);await redis.del('astrafile:worker:heartbeat');await leader.query('SELECT pg_advisory_unlock(74392104)').catch(()=>{});leader.release();await pool.end();await redis.quit();
}
process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
console.info('AstraFile worker is running.');await loop();
