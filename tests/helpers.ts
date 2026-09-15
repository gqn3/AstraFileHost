import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
export const origin=process.env.TEST_ORIGIN??'http://localhost:18400';
export class Client {
 constructor(public base=origin){}
 cookies=new Map<string,string>();bearer:string|null=null;
 async request(path:string,method='GET',body?:unknown,expected=200){
  const headers:Record<string,string>={...(body===undefined?{}:{'content-type':'application/json'}),origin:this.base,'x-astra-client':'web',cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; ')};if(this.bearer)headers.authorization=`Bearer ${this.bearer}`;
  const res=await fetch(`${this.base}/api${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  for(const cookie of res.headers.getSetCookie()){const [pair]=cookie.split(';');const index=pair.indexOf('=');this.cookies.set(pair.slice(0,index),pair.slice(index+1));}
  const data=await res.json();assert.equal(res.status,expected,`${method} ${path}: ${res.status} (${data.error??'no error'} / ${data.code??''})`);return data;
 }
}
export async function owner(){
 for(let n=0;n<50;n++){try{const r=await fetch(origin+'/health/ready');if(r.ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,200));}
 const client=new Client();let credentials;const credentialFile=process.env.TEST_OWNER_FILE??'.secrets/owner-account.json';try{credentials=JSON.parse(await readFile(credentialFile,'utf8'));}catch{if(process.env.TEST_OWNER_FILE)throw Error('Configured test owner credentials are missing');credentials={email:'owner@astrafile.local',name:'AstraFile Owner',password:randomBytes(24).toString('base64url')};await writeFile(credentialFile,JSON.stringify(credentials),{mode:0o600,flag:'wx'});}
 const me=await client.request('/auth/me');if(me.needsSetup){const token=await readFile('.secrets/bootstrap-token','utf8');await client.request('/auth/setup','POST',{...credentials,token:token.trim()});}else await client.request('/auth/login','POST',{email:credentials.email,password:credentials.password});
 return client;
}
export async function report(name:string,value:unknown){await mkdir('output/verification',{recursive:true});await writeFile(`output/verification/${name}.json`,JSON.stringify(value,null,2));}
