const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:1000}}),base='https://127.0.0.1:8770';
  await context.request.post(base+'/api/login',{data:{username:'Player',password:'Test password 12345'}});
  const items=(await(await context.request.get(base+'/api/work')).json()).items,pc=items.find(r=>r.title==='Elara'),campaign=items.find(r=>r.content.category==='campaign');
  const endpoint=base+'/api/campaign/'+campaign.id,mem=endpoint+'/characters/'+pc.id+'/memory';
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.goto(base);await page.locator('.campaign-row').filter({hasText:campaign.title}).click();await page.locator('#partyScroll .party-card').filter({hasText:'Elara'}).click();
  const modal=page.locator('#recordDetailModal'),memory=page.locator('#detailMemoryPage');
  await page.locator('#detailFront').waitFor({state:'visible'});assert(await page.locator('#detailFront').isVisible());assert(!(await memory.isVisible()));
  await page.locator('#detailMemoryToggle').click();await memory.getByLabel('Character description, personality & roleplay guidelines').fill('Elara has silver hair. She is compassionate but cautious. She values honesty and speaks softly.');
  await memory.getByLabel('Character reminder note').fill('Listen before making promises. Use the actual names of the people speaking.');
  await memory.getByRole('button',{name:'Save character guidance',exact:true}).click();await memory.locator('.memory-error').filter({hasText:'Saved.'}).waitFor();
  const add=memory.locator('.memory-add');await add.locator('summary').click();await add.getByLabel('Memory',{exact:true}).fill('Elara keeps the observatory key beneath a blue tile.');await add.getByLabel('Keep at the front of recall').check();await add.getByRole('button',{name:'Add memory',exact:true}).click();
  let state=await(await context.request.get(mem)).json();assert.equal(state.memories.length,1);assert(state.memories[0].pinned);assert.match(state.profile.reminder,/actual names/);
  await page.locator('#detailMemoryToggle').click();assert(await page.locator('#detailFront').isVisible());assert(await page.locator('#detailSaveNotes').isVisible());await modal.locator('[data-bs-dismiss=modal]').click();
  await context.request.post(endpoint+'/ai/message',{data:{persona_type:'character',persona_id:pc.id,message:'I promise to bring medicine to Mara tomorrow.',addressed_to_ai:true}});
  const response=await context.request.post(endpoint+'/ai/respond',{data:{reply_as_type:'character',reply_as_id:pc.id},timeout:30000});assert.equal(response.status(),201,await response.text());
  state=await(await context.request.get(mem)).json();assert(state.memories.some(m=>m.kind==='goal'&&m.evidence.length));
  await page.locator('#partyScroll .party-card').filter({hasText:'Elara'}).click();await page.locator('#detailMemoryToggle').click();
  await memory.getByLabel('Search memories').fill('medicine');const learned=memory.locator('.memory-list .memory-entry');assert.equal(await learned.count(),1);await learned.locator('summary').first().click();
  await learned.getByLabel('Memory',{exact:true}).fill('Elara already delivered the medicine to Mara.');await learned.getByRole('button',{name:'Save memory',exact:true}).click();
  await memory.locator('.memory-error').filter({hasText:'Saved.'}).waitFor();
  state=await(await context.request.get(mem)).json();assert(state.memories.some(m=>m.manual&&m.text.includes('already delivered')));
  await memory.getByLabel('Search memories').fill('observatory');const forgotten=memory.locator('.memory-list .memory-entry');await forgotten.locator('summary').first().click();await forgotten.getByRole('button',{name:'Forget',exact:true}).click();
  await memory.locator('.memory-error').filter({hasText:'Saved.'}).waitFor();
  await page.setViewportSize({width:390,height:844});await memory.getByLabel('Search memories').fill('');
  assert(await memory.evaluate(el=>el.scrollWidth<=el.clientWidth+2));await page.screenshot({path:'tests/artifacts/character-memory-mobile.png'});
  const other=await browser.newContext({ignoreHTTPSErrors:true});await other.request.post(base+'/api/login',{data:{username:'Other',password:'Test password 12345'}});assert.equal((await other.request.get(mem)).status(),403);
  assert.deepEqual(errors,[]);console.log('PASS: character page flip, description and reminder persistence, automatic learning, evidence, correction, forget, search, mobile layout, private memory access.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
