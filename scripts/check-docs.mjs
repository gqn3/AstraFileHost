import {execFileSync} from 'node:child_process';
import {readFileSync,statSync,existsSync} from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const files=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean))].filter(f=>existsSync(f));
const errors=[];
const forbidden=/(^|\/)(?:\.env(?:\..+)?|\.secrets|\.local|node_modules|dist|output|test-results|playwright-report|backups|dumps|runtime|id_rsa|id_ed25519|authorized_keys)(?:\/|$)|\.(?:pem|key|p12|pfx|dump|sqlite|db|rdb|aof|log|dpapi)$/i;
for(const file of files){
 if(file!=='.env.example'&&forbidden.test(file))errors.push(`${file}: private/runtime path`);
 if(statSync(file).size>5*1024*1024)errors.push(`${file}: exceeds 5 MiB publication limit`);
}
function anchors(text){return new Set([...text.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)].map(m=>m[1].toLowerCase().replace(/<[^>]+>/g,'').replace(/[^\p{L}\p{N}_\-\s]/gu,'').replace(/\s/g,'-')));}
for(const file of files.filter(f=>f.endsWith('.md'))){
 const full=readFileSync(file,'utf8');const body=full.replace(/```[\s\S]*?```/g,'');
 const links=[...body.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g),...body.matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>m[1]);
 for(const link of links){
  if(/^(?:https?:|mailto:)/.test(link))continue;
  const [local,fragment]=link.split('#');const target=local?path.resolve(path.dirname(file),decodeURIComponent(local)):path.resolve(file);
  if(!target.startsWith(root+path.sep)&&target!==path.resolve(file)){errors.push(`${file}: link leaves repository`);continue;}
  if(!existsSync(target)){errors.push(`${file}: missing link target ${local}`);continue;}
  if(fragment&&target.endsWith('.md')&&!anchors(readFileSync(target,'utf8')).has(decodeURIComponent(fragment)))errors.push(`${file}: missing heading ${fragment}`);
 }
 if(/C:[\\/]+Users[\\/]+(?!USER(?:[\\/]|\b)|<USER>)[\w.-]+/i.test(full))errors.push(`${file}: personal machine path`);
}
if(readFileSync('README.md','utf8')!==readFileSync('README.en.md','utf8'))errors.push('English READMEs differ');
const shots=files.filter(f=>/^docs\/assets\/screenshots\/\d{2}-.+\.png$/.test(f));
if(shots.length!==20)errors.push('Expected 20 documented screenshots');
for(const file of shots){const data=readFileSync(file);if(data.subarray(1,4).toString()!=='PNG'||data.readUInt32BE(16)!==1440||data.readUInt32BE(20)!==900)errors.push(`${file}: expected 1440x900 PNG`);}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`Documentation links, matching English READMEs, ${shots.length} screenshots and ${files.length} publication paths verified.`);
