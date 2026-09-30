const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1200}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
 const base=process.env.REALM_PREVIEW_URL||'https://127.0.0.1:8766';await page.goto(base);
 const login=await page.request.post(base+'/api/login',{data:{username:'DicePlayerQA',password:'Tabletop-QA-12345'}});assert.equal(login.ok(),true);
 await page.reload();await page.getByText('Dice QA Normal',{exact:true}).click();
 await page.locator('#realmMenuButton').click();await page.locator('#spellAtelierButton').click();
 await page.locator('#spellAtelierCanvas').waitFor({state:'visible'});
 await page.locator('[data-example="fire:levitation"]').click();
 assert.match(await page.locator('#saVerdictTitle').innerText(),/ready/);
 await page.locator('#saCast').click();await page.waitForTimeout(100);assert.equal(await page.locator('#saEffects circle').count()>0,true);
 await page.locator('#saStop').click();
 const canvas=page.locator('#spellAtelierCanvas');await canvas.scrollIntoViewIfNeeded();
 const b=await canvas.boundingBox();
 async function world(x,y){return page.evaluate(({x,y})=>{const el=document.getElementById('spellAtelierCanvas'),p=new DOMPoint(x,y).matrixTransform(el.getScreenCTM());return {x:p.x,y:p.y};},{x,y});}
 // Move at a zoomed scale, then check actual snapped measurements and history.
 const fire=await world(0,0);await page.mouse.click(fire.x,fire.y);assert.equal(await page.locator('#saSelectedName').innerText(),'Fire');
 await page.mouse.move(fire.x+12,fire.y+12);await page.mouse.down();await page.mouse.move(fire.x+42,fire.y+12,{steps:5});await page.mouse.up();
 const moved=Number(await page.locator('#saProp_x').inputValue());assert.notEqual(moved,0);assert.equal(moved%10,0);
 await page.locator('#saUndo').click();assert.equal(Number(await page.locator('#saProp_x').inputValue()),0);
 await page.locator('#saRedo').click();assert.equal(Number(await page.locator('#saProp_x').inputValue()),moved);
 // Typed transforms, ring gap and live validity.
 await page.locator('#saProp_x').fill('0');await page.locator('#saProp_x').press('Tab');
 await page.locator('#saObjects button').filter({hasText:'Enclosing ring'}).click();
 await page.locator('#saCloseRing').click();assert.match(await page.locator('#saVerdictText').innerText(),/open/);assert.equal(await page.locator('#saCast').isDisabled(),true);
 await page.locator('#saCloseRing').click();assert.equal(await page.locator('#saCast').isEnabled(),true);
 // Drag a palette mark onto the actual parchment.
 await page.locator('[data-symbol="stability"]').scrollIntoViewIfNeeded();
 await canvas.scrollIntoViewIfNeeded();
 const palette=await page.locator('[data-symbol="stability"]').boundingBox(),drop=await world(60,60);
 await page.mouse.move(palette.x+20,palette.y+20);await page.mouse.down();await page.mouse.move(drop.x,drop.y,{steps:12});await page.mouse.up();
 assert.equal(await page.locator('#saDrawing .sa-node').count(),7);assert.equal(await page.locator('#saSelectedName').innerText(),'Stability');
 // Rotate via gizmo; stretching via edge handles.
 let handle=await page.locator('[data-handle="rotate"]').boundingBox();
 await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+50,handle.y+40,{steps:6});await page.mouse.up();
 assert.equal(Number(await page.locator('#saProp_rotation').inputValue())%15,0);
 handle=await page.locator('[data-handle="scale"][data-hx="1"][data-hy="0"]').boundingBox();
 await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+35,handle.y+25,{steps:6});await page.mouse.up();assert.notEqual(Number(await page.locator('#saProp_w').inputValue()),60);
 // Zoom, pan and selection after zoom remain usable.
 const oldZoom=await page.locator('#saZoom').innerText();await page.locator('#saZoomIn').click();assert.notEqual(await page.locator('#saZoom').innerText(),oldZoom);
 await page.locator('#saZoomFit').click();
 // AI route sends the actual drawing, honors a structured result, and animates it.
 await page.locator('[data-example="fire:levitation"]').click();
 let sent;
 await page.route('**/spells/interpret',async route=>{sent=route.request().postDataJSON();const ring=sent.nodes.find(n=>n.type==='ring');await route.fulfill({json:{name:'Pyreball',functional:true,description:'A floating ball of fire.',geometry:'Four equal levitation signs balance around the center.',canon:'Fire plus levitation.',inference:'Exact strength is inferred.',issues:[],effects:[{ring_id:ring.id,element:'fire',behavior:'orb',power:1,angle:0}],model:'QA model',reference_status:'QA fixture',sources:[]}});});
 await page.locator('#saInterpret').click();await page.locator('#saAiReading strong').waitFor();assert.equal(sent.nodes.length,6);assert.equal(await page.locator('#saAiReading strong').innerText(),'Pyreball');
 await page.screenshot({path:'tests/spell-atelier-desktop.png',fullPage:true});
 await page.locator('#saStop').click();
 // Multi-selection and deletion are a single undoable edit.
 await canvas.focus();await page.keyboard.press('Control+a');assert.match(await page.locator('#saSelectedName').innerText(),/6 symbols/);
 await page.keyboard.press('Delete');assert.equal(await page.locator('#saDrawing .sa-node').count(),0);
 await page.keyboard.press('Control+z');assert.equal(await page.locator('#saDrawing .sa-node').count(),6);
 // Editing during an AI reading discards the stale answer.
 await page.unroute('**/spells/interpret');let pending;
 await page.route('**/spells/interpret',route=>{pending=route;});
 await page.locator('#saInterpret').click();await page.waitForFunction(()=>document.getElementById('saInterpret').disabled);await page.waitForTimeout(100);
 await page.locator('[data-example="water:column"]').click();
 if(pending)await pending.fulfill({json:{name:'Stale fireball',functional:true,effects:[],sources:[]}}).catch(()=>{});
 await page.waitForTimeout(100);assert.equal(await page.locator('#saAiReading').innerText(),'');
 // Reload restores the draft for the same account and campaign.
 await page.reload();await page.getByText('Dice QA Normal',{exact:true}).click();await page.locator('#realmMenuButton').click();await page.locator('#spellAtelierButton').click();
 assert.equal(await page.locator('#saDrawing .sa-node').count(),6);assert.match(await page.locator('#saVerdictText').innerText(),/Water/);
 // Leaving restores the original map and side rectangles. AI campaign also works.
 await page.locator('#saExit').click();assert.equal(await page.locator('#spellAtelier').isVisible(),false);assert.equal(await page.locator('#mapPlaceholder').isVisible(),true);
 await page.locator('#campaignBack').click();await page.getByText('Dice QA AI',{exact:true}).click();await page.locator('#realmMenuButton').click();await page.locator('#spellAtelierButton').click();
 assert.equal(await page.locator('#saDrawing .sa-node').count(),0);await page.locator('[data-example="water:column"]').click();
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);await page.screenshot({path:'tests/spell-atelier-mobile.png',fullPage:true});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);
 await page.locator('#saExit').click();assert.equal(await page.locator('#aiCampaignPanel').isVisible(),true);
 await page.setViewportSize({width:1440,height:1100});
 await page.request.post(base+'/api/logout',{data:{}});
 await page.request.post(base+'/api/login',{data:{username:'TabletopQA',password:'Tabletop-QA-12345'}});
 await page.reload();await page.getByText('Dice QA Normal',{exact:true}).click();await page.locator('#realmMenuButton').click();await page.locator('#spellAtelierButton').click();
 assert.equal(await page.locator('#saDrawing .sa-node').count(),0);assert.equal(await page.locator('#spellAtelierCanvas').isVisible(),true);
 await page.locator('#saExit').click();assert.equal(await page.locator('#mapWorkspaceHeader').isVisible(),true);assert.equal(await page.locator('.map-stage').isVisible(),true);
 assert.deepEqual(errors,[]);console.log('Browser checks passed: player/AI navigation, casting, drag, move, rotation, resize, snap, undo/redo, AI wiring, mobile layout.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
