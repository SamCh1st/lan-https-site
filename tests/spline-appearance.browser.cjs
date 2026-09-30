require('./python-path.cjs');
/* Isolated application test: never writes to the user's campaign database. */
const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),base='https://127.0.0.1:8794';
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
sys.argv=['server.py','--port','8794']
server.main()`],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='';server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);
(async()=>{let browser;try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
 for(let i=0;i<80;i++){try{const response=await context.request.get(base,{timeout:1000});if(response.ok())break;}catch{}await new Promise(r=>setTimeout(r,250));if(i===79)throw Error(output);}
 const login=await context.request.post(base+'/api/login',{data:{username:'PartCardsQA',password:'Environment-QA-12345'}});assert.ok(login.ok(),await login.text());
 const campaign=(await(await context.request.get(base+'/api/work')).json()).items.find(r=>r.title==='Part Cards QA');

 const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.stack));

 await page.goto(base);await page.waitForFunction(()=>!!window.MapSplines&&!!window.MapArt);
 await page.evaluate(()=>{
 document.querySelectorAll('[id^=mapTexture-]').forEach(e=>e.id='qa-old-'+e.id);const host=document.createElement('div');host.style.cssText='position:absolute;inset:0;z-index:999999;background:#272c29;height:1120px';document.body.append(host);document.body.style.cssText='margin:0;background:#272c29;';
 const el=(tag,a,p)=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(a))e.setAttribute(k,v);p?.append(e);return e;};
 const svg=el('svg',{width:1400,height:1120,viewBox:'0 0 1400 1120'},host);MapArt.defs(svg);MapMaterials.update(svg,{light_angle:315,relief:1});
 const cases=[
 ['Saved fence',[[6,6],[206,46],[246,126],[86,126]],'fence',40,65,{}],
 ['Tight wall corners',[[0,0],[180,0],[190,100],[80,120],[110,30]],'wall',500,65,{spline_width:18}],
 ['Curved river',[[0,50],[110,0],[190,95],[280,0],[390,50]],'river',890,65,{spline_width:58}],
 ['Interior building',[[0,25],[240,0],[310,180],[15,210]],'building',40,330,{}],
 ['Hipped roof',[[0,0],[310,0],[310,210],[0,210]],'roof',490,330,{roof_texture:'roof_slate'}],
 ['L-shaped roof',[[0,0],[310,0],[310,95],[140,95],[140,240],[0,240]],'roof',940,330,{}],
 ['Near reversal',[[0,0],[200,0],[30,30],[210,80]],'fence',40,730,{}],
 ['Curved wall',[[0,50],[100,0],[180,100],[290,40]],'wall',500,730,{spline_curve:true,spline_width:20}],
 ['Narrow path',[[0,0],[100,80],[20,160],[170,195],[300,160]],'path',950,730,{spline_width:44}]
 ];
 for(const [label,pts,kind,x,y,settings] of cases){el('text',{x,y:y-15,fill:'#f4dfb5','font-size':20},svg).textContent=label;const n=MapSplines.build(pts,kind,settings),g=el('g',{transform:`translate(${x} ${y})`,'data-case':label},svg);n.id='test-'+label.replaceAll(' ','-');MapArt.render(n,g);}
 });
 await page.waitForFunction(()=>document.querySelectorAll('[data-fitted-roof][href]').length===2);await page.waitForTimeout(1500);assert.equal(await page.locator('[data-building-detail=wall-post][href*=kit_roof_hatch]').count(),0);await page.waitForFunction(()=>Number(document.querySelector('[data-case="Curved river"] canvas')?.dataset.frames)>1);
 await page.screenshot({path:path.join(__dirname,'artifacts/spline-appearance-'+(process.env.SPLINE_SHOT||'current')+'.png'),fullPage:true});

 await page.evaluate(()=>{const svg=document.querySelector('[data-case="Interior building"]').ownerSVGElement;svg.setAttribute('viewBox','25 315 340 240');svg.setAttribute('width','1020');svg.setAttribute('height','720');});
 await page.waitForTimeout(300);
 await page.locator('[data-case="Interior building"]').locator('xpath=..').screenshot({path:path.join(__dirname,'artifacts/building-corners-repaired.png')});
 assert.equal(await page.locator('[data-case="Interior building"] image[href*=kit_corner_buttress]').count(),0,'Corners use the selected wall material');
 await page.evaluate(()=>{const svg=document.querySelector('[data-case="Interior building"]').ownerSVGElement;svg.setAttribute('viewBox','0 0 1400 1120');svg.setAttribute('width','1400');svg.setAttribute('height','1120');});
 const roof=page.locator('[data-case="Hipped roof"] [data-fitted-roof]');
 const shade=async(angle,lamps=[])=>{const before=await roof.getAttribute('href');await page.evaluate(({angle,lamps})=>MapSurfaceLighting.update({time:lamps.length?'Night':'Day',light_angle:angle},lamps,()=>null),{angle,lamps});await page.waitForFunction(old=>document.querySelector('[data-case="Hipped roof"] [data-fitted-roof]').getAttribute('href')!==old,before);return roof.evaluate(async e=>{const img=new Image();img.src=e.getAttribute('href');await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const sample=x=>{const p=ctx.getImageData(Math.round(x*c.width),Math.round(c.height*.4),Math.round(c.width*.1),Math.round(c.height*.2)).data;const avg=[0,0,0];for(let i=0;i<p.length;i+=4)for(let ch=0;ch<3;ch++)avg[ch]+=p[i+ch]/(p.length/4);return avg;};return {left:sample(.03),right:sample(.87)};});};
 const east=await shade(0),west=await shade(180);assert.ok(east.right[0]>west.right[0]+8,'Right roof face responds to light on the right');assert.ok(west.left[0]>east.left[0]+8,'Left face responds to light on the left');
 const lamp=x=>({id:'test-lamp',cx:x,cy:105,radius:300,light_intensity:1,color:'#ff3010',room:null});const redLeft=await shade(0,[lamp(20)]),redRight=await shade(0,[lamp(290)]);assert.ok(redLeft.left[0]>redRight.left[0]+5,'Moving a local light changes the illuminated roof area');assert.ok(redLeft.left[0]-redRight.left[0]>redLeft.left[2]-redRight.left[2],'Colored light keeps its red tint');
 await page.screenshot({path:path.join(__dirname,'artifacts/spline-lighting-repair.png'),fullPage:true});
 const performance=await page.evaluate(async()=>{const host=document.querySelector('[data-case="Curved river"]').parentElement,el=(tag,a,p)=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(a))e.setAttribute(k,v);p.append(e);return e;};for(let i=0;i<15;i++){const n=MapSplines.build([[0,30],[80,0],[170,70],[260,20]],'river',{spline_width:35});n.id='perf-'+i;const g=el('g',{transform:`translate(${(i%5)*270} ${600+Math.floor(i/5)*110})`},host);MapArt.render(n,g);}await new Promise(r=>setTimeout(r,500));let frames=0,last=performance.now(),start=last,maxGap=0;await new Promise(resolve=>{function frame(now){maxGap=Math.max(maxGap,now-last);last=now;frames++;if(now-start<2000)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});return {fps:frames/((last-start)/1000),maxGap,active:MapSplineFlow.active};});assert.ok(performance.fps>25,JSON.stringify(performance));console.log('River navigation frame rate:',JSON.stringify(performance));
 assert.deepEqual(errors,[]);console.log('PASS: detailed spline appearance, opposite sun directions, moving colored roof light, and 16 flowing rivers.');
 }finally{if(browser)await browser.close();server.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
