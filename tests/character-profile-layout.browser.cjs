const {chromium}=require(process.env.TABLETOP_PLAYWRIGHT||'C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:1000}});
  const page=await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8773');
  await page.locator('.campaign-row').filter({hasText:'Generation QA'}).click();
  const cards=page.locator('#partyScroll .party-card');await cards.first().waitFor();
  for(const width of [1280,390]){
   await page.setViewportSize({width,height:1000});
   const sizes=await cards.evaluateAll(nodes=>nodes.map(n=>({height:n.getBoundingClientRect().height,summary:n.querySelector('small').getBoundingClientRect().height})));
   assert.equal(sizes.length,2);
   for(const size of sizes){assert.equal(size.height,156);assert(size.summary<70);}
   await page.locator('.party-shelf').screenshot({path:`tests/artifacts/party-cards-${width}.png`});
  }
  await page.setViewportSize({width:1280,height:1000});
  await page.locator('[data-generate-record=character]').click();
  await page.locator('#characterGenerationPrompt').fill('A practical city mechanic.');
  await page.locator('#generateCharacterButton').click();
  await page.waitForFunction(()=>document.querySelector('#characterGenerationStatus').textContent.includes('Draft ready'));
  const core=await page.locator('#generatedCharacterCore').inputValue();
  assert.equal(await page.locator('#workForm [name=title]').inputValue(),'Nadia Park');
  for(const heading of ['Visual Description','Personality','Roleplay Behavior Examples'])assert(core.includes(`# Nadia Park ${heading}:`));
  assert.equal(core.split('\n').filter(line=>/^\d\. /.test(line)).length,5);assert(!core.includes('{{'));
  await page.locator('#workModal [data-bs-dismiss=modal]').first().click();
  await page.locator('#workModal').waitFor({state:'hidden'});
  await cards.filter({hasText:'Léon Dumont'}).click();await page.locator('#detailMemoryToggle').click();
  const memory=page.locator('#detailMemoryPage');
  await memory.getByText('Draft character guidance with AI',{exact:true}).click();
  await memory.getByRole('button',{name:'Generate guidance draft',exact:true}).click();
  await memory.locator('.memory-error').filter({hasText:'Draft ready'}).waitFor();
  const guidance=memory.getByLabel('Character description, personality & roleplay guidelines');
  assert((await guidance.inputValue()).startsWith('# Léon Dumont Visual Description:'));
  assert.equal(await guidance.getAttribute('rows'),'14');
  await guidance.screenshot({path:'tests/artifacts/named-character-profile.png'});
  const visible=await page.evaluate(()=>{
   const text='"What changed? — paragraph 2”}]} 158 words. Adding gentle sarcasm.';
   function render(role,message){const host=document.createElement('div');ChatArt.render(host,{role,message,art:[]},{text:(el,value)=>ChatFormat.append(el,value)});return host.textContent;}
   return {ai:render('assistant',text),user:render('user',text),literal:ChatFormat.cleanGenerated('`'+text+'`')};
  });
  assert(!visible.ai.includes('paragraph 2'));assert(!visible.ai.includes('158 words'));
  assert(visible.user.includes('158 words'));assert(visible.literal.includes('158 words'));
  await page.locator('#recordDetailModal [data-bs-dismiss=modal]').first().click();
  await page.locator('#recordDetailModal').waitFor({state:'hidden'});
  const records=(await(await context.request.get('http://127.0.0.1:8773/api/work')).json()).items;
  const campaign=records.find(r=>r.content.category==='campaign'), character=records.find(r=>r.title==='Léon Dumont');
  const posted=await context.request.post(`http://127.0.0.1:8773/api/campaign/${campaign.id}/ai/message`,{data:{persona_type:'character',persona_id:character.id,message:'Image completion check.',addressed_to_ai:false}});
  assert.equal(posted.status(),201,await posted.text());
  await page.reload();await page.locator('.campaign-row').filter({hasText:'Generation QA'}).click();
  await page.locator('.ai-message').filter({hasText:'Image completion check.'}).dblclick();
  const editor=page.locator('.ai-message-editing'), raw=editor.getByLabel('Edit raw message');
  await raw.fill('A picture of the studio. <image>');
  await editor.getByRole('button',{name:'Auto-complete',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.chat-message-draft')?.value.endsWith('</image>'));
  assert.equal(await raw.inputValue(),'A picture of the studio. <image>A quiet studio with a rain-streaked window, soft evening light.</image>');
  await editor.getByRole('button',{name:'Undo completion',exact:true}).click();
  assert.equal(await raw.inputValue(),'A picture of the studio. <image>');
  await editor.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.deepEqual(errors,[]);
  console.log('PASS: fixed desktop/mobile party cards, named structured profiles and clean names, existing AI artifact cleanup, and double-click image completion with undo.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
