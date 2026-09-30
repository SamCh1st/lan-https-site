// Explicit opt-in live Ollama check against tests/serve_preview.py only.
const {chromium}=require(process.env.TABLETOP_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
(async()=>{
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const base='https://127.0.0.1:8766',context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
 assert.equal((await context.request.post(base+'/api/login',{data:{username:'TabletopQA',password:'Tabletop-QA-12345'}})).status(),200);
 const get=async()=>(await (await context.request.get(base+'/api/work')).json()).items;
 const records=await get(),campaign=records.find(r=>r.title==='Dice QA AI');
 const pc=records.find(r=>r.title==='Elara'&&r.content.campaign_id===campaign.id);
 const sword=records.find(r=>r.title==='Longsword'&&r.content.campaign_id===campaign.id);
 const spell=records.find(r=>r.title==='Fire Bolt'&&r.content.campaign_id===campaign.id);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('.campaign-row').filter({hasText:campaign.title}).click();
 const prompt=`I am the human campaign creator. Apply these established events now; no rolls are needed. Set the public scene exactly to location River Gate, time Night, weather Rain, visibility Dim, temperature Cold, danger Dangerous, pace Travel, mood Tense. Give Elara (character ID ${pc.id}) a playable Longsword from reference ID ${sword.id}, and Fire Bolt from reference ID ${spell.id}. Create a new item titled Silver Gate Key for Elara, a quest titled Rescue the Miller (state Active) assigned to Elara, and an encounter titled River Ambush (state Planned, difficulty Moderate) involving Elara. The key opens the mill gate; the quest is to rescue the missing miller; the encounter involves two bandits. Save all these through scene, cards and grants. Do not grant to Borin. Keep your narration brief.`;
 assert.equal((await context.request.post(base+'/api/campaign/'+campaign.id+'/ai/message',{data:{message:prompt,persona_type:'dm',addressed_to_ai:true}})).status(),201);
 const response=await context.request.post(base+'/api/campaign/'+campaign.id+'/ai/respond',{data:{reply_as_type:'dm'},timeout:180000});const body=await response.json();
 fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});fs.writeFileSync(path.join(__dirname,'artifacts','ai-effects-live.json'),JSON.stringify(body,null,2));
 assert.equal(response.status(),201,JSON.stringify(body));
 const after=await get(),world=after.find(r=>r.id===campaign.id).content.ai_world;
 assert.deepEqual(world,{location:'River Gate',time:'Night',weather:'Rain',visibility:'Dim',temperature:'Cold',danger:'Dangerous',pace:'Travel',mood:'Tense'});
 for(const title of ['Silver Gate Key','Rescue the Miller','River Ambush','Longsword','Fire Bolt']){
   const card=after.find(r=>r.content.campaign_id===campaign.id&&r.title===title&&!r.content.reference_only);assert(card,'Missing '+title);
   const key=card.content.category==='item'?'owner_ids':['spell','attack'].includes(card.content.category)?'user_ids':'participant_ids';assert(card.content[key].includes(pc.id),title+' recipient');
 }
 await page.waitForFunction(()=>document.getElementById('aiWorldLocation').value==='River Gate');
 assert.equal(await page.locator('#aiWorldWeather').inputValue(),'Rain');
 await page.screenshot({path:path.join(__dirname,'artifacts','ai-scene-live.png'),animations:'disabled'});
 await page.locator('#aiSpeakerButton').click();await page.locator('#aiSpeakerMenu button').filter({hasText:'Elara'}).click();
 await page.locator('#inventoryPreview .rail-entry').filter({hasText:'Longsword'}).waitFor({state:'visible',timeout:15000});
 await page.locator('#attackPreview .rail-entry').filter({hasText:'Fire Bolt'}).waitFor({state:'visible'});
 assert.deepEqual(errors,[]);console.log('LIVE Ollama passed: all eight scene fields, reference weapon/spell grants, new item/quest/encounter, character links and automatic panel refresh.');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
