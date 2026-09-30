const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const base=process.env.REALM_PREVIEW_URL||'https://127.0.0.1:8777';
 try{
  const dm=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const player=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  for(const [ctx,username] of [[dm,'TabletopQA'],[player,'DicePlayerQA']])assert.equal((await ctx.request.post(base+'/api/login',{data:{username,password:'Tabletop-QA-12345'}})).status(),200);
  const records=async ctx=>(await(await ctx.request.get(base+'/api/work')).json()).items;
  const all=await records(dm),campaign=all.find(r=>r.title==='Dice QA Normal'),hero=all.find(r=>r.title==='Elara'&&r.content.campaign_id===campaign.id);
  async function edit(id,content={},title){const old=(await records(dm)).find(r=>r.id===id);const r=await dm.request.put(base+'/api/work/'+id,{data:{title:title??old.title,content:{...old.content,...content}}});assert(r.ok(),await r.text());}
  async function create(title,content){const r=await dm.request.post(base+'/api/work',{data:{title,content:{campaign_id:campaign.id,...content}}});assert(r.ok(),await r.text());const result=await r.json();return result.item||result;}
  const item=await create('Live torch',{category:'item',item_type:'Other',summary:'Before the edit',quantity:2,owner_ids:[hero.id],grant_mode:'characters',player_visible:false,tabletop:{weight:1,value_cp:1}});
  const hidden=await create('DM private secret',{category:'lore',player_visible:false,summary:'Never send this to players'});
  const first=await player.request.get(base+'/api/work'),tag=first.headers().etag;
  assert(tag);assert(!(await first.text()).includes('DM private secret'),'Run preview with SPELL_QA_NON_HOST=1');
  assert.equal((await player.request.get(base+'/api/work',{headers:{'If-None-Match':tag}})).status(),304);
  await edit(hidden.id,{summary:'Still private'});
  assert.equal((await player.request.get(base+'/api/work',{headers:{'If-None-Match':tag}})).status(),304,'Private edits must not invalidate another player’s snapshot');
  const dmTag=(await dm.request.get(base+'/api/work')).headers().etag;
  const privateCheck=await player.request.get(base+'/api/work',{headers:{'If-None-Match':dmTag}});assert.equal(privateCheck.status(),200);assert(!(await privateCheck.text()).includes('DM private secret'));
  const p=await player.newPage(),d=await dm.newPage(),errors=[];for(const page of [p,d]){page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.stack));await page.goto(base);await page.locator('.campaign-row').filter({hasText:campaign.title}).click();}
  let navigations=0;p.on('framenavigated',frame=>{if(frame===p.mainFrame())navigations++;});
  await p.bringToFront();await p.locator('#inventoryPreview').getByRole('button',{name:'View Live torch',exact:true}).click();
  await p.locator('#detailNotes').fill('Unsaved personal note');
  // Save through the actual DM editor while the player keeps a card open.
  await d.locator('#realmMenuButton').click();await d.locator('#realmSidebar [data-record-type=item]').click();await d.locator('#recordSearch').fill('Live torch');
  await d.locator('.work-card').filter({hasText:'Live torch'}).click();await d.locator('#detailEditButton').click();
  await d.locator('#workForm [name=title]').fill('Torch of live updates');await d.locator('#workForm [name=summary]').fill('Changed while the player is reading');await d.locator('#workForm [name=quantity]').fill('7');
  const started=Date.now();await d.locator('#workForm button[type=submit]').click();await d.locator('#workModal').waitFor({state:'hidden'});await p.bringToFront();
  await p.waitForFunction(()=>document.querySelector('#detailTitle').textContent==='Torch of live updates');
  assert.equal(await p.locator('#detailDescription').textContent(),'Changed while the player is reading');assert.equal(await p.locator('#detailNotes').inputValue(),'Unsaved personal note');
  assert.equal(await p.locator('#recordDetailModal').isVisible(),true);assert(Date.now()-started<6000);
  await p.locator('#recordDetailModal [data-bs-dismiss]').first().click();
  await p.locator('#inventoryPreview').getByRole('button',{name:'View Torch of live updates',exact:true}).waitFor();assert.equal(await p.locator('#inventoryCount').textContent(),'7');
  // A different editor must not pause live updates or overwrite an unsaved draft.
  await p.locator('#partyScroll .party-card').filter({hasText:'Elara'}).click();await p.locator('#detailEditButton').click();await p.locator('#workForm [name=title]').fill('My unsaved character name');
  await edit(item.id,{quantity:8});await p.waitForFunction(()=>document.querySelector('#inventoryCount').textContent==='8');assert.equal(await p.locator('#workForm [name=title]').inputValue(),'My unsaved character name');
  await p.locator('#workModal [data-bs-dismiss]').first().click();
  await p.locator('#workModal').waitFor({state:'hidden'});
  assert.equal((await records(dm)).find(r=>r.id===hero.id).title,hero.title,'Closing an editor must not submit the draft');
  await p.locator('#realmMenuButton').click();await p.locator('#realmSidebar [data-record-type=item]').click();await p.locator('#recordSearch').fill('Torch of live updates');
  await edit(item.id,{},'Torch of live updates II');await p.locator('#workList h3').filter({hasText:'Torch of live updates II'}).waitFor();
  const campaignName='Live campaign '+Date.now();await edit(campaign.id,{},campaignName);await p.waitForFunction(name=>document.querySelector('#activeCampaignName').textContent===name,campaignName);
  // Revoking a grant removes both the live card and an already-open detail view.
  await p.locator('#workList h3').filter({hasText:'Torch of live updates II'}).click();await p.locator('#recordDetailModal').waitFor({state:'visible'});
  await edit(item.id,{owner_ids:[]});await p.locator('#recordDetailModal').waitFor({state:'hidden'});await p.waitForFunction(()=>document.querySelector('#inventoryCount').textContent==='0');assert.equal(await p.locator('#workList .work-card').count(),0);
  assert.equal(navigations,0,'All updates must arrive without a page reload');assert.deepEqual(errors,[]);
  await edit(campaign.id,{},campaign.title);
  console.log('PASS live DM edits, open card refresh, inventory, archives, campaign title, draft/notes preservation, revoked access and private conditional responses without reloading.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
