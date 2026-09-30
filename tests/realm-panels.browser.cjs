const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const base=process.env.REALM_PREVIEW_URL||'https://127.0.0.1:8771';
 const out=path.join(__dirname,'artifacts','realm-panels');fs.mkdirSync(out,{recursive:true});
 try {
  const ctx=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1050},reducedMotion:'reduce'});
  await ctx.request.post(base+'/api/login',{data:{username:'TabletopQA',password:'Tabletop-QA-12345'}});
  const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(10000);
  await p.goto(base);await p.locator('.campaign-row').filter({hasText:'Dice QA Normal'}).click();
  await p.locator('#mapWorkspaceSelect option').first().waitFor({state:'attached'});
  await p.locator('[data-map-mode=edit]').click();
  for(const width of [1440,1000,768,390]){
   await p.setViewportSize({width,height:1050});
   await p.locator('#campaignDashboard').scrollIntoViewIfNeeded();
   await p.screenshot({path:path.join(out,`dm-edit-${width}.png`),animations:'disabled'});
   console.log('DM edit',width,await p.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth,rails:[...document.querySelectorAll('.map-editor-rail')].map(e=>({w:e.clientWidth,h:e.clientHeight,scroll:e.scrollWidth,direction:getComputedStyle(e.querySelector('.map-tool-list')).flexDirection}))})));
  }
  await p.setViewportSize({width:1440,height:1050});
  await p.locator('#realmMenuButton').click();await p.locator('#realmSidebar [data-record-type=item]').click();
  await p.locator('#campaignRecords').scrollIntoViewIfNeeded();
  await p.screenshot({path:path.join(out,'archive.png'),animations:'disabled'});
  if(process.env.REALM_ASSERT_PANELS){
   assert.ok(await p.locator('#campaignRecords').evaluate(e=>e.getBoundingClientRect().width>document.getElementById('campaignDashboard').clientWidth*.9));
   assert.equal(await p.locator('.map-editor-rail').first().isVisible(),false);
   assert.ok(await p.locator('.map-stage').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'Archive cannot clip its cards');
  }
  await p.locator('#addSectionRecord').click();await p.locator('#workModal').waitFor({state:'visible'});
  await p.screenshot({path:path.join(out,'item-editor-light.png'),animations:'disabled'});
  await p.locator('#workModal [data-bs-dismiss]').first().click();
  await p.locator('#workModal').waitFor({state:'hidden'});
  await p.locator('#themeToggle').click();
  for(const [button,panel] of [['#artAtelierButton','#artAtelier'],['#spellAtelierButton','#spellAtelier']]){
   await p.locator('#realmMenuButton').click();await p.locator(button).click();await p.locator(panel).waitFor({state:'visible'});
   await p.locator(panel).scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,panel.slice(1)+'-dark.png'),animations:'disabled'});
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
