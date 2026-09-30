require('./python-path.cjs');
/* Isolated application test: never writes to the user's campaign database. */
const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),base='https://127.0.0.1:8792';
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
campaign=storage.create_work(uid,'Part Cards QA',{'category':'campaign','initial_map_kind':'2d'})['id']
player=storage.create_user('OpeningPlayer',None,'Environment-QA-12345')
storage.invite_to_campaign(uid,campaign,'OpeningPlayer');storage.answer_invite(player,campaign,True)
hero=storage.create_work(uid,'Hero',dict(category='character',campaign_id=campaign,owner_user_id=player))['id']
key=storage.create_work(uid,'Iron Key',dict(category='item',campaign_id=campaign,owner_ids=[hero],quantity=1))['id']
loot=storage.create_work(uid,'Treasure',dict(category='item',campaign_id=campaign,reference_only=True))['id']
import campaign_maps,part_opening
mid=campaign_maps.listing(uid,campaign)['active_map_id']
node=dict(id='gate',type='chest',x=40,y=0,w=40,h=40,needs_item=True,required_item_id=key,needs_roll=True,open_die_sides=6,open_die_count=1,open_die_bonus=0,open_roll_target=4,contents=[dict(record_id=loot,quantity=1)])
campaign_maps.update(uid,campaign,mid,dict(revision=0,state=dict(nodes=[node])))
rolls=iter([0,5]);part_opening.secrets.randbelow=lambda sides:next(rolls,5)
sys.argv=['server.py','--port','8792']
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
 await page.locator('[data-map-mode="edit"]').click();await page.locator('#mapWorkspaceHeader [data-map-fullscreen]').click();
 await page.locator('[data-layer-node=gate]').click();
 await page.locator('#map2OpeningOptions').waitFor({state:'visible'});assert.ok(await page.locator('#map2OpeningOptions [name=needs_item]').isChecked());assert.ok(await page.locator('#map2OpeningOptions [name=needs_roll]').isChecked());assert.equal(await page.locator('#map2OpeningOptions [name=open_die_sides]').inputValue(),'6');assert.ok((await page.locator('#map2OpeningOptions [name=required_item_id]').innerText()).includes('Iron Key'));
 const opening=page.locator('#map2OpeningOptions');
 await opening.locator('[name=open_die_count]').fill('3');await opening.locator('[name=open_die_count]').press('Tab');
 assert.equal(await opening.locator('[data-open-die]').count(),2);
 await opening.locator('[data-open-die="1"]').selectOption('8');await opening.locator('[data-open-die="2"]').selectOption('20');
 assert.deepEqual(await opening.evaluate(root=>MapOpeningSettings.read(root).open_dice),[6,8,20]);
 await opening.locator('[data-open-item-cards] .map-open-item-card').filter({hasText:'Treasure'}).click();
 assert.ok((await opening.locator('[data-open-selected]').innerText()).includes('Treasure'));
 await opening.locator('[data-open-item-cards] .map-open-item-card').filter({hasText:'Iron Key'}).click();
 assert.ok((await opening.locator('[data-open-selected]').innerText()).includes('Iron Key'));
 await opening.locator('[name=open_die_count]').fill('1');await opening.locator('[name=open_die_count]').press('Tab');
 assert.equal(await opening.locator('[data-open-die]').count(),0);
 await page.locator('#map2OpeningOptions [name=open_roll_target]').fill('5');await page.locator('#map2OpeningOptions [name=open_roll_target]').press('Tab');await page.waitForTimeout(500);
 const listing=await(await context.request.get(base+'/api/campaign/'+campaign.id+'/maps')).json(),url=base+'/api/campaign/'+campaign.id+'/maps/'+listing.active_map_id;
 assert.equal((await(await context.request.get(url)).json()).state.nodes[0].open_roll_target,5);
 const playerContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});await playerContext.request.post(base+'/api/login',{data:{username:'OpeningPlayer',password:'Environment-QA-12345'}});const play=await playerContext.newPage();play.on('pageerror',e=>errors.push(e.stack));await play.goto(base);await play.locator('.campaign-row').filter({hasText:'Part Cards QA'}).click();await play.locator('#map2Canvas').waitFor({state:'visible'});await play.locator('#mapWorkspaceHeader [data-map-fullscreen]').click();
 await play.locator('[data-node=gate] image').click();
 await play.locator('#partRollModal').waitFor({state:'visible'});assert.ok(await play.locator('#railDieType').isDisabled());assert.equal(await play.locator('#railDieType').inputValue(),'6');assert.equal(await play.locator('#railDieCount').inputValue(),'1');
 await play.locator('#railDie').click();await play.waitForFunction(()=>document.getElementById('railDieResult').textContent==='Total 1');assert.ok(await play.locator('[data-roll-open]').isDisabled());assert.ok(await play.locator('#map2ObjectPopup').isHidden());
 await play.locator('#railDie').click();await play.waitForFunction(()=>document.getElementById('railDieResult').textContent==='Total 6');assert.ok(await play.locator('[data-roll-open]').isEnabled());await play.screenshot({path:path.join(__dirname,'artifacts/part-opening-roll.png')});await play.locator('[data-roll-open]').click();await play.locator('#partRollModal').waitFor({state:'detached'});await play.locator('#map2ObjectPopup').waitFor({state:'visible'});assert.ok((await play.locator('#map2PopupContents').innerText()).includes('Treasure'));
 const item=(await(await context.request.get(base+'/api/work')).json()).items.find(r=>r.title==='Iron Key');assert.equal(item.content.quantity,1);
 assert.deepEqual(errors,[]);console.log('PASS: editable item/dice requirements persist, player opens existing dice screen, dice fixed to required settings, failed total keeps contents closed, success opens contents, item retained.');
 }finally{if(browser)await browser.close();server.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
