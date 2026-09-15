import {entitlements} from './entitlements.js';
import {randomUUID} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {one,query,tx,audit,settings,type DB} from '../../../packages/database/index.js';
import {storage} from '../../../packages/storage/index.js';
import {nameSchema} from '../../../packages/validation/index.js';
import {requireUser,moderator} from './auth.js';
import {ApiError,requireValue,writable,bandwidth,enqueue} from './lib.js';
import {networkReference} from '../../../packages/privacy/index.js';
export const paramId=(req:FastifyRequest)=>z.object({id:z.uuid()}).parse(req.params).id;
export async function ownedFile(id:string,owner:string,db?:DB){return requireValue(await one('SELECT f.*,o.expected_size size,o.object_key,o.detected_mime,o.sha256,o.checksum_sha256,o.etag FROM files f JOIN file_objects o ON o.id=f.object_id WHERE f.id=$1 AND f.owner_id=$2',[id,owner],db));}
export async function accessibleFile(id:string,db?:DB){const f=requireValue(await one("SELECT f.*,o.size,o.object_key,o.detected_mime,o.sha256,o.checksum_sha256 FROM files f JOIN file_objects o ON o.id=f.object_id JOIN users u ON u.id=f.owner_id WHERE f.id=$1 AND f.state='AVAILABLE' AND o.state='AVAILABLE' AND u.status='ACTIVE' AND (f.expires_at IS NULL OR f.expires_at>now())",[id],db));if(f.folder_id){const parent=await one('WITH RECURSIVE parents AS (SELECT id,parent_id,deleted_at FROM folders WHERE id=$1 UNION SELECT f.id,f.parent_id,f.deleted_at FROM folders f JOIN parents p ON p.parent_id=f.id) SELECT id FROM parents WHERE deleted_at IS NOT NULL LIMIT 1',[f.folder_id],db);if(parent)throw new ApiError(404,'File not found.');}return f;}
export async function directDownload(id:string,ip:string,db:DB,shareId:string|null=null,preview=false){
 const f=await accessibleFile(id,db);await bandwidth(f.owner_id,f.size,db);
 const safeMime=/^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4|ogg|wav|flac)|application\/pdf|text\/plain)$/.test(f.detected_mime??'');
 if(preview&&!safeMime)throw new ApiError(415,'This type is available as a download only.');
 await query('INSERT INTO downloads(file_id,share_id,owner_id,bytes_authorized,ip) VALUES($1,$2,$3,$4,$5)',[id,shareId,f.owner_id,f.size,networkReference(ip)],db);
 return {url:await storage.download(f.object_key,f.name,f.detected_mime??'application/octet-stream',preview),expiresIn:900,mime:f.detected_mime,size:f.size,name:f.name};
}
async function ensureFolder(id:string|null,owner:string,db:DB){if(id)requireValue(await one('SELECT id FROM folders WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL',[id,owner],db));}
export async function fileRoutes(app:FastifyInstance){
 app.get('/api/files',async req=>{
  const u=requireUser(req);const p=z.object({folder:z.uuid().optional(),q:z.string().max(150).default(''),view:z.enum(['files','recent','favorites','trash','shared']).default('files'),type:z.enum(['all','image','video','audio','document','archive']).default('all'),sort:z.enum(['name','size','date']).default('date'),offset:z.coerce.number().int().min(0).max(100000).default(0)}).parse(req.query);
  const order={name:'f.name ASC',size:'o.expected_size DESC',date:'f.created_at DESC'}[p.sort];
  const where=p.view==='trash'?"f.state='DELETED'":"f.state NOT IN ('DELETED','EXPIRED','PURGED')";
  const folderFilter=p.view==='files'&&!p.q?'AND f.folder_id IS NOT DISTINCT FROM $3::uuid':'';
  const v=p.view==='favorites'?'AND f.favorite':p.view==='shared'?'AND EXISTS(SELECT 1 FROM share_items i JOIN shares s ON s.id=i.share_id WHERE i.file_id=f.id AND s.enabled)':'';
  const type=p.type==='all'?'':p.type==='document'?"AND o.detected_mime IN ('application/pdf','text/plain')":p.type==='archive'?"AND (o.detected_mime LIKE '%zip%' OR o.detected_mime LIKE '%rar%' OR o.detected_mime LIKE '%compressed%')":`AND o.detected_mime LIKE '${p.type}/%'`;
  const items=await query(`SELECT f.id,f.name,f.folder_id,f.state,f.favorite,f.created_at,f.expires_at,f.declared_mime,o.expected_size size,o.detected_mime,o.sha256,(SELECT count(*)::int FROM downloads d WHERE d.file_id=f.id) downloads,(SELECT count(*)::int FROM share_items i JOIN shares s ON s.id=i.share_id WHERE i.file_id=f.id AND s.enabled) shares FROM files f JOIN file_objects o ON o.id=f.object_id WHERE f.owner_id=$1 AND ${where} AND f.name ILIKE $2 ${folderFilter} ${v} ${type} AND ($3::uuid IS NULL OR true) ORDER BY ${order},f.id LIMIT 100 OFFSET $4`,[u.id,`%${p.q.replace(/[%_\\]/g,'\\$&')}%`,p.folder??null,p.offset]);
  const folders=await query(`SELECT * FROM folders WHERE owner_id=$1 AND ${p.view==='trash'?'deleted_at IS NOT NULL':'deleted_at IS NULL'} AND parent_id IS NOT DISTINCT FROM $2::uuid ORDER BY name LIMIT 500`,[u.id,p.folder??null]);
  const crumbs=p.folder?await query('WITH RECURSIVE parents AS (SELECT id,name,parent_id,0 depth FROM folders WHERE id=$1 AND owner_id=$2 UNION ALL SELECT f.id,f.name,f.parent_id,p.depth+1 FROM folders f JOIN parents p ON f.id=p.parent_id WHERE p.depth<64) SELECT id,name FROM parents ORDER BY depth DESC',[p.folder,u.id]):[];
  return {items,folders,crumbs,hasMore:items.length===100};
 });
 app.get('/api/files/usage',async req=>{const u=requireUser(req);const s=await settings();const r=await one("SELECT COALESCE(sum(o.expected_size),0)::bigint bytes,count(*)::int files FROM files f JOIN file_objects o ON o.id=f.object_id WHERE f.owner_id=$1 AND f.state NOT IN ('PURGED','EXPIRED')",[u.id]);const balance=requireValue(await one('SELECT used_bytes,reserved_bytes FROM account_storage_usage WHERE owner_id=$1',[u.id]));return {...r,bytes:balance.used_bytes,...balance,quota:(await entitlements(u.id)).effective,...await one('SELECT used_bytes,reserved_bytes FROM account_storage_usage WHERE owner_id=$1',[u.id])};});
 app.get('/api/files/:id',async req=>{const f=await ownedFile(paramId(req),requireUser(req).id);const {object_key,...safe}=f;return {file:safe,shares:await query('SELECT s.id,s.enabled,s.expires_at FROM shares s JOIN share_items i ON i.share_id=s.id WHERE i.file_id=$1 AND s.owner_id=$2',[f.id,f.owner_id])};});
 app.post('/api/files/:id/download',async req=>{await ownedFile(paramId(req),requireUser(req).id);const p=z.object({preview:z.boolean().default(false)}).parse(req.body??{});return tx(db=>directDownload(paramId(req),req.ip,db,null,p.preview));});
 app.patch('/api/files/:id',async req=>{
  await writable();const u=requireUser(req),id=paramId(req);const i=z.object({expectedRevision:z.number().int().positive().optional(),name:nameSchema.optional(),folderId:z.uuid().nullable().optional(),favorite:z.boolean().optional(),expiresAt:z.iso.datetime().nullable().optional()}).parse(req.body);
  await tx(async db=>{const current=requireValue(await one('SELECT revision FROM files WHERE id=$1 AND owner_id=$2 FOR UPDATE',[id,u.id],db));if(i.expectedRevision!==undefined&&current.revision!==i.expectedRevision)throw new ApiError(409,'This file changed on another device. Refresh before editing.','VERSION_CONFLICT');if(i.folderId!==undefined)await ensureFolder(i.folderId,u.id,db);await query('UPDATE files SET name=COALESCE($3,name),folder_id=CASE WHEN $4 THEN $5::uuid ELSE folder_id END,favorite=COALESCE($6,favorite),expires_at=CASE WHEN $7 THEN $8::timestamptz ELSE expires_at END WHERE id=$1 AND owner_id=$2',[id,u.id,i.name??null,i.folderId!==undefined,i.folderId??null,i.favorite??null,i.expiresAt!==undefined,i.expiresAt??null],db);await audit(u.id,'file.updated',id,i,req.ip,db);});return {ok:true};
 });
 app.post('/api/files/bulk',async req=>{
  await writable();const u=requireUser(req);const i=z.object({ids:z.array(z.uuid()).min(1).max(100),action:z.enum(['delete','restore','move','copy','purge']),folderId:z.uuid().nullable().optional(),confirm:z.literal('DELETE PERMANENTLY').optional()}).parse(req.body);
  if(i.action==='purge'&&i.confirm!=='DELETE PERMANENTLY')throw new ApiError(400,'Permanent deletion needs explicit confirmation.');
  await tx(async db=>{
   await one('SELECT id FROM users WHERE id=$1 FOR UPDATE',[u.id],db);if(i.action==='move'||i.action==='copy')await ensureFolder(i.folderId??null,u.id,db);
   for(const id of [...new Set(i.ids)]){
    const f=await ownedFile(id,u.id,db);
    if(i.action==='delete'){if(f.state!=='AVAILABLE'&&f.state!=='QUARANTINED'&&f.state!=='BLOCKED')throw new ApiError(409,'Only completed files can be moved to trash.');await query("UPDATE files SET state='DELETED',deleted_at=now() WHERE id=$1",[id],db);}
    if(i.action==='restore'){if(f.state!=='DELETED')throw new ApiError(409,'File is not in trash.');const obj=await one('SELECT state FROM file_objects WHERE id=$1',[f.object_id],db);if(obj!.state!=='AVAILABLE')throw new ApiError(409,'This object cannot be restored.');await query("UPDATE files SET state='AVAILABLE',deleted_at=NULL WHERE id=$1",[id],db);}
    if(i.action==='move')await query('UPDATE files SET folder_id=$2 WHERE id=$1',[id,i.folderId??null],db);
    if(i.action==='copy'){
     if(f.state!=='AVAILABLE')throw new ApiError(409,'Only available files can be copied.');
     const s=await settings(db);const q=(await entitlements(u.id,db)).effective;const used=await one('SELECT used_bytes+reserved_bytes bytes FROM account_storage_usage WHERE owner_id=$1',[u.id],db);if(used!.bytes+f.size>q.storageBytes)throw new ApiError(413,'Storage quota exceeded.');
     await query("INSERT INTO files(id,owner_id,object_id,folder_id,name,declared_mime,state,expires_at) VALUES($1,$2,$3,$4,$5,$6,'AVAILABLE',$7)",[randomUUID(),u.id,f.object_id,i.folderId??f.folder_id,f.name,f.declared_mime,f.expires_at],db);
    }
    if(i.action==='purge'){if(f.state!=='DELETED')throw new ApiError(409,'Move the file to trash before deleting it permanently.');await query("UPDATE files SET state='PURGED' WHERE id=$1",[id],db);await enqueue('purge',f.object_id,{},db);}
    await audit(u.id,`file.${i.action}`,id,{},req.ip,db);
   }
  });return {ok:true};
 });
 app.get('/api/folders',async req=>({items:await query('SELECT id,name,parent_id FROM folders WHERE owner_id=$1 AND deleted_at IS NULL ORDER BY name LIMIT 2000',[requireUser(req).id])}));
 app.post('/api/folders',async req=>{await writable();const u=requireUser(req);const i=z.object({name:nameSchema,parentId:z.uuid().nullable().default(null)}).parse(req.body);return tx(async db=>{await ensureFolder(i.parentId,u.id,db);const f=requireValue(await one('INSERT INTO folders(owner_id,name,parent_id) VALUES($1,$2,$3) RETURNING *',[u.id,i.name,i.parentId],db));await audit(u.id,'folder.created',f.id,{},req.ip,db);return f;});});
 app.patch('/api/folders/:id',async req=>{
  await writable();const u=requireUser(req),id=paramId(req);const i=z.object({name:nameSchema.optional(),parentId:z.uuid().nullable().optional(),deleted:z.boolean().optional()}).parse(req.body);
  await tx(async db=>{await one('SELECT id FROM users WHERE id=$1 FOR UPDATE',[u.id],db);requireValue(await one('SELECT id FROM folders WHERE id=$1 AND owner_id=$2',[id,u.id],db));if(i.parentId!==undefined){await ensureFolder(i.parentId,u.id,db);if(i.parentId){const cycle=await one('WITH RECURSIVE children AS (SELECT id FROM folders WHERE id=$1 UNION SELECT f.id FROM folders f JOIN children c ON f.parent_id=c.id) SELECT 1 FROM children WHERE id=$2',[id,i.parentId],db);if(cycle)throw new ApiError(400,'A folder cannot be moved inside itself.');}}
   await query('UPDATE folders SET name=COALESCE($2,name),parent_id=CASE WHEN $3 THEN $4::uuid ELSE parent_id END,deleted_at=CASE WHEN $5 THEN CASE WHEN $6 THEN now() ELSE NULL END ELSE deleted_at END WHERE id=$1',[id,i.name??null,i.parentId!==undefined,i.parentId??null,i.deleted!==undefined,i.deleted??false],db);await audit(u.id,'folder.updated',id,i,req.ip,db);
  });return {ok:true};
 });
 app.patch('/api/admin/files/:id',async req=>{
  const actor=moderator(req),id=paramId(req);const i=z.object({state:z.enum(['AVAILABLE','BLOCKED','DELETED','EXPIRED']).optional(),ownerId:z.uuid().optional(),folderId:z.uuid().nullable().optional(),expiresAt:z.iso.datetime().nullable().optional()}).parse(req.body);
  if(i.ownerId&&!['OWNER','ADMIN'].includes(actor.role))throw new ApiError(403,'Only an administrator can reassign ownership.');
  await tx(async db=>{if(i.ownerId)await one('SELECT id FROM users WHERE id=$1 FOR UPDATE',[i.ownerId],db);const f=requireValue(await one('SELECT * FROM files WHERE id=$1 FOR UPDATE',[id],db));if(['PROCESSING','PURGED'].includes(f.state))throw new ApiError(409,'File cannot be changed in its current state.');const obj=requireValue(await one('SELECT state,size FROM file_objects WHERE id=$1 FOR UPDATE',[f.object_id],db));if(i.state==='AVAILABLE'&&!['AVAILABLE','BLOCKED'].includes(obj.state))throw new ApiError(409,'The original object is not available for restoration.');if(i.ownerId){const dest=requireValue(await one("SELECT * FROM users WHERE id=$1 AND status='ACTIVE' FOR UPDATE",[i.ownerId],db));const policy=await settings(db);const quota=(await entitlements(dest.id,db)).effective;const used=await one('SELECT used_bytes+reserved_bytes bytes FROM account_storage_usage WHERE owner_id=$1',[i.ownerId],db);const history=await one('SELECT COALESCE(sum(o.expected_size),0)::bigint bytes FROM file_versions v JOIN file_objects o ON o.id=v.object_id WHERE v.file_id=$1',[id],db);const additional=i.ownerId===f.owner_id?0:obj.size+history!.bytes;if(obj.size>quota.fileBytes||used!.bytes+additional>quota.storageBytes)throw new ApiError(413,'Destination account quota would be exceeded.');}if(i.folderId!==undefined)await ensureFolder(i.folderId,i.ownerId??f.owner_id,db);await query('UPDATE files SET state=COALESCE($2::file_state,state),owner_id=COALESCE($3::uuid,owner_id),folder_id=CASE WHEN $3::uuid IS NOT NULL THEN NULL WHEN $4 THEN $5::uuid ELSE folder_id END,expires_at=CASE WHEN $6 THEN $7::timestamptz ELSE expires_at END,deleted_at=CASE WHEN $2=\'DELETED\' THEN now() WHEN $2=\'AVAILABLE\' THEN NULL ELSE deleted_at END WHERE id=$1',[id,i.state??null,i.ownerId??null,i.folderId!==undefined,i.folderId??null,i.expiresAt!==undefined,i.expiresAt??null],db);if(i.state==='BLOCKED')await query("UPDATE file_objects SET state='BLOCKED' WHERE id=$1",[f.object_id],db);if(i.state==='AVAILABLE')await query("UPDATE file_objects SET state='AVAILABLE' WHERE id=$1 AND state='BLOCKED'",[f.object_id],db);if(i.ownerId)await query('UPDATE shares SET enabled=false,version=version+1 WHERE id IN (SELECT share_id FROM share_items WHERE file_id=$1)',[id],db);if(i.state==='EXPIRED')await enqueue('purge',f.object_id,{},db);await audit(actor.id,'admin.file.updated',id,i,req.ip,db);});return {ok:true};
 });
}
