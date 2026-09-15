import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();if(path.basename(root)!=='AstraFileHost')throw Error('Run from AstraFileHost');
const compose=await readFile('infra/compose/local.yml','utf8');
const images=process.argv.length>2?process.argv.slice(2):['astrafile-app:acceptance','astrafile-proxy:stable-hardened',...[...compose.matchAll(/^    image: ([^\s]+)$/gm)].map(m=>m[1])];
const scanner='aquasec/trivy:0.74.0@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969';
async function command(args){return new Promise((resolve,reject)=>{const child=spawn('docker',args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',error='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>error+=b);child.on('error',reject);child.on('close',code=>code===0?resolve(out):reject(Error(`Image audit command failed (${code}): ${error.slice(-1000)}`)));});}
await mkdir('.local/audit',{recursive:true});await mkdir('.local/audit-cache',{recursive:true});await mkdir('output/verification',{recursive:true});const summary=[];
for(const image of images){const name=image.split(':')[0].replaceAll('/','-');const archive=path.join(root,'.local/audit',`${name}.tar`);await command(['image','save','-o',archive,image]);
 const result=JSON.parse(await command(['run','--rm','--name','astrafile-service-audit','--label','com.astrafile.scope=image-audit','--memory','1g','--cpus','1.5','--mount',`type=bind,source=${path.join(root,'.local/audit')},target=/scan,readonly`,'--mount',`type=bind,source=${path.join(root,'.local/audit-cache')},target=/cache`,scanner,'image','--cache-dir','/cache','--input',`/scan/${name}.tar`,'--scanners','vuln','--severity','HIGH,CRITICAL','--format','json','--quiet','--timeout','10m']));
 await writeFile(`output/verification/trivy-${name}.json`,JSON.stringify(result,null,2));const vulnerabilities=result.Results?.flatMap(r=>r.Vulnerabilities??[])??[];summary.push({image,findings:vulnerabilities.map(v=>({id:v.VulnerabilityID,package:v.PkgName,installed:v.InstalledVersion,fixed:v.FixedVersion,severity:v.Severity}))});console.info(`${name}: ${vulnerabilities.length} high/critical findings`);await writeFile('output/verification/service-image-audit.json',JSON.stringify({date:new Date().toISOString(),scanner,images:summary},null,2));
}

if(summary.some(r=>r.findings.length))process.exitCode=1;
