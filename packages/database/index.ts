import pg from 'pg';
import { env, defaultSettings, settingsSchema, type Settings } from '../config/index.js';
import {networkReference,redact} from '../privacy/index.js';
export const pool = new pg.Pool({connectionString:env.DATABASE_URL, max:16, idleTimeoutMillis:30000, connectionTimeoutMillis:5000, statement_timeout:20000});
// Never allow an idle connection error to dump the pool/client (which holds credentials).
pool.on('error', () => console.error(JSON.stringify({event:'database.connection_lost'})));
pg.types.setTypeParser(20, value => Number(value));
export type DB = Pick<pg.PoolClient, 'query'>;
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, values: unknown[] = [], db: DB = pool): Promise<T[]> { return (await db.query<T>(sql,values)).rows; }
export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, values: unknown[] = [], db: DB = pool): Promise<T | undefined> { return (await query<T>(sql,values,db))[0]; }
export async function tx<T>(fn:(db:pg.PoolClient)=>Promise<T>):Promise<T> {
  const db=await pool.connect();
  try {await db.query('BEGIN'); const result=await fn(db); await db.query('COMMIT'); return result;} catch(e){await db.query('ROLLBACK');throw e;} finally{db.release();}
}
export async function settings(db:DB=pool):Promise<Settings> {const row=await one('SELECT value FROM settings WHERE id=1',[],db);return settingsSchema.parse({...defaultSettings,...row?.value});}
export async function audit(actor:string|null, action:string, target:string|null, detail:unknown={}, ip:string|null=null, db:DB=pool) { await query('INSERT INTO audit_logs(actor_id,action,target,detail,ip) VALUES($1,$2,$3,$4,$5)',[actor,action,redact(target),JSON.stringify(redact(detail)),networkReference(ip)],db); }
export async function security(kind:string, ip:string, detail:unknown={}) {await query('INSERT INTO security_events(kind,ip,detail) VALUES($1,$2,$3)',[kind,networkReference(ip),JSON.stringify(redact(detail))]);}
