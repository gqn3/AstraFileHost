import {it,expect} from 'vitest';
import {randomBytes} from 'node:crypto';
import {digestWith,digestCandidates,encryptWith,decryptWith,parseKeyRing} from '../packages/privacy/crypto.js';
const ring={active:'v2',keys:{v1:randomBytes(32).toString('base64'),v2:randomBytes(32).toString('base64')}};
it('uses keyed, purpose-separated lookups with retained rotation candidates',()=>{
 expect(digestWith(ring,'same value','email')).not.toBe(digestWith(ring,'same value','share'));
 expect(digestCandidates(ring,'identity','email')).toContain(digestWith(ring,'identity','email','v1'));
 expect(digestWith(ring,'identity','email')).toMatch(/^v2:[a-f0-9]{64}$/);
});
it('authenticates encrypted fields and rejects tampering or a different record context',()=>{
 const encrypted=encryptWith(ring,'private support text','ticket:123');
 expect(encrypted).not.toContain('private support text');
 expect(decryptWith(ring,encrypted,'ticket:123')).toBe('private support text');
 expect(encryptWith(ring,'private support text','ticket:123')).not.toBe(encrypted);
 expect(()=>decryptWith(ring,encrypted,'ticket:456')).toThrow();
 const fields=encrypted.split('.');fields[3]=Buffer.from('tampered').toString('base64url');
 expect(()=>decryptWith(ring,fields.join('.'),'ticket:123')).toThrow();
});
it('retains old decrypt keys and rejects undersized keys',()=>{
 const old=encryptWith({...ring,active:'v1'},'old field','context');expect(decryptWith(ring,old,'context')).toBe('old field');
 expect(()=>parseKeyRing(JSON.stringify({active:'v1',keys:{v1:'short'}}))).toThrow();
});
