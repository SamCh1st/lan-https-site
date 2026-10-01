const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:1000}}),base='https://127.0.0.1:8770';
  await context.request.post(base+'/api/login',{data:{username:'Player',password:'Test password 12345'}});
  const records=(await(await context.request.get(base+'/api/work')).json()).items,campaign=records.find(r=>r.content.category==='campaign');
  const endpoint=base+'/api/campaign/'+campaign.id+'/ai';
  const original='Before **important** <image>a blue cup</image> my name is';
  await context.request.post(endpoint+'/message',{data:{message:original,persona_type:'dm',addressed_to_ai:true}});
  const messages=(await(await context.request.get(endpoint)).json()).messages,id=messages.at(-1).id;
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('.campaign-row').filter({hasText:campaign.title}).click();
  const card=page.locator('.ai-message[data-message-id="'+id+'"]');
  await card.locator('.chat-art img').waitFor();
  await card.locator('.ai-message-text').last().dblclick();
  const draft=card.locator('.chat-message-draft');assert.equal(await draft.inputValue(),original);
  assert.equal(await card.locator('.chat-art').count(),0);
  await draft.evaluate(el=>el.setSelectionRange(2,2));
  await card.getByRole('button',{name:'Auto-complete',exact:true}).click();
  await page.waitForFunction(id=>document.querySelector('[data-message-id="'+id+'"] textarea')?.value.endsWith('old mill.'),id);
  assert.equal(await draft.inputValue(),original+' Harold. I live near the old mill.');
  let saved=(await(await context.request.get(endpoint)).json()).messages.find(m=>m.id===id);assert.equal(saved.message,original);
  await card.getByRole('button',{name:'Undo completion',exact:true}).click();assert.equal(await draft.inputValue(),original);
  await draft.fill('Before **important** <image>a green cup</image> After');
  // A new message forces the polled log to redraw while this draft remains intact.
  await context.request.post(endpoint+'/message',{data:{message:'Refresh trigger',persona_type:'dm',addressed_to_ai:true}});
  await page.locator('.ai-message').filter({hasText:'Refresh trigger'}).waitFor();
  assert.equal(await draft.inputValue(),'Before **important** <image>a green cup</image> After');
  await card.getByRole('button',{name:'Save',exact:true}).click();
  await card.locator('.chat-art img').waitFor();
  assert.equal(await card.locator('.chat-message-draft').count(),0);
  const order=await card.locator('.ai-message-copy').evaluate(el=>[...el.children].map(e=>e.tagName));assert.deepEqual(order,['P','FIGURE','P']);
  await card.locator('[data-ai-message-action=edit]').click();await draft.fill('unsaved');await card.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.match(await card.innerText(),/After/);
  await page.setViewportSize({width:390,height:844});await card.locator('[data-ai-message-action=edit]').click();
  assert(await draft.evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
  await page.getByRole('button',{name:'Fullscreen chat',exact:true}).click();
  await draft.scrollIntoViewIfNeeded();
  await page.screenshot({path:'tests/artifacts/chat-inline-editor.png'});
  assert.deepEqual(errors,[]);console.log('PASS: raw inline editing, append regardless of cursor, undo, draft-only completion, polling preservation, prompt regeneration, cancel, mobile containment.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
