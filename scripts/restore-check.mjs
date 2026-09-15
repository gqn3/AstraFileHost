import 'dotenv/config';
import {decryptBackup} from '../packages/privacy/backup.ts';
import {spawn,spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
const evidence=JSON.parse(await readFile('output/verification/backup.json','utf8'));
const container='astrafile-local-astrafile-postgres-1';const database=`astrafile_restore_${Date.now()}`;
if(!/^astrafile_restore_\d+$/.test(database))throw Error('Restore scope failed');
function command(args){const r=spawnSync('docker',['exec',container,...args],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error('Scoped backup verification command failed');return r.stdout.trim();}
command(['createdb','-U','astrafile',database]);
try{
 const restore=spawn('docker',['exec','-i',container,'pg_restore','-U','astrafile','--no-owner','--no-acl','--exit-on-error','-d',database],{stdio:['pipe','ignore','ignore'],windowsHide:true});const exit=new Promise((resolve,reject)=>{restore.on('error',reject);restore.on('close',resolve);});await pipeline(decryptBackup(createReadStream(evidence.file)),restore.stdin);if(await exit!==0)throw Error('Restore failed');
 const query="SELECT count(*) FROM information_schema.tables WHERE table_schema='public';";
 const tables=Number(command(['psql','-U','astrafile','-d',database,'-Atc',query]));if(tables<20)throw Error('Restored schema incomplete');
 const original=command(['psql','-U','astrafile','-d','astrafile','-Atc','SELECT count(*) FROM users;']);const restored=command(['psql','-U','astrafile','-d',database,'-Atc','SELECT count(*) FROM users;']);if(original!==restored)throw Error('Restored user count differs');
 await writeFile('output/verification/backup.json',JSON.stringify({...evidence,restoreVerified:true,tableCount:tables,users:Number(restored),verifiedAt:new Date().toISOString()},null,2));console.info(`Backup restored and verified in a temporary AstraFile database (${tables} tables).`);
}finally{command(['dropdb','-U','astrafile',database]);}
