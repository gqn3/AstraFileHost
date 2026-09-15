export class RequestError extends Error {constructor(message:string,public status:number,public code:string){super(message);}}
export async function api<T=any>(path:string,method='GET',body?:unknown):Promise<T>{
 const res=await fetch(`/api${path}`,{method,credentials:'same-origin',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),'X-Astra-Client':'web'},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await res.json().catch(()=>({error:'Service returned an invalid response.'}));
 if(!res.ok)throw new RequestError(data.error??'Request failed',res.status,data.code??'UNKNOWN');return data;
}
export function bytes(n:number,precision=1){if(!Number.isFinite(n))return '—';if(n===0)return '0 B';const units=['B','KiB','MiB','GiB','TiB'];const i=Math.min(4,Math.floor(Math.log(n)/Math.log(1024)));return `${(n/1024**i).toFixed(i?precision:0)} ${units[i]}`;}
export function speed(n:number){return n>=1e9?`${(n/1e9).toFixed(2)} GB/s`:`${(n/1e6).toFixed(1)} MB/s`;}
export function date(value:string|null,locale='en'){return value?new Intl.DateTimeFormat(locale,{dateStyle:'medium'}).format(new Date(value)):'—';}
