const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1200}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base='https://127.0.0.1:8767';
 try{
  await page.goto(base);await page.request.post(base+'/api/login',{data:{username:'DicePlayerQA',password:'Tabletop-QA-12345'}});await page.reload();
  async function open(){await page.getByText('Dice QA Normal',{exact:true}).click();await page.locator('#realmMenuButton').click();await page.locator('#spellAtelierButton').click();await page.locator('#saDesignDetail').selectOption('simple');}
  await open();await page.locator('#saDesignDetail').selectOption('simple');await page.locator('[data-example="water:column"]').click();
  // Cartesian Y: upward keyboard and pointer movements increase the displayed Y.
  await page.locator('#saObjects button').filter({hasText:'Water'}).click();
  await page.locator('#spellAtelierCanvas').focus();await page.keyboard.press('ArrowUp');assert.equal(await page.locator('#saProp_y').inputValue(),'10');
  await page.locator('#saProp_y').fill('50');await page.locator('#saProp_y').press('Tab');
  const transform=await page.locator('#saDrawing .sa-node').filter({has:page.locator('title',{hasText:'Water'})}).getAttribute('transform');assert.match(transform,/translate\(0 -50\)/);
  const point=await page.evaluate(()=>{const p=new DOMPoint(10,-40).matrixTransform(document.getElementById('spellAtelierCanvas').getScreenCTM());return {x:p.x,y:p.y};});
  await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x,point.y-35,{steps:5});await page.mouse.up();assert.ok(Number(await page.locator('#saProp_y').inputValue())>50);
  // Browser-native clipboard event contracts preserve grouped geometry and history.
  await page.locator('#spellAtelierCanvas').focus();await page.keyboard.press('Control+a');
  const clip=await page.evaluate(()=>{const data=new DataTransfer();document.getElementById('spellAtelierCanvas').dispatchEvent(new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true}));return data.getData('text/plain');});
  assert.equal(JSON.parse(clip).nodes.length,6);
  await page.evaluate(text=>{const data=new DataTransfer();data.setData('text/plain',text);document.getElementById('spellAtelierCanvas').dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));},clip);
  assert.equal(await page.locator('#saDrawing .sa-node').count(),12);assert.match(await page.locator('#saSelectedName').innerText(),/6 symbols/);
  const pasted=await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('spell-atelier:'));return JSON.parse(localStorage.getItem(key)).nodes;});
  assert.equal(new Set(pasted.map(n=>n.id)).size,12);assert.equal(pasted[6].x-pasted[0].x,20);assert.equal(pasted[6].y-pasted[0].y,-20);
  await page.keyboard.press('Control+z');assert.equal(await page.locator('#saDrawing .sa-node').count(),6);
  // Copy/paste of prompt text must not be captured by drawing handlers.
  assert.equal(await page.evaluate(()=>{const data=new DataTransfer();data.setData('text/plain','ordinary text');const event=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});document.getElementById('saDesignPrompt').dispatchEvent(event);return event.defaultPrevented;}),false);
  await page.locator('#saDesignPrompt').fill('Permanent blindness on someone who steps on the seal.');await page.locator('#saDesign').click();
  await page.waitForFunction(()=>document.querySelectorAll('#saDrawing .sa-node').length===1);
  assert.equal(await page.locator('#saCancelDesign').isEnabled(),true);assert.equal(await page.locator('#saDesignSummary').innerText(),'');assert.equal(await page.locator('#saUndo').isDisabled(),true);
  assert.match(await page.locator('#saDesignStatus').innerText(),/part 1/);
  await page.waitForFunction(()=>document.getElementById('saDesignStatus').textContent.includes('Drawing complete'));
  assert.equal(await page.locator('#saDrawing .sa-node').count(),4);assert.equal(await page.locator('#saSteps li').count(),5);
  assert.match(await page.locator('#saDesignSummary').innerText(),/Conceptual blueprint/);assert.equal(await page.locator('#saCast').isDisabled(),true);
  await page.locator('#saUndo').click();assert.match(await page.locator('#saVerdictText').innerText(),/ring is open/);
  await page.locator('#saRedo').click();
  // Proposed labels and meanings survive reload.
  await page.reload();await open();await page.locator('#saObjects button').filter({hasText:'Permanent blindness'}).click();assert.match(await page.locator('#saSelectedHint').innerText(),/lasting loss of sight/);
  // Stop midway keeps the partial drawing, then undo restores the prior design.
  await page.locator('#saDesignPrompt').fill('cancel after the first part');await page.locator('#saDesign').click();
  await page.waitForFunction(()=>document.querySelectorAll('#saDrawing .sa-node').length===1);await page.locator('#saCancelDesign').click();
  await page.waitForTimeout(1400);assert.equal(await page.locator('#saDrawing .sa-node').count(),1);assert.equal(await page.locator('#saDesign').isEnabled(),true);
  await page.locator('#saUndo').click();await page.locator('#saUndo').click();assert.equal(await page.locator('#saDrawing .sa-node').count(),4);
  // Empty generation doesn't erase an existing draft.
  await page.locator('#saDesignPrompt').fill('empty design');await page.locator('#saDesign').click();await page.waitForFunction(()=>!document.getElementById('saDesign').disabled);
  assert.equal(await page.locator('#saDrawing .sa-node').count(),4);
  // Network/model failure keeps emitted parts and surfaces the error.
  await page.locator('#saDesignPrompt').fill('failure after the first part');await page.locator('#saDesign').click();await page.waitForFunction(()=>document.getElementById('saDesignStatus').textContent.includes('Simulated connection failure'));
  assert.equal(await page.locator('#saDrawing .sa-node').count(),1);
  // Finish another stream for the review screenshot.
  await page.locator('#saDesignPrompt').fill('Permanent blindness on someone who steps on the seal.');await page.locator('#saDesign').click();await page.waitForFunction(()=>document.getElementById('saDesignStatus').textContent.includes('Drawing complete'));
  await page.locator('#spellAtelier').screenshot({path:'tests/spell-designer-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.locator('#saDesignForm').scrollIntoViewIfNeeded();await page.screenshot({path:'tests/spell-designer-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(errors,[]);console.log('Live HTTP drawing passed: incremental parts, explanations, positive-up Y, clipboard groups, undo, persistence, stop, failure, and mobile.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
