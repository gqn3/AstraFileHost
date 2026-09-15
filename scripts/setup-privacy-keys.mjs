import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {parse} from 'dotenv';
const file=process.argv[2]??'.env',content=await readFile(file,'utf8'),current=parse(content),additions=[];
for(const name of ['EMAIL_LOOKUP_KEYS','SHARE_LOOKUP_KEYS','FIELD_ENCRYPTION_KEYS','NETWORK_PRIVACY_KEYS','BACKUP_ENCRYPTION_KEYS'])if(!current[name])additions.push(`${name}=${JSON.stringify({active:'v1',keys:{v1:randomBytes(32).toString('base64')}})}`);
if(additions.length)await writeFile(file,content.trimEnd()+'\n'+additions.join('\n')+'\n',{mode:0o600});
console.info(`Added ${additions.length} missing purpose-specific privacy key rings; existing keys preserved.`);
