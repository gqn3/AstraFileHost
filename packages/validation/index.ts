import { z } from 'zod';
export const idSchema = z.uuid();
export const nameSchema = z.string().trim().min(1).max(255).refine(s=>!/[\u0000-\u001f\u007f/\\]/.test(s)&&s!=='.'&&s!=='..','Invalid file or folder name');
export const roleSchema=z.enum(['OWNER','ADMIN','MODERATOR','SUPPORT','USER']);
export const uploadSchema=z.object({name:nameSchema,size:z.number().int().min(1).max(5*1024**4),mime:z.string().max(150).regex(/^[\w.+-]+\/[\w.+-]+$/).default('application/octet-stream'),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),folderId:z.uuid().nullable().optional(),expiresAt:z.iso.datetime().nullable().optional()});
export const partSchema=z.object({parts:z.array(z.object({number:z.number().int().min(1).max(10000),checksum:z.string().regex(/^[A-Za-z0-9+/]{43}=$/)})).min(1).max(16)});
export const shareSchema=z.object({name:z.string().trim().min(1).max(150),fileIds:z.array(z.uuid()).max(100).default([]),folderIds:z.array(z.uuid()).max(20).default([]),password:z.string().min(8).max(256).optional(),visibility:z.enum(['PUBLIC','PRIVATE']).default('PUBLIC'),expiresAt:z.iso.datetime().nullable().optional(),maxDownloads:z.number().int().min(1).max(1000000).nullable().optional()}).refine(v=>v.fileIds.length+v.folderIds.length>0,'Select at least one file or folder');
export function partSize(size:number,configuredMiB:number):number { return Math.max(configuredMiB*1024**2,Math.ceil(size/10000/1024**2)*1024**2); }
export function expectedPartBytes(size:number,chunk:number,n:number):number {if(!Number.isInteger(n)||n<1||n>Math.ceil(size/chunk))throw new Error('Invalid part number');return Math.min(chunk,size-(n-1)*chunk);}
export function assertParts(size:number,chunk:number,parts:{number:number;size:number;etag:string;checksum?:string}[]) {
 if(parts.length!==Math.ceil(size/chunk))throw Error('Missing uploaded parts');
 parts.forEach((p,i)=>{if(p.number!==i+1||p.size!==expectedPartBytes(size,chunk,p.number)||!p.etag)throw Error('Part manifest does not match file');});
}
export function contentDisposition(name:string,inline=false) {const ascii=name.replace(/[^\x20-\x7e]|["\\;]/g,'_');return `${inline?'inline':'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())}`;}
