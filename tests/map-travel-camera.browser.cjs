require('./python-path.cjs');
/* Isolated application test: never writes to the user's campaign database. */
const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),base='https://127.0.0.1:8796';
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
cid=storage.create_work(uid,'Travel Camera QA',{'category':'campaign','initial_map_kind':'2d'})['id']
player=storage.create_user('TravelPlayerQA',None,'Environment-QA-12345')
storage.invite_to_campaign(uid,cid,'TravelPlayerQA')
storage.answer_invite(player,cid,True)
storage.create_work(uid,'Travel Hero',{'category':'character','campaign_id':cid,'owner_user_id':player})
sys.argv=['server.py','--port','8796']
server.main()`],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='';server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);
(async()=>{let browser;try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const dm=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}}),player=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
 for(let i=0;i<80;i++){try{if((await dm.request.get(base,{timeout:1000})).ok())break;}catch{}await new Promise(r=>setTimeout(r,250));if(i===79)throw Error(output);}
 for(const [context,username] of [[dm,'PartCardsQA'],[player,'TravelPlayerQA']])assert.ok((await context.request.post(base+'/api/login',{data:{username,password:'Environment-QA-12345'}})).ok());
 const campaign=(await(await dm.request.get(base+'/api/work')).json()).items.find(r=>r.title==='Travel Camera QA'),url=base+'/api/campaign/'+campaign.id+'/maps';
 const main=(await(await dm.request.get(url)).json()).maps[0];
 const destination=await(await dm.request.post(url,{data:{title:'Destination'}})).json(),oneWay=await(await dm.request.post(url,{data:{title:'One way'}})).json();
 async function patch(id,nodes){const map=await(await dm.request.get(url+'/'+id)).json();const r=await dm.request.put(url+'/'+id,{data:{revision:map.revision,state:{nodes}}});assert.ok(r.ok(),await r.text());}
 const part=(id,x,y,mapId,extra={})=>({id,type:'portal',x,y,w:80,h:80,connected_map_id:mapId,...extra});
 await patch(main.id,[part('enter',80,0,destination.id)]);
 await patch(destination.id,[part('hidden-return',-2200,1800,main.id,{hidden:true}),part('return',1800,-1200,main.id,{rotation:35}),part('one-way',1920,-1200,oneWay.id)]);
 await patch(oneWay.id,[]);await dm.request.put(url+'/'+main.id+'/activate',{data:{}});
 const errors=[],d=await dm.newPage(),p=await player.newPage();
 for(const page of [d,p]){page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('.campaign-row').filter({hasText:'Travel Camera QA'}).click();await page.locator('#map2Canvas').waitFor({state:'visible'});}
 const view=page=>page.locator('#map2Canvas').evaluate(s=>s.getAttribute('viewBox').split(' ').map(Number));
 const centered=(page,x,y)=>page.waitForFunction(([x,y])=>{const v=document.getElementById('map2Canvas').getAttribute('viewBox').split(' ').map(Number);return Math.abs(v[0]+v[2]/2-x)<.1&&Math.abs(v[1]+v[3]/2-y)<.1;},[x,y]);
 const shown=(page,id)=>page.waitForFunction(id=>document.getElementById('mapWorkspaceSelect').value===String(id),id);
 const before=await view(p);
 await p.locator('[data-node=enter]').click();await shown(p,destination.id);await centered(p,1840,-1160);
 const arrived=await view(p);assert.deepEqual(arrived.slice(2),before.slice(2),'Travel preserves zoom');
 assert.equal(await d.locator('#mapWorkspaceSelect').inputValue(),String(main.id),'Player travel does not move the DM');
 // A later synchronization must not repeat the arrival focus after the player pans.
 const box=await p.locator('#map2Canvas').boundingBox();await p.mouse.move(box.x+box.width*.5,box.y+box.height*.8);await p.mouse.down();await p.mouse.move(box.x+box.width*.5+85,box.y+box.height*.8,{steps:5});await p.mouse.up();
 const panned=await view(p);assert.notDeepEqual(panned,arrived);await p.waitForTimeout(1800);assert.deepEqual(await view(p),panned);
 await d.locator('[data-node=enter]').click();await shown(d,destination.id);await centered(d,1840,-1160);
 await d.locator('[data-node=return]').click();await shown(d,main.id);await centered(d,120,40);
 // Selecting a map directly is not travel through a part.
 const directBefore=await view(d);await d.locator('#mapWorkspaceSelect').selectOption(String(destination.id));await shown(d,destination.id);await d.waitForTimeout(300);assert.deepEqual(await view(d),directBefore);
 // Center the view so the one-way part can be clicked, then verify the fallback.
 await d.evaluate(()=>Map2D.centerOnConnection(Number(document.querySelector('#mapWorkspaceSelect option').value)));
 await centered(d,1840,-1160);const noReturnBefore=await view(d);await d.locator('[data-node=one-way]').click();await shown(d,oneWay.id);assert.deepEqual(await view(d),noReturnBefore,'No return part keeps the existing view');
 assert.deepEqual(errors,[]);console.log('PASS: player and DM arrival centering, rotated return part, hidden part skipped, zoom preserved, no-return fallback, direct selection unchanged, and no repeated focus after panning.');
 }finally{if(browser)await browser.close();server.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
