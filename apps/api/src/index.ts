import Fastify,{LogController} from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import path from 'node:path';
import {existsSync} from 'node:fs';
import {ZodError} from 'zod';
import {env,production} from '../../../packages/config/index.js';
import {pool,one,settings,security} from '../../../packages/database/index.js';
import {attachAuth,authRoutes,support} from './auth.js';
import {uploadRoutes} from './uploads.js';
import {fileRoutes} from './files.js';
import {shareRoutes} from './shares.js';
import {keyRoutes} from './keys.js';
import {adminRoutes,health} from './admin.js';
import {ApiError,redis,limited} from './lib.js';
import {storage} from '../../../packages/storage/index.js';
import {observability} from './observability.js';
import {brandingRoutes} from './branding.js';
import {installOpenApiSchemas} from './openapi.js';
import {validatePrivacyKeys,blockReferences} from '../../../packages/privacy/index.js';
import {contentRoutes} from './content.js';
import {supportRoutes} from './support.js';
import {cloudRoutes} from './cloud.js';
import {planRoutes} from './entitlements.js';
export async function createApp(){
 validatePrivacyKeys();
 const app=Fastify({bodyLimit:128*1024,requestTimeout:30000,connectionTimeout:10000,trustProxy:env.TRUST_PROXY.split(','),logController:new LogController({disableRequestLogging:true}),logger:{level:'info',redact:['req.headers.authorization','req.headers.cookie','res.headers.set-cookie','password','token','url','*.password','*.token','*.secret']}});
 await app.register(cookie,{secret:env.COOKIE_SECRET});
 await app.register(helmet,{contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],fontSrc:["'self'"],imgSrc:["'self'",'data:','blob:',new URL(env.S3_PUBLIC_ENDPOINT).origin],mediaSrc:["'self'",'blob:',new URL(env.S3_PUBLIC_ENDPOINT).origin],connectSrc:["'self'",new URL(env.S3_PUBLIC_ENDPOINT).origin],frameSrc:[new URL(env.S3_PUBLIC_ENDPOINT).origin,'blob:'],objectSrc:["'none'"],baseUri:["'self'"],frameAncestors:["'none'"],upgradeInsecureRequests:production?[]:null}},crossOriginEmbedderPolicy:false,hsts:production?{maxAge:31536000}:false});
 await app.register(cors,{origin:env.APP_ORIGIN,credentials:true,methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS']});
 installOpenApiSchemas(app);
 await app.register(swagger,{openapi:{info:{title:'AstraFile control plane',description:'File bytes move directly to S3 using signed multipart URLs. All control-plane requests are limited to 128 KiB.',version:'1.0.0'},components:{securitySchemes:{session:{type:'apiKey',in:'cookie',name:'astra_session'},bearer:{type:'http',scheme:'bearer'}}}},hideUntagged:false});
 await attachAuth(app);
 app.addHook('onRequest',async req=>{
  if(!req.url.startsWith('/api'))return;
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!req.headers.authorization){if(req.headers.origin!==env.APP_ORIGIN||req.headers['x-astra-client']!=='web')throw new ApiError(403,'Request origin validation failed.','CSRF');}
  if(req.url.startsWith('/api/docs'))support(req);
  if(await one('SELECT 1 FROM ip_blocks WHERE ip=ANY($1::text[]) AND (expires_at IS NULL OR expires_at>now())',[blockReferences(req.ip)]))throw new ApiError(403,'Access from this address is blocked.');
  const s=await settings();await limited(`api:${req.user?.id??req.ip}`,s.apiPerMinute,60);
  if(s.maintenance&&!req.url.startsWith('/api/auth')&&!req.url.startsWith('/api/admin')&&!req.url.startsWith('/api/public/shares')&&req.method!=='GET')throw new ApiError(503,'AstraFile is undergoing maintenance.');
 });
 app.addHook('onSend',async(req,reply,payload)=>{if(req.url.startsWith('/api'))reply.header('Cache-Control','no-store');if(/^\/(api|s|admin|account|drive|shares|login|register|support|reset|verify|forgot)(\/|$)/.test(req.url))reply.header('X-Robots-Tag','noindex, nofollow, noarchive');reply.header('Referrer-Policy','no-referrer');reply.header('X-Request-ID',req.id);return payload;});
 app.addHook('onResponse',async(req,reply)=>{app.log.info({requestId:req.id,method:req.method,route:req.routeOptions.url,status:reply.statusCode,latencyMs:reply.elapsedTime},'request');});
 app.setErrorHandler(async(e,req,reply)=>{
  if(e instanceof ZodError)return reply.code(400).send({error:'Invalid input.',code:'VALIDATION',issues:e.issues.map(i=>({path:i.path,message:i.message}))});
  if((e as {code?:string}).code==='23505')return reply.code(409).send({error:'This value is already in use.',code:'CONFLICT'});
  const status=e instanceof ApiError?e.statusCode:(e as {statusCode?:number}).statusCode??500;
  if(status===429)await security('rate.limit',req.ip,{route:req.routeOptions.url}).catch(()=>{});
  if(status>=500)app.log.error({requestId:req.id,errorType:(e as Error).name,code:(e as {code?:string}).code},'Request failed');
  return reply.code(status).send({error:status>=500&&!(e instanceof ApiError)?'A service is temporarily unavailable. Retry shortly.':(e as Error).message,code:e instanceof ApiError?e.code:'SERVICE_ERROR',requestId:req.id});
 });
 app.get('/health/live',async()=>({status:'live'}));
 app.get('/health/ready',async(_,reply)=>{const h=await health();return reply.code(h.healthy?200:503).send({status:h.healthy?'ready':'degraded'});});
 app.get('/api/config',async()=>{const s=await settings();return {siteName:s.siteName,description:s.description,supportUrl:s.supportUrl,defaultLanguage:s.defaultLanguage,anonymousEnabled:s.anonymousEnabled,registrationEnabled:s.registrationEnabled,maintenance:s.maintenance,readOnly:s.readOnly,partMiB:s.partMiB,concurrency:s.concurrency,anonymousRetentionDays:s.anonymousRetentionDays,accent:s.accent,logoFileId:s.logoFileId,faviconFileId:s.faviconFileId,homepageTitle:s.homepageTitle,homepageSubtitle:s.homepageSubtitle,defaultTheme:s.defaultTheme,sharePasswordsEnabled:s.sharePasswordsEnabled,anonymousSharingEnabled:s.anonymousSharingEnabled,defaultMaxDownloads:s.defaultMaxDownloads,maxFileBytes:s.quotas.GUEST.fileBytes};});
 await observability(app);await brandingRoutes(app);
 await authRoutes(app);await uploadRoutes(app);await fileRoutes(app);await shareRoutes(app);await keyRoutes(app);await planRoutes(app);await cloudRoutes(app);await contentRoutes(app);await supportRoutes(app);await adminRoutes(app);
 await app.register(swaggerUI,{routePrefix:'/api/docs',staticCSP:true,uiConfig:{validatorUrl:null},transformStaticCSP:header=>header.replace("style-src 'self' https:","style-src 'self' https: 'sha256-RL3ie0nH+Lzz2YNqQN83mnU0J1ot4QL7b99vMdIX99w='")});
 if(existsSync(path.resolve('dist/web/index.html'))){await app.register(staticFiles,{root:path.resolve('dist/web'),prefix:'/'});app.setNotFoundHandler((req,reply)=>req.url.startsWith('/api')||req.url.startsWith('/health')?reply.code(404).send({error:'Not found'}):reply.sendFile('index.html'));}
 return app;
}
const app=await createApp();await app.listen({host:env.HOST,port:env.PORT});
let shutting=false;async function shutdown(){if(shutting)return;shutting=true;await app.close();await pool.end();await redis.quit();process.exit(0);}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
