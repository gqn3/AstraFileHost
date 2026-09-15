import {spawn} from 'node:child_process';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,rename,stat,unlink} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {env} from '../config/index.js';
import {encryptBackup,decryptBackup} from '../privacy/backup.js';
const connection=()=>{const url=new URL(env.DATABASE_URL);return {args:['-h',url.hostname,'-p',url.port||'5432','-U',decodeURIComponent(url.username)],database:url.pathname.slice(1),environment:{...process.env,PGPASSWORD:decodeURIComponent(url.password)}};};
export async function createMetadataBackup(directory:string){
 await mkdir(directory,{recursive:true,mode:0o700});const target=path.resolve(directory,`astrafile-${new Date().toISOString().replace(/[:.]/g,'-')}.dump.enc`),temporary=target+'.partial';
 const c=connection(),child=spawn(process.env.PG_DUMP??'pg_dump',[...c.args,'-Fc','--no-owner','--no-acl',c.database],{env:c.environment,stdio:['ignore','pipe','ignore'],windowsHide:true});const exit=new Promise<number>((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve(code??1));});
 try{const [,code]=await Promise.all([pipeline(encryptBackup(child.stdout),createWriteStream(temporary,{flags:'wx',mode:0o600})),exit]);if(code!==0||(await stat(temporary)).size<100)throw Error('DATABASE_BACKUP_FAILED');await rename(temporary,target);return {file:target,bytes:(await stat(target)).size};}catch(error){child.kill();await unlink(temporary).catch(()=>{});throw error;}
}
export async function verifyMetadataBackup(file:string){
 const c=connection(),database='astrafile_restore_'+randomBytes(12).toString('hex');
 async function command(binary:string,args:string[]){const child=spawn(binary,[...c.args,...args],{env:c.environment,stdio:['ignore','pipe','ignore'],windowsHide:true});let output='';child.stdout.on('data',chunk=>{if(output.length<10000)output+=chunk;});const code=await new Promise<number>((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve(code??1));});if(code!==0)throw Error('SCOPED_RESTORE_CHECK_FAILED');return output.trim();}
 await command('createdb',[database]);
 try{const child=spawn('pg_restore',[...c.args,'--exit-on-error','--no-owner','--no-acl','-d',database],{env:c.environment,stdio:['pipe','ignore','ignore'],windowsHide:true});const exit=new Promise<number>((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve(code??1));});const [,code]=await Promise.all([pipeline(decryptBackup(createReadStream(file)),child.stdin),exit]);if(code!==0)throw Error('BACKUP_RESTORE_FAILED');const tables=Number(await command('psql',['-d',database,'-Atc',"SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"]));if(tables<27)throw Error('RESTORED_SCHEMA_INCOMPLETE');return {restoreVerified:true,tables};}finally{await command('dropdb',[database]);}
}
