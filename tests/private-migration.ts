import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pool} from '../packages/database/index.js';
import {migratePrivateAccounts} from '../packages/database/private-migration.js';
import {report} from './helpers.js';
const db=await pool.connect();
try{
 await db.query('BEGIN');
 const before=(await db.query('SELECT count(*)::int n FROM users')).rows[0].n;
 await db.query(await readFile('packages/database/migrations/002_private_accounts.sql','utf8'));
 await migratePrivateAccounts(db);
 assert.equal((await db.query('SELECT count(*)::int n FROM users')).rows[0].n,before);
 assert.equal((await db.query("SELECT count(*)::int n FROM users WHERE account_id !~ '^AF-[0-9A-F]{32}$' OR email_lookup LIKE '%@%' OR name LIKE '%@%'")).rows[0].n,0);
 assert.equal((await db.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND ((table_name='users' AND column_name='email') OR (table_name='shares' AND column_name='slug'))")).rows[0].n,0);
 assert.equal((await db.query("SELECT count(*)::int n FROM shares WHERE capability_digest !~ '^[A-Za-z0-9_-]+:[a-f0-9]{64}$'")).rows[0].n,0);
 await report('private-migration',{at:new Date().toISOString(),legacyAccountsPreserved:before,blindIndexes:true,shareDigests:true,transactionRollback:true});
 console.info('PASS legacy privacy migration and schema assertions; test transaction rolled back.');
}finally{await db.query('ROLLBACK');db.release();await pool.end();}
