/* Render catalog thumbnails from the same shader used by the map. */
const {chromium}=require('C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const page=await browser.newPage();await page.setContent('<svg width="640" height="640"><defs></defs></svg>');
 await page.addScriptTag({path:path.join(root,'site/map-materials.js')});
 const previews=await page.evaluate(async()=>{const root=document.querySelector('svg'),defs=root.firstElementChild,ns=root.namespaceURI;
  for(const name of MapMaterials.names){const p=document.createElementNS(ns,'pattern');p.id='mapTexture-'+name;defs.append(p);}
  MapMaterials.update(root,{light_angle:315,relief:1,texture_seed:1});if(root.dataset.materialRenderer!=='pbr')throw Error('Material shader failed');
  const results={};for(const name of MapMaterials.names){const image=new Image();image.src=MapMaterials.preview(name);await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=160;const ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high';const crop=image.width*200/640;ctx.drawImage(image,(image.width-crop)/2,(image.height-crop)/2,crop,crop,0,0,160,160);results[name]=canvas.toDataURL();}return results;
 });
 const directory=path.join(root,'site/assets/map-art/materials');fs.mkdirSync(directory,{recursive:true});for(const [name,url] of Object.entries(previews))fs.writeFileSync(path.join(directory,name+'.png'),Buffer.from(url.split(',')[1],'base64'));
 console.log('Rendered '+Object.keys(previews).length+' actual material thumbnails.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
