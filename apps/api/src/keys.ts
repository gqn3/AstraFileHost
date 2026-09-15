import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {query,tx,audit} from '../../../packages/database/index.js';
import {requireUser} from './auth.js';
import {paramId} from './files.js';
import {hash,randomToken,ApiError} from './lib.js';
import {entitlements} from './entitlements.js';
export async function keyRoutes(app:FastifyInstance){
 app.get('/api/keys',async req=>({items:await query('SELECT id,name,prefix,scopes,expires_at,revoked_at,last_used_at,created_at FROM api_keys WHERE owner_id=$1 ORDER BY created_at DESC',[requireUser(req).id])}));
 app.post('/api/keys',async req=>{const u=requireUser(req);if(u.anonymous)throw new ApiError(403,'Register an account to create API keys.');if(!(await entitlements(u.id)).effective.apiEnabled)throw new ApiError(403,'Your plan does not include API access.','PLAN_API');const i=z.object({name:z.string().min(1).max(80),scopes:z.array(z.enum(['files:read','files:write','uploads:write','shares:write'])).min(1).max(4),expiresAt:z.iso.datetime().nullable().default(null)}).parse(req.body);const token=`astra_${randomToken()}`;await tx(async db=>{await query('INSERT INTO api_keys(owner_id,name,token_hash,prefix,scopes,expires_at) VALUES($1,$2,$3,$4,$5,$6)',[u.id,i.name,hash(token),token.slice(0,12),i.scopes,i.expiresAt],db);await audit(u.id,'api-key.created',null,{name:i.name,scopes:i.scopes},req.ip,db);});return {token,message:'Save this key now. It will not be displayed again.'};});
 app.delete('/api/keys/:id',async req=>{const u=requireUser(req),id=paramId(req);await tx(async db=>{await query('UPDATE api_keys SET revoked_at=now() WHERE id=$1 AND owner_id=$2',[id,u.id],db);await audit(u.id,'api-key.revoked',id,{},req.ip,db);});return {ok:true};});
}
