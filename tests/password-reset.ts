// A loopback-only SMTP receiver exercises actual Nodemailer delivery without sending mail externally.
import assert from 'node:assert/strict';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import argon2 from 'argon2';
import {Client,report} from './helpers.js';
import {emailLookup,emailLookups,publicAccountId} from '../packages/privacy/index.js';
import {pool,one,query} from '../packages/database/index.js';
const email=`reset-${Date.now()}@astrafile.local`,password=randomBytes(24).toString('base64url');
const messages:string[]=[];const sockets=new Set<net.Socket>();
const smtp=net.createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));let input='',data=false,message='';socket.write('220 astrafile-local-test ESMTP\r\n');socket.on('data',chunk=>{input+=chunk.toString();let at;while((at=input.indexOf('\r\n'))>=0){const line=input.slice(0,at);input=input.slice(at+2);if(data){if(line==='.'){messages.push(message);message='';data=false;socket.write('250 Accepted locally\r\n');}else message+=line.replace(/^\.\./,'.')+'\n';}else if(/^EHLO|^HELO/i.test(line))socket.write('250 astrafile-local-test\r\n');else if(/^DATA/i.test(line)){data=true;socket.write('354 End with dot\r\n');}else if(/^QUIT/i.test(line)){socket.end('221 Bye\r\n');}else socket.write('250 OK\r\n');}});});
await new Promise<void>(resolve=>smtp.listen(18425,'127.0.0.1',resolve));
const api=spawn(process.execPath,['--import','tsx','apps/api/src/index.ts'],{env:{...process.env,NODE_ENV:'development',PORT:'18405',HOST:'127.0.0.1',APP_ORIGIN:'http://localhost:18405',SMTP_URL:'smtp://127.0.0.1:18425',MAIL_FROM:'AstraFile <test@astrafile.local>'},stdio:['ignore','ignore','pipe'],windowsHide:true});
let startupError='';api.stderr.on('data',chunk=>{startupError+=chunk.toString();});
api.on('exit',code=>{if(code)console.error('Isolated API exit',code,startupError.split('\n').filter(line=>/^[A-Za-z]+Error:/.test(line)).map(line=>line.replace(/https?:\/\/\S+/g,'[URL]')).join(' '));});
try{
 const accountId=publicAccountId();await one("INSERT INTO users(email_lookup,email_status,account_id,name,password_hash) VALUES($1,'UNVERIFIED',$2,$2,$3) RETURNING id",[emailLookup(email),accountId,await argon2.hash(password,{type:argon2.argon2id,memoryCost:65536,timeCost:3})]);
 const c=new Client('http://localhost:18405');for(let n=0;n<600;n++){try{if((await fetch(c.base+'/health/ready')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 await c.request('/auth/login','POST',{email,password});await c.request('/auth/forgot','POST',{email});assert.equal(messages.length,1);assert.match(messages[0],new RegExp(email));
 const decoded=messages[0].replace(/=\n/g,'').replace(/=([\dA-F]{2})/gi,(_,v)=>String.fromCharCode(parseInt(v,16)));const token=decoded.match(/\/reset#([A-Za-z0-9_-]{30,128})/)?.[1];assert.ok(token,'Reset email did not contain a usable link');
 const visitor=new Client(c.base);const next=randomBytes(24).toString('base64url');await visitor.request('/auth/reset','POST',{token,password:next});await c.request('/files','GET',undefined,401);await visitor.request('/auth/reset','POST',{token,password:next},400);await visitor.request('/auth/login','POST',{email,password},401);await visitor.request('/auth/login','POST',{email,password:next});
 const count=messages.length;await visitor.request('/auth/forgot','POST',{email:'absent-reset@astrafile.local'});assert.equal(messages.length,count);
 await visitor.request('/auth/email','POST',{email,password:next,purpose:'VERIFY'});
 const verificationText=messages.at(-1)!.replace(/=\n/g,'').replace(/=([\dA-F]{2})/gi,(_,v)=>String.fromCharCode(parseInt(v,16)));const verification=verificationText.match(/\/verify#([A-Za-z0-9_-]{30,128})/)?.[1];assert.ok(verification);
 await visitor.request('/auth/verify','POST',{token:verification});assert.equal((await visitor.request('/auth/me')).user.emailVerified,true);await visitor.request('/auth/verify','POST',{token:verification},404);
 const changedEmail=`changed-${Date.now()}@astrafile.local`;await visitor.request('/auth/email','POST',{email:changedEmail,password:next});const changeText=messages.at(-1)!.replace(/=\n/g,'').replace(/=([\dA-F]{2})/gi,(_,v)=>String.fromCharCode(parseInt(v,16)));const changeToken=changeText.match(/\/verify#([A-Za-z0-9_-]{30,128})/)?.[1];assert.ok(changeToken);await new Client(c.base).request('/auth/verify','POST',{token:changeToken});await visitor.request('/files','GET',undefined,401);await visitor.request('/auth/login','POST',{email:changedEmail,password:next});
 const stored=await one('SELECT * FROM users WHERE email_lookup=ANY($1::text[])',[emailLookups(changedEmail)]);assert.ok(stored);assert.equal(JSON.stringify(stored).includes(changedEmail),false);assert.equal(JSON.stringify(stored).includes(email),false);
 await report('password-reset',{date:new Date().toISOString(),localSmtpDelivery:true,singleUseToken:true,oldPasswordRejected:true,existingSessionsRevoked:true,unknownEmailSameSuccess:true,emailVerification:true,emailChangeRevokesSessions:true,plaintextEmailAbsent:true,externalEmailSent:false});console.info('PASS SMTP password reset, email verification/change, single-use tokens, session revocation and blind email storage');
}finally{api.kill();for(const socket of sockets)socket.destroy();await new Promise<void>(r=>smtp.close(()=>r()));await query('DELETE FROM password_resets WHERE user_id IN (SELECT id FROM users WHERE email_lookup=ANY($1::text[]))',[emailLookups(email)]);await pool.end();}
