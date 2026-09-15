import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {uploadSchema,partSchema,nameSchema,shareSchema} from '../../../packages/validation/index.js';
const bodies:Record<string,z.ZodType>={
 'POST /api/uploads':uploadSchema,
 'POST /api/uploads/:id/sign':partSchema,
 'POST /api/uploads/:id/ack':z.object({number:z.number().int().min(1).max(10000),etag:z.string().min(1).max(200)}),
 'POST /api/shares':shareSchema,
 'PATCH /api/files/:id':z.object({expectedRevision:z.number().int().positive().optional(),name:nameSchema.optional(),folderId:z.uuid().nullable().optional(),favorite:z.boolean().optional(),expiresAt:z.iso.datetime().nullable().optional()}),
 'POST /api/files/bulk':z.object({ids:z.array(z.uuid()).min(1).max(100),action:z.enum(['delete','restore','move','copy','purge']),folderId:z.uuid().nullable().optional(),confirm:z.literal('DELETE PERMANENTLY').optional()}),
 'POST /api/folders':z.object({name:nameSchema,parentId:z.uuid().nullable().optional()}),
 'PATCH /api/folders/:id':z.object({name:nameSchema.optional(),parentId:z.uuid().nullable().optional(),deleted:z.boolean().optional()}),
 'POST /api/files/:id/download':z.object({preview:z.boolean().optional()}),
 'POST /api/public/shares/:id/download':z.object({fileId:z.uuid(),preview:z.boolean().optional()}),
 'POST /api/public/shares/:id/unlock':z.object({password:z.string().max(256)}),
 'POST /api/public/shares/:id/report':z.object({reason:z.string().min(10).max(2000)}),
 'POST /api/keys':z.object({name:z.string().min(1).max(80),scopes:z.array(z.enum(['files:read','files:write','uploads:write','shares:write'])),expiresAt:z.iso.datetime().nullable().optional()}),
};
const descriptions:Record<string,string>={
 '/api/uploads':'Reserve quota and initialize a direct S3 multipart upload. JSON metadata only; never send file bytes here.',
 '/api/uploads/:id':'Reconcile completed parts from S3. Reselect the original file and resume only missing parts.',
 '/api/uploads/:id/sign':'Get short-lived part URLs bound to expected length and SHA-256. PUT bytes directly to each returned URL.',
 '/api/uploads/:id/complete':'Idempotently complete the multipart object after verifying all parts, object existence and exact size.',
 '/api/files/:id/download':'Issue a 15-minute signed object GET URL with Range support. Counts as a download authorization.',
};
export function installOpenApiSchemas(app:FastifyInstance){
 app.addHook('onRoute',route=>{
  if(!route.url.startsWith('/api')||route.url.startsWith('/api/docs'))return;
  const method=Array.isArray(route.method)?route.method[0]:route.method;
  const schema=route.schema??{};schema.tags=[route.url.split('/')[2]];schema.summary=descriptions[route.url]??`${method} ${route.url}`;
  schema.security=route.url.startsWith('/api/public')||route.url.startsWith('/api/auth')||route.url==='/api/config'?[]:[{session:[]},{bearer:[]}];
  const body=bodies[`${method} ${route.url}`];if(body)schema.body=z.toJSONSchema(body,{target:'draft-7',io:'input',unrepresentable:'any'});
  if(route.url==='/api/admin/plans/:id')schema.params={type:'object',required:['id'],properties:{id:{type:'string',pattern:'^[A-Z][A-Z0-9_-]{1,30}$'}}};
  else if(route.url.includes(':id'))schema.params={type:'object',required:['id'],properties:{id:{type:'string',format:'uuid'}}};
  if(route.url.includes(':slug'))schema.params={type:'object',required:['slug'],properties:{slug:{type:'string',pattern:'^[a-z0-9][a-z0-9-]{0,70}$'}}};
  if(!['GET','HEAD','OPTIONS'].includes(method))schema.headers={type:'object',properties:{'x-astra-client':{type:'string',default:'web',description:'Required for browser cookie-authenticated mutations.'}}};
  route.schema=schema;
 });
}
