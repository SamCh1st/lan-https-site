const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const art={},ctx={MapPartProfiles:{ground:new Set(),noShadow:new Set()},MapArt:{extend:extra=>Object.assign(art,extra)}};ctx.window=ctx;
 vm.runInNewContext('"use strict";'+fs.readFileSync('site/map-settlement.js','utf8'),ctx);
 ctx.MapArt.buildings=[];ctx.MapArt.stamps=Object.keys(art);ctx.MapArt.ambience=[];
 ctx.MapSprites={props:[],markers:[]};ctx.MapPartProfiles={nature:[],lights:{},newTypes:[],isLight:()=>false};
 vm.runInNewContext(fs.readFileSync('site/map-catalog.js','utf8'),ctx);
 const parts=JSON.parse(fs.readFileSync('site/assets/map-art/parts-catalog.json','utf8'));
 assert.equal(ctx.MapSettlement.types.length,60);
 for(const type of ctx.MapSettlement.types){assert(ctx.MapCatalog.groups.settlement.includes(type));assert.equal(parts.filter(p=>p.type===type&&p.group==='settlement').length,1);assert(!/undefined|NaN|=\d/.test(art[type]));}
 assert(ctx.MapCatalog.searchText('thatched_house','settlement').includes('housing'));
 const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{const page=await b.newPage({viewport:{width:1200,height:1100}});
 const types=['house','tower','market_stall','well','forge','cart','hay_bale',...ctx.MapSettlement.types];
 await page.setContent('<body style="margin:20px;background:#202c29;color:#eee;font:13px sans-serif"><h2>Existing catalog (first row) and replacement settlement artwork</h2><main style="display:grid;grid-template-columns:repeat(7,1fr);gap:12px">'+types.map(t=>'<div style="text-align:center;background:#33433a;padding:10px;border-radius:8px"><img width="120" height="120" src="data:image/png;base64,'+fs.readFileSync('site/assets/map-art/items/'+t+'.png').toString('base64')+'"><div>'+(ctx.MapSettlement.labels[t]||t)+'</div></div>').join('')+'</main>');
 await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
 assert.equal(await page.locator('img').count(),67);
 assert(await page.locator('img').evaluateAll(imgs=>imgs.every(i=>i.naturalWidth>=128)));
 await page.screenshot({path:'tests/artifacts/settlement-expansion.png',fullPage:true});
 await page.evaluate(()=>{const main=document.querySelector('main');[...main.children].slice(0,-18).forEach(n=>n.remove());main.style.gridTemplateColumns='repeat(6,1fr)';});
 await page.locator('main').screenshot({path:'tests/artifacts/farming-parts.png'});
 console.log('PASS: 60 registered searchable raster parts and existing-catalog comparison gallery');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
