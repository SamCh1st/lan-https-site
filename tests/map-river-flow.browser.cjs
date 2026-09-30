require('./python-path.cjs');
/* Isolated application test: never writes to the user's campaign database. */
const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),base='https://127.0.0.1:8785';
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
sys.argv=['server.py','--port','8785']
server.main()`],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='';server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);
(async()=>{let browser;try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
 for(let i=0;i<80;i++){try{const response=await context.request.get(base,{timeout:1000});if(response.ok())break;}catch{}await new Promise(r=>setTimeout(r,250));if(i===79)throw Error(output);}
 const login=await context.request.post(base+'/api/login',{data:{username:'PartCardsQA',password:'Environment-QA-12345'}});assert.ok(login.ok(),await login.text());
 const campaign=(await(await context.request.get(base+'/api/work')).json()).items.find(r=>r.title==='Part Cards QA');



 const listing=(await(await context.request.get(base+'/api/campaign/'+campaign.id+'/maps')).json()),url=base+'/api/campaign/'+campaign.id+'/maps/'+listing.active_map_id;
 const nodes=['water','lava','swamp','arcane'].map((type,i)=>({id:type,type,x:-520+i*270,y:-280,w:240,h:210}));
 nodes.push({id:'east',type:'river',x:-500,y:40,w:280,h:120,flow_x:1,flow_y:0},
 {id:'west',type:'river',x:-140,y:40,w:280,h:120,flow_x:-1,flow_y:0,tile_cells:[[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2]],tile_base_w:280,tile_base_h:120},
 {id:'zero',type:'river',x:240,y:40,w:240,h:120,flow_x:0,flow_y:0,shape:'stroke',points:[[0,60],[240,60]],brush:100,softness:0});
 let response=await context.request.put(url,{data:{revision:0,state:{nodes,canvas:{background:'empty',grid:false}}}});assert.ok(response.ok(),await response.text());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',msg=>{if(msg.type()==='warning'&&msg.text().includes('Map '))errors.push(msg.text());});
 await page.goto(base);const early=await page.evaluate(()=>({brick:MapPartCards.preview({part_type:'brick'}),river:MapPartCards.preview({part_type:'river'}),custom:MapPartCards.preview({part_type:'water',image_id:123})}));assert.ok(early.brick.startsWith('/assets/map-art/materials/brick.png'));assert.ok(early.river.startsWith('/assets/map-art/materials/water.png'));assert.equal(early.custom,'/api/uploads/123');await page.locator('.campaign-row').filter({hasText:'Part Cards QA'}).click();await page.locator('[data-map-mode="edit"]').click();await page.locator('#mapWorkspaceHeader [data-map-fullscreen]').click();
 const thumbnailUrls=await page.evaluate(()=>MapMaterials.names.map(type=>MapMaterials.thumbnail(type)));for(const thumbnail of thumbnailUrls){const image=await context.request.get(base+thumbnail);assert.ok(image.ok(),thumbnail);assert.equal(image.headers()['content-type'],'image/png');}
 const brick=page.locator('[data-map2-tool="brick"] img').first();await brick.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('[data-map2-tool="brick"] img')?.naturalWidth===160);assert.ok((await brick.getAttribute('src')).includes('/materials/brick.png'));await page.locator('#map2Tools').screenshot({path:path.join(__dirname,'artifacts/actual-paint-previews.png')});
 await page.waitForFunction(()=>['water','lava','swamp','arcane'].every(name=>document.querySelector('#mapTexture-'+name+' [data-texture-flow]')?.dataset.frames==='8'),null,{timeout:60000});
 const sample=()=>page.evaluate(()=>Object.fromEntries(['water','lava','swamp','arcane'].map(name=>{const g=document.querySelector('#mapTexture-'+name+' [data-texture-flow]');return [name,{transform:g.getAttribute('transform'),front:g.children[0].getAttribute('href'),back:g.children[1].getAttribute('href'),opacity:g.children[1].getAttribute('opacity'),images:g.children.length}];})));
 const before=await sample(),after={};for(let attempt=0;attempt<8;attempt++){await page.waitForTimeout(500);const next=await sample();for(const name of Object.keys(next))if(next[name].front!==before[name].front)after[name]=next[name];if(Object.keys(after).length===4)break;}assert.equal(Object.keys(after).length,4,'Every moving material advances its bitmap frames');

 for(const name of Object.keys(before)){assert.equal(after[name].transform,null,name+' must not drift');assert.ok(after[name].front!==before[name].front,name+' changes its actual shaded bitmap');assert.ok(after[name].front!==after[name].back,name+' has different ripple phases');assert.equal(after[name].images,2);}
 const positions=()=>page.evaluate(()=>[...document.querySelectorAll('[data-flow-x]')].map(p=>({x:Number(p.dataset.flowX),y:Number(p.dataset.flowY),transform:p.firstElementChild.getAttribute('transform')})));
 const first=await positions();await page.waitForTimeout(300);const last=await positions();
 const parse=t=>t.match(/-?\d+(?:\.\d+)?/g).map(Number),wrap=v=>(v+640)%640;
 for(let i=0;i<first.length;i++){const a=parse(first[i].transform),b=parse(last[i].transform);assert.equal(b[1],a[1],'Zero Y stays still');if(first[i].x===0)assert.equal(b[0],a[0]);else assert.ok(wrap((b[0]-a[0])*first[i].x)>0,'Positive and negative X flow in opposite directions');}
 // Tile and brush fills use the same shared flow source and stay at a 640-unit repeat.
 const refs=await page.evaluate(()=>({tile:document.querySelector('[data-node="west"] pattern').getAttribute('href'),brush:document.querySelector('[data-node="zero"] pattern').getAttribute('href'),tileSize:document.querySelector('[data-node="west"] pattern').getAttribute('width')}));assert.equal(refs.tile,'#mapRiverFlow-n1-0');assert.equal(refs.brush,'#mapRiverFlow-0-0');assert.equal(refs.tileSize,'640');
 await page.locator('[data-node="east"]').click();assert.ok(await page.locator('#map2RiverFlow').isVisible());
 for(const [axis,value] of [['x','-0.5'],['y','1.2']]){const input=page.locator('[data-map2-property="flow_'+axis+'"]');await input.fill(value);await input.press('Tab');}
 await page.waitForTimeout(900);let saved=(await(await context.request.get(url)).json()).state.nodes.find(n=>n.id==='east');assert.equal(saved.flow_x,-.5);assert.equal(saved.flow_y,1.2);
 await page.uncheck('#map2Effects');await page.waitForTimeout(700);assert.ok(await page.locator('[data-node="east"] [fill="url(#mapTexture-water-still)"]').count());await page.check('#map2Effects');
 await page.locator('[data-node="water"]').click();assert.ok(await page.locator('#map2RiverFlow').isHidden());assert.ok(await page.locator('#map2Effects').isEnabled());
 const rotated=await page.evaluate(()=>{const root=document.querySelector('#map2Canvas'),id=MapMaterials.riverSource(root,{type:'river',rotation:90,flow_x:1,flow_y:0}),p=root.querySelector('#'+id);return [Number(p.dataset.flowX),Number(p.dataset.flowY)];});assert.deepEqual(rotated,[0,-1],'Flow compensates for part rotation to keep map directions');
 const merging=await page.evaluate(()=>{const a={id:'a',type:'river',x:0,y:0,w:40,h:40,flow_x:1,flow_y:0,tile_cells:[[0,0]],tile_base_w:40,tile_base_h:40},b={...a,id:'b',x:40,flow_x:-1},brush=n=>({...n,shape:'stroke',points:[[0,20],[40,20]],brush:40});return {tiles:MapTilePaint.merge([a,b],b).length,brushes:MapBrushes.merge([brush(a),brush(b)],brush(b)).length};});assert.deepEqual(merging,{tiles:2,brushes:2},'Opposite flows cannot be merged into one direction');
 const timing=await page.evaluate(async()=>{const gaps=[];let last=performance.now();for(let i=0;i<45;i++){await new Promise(requestAnimationFrame);const now=performance.now();gaps.push(now-last);last=now;}return {average:gaps.reduce((a,b)=>a+b)/gaps.length,max:Math.max(...gaps)};});assert.ok(timing.average<100,'Shared animated textures should remain responsive');console.log('Animation frame timings:',timing);
 await page.screenshot({path:path.join(__dirname,'artifacts/ripple-river-flow.png')});
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(200);const paused=await positions();await page.waitForTimeout(400);assert.deepEqual(await positions(),paused,'Reduced motion pauses rivers');
 assert.deepEqual(errors,[]);console.log('PASS: all four materials animate their actual images without drift; independent river directions, zero flow, brush and tile tiling, editor controls, persistence, effect toggle and reduced motion.');
 }finally{if(browser)await browser.close();server.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
