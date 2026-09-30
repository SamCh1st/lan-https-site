const {chromium}=require(process.env.TABLETOP_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}}),base=process.env.REALM_PREVIEW_URL||'https://127.0.0.1:8766';
 assert.equal((await context.request.post(base+'/api/login',{data:{username:'TabletopQA',password:'Tabletop-QA-12345'}})).status(),200);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const records=async()=>(await (await context.request.get(base+'/api/work')).json()).items;
 const initial=await records();const campaign=initial.find(r=>r.title===(process.env.TEST_NORMAL_2D?'Dice QA Normal':'Dice QA AI'));
 if(process.env.TEST_NORMAL_2D)await context.request.put(base+'/api/work/'+campaign.id,{data:{title:campaign.title,content:{...campaign.content,initial_map_kind:'2d'}}});
 await page.goto(base);await page.locator('.campaign-row').filter({hasText:campaign.title}).click();
 await page.locator('#realmMenuButton').click();await page.locator('#realmSidebar [data-record-type=character]').click();await page.locator('#addSectionRecord').click();
 const modal=page.locator('#workModal');await modal.waitFor({state:'visible'});assert(await page.locator('#characterGenerator').isVisible());assert.equal(await page.locator('#characterRigWorkshop').isVisible(),false);
 assert.equal(await page.locator('#characterGenerator').getAttribute('open'),null);await page.locator('#characterGenerator > summary').click();await page.locator('#generateCharacterButton').click();assert.match(await page.locator('#characterGenerationError').textContent(),/Describe/);
 let attempt=0;
 await page.route('**/characters/generate',async route=>{
   assert.equal(route.request().postDataJSON().prompt,'An elven wizard named Mira');attempt++;
   if(attempt===1)return route.fulfill({status:503,json:{error:'Ollama is unavailable. Your form has not been changed.'}});
   return route.fulfill({json:{draft:{title:'Mira generated QA',content:{category:'character',summary:'Silver-haired elf with ink-stained hands.',notes:'A curious scholar. Review starting equipment with your DM.',character_class:'Wizard',character_level:1,species:'Elf',background:'Sage',strength:8,dexterity:14,constitution:14,intelligence:17,wisdom:12,charisma:10,hp_max:8,hp_current:8,hit_die:'d6',armor_class:12,initiative:2,speed:30,passive_perception:11,tabletop:{ruleset:'2024',advancement:'milestone',spell_ability:'intelligence',slot_1_max:2,slot_1_remaining:2,spell_notes:'Prepared: Magic Missile, Shield',features:'Spellcasting',inventory:'Spellbook, component pouch; confirm starting choices.'}}}}});
 });
 await modal.locator('[name=title]').fill('My unsaved idea');await page.locator('#characterGenerationPrompt').fill('An elven wizard named Mira');
 await page.locator('#generateCharacterButton').click();await page.waitForFunction(()=>document.getElementById('characterGenerationError').textContent.includes('unavailable'));assert.equal(await modal.locator('[name=title]').inputValue(),'My unsaved idea');
 await page.locator('#generateCharacterButton').click();await page.waitForFunction(()=>document.getElementById('characterGenerationStatus').textContent.includes('Draft ready'));
 assert.equal(await modal.locator('[name=title]').inputValue(),'Mira generated QA');assert.equal(await modal.locator('[name=hp_max]').inputValue(),'8');assert.equal(await modal.locator('[name=tt_slot_1_remaining]').inputValue(),'2');assert.equal(await modal.locator('[name=tt_spell_ability]').inputValue(),'intelligence');
 assert.equal((await records()).length,initial.length);
 await page.locator('#characterGenerator').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(__dirname,'artifacts','character-generator.png'),animations:'disabled'});
 await modal.locator('button[type=submit]').click();await modal.waitFor({state:'hidden'});
 const saved=(await records()).find(r=>r.title==='Mira generated QA');assert.equal(saved.content.campaign_id,campaign.id);assert.equal(saved.content.character_class,'Wizard');assert.equal(saved.content.tabletop.slot_1_max,2);
 assert.deepEqual(errors,[]);console.log('Character generator UI passed: AI creation visibility, prompt validation, error preserves form, draft fills sheet, no premature save and ordinary save persists. Model output mocked; local-model availability is separate.');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
