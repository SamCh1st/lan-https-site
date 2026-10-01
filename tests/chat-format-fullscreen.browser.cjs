const {chromium}=require(process.env.TABLETOP_PLAYWRIGHT||'C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:1000}});
  await context.request.post('https://127.0.0.1:8770/api/login',{data:{username:'Player',password:'Test password 12345'}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://127.0.0.1:8770');await page.locator('.campaign-row').filter({hasText:'Chat test'}).click();
  const cases=[
    ['`A letter *I miss you* and **come home**.`','A letter I miss you and come home.','.chat-style-written .chat-style-thought'],
    ['*outer **inner** outer*','outer inner outer','.chat-style-thought .chat-style-emphasis'],
    ['**outer *inner***','outer inner','.chat-style-emphasis .chat-style-thought'],
    ['#An action with \'a whisper\' inside#','An action with a whisper inside','.chat-style-scene .chat-style-whisper'],
    ['"Hello" Don\'t change someone\'s name.','Hello Don\'t change someone\'s name.','.chat-style-speech'],
    ['```A book\n*one* and **two**```','A book\none and two','.chat-style-written-block .chat-style-emphasis']
  ];
  for(const [source,expected,selector] of cases){
    const rendered=await page.evaluate(({source,selector})=>{const el=document.createElement('div');ChatFormat.append(el,source);return {text:el.textContent,nested:!!el.querySelector(selector)};},{source,selector});
    assert.equal(rendered.text,expected,source);assert(rendered.nested,source);
  }
  const safe=await page.evaluate(()=>{const el=document.createElement('div');ChatFormat.append(el,'`<img src=x onerror=alert(1)>`');return {text:el.textContent,count:el.querySelectorAll('img').length};});assert.equal(safe.count,0);assert.match(safe.text,/<img/);
  const hidden=await page.evaluate(()=>{
    const cases=['Before <ima','Before <image>private rendering prompt','Before <image>private prompt</image> After'];
    return cases.map(message=>{const host=document.createElement('div');ChatArt.render(host,{message,generation_status:'streaming',art:[]},{text:(el,text)=>ChatFormat.append(el,text,0,true)});return host.textContent;});
  });
  for(const text of hidden){assert(!text.includes('<image>'));assert(!text.includes('<ima'));assert(!text.includes('private prompt'));assert(!text.includes('private rendering prompt'));}
  const enter=page.getByRole('button',{name:'Fullscreen chat',exact:true});await enter.click();
  await page.waitForFunction(()=>document.fullscreenElement?.id==='campaignDashboard');
  assert.equal(await page.locator('#aiChatExtras').getAttribute('open'),null);
  const size=await page.locator('#campaignDashboard').boundingBox();assert(size.width>=1278&&size.height>=998);
  await page.locator('[data-chat-panel=left]').click();assert.equal(await page.locator('[data-chat-panel=left]').getAttribute('aria-expanded'),'false');
  await page.locator('.ai-message [data-ai-message-action=edit]').first().click();await page.locator('.chat-message-draft').waitFor({state:'visible'});
  assert(await page.locator('.chat-message-draft').evaluate(el=>document.fullscreenElement.contains(el)));
  await page.locator('.chat-editor-controls').getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Exit fullscreen',exact:true}).click();await page.waitForFunction(()=>!document.fullscreenElement&&!document.querySelector('.chat-fullscreen'));
  assert.equal(await enter.getAttribute('aria-pressed'),'false');
  // Force native fullscreen rejection to exercise the same fallback used by the map.
  await page.evaluate(()=>document.querySelector('#campaignDashboard').requestFullscreen=async()=>{throw Error('Unavailable');});
  await page.setViewportSize({width:390,height:844});await enter.click();
  await page.waitForFunction(()=>document.querySelector('.chat-fullscreen-fallback'));
  assert.equal(await page.locator('[data-chat-panel=left]').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('[data-chat-panel=right]').getAttribute('aria-expanded'),'false');
  await page.locator('[data-chat-panel=left]').click();assert.equal(await page.locator('[data-chat-panel=left]').getAttribute('aria-expanded'),'true');
  await page.locator('[data-chat-panel=right]').click();assert.equal(await page.locator('[data-chat-panel=left]').getAttribute('aria-expanded'),'false');
  await page.locator('[data-chat-panel=right]').click();
  const box=await page.locator('#aiChatLog').boundingBox();assert(box.height>400&&box.width>300&&box.width<=390);
  await page.screenshot({path:'tests/artifacts/chat-fullscreen-mobile.png'});
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.chat-fullscreen'));
  assert.deepEqual(errors,[]);console.log('PASS: nested styles, hidden delimiters, apostrophes, safe literal text, native fullscreen, panel toggles, modal editing, mobile fallback, Escape restoration.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
