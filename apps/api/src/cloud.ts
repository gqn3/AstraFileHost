import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {query,one,tx,settings,audit,type DB} from '../../../packages/database/index.js';
import {requireUser} from './auth.js';
import {ApiError,requireValue,writable,enqueue} from './lib.js';
import {paramId,accessibleFile} from './files.js';
import {entitlements} from './entitlements.js';
export async function pruneVersions(fileId:string,db:DB){
 const file=requireValue(await one('SELECT owner_id,state FROM files WHERE id=$1',[fileId],db));
 const policy=(await entitlements(file.owner_id,db)).effective,s=await settings(db);
 const count=['PURGED','EXPIRED'].includes(file.state)?0:Math.min(policy.versionCount,s.maxVersionCount);
 const days=Math.min(policy.versionDays,s.maxVersionDays);
 const removed=await query("DELETE FROM file_versions WHERE id IN (SELECT id FROM (SELECT id,created_at,row_number() OVER(ORDER BY created_at DESC,id DESC) n FROM file_versions WHERE file_id=$1) ranked WHERE n>$2 OR created_at<now()-$3*interval '1 day') RETURNING object_id",[fileId,count,days],db);
 for(const row of removed)await enqueue('purge',row.object_id,{},db);
}
export async function cloudRoutes(app:FastifyInstance){
 app.get('/api/cloud/changes',async req=>{
  const user=requireUser(req),{cursor,limit}=z.object({cursor:z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),limit:z.coerce.number().int().min(1).max(500).default(200)}).parse(req.query);
  const latest=(await one('SELECT sequence FROM cloud_cursors WHERE owner_id=$1',[user.id]))?.sequence??0;
  if(cursor>latest)throw new ApiError(409,'Cloud cursor is no longer valid. Refresh your file list.','CLOUD_CURSOR');
  const items=await query('SELECT sequence,entity,entity_id,operation,revision FROM cloud_changes WHERE owner_id=$1 AND sequence>$2 ORDER BY sequence LIMIT $3',[user.id,cursor,limit]);
  return {items,cursor:items.at(-1)?.sequence??cursor,hasMore:items.length===limit};
 });
 app.get('/api/files/:id/versions',async req=>{
  const user=requireUser(req),id=paramId(req),file=requireValue(await one('SELECT id,revision FROM files WHERE id=$1 AND owner_id=$2',[id,user.id]));
  return {file,enabled:(await settings()).versioningEnabled,policy:(await entitlements(user.id)).effective,items:await query('SELECT v.id,v.revision,v.name,v.created_at,o.size,o.sha256,o.detected_mime FROM file_versions v JOIN file_objects o ON o.id=v.object_id WHERE v.file_id=$1 ORDER BY v.created_at DESC,v.id DESC',[id])};
 });
 async function replace(userId:string,id:string,expectedRevision:number,sourceId:string,restoring:boolean,ip:string){
  await writable();return tx(async db=>{
   await one('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId],db);
   const target=requireValue(await one('SELECT * FROM files WHERE id=$1 AND owner_id=$2 FOR UPDATE',[id,userId],db));
   if(target.revision!==expectedRevision)throw new ApiError(409,'This file changed on another device. Refresh before restoring or replacing it.','VERSION_CONFLICT');
   if(target.state!=='AVAILABLE')throw new ApiError(409,'Only available files can be versioned.');
   const policy=(await entitlements(userId,db)).effective,s=await settings(db);
   if(!s.versioningEnabled||policy.versionCount===0||policy.versionDays===0)throw new ApiError(403,'Version history is disabled for this account.','VERSIONS_DISABLED');
   const source=restoring?requireValue(await one("SELECT v.*,o.size FROM file_versions v JOIN file_objects o ON o.id=v.object_id WHERE v.id=$1 AND v.file_id=$2 AND o.state='AVAILABLE'",[sourceId,id],db)):await accessibleFile(sourceId,db);
   if(!restoring&&source.owner_id!==userId)throw new ApiError(404,'File not found.');
   if(source.object_id===target.object_id)return {ok:true,revision:target.revision};
   if(source.size>policy.fileBytes)throw new ApiError(413,'The replacement exceeds your file limit.');
   await query('INSERT INTO file_versions(file_id,object_id,revision,name,declared_mime) VALUES($1,$2,$3,$4,$5)',[id,target.object_id,target.revision,target.name,target.declared_mime],db);
   const updated=requireValue(await one('UPDATE files SET object_id=$2,declared_mime=$3 WHERE id=$1 RETURNING revision',[id,source.object_id,source.declared_mime],db));
   await pruneVersions(id,db);
   const balance=requireValue(await one('SELECT used_bytes+reserved_bytes bytes FROM account_storage_usage WHERE owner_id=$1',[userId],db));if(balance.bytes>policy.storageBytes)throw new ApiError(413,'Version history would exceed your storage quota.','STORAGE_QUOTA');
   await audit(userId,restoring?'file.version.restored':'file.version.replaced',id,{sourceRevision:source.revision},ip,db);return {ok:true,revision:updated.revision};
  });
 }
 app.post('/api/files/:id/versions',async req=>{const user=requireUser(req),input=z.object({sourceFileId:z.uuid(),expectedRevision:z.number().int().positive()}).parse(req.body);return replace(user.id,paramId(req),input.expectedRevision,input.sourceFileId,false,req.ip);});
 app.post('/api/files/:id/versions/restore',async req=>{const user=requireUser(req),input=z.object({versionId:z.uuid(),expectedRevision:z.number().int().positive()}).parse(req.body);return replace(user.id,paramId(req),input.expectedRevision,input.versionId,true,req.ip);});
}
