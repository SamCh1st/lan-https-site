require('./python-path.cjs');
/* Isolated application test: never writes to the user's campaign database. */
const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),base='https://127.0.0.1:8781';
const python='C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const server=spawn(python,['-u','-c',`import tempfile,pathlib,sys
import storage,server
server.ThreadingHTTPServer.request_queue_size=128
server.Handler.protocol_version='HTTP/1.1'
temp=tempfile.TemporaryDirectory(prefix='map-part-cards-')
storage.DB_PATH=pathlib.Path(temp.name)/'site.db'
storage.UPLOAD_DIR=pathlib.Path(temp.name)/'uploads'
storage.initialize()
uid=storage.create_user('PartCardsQA',None,'Environment-QA-12345')
storage.create_work(uid,'Part Cards QA',{'category':'campaign','initial_map_kind':'2d'})
sys.argv=['server.py','--port','8781']
server.main()`],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='';server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);
(async()=>{let browser;try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
 for(let i=0;i<80;i++){try{const response=await context.request.get(base,{timeout:1000});if(response.ok())break;}catch{}await new Promise(r=>setTimeout(r,250));if(i===79)throw Error(output);}
 const login=await context.request.post(base+'/api/login',{data:{username:'PartCardsQA',password:'Environment-QA-12345'}});assert.ok(login.ok(),await login.text());
 const campaign=(await(await context.request.get(base+'/api/work')).json()).items.find(r=>r.title==='Part Cards QA');

 const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.stack));
 await page.goto(base);await page.locator('.campaign-row').filter({hasText:'Part Cards QA'}).click();await page.locator('#map2Canvas').waitFor({state:'visible'});
 const archive=async()=>{await page.locator('#realmMenuButton').click();await page.locator('[data-record-type="map_part"]').click();await page.locator('#workList.parts-catalog').waitFor();};
 const expectedParts=JSON.parse(require('node:fs').readFileSync(path.join(root,'site/assets/map-art/parts-catalog.json'),'utf8')).length;
 await archive();assert.equal(await page.locator('#workList .work-card').count(),expectedParts);
 const count=await page.evaluate(()=>new Set(Object.values(MapCatalog.groups).flat()).size);assert.equal(count,expectedParts);
 const toggle=page.locator('.part-type-toggle').first();await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'false');assert.equal(await page.locator('#workList .work-card[data-part-group="terrain"]:visible').count(),0);assert.ok(await page.locator('.part-type-heading').first().locator('button').last().isVisible());await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'true');
 const broken=await page.locator('#workList .card-art img').evaluateAll(imgs=>imgs.filter(i=>i.complete&&!i.naturalWidth).map(i=>i.src));assert.deepEqual(broken,[]);
 await page.screenshot({path:path.join(__dirname,'artifacts/parts-archive.png')});
 // Each type offers a new card with a matching set of appearances.
 const groups=await page.evaluate(()=>MapPartCards.groups());
 for(const group of groups){await page.selectOption('#partTypeFilter',group);await page.locator('#addSectionRecord').click();await page.locator('#workModal').waitFor({state:'visible'});assert.equal(await page.inputValue('[name="part_group"]'),group);assert.ok(await page.locator('[name="part_type"] option').count());await page.locator('#workModal [data-bs-dismiss="modal"]').first().click();await page.locator('#workModal').waitFor({state:'hidden'});}
 await page.selectOption('#partTypeFilter','furniture');await page.locator('.part-type-heading button').last().click();
 await page.fill('#workForm [name="title"]','Moonlit table');await page.selectOption('[name="part_type"]','table');await page.fill('[name="part_width"]','120');await page.fill('[name="part_height"]','70');await page.check('[name="light_enabled"]');assert.ok(await page.locator('#partLightFields').isVisible());await page.fill('[name="light_radius"]','345');await page.fill('[name="light_color"]','#88bbff');
 // Upload an existing isolated image through the same API as the image picker.
 const png=require('node:fs').readFileSync(path.join(root,'site/assets/map-art/items/ceramic_mug.png'));
 const upload=await context.request.post(base+'/api/upload',{headers:{'Content-Type':'image/png'},data:png});assert.ok(upload.ok(),await upload.text());const imageId=(await upload.json()).image_id;
 await page.locator('#workForm [name="image_id"]').evaluate((el,id)=>el.value=id,imageId);
 assert.deepEqual(await page.locator('#workForm').evaluate(f=>[...f.querySelectorAll(':invalid')].map(e=>[e.name,e.validationMessage])),[]);await page.locator('#workForm button[type="submit"]').click();await page.waitForTimeout(500);assert.equal(await page.locator('#workError').innerText(),'');await page.locator('#workModal').waitFor({state:'hidden'});
 let saved=(await(await context.request.get(base+'/api/work')).json()).items.find(r=>r.title==='Moonlit table');assert.ok(saved);assert.equal(saved.content.light_radius,345);assert.equal(saved.content.part_group,'furniture');assert.equal(saved.content.image_id,imageId);
 // Reload to check persisted cards and palette integration, then place through the real map tool.
 await page.reload();await page.locator('.campaign-row').filter({hasText:'Part Cards QA'}).click();await page.locator('#map2Canvas').waitFor({state:'visible'});await page.locator('[data-map-mode="edit"]').click();
 await page.locator('#mapWorkspaceHeader [data-map-fullscreen]').click();await page.locator('[data-map2-group="furniture"]').click();
 await page.locator('[data-part-card="'+saved.id+'"]:visible').click();const canvas=page.locator('#map2Canvas');const box=await canvas.boundingBox();await page.mouse.click(box.x+box.width*.5,box.y+box.height*.5);
 await page.waitForFunction(()=>document.querySelector('#mapPointLighting')?.dataset.lightCount==='1');await page.waitForTimeout(1000);
 const listing=await(await context.request.get(base+'/api/campaign/'+campaign.id+'/maps')).json(),url=base+'/api/campaign/'+campaign.id+'/maps/'+listing.active_map_id;
 let map=(await(await context.request.get(url)).json());const placed=map.state.nodes.find(n=>n.part_card_id===saved.id);assert.ok(placed);assert.equal(placed.w,120);assert.equal(placed.h,70);assert.equal(placed.light_radius,345);assert.equal(placed.part_image_id,imageId);
 assert.equal(await page.locator('#mapPointLighting').getAttribute('data-total-objects'),'0');assert.ok(await page.locator('#map2LightOptions').isVisible());assert.equal(await page.locator('#map2LightRadius').inputValue(),'345');
 assert.ok(await page.locator('[data-node="'+placed.id+'"] [data-part-image]').count());await page.screenshot({path:path.join(__dirname,'artifacts/parts-custom-light.png')});
 // The same uploaded image receives surface relief when light-source mode is off.
 const relief=await page.evaluate(async id=>{const n={type:'table',part_image_id:id,x:0,y:0,w:120,h:70,light_enabled:false,height_scale:1};MapSurfaceLighting.update({time:'Day'},[],()=>null);const a=await MapSurfaceLighting.bitmap(n,64);MapSurfaceLighting.update({time:'Evening'},[],()=>null);const b=await MapSurfaceLighting.bitmap(n,64);return a.canvas.toDataURL()!==b.canvas.toDataURL();},imageId);assert.ok(relief);
 // Custom terrain still has a repeating image pattern; resizing retains its tile pitch.
 const tiled=await page.evaluate(id=>{const svg=document.querySelector('#map2Canvas'),g=document.createElementNS(svg.namespaceURI,'g');svg.append(g);const result=[];for(const width of [80,800]){g.replaceChildren();MapArt.render({id:'uploaded-terrain',type:'water',part_image_id:id,x:0,y:0,w:width,h:80},g);const pattern=g.querySelector('pattern');result.push([pattern.getAttribute('width'),!!pattern.querySelector('image'),!!pattern.querySelector('animateTransform')]);}g.remove();return result;},imageId);assert.deepEqual(tiled, [['160',true,true],['160',true,true]]);
 // Reopen and turn the light off; the next placement must stop emitting light.
 await page.locator('#mapFullscreenBar [data-map-fullscreen]').click();await archive();await page.selectOption('#partTypeFilter','furniture');await page.locator('#workList [data-id="'+saved.id+'"]').click();await page.locator('#detailEditButton').click();await page.locator('#workModal').waitFor({state:'visible'});assert.equal(await page.inputValue('[name="part_width"]'),'120');assert.ok(await page.isChecked('[name="light_enabled"]'));await page.uncheck('[name="light_enabled"]');assert.ok(await page.locator('#partLightFields').isHidden());assert.deepEqual(await page.locator('#workForm').evaluate(f=>[...f.querySelectorAll(':invalid')].map(e=>[e.name,e.validationMessage])),[]);await page.locator('#workForm button[type="submit"]').click();await page.waitForTimeout(500);assert.equal(await page.locator('#workError').innerText(),'');await page.locator('#workModal').waitFor({state:'hidden'});
 saved=(await(await context.request.get(base+'/api/work')).json()).items.find(r=>r.id===saved.id);assert.equal(saved.content.light_enabled,false);
 assert.deepEqual(errors,[]);console.log('PASS: all archive cards, all type forms, custom image and light creation, placement, persistence, relief, tiling, and editing.');
 }finally{if(browser)await browser.close();server.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
