const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const page=await browser.newPage({acceptDownloads:true});await page.route('https://art.test/',r=>r.fulfill({contentType:'text/html',body:'<div id="campaignDashboard"></div>'}));await page.goto('https://art.test/');
 await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=512;c.getContext('2d').fillRect(0,0,512,512);localStorage.setItem('art-atelier:v1:1:1',JSON.stringify([{type:'image',src:c.toDataURL(),x:256,y:256,w:512,h:512,scale:1,angle:0,width:1,ink:'#000000',fill:'none'}]));});
 await page.addScriptTag({path:'site/art-atelier.js'});await page.evaluate(()=>{ArtAtelier.setActive(true,1,1,{});document.querySelector('#aaCanvas').style.cssText='display:block;width:592px;height:592px';});
 await page.locator('#aaTool').selectOption('eraser');await page.locator('#aaWidth').fill('40');await page.locator('#aaCanvas').scrollIntoViewIfNeeded();
 const box=await page.locator('#aaCanvas').boundingBox();await page.mouse.move(box.x+240,box.y+296);await page.mouse.down();await page.mouse.move(box.x+340,box.y+296,{steps:8});await page.mouse.up();
 assert.equal(await page.locator('#aaArt mask path').count(),1);
 async function exported(button){const event=page.waitForEvent('download');await page.locator(button).click();const d=await event;assert.equal(d.suggestedFilename(),'campaign-artwork.png');const data=fs.readFileSync(await d.path());assert.equal(data.subarray(1,4).toString(),'PNG');return page.evaluate(async src=>{const i=new Image();i.src=src;await i.decode();const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');x.drawImage(i,0,0);return [x.getImageData(256,256,1,1).data[3],x.getImageData(100,100,1,1).data[3]];},'data:image/png;base64,'+data.toString('base64'));}
 await page.locator('summary').filter({hasText:'Layers & files'}).click();assert.deepEqual(await exported('#aaProjectSave'),[0,255]);
 await page.locator('#aaUndo').click();assert.deepEqual(await exported('#aaDownload'),[255,255]);await page.locator('#aaRedo').click();assert.deepEqual(await exported('#aaDownload'),[0,255]);
 await page.evaluate(()=>{ArtAtelier.setActive(false);ArtAtelier.setActive(true,2,1,{});ArtAtelier.setActive(true,1,1,{});});assert.deepEqual(await exported('#aaDownload'),[0,255]);
 await page.evaluate(()=>ArtAtelier.setActive(true,1,1,{archive:async(title,description,blob)=>{window.savedArt={title,description,type:blob.type,size:blob.size};}}));
 await page.locator('#aaArchive summary').click();await page.locator('#aaArchiveSave').click();assert.match(await page.locator('#aaStatus').textContent(),/Give the artwork a name/);
 await page.locator('#aaArchiveName').fill('Moonlit sword');await page.locator('#aaArchiveDescription').fill('An enchanted silver blade.');await page.locator('#aaArchiveSave').click();await page.waitForFunction(()=>window.savedArt);
 const saved=await page.evaluate(()=>window.savedArt);assert.equal(saved.title,'Moonlit sword');assert.equal(saved.description,'An enchanted silver blade.');assert.equal(saved.type,'image/png');assert(saved.size>0);
 console.log('PASS eraser removes image pixels to transparency, PNG save, undo/redo, and saved-draft reload.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
