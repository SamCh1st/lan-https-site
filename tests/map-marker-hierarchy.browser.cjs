require('./python-path.cjs');
/* Isolated application test: never writes to the user's campaign database. */
const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),base='https://127.0.0.1:8782';
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
sys.argv=['server.py','--port','8782']
server.main()`],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='';server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);
(async()=>{let browser;try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
 for(let i=0;i<80;i++){try{const response=await context.request.get(base,{timeout:1000});if(response.ok())break;}catch{}await new Promise(r=>setTimeout(r,250));if(i===79)throw Error(output);}
 const login=await context.request.post(base+'/api/login',{data:{username:'PartCardsQA',password:'Environment-QA-12345'}});assert.ok(login.ok(),await login.text());
 const campaign=(await(await context.request.get(base+'/api/work')).json()).items.find(r=>r.title==='Part Cards QA');


 const fs=require('node:fs'),image=fs.readFileSync(path.join(root,'site/assets/map-art/items/ceramic_mug.png'));
 const uploads=[];for(let i=0;i<2;i++){const res=await context.request.post(base+'/api/upload',{headers:{'Content-Type':'image/png'},data:image});assert.ok(res.ok());uploads.push((await res.json()).image_id);}
 const records=[];for(const [category,title] of [['npc','Mira the Ranger'],['encounter','Ambush at Dawn'],['npc','The Copper Cup']]){const res=await context.request.post(base+'/api/work',{data:{title,content:{category,campaign_id:campaign.id,image_id:uploads[0]}}});assert.ok(res.ok(),await res.text());records.push((await res.json()).item);}
 const listing=await(await context.request.get(base+'/api/campaign/'+campaign.id+'/maps')).json(),url=base+'/api/campaign/'+campaign.id+'/maps/'+listing.active_map_id;
 const nodes=['npc','encounter','shop'].map((type,i)=>({id:type,type,x:i*140-200,y:0,w:80,h:80,card_id:records[i].id,part_name:'Generic catalog name',label:'Old marker label',folder_id:'markers'}));nodes.push({id:'unassigned',type:'npc',x:0,y:140,w:80,h:80});
 const save=await context.request.put(url,{data:{revision:0,state:{nodes,folders:[{id:'markers',name:'Town markers'}]}}});assert.ok(save.ok(),await save.text());
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.stack));await page.goto(base);await page.locator('.campaign-row').filter({hasText:'Part Cards QA'}).click();await page.locator('[data-map-mode="edit"]').click();
 for(let i=0;i<3;i++){const row=page.locator('[data-layer-node="'+nodes[i].id+'"]');assert.equal(await row.getAttribute('aria-label'),records[i].title);assert.ok((await row.textContent()).includes(records[i].title));assert.equal(await row.locator('img').getAttribute('src'),'/api/uploads/'+uploads[0]);assert.ok(await row.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0));}
 assert.equal(await page.locator('[data-layer-node="unassigned"]').getAttribute('aria-label'),'npc');
 // Card edits refresh the existing hierarchy, including its cached row artwork.
 const response=await context.request.put(base+'/api/work/'+records[0].id,{data:{title:'Mira, Captain of the Watch',content:{...records[0].content,image_id:uploads[1]}}});assert.ok(response.ok(),await response.text());
 await page.waitForFunction(()=>document.querySelector('[data-layer-node="npc"]')?.getAttribute('aria-label')==='Mira, Captain of the Watch');assert.equal(await page.locator('[data-layer-node="npc"] img').getAttribute('src'),'/api/uploads/'+uploads[1]);
 // Selection and reassignment still use the marker's original node ID.
 await page.locator('[data-layer-node="shop"]').click();await page.selectOption('#map2CardSelect',String(records[0].id));await page.waitForFunction(()=>document.querySelector('[data-layer-node="shop"]')?.getAttribute('aria-label')==='Mira, Captain of the Watch');
 await page.selectOption('#map2CardSelect','');await page.waitForFunction(()=>document.querySelector('[data-layer-node="shop"]')?.getAttribute('aria-label')==='Old marker label');assert.equal(await page.locator('[data-layer-node="shop"] img').count(),0);
 await page.waitForTimeout(800);const state=(await(await context.request.get(url)).json()).state;assert.ok(state.nodes.every(n=>!('_hierarchyName' in n)&&!('_hierarchyImage' in n)));
 await page.locator('#map2Layers').screenshot({path:path.join(__dirname,'artifacts/marker-hierarchy.png')});assert.deepEqual(errors,[]);console.log('PASS: NPC, encounter and shop hierarchy names and portraits, live card edits, reassignment, removal, nested folder rows, and unchanged saved map data.');
 }finally{if(browser)await browser.close();server.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
