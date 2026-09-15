import type {FastifyInstance,FastifyRequest,FastifyReply} from 'fastify';
import argon2 from 'argon2';
import nodemailer from 'nodemailer';
import {z} from 'zod';
import {env} from '../../../packages/config/index.js';
import {query,one,tx,settings,audit,security,type DB} from '../../../packages/database/index.js';
import {ApiError,hash,randomToken,limited,requireValue} from './lib.js';
import {emailLookup,emailLookups,publicAccountId,networkReference,encryptField,decryptField} from '../../../packages/privacy/index.js';
import {entitlements} from './entitlements.js';
import {accountSecurityRoutes,sendVerification,deviceDescription} from './account-security.js';
export type User={id:string;account_id:string;name:string;name_ciphertext?:string;email_status:string;email_verified_at:Date|null;plan_id:string;role:'OWNER'|'ADMIN'|'MODERATOR'|'SUPPORT'|'USER';anonymous:boolean;status:string;quota:Record<string,number>|null};
declare module 'fastify' {interface FastifyRequest {user:User|null;sessionId:string|null;apiScopes:string[]|null;}}
const userColumns='u.id,u.account_id,u.name,u.name_ciphertext,u.email_status,u.email_verified_at,u.plan_id,u.role,u.anonymous,u.status,u.quota';
const cookieOptions={httpOnly:true,secure:env.APP_ORIGIN.startsWith('https://'),sameSite:'lax' as const,path:'/'};
export const passwordHash=(p:string)=>argon2.hash(p,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1});
export function requireIdentity(req:FastifyRequest){if(!req.user)throw new ApiError(401,'Please sign in.','AUTH_REQUIRED');return req.user;}
export function requireUser(req:FastifyRequest){const user=requireIdentity(req);if(user.status!=='ACTIVE')throw new ApiError(403,'This account is awaiting activation. Share your Account ID with the administrator.','ACCOUNT_PENDING');return user;}
export function allow(req:FastifyRequest,roles:string[]){const u=requireUser(req);if(req.apiScopes||!roles.includes(u.role))throw new ApiError(403,'This action is not permitted.');return u;}
export const admin=(req:FastifyRequest)=>allow(req,['OWNER','ADMIN']);
export const moderator=(req:FastifyRequest)=>allow(req,['OWNER','ADMIN','MODERATOR']);
export const support=(req:FastifyRequest)=>allow(req,['OWNER','ADMIN','MODERATOR','SUPPORT']);
export async function issueSession(userId:string,req:FastifyRequest,reply:FastifyReply,days?:number,db?:DB){
 const token=randomToken();const duration=days??(await settings()).sessionDays;
 const device=deviceDescription(req.headers['user-agent']??'');
 await query('INSERT INTO sessions(user_id,token_hash,expires_at,ip,browser,os) VALUES($1,$2,now()+$3*interval \'1 day\',$4,$5,$6)',[userId,hash(token),duration,networkReference(req.ip),device.browser,device.os],db);
 await query('DELETE FROM sessions WHERE user_id=$1 AND id IN (SELECT id FROM sessions WHERE user_id=$1 ORDER BY created_at DESC OFFSET $2)',[userId,(await settings()).maxSessions],db);
 reply.setCookie('astra_session',token,{...cookieOptions,maxAge:duration*86400});
}
export async function attachAuth(app:FastifyInstance){
 app.decorateRequest('user',null);app.decorateRequest('sessionId',null);app.decorateRequest('apiScopes',null);
 app.addHook('onRequest',async req=>{
   const bearer=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):null;
   if(bearer){
    if(bearer.length>256)throw new ApiError(401,'Invalid API key.');
    const k=await one(`SELECT ${userColumns},k.id key_id,k.scopes FROM api_keys k JOIN users u ON u.id=k.owner_id WHERE k.token_hash=$1 AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at>now())`,[hash(bearer)]);
    if(!k||k.status!=='ACTIVE')throw new ApiError(401,'Invalid or revoked API key.');
    if(!(await entitlements(k.id)).effective.apiEnabled)throw new ApiError(403,'Your plan does not include API access.','PLAN_API');
    req.user=k as User;req.apiScopes=k.scopes;
    const route=req.url.split('?')[0];
    const scope=route.startsWith('/api/uploads')?'uploads:write':route.startsWith('/api/shares')?'shares:write':route.startsWith('/api/folders')?'files:write':route.startsWith('/api/files')?(req.method==='GET'?'files:read':'files:write'):null;
    if(!scope||!k.scopes.includes(scope))throw new ApiError(403,'API key lacks the required scope.');
    await query('UPDATE api_keys SET last_used_at=now() WHERE id=$1',[k.key_id]);return;
   }
   const token=req.cookies.astra_session;if(!token||token.length>256)return;
   const session=await one(`SELECT ${userColumns},s.id session_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[hash(token)]);
   if(session){if(!['ACTIVE','PENDING'].includes(session.status))throw new ApiError(403,'This account is suspended or disabled.');req.user=session as User;req.sessionId=session.session_id;await query("UPDATE sessions SET last_seen_at=now() WHERE id=$1 AND last_seen_at<now()-interval '1 minute'",[session.session_id]);}
 });
}
export async function authRoutes(app:FastifyInstance){
 app.get('/api/auth/me',async req=>({user:req.user?{id:req.user.id,accountId:req.user.account_id,name:req.user.name_ciphertext?decryptField(req.user.name_ciphertext,`user-name:${req.user.id}`):req.user.name,emailConfigured:req.user.email_status!=='NONE',emailVerified:!!req.user.email_verified_at,plan:req.user.plan_id,status:req.user.status,role:req.user.role,anonymous:req.user.anonymous}:null,needsSetup:!(await one("SELECT 1 FROM users WHERE role='OWNER' LIMIT 1")),passwordResetAvailable:!!env.SMTP_URL}));
 const credentials=z.object({email:z.email().max(254).transform(v=>v.toLowerCase()),password:z.string().min(12).max(256),name:z.string().trim().max(80).optional()});
 app.post('/api/auth/setup',async(req,reply)=>{
  await limited(`setup:${req.ip}`,5,3600);
  const input=credentials.extend({token:z.string().min(20).max(128)}).parse(req.body);
  if(hash(input.token)!==env.BOOTSTRAP_TOKEN_HASH)throw new ApiError(403,'Invalid setup token.');
  const ph=await passwordHash(input.password);
  const u=await tx(async db=>{await db.query('SELECT pg_advisory_xact_lock(74392103)');if(await one("SELECT 1 FROM users WHERE role='OWNER'",[],db))throw new ApiError(409,'Owner setup is already complete.');const accountId=publicAccountId();const row=requireValue(await one("INSERT INTO users(email_lookup,email_status,account_id,name,password_hash,role,plan_id,subscription_state) VALUES($1,'UNVERIFIED',$2,$2,$3,'OWNER','PRO','MANUAL') RETURNING id",[emailLookup(input.email),accountId,ph],db));if(input.name)await query('UPDATE users SET name_ciphertext=$2 WHERE id=$1',[row.id,encryptField(input.name,`user-name:${row.id}`)],db);await audit(row.id,'owner.bootstrapped',accountId,{},req.ip,db);return row;});
  await issueSession(u.id,req,reply);return {ok:true};
 });
 app.post('/api/auth/guest',async(req,reply)=>{
  if(req.user)return {ok:true};const s=await settings();if(!s.anonymousEnabled)throw new ApiError(403,'Anonymous uploads are disabled.');
  await limited(`guest:${req.ip}`,s.anonymousCreatesPerHour,3600);
  const u=requireValue(await one("INSERT INTO users(account_id,name,anonymous) VALUES($1,'Guest',true) RETURNING id",[publicAccountId()]));await issueSession(u.id,req,reply,180);return {ok:true};
 });
 app.post('/api/auth/register',async(req,reply)=>{
  await limited(`register:${req.ip}`,5,3600);if(!(await settings()).registrationEnabled)throw new ApiError(403,'Registration is currently closed.');
  const input=credentials.parse(req.body);const ph=await passwordHash(input.password);
  const state='PENDING';
  const u=await tx(async db=>{await db.query('SELECT pg_advisory_xact_lock(74392103)');if(await one('SELECT 1 FROM users WHERE email_lookup=ANY($1::text[])',[emailLookups(input.email)],db))throw new ApiError(409,'This identity is already registered.','CONFLICT');let row;if(req.user?.anonymous){row=await one("UPDATE users SET email_lookup=$1,email_status='UNVERIFIED',password_hash=$2,anonymous=false,status=$3,name=account_id WHERE id=$4 RETURNING id,account_id",[emailLookup(input.email),ph,state,req.user.id],db);await query('DELETE FROM sessions WHERE user_id=$1',[req.user.id],db);}else{const accountId=publicAccountId();row=await one("INSERT INTO users(email_lookup,email_status,account_id,name,password_hash,status) VALUES($1,'UNVERIFIED',$2,$2,$3,$4) RETURNING id,account_id",[emailLookup(input.email),accountId,ph,state],db);}if(input.name)await query('UPDATE users SET name_ciphertext=$2 WHERE id=$1',[row!.id,encryptField(input.name,`user-name:${row!.id}`)],db);await audit(row!.id,'account.registered',row!.account_id,{},req.ip,db);return row!;});
  await issueSession(u.id,req,reply);if(env.SMTP_URL)await sendVerification(u.id,input.email,'VERIFY');return {ok:true,accountId:u.account_id,status:state};
 });
 // A fixed valid Argon2 hash prevents a cheap timing path for unknown emails.
 const dummyHash=await passwordHash(randomToken());
 app.post('/api/auth/login',async(req,reply)=>{
  await limited(`login:${req.ip}`,12,900);
  const input=z.object({email:z.email().max(254),password:z.string().min(1).max(256)}).parse(req.body);
  await limited(`login-email:${hash(input.email.toLowerCase())}`,20,900);
  const u=await one('SELECT * FROM users WHERE email_lookup=ANY($1::text[])',[emailLookups(input.email)]);
  const valid=await argon2.verify(u?.password_hash??dummyHash,input.password);
  if(!u||!valid||!['ACTIVE','PENDING'].includes(u.status)){await security('auth.failed',req.ip);throw new ApiError(401,'Email or password is incorrect.');}
  if(u.email_lookup!==emailLookup(input.email))await query('UPDATE users SET email_lookup=$2 WHERE id=$1',[u.id,emailLookup(input.email)]);
  if(req.sessionId)await query('DELETE FROM sessions WHERE id=$1',[req.sessionId]);
  await issueSession(u.id,req,reply);await audit(u.id,'account.login',u.id,{},req.ip);return {ok:true};
 });
 app.post('/api/auth/logout',async(req,reply)=>{if(req.sessionId)await query('DELETE FROM sessions WHERE id=$1',[req.sessionId]);reply.clearCookie('astra_session',cookieOptions);return {ok:true};});
 await accountSecurityRoutes(app);
 app.post('/api/auth/forgot',async req=>{
  await limited(`reset:${req.ip}`,5,3600);const {email}=z.object({email:z.email().max(254)}).parse(req.body);
  const u=await one('SELECT id FROM users WHERE email_lookup=ANY($1::text[]) AND anonymous=false',[emailLookups(email)]);
  if(u&&env.SMTP_URL){const token=randomToken();await query("INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '30 minutes')",[u.id,hash(token)]);const transport=nodemailer.createTransport(env.SMTP_URL);try{await transport.sendMail({from:env.MAIL_FROM,to:email,subject:'Reset your AstraFile password',text:`Reset your password within 30 minutes: ${env.APP_ORIGIN}/reset#${token}`});}catch{await security('mail.reset.failed',req.ip);}finally{transport.close();}}
  return {ok:true,message:'If this address has an account, a reset link has been sent.'};
 });
 app.post('/api/auth/reset',async req=>{
  await limited(`reset-apply:${req.ip}`,10,3600);const i=z.object({token:z.string().min(20).max(128),password:z.string().min(12).max(256)}).parse(req.body);const ph=await passwordHash(i.password);
  await tx(async db=>{const r=await one('UPDATE password_resets SET consumed_at=now() WHERE token_hash=$1 AND expires_at>now() AND consumed_at IS NULL RETURNING user_id',[hash(i.token)],db);if(!r)throw new ApiError(400,'This reset link is invalid or expired.');await query('UPDATE users SET password_hash=$1 WHERE id=$2',[ph,r.user_id],db);await query('DELETE FROM sessions WHERE user_id=$1',[r.user_id],db);await audit(r.user_id,'password.reset',r.user_id,{},req.ip,db);});return {ok:true};
 });
 app.post('/api/auth/password',async req=>{const u=requireIdentity(req);const i=z.object({current:z.string().max(256),password:z.string().min(12).max(256)}).parse(req.body);const row=requireValue(await one('SELECT password_hash FROM users WHERE id=$1',[u.id]));if(!row.password_hash||!await argon2.verify(row.password_hash,i.current))throw new ApiError(403,'Current password is incorrect.');await query('UPDATE users SET password_hash=$1 WHERE id=$2',[await passwordHash(i.password),u.id]);await query('DELETE FROM sessions WHERE user_id=$1 AND id<>$2',[u.id,req.sessionId]);await audit(u.id,'password.changed',u.id,{},req.ip);return {ok:true};});
}
