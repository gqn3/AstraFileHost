import {useParams} from 'react-router-dom';
import {api,bytes,date} from '../api.js';
import {useI18n} from '../i18n.js';
import {useData,useUI,Loading,ErrorBox,Empty} from '../components.js';
export function VersionsPage(){
 const {id}=useParams(),{t,lang}=useI18n(),{dialog,toast}=useUI(),{data,error,loading,reload}=useData(`/files/${id}/versions`);
 async function restore(version:any){await dialog({title:t('restoreVersion'),description:t('versionConflictNote'),onSubmit:async()=>{await api(`/files/${id}/versions/restore`,'POST',{versionId:version.id,expectedRevision:data.file.revision});reload();toast(t('saveSuccess'));}});}
 async function replace(){const files=await api('/files?view=files');await dialog({title:t('replaceFromCloud'),description:t('versionConflictNote'),fields:[{name:'sourceFileId',label:t('files'),required:true,options:files.items.filter((f:any)=>f.id!==id&&f.state==='AVAILABLE').map((f:any)=>({value:f.id,label:f.name}))}],onSubmit:async v=>{await api(`/files/${id}/versions`,'POST',{sourceFileId:v.sourceFileId,expectedRevision:data.file.revision});reload();toast(t('saveSuccess'));}});}
 if(loading&&!data)return <Loading/>;
 return <div><div className="page-title"><h1>{t('versions')}</h1><button className="button" disabled={!data?.enabled||!data?.policy.versionCount} onClick={()=>void replace()}>{t('replaceFromCloud')}</button></div>{error&&<ErrorBox message={error}/>}<p className="muted">{t('versionConflictNote')}</p>{data?.items.length?<div className="table-wrap"><table><thead><tr><th>{t('name')}</th><th>{t('date')}</th><th>{t('size')}</th><th>{t('actions')}</th></tr></thead><tbody>{data.items.map((version:any)=><tr key={version.id}><td>{version.name} · {version.revision}</td><td>{date(version.created_at,lang)}</td><td>{bytes(version.size)}</td><td><button className="button secondary small" disabled={!data.enabled} onClick={()=>void restore(version)}>{t('restoreVersion')}</button></td></tr>)}</tbody></table></div>:<Empty title={t('noData')}/>}</div>;
}
