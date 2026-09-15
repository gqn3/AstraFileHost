import {useEffect} from 'react';
import {useApp} from './context.js';
import {api} from './api.js';
export function CloudSync(){
 const {user}=useApp();
 useEffect(()=>{
  if(!user||user.status!=='ACTIVE')return;
  let stopped=false,busy=false,cursor=0,initialized=false;
  async function sync(){if(stopped||busy||document.hidden)return;busy=true;try{let changed=false;for(let page=0;page<10;page++){const response=await api(`/cloud/changes?cursor=${cursor}`);if(stopped)return;changed ||=response.items.length>0;cursor=response.cursor;if(!response.hasMore)break;}if(initialized&&changed)window.dispatchEvent(new Event('astrafile:cloud-change'));initialized=true;}catch(error){if((error as {code?:string}).code==='CLOUD_CURSOR'){cursor=0;window.dispatchEvent(new Event('astrafile:cloud-change'));}}finally{busy=false;}}
  const timer=setInterval(()=>void sync(),5000);const visible=()=>void sync();document.addEventListener('visibilitychange',visible);void sync();
  return()=>{stopped=true;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[user?.id,user?.status]);
 return null;
}
