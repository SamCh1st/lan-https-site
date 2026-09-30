require('./python-path.cjs');
/* Isolated application test: never writes to the user's campaign database. */
const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),base='https://127.0.0.1:8793';
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
sys.argv=['server.py','--port','8793']
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
 await page.locator('[data-map-mode="edit"]').click();await page.locator('#mapWorkspaceHeader [data-map-fullscreen]').click();await page.waitForTimeout(200);
 const click=async(x,y)=>{const p=await page.evaluate(([x,y])=>{const p=new DOMPoint(x,y).matrixTransform(document.getElementById('map2Canvas').getScreenCTM());return {x:p.x,y:p.y};},[x,y]);await page.mouse.click(p.x,p.y);};
 const listing=await(await context.request.get(base+'/api/campaign/'+campaign.id+'/maps')).json(),url=base+'/api/campaign/'+campaign.id+'/maps/'+listing.active_map_id;
 const state=async()=>{await page.waitForTimeout(400);return (await(await context.request.get(url)).json()).state;};
 await page.locator('[data-start-spline=building]').click();for(const p of [[-240,-160],[80,-160],[80,80],[-240,80],[-240,-160]])await click(...p);
 await page.waitForFunction(()=>document.querySelectorAll('[data-spline-point]').length===4);
 let saved=await state();assert.equal(saved.nodes.length,1);assert.equal(saved.nodes[0].type,'building');assert.equal(saved.nodes[0].building_shapes.length,1);assert.equal(saved.nodes[0].building_view,'interior');await page.locator('[data-spline-setting=floor_texture]').selectOption('cobble');await page.locator('[data-spline-setting=wall_texture]').selectOption('brick');saved=await state();assert.equal(saved.nodes[0].floor_texture,'cobble');assert.equal(saved.nodes[0].wall_texture,'brick');await page.locator('[data-spline-setting=floor_texture]').selectOption('wood');await page.locator('[data-spline-setting=wall_texture]').selectOption('stone');
 await page.locator('[data-map2-property=texture_material]').selectOption('cobble');saved=await state();assert.equal(saved.nodes[0].building_shapes[0].floor_texture,'cobble','Generic material control updates the rendered building floor');await page.locator('[data-map2-property=texture_material]').selectOption('wood');
 assert.ok(await page.locator('[data-building-detail=masonry-corner]').count());assert.ok(await page.locator('[data-building-detail=doorway]').count());await page.screenshot({path:path.join(__dirname,'artifacts/building-interior-details.png')});
 await click(-80,-160);await page.waitForFunction(()=>document.querySelectorAll('[data-spline-point]').length===5);saved=await state();assert.equal(saved.nodes[0].spline_points.length,5,'Clicking the line inserts a persisted control point');
 const handle=await page.locator('[data-spline-point="1"]').boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2+55,{steps:5});await page.mouse.up();const reshaped=await state();assert.notDeepEqual(reshaped.nodes[0].spline_points,saved.nodes[0].spline_points,'Inserted control point can be dragged');
 await page.locator('[data-spline-setting=building_view]').selectOption('exterior');await page.locator('[data-spline-setting=roof_texture]').selectOption('roof_slate');await page.waitForFunction(()=>!!document.querySelector('[data-roof-texture=roof_slate]'));saved=await state();assert.equal(saved.nodes[0].roof_texture,'roof_slate');await page.waitForFunction(()=>!!document.querySelector('[data-fitted-roof=roof_slate][href]'));assert.ok(await page.locator('[data-roof-fitting=eaves-and-ridges]').count());
 // Rapid roof reshaping must never retain superseded footprints or duplicate SVG definitions.
 const roofHandle=await page.locator('[data-spline-point="0"]').boundingBox();await page.mouse.move(roofHandle.x+roofHandle.width/2,roofHandle.y+roofHandle.height/2);await page.mouse.down();
 for(let i=1;i<=18;i++){
  await page.mouse.move(roofHandle.x+roofHandle.width/2+i*3,roofHandle.y+roofHandle.height/2+i*2);
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  assert.equal(await page.locator('[data-fitted-roof]').count(),1,'Dragging keeps only the current roof');
  assert.equal(await page.locator('[data-node]').first().evaluate(g=>g.parentElement.children.length),1,'No orphaned roof outlines accumulate');
 }
 await page.mouse.up();await page.waitForFunction(()=>!document.querySelector('[data-render-pending]'));await page.waitForTimeout(400);
 assert.equal(await page.locator('[data-fitted-roof]').count(),1);await page.screenshot({path:path.join(__dirname,'artifacts/spline-reshape-repaired.png')});
 await page.locator('[data-start-spline=river]').click();for(const p of [[-280,200],[-80,160],[120,240],[300,200]])await click(...p);await page.keyboard.press('Enter');saved=await state();assert.equal(saved.nodes.length,2);const river=saved.nodes.find(n=>n.spline_kind==='river');assert.ok(river.points.length>river.spline_points.length);assert.equal(river.type,'river');assert.ok(await page.locator('[data-node="'+river.id+'"] [data-spline-surface=water]').count());await page.waitForFunction(()=>Number(document.querySelector('[data-spline-surface=water] canvas')?.dataset.frames)>1);assert.equal(await page.locator('[data-node="'+river.id+'"] pattern').count(),0,'River uses one worker surface instead of SVG texture triangles');
 await page.locator('[data-start-spline=wall]').click();await click(160,-160);await click(320,-80);await page.keyboard.press('Enter');saved=await state();assert.equal(saved.nodes.length,3);assert.equal(saved.nodes.find(n=>n.spline_kind==='wall').spline_texture,'stone');
 const widthBefore=saved.nodes.find(n=>n.spline_kind==='wall').w;
 await page.locator('[data-map2-property=texture_scale]').fill('0.5');await page.locator('[data-map2-property=texture_scale]').press('Tab');saved=await state();assert.equal(saved.nodes.find(n=>n.spline_kind==='wall').texture_scale,.5);assert.equal(saved.nodes.find(n=>n.spline_kind==='wall').w,widthBefore);assert.ok(await page.locator('[data-node] pattern[href="#mapTexture-stone"][patternTransform*="scale(0.5)"]').count());
 await page.locator('[data-map2-property=texture_material]').selectOption('cobble');saved=await state();assert.equal(saved.nodes.find(n=>n.spline_kind==='wall').spline_texture,'cobble');
 await click(-80,160);await page.waitForFunction(()=>!!document.querySelector('[data-spline-setting=spline_flow]'));assert.equal(await page.locator('[data-map2-property=texture_material]').inputValue(),'water','Animated river remains selectable after its first frame');
 await page.screenshot({path:path.join(__dirname,'artifacts/building-splines.png')});
 // Every kit image decodes; the new parts are seeded in the archive and usable as map images.
 const kits=await page.evaluate(async()=>{const types=MapCatalog.groups.building_kits;await Promise.all(types.map(async type=>{await MapSprites.load(type);const i=new Image();i.src='/assets/map-art/items/'+type+'.png';await i.decode();}));return types;});assert.equal(kits.length,7);
 await page.reload();await page.locator('.campaign-row').filter({hasText:'Part Cards QA'}).click();await page.locator('#map2Canvas').waitFor({state:'visible'});assert.ok(await page.locator('[data-roof-texture=roof_slate]').count());
 assert.deepEqual(errors,[]);console.log('PASS: closed textured building, point insertion/dragging, exterior roof/material selection, curved river and wall placement, persistence, and seven building-kit sprites.');
 }finally{if(browser)await browser.close();server.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
