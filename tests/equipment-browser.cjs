require('./python-path.cjs');
const {chromium}=require(process.env.TABLETOP_PLAYWRIGHT || 'C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
  const python=process.env.TABLETOP_PYTHON || path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
  const child=spawn(python,[path.join(__dirname,'equipment_preview.py')],{windowsHide:true});
  let browser;
  try {
    const fixture=await new Promise((resolve,reject)=>{
      let output='';const timer=setTimeout(()=>reject(Error('Fixture did not start')),20000);
      child.stdout.on('data',buf=>{output+=buf;const line=output.split('\n').find(x=>x.startsWith('{'));if(line){clearTimeout(timer);resolve(JSON.parse(line));}});
      child.on('error',reject);child.on('exit',code=>{if(code)reject(Error('Fixture exited '+code));});
      child.stderr.on('data',buf=>{if(String(buf).includes('Traceback'))console.error(String(buf));});
    });
    browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    const ctx=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
    const base='https://127.0.0.1:'+fixture.port;
    assert.equal((await ctx.request.post(base+'/api/login',{data:{username:'EquipmentPlayer',password:'Equipment-QA-12345'}})).status(),200);
    const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.stack));
    p.on('requestfailed',r=>console.log('Request failed:',r.url(),r.failure()?.errorText));
    await p.goto(base);await p.locator('.campaign-row').filter({hasText:'Equipment test'}).click();
    const panel=p.locator('#inventoryPreview .equipment-panel');await panel.getByText('Equipment Hero · Equipment').waitFor();
    const card=name=>panel.locator('.equipment-item').filter({has:p.locator('strong').filter({hasText:new RegExp('^'+name+'$')})});
    await card('Greatsword').getByRole('button',{name:'Equip',exact:true}).click();
    await card('Greatsword').getByText('Equipped · Both hands',{exact:true}).waitFor();
    assert(await card('Shield').getByRole('button',{name:'Equip',exact:true}).isDisabled());
    assert.match(await card('Shield').textContent(),/Unequip Greatsword/);
    await p.reload();await p.locator('.campaign-row').filter({hasText:'Equipment test'}).click();
    await card('Greatsword').getByText('Equipped · Both hands',{exact:true}).waitFor();
    await card('Greatsword').getByRole('button',{name:'Unequip Greatsword',exact:true}).click();
    await card('Shield').getByRole('button',{name:'Equip',exact:true}).click();
    await card('Shield').getByText('Equipped · Off hand',{exact:true}).waitFor();
    assert.match(await panel.locator('.equipment-summary').textContent(),/Equipment AC 14/);
    await card('Plate').getByRole('checkbox').check();
    await card('Plate').getByRole('button',{name:'Equip with listed penalties'}).click();
    await card('Plate').getByText('Equipped · Body',{exact:true}).waitFor();
    assert.match(await panel.locator('.equipment-summary').textContent(),/Equipment AC 20/);
    const out=path.join(__dirname,'artifacts','equipment');fs.mkdirSync(out,{recursive:true});
    await panel.locator('.equipment-summary').scrollIntoViewIfNeeded();await p.locator('.inventory-rail').screenshot({path:path.join(out,'desktop.png')});
    await p.setViewportSize({width:390,height:844});await panel.scrollIntoViewIfNeeded();
    await panel.locator('.equipment-summary').scrollIntoViewIfNeeded();await p.locator('.inventory-rail').screenshot({path:path.join(out,'mobile.png')});
    assert(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Equipment panel must not overflow horizontally');
    assert.deepEqual(errors,[]);
    console.log('Equipment browser passed: authenticated player, equip, blocked hands, reload persistence, unequip, shield/armor AC, desktop and mobile layout.');
  } finally {if(browser)await browser.close();child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
