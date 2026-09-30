require('./python-path.cjs');
/* Isolated application test: never writes to the user's campaign database. */
const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),base='https://127.0.0.1:8786';
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
sys.argv=['server.py','--port','8786']
server.main()`],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='';server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);
(async()=>{let browser;try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
 for(let i=0;i<80;i++){try{const response=await context.request.get(base,{timeout:1000});if(response.ok())break;}catch{}await new Promise(r=>setTimeout(r,250));if(i===79)throw Error(output);}
 const login=await context.request.post(base+'/api/login',{data:{username:'PartCardsQA',password:'Environment-QA-12345'}});assert.ok(login.ok(),await login.text());
 const campaign=(await(await context.request.get(base+'/api/work')).json()).items.find(r=>r.title==='Part Cards QA');



 const page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.stack);console.error(e.stack);});
 await context.route('**/api/uploads/900001',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="22" r="18" fill="#ccbba0"/><path d="M28 43 Q50 30 72 43 L82 90 Q50 100 18 90Z" fill="#56764d"/></svg>'}));
 await page.goto(base);await page.locator('.campaign-row').filter({hasText:'Part Cards QA'}).click();await page.locator('#mapWorkspaceHeader [data-map-fullscreen]').click();
 const setup=async(indoor=false)=>page.evaluate(indoor=>{
  window.moves=[];window.testPlayers=[{id:901,x:0,z:0,character_name:'Walker',character_image_id:900001},{id:902,x:0,z:3,character_name:'Other',character_image_id:900001}];
  const nodes=indoor?[{id:'room',type:'building',x:-240,y:-200,w:640,h:480},{id:'lamp',type:'lantern',x:-140,y:-60,w:24,h:24,light_radius:500,light_intensity:1,fire_light:false}]:[{id:'tree',type:'pine_tree',x:-160,y:-160,w:70,h:70}];
  Map2D.configure({nodes,players:testPlayers,viewerId:901,dm:false,edit:false,canvas:{grid:true,background:'empty'},getRecords:()=>[{id:100,content:{category:'character',owner_user_id:901,tabletop:{interaction_range:10}}}],onPositionChange:(id,x,z,y,motion)=>{moves.push({id,x,z,motion});return Promise.resolve(true);},onChange:()=>{},onCanvasChange:()=>{}});MapLighting.update({time:indoor?'Night':'Evening',weather:'Clear',temperature:'Mild'});
 },indoor);
 const click=async(x,y)=>{const p=await page.evaluate(([x,y])=>{const p=new DOMPoint(x*40+20,y*40+20).matrixTransform(document.querySelector('#map2Canvas').getScreenCTM());return {x:p.x,y:p.y};},[x,y]);await page.mouse.click(p.x,p.y);};
 const state=()=>page.evaluate(()=>({positions:testPlayers.map(p=>[p.x,p.z]),lighting:{...document.querySelector('#mapPointLighting').dataset},moving:MapTokenWalk.moving,path:JSON.parse(document.querySelector('#map2Canvas').dataset.walkPath||'[]')}));
 const shadow=()=>page.evaluate(()=>{const c=document.querySelector('#mapPointLighting'),svg=document.querySelector('#map2Canvas'),r=c.getBoundingClientRect(),m=svg.getScreenCTM(),ctx=c.getContext('2d'),data=ctx.getImageData(0,0,c.width,c.height).data;let sum=0,xsum=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const wx=(r.left+x*r.width/c.width-m.e)/m.a,wy=(r.top+y*r.height/c.height-m.f)/m.d;if(wy<0||wy>85||wx< -35||wx>360)continue;const alpha=data[(y*c.width+x)*4+3];sum+=alpha;xsum+=wx*alpha;}return {sum,x:sum?xsum/sum:0};});
 await page.evaluate(()=>{Map2D.sync=()=>{};});await setup();await page.waitForFunction(()=>document.querySelector('#mapPointLighting')?.dataset.movingObjects==='2');await page.waitForTimeout(700);const initial=await state(),shade0=await shadow();assert.ok(shade0.sum>0,'Portrait casts a daylight shadow');
 await click(8,0);await page.waitForFunction(()=>testPlayers[0].x>.7&&testPlayers[0].x<7);const mid1=await state();await page.waitForFunction(()=>document.querySelector('#map2WalkHover')?.getAttribute('visibility')==='visible'&&MapTokenWalk.moving);const glow=await page.evaluate(async()=>{let visible=0;for(let i=0;i<20;i++){await new Promise(requestAnimationFrame);if(document.querySelector('#map2WalkHover').getAttribute('visibility')==='visible')visible++;}return visible;});assert.equal(glow,20,'Tile border stays visible throughout movement and route checks');await page.waitForTimeout(100);const shade1=await shadow(),mid2=await state();
 assert.ok(mid2.moving,'The player is still walking');assert.ok(shade1.x>shade0.x+20,'Actual shadow pixels follow during the walk');assert.equal(mid2.lighting.geometryRevision,initial.lighting.geometryRevision,'Walking reuses static geometry');const shadowPosition=JSON.parse(mid2.lighting.tokenPositions).find(p=>p[0]==='character-token-901');assert.ok(Math.abs(shadowPosition[1]-(mid2.positions[0][0]*40+3))<18,'Shadow follows the current position, not the destination');
 await click(-3,2);await page.waitForFunction(()=>JSON.parse(document.querySelector('#map2Canvas').dataset.walkPath).at(-1).join(',')==='-3,2');assert.ok((await state()).moving);await page.waitForFunction(()=>!MapTokenWalk.moving);await MapFlush();let end=await state();assert.deepEqual(end.positions[0],[-3,2]);assert.deepEqual(end.positions[1],[0,3]);assert.ok(await page.evaluate(()=>!moves.some(p=>p.x===8&&p.z===0)),'Old destination is never reached after redirecting');
 // Rapid clicks replace pending routes as well as a route already in motion.
 await click(4,2);await page.waitForFunction(()=>MapTokenWalk.moving&&testPlayers[0].x>-2.8);await click(4,-2);await click(-2,-2);await page.waitForFunction(()=>!MapTokenWalk.moving&&testPlayers[0].x===-2&&testPlayers[0].z===-2);await MapFlush();
 async function MapFlush(){await page.evaluate(()=>MapTokenWalk.flush());await page.waitForTimeout(150);}
 await setup(true);await page.waitForTimeout(700);const lampInitial=await state();const pixels=()=>page.evaluate(()=>{const c=document.querySelector('#mapPointLighting'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let total=0;for(let i=0;i<d.length;i+=4)total=(total+d[i]*3+d[i+1]*5+d[i+2]*7+d[i+3]*11)%1000000007;return total;});const a=await pixels();await click(3,0);await page.waitForFunction(()=>testPlayers[0].x>1&&testPlayers[0].x<3);const b=await pixels(),lampMid=await state();assert.notEqual(a,b,'Lamp shadow pixels update during movement');assert.equal(lampMid.lighting.geometryRevision,lampInitial.lighting.geometryRevision);await page.waitForFunction(()=>!MapTokenWalk.moving);await MapFlush();
 const stress=await page.evaluate(async()=>{
  const lamps=Array.from({length:24},(_,i)=>({id:'stress-lamp-'+i,type:'lantern',x:-220+i%8*75,y:-120+Math.floor(i/8)*110,w:24,h:24,light_radius:430,light_intensity:.65,fire_light:true,fire_wave:.5,fire_flicker:.5}));
  const props=Array.from({length:48},(_,i)=>({id:'stress-prop-'+i,type:i%2?'barrel':'chair',x:-240+i%12*55,y:-160+Math.floor(i/12)*100,w:30,h:30}));
  Map2D.configure({nodes:[{id:'stress-room',type:'building',x:-400,y:-300,w:1100,h:800},...lamps,...props],players:testPlayers=[{id:901,x:0,z:0,character_image_id:900001}],viewerId:901,dm:false,edit:false,canvas:{background:'empty'},getRecords:()=>[],onPositionChange:()=>Promise.resolve(true)});MapLighting.update({time:'Night'});
  await new Promise(r=>setTimeout(r,1500));const canvas=document.querySelector('#mapPointLighting'),maskStart=Number(canvas.dataset.maskBuilds),frames=[],renders=[],errors=[];let last=performance.now();MapTokenWalk.go(901,[8,0],10);const start=last;
  while(performance.now()-start<2200){await new Promise(requestAnimationFrame);const now=performance.now();frames.push(now-last);last=now;renders.push(Number(canvas.dataset.renderMs));if(MapTokenWalk.moving){const shadow=JSON.parse(canvas.dataset.tokenPositions).find(p=>p[0]==='character-token-901');errors.push(Math.abs(shadow[1]-(testPlayers[0].x*40+3)));}}
  frames.sort((a,b)=>a-b);return {maskBuilds:Number(canvas.dataset.maskBuilds)-maskStart,averageFrame:frames.reduce((a,b)=>a+b,0)/frames.length,p95:frames[Math.floor(frames.length*.95)],maxRender:Math.max(...renders),maxShadowLag:Math.max(...errors),samples:errors.length};
 });console.log('24 lights with moving character:',stress);assert.equal(stress.maskBuilds,0,'Walking reuses all static light masks');assert.ok(stress.samples>15);assert.ok(stress.maxShadowLag<.1,'Shadow and character positions match in the same frame');assert.ok(stress.averageFrame<40,'Movement stays responsive under overlapping lights');
 console.log('Daylight centroid:',shade0.x.toFixed(1),'→',shade1.x.toFixed(1),'; indoor shadow render:',lampMid.lighting.renderMs,'ms');
 await page.screenshot({path:path.join(__dirname,'artifacts/moving-player-shadows.png')});assert.deepEqual(errors,[]);console.log('PASS: daylight and lamp shadow pixels follow walking players, static geometry retained, latest destination wins mid-walk and on rapid clicks, no other player moved.');
 }finally{if(browser)await browser.close();server.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
