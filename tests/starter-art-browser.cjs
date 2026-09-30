const { chromium }=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
  const base='https://127.0.0.1:8766';
  await context.request.post(base+'/api/login',{data:{username:'TabletopQA',password:'Tabletop-QA-12345'}});
  const items=(await (await context.request.get(base+'/api/work')).json()).items;
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
  const result=await page.evaluate(async records=>{
   const starters=records.filter(r=>r.content.source_name==='SRD 5.2.1 · revised fifth edition');
   const urls=starters.map(r=>StarterArt.url(r));
   const failed=[];
   for(const url of new Set(urls)) { const img=new Image();img.src=url;try{await img.decode();}catch{failed.push(url);} }
   const sample=starters[0],legacy=structuredClone(sample);delete legacy.content.default_art;
   return {count:starters.length,missing:urls.filter(u=>!u).length,failed,legacy:StarterArt.url(legacy)===StarterArt.url(sample),custom:StarterArt.url({...sample,content:{...sample.content,image_id:999}})};
  },items);
  assert.equal(result.count,244);assert.equal(result.missing,0);assert.deepEqual(result.failed,[]);assert.ok(result.legacy);assert.equal(result.custom,'/api/uploads/999');
  await page.locator('.campaign-row').filter({hasText:'Dice QA AI'}).click();
  await page.locator('#realmMenuButton').click();
  await page.locator('[data-record-type="item"]').click();
  const sword=items.find(r=>r.title==='Longsword'&&r.content.campaign_id===items.find(c=>c.title==='Dice QA AI').id);
  const card=page.locator('.work-card[data-id="'+sword.id+'"]');await card.scrollIntoViewIfNeeded();await card.locator('img').waitFor();await card.click();
  await page.locator('#detailImage').waitFor({state:'visible'});assert.match(await page.locator('#detailImage').getAttribute('src'),/starter-art/);
  await page.screenshot({path:'tests/artifacts/starter-art-detail.png'});
  await page.locator('#detailEditButton').click();await page.locator('#recordImagePreview img').waitFor({state:'visible'});
  assert.deepEqual(errors,[]);console.log('PASS: 122 cards in each campaign, all images decode, legacy fallback, custom priority, detail and edit preview.');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
