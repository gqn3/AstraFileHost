import type {DB} from './index.js';
import {validatePrivacyKeys,publicAccountId,emailLookup,shareLookup,networkReference,blockReference,encryptField,redact} from '../privacy/index.js';
export async function migratePrivateAccounts(db:DB){
 validatePrivacyKeys();
 for(const u of (await db.query('SELECT id,email,name,anonymous FROM users')).rows){
  const accountId=publicAccountId();
  await db.query('UPDATE users SET account_id=$2,email_lookup=$3,email_status=$4,name_ciphertext=$5,name=$6 WHERE id=$1',[u.id,accountId,u.email?emailLookup(u.email):null,u.email?'UNVERIFIED':'NONE',encryptField(u.name,`user-name:${u.id}`),u.anonymous?'Guest':accountId]);
 }
 for(const s of (await db.query('SELECT id,slug FROM shares')).rows)await db.query('UPDATE shares SET capability_digest=$2 WHERE id=$1',[s.id,shareLookup(s.slug)]);
 for(const table of ['sessions','uploads','downloads','audit_logs','security_events'])for(const row of (await db.query(`SELECT id,ip FROM ${table} WHERE ip IS NOT NULL`)).rows)await db.query(`UPDATE ${table} SET ip=$2 WHERE id=$1`,[row.id,networkReference(row.ip)]);
 for(const row of (await db.query('SELECT ip FROM ip_blocks')).rows)await db.query('UPDATE ip_blocks SET ip=$2 WHERE ip=$1',[row.ip,blockReference(row.ip)]);
 for(const table of ['audit_logs','security_events'])for(const row of (await db.query(`SELECT id,target,detail FROM ${table==='security_events'?'(SELECT id,NULL::text target,detail FROM security_events) events':table}`)).rows)await db.query(`UPDATE ${table} SET detail=$2${table==='audit_logs'?',target=$3':''} WHERE id=$1`,table==='audit_logs'?[row.id,JSON.stringify(redact(row.detail)),redact(row.target)]:[row.id,JSON.stringify(redact(row.detail))]);
 await db.query('UPDATE sessions SET user_agent=NULL');
 await db.query('ALTER TABLE users ALTER COLUMN account_id SET NOT NULL');
 await db.query('ALTER TABLE shares ALTER COLUMN capability_digest SET NOT NULL');
 await db.query('ALTER TABLE users DROP COLUMN email');
 await db.query('ALTER TABLE shares DROP COLUMN slug');
}
