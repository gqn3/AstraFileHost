import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {Readable} from 'node:stream';
import {parseKeyRing,type KeyRing} from './crypto.js';

const magic=Buffer.from('ASTRABK1');
const chunkBytes=1024*1024;
const keys=()=>parseKeyRing(process.env.BACKUP_ENCRYPTION_KEYS??'');
// Each bounded frame is authenticated before restore receives it. A mandatory
// final empty frame authenticates EOF, preventing silent truncation.
export async function* encryptBackup(source:AsyncIterable<Uint8Array>,ring:KeyRing=keys()){
 const version=Buffer.from(ring.active),seed=randomBytes(8);
 const header=Buffer.concat([magic,Buffer.from([version.length]),version,seed]);yield header;
 let sequence=0;
 function frame(data:Buffer){
  if(sequence>=0xffffffff)throw Error('Backup frame limit exceeded');
  const nonce=Buffer.alloc(12);seed.copy(nonce);nonce.writeUInt32BE(sequence++,8);
  const length=Buffer.alloc(4);length.writeUInt32BE(data.length);
  const cipher=createCipheriv('aes-256-gcm',Buffer.from(ring.keys[ring.active],'base64'),nonce);
  cipher.setAAD(Buffer.concat([header,nonce,length]));
  return Buffer.concat([length,cipher.update(data),cipher.final(),cipher.getAuthTag()]);
 }
 for await(const input of source){const bytes=Buffer.from(input);for(let at=0;at<bytes.length;at+=chunkBytes)yield frame(bytes.subarray(at,at+chunkBytes));}
 yield frame(Buffer.alloc(0));
}
export async function* decryptBackup(source:AsyncIterable<Uint8Array>,ring:KeyRing=keys()){
 const iterator=source[Symbol.asyncIterator]();let pending=Buffer.alloc(0);
 async function take(size:number){while(pending.length<size){const next=await iterator.next();if(next.done)throw Error('Truncated encrypted backup');pending=Buffer.concat([pending,Buffer.from(next.value)]);}const result=pending.subarray(0,size);pending=pending.subarray(size);return result;}
 const prefix=await take(9);if(!prefix.subarray(0,8).equals(magic)||prefix[8]<1||prefix[8]>24)throw Error('Invalid backup header');
 const version=await take(prefix[8]),seed=await take(8),header=Buffer.concat([prefix,version,seed]);
 const key=ring.keys[version.toString()];if(!key)throw Error('Missing backup key version');let sequence=0;
 for(;;){
  const length=await take(4),size=length.readUInt32BE();if(size>chunkBytes||sequence>=0xffffffff)throw Error('Invalid backup frame');
  const encrypted=await take(size),tag=await take(16),nonce=Buffer.alloc(12);seed.copy(nonce);nonce.writeUInt32BE(sequence++,8);
  const decipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'base64'),nonce);decipher.setAAD(Buffer.concat([header,nonce,length]));decipher.setAuthTag(tag);
  const plain=Buffer.concat([decipher.update(encrypted),decipher.final()]);
  if(!size){if(pending.length||!(await iterator.next()).done)throw Error('Unexpected backup trailing data');return;}
  yield plain;
 }
}
export const encryptedBackupStream=(source:AsyncIterable<Uint8Array>)=>Readable.from(encryptBackup(source));
