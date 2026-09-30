const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.route('https://spell.test/',r=>r.fulfill({contentType:'text/html',body:'<main id="campaignDashboard"></main>'}));await page.goto('https://spell.test/');
  await page.addStyleTag({path:'site/spell-atelier.css'});for(const f of ['spell-symbols','spell-engine','spell-equations','spell-preview','spell-atelier'])await page.addScriptTag({path:'site/'+f+'.js'});
  await page.evaluate(()=>SpellAtelier.setActive(true,1,1));
  const nodes=[{id:'s0',type:'ring',x:0,y:0,w:6000,h:6000,rotation:0},...Array.from({length:899},(_,i)=>({id:'s'+(i+1),type:'column',x:(i%30-15)*60,y:(Math.floor(i/30)-15)*60,w:30,h:30,rotation:0}))];
  await page.route('**/spells/design',async r=>{
   assert.equal(r.request().postDataJSON().target_parts,900);
   const events=[{event:'status',total_steps:nodes.length,message:'Drawing large test layout'},...nodes.map(node=>({event:'step',action:'add',node})),{event:'done',nodes,summary:{name:'Large drawing',sources:[]}}];
   await r.fulfill({contentType:'application/x-ndjson',body:events.map(e=>JSON.stringify(e)).join('\n')+'\n'});
  });
  assert.equal(await page.locator('#saDetailTarget').inputValue(),'600');await page.locator('#saDetailTarget').selectOption('900');
  await page.locator('#saDesignPrompt').fill('An intricate spell');await page.locator('#saDesign').click();
  await page.waitForFunction(()=>document.getElementById('saDesignStatus').textContent.includes('Drawing complete'),null,{timeout:90000});
  assert.equal(await page.locator('#saDrawing .sa-node').count(),900);
  assert.match(await page.locator('#saDesignStatus').innerText(),/900 components/);
  await page.locator('#saUndo').click();assert.equal(await page.locator('#saDrawing .sa-node').count(),899);
  await page.locator('#saRedo').click();assert.equal(await page.locator('#saDrawing .sa-node').count(),900);
  assert.deepEqual(errors,[]);console.log('900-component streamed drawing, target selection, saving and undo/redo passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
