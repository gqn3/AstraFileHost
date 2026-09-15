import {randomUUID,randomBytes} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {fileTypeFromBuffer} from 'file-type';
import {one,query,tx,settings,audit,type DB} from '../../../packages/database/index.js';
import {storage,type StoragePart} from '../../../packages/storage/index.js';
import {uploadSchema,partSchema,partSize,expectedPartBytes,assertParts} from '../../../packages/validation/index.js';
import {ApiError,requireValue,reserve,writable,limited,enqueue,disk} from './lib.js';
import {requireUser,moderator} from './auth.js';
import {createShareCapability,shareAllowance} from './share-capability.js';
import {networkReference} from '../../../packages/privacy/index.js';
export const uploadId=(req:FastifyRequest)=>z.object({id:z.uuid()}).parse(req.params).id;
export async function ownedUpload(id:string,owner:string,db?:DB,lock=false){return requireValue(await one(`SELECT u.*,o.object_key,m.storage_upload_id FROM uploads u JOIN file_objects o ON o.id=u.object_id LEFT JOIN multipart_sessions m ON m.upload_id=u.id WHERE u.id=$1 AND u.owner_id=$2 ${lock?'FOR UPDATE OF u':''}`,[id,owner],db));}
export async function reconcile(u:Record<string,any>,db?:DB) {
 const parts=await storage.listParts(u.object_key,u.storage_upload_id);
 const signed=await query('SELECT * FROM upload_parts WHERE upload_id=$1 ORDER BY part_number',[u.id],db);
 for(const p of parts){const expected=signed.find(s=>s.part_number===p.number);if(!expected||p.size!==expected.expected_bytes||(p.checksum&&p.checksum!==expected.checksum_sha256))throw new ApiError(409,'Storage part failed integrity validation.','PART_INTEGRITY');await query('UPDATE upload_parts SET etag=$3,confirmed_at=now() WHERE upload_id=$1 AND part_number=$2',[u.id,p.number,p.etag],db);}
 await query('UPDATE uploads SET bytes_confirmed=$2,updated_at=now() WHERE id=$1',[u.id,parts.reduce((s,p)=>s+p.size,0)],db);
 return parts;
}
export async function finalize(id:string,owner:string,ip:string|null=null) {
 return tx(async db=>{
  const u=await ownedUpload(id,owner,db,true);
  if(u.state==='AVAILABLE')return {fileId:u.file_id};
  if(!['UPLOADING','FINALIZING','FAILED'].includes(u.state))throw new ApiError(409,'Upload cannot be completed in its current state.');
  let head;
  // A successful storage completion can precede a process failure. Recover via HeadObject.
  try{head=await storage.head(u.object_key);}catch(e){if(!['NotFound','NoSuchKey'].includes((e as {name:string}).name)&&(e as {$metadata?:{httpStatusCode:number}}).$metadata?.httpStatusCode!==404)throw e;}
  if(!head){
   const parts=await reconcile(u,db);try{assertParts(u.size,u.part_size,parts);}catch{throw new ApiError(409,'Some parts are missing or incomplete. Resume the upload.','INCOMPLETE_UPLOAD');}
   const recorded=await query('SELECT part_number,expected_bytes,etag,checksum_sha256 FROM upload_parts WHERE upload_id=$1 ORDER BY part_number',[u.id],db);
   const manifest:StoragePart[]=recorded.map(p=>({number:p.part_number,size:p.expected_bytes,etag:p.etag,checksum:p.checksum_sha256}));
   assertParts(u.size,u.part_size,manifest);
   await query("UPDATE uploads SET state='FINALIZING',updated_at=now() WHERE id=$1",[id],db);
   await storage.complete(u.object_key,u.storage_upload_id,manifest);head=await storage.head(u.object_key);
  }
  if(head.size!==u.size)throw new ApiError(409,'Completed object size differs from the original file.','OBJECT_INTEGRITY');
  const prefix=await storage.prefix(u.object_key);const detected=await fileTypeFromBuffer(prefix);
  const isText=!prefix.includes(0)&&!new TextDecoder('utf-8',{fatal:false}).decode(prefix).includes('\uFFFD');
  const mime=detected?.mime??(isText?'text/plain':'application/octet-stream');
  const s=await settings(db);const state=s.scanningEnabled?'QUARANTINED':'AVAILABLE';
  await query('UPDATE file_objects SET size=$2,etag=$3,checksum_sha256=$4,detected_mime=$5,state=$6,verified_at=now() WHERE id=$1',[u.object_id,head.size,head.etag,head.checksum??null,mime,state],db);
  await query('UPDATE files SET state=$2 WHERE id=$1',[u.file_id,state],db);
  await query("UPDATE uploads SET state='AVAILABLE',bytes_confirmed=size,error_code=NULL,updated_at=now() WHERE id=$1",[id],db);
  const f=requireValue(await one('SELECT name,expires_at FROM files WHERE id=$1',[u.file_id],db));
  const ownerInfo=await one('SELECT anonymous FROM users WHERE id=$1',[owner],db);const sharingAllowed=!(ownerInfo!.anonymous&&!s.anonymousSharingEnabled);let shareSecret:string|undefined;
  const exp=s.defaultShareHours?new Date(Date.now()+s.defaultShareHours*3600000):null;
  const expiresAt=f.expires_at&&(!exp||new Date(f.expires_at)<exp)?f.expires_at:exp;
  if(sharingAllowed&&(await shareAllowance(db,owner)).available){const share=await createShareCapability(db,owner,f.name,{expiresAt,maxDownloads:s.defaultMaxDownloads});shareSecret=share.secret;await query('INSERT INTO share_items(share_id,file_id) VALUES($1,$2)',[share.id,u.file_id],db);}
  await enqueue('hash',u.object_id,{},db);if(s.scanningEnabled)await enqueue('scan',u.object_id,{},db);
  await audit(owner,'upload.completed',u.file_id,{size:head.size,integrity:'part-sha256-and-object-size'},ip,db);
  return {fileId:u.file_id,shareSecret,state};
 });
}
export async function abortUpload(id:string,owner:string,actor:string,ip:string|null=null){
 return tx(async db=>{const u=await ownedUpload(id,owner,db,true);if(['AVAILABLE','FINALIZING'].includes(u.state))throw new ApiError(409,'A completed or finalizing upload cannot be aborted.');if(['ABORTED','EXPIRED'].includes(u.state))return {ok:true};if(u.storage_upload_id)await storage.abort(u.object_key,u.storage_upload_id);await query("UPDATE uploads SET state='ABORTED',updated_at=now() WHERE id=$1",[id],db);await query("UPDATE files SET state='PURGED',deleted_at=now() WHERE id=$1",[u.file_id],db);await query("UPDATE file_objects SET state='PURGED' WHERE id=$1",[u.object_id],db);await audit(actor,'upload.aborted',id,{},ip,db);return {ok:true};});
}
export async function uploadRoutes(app:FastifyInstance){
 app.post('/api/uploads',async req=>{
  const user=requireUser(req);const s=await writable();if(user.anonymous&&!s.anonymousEnabled)throw new ApiError(403,'Anonymous uploads are disabled.');await limited(`uploads:${user.id}`,s.uploadCreatesPerHour,3600);await limited(`uploads-minute:${user.id}`,s.uploadCreatesPerMinute,60);await limited(`uploads-device:${req.sessionId??user.id}`,s.uploadCreatesPerHour,3600);if(user.anonymous)await limited(`anonymous-uploads:${req.ip}`,s.anonymousCreatesPerHour,3600);
  const failures=await one("SELECT COALESCE(sum(GREATEST(failure_count,1)),0)::int n,max(updated_at) latest FROM uploads WHERE owner_id=$1 AND error_code IS NOT NULL AND updated_at>now()-interval '24 hours'",[user.id]);const cooldown=s.uploadCooldownMinutes*Math.min(16,2**Math.max(0,Math.floor(failures!.n/s.failedUploadThreshold)-1));if(failures!.n>=s.failedUploadThreshold&&new Date(failures!.latest).getTime()+cooldown*60000>Date.now())throw new ApiError(429,'Upload creation is temporarily paused after repeated failures. Existing transfers can be resumed.','UPLOAD_COOLDOWN');
  const i=uploadSchema.parse(req.body);if(s.blockedExtensions.includes(i.name.split('.').at(-1)!.toLowerCase()))throw new ApiError(415,'This file extension is blocked.');
  if(i.expiresAt&&new Date(i.expiresAt)<=new Date())throw new ApiError(400,'Expiration must be in the future.');
  const objectId=randomUUID(),fileId=randomUUID(),id=randomUUID(),key=`objects/${objectId}`;
  const bytes=partSize(i.size,s.partMiB);
  const guestExpiry=user.anonymous?new Date(Date.now()+s.anonymousRetentionDays*86400000):null;
  const expiry=guestExpiry&&(!i.expiresAt||new Date(i.expiresAt)>guestExpiry)?guestExpiry:i.expiresAt??null;
  await tx(async db=>{
   await reserve(user.id,i.size,db);
   if(i.folderId)requireValue(await one('SELECT id FROM folders WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL',[i.folderId,user.id],db));
   await query('INSERT INTO file_objects(id,object_key,expected_size) VALUES($1,$2,$3)',[objectId,key,i.size],db);
   await query('INSERT INTO files(id,owner_id,object_id,folder_id,name,declared_mime,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[fileId,user.id,objectId,i.folderId??null,i.name,i.mime,expiry],db);
   await query('INSERT INTO uploads(id,owner_id,file_id,object_id,fingerprint,size,part_size,ip,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+$9*interval \'1 hour\')',[id,user.id,fileId,objectId,i.fingerprint,i.size,bytes,networkReference(req.ip),s.uploadTimeoutHours],db);
  });
  try{const storageId=await storage.create(key);await tx(async db=>{await query('INSERT INTO multipart_sessions(upload_id,storage_upload_id) VALUES($1,$2)',[id,storageId],db);await query("UPDATE uploads SET state='UPLOADING' WHERE id=$1",[id],db);});}
  catch(e){await query("UPDATE uploads SET state='FAILED',error_code='INIT_FAILED',failure_count=failure_count+1 WHERE id=$1",[id]);throw e;}
  return {id,fileId,partSize:bytes,partCount:Math.ceil(i.size/bytes),concurrency:s.concurrency,expiresAt:expiry};
 });
 app.get('/api/uploads',async req=>{const u=requireUser(req);return {items:await query('SELECT u.id,u.file_id,u.fingerprint,u.size,u.part_size,u.state,u.bytes_confirmed,u.failure_count,u.created_at,u.updated_at,u.expires_at,f.name FROM uploads u JOIN files f ON f.id=u.file_id WHERE u.owner_id=$1 ORDER BY u.created_at DESC LIMIT 200',[u.id])};});
 app.get('/api/uploads/:id',async req=>{
  const u=await ownedUpload(uploadId(req),requireUser(req).id);let parts:StoragePart[]=[];
  if(u.storage_upload_id&&['UPLOADING','FAILED','FINALIZING'].includes(u.state)){try{parts=await tx(async db=>{const locked=await ownedUpload(u.id,u.owner_id,db,true);return reconcile(locked,db);});}catch(e){if((e as {name:string}).name==='NoSuchUpload'){const result=await finalize(u.id,u.owner_id,req.ip);return {...result,id:u.id,state:'AVAILABLE',parts:[]};}throw e;}}
  return {id:u.id,fileId:u.file_id,size:u.size,partSize:u.part_size,concurrency:(await settings()).concurrency,fingerprint:u.fingerprint,state:u.state,parts:parts.map(p=>({number:p.number,etag:p.etag,size:p.size,checksum:p.checksum})),expiresAt:u.expires_at};
 });
 app.post('/api/uploads/:id/sign',async req=>{
  const user=requireUser(req);await limited(`upload-sign:${user.id}`,120,60);const policy=await writable();if((await disk()).freeBytes<Math.max(policy.minimumFreeGiB,policy.criticalFreeGiB)*1024**3)throw new ApiError(507,'Storage is critically low. Your confirmed parts are retained.','LOW_DISK');const i=partSchema.parse(req.body);const id=uploadId(req);
  return tx(async db=>{
   const u=await ownedUpload(id,user.id,db,true);if(!['UPLOADING','FAILED'].includes(u.state)||!u.storage_upload_id||new Date(u.expires_at)<new Date())throw new ApiError(409,'Upload session is not active.');
   const urls=[];for(const p of i.parts){let size;try{size=expectedPartBytes(u.size,u.part_size,p.number);}catch{throw new ApiError(400,'Invalid part number.');}
    const existing=await one('SELECT * FROM upload_parts WHERE upload_id=$1 AND part_number=$2',[id,p.number],db);if(existing&&existing.checksum_sha256!==p.checksum)throw new ApiError(409,'File part changed. Select the original file.','FINGERPRINT_MISMATCH');
    await query('INSERT INTO upload_parts(upload_id,part_number,expected_bytes,checksum_sha256) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[id,p.number,size,p.checksum],db);
    urls.push({number:p.number,url:await storage.signPart(u.object_key,u.storage_upload_id,p.number,size,p.checksum),headers:{'x-amz-checksum-sha256':p.checksum}});
   }
   await query("UPDATE uploads SET state='UPLOADING',updated_at=now() WHERE id=$1",[id],db);return {parts:urls};
  });
 });
 app.post('/api/uploads/:id/ack',async req=>{
  const u=await ownedUpload(uploadId(req),requireUser(req).id);const p=z.object({number:z.number().int().min(1).max(10000),etag:z.string().min(1).max(200)}).parse(req.body);
  await query('UPDATE upload_parts SET etag=$3,confirmed_at=now() WHERE upload_id=$1 AND part_number=$2',[u.id,p.number,p.etag]);await query('UPDATE uploads SET bytes_confirmed=(SELECT COALESCE(sum(expected_bytes),0) FROM upload_parts WHERE upload_id=$1 AND etag IS NOT NULL),updated_at=now() WHERE id=$1',[u.id]);return {ok:true};
 });
 app.post('/api/uploads/:id/complete',async req=>{const u=requireUser(req);await limited(`upload-complete:${u.id}`,30,60);try{return await finalize(uploadId(req),u.id,req.ip);}catch(error){if(error instanceof ApiError&&['INCOMPLETE_UPLOAD','PART_INTEGRITY','OBJECT_INTEGRITY'].includes(error.code))await query("UPDATE uploads SET failure_count=failure_count+1,error_code=$3,updated_at=now() WHERE id=$1 AND owner_id=$2 AND state<>'AVAILABLE'",[uploadId(req),u.id,error.code]);throw error;}});
 app.post('/api/uploads/:id/abort',async req=>{const u=requireUser(req);await limited(`upload-abort:${u.id}`,30,60);return abortUpload(uploadId(req),u.id,u.id,req.ip);});
 app.post('/api/admin/uploads/:id/abort',async req=>{const actor=moderator(req);const row=requireValue(await one('SELECT owner_id FROM uploads WHERE id=$1',[uploadId(req)]));return abortUpload(uploadId(req),row.owner_id,actor.id,req.ip);});
}
