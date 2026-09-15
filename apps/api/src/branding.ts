import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {one,settings,type DB} from '../../../packages/database/index.js';
import {storage} from '../../../packages/storage/index.js';
import {ApiError} from './lib.js';
export async function brandingFile(id:string,db?:DB){
 const file=await one("SELECT f.name,o.object_key,o.detected_mime FROM files f JOIN file_objects o ON o.id=f.object_id JOIN users u ON u.id=f.owner_id WHERE f.id=$1 AND f.state='AVAILABLE' AND o.state='AVAILABLE' AND o.size<=1048576 AND o.detected_mime IN ('image/png','image/jpeg','image/webp') AND u.role IN ('OWNER','ADMIN') AND u.status='ACTIVE' AND (f.expires_at IS NULL OR f.expires_at>now())",[id],db);
 if(!file)throw new ApiError(400,'Branding must use an available PNG, JPEG or WebP file up to 1 MiB owned by an administrator.');return file;
}
export async function brandingRoutes(app:FastifyInstance){
 app.get('/api/branding/:kind',async(req,reply)=>{const {kind}=z.object({kind:z.enum(['logo','favicon'])}).parse(req.params);const s=await settings();const id=kind==='logo'?s.logoFileId:s.faviconFileId;if(!id)return reply.redirect('/favicon.svg');const f=await brandingFile(id);return reply.redirect(await storage.download(f.object_key,f.name,f.detected_mime,true));});
}
