const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}}),base='https://127.0.0.1:8770';
  await context.request.post(base+'/api/login',{data:{username:'DM',password:'Test password 12345'}});
  const records=(await(await context.request.get(base+'/api/work')).json()).items,campaign=records.find(r=>r.content.category==='campaign'),pc=records.find(r=>r.title==='Elara'),api=base+'/api/campaign/'+campaign.id+'/ai';
  await context.request.post(api+'/mode',{data:{mode:'dnd'}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('.campaign-row').filter({hasText:'Chat test'}).click();
  await page.locator('#aiConversationMode').selectOption('modern');
  await page.waitForFunction(()=>!document.querySelector('#aiConversationMode').disabled);
  assert(!(await page.locator('#aiPersonaDock').innerText()).includes('Dungeon Master'));
  assert(await page.locator('#campaignDashboard').evaluate(e=>e.classList.contains('ai-player-tools-active')));
  assert.equal((await context.request.post(api+'/respond',{data:{reply_as_type:'dm'}})).status(),400);
  await page.locator('#aiSpeakerButton').click();assert(!(await page.locator('#aiSpeakerMenu').innerText()).includes('Dungeon Master'));await page.locator('#aiSpeakerButton').click();
  await page.reload();await page.locator('.campaign-row').filter({hasText:'Chat test'}).click();await page.waitForFunction(()=>document.querySelector('#aiConversationMode').value==='modern');
  await page.locator('#aiConversationMode').selectOption('medieval');await page.waitForFunction(()=>!document.querySelector('#aiConversationMode').disabled);
  await page.locator('#aiConversationMode').selectOption('dnd');await page.waitForFunction(()=>!document.querySelector('#aiConversationMode').disabled);
  await page.locator('#aiSpeakerButton').click();await page.locator('#aiSpeakerMenu button').filter({hasText:'Elara'}).click();
  await page.locator('#aiPersonaDock button').filter({hasText:'AI Dungeon Master'}).click();
  await page.waitForFunction(()=>!document.querySelector('#aiPersonaDock button').disabled);
  assert(await page.locator('#campaignDashboard').evaluate(e=>e.classList.contains('ai-player-tools-active')),'AI replying must not change writing-character tools');
  async function checkMenu(){
   await page.locator('#aiSpeakerButton').click();
   const visible=await page.locator('#aiSpeakerMenu').evaluate(menu=>Array.from(menu.querySelectorAll('button')).every(card=>{const r=card.getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight && card.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}));
   assert(visible,'writer menu cards must appear above the reply dock and remain clickable');
   await page.locator('#aiSpeakerMenu button').filter({hasText:'Elara'}).click();
   assert.equal(await page.locator('#aiSpeakerButton').getAttribute('aria-expanded'),'false');
  }
  await checkMenu();
  async function drag(side,delta){
   const handle=page.locator('#campaignDashboard>.realm-splitter[data-resize-side='+side+']');await handle.waitFor({state:'visible'});
   const before=Number(await handle.getAttribute('aria-valuenow')),box=await handle.boundingBox();
   const middleBefore=await page.locator('#campaignDashboard>.map-stage').boundingBox();
   await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+delta,box.y+box.height/2,{steps:8});await page.mouse.up();
   await page.waitForFunction(({side,before})=>Number(document.querySelector('#campaignDashboard>.realm-splitter[data-resize-side='+side+']').getAttribute('aria-valuenow'))!==before,{side,before});
   const middleAfter=await page.locator('#campaignDashboard>.map-stage').boundingBox();assert(Math.abs(middleAfter.width-middleBefore.width)>30,'actual grid must resize');
  }
  await page.getByRole('button',{name:'Fullscreen chat',exact:true}).click();await page.waitForFunction(()=>document.fullscreenElement);
  await checkMenu();await drag('left',65);await drag('right',-65);
  await page.getByRole('button',{name:'Exit fullscreen',exact:true}).click();
  await page.evaluate(()=>document.querySelector('#campaignDashboard').requestFullscreen=async()=>{throw Error('Fallback test');});
  await page.getByRole('button',{name:'Fullscreen chat',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.chat-fullscreen-fallback'));await checkMenu();await drag('left',45);
  await page.getByRole('button',{name:'Exit fullscreen',exact:true}).click();
  await page.locator('#partyScroll .party-card').filter({hasText:'Elara'}).click();await page.locator('#detailFront').waitFor({state:'visible'});
  const geometry=await page.evaluate(()=>{const img=document.querySelector('#detailImage'),hero=document.querySelector('#detailHero'),toggle=document.querySelector('#detailMemoryToggle');const i=img.getBoundingClientRect(),h=hero.getBoundingClientRect();return {fit:getComputedStyle(img).objectFit,ratio:i.width/i.height,natural:img.naturalWidth/img.naturalHeight,center:Math.abs(i.x+i.width/2-h.x-h.width/2),overlap:toggle.getBoundingClientRect().bottom>h.top};});
  assert.equal(geometry.fit,'contain');assert(Math.abs(geometry.ratio-geometry.natural)<.01);assert(geometry.center<2);assert(!geometry.overlap);
  const portraits=await page.locator('.party-portrait img').evaluateAll(imgs=>imgs.map(img=>{const i=img.getBoundingClientRect(),p=img.parentElement.getBoundingClientRect();return Math.abs(i.x+i.width/2-p.x-p.width/2)+Math.abs(i.y+i.height/2-p.y-p.height/2);}));assert(portraits.every(d=>d<2),'portraits centered');
  await page.screenshot({path:'tests/artifacts/chat-card-image-fit.png'});
  await page.locator('#recordDetailModal [data-bs-dismiss=modal]').first().click();
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Fullscreen chat',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.chat-fullscreen-fallback'));
  await checkMenu();
  await page.locator('#aiSpeakerButton').click();await page.screenshot({path:'tests/artifacts/chat-speaker-menu-mobile.png'});
  await page.keyboard.press('Escape');assert.equal(await page.locator('#aiSpeakerButton').getAttribute('aria-expanded'),'false');

  assert.deepEqual(errors,[]);console.log('PASS: mode persistence, DM filtering and enforcement, writer panels, native/fallback pointer resizing, contained detail image, centered round portraits.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
