require('./python-path.cjs');
/* Isolated application test: never writes to the user's campaign database. */
const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),base='https://127.0.0.1:8788';
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
storage.create_work(uid,'Three QA',{'category':'campaign','initial_map_kind':'3d'})
sys.argv=['server.py','--port','8788']
server.main()`],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='';server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);
(async()=>{let browser;try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
 for(let i=0;i<80;i++){try{const response=await context.request.get(base,{timeout:1000});if(response.ok())break;}catch{}await new Promise(r=>setTimeout(r,250));if(i===79)throw Error(output);}
 const login=await context.request.post(base+'/api/login',{data:{username:'PartCardsQA',password:'Environment-QA-12345'}});assert.ok(login.ok(),await login.text());
 const campaign=(await(await context.request.get(base+'/api/work')).json()).items.find(r=>r.title==='Part Cards QA');
 
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.stack));
 await page.addInitScript(()=>{
  window.map3Contexts=[];window.map3Frames=0;window.map3Signals=[];
  const get=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(type,...args){const result=get.call(this,type,...args);if(this.id==='campaignMapCanvas'&&result){map3Contexts.push(result);const clear=result.clear.bind(result);result.clear=(...a)=>{map3Frames++;return clear(...a);};}return result;};
  const listen=EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener=function(type,handler,options){if(options?.signal&&new Error().stack.includes('map3d.js'))map3Signals.push(options.signal);return listen.call(this,type,handler,options);};
 });
 await page.goto(base);await page.locator('.campaign-row').filter({hasText:'Part Cards QA'}).click();await page.locator('#map2Canvas').waitFor({state:'visible'});

 assert.deepEqual(await page.evaluate(()=>[campaignMap.initialized,map3Contexts.length,document.getElementById('mapPlaceholder').hidden]),[false,0,true]);
 await page.evaluate(()=>{campaignMap.activate();campaignMap.setIcons([]);campaignMap.setSharedState({});});
 assert.equal(await page.evaluate(()=>map3Contexts.length),0,'2D never initializes the 3D renderer');
 for(let cycle=0;cycle<2;cycle++){
  await page.click('#campaignBack');await page.locator('.campaign-row').filter({hasText:'Three QA'}).click();
  await page.waitForFunction(()=>campaignMap.active&&map3Frames>0);
  assert.ok(await page.locator('#map2Surface').isHidden());assert.ok(await page.locator('#campaignMapCanvas').isVisible());
  assert.equal(await page.evaluate(()=>map3Contexts.length),cycle+1);
  assert.equal(await page.locator('.map-sized-tool .map-sized-tool').count(),0,'No duplicate controls on reopening');
  await page.click('#campaignBack');await page.locator('.campaign-row').filter({hasText:'Part Cards QA'}).click();await page.locator('#map2Canvas').waitFor({state:'visible'});
  const stopped=await page.evaluate(()=>({frames:map3Frames,lost:map3Contexts.every(gl=>gl.isContextLost()),aborted:map3Signals.every(s=>s.aborted),initialized:campaignMap.initialized}));
  assert.ok(stopped.lost,'All old 3D graphics contexts released');assert.ok(stopped.aborted,'3D event listeners removed');assert.equal(stopped.initialized,false);
  await page.keyboard.press('w');await page.evaluate(()=>{window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('resize'));campaignMap.setIcons([]);campaignMap.activate();});await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>map3Frames),stopped.frames,'No 3D frames after entering 2D');
 }
 // Every added marker has a usable transparent item image and an atlas crop of that same image.
 const assets=await page.evaluate(async()=>{
  const types=Object.values(MapLocationStamps.collections).flat(),result=[];
  for(const type of types){const image=new Image();image.src='/assets/map-art/items/'+type+'.png';await image.decode();const tile=new Image();tile.src=await MapSprites.tile(type);await tile.decode();const a=document.createElement('canvas');a.width=a.height=128;const ctx=a.getContext('2d');ctx.drawImage(image,0,0,128,128);const pixels=ctx.getImageData(0,0,128,128).data;let visible=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])visible++;result.push({type,size:image.width,visible,corner:pixels[3],shadow:MapPartProfiles.noShadow.has(type)});}
  return {items:result,total:MapSprites.markers.length};
 });assert.equal(assets.total,48);assert.equal(assets.items.length,32);for(const a of assets.items){assert.equal(a.size,512);assert.equal(a.corner,0);assert.ok(a.visible>1000&&a.visible<14000,a.type);assert.ok(a.shadow);}
 await page.evaluate(()=>{const gallery=document.createElement('div');gallery.id='stamp-gallery';gallery.style.cssText='position:fixed;inset:0;z-index:100000;background:#292e35;display:grid;grid-template-columns:repeat(8,1fr);color:#eee;font:13px sans-serif;padding:12px';for(const type of Object.values(MapLocationStamps.collections).flat()){const card=document.createElement('div');card.style.cssText='display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid #555';card.innerHTML=MapSprites.icon(type)+'<span>'+MapLocationStamps.labels[type].replace(' marker','')+'</span>';card.querySelector('svg').style.cssText='width:145px;height:180px';gallery.append(card);}document.body.append(gallery);});
 await page.waitForTimeout(300);await page.screenshot({path:path.join(__dirname,'artifacts/new-location-stamps.png')});await page.evaluate(()=>document.getElementById('stamp-gallery').remove());
 await page.locator('#mapWorkspaceHeader [data-map-fullscreen]').click();
 await page.evaluate(()=>{Map2D.sync=()=>{};Map2D.configure({nodes:[{id:'near',type:'chest',x:40,y:0,w:40,h:40,money_cp:1},{id:'far',type:'chest',x:200,y:0,w:40,h:40,money_cp:1},{id:'decor',type:'table',x:0,y:80,w:40,h:40}],players:[{id:901,x:0,z:0,character_name:'Walker'}],viewerId:901,dm:false,edit:false,canvas:{grid:true,background:'empty'},getRecords:()=>[{id:100,content:{category:'character',owner_user_id:901,tabletop:{interaction_range:2}}}],onPositionChange:()=>Promise.resolve(true),onChange:()=>{},onCanvasChange:()=>{}});});
 const hover=async(x,y)=>{const point=await page.evaluate(([x,y])=>{const p=new DOMPoint(x,y).matrixTransform(document.querySelector('#map2Canvas').getScreenCTM());return {x:p.x,y:p.y};},[x,y]);await page.mouse.move(point.x,point.y);await page.waitForTimeout(150);};
 await hover(60,20);assert.equal(await page.locator('[data-node="near"].map-part-clickable-hover').count(),1,'Reachable actionable part highlighted');
 await hover(220,20);assert.equal(await page.locator('.map-part-clickable-hover').count(),0,'Distant actions not highlighted');
 await hover(20,100);assert.equal(await page.locator('.map-part-clickable-hover').count(),0,'Decorations not highlighted in play');
 await hover(60,60);await page.waitForFunction(()=>document.getElementById('map2WalkHover').getAttribute('visibility')==='visible');
 await page.mouse.move(1,1);assert.equal(await page.locator('.map-part-clickable-hover').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: 2D never initializes 3D; repeated 3D→2D switches release contexts/listeners and stop rendering; 32 new transparent stamp/item images, 48 locations; range-aware highlights and tile border.');
 }finally{if(browser)await browser.close();server.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
