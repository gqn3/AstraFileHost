import {randomBytes} from 'node:crypto';
import {isIP} from 'node:net';
import {parseKeyRing,digestWith,digestCandidates,encryptWith,decryptWith} from './crypto.js';
const configured=(name:string)=>{const value=process.env[name];if(!value)throw Error(`Missing required privacy key ring: ${name}`);return parseKeyRing(value);};
export function validatePrivacyKeys(){const names=['EMAIL_LOOKUP_KEYS','SHARE_LOOKUP_KEYS','FIELD_ENCRYPTION_KEYS','NETWORK_PRIVACY_KEYS','BACKUP_ENCRYPTION_KEYS'];const keys=names.flatMap(name=>Object.values(configured(name).keys).map(key=>Buffer.from(key,'base64').toString('hex')));if(new Set(keys).size!==keys.length)throw Error('Privacy purposes must use separate keys');}
export const normalizeEmail=(value:string)=>value.trim().normalize('NFC').toLowerCase();
export const emailLookup=(value:string)=>digestWith(configured('EMAIL_LOOKUP_KEYS'),normalizeEmail(value),'email');
export const emailLookups=(value:string)=>digestCandidates(configured('EMAIL_LOOKUP_KEYS'),normalizeEmail(value),'email');
export const capability=()=>randomBytes(32).toString('base64url');
export const shareLookup=(secret:string)=>digestWith(configured('SHARE_LOOKUP_KEYS'),secret,'share');
export const shareLookups=(secret:string)=>digestCandidates(configured('SHARE_LOOKUP_KEYS'),secret,'share');
export const ticketLookup=(secret:string)=>digestWith(configured('SHARE_LOOKUP_KEYS'),secret,'ticket');
export const ticketLookups=(secret:string)=>digestCandidates(configured('SHARE_LOOKUP_KEYS'),secret,'ticket');
export const publicAccountId=()=>`AF-${randomBytes(16).toString('hex').toUpperCase()}`;
export function networkReference(value:string|null,day=new Date().toISOString().slice(0,10)){if(!value)return null;if(/^[A-Za-z0-9_-]{1,24}:\d{4}-\d{2}-\d{2}:[a-f0-9]{64}$/.test(value))return value;const digest=digestWith(configured('NETWORK_PRIVACY_KEYS'),canonicalAddress(value),'network:'+day);const at=digest.indexOf(':');return digest.slice(0,at)+':'+day+digest.slice(at);}
const canonicalAddress=(value:string)=>{if(!value.includes(':'))return value;try{return new URL(`http://[${value}]/`).hostname.toLowerCase().slice(1,-1);}catch{return value.toLowerCase();}};
export const blockReference=(value:string)=>digestWith(configured('NETWORK_PRIVACY_KEYS'),canonicalAddress(value),'network-block');
export const blockReferences=(value:string)=>digestCandidates(configured('NETWORK_PRIVACY_KEYS'),canonicalAddress(value),'network-block');
export const rateReference=(value:string)=>digestWith(configured('NETWORK_PRIVACY_KEYS'),value,'rate:'+new Date().toISOString().slice(0,10));
export const encryptField=(value:string,context:string)=>encryptWith(configured('FIELD_ENCRYPTION_KEYS'),value,context);
export const decryptField=(value:string,context:string)=>decryptWith(configured('FIELD_ENCRYPTION_KEYS'),value,context);
const secretNames=/password|email|authorization|cookie|token|secret|presigned|capability|storage_upload_id|lookup|user_agent/i;
export function redact(value:unknown):unknown {
 if(Array.isArray(value))return value.map(redact);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,secretNames.test(k)?'[REDACTED]':redact(v)]));
 if(typeof value==='string')return value.replace(/https?:\/\/[^\s]+/g,'[URL]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[EMAIL]').replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'[IP]').replace(/[a-fA-F0-9:]{2,}(?:%[a-zA-Z0-9]+)?/g,part=>isIP(part)?'[IP]':part);
 return value;
}
