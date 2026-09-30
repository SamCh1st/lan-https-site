const {chromium}=require(process.env.TABLETOP_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1100}});
 const base=process.env.MAP_TEST_BASE||'https://127.0.0.1:8766';
 assert.equal((await context.request.post(base+'/api/login',{data:{username:'DicePlayerQA',password:'Tabletop-QA-12345'}})).status(),200);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
 for(const campaign of ['Normal','AI']){
   await page.goto(base);await page.locator('.campaign-row').filter({hasText:'Dice QA '+campaign}).click();
   if(campaign==='AI'){await page.locator('#aiSpeakerButton').click();await page.locator('#aiSpeakerMenu button').filter({hasText:'Elara'}).click();}
   const rail=page.locator('.inventory-rail');await rail.waitFor({state:'visible'});
   assert.match(await page.locator('#railDiceCharacter').textContent(),/Elara/);
   await page.locator('#inventoryDiceToggle').click();assert.equal(await page.locator('#inventoryDiceToggle').getAttribute('aria-expanded'),'true');
   await page.locator('#railDieStat').selectOption('skill:Stealth');assert.match(await page.locator('#railDieBonus').textContent(),/= \+7/);
   await page.locator('#railDieMode').selectOption('advantage');await page.locator('#railDie').click();
   const result=Number((await page.locator('#railDieResult').textContent()).replace('Total ',''));assert(result>=8&&result<=27);assert.match(await page.locator('#railDieBreakdown').textContent(),/advantage/);
   await page.locator('#railDieMode').selectOption('disadvantage');await page.locator('#railDie').click();assert.match(await page.locator('#railDieBreakdown').textContent(),/disadvantage/);
   const shape=await page.locator('#railDieOutline').getAttribute('d');
   await page.locator('#railDiceAdd').click();await page.locator('#railDiceAdditional input').fill('2');await page.locator('#railDie').click();
   const mixed=await page.locator('#railDieBreakdown').textContent();
   assert.match(mixed,/1d20 \[\d+, \d+\] → \d+/);assert.match(mixed,/2d4 \[\d+, \d+\]/);
   const groups=Array.from(mixed.matchAll(/\[([^\]]+)\]/g),m=>m[1].split(', ').map(Number));
   assert.equal(await page.locator('#railDieResult').textContent(),'Total '+(Math.min(...groups[0])+7+groups[1].reduce((a,b)=>a+b,0)));
   await page.locator('#railDiceAdditional input').fill('100');await page.locator('#railDie').click();assert.match(await page.locator('#railDieError').textContent(),/no more than 100/);
   await page.locator('#railDiceAdditional button').click();assert.equal(await page.locator('#railDiceAdditional input').count(),0);
   for(const sides of [4,6,8,10,12,100]){await page.locator('#railDieType').selectOption(String(sides));assert(await page.locator('#railDieMode').isDisabled());await page.locator('#railDie').click();const n=Number(await page.locator('#railDieFace').textContent());assert(n>=1&&n<=sides);assert.equal(await page.locator('#railDieResult').textContent(),'Total '+n);}
   assert.notEqual(await page.locator('#railDieOutline').getAttribute('d'),shape);
   await page.locator('#railDieExtra').fill('3');await page.locator('#railDie').click();assert.equal(Number((await page.locator('#railDieResult').textContent()).replace('Total ','')),Number(await page.locator('#railDieFace').textContent())+3);
   await page.locator('#railDieType').selectOption('6');
   await page.locator('#railDieCount').fill('8');await page.locator('#railDie').click();
   const faces=(await page.locator('#railDieBreakdown').textContent()).match(/\[([^\]]+)\]/)[1].split(', ').map(Number);
   assert.equal(faces.length,8);assert(faces.every(n=>n>=1&&n<=6));
   assert.equal(await page.locator('#railDieResult').textContent(),'Total '+(faces.reduce((a,b)=>a+b,0)+3));
   for(const invalid of ['0','101','1.5','']){await page.locator('#railDieCount').fill(invalid);await page.locator('#railDie').click();assert.match(await page.locator('#railDieError').textContent(),/between 1 and 100/);}
   await page.locator('#railDieCount').fill('100');await page.locator('#railDie').click();assert.equal((await page.locator('#railDieBreakdown').textContent()).match(/\[([^\]]+)\]/)[1].split(', ').length,100);
   await page.locator('#railDieType').selectOption('20');assert(await page.locator('#railDieMode').isDisabled());assert(await page.locator('#railDieStat').isDisabled());
   await page.locator('#railDieCount').fill('1');await page.locator('#railDieCount').blur();
   assert(await page.locator('#railDieMode').isEnabled());await page.locator('#railDieStat').selectOption('skill:Stealth');
   if(campaign==='AI'){
     await page.locator('#aiSpeakerButton').click();await page.locator('#aiSpeakerMenu button').filter({hasText:'Borin'}).click();
     assert.match(await page.locator('#railDiceCharacter').textContent(),/Borin/);assert.equal(await page.locator('#railDieExtra').inputValue(),'0');
     await page.locator('#railDieStat').selectOption('skill:Stealth');assert.match(await page.locator('#railDieBonus').textContent(),/= \+4/);
   }
   await page.locator('#railDie').click();await rail.screenshot({path:path.join(__dirname,'artifacts','rail-dice-'+campaign+'.png'),animations:'disabled'});
   await page.setViewportSize({width:390,height:844});await rail.scrollIntoViewIfNeeded();assert(await rail.evaluate(e=>e.scrollWidth<=e.clientWidth+2));
   assert(await page.locator('#railDie').isVisible());await rail.screenshot({path:path.join(__dirname,'artifacts','rail-dice-'+campaign+'-mobile.png'),animations:'disabled'});
   await page.locator('#inventoryDiceToggle').click();assert(await page.locator('#inventoryPreview').isVisible());assert(await page.locator('#inventoryDicePanel').isHidden());
   await page.setViewportSize({width:1440,height:1100});
 }
 assert.deepEqual(errors,[]);console.log('Normal and AI campaign dice passed: character selection, expertise/exhaustion, all die types, advantage/disadvantage, manual bonuses, persona switching, mobile layout and inventory toggle.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
