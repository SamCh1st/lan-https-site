const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try {
  const base=process.env.REALM_PREVIEW_URL||'https://127.0.0.1:8783';
  const dm=await browser.newContext({ignoreHTTPSErrors:true}),player=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
  for(const [ctx,username] of [[dm,'TabletopQA'],[player,'DicePlayerQA']])assert((await ctx.request.post(base+'/api/login',{data:{username,password:'Tabletop-QA-12345'}})).ok());
  const records=async()=>(await(await dm.request.get(base+'/api/work')).json()).items;
  const all=await records(),campaign=all.find(r=>r.title==='Dice QA Normal'),hero=all.find(r=>r.title==='Elara'&&r.content.campaign_id===campaign.id);
  for(const [r,content] of [[campaign,{...campaign.content,initial_map_kind:'2d'}],[hero,{...hero.content,tabletop:{...hero.content.tabletop,money_cp:1000}}]])assert((await dm.request.put(base+'/api/work/'+r.id,{data:{title:r.title,content}})).ok());
  async function create(content){const response=await dm.request.post(base+'/api/work',{data:{title:'Stacking Torch',content}});assert(response.ok(),await response.text());const r=await response.json();return r.item||r;}
  const template={category:'item',campaign_id:campaign.id,item_type:'Other',rarity:'Nonmagical',quantity:1,reference_only:true,tabletop:{weight:1,value_cp:100}};
  const stock=await create(template),secondStock=await create(template);
  const first=await create({...template,reference_only:false,owner_ids:[hero.id],loot_source_record_id:stock.id});
  await create({...template,reference_only:false,owner_ids:[hero.id],loot_source_record_id:first.id,default_art:'/assets/starter-art/delapouite--torch.svg',ai_story_mode:'adaptive',initial_map_kind:'3d',tabletop:{...template.tabletop,requires_attunement:false,charges_max:0,equipment_state:'Stored'}});
  const listing=await(await dm.request.get(base+'/api/campaign/'+campaign.id+'/maps')).json(),url=base+'/api/campaign/'+campaign.id+'/maps/'+listing.active_map_id,current=await(await dm.request.get(url)).json();
  assert((await dm.request.put(url,{data:{revision:current.revision,state:{nodes:[{id:'stack-shop',type:'shop',label:'Torch seller',x:0,y:0,w:80,h:80,money_cp:1000,contents:[{record_id:stock.id,quantity:2,price_cp:100},{record_id:secondStock.id,quantity:1,price_cp:150}]}]}}})).ok());
  const page=await player.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('.campaign-row').filter({hasText:campaign.title}).click();
  const inventory=page.locator('#inventoryPreview .equipment-item').filter({hasText:'Stacking Torch'});
  await page.waitForFunction(()=>document.querySelectorAll('#inventoryPreview .equipment-item').length===2);
  await page.locator('#map2Canvas [data-node=stack-shop]').click();
  const stockRow=id=>page.locator('#map2PopupContents .map2-loot-row').filter({has:page.locator('[data-trade-quantity="buy-'+id+'"]')});
  await stockRow(stock.id).getByRole('spinbutton').fill('2');await stockRow(stock.id).getByRole('button',{name:'Buy',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('#map2PopupContents [data-trade-quantity^="sell-"]').length===1);
  const sale=page.getByRole('spinbutton',{name:'Quantity to sell of Stacking Torch'});
  assert.equal(await sale.getAttribute('max'),'4');
  await page.waitForFunction(()=>document.querySelectorAll('#inventoryPreview .equipment-item').length===1);
  assert.match(await inventory.innerText(),/Quantity 4/);
  await stockRow(secondStock.id).getByRole('button',{name:'Buy',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-trade-quantity^="sell-"]')?.max==='5');
  let held=(await records()).filter(r=>r.content.owner_ids?.length===1&&r.content.owner_ids[0]===hero.id);
  assert.equal(held.length,1);assert.equal(held[0].id,first.id);assert.equal(held[0].content.quantity,5);
  assert.equal((await records()).find(r=>r.id===hero.id).content.tabletop.money_cp,650);
  // The merged stack is usable by the existing quantity sale control.
  await sale.fill('3');await page.locator('#map2PopupContents').getByRole('button',{name:'Sell',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-trade-quantity^="sell-"]')?.max==='2');
  held=(await records()).filter(r=>r.content.owner_ids?.length===1&&r.content.owner_ids[0]===hero.id);
  assert.equal(held.length,1);assert.equal(held[0].content.quantity,2);
  assert.equal((await records()).find(r=>r.id===hero.id).content.tabletop.money_cp,950);
  const buyQuantity=page.locator('#map2PopupContents [data-trade-quantity^="buy-"]');
  assert.equal(await buyQuantity.count(),1);assert.equal(await buyQuantity.getAttribute('max'),'3');
  const restockedId=await buyQuantity.getAttribute('data-trade-quantity');
  await sale.fill('1');await page.locator('#map2PopupContents').getByRole('button',{name:'Sell',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#map2PopupContents [data-trade-quantity^="buy-"]')?.max==='4');
  assert.equal(await buyQuantity.count(),1);assert.equal(await buyQuantity.getAttribute('data-trade-quantity'),restockedId);
  assert.equal((await records()).find(r=>r.id===hero.id).content.tabletop.money_cp,1050);
  assert.equal((await records()).find(r=>r.id===first.id).content.quantity,1);
  await page.locator('#map2ObjectPopup').screenshot({path:'tests/artifacts/combined-merchant-stock.png'});
  await page.locator('#map2ClosePopup').click();await inventory.scrollIntoViewIfNeeded();
  await page.screenshot({path:'tests/artifacts/combined-inventory.png'});
  assert.deepEqual(errors,[]);console.log('PASS: inventory stacking, purchases from separate stock cards, bulk resale, and repeated sales keep a single merchant stock card with accurate quantity and money.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
