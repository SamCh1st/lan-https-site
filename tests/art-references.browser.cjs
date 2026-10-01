const {chromium}=require(process.env.TABLETOP_PLAYWRIGHT||'C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://art.test/',r=>r.fulfill({contentType:'text/html',body:'<div id="campaignDashboard"></div>'}));
  await page.goto('https://art.test/');await page.addStyleTag({path:'site/art-atelier.css'});await page.addScriptTag({path:'site/map-image-picker.js'});await page.addScriptTag({path:'site/art-atelier.js'});
  const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFioAAAAASUVORK5CYII=','base64');
  await page.route('**/api/uploads/*',r=>r.fulfill({contentType:'image/png',body:image}));
  await page.evaluate(()=>ArtAtelier.setActive(true,1,1,{referenceRecords:[{title:'Silver armor',content:{image_id:42}}]}));
  await page.locator('.aa-generation > summary').click();
  await page.locator('#aaReferencePicker summary').click();await page.locator('#aaReferencePicker button').filter({hasText:'Silver armor'}).click();
  await page.locator('#aaReferenceList textarea').fill('Use this armor');
  await page.route('**/api/upload',r=>r.fulfill({contentType:'application/json',body:'{"image_id":43}'}));
  await page.locator('#aaReferenceImport').setInputFiles({name:'pose.png',mimeType:'image/png',buffer:image});
  await page.waitForFunction(()=>document.querySelectorAll('.aa-reference-card').length===2);
  assert.equal(await page.locator('#aaArt image').count(),0);
  let requests=0;
  await page.route('**/art/design',r=>{
   const data=r.request().postDataJSON();requests++;assert.deepEqual(data.image_references.map(x=>x.image_id),[42,43]);assert.equal(data.image_references[0].note,'Use this armor');assert.equal(data.use_helpers,false);
   return r.fulfill({contentType:'application/x-ndjson',body:'{"event":"image_reference","index":0,"description":"Silver armor with blue trim."}\n{"event":"done","result_kind":"image"}\n'});
  });
  await page.locator('#aaPrompt').fill('A knight wearing the armor, using the pose');await page.locator('#aaGenerate').click();
  await page.waitForFunction(()=>!document.querySelector('#aaGenerate').disabled);
  assert.equal(requests,1);assert.match(await page.locator('.aa-reference-description').first().textContent(),/blue trim/);
  await page.locator('#aaRenderer').selectOption('vector');await page.locator('#aaGenerate').click();assert.equal(requests,1);assert.match(await page.locator('#aaAIStatus').textContent(),/Local image model/);
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'tests/artifacts/art-references-mobile.png',fullPage:true});
  await page.locator('.aa-reference-card button').first().click();assert.equal(await page.locator('.aa-reference-card').count(),1);
  await page.evaluate(()=>ArtAtelier.setActive(true,2,1,{}));assert.equal(await page.locator('.aa-reference-card').count(),0);
  assert.deepEqual(errors,[]);console.log('Reference import, campaign selection, notes, analysis display, renderer guard, mobile layout and campaign isolation passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
