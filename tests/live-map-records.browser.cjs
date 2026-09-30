const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const base=process.env.REALM_PREVIEW_URL||'https://127.0.0.1:8779';
  const dm=await browser.newContext({ignoreHTTPSErrors:true}),player=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
  for(const [ctx,username]of [[dm,'TabletopQA'],[player,'DicePlayerQA']])await ctx.request.post(base+'/api/login',{data:{username,password:'Tabletop-QA-12345'}});
  const records=async()=> (await(await dm.request.get(base+'/api/work')).json()).items;
  const all=await records(),campaign=all.find(r=>r.title==='Dice QA Normal'),hero=all.find(r=>r.title==='Elara'&&r.content.campaign_id===campaign.id);
  async function edit(record,content={},title){const current=(await records()).find(r=>r.id===record.id);const r=await dm.request.put(base+'/api/work/'+record.id,{data:{title:title||current.title,content:{...current.content,...content}}});assert(r.ok(),await r.text());}
  await edit(campaign,{initial_map_kind:'2d'});await edit(hero,{tabletop:{...hero.content.tabletop,money_cp:1000}});
  let response=await dm.request.post(base+'/api/work',{data:{title:'Live stock torch',content:{category:'item',campaign_id:campaign.id,player_visible:true,reference_only:true,tabletop:{value_cp:1}}}});assert(response.ok());let stock=await response.json();stock=stock.item||stock;
  const listing=await(await dm.request.get(base+'/api/campaign/'+campaign.id+'/maps')).json(),url=base+'/api/campaign/'+campaign.id+'/maps/'+listing.active_map_id,map=await(await dm.request.get(url)).json();
  assert((await dm.request.put(url,{data:{revision:map.revision,state:{nodes:[{id:'live-shop',type:'shop',label:'Live shop',x:0,y:0,w:80,h:80,money_cp:100,contents:[{record_id:stock.id,quantity:5,price_cp:1}]}]}}})).ok());
  const page=await player.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));page.setDefaultTimeout(10000);await page.goto(base);await page.locator('.campaign-row').filter({hasText:campaign.title}).click();
  await page.locator('#map2Canvas [data-node=live-shop]').click();await page.locator('#map2ObjectPopup').waitFor({state:'visible'});
  const quantity=page.getByRole('spinbutton',{name:'Quantity to buy of Live stock torch'});await quantity.fill('3');
  await edit(stock,{},'Renamed live stock');await page.locator('#map2PopupTitle').click();
  await page.getByRole('spinbutton',{name:'Quantity to buy of Renamed live stock'}).waitFor();assert.equal(await page.getByRole('spinbutton',{name:'Quantity to buy of Renamed live stock'}).inputValue(),'3');
  await page.locator('#map2ClosePopup').click();
  response=await dm.request.post(base+'/api/work',{data:{title:'Live granted spell',content:{category:'spell',campaign_id:campaign.id,user_ids:[hero.id],grant_mode:'characters',spell_level:'Cantrip',summary:'A newly granted spell'}}});assert(response.ok());let spell=await response.json();spell=spell.item||spell;
  await page.locator('#attackPreview').getByRole('button',{name:'View Live granted spell',exact:true}).click();await page.locator('#recordDetailModal').waitFor({state:'visible'});
  // Connection recovery must refresh an open card, not require navigation.
  await player.setOffline(true);await edit(spell,{summary:'Changed while disconnected'});await player.setOffline(false);
  await page.waitForFunction(()=>document.querySelector('#detailDescription').textContent==='Changed while disconnected');
  assert((await dm.request.delete(base+'/api/work/'+spell.id)).ok());await page.locator('#recordDetailModal').waitFor({state:'hidden'});await page.waitForFunction(()=>!document.querySelector('#attackPreview').textContent.includes('Live granted spell'));
  assert.deepEqual(errors,[]);console.log('PASS open shop record updates preserve purchase quantities; new/deleted spells and offline recovery refresh automatically.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
