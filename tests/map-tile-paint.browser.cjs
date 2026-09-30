require('./python-path.cjs');
/* Isolated application test: never writes to the user's campaign database. */
const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),base='https://127.0.0.1:8784';
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
sys.argv=['server.py','--port','8784']
server.main()`],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='';server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);
(async()=>{let browser;try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
 for(let i=0;i<80;i++){try{const response=await context.request.get(base,{timeout:1000});if(response.ok())break;}catch{}await new Promise(r=>setTimeout(r,250));if(i===79)throw Error(output);}
 const login=await context.request.post(base+'/api/login',{data:{username:'PartCardsQA',password:'Environment-QA-12345'}});assert.ok(login.ok(),await login.text());
 const campaign=(await(await context.request.get(base+'/api/work')).json()).items.find(r=>r.title==='Part Cards QA');


 const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.stack));await page.goto(base);await page.locator('.campaign-row').filter({hasText:'Part Cards QA'}).click();await page.locator('[data-map-mode="edit"]').click();await page.locator('#mapWorkspaceHeader [data-map-fullscreen]').click();await page.locator('[data-map2-group="terrain"]').click();await page.locator('[data-map2-tool="wood"]').click();await page.check('#map2TileDraw');await page.uncheck('#map2Snap');assert.ok(await page.locator('#map2BrushSize').isDisabled());assert.ok(await page.locator('#map2DrawMode').isDisabled());
 const screen=async(x,y)=>page.evaluate(([x,y])=>{const p=new DOMPoint(x*40+20,y*40+20).matrixTransform(document.querySelector('#map2Canvas').getScreenCTM());return {x:p.x,y:p.y};},[x,y]);
 const stroke=async(a,b)=>{const from=await screen(...a),to=await screen(...b);await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y);await page.mouse.up();await page.waitForTimeout(700);};
 const listing=(await(await context.request.get(base+'/api/campaign/'+campaign.id+'/maps')).json()),url=base+'/api/campaign/'+campaign.id+'/maps/'+listing.active_map_id;
 const read=async()=> (await(await context.request.get(url)).json()).state.nodes;
 await stroke([-4,0],[4,0]);let nodes=await read();assert.equal(nodes.length,1);assert.equal(nodes[0].tile_cells.length,9);assert.equal(nodes[0].x,-160);assert.equal(nodes[0].w,360);assert.equal(nodes[0].h,40);assert.equal(await page.locator('[data-tile-paint]').count(),1);
 await stroke([4,0],[7,0]);nodes=await read();assert.equal(nodes.length,1,'Consecutive matching tile strokes merge');assert.equal(nodes[0].tile_cells.length,12,'The shared tile is painted only once');
 await page.locator('[data-map2-action="undo"]').click();await page.waitForTimeout(700);nodes=await read();assert.equal(nodes[0].tile_cells.length,9);
 await page.check('#map2Reverse');await stroke([0,0],[0,0]);nodes=await read();assert.equal(nodes[0].tile_cells.length,8);assert.ok(!nodes[0].tile_cells.some(([x,y])=>x===4&&y===0));
 await page.locator('[data-map2-action="undo"]').click();await page.waitForTimeout(700);nodes=await read();assert.equal(nodes[0].tile_cells.length,9);await page.uncheck('#map2Reverse');
 await page.uncheck('#map2TileDraw');assert.ok(await page.locator('#map2BrushSize').isEnabled());await stroke([-4,3],[-1,3]);nodes=await read();assert.ok(nodes.some(n=>n.shape==='stroke'&&!n.tile_cells),'Unchecked returns to freehand painting');
 await page.screenshot({path:path.join(__dirname,'artifacts/tile-draw-wood.png')});assert.deepEqual(errors,[]);console.log('PASS: grid paint with snap off, fast-drag coverage, one part per stroke, consecutive merge without duplicate tiles, exact tile erasing, undo, persistence and freehand toggle.');
 }finally{if(browser)await browser.close();server.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
