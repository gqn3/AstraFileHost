import type {FastifyInstance} from 'fastify';
import argon2 from 'argon2';
import nodemailer from 'nodemailer';
import {z} from 'zod';
import {env} from '../../../packages/config/index.js';
import {query,one,tx,audit,settings} from '../../../packages/database/index.js';
import {emailLookup,emailLookups,encryptField,decryptField} from '../../../packages/privacy/index.js';
import {requireIdentity} from './auth.js';
import {ApiError,hash,randomToken,limited,requireValue} from './lib.js';
export function deviceDescription(agent:string){return {browser:/Edg\//.test(agent)?'Edge':/Firefox\//.test(agent)?'Firefox':/Chrome\//.test(agent)?'Chrome':/Safari\//.test(agent)?'Safari':'Other',os:/Android/.test(agent)?'Android':/iPhone|iPad/.test(agent)?'iOS':/Windows/.test(agent)?'Windows':/Macintosh/.test(agent)?'macOS':/Linux/.test(agent)?'Linux':'Other'};}
export async function sendVerification(userId:string,email:string,purpose:'VERIFY'|'CHANGE'){
 if(!env.SMTP_URL)return false;
 const token=randomToken();
 await tx(async db=>{await query('UPDATE email_verifications SET consumed_at=now() WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL',[userId,purpose],db);await query("INSERT INTO email_verifications(user_id,email_lookup,token_hash,purpose,expires_at) VALUES($1,$2,$3,$4,now()+interval '30 minutes')",[userId,emailLookup(email),hash(token),purpose],db);});
 const transport=nodemailer.createTransport(env.SMTP_URL);
 try{await transport.sendMail({from:env.MAIL_FROM,to:email,subject:'Verify your AstraFile email',text:`Verify this email within 30 minutes: ${env.APP_ORIGIN}/verify#${token}`});return true;}
 catch{await query("INSERT INTO notifications(user_id,kind,message) VALUES($1,'EMAIL_DELIVERY','Email delivery failed. Request another verification when mail service is available.')",[userId]);return false;}
 finally{transport.close();}
}
export async function accountSecurityRoutes(app:FastifyInstance){
 app.get('/api/auth/sessions',async req=>{const u=requireIdentity(req);const rows=await query('SELECT id,friendly_name_ciphertext,browser,os,last_seen_at,created_at,expires_at,id=$2 current FROM sessions WHERE user_id=$1 AND expires_at>now() ORDER BY last_seen_at DESC',[u.id,req.sessionId]);return {items:rows.map(({friendly_name_ciphertext,...s})=>({...s,name:friendly_name_ciphertext?decryptField(friendly_name_ciphertext,`device-name:${s.id}`):`${s.browser} · ${s.os}`}))};});
 app.patch('/api/auth/sessions/:id',async req=>{const u=requireIdentity(req),{id}=z.object({id:z.uuid()}).parse(req.params),{name}=z.object({name:z.string().trim().min(1).max(80)}).parse(req.body);requireValue(await one('UPDATE sessions SET friendly_name_ciphertext=$3 WHERE id=$1 AND user_id=$2 RETURNING id',[id,u.id,encryptField(name,`device-name:${id}`)]));await audit(u.id,'session.renamed',id,{},req.ip);return {ok:true};});
 app.delete('/api/auth/sessions/others',async req=>{const u=requireIdentity(req);await query('DELETE FROM sessions WHERE user_id=$1 AND id<>$2',[u.id,req.sessionId]);await audit(u.id,'sessions.others.revoked',u.account_id,{},req.ip);return {ok:true};});
 app.delete('/api/auth/sessions/:id',async req=>{const u=requireIdentity(req),{id}=z.object({id:z.uuid()}).parse(req.params);await query('DELETE FROM sessions WHERE id=$1 AND user_id=$2',[id,u.id]);await audit(u.id,'session.revoked',id,{},req.ip);return {ok:true};});
 app.post('/api/auth/verify',async req=>{
  await limited(`verification:${req.ip}`,10,900);const {token}=z.object({token:z.string().min(32).max(128)}).parse(req.body);
  await tx(async db=>{await db.query('SELECT pg_advisory_xact_lock(74392103)');const verification=requireValue(await one('UPDATE email_verifications SET consumed_at=now() WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING *',[hash(token)],db),'Verification link is invalid or expired.');
   const u=requireValue(await one('SELECT * FROM users WHERE id=$1 FOR UPDATE',[verification.user_id],db));
   if(verification.purpose==='VERIFY'&&u.email_lookup!==verification.email_lookup)throw new ApiError(409,'The configured email has changed. Request a new verification.');
   if(await one('SELECT 1 FROM users WHERE email_lookup=$1 AND id<>$2',[verification.email_lookup,u.id],db))throw new ApiError(409,'This identity is already registered.');
   const autoActivate=verification.purpose==='VERIFY'&&u.status==='PENDING'&&!(await settings(db)).requireManualActivation;
   await query("UPDATE users SET email_lookup=$2,email_verified_at=now(),email_status='VERIFIED',status=CASE WHEN $3 THEN 'ACTIVE' ELSE status END WHERE id=$1",[u.id,verification.email_lookup,autoActivate],db);
   if(verification.purpose==='CHANGE')await query('DELETE FROM sessions WHERE user_id=$1',[u.id],db);
   await audit(u.id,verification.purpose==='CHANGE'?'email.changed':'email.verified',u.account_id,{},req.ip,db);
  });return {ok:true};
 });
 app.post('/api/auth/email',async req=>{
  const u=requireIdentity(req);await limited(`email-change:${u.id}:${req.ip}`,5,3600);const i=z.object({email:z.email().max(254),password:z.string().min(1).max(256),purpose:z.enum(['VERIFY','CHANGE']).default('CHANGE')}).parse(req.body);
  const stored=requireValue(await one('SELECT password_hash,email_lookup FROM users WHERE id=$1',[u.id]));
  if(!stored.password_hash||!await argon2.verify(stored.password_hash,i.password))throw new ApiError(403,'Current password is incorrect.');
  if(i.purpose==='VERIFY'&&!emailLookups(i.email).includes(stored.email_lookup))throw new ApiError(400,'Enter the email used for this account.');
  if(!env.SMTP_URL)throw new ApiError(503,'Email verification is not configured. Manual account activation remains available.');
  if(await one('SELECT 1 FROM users WHERE email_lookup=ANY($1::text[]) AND id<>$2',[emailLookups(i.email),u.id]))throw new ApiError(409,'This identity is already registered.');
  return {ok:true,deliveryAccepted:await sendVerification(u.id,i.email,i.purpose)};
 });
}
