const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://art.test/',r=>r.fulfill({contentType:'text/html',body:'<div id="campaignDashboard"></div>'}));
  await page.goto('https://art.test/');await page.addScriptTag({path:'site/art-atelier.js'});
  await page.evaluate(()=>ArtAtelier.setActive(true,1,1,{}));
  await page.locator('.aa-generation > summary').click();assert.equal(await page.locator('#aaRenderer').inputValue(),'local-image');
  const image=fs.readFileSync('tests/local-art-cat.png');
  await page.route('**/api/uploads/41',r=>r.fulfill({contentType:'image/png',body:image}));
  let calls=0,uploads=0;
  await page.route('**/api/upload',r=>{uploads++;assert.equal(r.request().headers()['content-type'],'image/png');assert.ok(r.request().postDataBuffer().length>1000);return r.fulfill({contentType:'application/json',body:'{"image_id":17}'});});
  await page.route('**/art/design',r=>{const p=r.request().postDataJSON();calls++;assert.equal(p.renderer,'local-image');if(calls===2){assert.equal(p.edit,true);assert.equal(p.source_image_id,17);}return r.fulfill({contentType:'application/x-ndjson',body:'{"event":"image","image_id":41}\n{"event":"done","result_kind":"image"}\n'});});
  await page.locator('#aaPrompt').fill('a cat');await page.locator('#aaGenerate').click();
  await page.waitForFunction(()=>document.querySelector('#aaAIStatus').textContent.includes('1 image layer'));
  assert.equal(await page.locator('#aaArt image').count(),1);
  await page.locator('#aaAppend').check();await page.locator('#aaPrompt').fill('a purple cushion');await page.locator('#aaGenerate').click();
  await page.waitForFunction(()=>!document.querySelector('#aaGenerate').disabled);
  assert.equal(uploads,1);assert.equal(calls,2);assert.equal(await page.locator('#aaArt image').count(),1);
  await page.locator('#aaUndo').click();assert.equal(await page.locator('#aaArt image').count(),1);
  await page.locator('#aaUndo').click();assert.equal(await page.locator('#aaArt image').count(),0);
  await page.unroute('**/art/design');await page.route('**/art/design',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"Local image models unavailable"}'}));
  await page.locator('#aaAppend').uncheck();await page.locator('#aaGenerate').click();await page.waitForFunction(()=>document.querySelector('#aaAIStatus').textContent.includes('unchanged'));
  assert.deepEqual(errors,[]);console.log('Local image display, reference upload, replacement, undo and failure preservation passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
