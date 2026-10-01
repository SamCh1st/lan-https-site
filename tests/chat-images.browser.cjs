const {chromium}=require(process.env.TABLETOP_PLAYWRIGHT||'C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:960}});
  const base='https://127.0.0.1:8769', password='Tabletop-QA-12345';
  assert.equal((await context.request.post(base+'/api/login',{data:{username:'TabletopQA',password}})).status(),200);
  const records=(await(await context.request.get(base+'/api/work')).json()).items;
  const campaign=records.find(r=>r.title==='Dice QA AI');
  const image=require('node:fs').readFileSync('tests/artifacts/chat-vision-fixture.png');
  const upload=await(await context.request.post(base+'/api/upload',{headers:{'Content-Type':'image/png'},data:image})).json();
  assert.equal((await context.request.post(base+'/api/work',{data:{title:'Color study',content:{category:'artwork',campaign_id:campaign.id,image_id:upload.image_id,player_visible:true}}})).status(),201);
  const page=await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('.campaign-row').filter({hasText:campaign.title}).click();
  const picker=page.locator('#aiChatImages .map-image-library');
  await picker.locator('summary').click();await picker.locator('input').fill('Color study');await picker.getByRole('button',{name:'Use Color study',exact:true}).first().click();
  assert.equal(await page.locator('#aiChatImages .chat-image-tile').count(),1);
  await page.locator('#aiChatImages input[type=file]').setInputFiles({name:'import.png',mimeType:'image/png',buffer:image});
  await page.waitForFunction(()=>document.querySelectorAll('#aiChatImages .chat-image-tile').length===2);
  await page.locator('#aiChatImages .chat-image-tile button').last().click();
  await page.locator('#aiChatInput').fill('What colors and shapes do you see in the attached image?');
  await page.locator('#aiChatForm button[type=submit]').click();
  const sent=page.locator('.ai-message').filter({hasText:'What colors and shapes'}).last();
  await sent.locator('.chat-message-images img').waitFor();
  assert.equal(await page.locator('#aiChatImages .chat-image-tile').count(),0);
  const inside=await sent.evaluate(el=>{const a=el.getBoundingClientRect(),b=el.querySelector('.chat-message-images img').getBoundingClientRect();return b.left>=a.left&&b.right<=a.right&&b.bottom<=a.bottom;});assert(inside);
  await page.reload();await page.locator('.campaign-row').filter({hasText:campaign.title}).click();await sent.locator('.chat-message-images img').waitFor();
  await sent.locator('[data-ai-message-action=edit]').click();await page.locator('#aiMessageEditImages button').click();await page.locator('#aiMessageModalSubmit').click();
  await page.waitForFunction(()=>!document.querySelector('#aiMessageModal').classList.contains('show'));
  await page.waitForFunction(()=>![...document.querySelectorAll('.ai-message')].filter(e=>e.textContent.includes('What colors and shapes')).some(e=>e.querySelector('.chat-message-images')));
  // An image-only message must save successfully too.
  await page.locator('#aiChatImages input[type=file]').setInputFiles({name:'only.png',mimeType:'image/png',buffer:image});
  await page.waitForFunction(()=>document.querySelectorAll('#aiChatImages .chat-image-tile').length===1);
  await page.locator('#aiChatForm button[type=submit]').click();await page.locator('.ai-message').last().locator('.chat-message-images img').waitFor();
  await page.setViewportSize({width:390,height:844});
  assert(await page.locator('.ai-message').last().evaluate(el=>{const a=el.getBoundingClientRect(),b=el.querySelector('.chat-message-images img').getBoundingClientRect();return b.right<=a.right+1;}));
  await page.screenshot({path:'tests/artifacts/chat-images-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: shared chooser, import, remove draft, send, image-only message, reload, edit removal, contained images on desktop/mobile.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
