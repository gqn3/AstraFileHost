import {env} from '../../../packages/config/index.js';
import {capability,shareLookup} from '../../../packages/privacy/index.js';
import {one,type DB} from '../../../packages/database/index.js';
import {entitlements} from './entitlements.js';
import {ApiError} from './lib.js';
export async function shareAllowance(db:DB,ownerId:string){
 await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[ownerId]);
 const policy=(await entitlements(ownerId,db)).effective;
 const row=await one("SELECT count(*)::int n FROM shares WHERE owner_id=$1 AND enabled AND (expires_at IS NULL OR expires_at>now())",[ownerId],db);
 return {policy,available:row!.n<policy.shareCount};
}
export async function createShareCapability(db:DB,ownerId:string,name:string,options:{visibility?:string;passwordHash?:string|null;expiresAt?:Date|string|null;maxDownloads?:number|null}={}){
 const {policy,available}=await shareAllowance(db,ownerId);if(!available)throw new ApiError(403,'Your active share limit has been reached.','SHARE_QUOTA');
 const ceiling=Date.now()+policy.maxShareHours*3600000;
 const expiresAt=options.expiresAt?new Date(Math.min(new Date(options.expiresAt).getTime(),ceiling)):new Date(ceiling);
 const secret=capability();const row=(await one<{id:string;name:string;expires_at:Date|null}>('INSERT INTO shares(owner_id,capability_digest,name,visibility,password_hash,expires_at,max_downloads) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,name,expires_at',[ownerId,shareLookup(secret),name,options.visibility??'PUBLIC',options.passwordHash??null,expiresAt,options.maxDownloads??null],db))!;
 return {...row,secret,url:`${env.APP_ORIGIN}/s/#${secret}`};
}
