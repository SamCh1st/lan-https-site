require('./python-path.cjs');
/* Isolated application test: never writes to the user's campaign database. */
const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),base='https://127.0.0.1:17902';
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
sys.argv=['server.py','--port','17902']
server.main()`],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='';server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);
(async()=>{let browser;try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
 for(let i=0;i<80;i++){try{const response=await context.request.get(base,{timeout:1000});if(response.ok())break;}catch{}await new Promise(r=>setTimeout(r,250));if(i===79)throw Error(output);}
 const login=await context.request.post(base+'/api/login',{data:{username:'PartCardsQA',password:'Environment-QA-12345'}});assert.ok(login.ok(),await login.text());
 const campaign=(await(await context.request.get(base+'/api/work')).json()).items.find(r=>r.title==='Part Cards QA');



 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='warning'&&m.text().includes('canvas light'))errors.push(m.text());});
 await page.goto(base);await page.locator('.campaign-row').filter({hasText:'Part Cards QA'}).click();await page.locator('#mapWorkspaceHeader [data-map-fullscreen]').click();await page.evaluate(()=>Map2D.sync=()=>{});await page.waitForTimeout(300);

 await page.evaluate(()=>{Map2D.configure({nodes:[{id:'room',type:'building',x:-1000,y:-800,w:2000,h:1600,floor_texture:'wood'},{id:'desk',type:'writing_desk',x:-180,y:-100,w:160,h:160},{id:'log',type:'fallen_log',x:80,y:-80,w:180,h:130,rotation:-30},{id:'lamp',type:'point_light',x:-250,y:-800,w:1100,h:1100,color:'#ff3300',light_intensity:1}],players:[],edit:false,dm:true,canvas:{grid:false},onChange:()=>{},onCanvasChange:()=>{}});MapLighting.update({time:'Day'});});
 await page.waitForTimeout(1500);await page.evaluate(async()=>{const svg=document.querySelector('#map2Canvas'),r=svg.getBoundingClientRect();for(let i=0;i<6;i++){svg.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,clientX:r.x+r.width/2,clientY:r.y+r.height/2,bubbles:true,cancelable:true}));await new Promise(requestAnimationFrame);}});await page.waitForTimeout(1000);await page.screenshot({path:require('node:path').join(__dirname,'artifacts/shadow-edge-scene.png')});
 const edges=await page.evaluate(async()=>{const results=[];for(const type of ['writing_desk','fallen_log','driftwood','chair'])for(const resolution of [96,128,192]){const n={type,w:160,h:160},rects=await new Promise(resolve=>{const ready=()=>{const r=MapSilhouettes.request(n,ready,resolution);if(r?.resolution===resolution)resolve(r);};ready();}),art=document.createElement('canvas'),cut=document.createElement('canvas');art.width=art.height=cut.width=cut.height=resolution*4;MapSprites.draw(art.getContext('2d'),type,await MapSprites.load(type),art.width);cut.getContext('2d').drawImage(rects.alpha,0,0,cut.width,cut.height);const a=art.getContext('2d').getImageData(0,0,art.width,art.height).data,c=cut.getContext('2d').getImageData(0,0,cut.width,cut.height).data;let exposedFloor=0,cutFloor=0,opaque=0,protectedBody=0;for(let i=3;i<a.length;i+=4){if(a[i]<32){exposedFloor++;if(c[i]>8)cutFloor++;}if(a[i]>250){opaque++;if(c[i]>230)protectedBody++;}}results.push({type,resolution,cutFloor,exposedFloor,protectedBody:protectedBody/opaque});}return results;});
 for(const r of edges){assert.equal(r.cutFloor,0,`${r.type} at ${r.resolution}: shadow cutout must not brighten exposed floor`);assert.ok(r.protectedBody>.55,`${r.type}: the opaque body remains protected from its own shadow`);}assert.deepEqual(errors,[]);console.log('PASS: no bright floor fringe on enlarged desk, wood and chair masks at all shadow detail levels.',edges);
 }finally{if(browser)await browser.close();server.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});

