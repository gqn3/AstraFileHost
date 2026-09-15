import {createHmac,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
export type KeyRing={active:string;keys:Record<string,string>};
export function parseKeyRing(value:string):KeyRing {
 const ring=JSON.parse(value) as KeyRing;
 if(!/^[a-zA-Z0-9_-]{1,24}$/.test(ring.active)||!ring.keys?.[ring.active]||Object.entries(ring.keys).some(([id,key])=>!/^[a-zA-Z0-9_-]{1,24}$/.test(id)||typeof key!=='string'||Buffer.from(key,'base64').length!==32))throw Error('Invalid privacy key ring');
 return ring;
}
export function digestWith(ring:KeyRing,value:string,context:string,version=ring.active){
 const key=ring.keys[version];if(!key)throw Error('Unknown privacy key version');
 return `${version}:${createHmac('sha256',Buffer.from(key,'base64')).update(context+'\0'+value).digest('hex')}`;
}
export function digestCandidates(ring:KeyRing,value:string,context:string){return Object.keys(ring.keys).map(version=>digestWith(ring,value,context,version));}
export function encryptWith(ring:KeyRing,value:string,context:string){
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(ring.keys[ring.active],'base64'),nonce);cipher.setAAD(Buffer.from(context));
 const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return `${ring.active}.${nonce.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}
export function decryptWith(ring:KeyRing,value:string,context:string){
 const [version,nonce,tag,ciphertext,...extra]=value.split('.');if(extra.length||!ring.keys[version]||!nonce||!tag||ciphertext===undefined)throw Error('Invalid encrypted field');
 const decipher=createDecipheriv('aes-256-gcm',Buffer.from(ring.keys[version],'base64'),Buffer.from(nonce,'base64url'));decipher.setAAD(Buffer.from(context));decipher.setAuthTag(Buffer.from(tag,'base64url'));
 return Buffer.concat([decipher.update(Buffer.from(ciphertext,'base64url')),decipher.final()]).toString('utf8');
}
