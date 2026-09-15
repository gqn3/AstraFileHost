import 'dotenv/config';
import {readdir,stat,unlink} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import {encryptBackup,decryptBackup} from '../packages/privacy/backup.js';
const directory=path.resolve(process.env.BACKUP_DIR??'.local/backups');
let protectedCount=0;
for(const entry of await readdir(directory,{withFileTypes:true})){
 if(!entry.isFile()||!/^astrafile-[A-Za-z0-9_-]+\.dump$/.test(entry.name))continue;
 const source=path.resolve(directory,entry.name),target=source+'.enc';
 if(path.dirname(source)!==directory)throw Error('Backup scope mismatch');
 await pipeline(encryptBackup(createReadStream(source)),createWriteStream(target,{flags:'wx',mode:0o600}));
 const original=createHash('sha256'),restored=createHash('sha256');
 for await(const bytes of createReadStream(source))original.update(bytes);
 for await(const bytes of decryptBackup(createReadStream(target)))restored.update(bytes);
 if(original.digest('hex')!==restored.digest('hex')||(await stat(target)).size<100)throw Error('Backup verification failed; original retained');
 // Only remove this exact project backup after authenticated byte-for-byte recovery.
 await unlink(source);protectedCount++;
}
console.info(JSON.stringify({encryptedLegacyBackups:protectedCount,verified:true}));
