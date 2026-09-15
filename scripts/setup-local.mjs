import { randomBytes, createHash } from 'node:crypto';
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
if(path.basename(root)!=='AstraFileHost') throw Error('Run from the AstraFileHost repository');
try {await access('.env'); throw Error('Existing .env: refusing to overwrite secrets');}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir('.secrets',{recursive:true,mode:0o700});
await mkdir('.local',{recursive:true});
const token=()=>randomBytes(32).toString('hex');
const db=token(),redis=token(),accessKey=randomBytes(16).toString('hex'),secret=token(),bootstrap=token();
const values={NODE_ENV:'development',HOST:'127.0.0.1',PORT:'18402',APP_ORIGIN:'http://localhost:18400',DATABASE_URL:`postgresql://astrafile:${db}@127.0.0.1:18432/astrafile`,REDIS_URL:`redis://:${redis}@127.0.0.1:18479`,S3_ENDPOINT:'http://127.0.0.1:18401',S3_PUBLIC_ENDPOINT:'http://localhost:18401',S3_BUCKET:'astrafile',S3_REGION:'us-east-1',S3_ACCESS_KEY:accessKey,S3_SECRET_KEY:secret,COOKIE_SECRET:token(),BOOTSTRAP_TOKEN_HASH:createHash('sha256').update(bootstrap).digest('hex'),STORAGE_DISK_PATH:path.join(root,'.local'),POSTGRES_PASSWORD:db,REDIS_PASSWORD:redis};
for(const purpose of ['EMAIL_LOOKUP_KEYS','SHARE_LOOKUP_KEYS','FIELD_ENCRYPTION_KEYS','NETWORK_PRIVACY_KEYS','BACKUP_ENCRYPTION_KEYS'])values[purpose]=JSON.stringify({active:'v1',keys:{v1:randomBytes(32).toString('base64')}});
await writeFile('.env',Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600,flag:'wx'});
await writeFile('.secrets/bootstrap-token',bootstrap,{mode:0o600,flag:'wx'});
await writeFile('.secrets/s3.json',JSON.stringify({identities:[{name:'astrafile',credentials:[{accessKey,secretKey:secret}],actions:['Admin','Read','Write','List','Tagging']}]},null,2),{mode:0o600,flag:'wx'});
await writeFile('.secrets/redis.conf',`bind 0.0.0.0\nprotected-mode yes\nrequirepass ${redis}\nappendonly yes\nmaxmemory 192mb\nmaxmemory-policy noeviction\n`,{mode:0o600,flag:'wx'});
console.info('Created project-local secrets. Owner setup token is in .secrets/bootstrap-token; it is never printed.');
