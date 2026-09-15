import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import {query,one,settings,tx,audit,type DB} from '../../../packages/database/index.js';
import {admin,requireUser} from './auth.js';
import {ApiError,requireValue} from './lib.js';
const bytes=z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const planPolicySchema=z.object({storageBytes:bytes,fileBytes:bytes,dailyBytes:bytes,monthlyBytes:bytes,bandwidthBytes:bytes,concurrentUploads:z.number().int().min(1).max(100),concurrentDownloads:z.number().int().min(1).max(100),shareCount:z.number().int().min(0).max(100000),maxShareHours:z.number().int().min(1).max(87600),versionCount:z.number().int().min(0).max(1000),versionDays:z.number().int().min(0).max(3650),apiEnabled:z.boolean()});
export const accountOverrideSchema=planPolicySchema.partial();
export type PlanPolicy=z.infer<typeof planPolicySchema>;
export async function entitlements(ownerId:string,db?:DB){
 const u=requireValue(await one('SELECT u.anonymous,u.quota,u.plan_id,p.policy FROM users u JOIN plans p ON p.id=u.plan_id WHERE u.id=$1',[ownerId],db));const s=await settings(db);
 const plan=planPolicySchema.parse(u.anonymous?{...s.quotas.GUEST,concurrentUploads:s.anonymousConcurrentUploads,concurrentDownloads:4,shareCount:20,maxShareHours:Math.max(1,s.defaultShareHours||168),versionCount:0,versionDays:0,apiEnabled:false}:u.policy);
 return {planId:u.plan_id,plan,override:u.quota??{},effective:planPolicySchema.parse({...plan,...u.quota})};
}
export async function planRoutes(app:FastifyInstance){
 app.get('/api/account/entitlements',async req=>entitlements(requireUser(req).id));
 app.get('/api/admin/plans',async req=>{admin(req);return {items:await query('SELECT id,name,policy,enabled,updated_at FROM plans ORDER BY id')};});
 app.put('/api/admin/plans/:id',async req=>{const actor=admin(req),{id}=z.object({id:z.string().regex(/^[A-Z][A-Z0-9_-]{1,30}$/)}).parse(req.params);const input=z.object({name:z.string().trim().min(1).max(80),policy:planPolicySchema,enabled:z.boolean()}).parse(req.body);
  await tx(async db=>{const before=await one('SELECT policy FROM plans WHERE id=$1 FOR UPDATE',[id],db);if(!input.enabled&&['FREE','PRO'].includes(id))throw new ApiError(400,'The built-in plans must remain enabled.');await query('INSERT INTO plans(id,name,policy,enabled) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=$2,policy=$3,enabled=$4,updated_at=now()',[id,input.name,JSON.stringify(input.policy),input.enabled],db);await audit(actor.id,'plan.updated',id,{before:before?.policy,after:input.policy},req.ip,db);});return {ok:true};
 });
}
// Future providers supply subscription transitions; quotas never depend on a provider SDK.
export interface BillingProvider {id:string;subscriptionState(accountId:string):Promise<'FREE'|'TRIAL'|'ACTIVE'|'PAST_DUE'|'CANCELED'|'MANUAL'>;}
