require('./python-path.cjs');
/* Isolated application test: never writes to the user's campaign database. */
const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),base='https://127.0.0.1:8787';
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
sys.argv=['server.py','--port','8787']
server.main()`],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='';server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);
(async()=>{let browser;try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
 for(let i=0;i<80;i++){try{if((await context.request.get(base,{timeout:1000})).ok())break;}catch{}await new Promise(r=>setTimeout(r,250));if(i===79)throw Error(output);}
 assert.ok((await context.request.post(base+'/api/login',{data:{username:'PartCardsQA',password:'Environment-QA-12345'}})).ok());
 const campaign=(await(await context.request.get(base+'/api/work')).json()).items.find(r=>r.title==='Part Cards QA'),mapsUrl=base+'/api/campaign/'+campaign.id+'/maps',listing=(await(await context.request.get(mapsUrl)).json()),mapUrl=mapsUrl+'/'+listing.active_map_id,map=(await(await context.request.get(mapUrl)).json());
 const nodes=Array.from({length:180},(_,i)=>({id:'scene-prop-'+i,type:['chair','barrel','oak_tree','table'][i%4],x:-420+i%18*48,y:-220+Math.floor(i/18)*48,w:34,h:34}));
 assert.ok((await context.request.put(mapUrl,{data:{revision:map.revision,state:{nodes,canvas:{background:'wood'},scene:{time:'Day',weather:'Clear'}}}})).ok());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('.campaign-row').filter({hasText:'Part Cards QA'}).click();await page.locator('#mapWorkspaceHeader [data-map-fullscreen]').click();
 await page.waitForFunction(()=>document.querySelectorAll('[data-height-lit]').length>=130);await page.waitForTimeout(1200);
 const profiler=process.env.PROFILE_SCENE?await context.newCDPSession(page):null;if(profiler){await profiler.send('Profiler.enable');await profiler.send('Profiler.start');}
 const result=await page.evaluate(async()=>{
  const initial=[...document.querySelectorAll('[data-height-lit]')].map(n=>n.getAttribute('href')),gaps=[],calls=[],longTasks=[];let running=true,last=performance.now();
  const observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>e.duration)));observer.observe({entryTypes:['longtask']});const frame=now=>{gaps.push(now-last);last=now;if(running)requestAnimationFrame(frame);};requestAnimationFrame(frame);
  for(const time of ['Night','Morning','Evening','Day','Dawn','Night']){const start=performance.now();const input=document.querySelector('[data-scene=time]');input.value=time;input.dispatchEvent(new Event('change',{bubbles:true}));calls.push(performance.now()-start);await new Promise(r=>setTimeout(r,350));}
  await new Promise(r=>setTimeout(r,500));running=false;observer.disconnect();gaps.sort((a,b)=>a-b);const final=[...document.querySelectorAll('[data-height-lit]')].map(n=>n.getAttribute('href'));
  return {changed:final.filter((href,i)=>href!==initial[i]).length,parts:initial.length,maxSceneCall:Math.max(...calls),averageFrame:gaps.reduce((a,b)=>a+b,0)/gaps.length,p95:gaps[Math.floor(gaps.length*.95)],maxFrame:Math.max(...gaps),maxLongTask:Math.max(0,...longTasks)};
 });if(profiler){const {profile}=await profiler.send('Profiler.stop'),counts=new Map();for(let i=0;i<profile.samples.length;i++)counts.set(profile.samples[i],(counts.get(profile.samples[i])||0)+profile.timeDeltas[i]);console.log('Scene CPU:',[...counts].sort((a,b)=>b[1]-a[1]).slice(0,16).map(([id,time])=>({ms:Math.round(time/1000),frame:profile.nodes.find(n=>n.id===id).callFrame})));}
 console.log('180 parts, repeated scene changes:',result);assert.ok(result.changed>40,'Surface artwork actually updates with the scene');assert.ok(result.averageFrame<35,'Scene changes keep navigation responsive');assert.ok(result.maxLongTask<150,'No prolonged main-thread scene freeze');assert.deepEqual(errors,[]);
 const scroll=await page.evaluate(async()=>{
  const input=document.querySelector('[data-scene=time]');input.value='Evening';input.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,600));
  const svg=document.getElementById('map2Canvas'),canvas=document.getElementById('mapPointLighting'),box=svg.getBoundingClientRect(),gaps=[];let last=performance.now(),uncovered=0;const start=svg.getAttribute('viewBox');
  for(let i=0;i<36;i++){for(let event=0;event<3;event++)svg.dispatchEvent(new WheelEvent('wheel',{deltaY:i<18?-100:100,clientX:box.x+box.width/2,clientY:box.y+box.height/2,bubbles:true,cancelable:true}));await new Promise(requestAnimationFrame);const now=performance.now();gaps.push(now-last);last=now;const bounds=canvas.getBoundingClientRect();if(bounds.left>box.left+1||bounds.top>box.top+1||bounds.right<box.right-1||bounds.bottom<box.bottom-1)uncovered++;}
  gaps.sort((a,b)=>a-b);return {averageFrame:gaps.reduce((a,b)=>a+b)/gaps.length,maxFrame:Math.max(...gaps),p95:gaps[Math.floor(gaps.length*.95)],uncovered,moved:start!==svg.getAttribute('viewBox')};
 });console.log('Scrolling through 180 parts:',scroll);assert.ok(scroll.moved);assert.equal(scroll.uncovered,0,'Lighting covers the map while zooming');assert.ok(scroll.averageFrame<35,'Scroll input stays responsive');
 console.log('PASS: repeated scene changes shade visible surfaces without blocking navigation.');
 }finally{if(browser)await browser.close();server.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
