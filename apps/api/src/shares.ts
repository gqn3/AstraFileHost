import {randomBytes} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import argon2 from 'argon2';
import {z} from 'zod';
import {env} from '../../../packages/config/index.js';
import {shareSchema} from '../../../packages/validation/index.js';
import {query,one,tx,audit,settings,type DB} from '../../../packages/database/index.js';
import {requireUser,moderator,passwordHash} from './auth.js';
import {ownedFile,paramId,directDownload} from './files.js';
import {ApiError,requireValue,limited,hash,randomToken,writable} from './lib.js';
import {shareLookups,shareLookup,capability} from '../../../packages/privacy/index.js';
import {createShareCapability,shareAllowance} from './share-capability.js';
export async function shareFiles(s:Record<string,any>,db?:DB){return query(`WITH RECURSIVE hidden AS (SELECT id FROM folders WHERE owner_id=$2 AND deleted_at IS NOT NULL UNION SELECT f.id FROM folders f JOIN hidden h ON f.parent_id=h.id WHERE f.owner_id=$2), tree AS (SELECT f.id FROM folders f JOIN share_items i ON i.folder_id=f.id WHERE i.share_id=$1 AND f.owner_id=$2 AND f.deleted_at IS NULL UNION SELECT f.id FROM folders f JOIN tree t ON f.parent_id=t.id WHERE f.owner_id=$2 AND f.deleted_at IS NULL) SELECT DISTINCT f.id,f.name,f.created_at,f.expires_at,o.size,o.detected_mime,o.sha256 FROM files f JOIN file_objects o ON o.id=f.object_id WHERE f.owner_id=$2 AND (f.folder_id IS NULL OR f.folder_id NOT IN (SELECT id FROM hidden)) AND f.state='AVAILABLE' AND o.state='AVAILABLE' AND (f.expires_at IS NULL OR f.expires_at>now()) AND (f.id IN (SELECT file_id FROM share_items WHERE share_id=$1) OR f.folder_id IN (SELECT id FROM tree)) ORDER BY f.name LIMIT 5000`,[s.id,s.owner_id],db);}
async function activeShare(id:string,db?:DB,lock=false){
 const s=requireValue(await one(`SELECT s.*,u.anonymous owner_anonymous FROM shares s JOIN users u ON u.id=s.owner_id WHERE s.id=$1 AND u.status='ACTIVE' ${lock?'FOR UPDATE OF s':''}`,[id],db),'Share is unavailable.');
 if(s.owner_anonymous&&!(await settings(db)).anonymousSharingEnabled)throw new ApiError(403,'Anonymous sharing is disabled.');
 if(!s.enabled||(s.expires_at&&new Date(s.expires_at)<=new Date())||(s.max_downloads&&s.download_count>=s.max_downloads))throw new ApiError(410,'This share is expired, disabled, or has reached its download limit.','SHARE_EXPIRED');return s;
}
async function authorize(req:FastifyRequest,s:Record<string,any>,db?:DB,unlock=false){
 if(s.visibility==='PRIVATE'&&req.user?.id!==s.owner_id)throw new ApiError(403,'This is a private share. Sign in as its owner.','PRIVATE_SHARE');
 const t=req.cookies[`astra_share_${s.id.replaceAll('-','')}`];
 const access=t&&await one('SELECT password_verified FROM share_access WHERE share_id=$1 AND token_hash=$2 AND version=$3 AND expires_at>now()',[s.id,hash(t),s.version],db);
 if(!access)throw new ApiError(401,'Open the secret share link again.','SHARE_SESSION');
 if(!unlock&&s.password_hash&&!access.password_verified&&req.user?.id!==s.owner_id)throw new ApiError(401,'Enter the password to open this share.','SHARE_PASSWORD');
}
export async function shareRoutes(app:FastifyInstance){
 app.post('/api/shares/resolve',async(req,reply)=>{
  await limited(`share-resolve:${req.ip}`,60,60);const {secret}=z.object({secret:z.string().regex(/^[A-Za-z0-9_-]{8,80}$/)}).parse(req.body);
  const match=requireValue(await one('SELECT id FROM shares WHERE capability_digest=ANY($1::text[])',[shareLookups(secret)]),'Share is unavailable.');const s=await activeShare(match.id);
  if(s.visibility==='PRIVATE'&&req.user?.id!==s.owner_id)throw new ApiError(403,'This is a private share. Sign in as its owner.','PRIVATE_SHARE');
  const token=randomToken();await query("INSERT INTO share_access(share_id,token_hash,version,password_verified,expires_at) VALUES($1,$2,$3,$4,now()+interval '1 hour')",[s.id,hash(token),s.version,!s.password_hash||req.user?.id===s.owner_id]);
  reply.setCookie(`astra_share_${s.id.replaceAll('-','')}`,token,{httpOnly:true,secure:true,sameSite:'strict',path:`/api/public/shares/${s.id}`,maxAge:3600});
  return {shareId:s.id};
 });
 app.post('/api/shares',async req=>{
  const u=requireUser(req);await writable();const i=shareSchema.parse(req.body),s=await settings();if(u.anonymous&&!s.anonymousSharingEnabled)throw new ApiError(403,'Anonymous sharing is disabled.');if(i.password&&!s.sharePasswordsEnabled)throw new ApiError(403,'Share passwords are disabled.');const ph=i.password?await passwordHash(i.password):null;
  const expiresAt=i.expiresAt===undefined?(s.defaultShareHours?new Date(Date.now()+s.defaultShareHours*3600000):null):i.expiresAt;
  if(expiresAt&&new Date(expiresAt)<=new Date())throw new ApiError(400,'Expiration must be in the future.');
  return tx(async db=>{for(const id of i.fileIds)await ownedFile(id,u.id,db);for(const id of i.folderIds)requireValue(await one('SELECT id FROM folders WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL',[id,u.id],db));
   const row=await createShareCapability(db,u.id,i.name,{visibility:i.visibility,passwordHash:ph,expiresAt,maxDownloads:i.maxDownloads===undefined?s.defaultMaxDownloads:i.maxDownloads});
   for(const id of i.fileIds)await query('INSERT INTO share_items(share_id,file_id) VALUES($1,$2)',[row.id,id],db);
   for(const id of i.folderIds)await query('INSERT INTO share_items(share_id,folder_id) VALUES($1,$2)',[row.id,id],db);
   await audit(u.id,'share.created',row.id,{visibility:i.visibility,protected:!!ph},req.ip,db);return {id:row.id,name:row.name,expires_at:row.expires_at,url:row.url};
  });
 });
 app.get('/api/shares',async req=>({items:await query('SELECT id,name,visibility,enabled,expires_at,max_downloads,download_count,view_count,password_hash IS NOT NULL protected,created_at FROM shares WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 500',[requireUser(req).id])}));
 async function update(req:FastifyRequest,isAdmin=false){
  const u=isAdmin?moderator(req):requireUser(req);const id=paramId(req);const i=z.object({enabled:z.boolean().optional(),name:z.string().min(1).max(150).optional(),expiresAt:z.iso.datetime().nullable().optional(),maxDownloads:z.number().int().min(1).max(1000000).nullable().optional(),password:z.string().min(8).max(256).nullable().optional(),regenerate:z.boolean().optional(),visibility:z.enum(['PUBLIC','PRIVATE']).optional()}).parse(req.body);
  if(i.password&&!(await settings()).sharePasswordsEnabled)throw new ApiError(403,'Share passwords are disabled.');const ph=i.password?await passwordHash(i.password):null;
  return tx(async db=>{const existing=requireValue(await one(`SELECT id,owner_id FROM shares WHERE id=$1 ${isAdmin?'':'AND owner_id=$2'} FOR UPDATE`,isAdmin?[id]:[id,u.id],db));const allowance=await shareAllowance(db,existing.owner_id);if(i.expiresAt!==undefined){const cap=Date.now()+allowance.policy.maxShareHours*3600000;i.expiresAt=new Date(i.expiresAt?Math.min(new Date(i.expiresAt).getTime(),cap):cap).toISOString();if(new Date(i.expiresAt)<=new Date())throw new ApiError(400,'Expiration must be in the future.');}if(i.enabled&&!(await one('SELECT enabled FROM shares WHERE id=$1',[id],db))!.enabled&&!allowance.available)throw new ApiError(403,'Your active share limit has been reached.','SHARE_QUOTA');if(i.regenerate&&existing.owner_id!==u.id)throw new ApiError(403,'Only the share owner can generate its secret.');const secret=i.regenerate?capability():null;const updated=requireValue(await one('UPDATE shares SET enabled=COALESCE($2,enabled),name=COALESCE($3,name),expires_at=CASE WHEN $4 THEN $5::timestamptz ELSE expires_at END,max_downloads=CASE WHEN $6 THEN $7::int ELSE max_downloads END,password_hash=CASE WHEN $8 THEN $9 ELSE password_hash END,capability_digest=COALESCE($10,capability_digest),visibility=COALESCE($11,visibility),version=version+1 WHERE id=$1 RETURNING id',[id,i.enabled??null,i.name??null,i.expiresAt!==undefined,i.expiresAt??null,i.maxDownloads!==undefined,i.maxDownloads??null,i.password!==undefined,ph,secret?shareLookup(secret):null,i.visibility??null],db));const {password,...safe}=i;await audit(u.id,isAdmin?'admin.share.updated':'share.updated',id,{...safe,passwordChanged:password!==undefined},req.ip,db);return {...updated,...(secret?{url:`${env.APP_ORIGIN}/s/#${secret}`}:{})};});
 }
 app.patch('/api/shares/:id',req=>update(req));app.patch('/api/admin/shares/:id',req=>update(req,true));
 app.delete('/api/shares/:id',async req=>{const u=requireUser(req),id=paramId(req);await tx(async db=>{requireValue(await one('UPDATE shares SET enabled=false,version=version+1 WHERE id=$1 AND owner_id=$2 RETURNING id',[id,u.id],db));await audit(u.id,'share.revoked',id,{},req.ip,db);});return {ok:true};});
 app.get('/api/public/shares/:id',async req=>{await limited(`share-view:${req.ip}`,180,60);const s=await activeShare(paramId(req));await authorize(req,s);await query('UPDATE shares SET view_count=view_count+1 WHERE id=$1',[s.id]);return {share:{name:s.name,expiresAt:s.expires_at,downloads:s.download_count,maxDownloads:s.max_downloads,visibility:s.visibility},files:await shareFiles(s)};});
 app.post('/api/public/shares/:id/unlock',async req=>{const id=paramId(req);await limited(`share-pass:${req.ip}:${id}`,8,900);await limited(`share-pass-ip:${req.ip}`,30,900);const i=z.object({password:z.string().max(256)}).parse(req.body);const s=await activeShare(id);await authorize(req,s,undefined,true);if(!s.password_hash||!await argon2.verify(s.password_hash,i.password))throw new ApiError(403,'Incorrect share password.');await query('UPDATE share_access SET password_verified=true WHERE share_id=$1 AND token_hash=$2 AND version=$3',[s.id,hash(req.cookies[`astra_share_${s.id.replaceAll('-','')}`]!),s.version]);return {ok:true};});
 app.post('/api/public/shares/:id/download',async req=>{await limited(`download:${req.ip}`,120,60);const i=z.object({fileId:z.uuid(),preview:z.boolean().default(false)}).parse(req.body);return tx(async db=>{const s=await activeShare(paramId(req),db,true);await authorize(req,s,db);if(!(await shareFiles(s,db)).some(f=>f.id===i.fileId))throw new ApiError(404,'File is not part of this share.');const result=await directDownload(i.fileId,req.ip,db,s.id,i.preview);await query('UPDATE shares SET download_count=download_count+1 WHERE id=$1',[s.id],db);return result;});});
 app.post('/api/public/shares/:id/report',async req=>{await limited(`report:${req.ip}`,5,3600);const i=z.object({reason:z.string().trim().min(10).max(2000)}).parse(req.body);const s=await activeShare(paramId(req));await authorize(req,s,undefined,true);await query('INSERT INTO abuse_reports(share_id,reason) VALUES($1,$2)',[s.id,i.reason]);return {ok:true};});
}
