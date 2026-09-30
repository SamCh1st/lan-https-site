const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const base=process.env.REALM_PREVIEW_URL||'https://127.0.0.1:8788';
  const dm=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}}),player=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
  for(const [context,username] of [[dm,'TabletopQA'],[player,'DicePlayerQA']])assert((await context.request.post(base+'/api/login',{data:{username,password:'Tabletop-QA-12345'}})).ok());
  const records=(await(await dm.request.get(base+'/api/work')).json()).items,campaign=records.find(r=>r.title==='Dice QA Normal'),hero=records.find(r=>r.content.category==='character'&&r.content.campaign_id===campaign.id);
  const dmUser=(await(await dm.request.get(base+'/api/me')).json()).user;
  async function create(title,content){const res=await dm.request.post(base+'/api/work',{data:{title,content:{campaign_id:campaign.id,...content}}});assert(res.ok(),await res.text());return (await res.json()).item;}
  const other=await create('DM character',{category:'character',owner_user_id:dmUser.id,role:'party',player_visible:true,character_class:'Fighter',character_level:5});
  const dagger=await create('Dagger',{category:'item',quantity:2,item_type:'Weapon',owner_ids:[hero.id],grant_mode:'characters',tabletop:{weight:1,equipment_base:'Dagger'}});
  await create('Other inventory',{category:'item',quantity:1,owner_ids:[other.id],grant_mode:'characters'});
  const attack=await create('Quick strike',{category:'attack',user_ids:[hero.id],grant_mode:'characters',damage:'1d4'});
  await create('DM spell',{category:'spell',user_ids:[other.id],grant_mode:'characters',spell_level:'Cantrip'});
  const d=await dm.newPage(),p=await player.newPage(),errors=[];
  async function archive(page){await page.locator('#realmMenuButton').click();await page.locator('#realmSidebar [data-record-type=character]').click();await page.locator('#characterLoadout').waitFor({state:'visible'});}
  for(const page of [d,p]){page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('.campaign-row').filter({hasText:campaign.title}).click();await archive(page);}
  assert.equal(await d.locator('#characterLoadoutSelect option').count(),2);
  assert.equal(await p.locator('#characterLoadoutSelect option').count(),1);
  assert.equal(await p.locator('#characterLoadoutPicker').isVisible(),false);
  await p.locator('#characterArchiveInventory .equipment-item').filter({hasText:'Dagger'}).waitFor();
  assert.equal(await p.locator('#characterArchiveAbilities .record-card').textContent(),'⚔Quick strikeAbility · 1d4');
  assert.equal(await p.locator('#characterLoadout').getByText('DM spell',{exact:true}).count(),0);
  await d.locator('#characterLoadoutSelect').selectOption(String(other.id));
  await d.locator('#characterArchiveInventory .equipment-item').filter({hasText:'Other inventory'}).waitFor();
  await d.locator('#characterArchiveAbilities').getByRole('button',{name:'View DM spell'}).waitFor();
  await d.locator('#characterLoadoutSelect').selectOption(String(hero.id));
  const equip=p.locator('#characterArchiveInventory .equipment-item').filter({hasText:'Dagger'});
  await equip.getByRole('button',{name:'Equip',exact:true}).click();
  await p.locator('#characterArchiveInventory [data-equipment-group=equipped] .equipment-item').waitFor();
  await d.locator('#characterArchiveInventory [data-equipment-group=equipped] .equipment-item').waitFor();
  const fresh=(await(await dm.request.get(base+'/api/work')).json()).items.find(r=>r.id===attack.id);
  assert((await dm.request.put(base+'/api/work/'+attack.id,{data:{title:'Quick strike updated',content:fresh.content}})).ok());
  await p.locator('#characterArchiveAbilities').getByRole('button',{name:'View Quick strike updated',exact:true}).waitFor();
  await p.locator('#characterArchiveAbilities .record-card').click();await p.locator('#recordDetailModal').waitFor({state:'visible'});
  await p.locator('#recordDetailModal [data-bs-dismiss]').first().click();await p.locator('#recordDetailModal').waitFor({state:'hidden'});
  for(const theme of ['light','dark'])for(const width of [1440,390]){
    await p.setViewportSize({width,height:1000});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    await p.locator('#characterLoadout').scrollIntoViewIfNeeded();
    assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page must fit viewport');
    const [a,b]=await Promise.all(['#characterArchiveInventory','#characterArchiveAbilities'].map(s=>p.locator(s).boundingBox()));
    if(width===1440)assert(b.x>a.x);else assert(b.y>a.y);
    await p.screenshot({path:'tests/artifacts/character-archive-'+theme+'-'+width+'.png',fullPage:true});
  }
  await p.setViewportSize({width:1440,height:1000});await p.locator('#realmMenuButton').click();await p.locator('#realmSidebar [data-record-type=item]').click();assert.equal(await p.locator('#characterLoadout').isVisible(),false);
  assert.deepEqual(errors,[]);
  console.log('PASS: own-character access, DM switching, equipment actions, live inventory/ability updates, details, responsive light/dark layouts, section visibility.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
