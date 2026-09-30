const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1440,height:1100}}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 try{
  const base='https://127.0.0.1:8767';await page.goto(base);await page.request.post(base+'/api/login',{data:{username:'DicePlayerQA',password:'Tabletop-QA-12345'}});await page.reload();
  async function open(){await page.getByText('Dice QA Normal',{exact:true}).click();await page.locator('#realmMenuButton').click();await page.locator('#spellAtelierButton').click();}
  await open();await page.locator('#saTheme').selectOption('dark');
  assert.equal(await page.locator('#spellAtelier').getAttribute('data-theme'),'dark');
  await page.locator('#saSignSearch').fill('cooling');assert.equal(await page.locator('#saSigns .sa-symbol:visible').count(),1);
  await page.locator('[data-symbol="cooling"]').focus();await page.keyboard.press('Enter');
  assert.match(await page.locator('#saSelectedHint').innerText(),/inferred/);assert.match(await page.locator('#saSymbolSource').getAttribute('href'),/#Cooling/);
  await page.locator('#saSignSearch').fill('');await page.locator('[data-example="fire:levitation"]').click();
  await page.locator('#saZoomFit').click();
  assert.ok(Number((await page.locator('#saZoom').innerText()).replace('%',''))<200);
  await page.locator('#saCast').click();await page.locator('#saPreviewPause').click();
  async function scrub(value){return page.evaluate(value=>{const slider=document.getElementById('saPreviewTime');slider.value=value;slider.dispatchEvent(new Event('input'));return document.getElementById('saEffects').innerHTML;},value);}
  const first=await scrub('1.25');await scrub('2.5');assert.equal(await scrub('1.25'),first);
  assert.match(await page.locator('#saPreviewMath').innerText(),/A =/);
  assert.equal(await page.locator('#saEffects circle').count(),64);
  await page.locator('#saPreviewDetails > summary').click();
  assert.equal(await page.locator('#saPreviewDetails').evaluate(e=>e.open),false);
  assert.ok(await page.locator('#saPreviewTime').isVisible());
  assert.ok(await page.locator('#saPreviewClock').isVisible());
  await page.locator('#saPreviewLoop').check();await scrub('9.9');await page.locator('#saPreviewPause').click();
  await page.waitForFunction(()=>Number(document.getElementById('saPreviewTime').value)<2);
  assert.equal(await page.locator('#saPreviewPause').innerText(),'Pause');
  await page.locator('#saPan').click();
  const canvas=page.locator('#spellAtelierCanvas');
  const bounds=await canvas.boundingBox();
  await page.mouse.move(bounds.x+100,bounds.y+100);await page.mouse.down();await page.mouse.move(bounds.x+150,bounds.y+140,{steps:5});await page.mouse.up();
  await page.mouse.wheel(0,-100);
  assert.ok(await page.locator('#saPreviewClock').isVisible());
  assert.equal(await page.locator('#saStop').isDisabled(),false);
  assert.equal(await page.locator('#saEffects circle').count(),64);
  const before=Number(await page.locator('#saPreviewTime').inputValue());
  await page.waitForFunction(before=>Number(document.getElementById('saPreviewTime').value)>before,before);
  await page.locator('#saPreviewLoop').uncheck();await scrub('9.9');await page.locator('#saPreviewPause').click();
  await page.waitForFunction(()=>document.getElementById('saPreviewPause').textContent==='Play');
  assert.equal(Number(await page.locator('#saPreviewTime').inputValue()),10);
  await page.locator('#spellAtelier').screenshot({path:'tests/spell-dark-preview.png'});
  await page.reload();await open();assert.equal(await page.locator('#saTheme').inputValue(),'dark');
  await page.locator('#saTheme').selectOption('site');await page.evaluate(()=>document.documentElement.dataset.theme='dark');assert.equal(await page.locator('#spellAtelier').getAttribute('data-theme'),'dark');
  await page.evaluate(()=>document.documentElement.dataset.theme='normal');assert.equal(await page.locator('#spellAtelier').getAttribute('data-theme'),'light');
  await page.locator('#saTheme').selectOption('dark');await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#spellAtelier').screenshot({path:'tests/spell-dark-mobile.png'});
  assert.deepEqual(errors,[]);console.log('Dark theme, persistence, site theme, searchable symbols, sources, deterministic time scrub and mobile passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});


