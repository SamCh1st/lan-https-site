const {chromium}=require(process.env.TABLETOP_PLAYWRIGHT || 'playwright');
const {spawn}=require('node:child_process'),path=require('node:path'),assert=require('node:assert/strict');
const python=process.env.TABLETOP_PYTHON || 'python';
const out=path.join(__dirname,'artifacts','campaign-transfer');require('node:fs').mkdirSync(out,{recursive:true});
(async()=>{
 const server=spawn(python,['-u',path.join(__dirname,'campaign_transfer_preview.py')],{windowsHide:true});let browser,logs='';server.stderr.on('data',b=>logs+=b);
 try{
  const port=await new Promise((resolve,reject)=>{let text='';server.stdout.on('data',b=>{text+=b;const line=text.split('\n').find(l=>l.startsWith('{'));if(line)resolve(JSON.parse(line).port);});server.on('error',reject);server.on('exit',c=>reject(Error('Fixture exited '+c+': '+logs)));});
  const base='https://127.0.0.1:'+port;
  browser=await chromium.launch({headless:true,...(process.env.TABLETOP_CHROME?{executablePath:process.env.TABLETOP_CHROME}:{})});
  const context=await browser.newContext({ignoreHTTPSErrors:true,acceptDownloads:true,locale:"en-US"});const errors=[];
  assert.equal((await context.request.post(base+'/api/login',{data:{username:'ExportDM',password:'password-123'}})).status(),200);
  const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});page.on('dialog',d=>d.accept());await page.goto(base);await page.locator('.campaign-export').getByText('Download campaign',{exact:true}).count();
  const button=page.getByRole('button',{name:'Download campaign',exact:true}).first();await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});await button.waitFor();
  const [download]=await Promise.all([page.waitForEvent('download'),button.click()]);const archive=path.join(out,'campaign.zip');await download.saveAs(archive);
  assert.equal(download.suggestedFilename(),'Transfer realm.zip');assert(await page.locator('#campaignImportFile').count());assert.equal(await page.locator('.campaign-row').count(),1);
  await page.locator('#campaignImportFile').setInputFiles(archive);await page.waitForFunction(()=>document.querySelectorAll('.campaign-row').length===2);await page.waitForFunction(()=>document.querySelector('#campaignTransferStatus').textContent.includes('Campaign imported.'));
  await page.getByRole('button',{name:'Assign players',exact:true}).click();await page.locator('dialog[open]').waitFor();assert.equal(await page.locator('dialog select').count(),2);await page.locator('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
  assert(await page.getByRole('button',{name:'Import campaign',exact:true}).isVisible());assert(await button.isVisible());
  const player=await browser.newContext({ignoreHTTPSErrors:true,locale:"en-US"});await player.request.post(base+'/api/login',{data:{username:'Player',password:'password-123'}});const pp=await player.newPage();await pp.goto(base);await pp.locator('.campaign-row').waitFor();assert.equal(await pp.getByRole('button',{name:'Download campaign',exact:true}).count(),0);
  const campaign=(await(await context.request.get(base+'/api/work')).json()).items.find(r=>r.content.category==='campaign');assert.equal((await player.request.get(base+'/api/campaign/'+campaign.id+'/export')).status(),403);
  assert.equal((await context.request.post(base+'/api/campaign/import',{data:Buffer.from('bad zip'),headers:{'Content-Type':'application/zip'}})).status(),400);
  assert.deepEqual(errors,[]);console.log('PASS: main-page download, import, assignment dialog, mobile controls, permissions, and invalid-file API.');
 }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
