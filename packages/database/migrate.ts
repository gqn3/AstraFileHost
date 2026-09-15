import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {pool,tx} from './index.js';
import {seedContent} from './content-seed.js';
import {migratePrivateAccounts} from './private-migration.js';
export async function migrate() {
 await tx(async db=>{
  await db.query("SELECT pg_advisory_xact_lock(74392101)");
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  for(const name of (await readdir(path.resolve('packages/database/migrations'))).filter(n=>n.endsWith('.sql')).sort()) {
    if((await db.query('SELECT 1 FROM schema_migrations WHERE name=$1',[name])).rowCount)continue;
    await db.query(await readFile(path.resolve('packages/database/migrations',name),'utf8'));
    if(name==='002_private_accounts.sql')await migratePrivateAccounts(db);
    if(name==='004_content_support.sql')await seedContent(db);
    await db.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);
    console.info('Applied migration',name);
  }
 });
}
await migrate();await pool.end();
