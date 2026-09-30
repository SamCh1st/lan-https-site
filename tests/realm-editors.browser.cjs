const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
 const base=process.env.REALM_PREVIEW_URL||'https://127.0.0.1:8771',ctx=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await ctx.request.post(base+'/api/login',{data:{username:'TabletopQA',password:'Tabletop-QA-12345'}});
 const p=await ctx.newPage();p.setDefaultTimeout(7000);const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.locator('.campaign-row').filter({hasText:'Dice QA Normal'}).click();
 for(const theme of ['light','dark']){await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 for(const width of [1440,768,390]){await p.setViewportSize({width,height:1000});
 for(const type of ['session','quest','encounter','character','npc','faction','item','spell','attack','lore']){
 await p.locator('#realmMenuButton').click();await p.locator('#realmSidebar [data-record-type='+type+']').click();
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),type+' archive overflow');
 assert.ok(await p.locator('.map-stage').evaluate(e=>e.scrollHeight<=e.clientHeight+1),type+' clipped archive');
 await p.locator('#addSectionRecord').click();await p.locator('#workModal').waitFor({state:'visible'});
 const overflow=await p.locator('#workModal .modal-content').evaluate(e=>({w:e.clientWidth,scroll:e.scrollWidth}));assert.ok(overflow.scroll<=overflow.w+2,`${type} ${width} modal overflow: ${JSON.stringify(overflow)}`);
 await p.locator('#workModal .modal-footer').scrollIntoViewIfNeeded();assert.ok(await p.locator('#workModal .modal-footer').isVisible());
 if(type==='character'&&width===390)await p.screenshot({path:`tests/artifacts/realm-panels/character-editor-${theme}-mobile.png`});
 await p.locator('#workModal [data-bs-dismiss]').first().click();await p.locator('#workModal').waitFor({state:'hidden'});
 }
 console.log('PASS 10 archives and editors',theme,width);
 }}assert.deepEqual(errors,[]);
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
