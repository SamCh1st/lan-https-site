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
 await page.locator('[data-map-mode="edit"]').click();
 await page.locator('#mapWorkspaceHeader [data-map-fullscreen]').click();
 await page.locator('[data-map2-group="settlement"]').click();
 const types=await page.evaluate(()=>MapSettlement.types);
 for(const type of types) assert.equal(await page.locator('[data-map2-catalog="settlement"] [data-map2-tool="'+type+'"]:visible').count(),1,type);
 const artwork=await page.evaluate(async()=>{
  const checks=[];
  for(const type of MapSettlement.types){
   if(!MapSprites.has(type))throw Error('Missing painted sprite: '+type);
   const image=new Image();image.src=await MapSprites.tile(type);await image.decode();
   const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,64,64);
   const pixels=ctx.getImageData(0,0,64,64).data;let clear=0,opaque=0;const colors=new Set();
   for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]===0)clear++;if(pixels[i+3]>200){opaque++;colors.add(pixels.slice(i,i+3).join(','));}}
   if(clear<400||opaque<100||colors.size<150)throw Error('Missing transparent detailed artwork: '+type);
   const lit=await MapSurfaceLighting.bitmap({type,x:0,y:0,w:160,h:160},64);if(!lit.canvas)throw Error('Missing relief image');
   checks.push(type);
  }return checks;
 });assert.equal(artwork.length,60);
 const button=page.locator('[data-map2-catalog="settlement"] [data-map2-tool="thatched_house"]');
 await button.click();const box=await page.locator('#map2Canvas').boundingBox();await page.mouse.click(box.x+box.width*.5,box.y+box.height*.5);
 for(const type of ['empty_tilled_plot','crop_cabbage']){
  await page.locator('[data-map2-catalog="settlement"] [data-map2-tool="'+type+'"]').click();
  await page.mouse.click(box.x+box.width*.65,box.y+box.height*.6);
 }
 const listing=await(await context.request.get(base+'/api/campaign/'+campaign.id+'/maps')).json(),url=base+'/api/campaign/'+campaign.id+'/maps/'+listing.active_map_id;
 await page.waitForTimeout(1500);
 const map=await(await context.request.get(url)).json();const placed=map.state.nodes.find(n=>n.type==='thatched_house');assert.ok(placed,'House must save through the real editor');
 const plot=map.state.nodes.find(n=>n.type==='empty_tilled_plot'),crop=map.state.nodes.find(n=>n.type==='crop_cabbage');
 assert.ok(plot&&crop);assert.notEqual(plot.id,crop.id);assert.equal(plot.w,200);assert.equal(plot.h,160);assert.equal(crop.w,40);assert.equal(crop.h,40);
 await page.reload();await page.locator('.campaign-row').filter({hasText:'Part Cards QA'}).click();await page.locator('[data-node="'+placed.id+'"]').waitFor();
 for(const node of [plot,crop])await page.locator('[data-node="'+node.id+'"] [data-map-sprite="'+node.type+'"]').waitFor();
 await page.locator('[data-map-mode="edit"]').click();await page.locator('#mapWorkspaceHeader [data-map-fullscreen]').click();await page.locator('[data-map2-group="settlement"]').click();
 await page.screenshot({path:path.join(__dirname,'artifacts/settlement-edit-mode.png')});assert.deepEqual(errors,[]);
 console.log('PASS: 60 painted transparent sprites, relief rendering, house and separate farm plot/crop placement, dimensions, save and reload');
 }finally{await browser?.close();server.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
