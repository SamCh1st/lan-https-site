const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1600,height:1050}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.route('https://spell.test/',r=>r.fulfill({contentType:'text/html',body:'<main id="campaignDashboard"></main>'}));await page.goto('https://spell.test/');await page.addStyleTag({path:'site/spell-atelier.css'});
  for(const f of ['spell-symbols','spell-engine','spell-equations','spell-preview','spell-atelier'])await page.addScriptTag({path:'site/'+f+'.js'});
  let campaign=0;
  for(const name of ['sparse','compact']){
   const nodes=JSON.parse(fs.readFileSync('tests/'+name+'-layout-preview.json','utf8'));campaign++;
   await page.evaluate(({nodes,campaign})=>{localStorage.setItem('spell-atelier:v1:1:'+campaign,JSON.stringify({nodes}));SpellAtelier.setActive(true,campaign,1);},{nodes,campaign});
   await page.locator('#saTheme').selectOption('dark');
   if(campaign===1)await page.locator('#saFullscreen').click();
   await page.locator('#saZoomFit').click();
   assert.equal(await page.locator('#saDrawing .sa-node').count(),nodes.length);
   await page.locator('#spellAtelierCanvas').screenshot({path:'tests/'+name+'-layout.png'});
  }
  assert.deepEqual(errors,[]);console.log('Sparse and compact layouts rendered at fitted fullscreen scale.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
