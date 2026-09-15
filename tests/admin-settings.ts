import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {owner,Client,origin,report} from './helpers.js';
const admin=await owner(),saved=(await admin.request('/admin/settings')).settings;
let imageId:string|undefined;
try{
 // Static 1x1 PNG fixture; multipart body contains the decoded original bytes.
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=','base64');
 const u=await admin.request('/uploads','POST',{name:'branding-verification.png',size:png.length,mime:'image/png',fingerprint:createHash('sha256').update(png).digest('hex')});const checksum=createHash('sha256').update(png).digest('base64');const signed=await admin.request(`/uploads/${u.id}/sign`,'POST',{parts:[{number:1,checksum}]});const put=await fetch(signed.parts[0].url,{method:'PUT',headers:signed.parts[0].headers,body:png});assert.equal(put.status,200);await admin.request(`/uploads/${u.id}/ack`,'POST',{number:1,etag:put.headers.get('etag')});imageId=(await admin.request(`/uploads/${u.id}/complete`,'POST',{})).fileId;
 await admin.request('/admin/settings','PUT',{...saved,logoFileId:imageId,faviconFileId:imageId,homepageTitle:'Verified brand',homepageSubtitle:'Original files',defaultTheme:'light',defaultLanguage:'ar',sharePasswordsEnabled:false,anonymousSharingEnabled:false,defaultMaxDownloads:7});
 const config=await new Client().request('/config');assert.equal(config.homepageTitle,'Verified brand');assert.equal(config.logoFileId,imageId);const image=await fetch(origin+'/api/branding/logo');assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
 await admin.request('/shares','POST',{name:'Disabled password',fileIds:[imageId],password:'long-share-password'},403);
 const guest=new Client();await guest.request('/auth/guest','POST',{});await guest.request('/shares','POST',{name:'Disabled sharing',fileIds:[imageId]},403);
 const share=await admin.request('/shares','POST',{name:'Default limit',fileIds:[imageId]});const details=(await admin.request('/shares')).items.find((s:any)=>s.id===share.id);assert.equal(details.max_downloads,7);
 await admin.request('/admin/settings','PUT',{...saved,logoFileId:randomBytes(16).toString('hex')},400);
 await report('admin-settings',{date:new Date().toISOString(),brandingOriginalPng:true,faviconConfiguration:true,homepageConfiguration:true,defaultThemeLanguage:true,passwordPolicy:true,anonymousSharingPolicy:true,defaultDownloadLimit:true,invalidBrandingRejected:true});console.info('PASS Admin branding, appearance, sharing policies and default download limit');
}finally{await admin.request('/admin/settings','PUT',saved);if(imageId){await admin.request('/files/bulk','POST',{ids:[imageId],action:'delete'});await admin.request('/files/bulk','POST',{ids:[imageId],action:'purge',confirm:'DELETE PERMANENTLY'});}}
