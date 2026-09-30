const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try {
  const page=await browser.newPage({viewport:{width:700,height:1000}});
  await page.route('https://layout.test/**',r=>r.fulfill({path:path.join(__dirname,'../site',new URL(r.request().url()).pathname)}));
  const styles=fs.readFileSync(path.join(__dirname,'../site/index.html'),'utf8').match(/<link[^>]+rel="stylesheet"[^>]*>/g).join('');
  await page.setContent('<base href="https://layout.test/">'+styles+'<div id="campaignDashboard" style="display:flex;align-items:start;padding:20px"><aside class="map-custom-rail" style="display:block;width:190px;height:auto"><div id="map2PopupContents"></div></aside><aside class="dashboard-rail inventory-rail" style="display:block;width:240px;height:auto"><div id="inventoryPreview"></div></aside></div>');
  for(const file of ['record-cards','map-trade','equipment'])await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../site',file+'.js'),'utf8')});
  await page.evaluate(()=>{
   window.calls=[];
   const item={id:2,title:'Torch',content:{category:'item',item_type:'Other',quantity:6,owner_ids:[1],tabletop:{value_cp:1}}};
   const character={id:1,title:'Hero',content:{category:'character',owner_user_id:1,tabletop:{money_cp:3000}}};
   MapTrade.render({id:'shop',type:'shop',money_cp:100,contents:[{record_id:2,quantity:5,price_cp:1000}]},{viewerId:1,getRecords:()=>[item,character],onOpenRecord:r=>calls.push({open:r.id}),onTrade:async d=>calls.push(d)},document.querySelector('#map2PopupContents'));
   const state={character_name:'Hero',weight:6,capacity:100,ac:10,loadout:{},attuned:[],can_cast_in_armor:true,notices:[],effects_note:'Equipment rules',items:[{id:2,title:'Torch',record:item,quantity:6,weight:1,equipped:[],warnings:[],requirements:[],review:[],options:[{slot:'main_hand',allowed:false,reasons:['Choose a supported class or ask the DM to record training.']}]}]};
   Equipment.mount(document.querySelector('#inventoryPreview'),character,1,async()=>state,()=>{},null,r=>calls.push({open:r.id}));
  });
  await page.locator('.equipment-item').waitFor();
  for(const theme of ['light','dark']){
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   const geometry=await page.evaluate(()=>{
    const rect=e=>e.getBoundingClientRect();
    return [...document.querySelectorAll('.map2-loot-row')].map(row=>{
     const icon=rect(row.querySelector('.rail-entry-image')),action=rect(row.querySelector('.map-trade-actions')),price=rect(row.querySelector('strong .coin-balance')),title=rect(row.querySelector('strong'));
     return {height:rect(row).height,actionBeside:action.x>=icon.right&&Math.abs(icon.y+icon.height/2-action.y-action.height/2)<3,priceBeside:price.x>title.x&&price.y<title.bottom,overflow:row.scrollWidth>row.clientWidth+1};
    });
   });
   console.log(theme,geometry);
   for(const g of geometry){assert(g.actionBeside);assert(g.priceBeside);assert(!g.overflow);assert(g.height<150);}
   assert(await page.locator('.equipment-reasons').evaluate(e=>!e.open&&!e.querySelector('p').checkVisibility()));
   assert(await page.locator('.equipment-item').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   await page.locator('.map2-loot-row').first().screenshot({path:path.join(__dirname,'artifacts','compact-buy-'+theme+'.png')});
   await page.locator('.map2-loot-row').last().screenshot({path:path.join(__dirname,'artifacts','compact-sell-'+theme+'.png')});
   await page.locator('.equipment-item').screenshot({path:path.join(__dirname,'artifacts','compact-equipment-'+theme+'.png')});
  }
  const quantity=page.getByRole('spinbutton',{name:'Quantity to buy of Torch'}),buy=page.getByRole('button',{name:'Buy',exact:true});
  for(const invalid of ['0','1.5','6','4','']){await quantity.fill(invalid);assert(await buy.isDisabled());}
  await quantity.fill('3');assert(await buy.isEnabled());await buy.click();
  await page.getByRole('button',{name:'Sell',exact:true}).click();
  await page.locator('.map2-loot-row .record-card').first().click();
  assert.deepEqual(await page.evaluate(()=>calls),[{action:'buy',record_id:2,quantity:3,node_id:'shop',character_id:1},{action:'sell',record_id:2,node_id:'shop',character_id:1},{open:2}]);
  await page.locator('.equipment-reasons summary').click();
  assert(await page.getByText('Choose a supported class or ask the DM to record training.').isVisible());
  console.log('Compact cards passed: both themes, valid quantities, purchase payload, sell, details and collapsible guidance.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
