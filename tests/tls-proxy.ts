import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {connect} from 'node:http2';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {PutBucketCorsCommand} from '@aws-sdk/client-s3';
import {s3} from '../packages/storage/index.js';
import {env} from '../packages/config/index.js';
import {report} from './helpers.js';
const origin='https://localhost:18543';
// Both origins belong to this local acceptance setup. Production uses APP_ORIGIN only.
await s3.send(new PutBucketCorsCommand({Bucket:env.S3_BUCKET,CORSConfiguration:{CORSRules:[{AllowedOrigins:[env.APP_ORIGIN,origin],AllowedMethods:['GET','HEAD','PUT'],AllowedHeaders:['content-type','x-amz-checksum-sha256','range'],ExposeHeaders:['ETag','Content-Length','Content-Range','Accept-Ranges','x-amz-checksum-sha256'],MaxAgeSeconds:600}]}}));s3.destroy();
const ca=await readFile('.secrets/acceptance-tls.crt');const tls=connect(origin,{ca});
await new Promise<void>((resolve,reject)=>{tls.once('error',reject);tls.once('connect',()=>{assert.equal(tls.alpnProtocol,'h2');resolve();});});
const status=await new Promise<number>(resolve=>{const req=tls.request({':path':'/health/ready'});req.on('response',h=>resolve(Number(h[':status'])));req.resume();req.end();});assert.equal(status,200);tls.close();
const browser=await chromium.launch({headless:true});const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});const page=await context.newPage();let pageErrors=0,cspErrors=0;const cspDetails:string[]=[];page.on('pageerror',()=>pageErrors++);page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/.test(m.text())){cspErrors++;cspDetails.push(m.text().replace(/https?:\/\/[^\s'"]+/g,'[URL]').slice(0,350));}});
const fixture=`.local/fixtures/TLS-أصلي-${Date.now()}.bin`;await mkdir('.local/fixtures',{recursive:true});
try{
 await page.goto(origin);await page.getByRole('heading',{name:'Your next big thing. Send it.'}).waitFor();const payload=randomBytes(65*1024**2+31);const sha=createHash('sha256').update(payload).digest('hex');
 await writeFile(fixture,payload,{flag:'wx'});await page.locator('input[aria-label="Choose files"]').setInputFiles(fixture);await page.getByText('Ready to share',{exact:true}).waitFor({timeout:90000});
 const cookies=await context.cookies();const session=cookies.find(c=>c.name==='astra_session');assert.ok(session?.secure&&session.httpOnly&&session.sameSite==='Lax');
 const request=async(path:string,body?:unknown)=>context.request.fetch(origin+'/api'+path,{method:body?'POST':'GET',headers:{origin,'x-astra-client':'web'},data:body});
 const files=await(await request('/files')).json();const file=files.items.find((f:any)=>f.name===fixture.split('/').at(-1));assert.ok(file);
 const grant=await(await request(`/files/${file.id}/download`,{})).json();assert.ok(grant.url.startsWith(origin+'/astrafile/'));
 const downloaded=await context.request.get(grant.url);assert.equal(downloaded.status(),200);assert.equal(createHash('sha256').update(await downloaded.body()).digest('hex'),sha);
 const ranged=await context.request.get(grant.url,{headers:{range:'bytes=1000-1999'}});assert.equal(ranged.status(),206);assert.deepEqual(await ranged.body(),payload.subarray(1000,2000));
 const cors=await context.request.fetch(grant.url,{method:'OPTIONS',headers:{origin:'https://untrusted.invalid','access-control-request-method':'GET'}});assert.notEqual(cors.headers()['access-control-allow-origin'],'https://untrusted.invalid');assert.notEqual(cors.headers()['access-control-allow-origin'],'*');
 const oversized=await request('/auth/guest',{payload:'x'.repeat(150*1024)});assert.equal(oversized.status(),413);
 const raw=await context.request.get(origin+'/');assert.match(raw.headers()['content-security-policy'],/frame-ancestors 'none'/);assert.match(raw.headers()['strict-transport-security'],/max-age/);assert.equal(raw.headers()['x-content-type-options'],'nosniff');
 const owner=JSON.parse(await readFile('.secrets/owner-account.json','utf8'));await page.goto(origin+'/login');await page.getByLabel('Email address').fill(owner.email);await page.getByLabel('Password',{exact:true}).fill(owner.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/drive');
 let traffic:any;for(let n=0;n<30;n++){traffic=(await(await request('/admin/overview')).json()).traffic;if(traffic.available&&traffic.receivedBytes>=payload.length&&traffic.sentBytes>=payload.length)break;await new Promise(r=>setTimeout(r,1000));}assert.ok(traffic.available&&traffic.receivedBytes>=payload.length&&traffic.sentBytes>=payload.length,'Storage transfer telemetry is missing');
 await page.goto(origin+'/api/docs/');await page.locator('.swagger-ui').first().waitFor();const schema=await context.request.get(origin+'/api/docs/json');assert.equal(schema.status(),200);assert.ok((await schema.json()).paths['/api/uploads']);
 assert.equal(pageErrors,0,'Production browser had an uncaught error');await writeFile('.local/csp-details.json',JSON.stringify(cspDetails,null,2));assert.equal(cspErrors,0,'Production browser had a CSP violation');
 await page.goto(origin+'/admin/overview');await page.getByText('Available files',{exact:true}).waitFor();await page.screenshot({path:'output/playwright/production-tls-admin.png',fullPage:true,animations:'disabled'});
 await report('tls-proxy',{date:new Date().toISOString(),selfSignedTestCertificate:true,tlsCertificateValidated:true,http2:true,productionContainer:true,uploadBytes:payload.length,sha256:sha,downloadIntegrity:true,range206:true,secureHttpOnlyCookie:true,csp:true,hsts:true,untrustedCorsRejected:true,controlBodyLimit413:true,openapi:true,pageErrors,cspErrors,storageTrafficMeasured:true,traffic});console.info('PASS production TLS/HTTP2 browser upload, checksum download/range, cookie/header/CORS limits and OpenAPI');
}finally{await browser.close();await unlink(fixture).catch(()=>{});}
