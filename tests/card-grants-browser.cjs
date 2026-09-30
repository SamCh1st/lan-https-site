const {chromium}=require(process.env.TABLETOP_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
const base=process.env.REALM_PREVIEW_URL||'https://127.0.0.1:8766';
const dm=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}}),player=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
for(const [ctx,name] of [[dm,'TabletopQA'],[player,'DicePlayerQA']])assert.equal((await ctx.request.post(base+'/api/login',{data:{username:name,password:'Tabletop-QA-12345'}})).status(),200);
const dp=await dm.newPage(),pp=await player.newPage(),errors=[];for(const p of [dp,pp])p.on('pageerror',e=>errors.push(e.message));
for(const kind of ['Normal','AI']){
 const records=(await (await dm.request.get(base+'/api/work')).json()).items;
 const campaign=records.find(r=>r.title==='Dice QA '+kind),character=records.find(r=>r.title==='Elara'&&r.content.campaign_id===campaign.id);
 for(const p of [dp,pp]){await p.goto(base);await p.locator('.campaign-row').filter({hasText:campaign.title}).click();}
 if(kind==='AI'){await pp.locator('#aiSpeakerButton').click();await pp.locator('#aiSpeakerMenu button').filter({hasText:'Elara'}).click();}
 for(const [category,title,key] of [['item','Potion of Healing','owner_ids'],['spell','Cure Wounds','user_ids'],['attack','Dash','user_ids']]){
   const panel=category==='item'?'#inventoryPreview':'#attackPreview', otherPanel=category==='item'?'#attackPreview':'#inventoryPreview';
   await dp.bringToFront();await dp.locator('#realmMenuButton').click();await dp.locator('#realmSidebar [data-record-type="'+category+'"]').click();await dp.locator('#recordSearch').fill(title);
   await dp.locator('#workList .work-card h3').filter({hasText:title}).first().click();await dp.locator('#detailEditButton').click();const modal=dp.locator('#workModal');await modal.waitFor({state:'visible'});
   await modal.locator('[name='+key+'][value="'+character.id+'"]').check();assert.equal(await modal.locator('[name=reference_only]').isChecked(),false);
   await modal.locator('[name=player_visible]').uncheck();await modal.locator('button[type=submit]').click();await modal.waitFor({state:'hidden'});
   await pp.bringToFront();await pp.locator(panel+' .rail-entry').filter({hasText:title}).waitFor({state:'visible',timeout:15000});
   assert.equal(await pp.locator(otherPanel+' .rail-entry').filter({hasText:title}).count(),0);
   if(kind==='AI'){
     await pp.locator('#aiSpeakerButton').click();await pp.locator('#aiSpeakerMenu button').filter({hasText:'Borin'}).click();
     assert.equal(await pp.locator(panel+' .rail-entry').filter({hasText:title}).count(),0);
     await pp.locator('#aiSpeakerButton').click();await pp.locator('#aiSpeakerMenu button').filter({hasText:'Elara'}).click();
     await pp.locator(panel+' .rail-entry').filter({hasText:title}).waitFor({state:'visible'});
   }
   // The checkbox is persisted when the DM opens the card again.
   await dp.bringToFront();await dp.locator('#workList .work-card h3').filter({hasText:title}).first().click();await dp.locator('#detailEditButton').click();await modal.waitFor({state:'visible'});assert(await modal.locator('[name='+key+'][value="'+character.id+'"]').isChecked());
   await modal.locator('[name='+key+'][value="'+character.id+'"]').uncheck();await modal.locator('button[type=submit]').click();await modal.waitFor({state:'hidden'});
   await pp.bringToFront();await pp.locator(panel+' .rail-entry').filter({hasText:title}).waitFor({state:'hidden',timeout:15000});
 }
}
assert.deepEqual(errors,[]);console.log('Character grants passed in normal and AI campaigns: DM checkboxes, reference conversion, private item/spell/ability delivery, persisted selections and live removal.');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
