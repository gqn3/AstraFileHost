import {describe,it,expect} from 'vitest';
import {randomBytes} from 'node:crypto';
import {Readable} from 'node:stream';
import {encryptBackup,decryptBackup} from '../packages/privacy/backup.js';
const ring={active:'v1',keys:{v1:randomBytes(32).toString('base64')}};
async function collect(source:AsyncIterable<Uint8Array>){const chunks=[];for await(const chunk of source)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks);}
describe('encrypted metadata backups',()=>{
 it('round trips multiple frames and reads retained key versions',async()=>{const input=randomBytes(3*1024*1024+123);const encrypted=await collect(encryptBackup(Readable.from([input]),ring));expect(encrypted.includes(input.subarray(0,64))).toBe(false);expect((await collect(decryptBackup(Readable.from([encrypted]),{active:'v2',keys:{...ring.keys,v2:randomBytes(32).toString('base64')}}))).equals(input)).toBe(true);});
 it('rejects tampering, wrong keys, truncation and appended bytes',async()=>{const encrypted=await collect(encryptBackup(Readable.from([randomBytes(4096)]),ring));const tampered=Buffer.from(encrypted);tampered[80]^=1;for(const bytes of [tampered,encrypted.subarray(0,-1),Buffer.concat([encrypted,Buffer.from([1])])])await expect(collect(decryptBackup(Readable.from([bytes]),ring))).rejects.toThrow();await expect(collect(decryptBackup(Readable.from([encrypted]),{active:'v1',keys:{v1:randomBytes(32).toString('base64')}}))).rejects.toThrow();});
});
