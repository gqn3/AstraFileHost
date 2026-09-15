import {origin} from '../helpers.js';
const selfSigned=process.env.TEST_SELF_SIGNED==='true'&&new URL(origin).hostname==='localhost';
import {test,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
test('anonymous upload, share, password protection, folder management, and download',async({page,context})=>{
 await page.goto('/');await expect(page.getByRole('heading',{name:'Your next big thing. Send it.'})).toBeVisible();
 await page.locator('input[aria-label="Choose files"]').setInputFiles({name:'original-ملف.txt',mimeType:'text/plain',buffer:Buffer.from('Original bytes remain exactly the same. مرحباً\n'.repeat(10000))});
 await expect(page.getByText('Ready to share',{exact:true})).toBeVisible();
 const url=await page.getByRole('textbox',{name:'Share link'}).inputValue();await page.screenshot({path:'output/playwright/upload-success.png',fullPage:true,animations:'disabled',mask:[page.getByRole('textbox',{name:'Share link'})]});
 await page.goto('/drive');await expect(page.getByRole('button',{name:'original-ملف.txt',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'New folder',exact:true}).click();await page.getByLabel('Folder name').fill('Project assets');await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.getByRole('button',{name:'Project assets',exact:true})).toBeVisible();
 await page.getByRole('checkbox',{name:'original-ملف.txt'}).check();await page.locator('.bulk-bar').getByRole('button',{name:'Share',exact:true}).click();await page.getByLabel('Password',{exact:true}).fill('browser-share-password');await page.getByRole('dialog').getByRole('button',{name:'Share',exact:true}).click();
 await expect(page.getByRole('dialog').getByRole('textbox',{name:'Share link'})).toBeVisible();const protectedUrl=await page.getByRole('dialog').getByRole('textbox',{name:'Share link'}).inputValue();await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).last().click();
 const visitor=await context.browser()!.newContext({ignoreHTTPSErrors:selfSigned});const other=await visitor.newPage();await other.goto(protectedUrl);await expect(other.getByRole('button',{name:'Unlock files'})).toBeVisible();await other.getByLabel('Password',{exact:true}).fill('browser-share-password');await other.getByRole('button',{name:'Unlock files'}).click();await expect(other.getByText('original-ملف.txt',{exact:true})).toBeVisible();
 const promise=other.waitForEvent('download');await other.getByRole('button',{name:'Download',exact:true}).click();const download=await promise;expect(download.suggestedFilename()).toBe('original-ملف.txt');await visitor.close();
 await page.goto(url);await expect(page.getByText('Shared with you',{exact:true})).toBeVisible();await page.screenshot({path:'output/playwright/public-share.png',fullPage:true,animations:'disabled',mask:[page.getByRole('textbox',{name:'Share link'})]});
});
test('browser refresh preserves uploaded parts and reselect resumes the original file',async({page})=>{
 test.setTimeout(900000);
 await mkdir('.local/fixtures',{recursive:true});const fixture=path.resolve('.local/fixtures/browser-resume.bin');await writeFile(fixture,randomBytes(130*1024**2));
 let blocked=true,injected=false;await page.route(`${process.env.TEST_S3_ORIGIN??'http://localhost:18401'}/**`,async route=>{const u=new URL(route.request().url());if(route.request().method()==='PUT'&&u.searchParams.get('partNumber')==='2'&&blocked&&!injected){injected=true;await new Promise(resolve=>setTimeout(resolve,1500));await route.abort('internetdisconnected');}else await route.continue();});
 let id='';page.on('response',async res=>{if(res.url().endsWith('/api/uploads')&&res.request().method()==='POST'&&res.status()===200)id=(await res.json()).id;});
 await page.goto('/');await page.locator('input[aria-label="Choose files"]').setInputFiles(fixture);
 await expect.poll(async()=>id).not.toBe('');
 await expect.poll(async()=>{const res=await page.request.get(`/api/uploads/${id}`);const data=await res.json();return data.parts?.some((p:any)=>p.number===1)??false;},{timeout:600000}).toBe(true);
 await page.getByRole('button',{name:'Pause',exact:true}).click();await page.reload();await expect(page.locator('.transfer-card.paused')).toBeVisible();const state=await(await page.request.get(`/api/uploads/${id}`)).json();expect(state.parts.some((p:any)=>p.number===1)).toBe(true);const etag=state.parts.find((p:any)=>p.number===1).etag;
 blocked=false;let resentFirst=false;page.on('request',req=>{if(req.method()==='PUT'&&new URL(req.url()).searchParams.get('partNumber')==='1')resentFirst=true;});
 await page.locator('.transfer-card input[type="file"]').setInputFiles(fixture);await expect(page.getByText('Ready to share',{exact:true})).toBeVisible({timeout:600000});expect(resentFirst).toBe(false);expect(etag).toBeTruthy();await page.screenshot({path:'output/playwright/resume-complete.png',fullPage:true,animations:'disabled',mask:[page.getByRole('textbox',{name:'Share link'})]});
});
test('owner login, live admin modules, settings, and Arabic mobile themes',async({page})=>{
 const owner=JSON.parse(await readFile(process.env.TEST_OWNER_FILE??'.secrets/owner-account.json','utf8'));
 await page.goto('/login');await page.getByLabel('Email address').fill(owner.email);await page.getByLabel('Password',{exact:true}).fill(owner.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/\/drive/);
 await page.goto('/admin/overview');await expect(page.getByText('Available files',{exact:true})).toBeVisible();await page.screenshot({path:'output/playwright/admin-overview.png',fullPage:true,animations:'disabled',mask:[page.getByRole('textbox',{name:'Share link'})]});
 for(const module of ['files','uploads','shares','users','storage','security','jobs','audit','analytics','api','health','reports','notifications','plans']){await page.locator(`.side-nav a[href="/admin/${module}"]`).click();await expect(page.locator('.page-title h1')).toBeVisible();await expect(page.locator('.error-box')).toHaveCount(0);}
 await page.goto('/admin/settings');await page.getByLabel('Site name',{exact:true}).fill('AstraFile');await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.getByText('Changes saved',{exact:true})).toBeVisible();
 await page.goto('/');await page.getByRole('button',{name:'Language',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('dir','rtl');await page.getByRole('combobox',{name:'المظهر'}).selectOption('light');await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/playwright/arabic-mobile-light.png',fullPage:true,animations:'disabled',mask:[page.getByRole('textbox',{name:'Share link'})]});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.getByRole('combobox',{name:'المظهر'}).selectOption('dark');await page.screenshot({path:'output/playwright/arabic-mobile-dark.png',fullPage:true,animations:'disabled',mask:[page.getByRole('textbox',{name:'Share link'})]});
});

test('registered upload, admin file blocking, user suspension and account-local transfer history',async({page,browser})=>{
 const email=`e2e-${Date.now()}@astrafile.local`,password=randomBytes(24).toString('base64url'),filename=`registered-${Date.now()}.txt`;
 await page.goto('/register');await page.getByLabel('Email address').fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Create account',exact:true}).click();await expect(page).toHaveURL(/\/drive/);
 const staff=await browser.newContext({ignoreHTTPSErrors:selfSigned});const admin=await staff.newPage();const owner=JSON.parse(await readFile(process.env.TEST_OWNER_FILE??'.secrets/owner-account.json','utf8'));await admin.goto(origin+'/login');await admin.getByLabel('Email address').fill(owner.email);await admin.getByLabel('Password',{exact:true}).fill(owner.password);await admin.getByRole('button',{name:'Sign in',exact:true}).click();await expect(admin).toHaveURL(/\/drive/);
 const accountId=(await(await page.request.get('/api/auth/me')).json()).user.accountId;await admin.goto(origin+'/admin/users');await admin.getByRole('textbox',{name:'Search files'}).fill(accountId);await admin.getByRole('textbox',{name:'Search files'}).press('Enter');const pending=admin.getByRole('row').filter({hasText:accountId});await pending.locator('summary').click();await pending.getByRole('button',{name:'Activate account',exact:true}).click();await expect(pending.getByText('ACTIVE',{exact:true})).toBeVisible();
 await page.goto('/');await page.locator('input[aria-label="Choose files"]').setInputFiles({name:filename,mimeType:'text/plain',buffer:Buffer.from('Registered original file verification')});await expect(page.getByText('Ready to share',{exact:true})).toBeVisible();const share=await page.getByRole('textbox',{name:'Share link'}).inputValue();

 await admin.goto(origin+'/admin/files');await admin.getByRole('textbox',{name:'Search files'}).fill(filename);await admin.getByRole('textbox',{name:'Search files'}).press('Enter');const row=admin.getByRole('row').filter({hasText:filename});await row.locator('summary').click();await row.getByRole('button',{name:'Block',exact:true}).click();await expect(row.getByText('BLOCKED',{exact:true})).toBeVisible();
 const visitor=await browser.newContext({ignoreHTTPSErrors:selfSigned});const sharePage=await visitor.newPage();await sharePage.goto(share);await expect(sharePage.getByRole('button',{name:'Download',exact:true})).toHaveCount(0);
 await row.locator('summary').click();await row.getByRole('button',{name:'Unblock',exact:true}).click();await expect(row.getByText('AVAILABLE',{exact:true})).toBeVisible();
 await admin.goto(origin+'/admin/users');await admin.getByRole('textbox',{name:'Search files'}).fill(accountId);await admin.getByRole('textbox',{name:'Search files'}).press('Enter');const userRow=admin.getByRole('row').filter({hasText:accountId});await userRow.locator('summary').click();await userRow.getByRole('button',{name:'Suspend',exact:true}).click();await expect(userRow.getByText('SUSPENDED',{exact:true})).toBeVisible();await page.reload();await expect(page.locator('.transfer-card')).toHaveCount(0);
 await userRow.locator('summary').click();await userRow.getByRole('button',{name:'Unsuspend',exact:true}).click();await expect(userRow.getByText('ACTIVE',{exact:true})).toBeVisible();
 await page.goto('/login');await page.getByLabel('Email address').fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/\/drive/);await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.locator('.transfer-card')).toHaveCount(0);
 await visitor.close();await staff.close();
});
