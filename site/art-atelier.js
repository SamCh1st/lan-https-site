(function(){
'use strict';
const host=document.getElementById('campaignDashboard');if(!host)return;
const root=document.createElement('section');root.id='artAtelier';root.hidden=true;
root.innerHTML=`<h2>Art Atelier</h2><p>Draw a 512 x 512 item icon or character portrait. The checkerboard is transparent in your exported artwork.</p>
<details open><summary>Ask AI to draw</summary><label class="aa-prompt">Describe your artwork<textarea id="aaPrompt" rows="3" maxlength="3000" placeholder="A worn bag of holding with a brass buckle and faint violet light, inventory icon; or an orc paladin portrait in silver armor…"></textarea></label><div class="aa-bar"><label>AI drawing <select id="aaRenderer"><option value="local-image">Local image model</option><option value="vector">Editable vector sketch (experimental)</option></select></label><label>Image size <select id="aaImageSize"><option value="512" selected>512 · Fast</option><option value="768">768</option><option value="1024">1024 · Detailed</option></select></label><label><input id="aaTransparent" type="checkbox" checked> No background (AI removal)</label><label><input id="aaResearch" type="checkbox"> Look up D&amp;D references (slower)</label><label><input id="aaHelpers" type="checkbox"> Helper advice (slower)</label><label><input id="aaAppend" type="checkbox"> Edit / add to current drawing</label><button id="aaGenerate">Draw with AI</button><button id="aaStopAI" disabled>Stop drawing</button></div><p>Generates images on the server computer using FLUX.2 Klein. Choose 512 for speed or 1024 for more detail. Campaign helper advice is optional. No paid API or generation quota. Image edits use the current canvas as a reference and replace its visible artwork with one pixel layer; Undo restores it. Optional D&D research uses the online 2014 SRD. Switch research off for fully offline drawing.</p><fieldset id="aaReferenceControls"><legend>Image references</legend><p>Add up to three images. The image helper describes each one, then the generator uses the images, descriptions and your prompt together. References do not become canvas layers.</p><div class="aa-bar"><label>Import references <input id="aaReferenceImport" type="file" accept="image/png,image/jpeg,image/webp" multiple></label><div id="aaReferencePicker"></div></div><div id="aaReferenceList" class="aa-reference-list"></div><p id="aaReferenceStatus" role="status"></p></fieldset><p id="aaAIStatus" role="status"></p><div id="aaSources"></div><p id="aaAIExplanation"></p></details><fieldset id="aaEditor"><div class="aa-bar"><label>Tool <select id="aaTool"><option value="pen">Pencil</option><option value="select">Select / move</option><option value="pan">Pan</option><option value="rect">Rectangle</option><option value="ellipse">Ellipse</option><option value="line">Line</option><option value="triangle">Triangle</option><option value="star">Star</option><option value="text">Text</option><option value="eraser">Eraser brush</option><option value="erase">Object eraser</option><option value="picker">Color picker</option><option value="fill">Fill shape</option></select></label><label>Ink <input id="aaInk" type="color" value="#e8b55b"></label><label>Width <input id="aaWidth" type="number" min="1" max="60" value="5"></label><label>Fill <input id="aaFill" type="color" value="#477580"></label><label><input id="aaFilled" type="checkbox"> Filled shapes</label><label><input id="aaSnap" type="checkbox"> Snap 8 px</label></div>
<div class="aa-bar"><button id="aaUndo">Undo</button><button id="aaRedo">Redo</button><button id="aaCopy">Duplicate</button><button id="aaDelete">Delete selected</button><button id="aaFront">Bring forward</button><label>Scale % <input id="aaScale" type="number" min="10" max="500" value="100"></label><label>Rotation degrees <input id="aaAngle" type="number" step="15" value="0"></label><button id="aaOut">-</button><button id="aaFit">Fit</button><button id="aaIn">+</button><button id="aaFullscreen">Fullscreen</button><button id="aaClear">Clear drawing</button></div>
<details open><summary>Brush, text &amp; colors</summary><div class="aa-bar"><label><input id="aaSmooth" type="checkbox" checked> Smooth on pause (like building outlines)</label><label>Text <input id="aaText" maxlength="200" value="Hero"></label><label>Font <select id="aaFont"><option>serif</option><option>sans-serif</option><option>monospace</option></select></label><label>Size <input id="aaFontSize" type="number" min="8" max="200" value="48"></label><label>Opacity % <input id="aaOpacity" type="number" min="0" max="100" value="100"></label><button id="aaFlipX">Flip horizontal</button><button id="aaFlipY">Flip vertical</button><button id="aaBack">Send backward</button></div><div class="aa-bar" id="aaPalette" aria-label="Color palette"></div></details>
<details><summary>Layers &amp; files</summary><p>Each stroke, shape, text or imported image is an editable layer. Select a layer to move or style it; hide or lock reference images.</p><div class="aa-bar"><label>Name <input id="aaName" maxlength="60"></label><label>X <input id="aaX" type="number"></label><label>Y <input id="aaY" type="number"></label><label>Stretch X % <input id="aaStretchX" type="number" min="10" max="500" value="100"></label><label>Stretch Y % <input id="aaStretchY" type="number" min="10" max="500" value="100"></label><button id="aaMirror">Mirror copy</button></div><div id="aaLayers"></div><div class="aa-bar"><label>Import image <input id="aaImportImage" type="file" accept="image/png,image/jpeg,image/webp"></label><button id="aaProjectSave">Save PNG</button><label>Open project <input id="aaProjectOpen" type="file" accept=".json"></label><button id="aaSvg">Download SVG</button><label>PNG size <select id="aaExportSize"><option>256</option><option selected>512</option><option>1024</option><option>2048</option></select></label></div></details>
<details><summary>Map stamps &amp; canvas guides</summary><p>Reuse the campaign map’s artwork as an image layer, then draw over it.</p><input id="aaStampSearch" type="search" placeholder="Search map stamps" aria-label="Search map stamps"><div id="aaStamps" class="aa-stamps"></div><div class="aa-bar"><label><input id="aaGrid" type="checkbox"> Show 8 px grid</label><label>Backdrop (view only) <select id="aaBackdrop"><option value="transparent">Transparent</option><option value="#ffffff">White</option><option value="#eee0bc">Parchment</option><option value="#18252b">Dark</option></select></label></div></details><svg id="aaCanvas" tabindex="0" aria-label="Artwork drawing canvas" viewBox="-40 -40 592 592"><defs><pattern id="aaCheck" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="32" height="32" fill="#fff"/><path d="M0 0h16v16H0zM16 16h16v16H16z" fill="#e1e5e6"/></pattern><pattern id="aaGridLines" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M8 0H0V8" fill="none" stroke="#42859a" stroke-opacity=".3" stroke-width=".5"/></pattern><clipPath id="aaClip"><rect width="512" height="512"/></clipPath></defs><rect width="512" height="512" fill="url(#aaCheck)"/><g id="aaArt" clip-path="url(#aaClip)"></g><rect id="aaGridOverlay" width="512" height="512" fill="url(#aaGridLines)" display="none" pointer-events="none"/><g id="aaSelection" pointer-events="none"></g></svg>
<details id="aaArchive"><summary>Save to campaign archive</summary><label>Artwork name <input id="aaArchiveName" maxlength="120" placeholder="Name your artwork"></label><label>Description <textarea id="aaArchiveDescription" rows="3" maxlength="5000" placeholder="Describe this image…"></textarea></label><button id="aaArchiveSave" type="button">Save artwork card</button></details><div class="aa-bar"><button id="aaDownload">Download PNG</button><label>Apply artwork to <select id="aaTarget"></select></label><button id="aaApply">Apply artwork</button></div><p>Drag to draw or move a selection. The eraser brush removes artwork on visible, unlocked layers; Width controls its size. Erasing can be undone. With smoothing enabled, pause while holding the mouse or pen down: the line softens every 0.6 seconds, up to three passes. Use Scale and Rotation to adjust it. Wheel to zoom. Ctrl/Command Z to undo; Ctrl/Command C and V to copy and paste. Clear can be undone.</p><p id="aaStatus" role="status"></p></fieldset>`;
host.append(root);const $=id=>root.querySelector('#'+id),svg=$('aaCanvas'),ns='http://www.w3.org/2000/svg';
// Keep the drawing in view while tools and optional workflows occupy a side panel.
const aiDetails=root.querySelector(':scope > details');aiDetails.classList.add('aa-generation');aiDetails.open=false;
const editor=$('aaEditor'),editorChildren=[...editor.children];
const toolPanel=document.createElement('aside');toolPanel.className='aa-tool-panel';toolPanel.setAttribute('aria-label','Drawing tools');
const canvasPanel=document.createElement('div');canvasPanel.className='aa-canvas-panel';
const selectionDetails=document.createElement('details');selectionDetails.className='aa-selection-controls';selectionDetails.open=true;
selectionDetails.innerHTML='<summary>Selection &amp; transform</summary><div class="aa-bar"></div>';
toolPanel.append(editorChildren[0],selectionDetails);
for(const node of editorChildren.filter(e=>e.tagName==='DETAILS'))toolPanel.append(node);
for(const id of ['aaCopy','aaDelete','aaFront','aaScale','aaAngle']){
 const control=$(id);selectionDetails.lastElementChild.append(control.closest('label')||control);
}
for(const node of editorChildren.filter(e=>e.parentElement===editor))canvasPanel.append(node);
editor.append(toolPanel,canvasPanel);
// A prompt-first workspace; existing editor controls retain their handlers.
root.classList.add('aa-studio');
const studioHeader=document.createElement('header');studioHeader.className='aa-studio-header';
studioHeader.append(root.querySelector('h2'),$('aaFullscreen'));root.prepend(studioHeader);
root.querySelector(':scope > p').textContent='Describe an idea, compare variations, and make it your own.';
const composer=document.createElement('section');composer.className='aa-composer';
composer.setAttribute('aria-label','Generate artwork');root.insertBefore(composer,editor);
composer.append($('aaPrompt').closest('label'));
const quick=document.createElement('div');quick.className='aa-quick-controls';
quick.innerHTML='<label>Art style<select id="aaStyle"><option value="">As described</option><option value="Painterly fantasy illustration">Painted fantasy</option><option value="Painted anime illustration">Painted anime</option><option value="Realistic digital illustration">Realistic</option><option value="Ink and watercolor illustration">Ink &amp; watercolor</option><option value="Pixel art">Pixel art</option></select></label><label>How many?<select id="aaBatchSize"><option>1</option><option>2</option><option selected>4</option><option>6</option></select></label>';
quick.insertBefore($('aaImageSize').closest('label'),quick.lastElementChild);
composer.append(quick);
aiDetails.querySelector('summary').textContent='Generation options';aiDetails.open=false;
const referenceDetails=document.createElement('details');referenceDetails.className='aa-reference-options';
referenceDetails.innerHTML='<summary>Reference images</summary>';referenceDetails.append($('aaReferenceControls'));
composer.append(aiDetails,referenceDetails);
const generateBar=document.createElement('div');generateBar.className='aa-generate-actions';
$('aaGenerate').textContent='Generate images';$('aaStopAI').textContent='Stop generation';
generateBar.append($('aaGenerate'),$('aaStopAI'));composer.append(generateBar,$('aaAIStatus'),$('aaSources'),$('aaAIExplanation'));
root.insertBefore(composer,editor);
const gallery=document.createElement('section');gallery.id='aaGallery';gallery.setAttribute('aria-label','Generated images');
gallery.innerHTML='<div class="aa-gallery-heading"><h3>Your variations</h3><p>Keep favorites in the archive, download them, or open one to draw.</p></div><div id="aaResults" class="aa-results"></div><p id="aaGalleryEmpty">Your generated images will appear here.</p>';
root.insertBefore(gallery,editor);
const drawingDetails=document.createElement('details');drawingDetails.id='aaDrawing';drawingDetails.innerHTML='<summary>Drawing studio</summary>';
editor.before(drawingDetails);drawingDetails.append(editor);
selectionDetails.open=false;
for(const details of toolPanel.querySelectorAll('details'))details.open=false;
const brushDetails=document.createElement('details');brushDetails.innerHTML='<summary>Drawing tools</summary>';brushDetails.open=true;
brushDetails.append(toolPanel.firstElementChild);toolPanel.prepend(brushDetails);
const updateRenderer=()=>{const vector=$('aaRenderer').value==='vector';$('aaStyle').disabled=vector;$('aaBatchSize').disabled=vector; $('aaGenerate').textContent=vector?'Draw vector sketch':'Generate images';};
$('aaRenderer').addEventListener('change',updateRenderer);
document.addEventListener('fullscreenchange',()=>{$('aaFullscreen').textContent=document.fullscreenElement===root?'Exit fullscreen':'Fullscreen';});

let nodes=[],selected=-1,history=[],cursor=0,key='',options={},gesture=null,clipboard=null,view={x:-40,y:-40,w:592},busy=false;
let imageReferences=[],referenceLoading=false;
let selectedReference=-1;
function renderReferences(){
 const list=$('aaReferenceList');list.replaceChildren();
 if(selectedReference>=imageReferences.length)selectedReference=-1;
 imageReferences.forEach((reference,index)=>{
  const tile=document.createElement('button');tile.type='button';tile.className='aa-reference-tile';
  tile.setAttribute('aria-expanded',String(index===selectedReference));tile.setAttribute('aria-controls','aaReferenceDetail');
  const image=document.createElement('img');image.src='/api/uploads/'+reference.image_id;image.alt=reference.name;
  const name=document.createElement('span');name.textContent=reference.name;tile.title=reference.name;
  tile.append(image,name);tile.onclick=()=>{selectedReference=selectedReference===index?-1:index;renderReferences();list.querySelectorAll('.aa-reference-tile')[index]?.focus();};list.append(tile);
 });
 const reference=imageReferences[selectedReference];if(!reference)return;
 const panel=document.createElement('div');panel.className='aa-reference-detail';panel.id='aaReferenceDetail';
 const name=document.createElement('strong');name.textContent=reference.name;
 const label=document.createElement('label');label.textContent='How should this image help?';
 const note=document.createElement('textarea');note.rows=2;note.maxLength=500;note.placeholder='Use this armor, match the colors, borrow the pose…';note.value=reference.note;
 const description=document.createElement('p');description.className='aa-reference-description';description.textContent=reference.description||'The image helper will describe this reference when you generate.';
 note.oninput=()=>{reference.note=note.value;reference.description='';description.textContent='The image helper will describe this reference when you generate.';};label.append(note);
 const remove=document.createElement('button');remove.type='button';remove.textContent='Remove reference';remove.onclick=()=>{imageReferences.splice(selectedReference,1);selectedReference=-1;renderReferences();};
 panel.append(name,label,description,remove);list.append(panel);
}

let referencePicker;
function referenceChoices(){
 if(!referencePicker)referencePicker=window.MapImagePicker.create($('aaReferencePicker'),{
  disabled:()=>referenceLoading||!!aiRun,
  onSelect(image){
   if(imageReferences.length>=3)throw new Error('Use up to three reference images.');
   if(imageReferences.some(r=>r.image_id===image.image_id))throw new Error('That image is already attached.');
   imageReferences.push({...image,note:''});renderReferences();$('aaReferenceStatus').textContent='Reference added.';
  }
 });
 referencePicker.setArtwork(options.referenceRecords||[]);
}
$('aaReferenceImport').onchange=async event=>{
 const campaignKey=key,files=[...event.target.files];if(!files.length)return;
 referenceLoading=true;$('aaReferenceControls').disabled=true;$('aaGenerate').disabled=true;
 try{
  if(files.length+imageReferences.length>3)throw new Error('Use up to three reference images.');
  for(const file of files){
   if(file.size>5000000||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Choose PNG, JPEG or WebP images under 5 MB.');
   $('aaReferenceStatus').textContent='Importing '+file.name+'…';
   const response=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':file.type},body:file});const result=await response.json();
   if(key!==campaignKey)return;
   if(!response.ok)throw new Error(result.error||'Could not import reference.');
   imageReferences.push({image_id:result.image_id,name:file.name,note:''});renderReferences();
  }
  $('aaReferenceStatus').textContent='References ready. Describe how you want to use them.';
 }catch(error){if(key===campaignKey)$('aaReferenceStatus').textContent=error.message;}
 finally{event.target.value='';referenceLoading=false;$('aaReferenceControls').disabled=!!aiRun;$('aaGenerate').disabled=!!aiRun;}
};
const clone=v=>JSON.parse(JSON.stringify(v)),num=(id,fallback,min,max)=>Math.max(min,Math.min(max,($(id).value===''||!Number.isFinite(Number($(id).value))?fallback:Number($(id).value))));
function status(text){$('aaStatus').textContent=text;}
function save(){try{localStorage.setItem(key,JSON.stringify(nodes));}catch{status('Browser storage is full. Download your PNG to keep the artwork.');}}
function commit(){history=history.slice(0,cursor+1);history.push(clone(nodes));if(history.length>100)history.shift();cursor=history.length-1;save();render();}
function el(tag,attrs){const e=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);return e;}
let maskSerial=0;
function artwork(n){const g=el('g',{transform:`translate(${n.x} ${n.y}) rotate(${n.angle}) scale(${n.scale*(n.stretchX||1)*(n.flipX?-1:1)} ${n.scale*(n.stretchY||1)*(n.flipY?-1:1)})`,opacity:n.opacity??1});const attrs={stroke:n.ink,'stroke-width':n.width,fill:n.fill,'stroke-linecap':'round','stroke-linejoin':'round'};
if(n.type==='image'){g.append(el('image',{href:n.src,x:-n.w/2,y:-n.h/2,width:n.w,height:n.h}));}
else if(n.type==='text'){const t=el('text',{fill:n.ink,stroke:'none','font-family':n.font||'serif','font-size':n.fontSize||48,'text-anchor':'middle','dominant-baseline':'middle'});t.textContent=n.text||'Text';g.append(t);}
else if(['triangle','star'].includes(n.type)){const points=n.type==='triangle'?[[0,-n.h/2],[n.w/2,n.h/2],[-n.w/2,n.h/2]]:Array.from({length:10},(_,i)=>{const a=i*Math.PI/5-Math.PI/2,r=i%2?.22:.5;return [Math.cos(a)*n.w*r,Math.sin(a)*n.h*r];});g.append(el('polygon',{...attrs,points:points.map(p=>p.join(',')).join(' ')}));}
else if(n.type==='pen')g.append(el('path',{...attrs,fill:n.closed?n.fill:'none',d:n.points.map((p,i)=>(i?'L':'M')+p[0]+' '+p[1]).join(' ')+(n.closed?' Z':'')}));
else if(n.type==='rect')g.append(el('rect',{...attrs,x:-n.w/2,y:-n.h/2,width:n.w,height:n.h}));
else if(n.type==='ellipse')g.append(el('ellipse',{...attrs,rx:n.w/2,ry:n.h/2}));
else g.append(el('line',{...attrs,x1:-n.w/2,y1:-n.h/2,x2:n.w/2,y2:n.h/2}));
if(n.erasures?.length){
 const id='aaEraseMask'+(++maskSerial),mask=el('mask',{id,maskUnits:'userSpaceOnUse',x:-100000,y:-100000,width:200000,height:200000,'mask-type':'luminance'});
 mask.append(el('rect',{x:-100000,y:-100000,width:200000,height:200000,fill:'white'}));
 for(const stroke of n.erasures)mask.append(el('path',{d:stroke.points.map((p,i)=>(i?'L':'M')+p.join(' ')).join(' '),transform:'matrix('+stroke.matrix.join(' ')+')',fill:'none',stroke:'black','stroke-width':stroke.width,'stroke-linecap':'round','stroke-linejoin':'round'}));
 const inner=el('g',{mask:'url(#'+id+')'});inner.append(...g.childNodes);g.append(mask,inner);
}return g;}
function render(){ $('aaArt').replaceChildren();nodes.forEach((n,i)=>{const g=artwork(n);g.dataset.index=i;if(n.hidden)g.style.display='none';if(n.locked)g.style.pointerEvents='none';$('aaArt').append(g);});$('aaSelection').replaceChildren();if(nodes[selected]){const g=$('aaArt').children[selected],box=g.getBBox(),n=nodes[selected];$('aaSelection').append(el('rect',{x:box.x-4,y:box.y-4,width:box.width+8,height:box.height+8,fill:'none',stroke:'#0b93c4','stroke-dasharray':'5 3','vector-effect':'non-scaling-stroke',transform:g.getAttribute('transform')}));if($('aaTool').value==='select'){$('aaInk').value=n.ink;$('aaWidth').value=n.width;$('aaFilled').checked=n.fill!=='none';if(n.fill!=='none')$('aaFill').value=n.fill;}$('aaScale').value=Math.round(n.scale*100);$('aaAngle').value=n.angle;$('aaOpacity').value=Math.round((n.opacity??1)*100);if(n.type==='text'){$('aaText').value=n.text;$('aaFont').value=n.font||'serif';$('aaFontSize').value=n.fontSize||48;}}
if(!gesture){renderLayers();const n=nodes[selected];for(const [id,field,defaultValue]of [['aaX','x',0],['aaY','y',0],['aaName','name','']]){$(id).value=n?.[field]??defaultValue;$(id).disabled=!n||!!n.locked;}for(const [id,field]of [['aaStretchX','stretchX'],['aaStretchY','stretchY']]){$(id).value=Math.round((n?.[field]||1)*100);$(id).disabled=!n||!!n.locked;}}$('aaUndo').disabled=cursor<=0;$('aaRedo').disabled=cursor>=history.length-1;for(const id of ['aaDelete','aaCopy','aaFront','aaScale','aaAngle','aaOpacity','aaFlipX','aaFlipY','aaBack'])$(id).disabled=!nodes[selected]||!!nodes[selected].locked;}
function setView(){svg.setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.w}`);}
function point(e){const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());return {x:$('aaSnap').checked?Math.round(p.x/8)*8:p.x,y:$('aaSnap').checked?Math.round(p.y/8)*8:p.y};}
let smoothTimer=null;
function scheduleSmoothing(){
  clearTimeout(smoothTimer);
  if(!gesture||gesture.tool!=='pen'||!$('aaSmooth').checked)return;
  const stroke=gesture,node=nodes[selected];let pass=0;
  const tick=()=>{
    if(gesture!==stroke||!$('aaSmooth').checked||!window.MapBuildingCurves)return;
    if(node.points.length>3){node.points=window.MapBuildingCurves.smoothLine(node.points,3+pass*2);render();}
    if(++pass<3)smoothTimer=setTimeout(tick,600);
  };
  smoothTimer=setTimeout(tick,600);
}
$('aaSmooth').onchange=scheduleSmoothing;
function finish(){clearTimeout(smoothTimer);smoothTimer=null;if(!gesture)return;const changed=gesture.changed;gesture=null;if(changed)commit();}
svg.onpointerdown=e=>{if(aiRun||e.button!==0)return;svg.focus({preventScroll:true});const p=point(e),tool=$('aaTool').value;svg.setPointerCapture(e.pointerId);if(tool==='eraser'){
 if(p.x<0||p.x>512||p.y<0||p.y>512)return;
 const strokes=[];
 nodes.forEach((n,i)=>{if(n.hidden||n.locked)return;const matrix=$('aaArt').children[i].transform.baseVal.consolidate().matrix.inverse();
 const stroke={points:[[p.x,p.y],[p.x+.001,p.y]],width:num('aaWidth',5,1,60),matrix:[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f]};
 (n.erasures??=[]).push(stroke);strokes.push(stroke);});
 selected=-1;gesture={tool,p,strokes,changed:strokes.length>0};render();return;
}if(['erase','picker','fill'].includes(tool)){const i=Number(e.target.closest('[data-index]')?.dataset.index??-1),n=nodes[i];if(!n||n.locked)return;if(tool==='erase'){nodes.splice(i,1);selected=-1;commit();}else if(tool==='picker'){$('aaInk').value=n.ink;}else{n.fill=$('aaFill').value;selected=i;commit();}return;}if(tool==='select'){selected=Number(e.target.closest('[data-index]')?.dataset.index??-1);gesture={tool,p,original:clone(nodes[selected]||{}),changed:false};render();return;}if(tool==='pan'){gesture={tool,p,view:{...view},changed:false};return;}if(p.x<0||p.x>512||p.y<0||p.y>512)return;if(nodes.length>=1000){status('This drawing holds 1,000 shapes.');return;}nodes.push({type:tool,x:p.x,y:p.y,w:1,h:1,points:[[0,0],[.01,.01]],angle:0,scale:1,ink:$('aaInk').value,width:num('aaWidth',5,1,60),fill:$('aaFilled').checked?$('aaFill').value:'none',opacity:num('aaOpacity',100,0,100)/100,text:$('aaText').value,font:$('aaFont').value,fontSize:num('aaFontSize',48,8,200)});selected=nodes.length-1;gesture={tool,p,changed:true};render();};
svg.onpointermove=e=>{if(!gesture)return;const p=point(e),g=gesture,n=nodes[selected];if(g.tool==='eraser'){for(const stroke of g.strokes)if(stroke.points.length<6000)stroke.points.push([p.x,p.y]);render();return;}if(e.shiftKey&&g.tool!=='pen'&&g.tool!=='select'&&g.tool!=='pan'){const d=Math.max(Math.abs(p.x-g.p.x),Math.abs(p.y-g.p.y));p.x=g.p.x+Math.sign(p.x-g.p.x)*d;p.y=g.p.y+Math.sign(p.y-g.p.y)*d;}if(g.tool==='pan'){view.x+=g.p.x-p.x;view.y+=g.p.y-p.y;setView();return;}if(!n||n.locked)return;if(g.tool==='text')return;if(g.tool==='select'){n.x=g.original.x+p.x-g.p.x;n.y=g.original.y+p.y-g.p.y;g.changed=true;}else if(g.tool==='pen'){if(n.points.length<6000){n.points.push([p.x-g.p.x,p.y-g.p.y]);scheduleSmoothing();}}else{n.x=(p.x+g.p.x)/2;n.y=(p.y+g.p.y)/2;n.w=Math.max(1,Math.abs(p.x-g.p.x));n.h=Math.max(1,Math.abs(p.y-g.p.y));if(g.tool==='line'){n.w=p.x-g.p.x;n.h=p.y-g.p.y;}}render();};
svg.onpointerup=finish;svg.onpointercancel=finish;svg.onlostpointercapture=finish;
function zoom(f,p={x:view.x+view.w/2,y:view.y+view.w/2}){const w=Math.max(80,Math.min(2048,view.w*f)),ratio=w/view.w;view={x:p.x-(p.x-view.x)*ratio,y:p.y-(p.y-view.y)*ratio,w};setView();}
svg.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY>0?1.1:1/1.1,point(e));},{passive:false});
$('aaIn').onclick=()=>zoom(.8);$('aaOut').onclick=()=>zoom(1.25);$('aaFit').onclick=()=>{view={x:-40,y:-40,w:592};setView();};
function undo(delta){finish();const next=cursor+delta;if(next<0||next>=history.length)return;cursor=next;nodes=clone(history[cursor]);selected=-1;save();render();}
$('aaUndo').onclick=()=>undo(-1);$('aaRedo').onclick=()=>undo(1);$('aaDelete').onclick=()=>{if(selected<0||nodes[selected].locked)return;nodes.splice(selected,1);selected=-1;commit();};
function paste(){if(!clipboard||nodes.length>=1000)return;const n=clone(clipboard);n.x+=12;n.y+=12;nodes.push(n);selected=nodes.length-1;commit();}
$('aaCopy').onclick=()=>{if(nodes[selected]){clipboard=clone(nodes[selected]);paste();}};
$('aaFront').onclick=()=>{if(selected<0)return;nodes.push(nodes.splice(selected,1)[0]);selected=nodes.length-1;commit();};
$('aaScale').onchange=()=>{if(nodes[selected]&&!nodes[selected].locked){nodes[selected].scale=num('aaScale',100,10,500)/100;commit();}};
$('aaAngle').onchange=()=>{if(nodes[selected]&&!nodes[selected].locked){nodes[selected].angle=num('aaAngle',0,-3600,3600);commit();}};
for(const id of ['aaInk','aaWidth','aaFill','aaFilled'])$(id).onchange=()=>{if($('aaTool').value!=='select'||!nodes[selected]||nodes[selected].locked)return;Object.assign(nodes[selected],{ink:$('aaInk').value,width:num('aaWidth',5,1,60),fill:$('aaFilled').checked?$('aaFill').value:'none'});commit();};
$('aaClear').onclick=()=>{nodes=[];selected=-1;commit();};
$('aaFullscreen').onclick=async()=>{try{if(document.fullscreenElement===root)await document.exitFullscreen();else await root.requestFullscreen();}catch{status('Fullscreen is unavailable in this browser.');}};
svg.onkeydown=e=>{if(aiRun){e.preventDefault();return;}const mod=e.ctrlKey||e.metaKey;if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey?1:-1);}if(mod&&e.key.toLowerCase()==='c'&&nodes[selected]){e.preventDefault();clipboard=clone(nodes[selected]);}if(mod&&e.key.toLowerCase()==='v'){e.preventDefault();paste();}if(e.key==='Delete'){e.preventDefault();$('aaDelete').click();}};
async function png(size){finish();if(!nodes.length)throw new Error('Draw something first.');const output=el('svg',{width:512,height:512,viewBox:'0 0 512 512'});nodes.filter(n=>!n.hidden).forEach(n=>output.append(artwork(n)));const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(output)],{type:'image/svg+xml'}));try{const image=new Image();image.src=url;await image.decode();const c=document.createElement('canvas');c.width=c.height=size||Number($('aaExportSize').value);c.getContext('2d').drawImage(image,0,0,c.width,c.height);return await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('Could not export artwork.')),'image/png'));}finally{URL.revokeObjectURL(url);}}
$('aaDownload').onclick=async()=>{try{const url=URL.createObjectURL(await png()),a=document.createElement('a');a.href=url;a.download='campaign-artwork.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('PNG downloaded.');}catch(e){status(e.message);}};
$('aaArchiveSave').onclick=async()=>{
 if(busy||aiRun)return;
 const title=$('aaArchiveName').value.trim(),description=$('aaArchiveDescription').value.trim();
 if(!title){status('Give the artwork a name before saving.');$('aaArchiveName').focus();return;}
 const archive=options.archive;if(!archive){status('Open this atelier from your campaign to save an artwork card.');return;}
 busy=true;$('aaArchiveSave').disabled=true;
 try{const blob=await png();status('Saving artwork to the campaign…');await archive(title,description,blob);status('Artwork card saved. Find it in Archive → Artwork.');}
 catch(error){status(error.message);}finally{busy=false;$('aaArchiveSave').disabled=false;}
};
$('aaApply').onclick=async()=>{if(busy)return;referenceChoices();const target=$('aaTarget').value;if(!target){status('Create an item or character in this campaign first.');return;}busy=true;$('aaApply').disabled=true;const apply=options.save;try{const blob=await png();status('Saving artwork...');await apply(target,blob);status('Artwork applied. Your campaign cards now use the new image.');}catch(e){status(e.message);}finally{busy=false;$('aaApply').disabled=false;}};

function renderLayers(){const list=$('aaLayers');list.replaceChildren();nodes.map((n,i)=>({n,i})).reverse().forEach(({n,i})=>{const row=document.createElement('div');row.className='aa-bar';const b=document.createElement('button');b.textContent=(n.name||n.type)+' '+(i+1);b.setAttribute('aria-pressed',String(i===selected));b.onclick=()=>{selected=i;$('aaTool').value='select';render();};row.append(b);for(const [field,label] of [['hidden','Hide'],['locked','Lock']]){const l=document.createElement('label'),c=document.createElement('input');c.type='checkbox';c.checked=!!n[field];c.onchange=()=>{n[field]=c.checked;commit();};l.append(c,document.createTextNode(label));row.append(l);}list.append(row);});}
for(const color of ['#000000','#ffffff','#e8b55b','#ad4b45','#427480','#618756','#a66dba','#cf9170','#364758','#e7cbb5']){const b=document.createElement('button');b.style.background=color;b.style.width='32px';b.setAttribute('aria-label','Ink '+color);b.onclick=()=>{$('aaInk').value=color;$('aaInk').dispatchEvent(new Event('change'));};$('aaPalette').append(b);}
for(const id of ['aaText','aaFont','aaFontSize'])$(id).onchange=()=>{const n=nodes[selected];if(!n||n.locked||n.type!=='text')return;n.text=$('aaText').value;n.font=$('aaFont').value;n.fontSize=num('aaFontSize',48,8,200);commit();};
$('aaOpacity').onchange=()=>{if(nodes[selected]&&!nodes[selected].locked){nodes[selected].opacity=num('aaOpacity',100,0,100)/100;commit();}};
for(const [id,field] of [['aaFlipX','flipX'],['aaFlipY','flipY']])$(id).onclick=()=>{if(nodes[selected]&&!nodes[selected].locked){nodes[selected][field]=!nodes[selected][field];commit();}};
$('aaBack').onclick=()=>{if(selected>0&&!nodes[selected].locked){const n=nodes.splice(selected,1)[0];nodes.splice(--selected,0,n);commit();}};
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function validate(value){if(!Array.isArray(value)||value.length>1000)throw new Error('Invalid project: at most 1,000 layers.');return value.map(n=>{if(!['pen','rect','ellipse','line','triangle','star','text','image'].includes(n.type)||!['x','y','w','h','scale','angle','width'].every(k=>Number.isFinite(n[k])&&Math.abs(n[k])<100000)||!/^#[0-9a-f]{6}$/i.test(n.ink)||!(n.fill==='none'||/^#[0-9a-f]{6}$/i.test(n.fill)))throw new Error('Invalid artwork layer.');if(n.type==='pen'&&(!Array.isArray(n.points)||n.points.length>6000||!n.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<100000))))throw new Error('Invalid pencil stroke.');if(n.type==='image'&&(!/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(n.src)||n.src.length>7000000))throw new Error('Invalid embedded image.');if(n.erasures!==undefined&&(!Array.isArray(n.erasures)||!n.erasures.every(s=>Number.isFinite(s.width)&&s.width>=1&&s.width<=60&&Array.isArray(s.matrix)&&s.matrix.length===6&&s.matrix.every(Number.isFinite)&&Array.isArray(s.points)&&s.points.length<=6000&&s.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))))throw new Error('Invalid eraser stroke.');return {...n,stretchX:Math.max(.1,Math.min(5,Number(n.stretchX)||1)),stretchY:Math.max(.1,Math.min(5,Number(n.stretchY)||1)),text:String(n.text||'').slice(0,200),opacity:Number.isFinite(n.opacity)?Math.max(0,Math.min(1,n.opacity)):1,font:['serif','sans-serif','monospace'].includes(n.font)?n.font:'serif',fontSize:Math.max(8,Math.min(200,Number(n.fontSize)||48))};});}
$('aaProjectSave').onclick=()=>$('aaDownload').click();
$('aaProjectOpen').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>10000000)throw new Error('Project exceeds 10 MB.');const project=JSON.parse(await file.text());if(project.version!==1)throw new Error('Unsupported project version.');nodes=validate(project.nodes);selected=-1;commit();status('Project opened. Undo restores the previous drawing.');}catch(error){status(error.message);}finally{e.target.value='';}};
$('aaSvg').onclick=()=>{const output=el('svg',{width:512,height:512,viewBox:'0 0 512 512'});nodes.filter(n=>!n.hidden).forEach(n=>output.append(artwork(n)));download(new Blob([new XMLSerializer().serializeToString(output)],{type:'image/svg+xml'}),'campaign-artwork.svg');};
$('aaImportImage').onchange=async e=>{const campaignKey=key;try{const file=e.target.files[0];if(!file)return;if(file.size>5000000||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Choose a PNG, JPEG or WebP under 5 MB.');const src=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Cannot read image.'));r.readAsDataURL(file);});const image=new Image();image.src=src;await image.decode();if(key!==campaignKey)return;if(nodes.length>=1000)throw new Error('Layer limit reached.');const ratio=Math.min(480/image.width,480/image.height);nodes.push({type:'image',src,x:256,y:256,w:image.width*ratio,h:image.height*ratio,scale:1,angle:0,ink:'#000000',fill:'none',width:1,opacity:1});selected=nodes.length-1;commit();status('Image added. Lock its layer to trace over it.');}catch(error){status(error.message);}finally{e.target.value='';}};


for(const [id,field] of [['aaX','x'],['aaY','y'],['aaName','name'],['aaStretchX','stretchX'],['aaStretchY','stretchY']])$(id).onchange=()=>{const n=nodes[selected];if(!n||n.locked)return;n[field]=field==='name'?$(id).value.slice(0,60):field.startsWith('stretch')?num(id,100,10,500)/100:num(id,0,-10000,10000);commit();};
$('aaMirror').onclick=()=>{if(!nodes[selected]||nodes.length>=1000)return;const n=clone(nodes[selected]);n.x=512-n.x;n.angle=-n.angle;n.flipX=!n.flipX;n.locked=false;nodes.push(n);selected=nodes.length-1;commit();};
$('aaGrid').onchange=()=>$('aaGridOverlay').setAttribute('display',$('aaGrid').checked?'inline':'none');
$('aaBackdrop').onchange=()=>svg.querySelector(':scope > rect').setAttribute('fill',$('aaBackdrop').value==='transparent'?'url(#aaCheck)':$('aaBackdrop').value);
async function stamp(type){const campaignKey=key;try{const markup=window.MapArt.icon(type).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" ');const url=URL.createObjectURL(new Blob([markup],{type:'image/svg+xml'}));try{const img=new Image();img.src=url;await img.decode();if(key!==campaignKey||nodes.length>=1000)return;const c=document.createElement('canvas');c.width=c.height=256;c.getContext('2d').drawImage(img,0,0,256,256);nodes.push({type:'image',name:type,src:c.toDataURL('image/png'),x:256,y:256,w:200,h:200,angle:0,scale:1,width:1,ink:'#000000',fill:'none'});selected=nodes.length-1;commit();}finally{URL.revokeObjectURL(url);}}catch(e){status('Could not load this stamp: '+e.message);}}
function stamps(){const text=$('aaStampSearch').value.toLowerCase();$('aaStamps').replaceChildren();for(const type of window.MapArt?.stamps||[]){if(!type.toLowerCase().includes(text))continue;const b=document.createElement('button');b.type='button';b.innerHTML=window.MapArt.icon(type);const label=document.createElement('span');label.textContent=type.replaceAll('_',' ');b.append(label);b.onclick=()=>stamp(type);$('aaStamps').append(b);}}
$('aaStampSearch').oninput=stamps;


let aiRun=null,artCampaign=null;
async function fetchArtwork(url,signal){
  for(let attempt=0;attempt<3;attempt++){
    try{const response=await fetch(url,{signal});if(response.ok)return response;if(response.status<500||attempt===2)throw new Error('Could not load the generated image (HTTP '+response.status+').');}
    catch(error){if(signal.aborted||!(error instanceof TypeError)||attempt===2)throw error;}
    $('aaAIStatus').textContent='Reconnecting to load your finished image...';await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
  }
}
function aiControls(running){$('aaStyle').disabled=running||$('aaRenderer').value==='vector';$('aaBatchSize').disabled=running||$('aaRenderer').value==='vector';$('aaReferenceControls').disabled=running||referenceLoading;$('aaEditor').disabled=running;$('aaGenerate').disabled=running;$('aaStopAI').disabled=!running;$('aaPrompt').disabled=running;$('aaResearch').disabled=running;$('aaHelpers').disabled=running;$('aaTransparent').disabled=running;$('aaAppend').disabled=running;$('aaRenderer').disabled=running;$('aaImageSize').disabled=running;root.classList.toggle('aa-generating',running);}
function stopAI(){if(!aiRun)return;const run=aiRun;aiRun=null;run.controller.abort();if(run.batch){stopBatch(run);aiControls(false);return;}if(run.changed)commit();aiControls(false);$('aaAIStatus').textContent=run.changed?'Drawing stopped. Partial artwork kept; Undo restores your previous drawing.':'Drawing stopped. Your previous artwork is unchanged.';}
$('aaStopAI').onclick=stopAI;
// Each batch takes one immutable snapshot, including the same drawing reference.
// Two requests can prepare concurrently; the server serializes GPU work.
let batchSerial=0;
const artText=text=>window.SiteI18n?.translate?.(text)||text;
function resultButton(label,handler){const b=document.createElement('button');b.type='button';b.textContent=artText(label);b.onclick=handler;return b;}
function stopBatch(run){
  run.controller.abort();
  for(const result of run.results)if(!result.finished){result.finished=true;result.message.textContent=artText('Stopped');result.card.classList.remove('aa-pending');}
  $('aaAIStatus').textContent=artText('Generation stopped. Finished images are still available.');
}
async function generateBatch(){
  const prompt=$('aaPrompt').value.trim();
  if(!prompt){$('aaAIStatus').textContent=artText('Describe the artwork first.');$('aaPrompt').focus();return;}
  finish();
  const campaignKey=key,archive=options.archive;
  const run={controller:new AbortController(),batch:true,results:[],changed:false};
  const count=Number($('aaBatchSize').value)||1;
  const payload={prompt:prompt+($('aaStyle').value?'\nArt style: '+$('aaStyle').value:''),renderer:'local-image',image_size:Number($('aaImageSize').value),research:$('aaResearch').checked,use_helpers:$('aaHelpers').checked,transparent_background:$('aaTransparent').checked,edit:$('aaAppend').checked,image_references:imageReferences.map(({image_id,name,note})=>({image_id,name,note}))};
  const endpoint='/api/campaign/'+artCampaign+'/art/design';
  const valid=()=>aiRun===run&&key===campaignKey&&!run.controller.signal.aborted;
  aiRun=run;aiControls(true);$('aaGalleryEmpty').hidden=true;$('aaSources').replaceChildren();$('aaAIExplanation').textContent='';
  const batch=++batchSerial;
  for(let i=0;i<Math.min(6,count);i++){
    const card=document.createElement('article');card.className='aa-result aa-pending';
    const preview=document.createElement('div');preview.className='aa-result-preview';
    const title=document.createElement('h4');title.textContent=artText('Variation')+' '+batch+'.'+(i+1);
    const message=document.createElement('p');message.textContent=artText('Waiting to generate…');message.setAttribute('role','status');
    card.append(preview,title,message);$('aaResults').append(card);
    run.results.push({card,preview,message,title,index:i,finished:false});
  }
  const completeResult=async(result,imageId,description)=>{
    const response=await fetchArtwork('/api/uploads/'+imageId,run.controller.signal);
    if(!response.ok)throw new Error('Could not load the generated image.');
    const blob=await response.blob();
    const src=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Could not read the image.'));r.readAsDataURL(blob);});
    const image=new Image();image.src=src;image.alt=prompt;await image.decode();
    if(!valid())return;
    if(payload.transparent_background){
      const check=document.createElement('canvas');check.width=image.naturalWidth;check.height=image.naturalHeight;
      const ctx=check.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,check.width,check.height).data;
      let clear=0,solid=0;for(let i=3;i<pixels.length;i+=4){if(pixels[i]<10)clear++;if(pixels[i]>128)solid++;}
      if(clear<check.width*check.height*.01||!solid)throw new Error('The image still has a background. Try again or disable background removal.');
    }
    result.preview.append(image);result.card.classList.remove('aa-pending');result.finished=true;result.success=true;result.message.textContent=artText('Ready');
    const actions=document.createElement('div');actions.className='aa-result-actions';
    const keep=resultButton('Keep in archive',async()=>{
      if(key!==campaignKey||keep.disabled)return;
      if(!archive){result.message.textContent=artText('Open this atelier from your campaign to save an artwork card.');return;}
      keep.disabled=true;
      try{await archive(prompt.slice(0,95)+' · '+result.title.textContent,description||prompt,blob);if(key!==campaignKey)return;keep.textContent=artText('Kept in archive');result.message.textContent=artText('Saved to your campaign.');}
      catch(error){keep.disabled=false;result.message.textContent=error.message;}
    });
    const edit=resultButton('Open in drawing studio',()=>{
      if(aiRun||key!==campaignKey){result.message.textContent=artText('Wait for generation to finish, or stop it before editing.');return;}
      finish();const imageNode=validate([{type:'image',name:prompt.slice(0,60),src,x:256,y:256,w:512,h:512,scale:1,angle:0,ink:'#000000',fill:'none',width:1}])[0];
      nodes=[imageNode];selected=0;commit();drawingDetails.open=true;drawingDetails.scrollIntoView({behavior:'smooth',block:'start'});status(artText('Image opened. Undo restores your previous drawing.'));
    });
    const downloadButton=resultButton('Download PNG',()=>download(blob,'artwork-'+batch+'-'+(result.index+1)+'.png'));
    const discard=resultButton('Discard',()=>{result.card.remove();$('aaGalleryEmpty').hidden=!!$('aaResults').children.length;});
    actions.append(keep,edit,downloadButton,discard);result.card.append(actions);
  };
  async function generateOne(result){
    result.message.textContent=artText('Starting…');
    let reader;
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:run.controller.signal});
      if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.error||'The AI drawing service is unavailable.');}
      reader=response.body.getReader();const decoder=new TextDecoder();let buffer='',imageId=null,done=false,description='';
      const event=line=>{
        if(!line.trim()||!valid())return;const e=JSON.parse(line);
        if(e.event==='error')throw new Error(e.message);
        if(e.event==='status')result.message.textContent=e.message;
        if(e.event==='image'){if(!Number.isInteger(e.image_id)||e.image_id<1)throw new Error('Invalid generated image.');imageId=e.image_id;}
        if(e.event==='done'){done=true;description=[e.description,e.interpretation].filter(Boolean).join(' ');}
        if(e.event==='image_reference'&&imageReferences[e.index]){imageReferences[e.index].description=e.description;renderReferences();}
      };
      while(valid()){
        const part=await reader.read();buffer+=decoder.decode(part.value||new Uint8Array(),{stream:!part.done});
        if(buffer.length>250000)throw new Error('Drawing response exceeded its size limit.');
        let end;while((end=buffer.indexOf('\n'))>=0){event(buffer.slice(0,end));buffer=buffer.slice(end+1);}
        if(part.done){if(buffer.trim())event(buffer);break;}
      }
      if(!valid())return;
      if(!done||!imageId)throw new Error('The AI stopped before completing this image.');
      await completeResult(result,imageId,description);
    }catch(error){if(valid()){result.finished=true;result.card.classList.remove('aa-pending');result.card.classList.add('aa-failed');result.message.textContent=error.message;}}
    finally{if(reader)await reader.cancel().catch(()=>{});}
  }
  try{
    if(payload.edit){
      if(nodes.some(n=>n.locked&&!n.hidden))throw new Error('Unlock visible layers before asking the image model to edit the whole canvas.');
      $('aaAIStatus').textContent=artText('Preparing your drawing reference…');
      const blob=await png(payload.image_size);
      const upload=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':'image/png'},body:blob,signal:run.controller.signal});
      const result=await upload.json();if(!upload.ok)throw new Error(result.error||'Could not upload the canvas reference.');payload.source_image_id=result.image_id;
    }
    let next=0;
    const worker=async()=>{while(valid()&&next<run.results.length){const result=run.results[next++];await generateOne(result);if(valid())$('aaAIStatus').textContent=run.results.filter(r=>r.finished).length+' / '+run.results.length+' '+artText('finished');}};
    await Promise.all([worker(),worker()]);
    if(valid())$('aaAIStatus').textContent=run.results.filter(r=>r.success).length+' / '+run.results.length+' '+artText('images ready. Keep your favorites below.');
  }catch(error){if(valid()){$('aaAIStatus').textContent=error.message;for(const result of run.results)if(!result.finished){result.finished=true;result.card.classList.remove('aa-pending');result.message.textContent=error.message;}}}
  finally{if(aiRun===run){run.controller.abort();aiRun=null;aiControls(false);}}
}

$('aaGenerate').onclick=async()=>{
  if(aiRun||busy||referenceLoading)return;
  if($('aaRenderer').value==='local-image')return generateBatch();
  drawingDetails.open=true;
  if(aiRun||busy||referenceLoading)return;if(imageReferences.length&&$('aaRenderer').value!=='local-image'){$('aaAIStatus').textContent='Choose Local image model to use image references.';return;}const prompt=$('aaPrompt').value.trim();if(!prompt){$('aaAIStatus').textContent='Describe the artwork first.';return;}
  imageReferences.forEach(reference=>{reference.description='';});renderReferences();
  finish();const run={controller:new AbortController(),changed:false,append:$('aaAppend').checked,transparent:$('aaTransparent').checked,renderer:$('aaRenderer').value,count:0,stage:'connecting to the AI service'};aiRun=run;aiControls(true);$('aaAIStatus').textContent='Connecting to your campaign AI…';$('aaSources').replaceChildren();$('aaAIExplanation').textContent='';
  let completed=false;
  try{
    let source_image_id;
    if(run.renderer==='local-image'&&run.append){
      if(nodes.some(n=>n.locked&&!n.hidden))throw new Error('Unlock visible layers before asking the image model to edit the whole canvas.');
      run.stage='uploading the canvas reference';const blob=await png(Number($('aaImageSize').value));
      const upload=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':'image/png'},body:blob,signal:run.controller.signal});
      const result=await upload.json();if(!upload.ok)throw new Error(result.error||'Could not upload the canvas reference.');source_image_id=result.image_id;
    }
    if(aiRun!==run)return;
    run.stage='starting the AI request';const response=await fetch('/api/campaign/'+artCampaign+'/art/design',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,image_references:imageReferences.map(({image_id,name,note})=>({image_id,name,note})),renderer:run.renderer,image_size:Number($('aaImageSize').value),source_image_id,research:$('aaResearch').checked,use_helpers:$('aaHelpers').checked,transparent_background:$('aaTransparent').checked,edit:run.append,layers:run.append?nodes.map(n=>({name:n.name,type:n.type,x:n.x,y:n.y,w:n.w,h:n.h,angle:n.angle,scale:n.scale,stretchX:n.stretchX,stretchY:n.stretchY,flipX:n.flipX,flipY:n.flipY,fill:n.fill,ink:n.ink,locked:n.locked})):undefined,selected:run.append&&selected>=0?[selected]:[]}),signal:run.controller.signal});
    if(!response.ok){let data;try{data=await response.json();}catch{}throw new Error(data?.error||'The AI drawing service is unavailable. Restart the server and try again.');}
    run.stage='receiving the drawing';const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
    const event=async line=>{
      if(!line.trim()||aiRun!==run)return;const e=JSON.parse(line);
      if(e.event==='error')throw new Error(e.message);
      if(e.event==='status')$('aaAIStatus').textContent=e.message;
      if(e.event==='image_reference'&&imageReferences[e.index]){imageReferences[e.index].description=e.description;renderReferences();}
      if(e.event==='references'){ $('aaAIStatus').textContent=e.message;for(const source of e.sources||[]){if(!String(source.url).startsWith('https://www.dnd5eapi.co/api/2014/'))continue;const a=document.createElement('a');a.textContent=source.title;a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';$('aaSources').append(a,document.createTextNode(' '));}}
      if(e.event==='image'){
        if(!Number.isInteger(e.image_id)||e.image_id<1)throw new Error('Invalid generated image.');
        run.stage='loading the finished image';const response=await fetchArtwork('/api/uploads/'+e.image_id,run.controller.signal);
        if(!response.ok)throw new Error('Could not load the generated image.');
        const blob=await response.blob();
        const src=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Could not read the image.'));reader.readAsDataURL(blob);});
        const img=new Image();img.src=src;await img.decode();
        if(run.transparent){
          const check=document.createElement('canvas');check.width=img.naturalWidth;check.height=img.naturalHeight;
          const context=check.getContext('2d',{willReadFrequently:true});context.drawImage(img,0,0);
          const pixels=context.getImageData(0,0,check.width,check.height).data;let clear=0,solid=0;
          for(let i=3;i<pixels.length;i+=4){if(pixels[i]<10)clear++;if(pixels[i]>128)solid++;}
          if(clear<check.width*check.height*.01||!solid)throw new Error('The image still has a background. Restart the site server to load AI background removal, then try again.');
        }
        if(aiRun!==run)return;
        const imageNode=validate([{type:'image',name:'Local AI artwork',src,x:256,y:256,w:512,h:512,scale:1,angle:0,ink:'#000000',fill:'none',width:1}])[0];
        nodes=(run.append?nodes.filter(n=>n.hidden):[]).concat(imageNode);selected=nodes.length-1;run.changed=true;run.count=1;render();save();
      }
      if(e.event==='edit'){
        if(!run.append)throw new Error('Unexpected edit response.');
        const updated=clone(nodes),removed=new Set(),extra=[];
        for(const op of e.operations){
          for(const i of op.targets||[]){const n=updated[i];if(!n||n.locked||removed.has(i))throw new Error('Edit references a missing or locked layer.');
            if(op.action==='scale'){const factor=op.factor;if(!Number.isFinite(factor)||factor<.2||factor>4)throw new Error('Invalid edit scale.');if(op.anchor==='bottom'){let bottom=n.type==='pen'?Math.max(...n.points.map(p=>p[1])):n.h/2;bottom*=n.scale*(n.stretchY||1)*(n.flipY?-1:1);const a=n.angle*Math.PI/180;n.x+=(1-factor)*(-Math.sin(a)*bottom);n.y+=(1-factor)*Math.cos(a)*bottom;}n.scale*=factor;}
            else if(op.action==='move'){n.x+=op.dx;n.y+=op.dy;}
            else if(op.action==='recolor'){if(n.fill==='none')n.ink=op.color;else n.fill=op.color;}
            else if(op.action==='remove')removed.add(i);
            else if(op.action==='duplicate'){const copy=clone(n);copy.x+=op.dx;copy.y+=op.dy;extra.push(copy);}
          }
          if(op.action==='add_part')extra.push(...validate(op.nodes));
        }
        const result=validate(updated.filter((n,i)=>!removed.has(i)).concat(extra));nodes=result;selected=-1;run.changed=true;run.count=e.operations.length;render();save();
      }
      if(e.event==='layer'){
        const n=validate([e.node])[0];if(!run.changed&&!run.append)nodes=[];if(nodes.length>=1000)throw new Error('The drawing reached the 1,000-layer limit.');nodes.push(n);selected=-1;run.changed=true;run.count++;render();save();$('aaAIStatus').textContent='Drawing layer '+run.count+' · '+(n.name||n.type);await new Promise(resolve=>setTimeout(resolve,20));
      }
      if(e.event==='done'){completed=true;$('aaAIStatus').textContent=(e.skipped_layers?'Partial drawing · ':e.result_kind==='edit'?'Drawing updated · ':e.result_kind==='sketch'?'Experimental sketch · ':e.result_kind==='composed'?'Illustration drawn · ':'Drawing complete · ')+run.count+(e.result_kind==='image'?' image layer.':e.result_kind==='edit'?' edit operations.':' editable layers.')+(e.skipped_layers?' '+e.skipped_layers+' invalid layers were skipped. You can edit the draft or retry.':'');$('aaAIExplanation').textContent=[e.description,e.interpretation,e.helper_models?.length?'Reviewed by helpers: '+e.helper_models.join(', ')+'.':''].filter(Boolean).join(' ');}
    };
    while(aiRun===run){const part=await reader.read();buffer+=decoder.decode(part.value||new Uint8Array(),{stream:!part.done});if(buffer.length>250000)throw new Error('Drawing response exceeded its size limit.');let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);await event(line);}if(part.done){if(buffer.trim())await event(buffer);break;}}
    if(aiRun===run&&!completed)throw new Error('The AI stopped before completion. Partial artwork is kept.');
  }catch(error){if(aiRun===run)$('aaAIStatus').textContent=(error instanceof TypeError&&/fetch|network|load failed/i.test(error.message)?'Connection to the site was lost while '+run.stage+'. Check that the site server is still running, then refresh and try again.':error.message)+(run.changed?' Undo restores your previous drawing.':' Your previous artwork is unchanged.');}
  finally{if(aiRun===run){run.controller.abort();aiRun=null;if(run.changed)commit();aiControls(false);}}
};

window.ArtAtelier={setActive(on,campaign,user,config){if(!on){stopAI();finish();root.hidden=true;host.classList.remove('art-mode');if(document.fullscreenElement===root)document.exitFullscreen();return;}options=config||{};artCampaign=campaign;if(root.hidden)stamps();const next=`art-atelier:v1:${user}:${campaign}`;if(key!==next){stopAI();finish();selectedReference=-1;$('aaResults').replaceChildren();$('aaGalleryEmpty').hidden=false;$('aaPrompt').value='';$('aaAIStatus').textContent='';$('aaSources').replaceChildren();$('aaAIExplanation').textContent='';key=next;imageReferences=[];renderReferences();$('aaReferenceStatus').textContent='';try{nodes=JSON.parse(localStorage.getItem(key)||'[]');nodes=validate(nodes);}catch{nodes=[];}selected=-1;history=[clone(nodes)];cursor=0;view={x:-40,y:-40,w:592};setView();status('Draft saved locally as you draw.');}referenceChoices();const target=$('aaTarget').value;$('aaTarget').replaceChildren();for(const item of options.records||[]){const o=document.createElement('option');o.value=item.id;o.textContent=item.title+' · '+item.content.category;$('aaTarget').append(o);}if([...$('aaTarget').options].some(o=>o.value===target))$('aaTarget').value=target;root.hidden=false;host.classList.add('art-mode');render();}};
})();
