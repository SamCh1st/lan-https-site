require('./python-path.cjs');
/* Isolated application test: never writes to the user's campaign database. */
const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),base='https://127.0.0.1:8783';
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
campaign=storage.create_work(uid,'Part Cards QA',{'category':'campaign','initial_map_kind':'2d'})
for name in ('Walker','SecondWalker'):
    player=storage.create_user(name,None,'Walking-QA-12345')
    storage.invite_to_campaign(uid,campaign['id'],name)
    storage.answer_invite(player,campaign['id'],True)
    storage.create_work(uid,name+' character',{'category':'character','campaign_id':campaign['id'],'owner_user_id':player,'role':'party','tabletop':{'interaction_range':3}})
sys.argv=['server.py','--port','8783']
server.main()`],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='';server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);
(async()=>{let browser;try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
 for(let i=0;i<80;i++){try{const response=await context.request.get(base,{timeout:1000});if(response.ok())break;}catch{}await new Promise(r=>setTimeout(r,250));if(i===79)throw Error(output);}
 const login=await context.request.post(base+'/api/login',{data:{username:'PartCardsQA',password:'Environment-QA-12345'}});assert.ok(login.ok(),await login.text());
 const campaign=(await(await context.request.get(base+'/api/work')).json()).items.find(r=>r.title==='Part Cards QA');


 const listing=await(await context.request.get(base+'/api/campaign/'+campaign.id+'/maps')).json(),url=base+'/api/campaign/'+campaign.id+'/maps/'+listing.active_map_id;
 const linked=(await(await context.request.post(base+'/api/campaign/'+campaign.id+'/maps',{data:{title:'Linked room',kind:'2d'}})).json());await context.request.put(url+'/activate',{data:{}});
 const item=(await(await context.request.get(base+'/api/work')).json()).items.find(r=>r.content.category==='item');
 const marker=(await(await context.request.post(base+'/api/work',{data:{title:'Distant keeper',content:{category:'npc',campaign_id:campaign.id}}})).json()).item;
 const nodes=[{id:'floor',type:'building',x:-400,y:-240,w:1000,h:640,floor_texture:'wood'}, {id:'table',type:'table',x:40,y:0,w:40,h:40}, {id:'paint',type:'grass',x:0,y:80,w:160,h:40}, {id:'ambience',type:'oak_tree',x:80,y:40,w:70,h:70}, {id:'chest',type:'chest',x:160,y:0,w:40,h:40,contents:[{record_id:item.id,quantity:1}]}, {id:'keeper',type:'npc',x:280,y:0,w:40,h:40,card_id:marker.id}, {id:'shop',type:'shop',x:280,y:80,w:40,h:40,card_id:marker.id}, {id:'link',type:'portal',x:-200,y:0,w:40,h:40,connected_map_id:linked.id}];
 const save=await context.request.put(url,{data:{revision:0,state:{nodes,canvas:{grid:true},scene:{time:'Day'}}}});assert.ok(save.ok(),await save.text());
 const state=(await(await context.request.get(url)).json()),player=state.players.find(p=>p.username==='Walker'),other=state.players.find(p=>p.username==='SecondWalker');
 await context.request.put(url+'/position',{data:{user_id:other.id,x:-3,z:2}});
 const editor=await context.newPage();await editor.goto(base);await editor.locator('.campaign-row').filter({hasText:'Part Cards QA'}).click();await editor.locator('[data-map-mode=edit]').click();await editor.locator('[data-layer-node=table]').click();
 await editor.locator('[data-layer-node=floor]').click();assert.ok(await editor.locator('#map2WalkOverBuildingHelp').isVisible());await editor.locator('[data-layer-node=table]').click();
 const toggle=editor.locator('[data-map2-property=walk_over]');assert.ok(await toggle.isChecked(),'Existing parts default to Walk over');await toggle.uncheck();
 await editor.waitForFunction(()=>document.getElementById('mapWorkspaceStatus').textContent==='Saved');
 assert.equal((await(await context.request.get(url)).json()).state.nodes.find(n=>n.id==='table').walk_over,false);
 await editor.reload();await editor.locator('.campaign-row').filter({hasText:'Part Cards QA'}).click();await editor.locator('[data-map-mode=edit]').click();await editor.locator('[data-layer-node=table]').click();assert.equal(await toggle.isChecked(),false,'Walk over persists after reload');
 const playerContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});await playerContext.request.post(base+'/api/login',{data:{username:'Walker',password:'Walking-QA-12345'}});
 const page=await playerContext.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.stack));await page.goto(base);await page.locator('.campaign-row').filter({hasText:'Part Cards QA'}).click();await page.locator('#map2Canvas').waitFor({state:'visible'});
 const screen=async(p,x,z)=>p.evaluate(([x,z])=>{const svg=document.querySelector('#map2Canvas'),q=new DOMPoint(x*40+20,z*40+20).matrixTransform(svg.getScreenCTM());return {x:q.x,y:q.y};},[x,z]);
 const hover=async(p,x,z)=>{const q=await screen(p,x,z);await p.mouse.move(q.x,q.y);};
 const click=async(p,x,z)=>{const q=await screen(p,x,z);await p.mouse.click(q.x,q.y);};
 const exitRoute=await page.evaluate(id=>MapTokenWalk.plan(id,[15,0],20),player.id);assert.ok(exitRoute.path.length&&exitRoute.path.some(p=>p[1]>=10),'Worker routes through the building doorway instead of crossing the east wall');
 // A free reachable tile glows, while obstacles, actions and out-of-range tiles do not.
 await hover(page,3,0);await page.waitForFunction(()=>document.querySelector('#map2WalkHover').getAttribute('visibility')==='visible');assert.equal(await page.locator('#map2WalkHover').getAttribute('data-tile-x'),'3');await page.screenshot({path:path.join(__dirname,'artifacts/click-walk-wood-hover.png')});
 for(const [x,z] of [[1,0],[7,1],[4,0]]){await hover(page,x,z);await page.waitForTimeout(150);assert.equal(await page.locator('#map2WalkHover').getAttribute('visibility'),'hidden');}
 await click(page,4,0);await page.waitForTimeout(250);assert.ok(await page.locator('#map2ObjectPopup').isHidden());assert.match(await page.locator('#mapWorkspaceStatus').innerText(),/Move closer/);
 for(const [x,z] of [[7,0],[7,2],[-5,0]]){await click(page,x,z);await page.waitForTimeout(150);assert.ok(await page.locator('#map2ObjectPopup').isHidden());assert.match(await page.locator('#mapWorkspaceStatus').innerText(),/Move closer/);}
 const denied=await playerContext.request.post(url+'/meet',{data:{node_id:'keeper'}});assert.equal(denied.status(),403);
 // Actual path bends around the table, and shared state lands on the exact clicked tile.
 await click(page,3,0);await page.waitForFunction(()=>!MapTokenWalk.moving);await page.waitForTimeout(800);let shared=(await(await context.request.get(url)).json());let moved=shared.players.find(p=>p.id===player.id);assert.equal(moved.x,3);assert.equal(moved.z,0);const route=await page.locator('#map2Canvas').getAttribute('data-walk-path');assert.ok(JSON.parse(route).some(p=>p[1]!==0));assert.equal(shared.players.find(p=>p.id===other.id).x,-3);
 await click(page,4,0);await page.locator('#map2ObjectPopup').waitFor({state:'visible'});await page.locator('#map2ClosePopup').click();
 // Paint and ambience stay walkable, and dragging empty space pans without issuing movement.
 await click(page,2,2);await page.waitForFunction(()=>!MapTokenWalk.moving);await page.waitForTimeout(700);shared=(await(await context.request.get(url)).json());moved=shared.players.find(p=>p.id===player.id);assert.equal(moved.x,2);assert.equal(moved.z,2);
 const pan=await screen(page,4,3);await page.mouse.move(pan.x,pan.y);await page.mouse.down();await page.mouse.move(pan.x+90,pan.y+50,{steps:5});await page.mouse.up();await page.waitForTimeout(350);shared=(await(await context.request.get(url)).json());assert.equal(shared.players.find(p=>p.id===player.id).x,2);
 // DM movement requires selecting a player and obeys that player's range too.
 const dmPage=await context.newPage();dmPage.setDefaultTimeout(15000);dmPage.on('pageerror',e=>errors.push(e.stack));await dmPage.goto(base);await dmPage.locator('.campaign-row').filter({hasText:'Part Cards QA'}).click();await dmPage.locator('[data-player="'+player.id+'"]').click();await click(dmPage,7,0);assert.ok(await dmPage.locator('#map2ObjectPopup').isHidden());assert.match(await dmPage.locator('#mapWorkspaceStatus').innerText(),/Move closer/);await click(dmPage,3,2);await dmPage.waitForFunction(()=>!MapTokenWalk.moving);await dmPage.waitForTimeout(700);shared=(await(await context.request.get(url)).json());assert.equal(shared.players.find(p=>p.id===player.id).x,3);
 // Turning Walk over back on clears cached obstacle paths on other clients.
 await toggle.check();await editor.waitForFunction(()=>document.getElementById('mapWorkspaceStatus').textContent==='Saved');
 await page.waitForFunction(async id=>(await MapTokenWalk.plan(id,[1,0],3)).path.length>0,player.id);
 await hover(page,1,0);await page.waitForFunction(()=>document.getElementById('map2WalkHover').getAttribute('visibility')==='visible');
 await click(page,1,0);await page.waitForFunction(()=>!MapTokenWalk.moving);await page.waitForTimeout(700);
 shared=(await(await context.request.get(url)).json());assert.equal(shared.players.find(p=>p.id===player.id).x,1);assert.equal(shared.players.find(p=>p.id===player.id).z,0);
 console.log('PASS: Walk over defaults on, persists off through reload, blocks route and hover, and immediately allows movement when enabled again.');
 assert.deepEqual(errors,[]);console.log('PASS: player and selected-player click movement, obstacle detour, shared positions, paint/ambience traversal, pan gesture, glowing reachable tiles, interaction limits on chests/NPCs/shops/map links, server-side meeting range.');await playerContext.close();
 }finally{if(browser)await browser.close();server.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
