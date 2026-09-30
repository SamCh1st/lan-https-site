const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.REALM_PREVIEW_URL||'https://127.0.0.1:8780';

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    const dm=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    const player=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    for(const [context,username] of [[dm,'TabletopQA'],[player,'DicePlayerQA']]) {
      assert.ok((await context.request.post(base+'/api/login',{data:{username,password:'Tabletop-QA-12345'}})).ok());
    }
    const records=(await (await dm.request.get(base+'/api/work')).json()).items;
    const campaign=records.find(r=>r.title==='Dice QA Normal');
    assert.ok((await dm.request.put(base+'/api/work/'+campaign.id,{data:{title:campaign.title,content:{...campaign.content,initial_map_kind:'2d'}}})).ok());
    const path=base+'/api/campaign/'+campaign.id+'/maps';
    const first=(await (await dm.request.get(path)).json()).maps[0];
    const second=await (await dm.request.post(path,{data:{title:'Amber citadel'}})).json();
    const d=await dm.newPage(),p=await player.newPage(),errors=[];
    for(const page of [d,p]) {
      page.setDefaultTimeout(12000);
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base);
      await page.locator('.campaign-row').filter({hasText:'Dice QA Normal'}).click();
      await page.locator('#map2Canvas').waitFor({state:'visible'});
    }
    async function locations(page) {
      await page.locator('#realmMenuButton').click();
      await page.locator('#realmSidebar [data-record-type=location]').click();
      await page.locator('.location-map-card').first().waitFor();
    }
    async function mapShown(page,id) {
      await page.waitForFunction(id=>document.querySelector('#mapWorkspaceSelect').value===String(id),id);
      await page.locator('#mapWorkspaceHeader').waitFor({state:'visible'});
    }
    await locations(d);await locations(p);
    assert.equal(await d.locator('.location-map-card').count(),2);
    assert.equal(await p.locator('.location-map-card').count(),1);
    assert.equal(await d.locator('.location-map-card.current-map-card').getAttribute('data-map-id'),String(second.id));
    assert.equal(await d.locator('#recordLibraryFilter').isVisible(),false);
    assert.equal(await p.locator('#addSectionRecord').isVisible(),false);
    await d.locator('#recordSearch').fill('amber');
    assert.equal(await d.locator('.location-map-card').count(),1);
    await d.locator('#recordSearch').fill('no matching map');
    assert.match(await d.locator('#workList').innerText(),/No matching maps/);
    await d.locator('#recordSearch').fill('');

    // Cards open details; only the DM gets an Open map action.
    await p.locator('[data-map-id="'+first.id+'"]').focus();
    await p.keyboard.press('Enter');await p.locator('#mapDetailsModal').waitFor({state:'visible'});
    assert.equal(await p.locator('#mapDetailsOpen').isVisible(),false);
    assert.equal((await (await dm.request.get(path)).json()).active_map_id,second.id);
    await p.locator('#mapDetailsModal [data-bs-dismiss]').first().click();await p.locator('#mapDetailsModal').waitFor({state:'hidden'});
    await d.locator('[data-map-id="'+first.id+'"]').click();
    await d.locator('#mapDetailsOpen').click();await d.locator('#mapDetailsModal').waitFor({state:'hidden'});await mapShown(d,first.id);
    assert.equal(await d.locator('#recordDetailModal').isVisible(),false);

    // The existing map creator is reused from Locations.
    await locations(d);
    await d.locator('#addSectionRecord').click();
    await d.locator('#mapNewForm [name=title]').fill('Moonlit harbor');
    assert.equal(await d.locator('#workModal').isVisible(),false);
    await d.locator('#mapNewForm button').click();
    await locations(d);
    await d.locator('.location-map-card').filter({hasText:'Moonlit harbor'}).waitFor();
    assert.equal(await p.locator('.location-map-card').count(),1);

    // Cards stay readable and inside their container in both themes.
    fs.mkdirSync('tests/artifacts/locations',{recursive:true});
    for(const theme of ['light','dark']) for(const width of [1440,390]) {
      await d.setViewportSize({width,height:1000});
      await d.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      assert.ok(await d.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      for(const card of await d.locator('.location-map-card').all()) {
        assert.ok(await card.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
      }
      await d.screenshot({path:`tests/artifacts/locations/${theme}-${width}.png`});
    }
    // A normal archive still opens records, and AI campaigns retain their place editor.
    await d.locator('#realmMenuButton').click();await d.locator('#realmSidebar [data-record-type=npc]').click();
    assert.ok(await d.locator('#recordLibraryFilter').isVisible());
    await d.locator('#addSectionRecord').click();await d.locator('#workModal').waitFor({state:'visible'});
    await d.locator('#workModal [data-bs-dismiss]').first().click();await d.locator('#workModal').waitFor({state:'hidden'});
    await d.goto(base);await d.locator('.campaign-row').filter({hasText:'Dice QA AI'}).click();
    await d.locator('#realmMenuButton').click();await d.locator('#realmSidebar [data-record-type=location]').click();
    assert.equal(await d.locator('.location-map-card').count(),0);
    await d.locator('#addSectionRecord').click();await d.locator('#workModal').waitFor({state:'visible'});
    await d.locator('#workModal [data-bs-dismiss]').first().click();await d.locator('#workModal').waitFor({state:'hidden'});

    // Three-dimensional campaigns use the same map library and navigation.
    const three=await (await dm.request.post(base+'/api/work',{data:{title:'Locations 3D QA',content:{category:'campaign',initial_map_kind:'3d'}}})).json();
    const threeId=three.item?.id||three.id;
    assert.ok(threeId,JSON.stringify(three));
    const threePath=base+'/api/campaign/'+threeId+'/maps';
    const threeFirst=(await (await dm.request.get(threePath)).json()).maps[0];
    await dm.request.post(threePath,{data:{title:'Dwarven halls'}});
    await d.goto(base);await d.locator('.campaign-row').filter({hasText:'Locations 3D QA'}).click();
    await locations(d);
    assert.equal(await d.locator('.location-map-card').count(),2);
    assert.match(await d.locator('.location-map-card').first().innerText(),/3D map/i);
    await d.locator('[data-map-id="'+threeFirst.id+'"]').click();await d.locator('#mapDetailsOpen').click();await d.locator('#mapDetailsModal').waitFor({state:'hidden'});await mapShown(d,threeFirst.id);
    await d.locator('#mapPlaceholder').waitFor({state:'visible'});
    assert.deepEqual(errors,[]);
    console.log('PASS Locations: 2D/3D map cards, search, current map, keyboard opening, DM/player navigation, live creation, light/dark desktop/mobile, regular archives and AI locations.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
