import {describe,it,expect} from 'vitest';
import {validateBrowserEndpoint} from '../packages/validation/endpoints.js';
describe('browser storage destination safety',()=>{
 it('rejects loopback and internal service destinations for public websites',()=>{
  for(const endpoint of ['https://localhost:8444','https://127.0.0.1:8444','https://[::1]:8444','https://astrafile-storage:8333'])
   expect(()=>validateBrowserEndpoint('https://198.51.100.10:18443',endpoint)).toThrow();
 });
 it('rejects mixed content and embedded credentials',()=>{
  for(const endpoint of ['http://198.51.100.10:18443','https://user:secret@storage.example'])
   expect(()=>validateBrowserEndpoint('https://198.51.100.10:18443',endpoint)).toThrow();
 });
 it('accepts same-origin signed paths and explicit local acceptance endpoints',()=>{
  expect(()=>validateBrowserEndpoint('https://198.51.100.10:18443','https://198.51.100.10:18443/astrafile/objects/test?signature=opaque')).not.toThrow();
  expect(()=>validateBrowserEndpoint('https://localhost:18543','https://localhost:18543/astrafile/objects/test')).not.toThrow();
 });
});
