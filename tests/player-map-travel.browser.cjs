const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const base=process.env.REALM_PREVIEW_URL||'https://127.0.0.1:8785';
  const dm=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}}),player=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
  for(const [context,username] of [[dm,'TabletopQA'],[player,'DicePlayerQA']])assert((await context.request.post(base+'/api/login',{data:{username,password:'Tabletop-QA-12345'}})).ok());
  const records=(await(await dm.request.get(base+'/api/work')).json()).items,campaign=records.find(r=>r.title==='Dice QA Normal');
  assert((await dm.request.put(base+'/api/work/'+campaign.id,{data:{title:campaign.title,content:{...campaign.content,initial_map_kind:'2d'}}})).ok());
  const mapsUrl=base+'/api/campaign/'+campaign.id+'/maps';
  const main=(await(await dm.request.get(mapsUrl)).json()).maps[0];
  const tavern=await(await dm.request.post(mapsUrl,{data:{title:'Travel tavern'}})).json();
  const village=await(await dm.request.post(mapsUrl,{data:{title:'Travel village'}})).json();
  async function patch(id,state){const map=await(await dm.request.get(mapsUrl+'/'+id)).json();const result=await dm.request.put(mapsUrl+'/'+id,{data:{revision:map.revision,state}});assert(result.ok(),await result.text());}
  await patch(main.id,{nodes:[{id:'tavern-door',type:'portal',x:80,y:0,w:40,h:40,connected_map_id:tavern.id,label:'Enter tavern'}]});
  await patch(tavern.id,{nodes:[{id:'main-door',type:'portal',x:80,y:0,w:40,h:40,connected_map_id:main.id,label:'Return outside'}],scene:{location:'The tavern',weather:'Clear',time:'Day'}});
  const d=await dm.newPage(),p=await player.newPage(),errors=[];
  for(const page of [d,p]){page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('.campaign-row').filter({hasText:campaign.title}).click();await page.locator('#map2Canvas').waitFor({state:'visible'});}
  async function shown(page,id){await page.waitForFunction(id=>document.querySelector('#mapWorkspaceSelect').value===String(id),id);}
  async function locations(page){await page.locator('#realmMenuButton').click();await page.locator('#realmSidebar [data-record-type=location]').click();await page.locator('.location-map-card').first().waitFor();}
  await shown(p,main.id);await shown(d,village.id);
  assert.ok(await p.locator('#mapWorkspaceSelect').isDisabled());
  assert.equal((await player.request.get(mapsUrl+'/'+tavern.id)).status(),403);
  assert.equal((await player.request.put(mapsUrl+'/'+tavern.id+'/visit',{data:{}})).status(),403);
  await locations(p);assert.equal(await p.locator('.location-map-card').count(),1);
  await p.locator('.location-map-card').click();await p.locator('#mapDetailsModal').waitFor({state:'visible'});
  assert.equal(await p.locator('#mapDetailsOpen').isVisible(),false);
  await p.locator('#mapDetailsModal [data-bs-dismiss]').first().click();await p.locator('#mapDetailsModal').waitFor({state:'hidden'});
  await p.locator('#realmMenuButton').click();await p.locator('#campaignMapButton').click();
  await p.locator('#map2Canvas [data-node=tavern-door]').click();await shown(p,tavern.id);
  await shown(d,village.id);
  // DM navigation and creation cannot pull a player out of the tavern.
  await d.locator('#mapWorkspaceSelect').selectOption(String(main.id));await shown(d,main.id);
  await d.locator('#mapWorkspaceSelect').selectOption(String(village.id));await shown(d,village.id);
  await patch(tavern.id,{nodes:[{id:'main-door',type:'portal',x:80,y:0,w:40,h:40,connected_map_id:main.id,label:'Tavern exit updated live'}]});
  await p.locator('#map2Canvas [data-node=main-door]').filter({hasText:'Tavern exit updated live'}).waitFor();
  await shown(p,tavern.id);
  await p.reload();await p.locator('.campaign-row').filter({hasText:campaign.title}).click();await shown(p,tavern.id);
  await locations(p);assert.equal(await p.locator('.location-map-card').count(),2);
  assert.equal(await p.locator('.location-map-card').filter({hasText:'Travel village'}).count(),0);
  await p.locator('[data-map-id="'+main.id+'"]').click();await p.locator('#mapDetailsModal').waitFor({state:'visible'});
  assert.equal(await p.locator('#mapDetailsOpen').isVisible(),false);
  assert.equal((await(await player.request.get(mapsUrl)).json()).viewer_map_id,tavern.id);
  await p.locator('#mapDetailsModal [data-bs-dismiss]').first().click();await p.locator('#mapDetailsModal').waitFor({state:'hidden'});
  await locations(d);await d.locator('[data-map-id="'+tavern.id+'"]').click();await d.locator('#mapDetailsModal').waitFor({state:'visible'});
  assert.equal((await(await dm.request.get(mapsUrl)).json()).active_map_id,village.id,'Opening details must not switch the map');
  await d.locator('#mapDetailsOpen').click();await d.locator('#mapDetailsModal').waitFor({state:'hidden'});await shown(d,tavern.id);
  await p.locator('#realmMenuButton').click();await p.locator('#campaignMapButton').click();await p.locator('#map2Canvas [data-node=main-door]').click();await shown(p,main.id);
  await shown(d,tavern.id);
  // Dragging a character places the token but does not move their screen.
  await d.locator('[data-map-mode=edit]').click();await d.locator('[data-map2-group=characters]').click();
  const character=d.locator('#map2CharacterPalette [data-map2-player]').first();
  const playerId=Number(await character.getAttribute('data-map2-player'));
  const drop=await d.locator('#map2Canvas').evaluate(svg=>{const point=new DOMPoint(140,100).matrixTransform(svg.getScreenCTM()),box=svg.getBoundingClientRect();return {x:point.x-box.x,y:point.y-box.y};});
  await character.dragTo(d.locator('#map2Canvas'),{targetPosition:drop});
  await d.locator('#mapForcePlayer').waitFor({state:'visible'});
  const placed=(await(await dm.request.get(mapsUrl+'/'+tavern.id)).json()).players.find(player=>player.id===playerId);
  assert.equal(placed.x,3);assert.equal(placed.z,2);assert.equal(placed.present,false);
  assert.equal((await(await player.request.get(mapsUrl)).json()).viewer_map_id,main.id);
  assert.equal((await player.request.put(mapsUrl+'/'+tavern.id+'/summon',{data:{user_id:playerId}})).status(),403);
  await d.locator('#mapForcePlayer').click();await shown(p,tavern.id);
  await p.reload();await p.locator('.campaign-row').filter({hasText:campaign.title}).click();await shown(p,tavern.id);
  // Rename through the DM details panel and see the live name on the player view.
  await locations(d);await d.locator('[data-map-id="'+tavern.id+'"]').click();
  await d.locator('#mapRenameTitle').fill('The Golden Tavern');await d.locator('#mapRenameForm [type=submit]').click();
  await d.locator('#mapDetailsTitle').filter({hasText:'The Golden Tavern'}).waitFor();
  await p.waitForFunction(()=>document.querySelector('#mapWorkspaceSelect option:checked')?.textContent.includes('The Golden Tavern'));
  await d.locator('#mapDetailsModal [data-bs-dismiss]').first().click();await d.locator('#mapDetailsModal').waitFor({state:'hidden'});
  await d.locator('[data-map-id="'+tavern.id+'"]').filter({hasText:'The Golden Tavern'}).waitFor();
  assert.equal((await player.request.put(mapsUrl+'/'+tavern.id+'/rename',{data:{title:'Forbidden rename'}})).status(),403);
  assert.deepEqual(errors,[]);console.log('PASS: players start on main, travel only through linked parts, retain their map after reload and DM navigation, see only visited maps, get details-only cards, and receive live updates independently; DM opens maps from the details footer.');
  console.log('PASS: DM character drag placement, separate forced travel, saved destination/position, DM map rename, and live player map title update.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
