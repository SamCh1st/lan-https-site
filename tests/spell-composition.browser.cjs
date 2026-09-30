const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1440,height:1100}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try {
  const base='https://127.0.0.1:8767';await page.goto(base);
  await page.request.post(base+'/api/login',{data:{username:'DicePlayerQA',password:'Tabletop-QA-12345'}});await page.reload();
  async function open(){await page.getByText('Dice QA Normal',{exact:true}).click();await page.locator('#realmMenuButton').click();await page.locator('#spellAtelierButton').click();}
  await open();await page.locator('#saTheme').selectOption('dark');
  await page.locator('[data-composition="0"]').click();await page.waitForFunction(()=>document.querySelectorAll('#saDrawing > g').length===224);
  await page.locator('#spellAtelier').screenshot({path:'tests/composition-four-seals.png'});
  await page.locator('[data-composition="1"]').click();await page.waitForFunction(()=>document.querySelectorAll('#saDrawing > g').length===325);
  await page.locator('#saCast').click();assert.ok(await page.locator('#saEffects circle').count()>0);
  await page.locator('#spellAtelier').screenshot({path:'tests/composition-linked-array.png'});
  await page.reload();await open();await page.waitForFunction(()=>document.querySelectorAll('#saDrawing > g').length===325);
  await page.evaluate(()=>{document.getElementById('saBuildLog').hidden=false;document.getElementById('saExplanation').hidden=false;document.getElementById('saDesignSummary').textContent='Test explanation';});
  await page.locator('#saExplanation > summary').click();assert.equal(await page.locator('#saExplanation').evaluate(e=>e.open),false);
  await page.locator('#saExplanation > summary').click();assert.equal(await page.locator('#saExplanation').evaluate(e=>e.open),true);
  assert.deepEqual(errors,[]);console.log('224/325-part layouts, preview, persistence and collapsible explanation passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

