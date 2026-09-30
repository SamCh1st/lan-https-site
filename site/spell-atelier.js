(function () {
  'use strict';
  const E=window.SpellEngine, $=id=>document.getElementById(id), NS='http://www.w3.org/2000/svg';
  const root=document.createElement('section');root.id='spellAtelier';root.hidden=true;
  root.setAttribute('aria-label','Spell Atelier');
  root.innerHTML=`
    <aside class="sa-panel sa-palette sa-left"><div class="sa-kicker">The ingredients</div><h4>Sigils &amp; shapes</h4><p>Drag onto the parchment, or click to add at its center.</p><div id="saSigils" class="sa-tools"></div><h4>Construction</h4><div id="saShapes" class="sa-tools"></div><h4>Try a complete seal</h4><div class="sa-library"><button type="button" data-example="fire:levitation">Fireball</button><button type="button" data-example="water:column">Water jet</button><button type="button" data-example="wind:pulling">Gathering wind</button><button type="button" data-example="earth:crushing">Stone to sand</button></div><p class="sa-note">Examples replace the drawing. Undo returns it.</p><details class="sa-note"><summary>About the symbols</summary>These are readable shorthand inspired by Witch Hat Atelier. The AI reads each symbol's meaning and measured geometry. Added glyphs follow the wiki illustrations; inferred meanings are labeled. Fan combinations remain hypotheses. <a href="https://witchhatatelier.telepedia.net/wiki/Signs_Explained" target="_blank" rel="noopener">Illustrated reference</a></details></aside>
    <section class="sa-panel sa-center"><header class="sa-heading"><div><div class="sa-kicker">Ink · geometry · intention</div><h3>Spell Atelier</h3></div><button type="button" id="saExit">← Map / chat</button></header>
    <form class="sa-designer" id="saDesignForm"><label for="saDesignPrompt">Ask the AI to draw a spell</label><textarea id="saDesignPrompt" rows="2" maxlength="2000" required placeholder="A seal that permanently blinds anyone who steps on it…"></textarea><div class="sa-actions"><button type="submit" class="sa-cast" id="saDesign">✎ Draw my spell</button><button type="button" id="saCancelDesign" disabled>Stop drawing</button></div><small>Builds a new drawing, one part at a time. Undo restores previous parts or your earlier drawing.</small><div id="saDesignStatus" role="status" aria-live="polite"></div></form>
    <div class="sa-toolbar" aria-label="Drawing tools"><button id="saUndo" type="button" title="Previous change (Ctrl/⌘ Z)" aria-label="Previous change">←</button><button id="saRedo" type="button" title="Next change (Ctrl/⌘ Shift Z)" aria-label="Next change">→</button><span class="sa-divider"></span><button type="button" id="saSelect" aria-pressed="true">Select</button><button type="button" id="saPan" aria-pressed="false">Pan</button><span class="sa-divider"></span><button type="button" id="saZoomOut" aria-label="Zoom out">−</button><button type="button" id="saZoomFit">Fit</button><button type="button" id="saZoomIn" aria-label="Zoom in">＋</button><output id="saZoom">100%</output><label><input type="checkbox" id="saSnap" checked> Snap</label><label>Grid <select id="saGrid" aria-label="Grid spacing"><option value="5">5 u</option><option value="10" selected>10 u</option><option value="20">20 u</option><option value="40">40 u</option></select></label><label>Angle <select id="saAngle" aria-label="Rotation snap"><option value="5">5°</option><option value="15" selected>15°</option><option value="30">30°</option><option value="45">45°</option></select></label></div>
    <div class="sa-surface"><svg id="spellAtelierCanvas" tabindex="0" role="application" aria-label="Spell drawing canvas. Select symbols, drag handles to resize and rotate. Arrow keys move the selection."><defs><pattern id="saGridPattern" patternUnits="userSpaceOnUse"><path id="saGridPath" fill="none" stroke="#b9a885" stroke-width=".55"/></pattern></defs><rect id="saGridBackground" fill="url(#saGridPattern)"/><g id="saRulers" pointer-events="none"></g><g id="saDrawing"></g><g id="saSelection"></g><g id="saEffects" pointer-events="none"></g><rect id="saMarquee" fill="#47959e22" stroke="#39838a" stroke-dasharray="4 3" pointer-events="none" visibility="hidden"/></svg><span class="sa-coordinate" id="saCoordinates">1 u = one drawing unit</span><span class="sa-effect-label" id="saEffectLabel" hidden></span></div>
    <div class="sa-legend">Drag to move · handles stretch · round handle rotates · Shift-click selects more · Ctrl/⌘ C / V copies &amp; pastes · Space-drag / middle mouse pans · wheel zooms</div>
    <section class="sa-build-log" id="saBuildLog" hidden><details open><summary>Drawing steps <span id="saStepCount"></span></summary><ol id="saSteps"></ol></details><details id="saExplanation" hidden open><summary>Spell explanation</summary><div id="saDesignSummary"></div></details></section>
    <section class="sa-inspector"><strong id="saSelectedName">Nothing selected</strong><small id="saSelectedHint" class="sa-help"></small><div class="sa-properties">${[['x','X'],['y','Y ↑'],['w','Width'],['h','Height'],['rotation','Rotation °']].map(([k,v])=>`<label>${v}<input type="number" id="saProp_${k}" data-property="${k}" step="1" ${k==='w'||k==='h'?'min="10" max="12000"':''} disabled></label>`).join('')}</div><div class="sa-inspector-actions"><button type="button" id="saDuplicate" disabled>Duplicate</button><button type="button" id="saDelete" disabled>Delete</button><button type="button" id="saCloseRing" disabled>Close ring</button><button type="button" id="saClear">Clear drawing</button></div></section>
    <section class="sa-verdict" id="saVerdict" aria-live="polite"><strong id="saVerdictTitle"></strong><p id="saVerdictText"></p></section>
    <section class="sa-ai"><h4>Read the spell</h4><p class="sa-help">Ollama looks up reference material and interprets your measured design, including invented combinations.</p><div class="sa-actions"><button type="button" id="saInterpret" class="sa-cast">✧ Ask AI to read spell</button><button type="button" id="saCast">Cast preview</button><button type="button" id="saStop" disabled>Stop</button></div><div class="sa-ai-status" id="saAiStatus" role="status"></div><div id="saAiReading"></div><small class="sa-help" id="saSaveStatus">Drawing saved on this browser for this campaign.</small></section></section>
    <aside class="sa-panel sa-palette sa-right"><div class="sa-kicker">The instructions</div><h4>Signs &amp; modifiers</h4><p>Position and angle change how an effect behaves.</p><div class="sa-tools" id="saSigns"></div><h4>Drawing layers</h4><p class="sa-help">Select a layer to reach a ring behind other marks.</p><div class="sa-object-list" id="saObjects"></div></aside>`;
  $('campaignDashboard').append(root);
  const svg=$('spellAtelierCanvas');
  const canvasFrame=document.createElement('section');canvasFrame.id='saCanvasFrame';canvasFrame.setAttribute('aria-label','Spell canvas and drawing tools');
  const toolbar=root.querySelector('.sa-toolbar');toolbar.before(canvasFrame);
  canvasFrame.append(toolbar,root.querySelector('.sa-surface'),root.querySelector('.sa-legend'));
  const fullscreenPreview=document.createElement('div');fullscreenPreview.id='saFullscreenPreview';fullscreenPreview.hidden=true;canvasFrame.prepend(fullscreenPreview);
  const previewHomes=new Map();
  function restorePreviewControl(id){const node=$(id),home=previewHomes.get(id);if(node&&home?.parentNode)home.after(node);}
  const fullscreenButton=document.createElement('button');fullscreenButton.id='saFullscreen';fullscreenButton.type='button';fullscreenButton.textContent='Fullscreen';fullscreenButton.setAttribute('aria-pressed','false');toolbar.append(fullscreenButton);
  function syncFullscreen(){
    const expanded=document.fullscreenElement===canvasFrame||canvasFrame.classList.contains('sa-expanded');
    fullscreenButton.textContent=expanded?'Exit fullscreen':'Fullscreen';fullscreenButton.setAttribute('aria-pressed',String(expanded));
    fullscreenPreview.hidden=!expanded;
    for(const id of ['saCast','saStop','saPreviewControls']){
      const node=$(id);if(!node)continue;
      if(!previewHomes.get(id)?.isConnected){const home=document.createComment(id+' home');node.before(home);previewHomes.set(id,home);}
      if(expanded)fullscreenPreview.append(node);else restorePreviewControl(id);
    }
  }
  fullscreenButton.onclick=async()=>{
    if(document.fullscreenElement===canvasFrame){await document.exitFullscreen();return;}
    if(canvasFrame.classList.contains('sa-expanded')){canvasFrame.classList.remove('sa-expanded');syncFullscreen();return;}
    try{if(!canvasFrame.requestFullscreen)throw new Error('Fullscreen unavailable');await canvasFrame.requestFullscreen();}
    catch{canvasFrame.classList.add('sa-expanded');}
    syncFullscreen();svg.focus({preventScroll:true});
  };
  document.addEventListener('fullscreenchange',syncFullscreen);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&canvasFrame.classList.contains('sa-expanded')){event.preventDefault();event.stopPropagation();canvasFrame.classList.remove('sa-expanded');syncFullscreen();fullscreenButton.focus();}},true);
  const detailLabel=document.createElement('label');detailLabel.className='sa-detail-choice';
  detailLabel.innerHTML='Drawing detail <select id="saDesignDetail"><option value="detailed" selected>Detailed composition · mixed motifs &amp; sub-seals</option><option value="simple">Simple · compact seal</option></select>';
  $('saDesignPrompt').after(detailLabel);
  const densityLabel=document.createElement('label');densityLabel.className='sa-detail-choice';densityLabel.innerHTML='Detail target <select id="saDetailTarget"><option value="300">300 parts · detailed</option><option value="600" selected>600 parts · intricate</option><option value="900">900 parts · elaborate</option></select>';detailLabel.after(densityLabel);
  const designOptions=document.createElement('div');designOptions.className='row g-2 sa-design-options';
  detailLabel.before(designOptions);detailLabel.classList.add('col-md-7');densityLabel.classList.add('col-md-5');designOptions.append(detailLabel,densityLabel);
  const compositionExamples=document.createElement('div');compositionExamples.className='sa-library';
  compositionExamples.innerHTML='<h4>Complex layout studies</h4><button type="button" data-composition="0">Four-part water / wind</button><button type="button" data-composition="1">Linked multi-seal array</button><p class="sa-note">Editable fan layouts inspired by multi-seal drawings. Replaces the drawing; Undo restores it.</p>';
  root.querySelector('.sa-left').append(compositionExamples);
  compositionExamples.onclick=async event=>{
    const button=event.target.closest('[data-composition]');if(!button||drawing)return;
    const identity=key,version=revision;button.disabled=true;
    try{const response=await fetch('spell-compositions.json');if(!response.ok)throw new Error('Could not load the layout.');const presets=await response.json();if(key!==identity||revision!==version||drawing||!active)return;
      const preset=presets[Number(button.dataset.composition)],checked=E.sanitize(preset.nodes);if(checked.length!==preset.nodes.length)throw new Error('The layout contains invalid parts.');
      nodes=checked.map(n=>({...n,id:E.make(n.type,0,0).id}));selected.clear();commit();fit();$('saDesignStatus').textContent=preset.note;$('saBuildLog').hidden=true;
    }catch(error){$('saAiStatus').textContent=error.message;}finally{button.disabled=false;}
  };
  const inspiration=document.createElement('details');inspiration.className='sa-note';
  inspiration.innerHTML='<summary>Fan spell inspiration</summary><p>Fog-cloud: Water + Rain + Crushing, with Dispersion as a possible extension. This is a community hypothesis.</p><a href="https://www.reddit.com/r/WitchHatAtelier/comments/1t9b6s0/experimental_fogcloud_spell/" target="_blank" rel="noopener">Read the illustrated discussion</a><p><button type="button" id="saFanFog">Use fog-cloud prompt</button></p>';
  root.querySelector('.sa-left').append(inspiration);
  $('saFanFog').onclick=()=>{if(drawing)return;$('saDesignPrompt').value='Design a fan-made fog-cloud seal using Water, Rain and Crushing, possibly Dispersion. Explain what is inferred and whether the combination is supported. Do not invent a canon guarantee.';$('saDesignPrompt').focus();};
  const theme=document.createElement('select');theme.id='saTheme';theme.setAttribute('aria-label','Canvas theme');
  theme.innerHTML='<option value="site">Site theme</option><option value="dark">Dark canvas</option><option value="light">Parchment canvas</option>';
  root.querySelector('.sa-heading').append(theme);
  try{theme.value=localStorage.getItem('spell-atelier-theme')||'site';}catch(_){}
  if(!theme.value)theme.value='site';
  function applyTheme(){root.dataset.theme=theme.value==='site'?(document.documentElement.dataset.theme==='dark'?'dark':'light'):theme.value;}
  theme.onchange=()=>{try{localStorage.setItem('spell-atelier-theme',theme.value);}catch(_){}applyTheme();};
  new MutationObserver(applyTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});applyTheme();
  for(const [id,container,label] of [['saSigilSearch','saSigils','Search sigils'],['saSignSearch','saSigns','Search signs']]){
    const input=document.createElement('input');input.type='search';input.id=id;input.placeholder=label;input.setAttribute('aria-label',label);input.className='sa-search';
    $(container).before(input);input.oninput=()=>{$(container).querySelectorAll('[data-symbol]').forEach(b=>{b.hidden=!b.textContent.toLowerCase().includes(input.value.trim().toLowerCase());});};
  }
  $('saSelectedHint').after(Object.assign(document.createElement('a'),{id:'saSymbolSource',target:'_blank',rel:'noopener',textContent:'Illustration & source notes',hidden:true}));
  $('saAiReading').before(Object.assign(document.createElement('section'),{id:'saPreviewMath',className:'sa-preview-math',hidden:true}));
  let active=false,key='',campaignId=null,nodes=[],selected=new Set(),history=new E.History(),mode='select',space=false,gesture=null;
  let view={x:0,y:0,z:1},width=600,height=540,revision=0,reading=null,abort=null,anim=0,saveTimer=0;
  let drawing=null;
  let previewLabelTimer=0;
  let previewDuration=10,previewSpeed=1,previewLoop=false;
  let lastPaste='',pasteCount=0;
  const displayName=n=>n.type==='concept'?(n.label||'Proposed symbol'):E.catalog[n.type].name;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function shape(type, cls='', node=null) {
    const c=E.catalog[type];
    if(type==='stroke'&&node?.points)return `<path d="${node.points.map((p,i)=>(i?'L':'M')+p.join(' ')).join(' ')+(node.closed?' Z':'')}" class="${cls} sa-branch-ink" fill="none" stroke="currentColor" stroke-width="1.4"/>`;
    if(E.isRing({type})) return `<${type==='ring'?'ellipse':'path'} ${type==='ring'?'cx="0" cy="0" rx="45" ry="45"':'d="M23 -39 A45 45 0 1 1 -23 -39"'} class="${cls}" fill="none" stroke="currentColor" stroke-width="3"/>`;
    return `<path d="${c.path}" class="${cls}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  for(const [type,c] of Object.entries(E.catalog)) {
    const b=document.createElement('button');b.type='button';b.className='sa-symbol';b.dataset.symbol=type;b.title=c.name+': '+c.hint;
    b.innerHTML=`<svg viewBox="-50 -50 100 100" aria-hidden="true">${shape(type)}</svg><span><strong>${esc(c.name)}</strong><small>${esc(c.hint)}</small>${c.evidence?`<em class="sa-evidence">${esc(c.evidence)}</em>`:''}</span>`;
    $(c.group==='sigil'?'saSigils':['sign','concept'].includes(c.group)?'saSigns':'saShapes').append(b);
    b.addEventListener('pointerdown',paletteDown);
    b.addEventListener('click',e=>{if(e.detail===0)add(type,view.x,view.y);});
  }
  function setActive(on,campaign,user) {
    if(!on){if(active){cancelDesign();finishGesture(true);save();cancelAI();stop();}active=false;space=false;root.hidden=true;$('campaignDashboard').classList.remove('spell-mode');return;}
    const next=`spell-atelier:v1:${user}:${campaign}`;
    if(key!==next) {
      if(key)save();cancelDesign();cancelAI();key=next;campaignId=campaign;
      $('saDesignPrompt').value='';$('saSteps').replaceChildren();$('saDesignSummary').replaceChildren();$('saDesignStatus').textContent='';$('saBuildLog').hidden=true;
      try {const raw=JSON.parse(localStorage.getItem(key)||'null');nodes=raw?E.sanitize(raw.nodes):[];view={x:0,y:0,z:1};}catch{nodes=[];}
      selected.clear();history=new E.History(nodes);reading=null;revision++;
    }
    const opening=!active;active=true;root.hidden=false;$('campaignDashboard').classList.add('spell-mode');
    requestAnimationFrame(()=>{resize();if(opening)fit();render();});
  }
  function save(){clearTimeout(saveTimer);if(!key)return;try{localStorage.setItem(key,JSON.stringify({nodes}));$('saSaveStatus').textContent='Drawing saved on this browser for this campaign.';}catch{$('saSaveStatus').textContent='Browser storage is unavailable; keep this tab open to retain your drawing.';}}
  function cancelAI(){if(abort)abort.abort();abort=null;$('saInterpret').disabled=false;}
  function invalidate(){revision++;reading=null;cancelAI();stop();$('saAiReading').replaceChildren();$('saAiStatus').textContent='';}
  function commit(){if(history.push(nodes)){invalidate();save();}render();}
  function add(type,x,y){if(drawing)return;if(nodes.length>=1200){$('saAiStatus').textContent='This parchment holds up to 1200 symbols.';return;}const n=E.make(type,snap(x),snap(y));nodes.push(n);selected=new Set([n.id]);commit();}
  function snap(v){return E.snap(v,Number($('saGrid').value),$('saSnap').checked);}
  function point(event){const b=svg.getBoundingClientRect();return {x:(event.clientX-b.left-b.width/2)/view.z+view.x,y:(event.clientY-b.top-b.height/2)/view.z+view.y};}
  function resize(){const b=svg.getBoundingClientRect();if(!b.width||!b.height)return;const changed=active&&width&&Math.abs(b.width-width)>20;width=b.width;height=b.height;if(changed)fit();else renderView();}
  new ResizeObserver(resize).observe(svg);
  function fit(){
    if(!nodes.length){view={x:0,y:0,z:1};renderView();return;}
    const pts=nodes.flatMap(E.corners),xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    view={x:(minX+maxX)/2,y:(minY+maxY)/2,z:E.clamp(Math.min(width/(maxX-minX+140),height/(maxY-minY+140)),.03,5)};renderView();
  }
  function renderView(){
    const w=width/view.z,h=height/view.z,left=view.x-w/2,top=view.y-h/2,grid=Number($('saGrid').value);
    svg.setAttribute('viewBox',`${left} ${top} ${w} ${h}`);
    const bg=$('saGridBackground');for(const [k,v] of Object.entries({x:left,y:top,width:w,height:h}))bg.setAttribute(k,v);
    // Thin out visual lines when zoomed far out; logical snapping remains unchanged.
    const visibleGrid=grid*Math.max(1,Math.ceil(7/(grid*view.z)));
    $('saGridPattern').setAttribute('width',visibleGrid);$('saGridPattern').setAttribute('height',visibleGrid);$('saGridPath').setAttribute('d',`M${visibleGrid} 0 H0 V${visibleGrid}`);
    const major=visibleGrid*5,labels=[];
    for(let x=Math.ceil(left/major)*major;x<left+w;x+=major)labels.push(`<text x="${x+3/view.z}" y="${top+13/view.z}" font-size="${9/view.z}" fill="#89775a">${Math.round(x)}</text>`);
    for(let y=Math.ceil(top/major)*major;y<top+h;y+=major)labels.push(`<text x="${left+3/view.z}" y="${y-3/view.z}" font-size="${9/view.z}" fill="#89775a">${Math.round(-y)}</text>`);
    labels.push(`<path d="M${left} 0 H${left+w} M0 ${top} V${top+h}" stroke="#9a8869" stroke-width="${.7/view.z}"/>`);
    $('saRulers').innerHTML=labels.join('');$('saZoom').textContent=Math.round(view.z*100)+'%';renderSelection();
  }
  function renderDrawing(){
    $('saDrawing').innerHTML=[...nodes.filter(E.isRing),...nodes.filter(n=>!E.isRing(n))].map(n=>{
      const c=E.catalog[n.type],transform=`translate(${n.x} ${n.y}) rotate(${n.rotation})`;
      const ink=E.isRing(n)?`<g transform="scale(${n.w/90} ${n.h/90})">${shape(n.type,'sa-ink sa-ring-ink',n)}</g>`:`<g transform="scale(${n.w/100} ${n.h/100})">${shape(n.type,'sa-ink',n)}</g>`;
      const hit=E.isRing(n)?`<ellipse class="sa-hit sa-ring-hit" rx="${n.w/2}" ry="${n.h/2}" vector-effect="non-scaling-stroke"/>`:`<rect class="sa-hit" x="${-n.w/2}" y="${-n.h/2}" width="${n.w}" height="${n.h}"/>`;
      const caption=n.type==='concept'?`<text y="${n.h/2+13}" text-anchor="middle" fill="#754c91" font-size="10" pointer-events="none">${esc(displayName(n))}</text>`:'';
      return `<g class="sa-node" data-id="${n.id}" transform="${transform}" style="color:${c.color||'#4b3c2d'}"><title>${esc(displayName(n))}${n.type==='concept'?' — proposed: '+esc(n.meaning||'Unverified mechanic'):''}</title>${ink}${hit}${caption}</g>`;
    }).join('');renderSelection();
  }
  function renderSelection(){
    const list=nodes.filter(n=>selected.has(n.id)),u=1/view.z;
    $('saSelection').innerHTML=list.map(n=>{
      let marks=`<rect x="${-n.w/2}" y="${-n.h/2}" width="${n.w}" height="${n.h}" fill="none" stroke="#297e8b" stroke-width="${1.2*u}" stroke-dasharray="${4*u} ${3*u}" pointer-events="none"/>`;
      if(list.length===1){
        for(const [hx,hy] of [[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]]) marks+=`<rect data-handle="scale" data-hx="${hx}" data-hy="${hy}" x="${hx*n.w/2-5*u}" y="${hy*n.h/2-5*u}" width="${10*u}" height="${10*u}" fill="#f8f1df" stroke="#277b88" stroke-width="${1.4*u}" style="cursor:${hx===0?'ns':hy===0?'ew':hx===hy?'nwse':'nesw'}-resize"/>`;
        marks+=`<path d="M0 ${-n.h/2} V${-n.h/2-28*u}" stroke="#297e8b" stroke-width="${u}" pointer-events="none"/><circle data-handle="rotate" cx="0" cy="${-n.h/2-32*u}" r="${7*u}" fill="#297e8b" stroke="#f8f1df" stroke-width="${u}" style="cursor:grab"/>`;
        const axisX=Math.min(20*u,n.w/3),axisY=Math.min(20*u,n.h/3);
        marks+=`<path data-handle="x" d="M0 0 H${axisX} M${axisX-5*u} ${-4*u} L${axisX} 0 L${axisX-5*u} ${4*u}" stroke="#bb5a48" stroke-width="${2.5*u}" fill="none" style="cursor:ew-resize"/><path data-handle="y" d="M0 0 V${-axisY} M${-4*u} ${-axisY+5*u} L0 ${-axisY} L${4*u} ${-axisY+5*u}" stroke="#488160" stroke-width="${2.5*u}" fill="none" style="cursor:ns-resize"/>`;
      }
      return `<g transform="translate(${n.x} ${n.y}) rotate(${n.rotation})">${marks}</g>`;
    }).join('');
  }
  function renderInspector(){
    const list=nodes.filter(n=>selected.has(n.id)),n=list.length===1?list[0]:null;
    $('saSelectedName').textContent=n?displayName(n):list.length?`${list.length} symbols selected`:'Nothing selected';
    $('saSelectedHint').textContent=n?.type==='concept'?'Proposed: '+(n.meaning||'An unverified mechanic.'):n?[E.catalog[n.type].hint,E.catalog[n.type].evidence,window.SpellEquations.rules[n.type]?.[1]].filter(Boolean).join(' · '):'';
    $('saSymbolSource').hidden=!n||!E.catalog[n.type].source;if(n&&E.catalog[n.type].source)$('saSymbolSource').href=E.catalog[n.type].source;
    root.querySelectorAll('[data-property]').forEach(input=>{input.disabled=!n;input.value=n?Math.round(n[input.dataset.property]*(input.dataset.property==='y'?-100:100))/100:'';});
    $('saDelete').disabled=$('saDuplicate').disabled=!list.length;
    $('saCloseRing').disabled=!n||!E.isRing(n);$('saCloseRing').textContent=n?.type==='ring'?'Open ring':'Close ring';
    $('saUndo').disabled=history.index===0;$('saRedo').disabled=history.index===history.states.length-1;
    $('saObjects').innerHTML=[...nodes].reverse().map(n=>`<button type="button" data-layer="${n.id}" aria-pressed="${selected.has(n.id)}">${E.isRing(n)?'◎':n.type==='concept'?'?':'✧'} ${esc(displayName(n))} <small>(${Math.round(n.x)}, ${Math.round(-n.y)})</small></button>`).join('');
    syncDesigner();
  }
  function verdict(){const v=E.validate(nodes);$('saVerdict').dataset.valid=v.valid;$('saVerdictTitle').textContent=v.valid?'Basic check: ready for a preview':nodes.length?(window.SpellPreview.available(nodes)?'Equation preview available · basic check found limitations':'Basic check: seal needs attention'):'Begin with a ring, a sigil, and a sign';$('saVerdictText').textContent=v.valid?(v.spells.map(s=>`${E.catalog[s.element].name} · ${s.behavior}`).join(' + ')+(v.warnings.length?' — '+v.warnings.join(' '):' — Balanced drawing.')):v.errors.join(' ');const supported=reading?reading.functional===true&&reading.effects?.length:v.valid;$('saCast').disabled=!!drawing||!window.SpellPreview.available(nodes);$('saCast').textContent=supported?'Cast preview':'Illustrative preview';$('saCast').title=window.SpellPreview.available(nodes)?'Preview this drawing; uncertain effects are labeled as illustrations.':'Close a circular ring around at least one symbol to preview.';$('saInterpret').disabled=!!drawing||!!abort||!nodes.length;}
  function render(){renderDrawing();renderInspector();verdict();renderView();}
  function undo(redo){if(drawing)return;finishGesture(true);nodes=redo?history.redo():history.undo();selected=new Set([...selected].filter(id=>nodes.some(n=>n.id===id)));invalidate();save();render();}
  function remove(){if(drawing||!selected.size)return;nodes=nodes.filter(n=>!selected.has(n.id));selected.clear();commit();}
  function duplicate(){const copies=nodes.filter(n=>selected.has(n.id)).map(n=>({...n,id:E.make(n.type,0,0).id,x:n.x+Number($('saGrid').value)*2,y:n.y+Number($('saGrid').value)*2}));if(nodes.length+copies.length>1200)return;nodes.push(...copies);selected=new Set(copies.map(n=>n.id));commit();}
  function paletteDown(event){
    if(drawing||event.button!==0)return;event.preventDefault();const button=event.currentTarget,type=button.dataset.symbol,start={x:event.clientX,y:event.clientY};
    let ghost=null,moved=false;button.setPointerCapture(event.pointerId);
    function move(e){if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>5)moved=true;if(moved){if(!ghost){ghost=document.createElement('div');ghost.className='sa-drag-ghost';ghost.innerHTML=`<svg viewBox="-50 -50 100 100">${shape(type)}</svg>`;document.body.append(ghost);}ghost.style.left=e.clientX-30+'px';ghost.style.top=e.clientY-30+'px';}}
    function end(e){button.removeEventListener('pointermove',move);button.removeEventListener('pointerup',end);button.removeEventListener('pointercancel',cancel);ghost?.remove();if(button.hasPointerCapture(e.pointerId))button.releasePointerCapture(e.pointerId);if(e.type==='pointercancel'||!active)return;const b=svg.getBoundingClientRect();if(!moved)add(type,view.x,view.y);else if(e.clientX>=b.left&&e.clientX<=b.right&&e.clientY>=b.top&&e.clientY<=b.bottom){const p=point(e);add(type,p.x,p.y);}svg.focus({preventScroll:true});}
    function cancel(e){end(e);}
    button.addEventListener('pointermove',move);button.addEventListener('pointerup',end);button.addEventListener('pointercancel',cancel);
  }
  svg.addEventListener('pointerdown',event=>{
    if(gesture||![0,1].includes(event.button)||(drawing&&mode!=='pan'&&!space&&event.button!==1))return;event.preventDefault();svg.focus({preventScroll:true});
    const p=point(event),handle=event.target.closest('[data-handle]'),target=event.target.closest('[data-id]');
    gesture={pointer:event.pointerId,start:p,before:E.copy(nodes),selectedBefore:new Set(selected),view:{...view},screen:{x:event.clientX,y:event.clientY},moved:false};svg.setPointerCapture(event.pointerId);
    if(mode==='pan'||space||event.button===1){gesture.kind='pan';return;}
    if(handle&&selected.size===1){gesture.kind=handle.dataset.handle;gesture.node=E.copy(nodes.find(n=>selected.has(n.id)));gesture.hx=Number(handle.dataset.hx);gesture.hy=Number(handle.dataset.hy);gesture.startAngle=Math.atan2(p.y-gesture.node.y,p.x-gesture.node.x);}
    else if(target){const id=target.dataset.id;if(event.shiftKey){if(selected.has(id))selected.delete(id);else selected.add(id);}else if(!selected.has(id))selected=new Set([id]);gesture.kind='move';}
    else{gesture.kind='marquee';gesture.extend=event.shiftKey;if(!event.shiftKey)selected.clear();}
    renderSelection();renderInspector();
  });
  svg.addEventListener('pointermove',event=>{
    const p=point(event);$('saCoordinates').textContent=`X ${Math.round(p.x)} · Y ${Math.round(-p.y)} u · ↑ +Y`;
    if(!gesture||gesture.pointer!==event.pointerId)return;const g=gesture,dx=p.x-g.start.x,dy=p.y-g.start.y;g.moved=g.moved||Math.hypot(event.clientX-g.screen.x,event.clientY-g.screen.y)>2;
    if(g.kind==='pan'){view.x=g.view.x-(event.clientX-g.screen.x)/view.z;view.y=g.view.y-(event.clientY-g.screen.y)/view.z;renderView();return;}
    if(g.kind==='marquee'){
      const x=Math.min(g.start.x,p.x),y=Math.min(g.start.y,p.y),w=Math.abs(dx),h=Math.abs(dy),r=$('saMarquee');for(const [k,v]of Object.entries({x,y,width:w,height:h,visibility:'visible'}))r.setAttribute(k,v);
      selected=g.extend?new Set(g.selectedBefore):new Set();nodes.forEach(n=>{if(E.corners(n).every(q=>q.x>=x&&q.x<=x+w&&q.y>=y&&q.y<=y+h))selected.add(n.id);});renderSelection();return;
    }
    if(!g.moved)return;
    if(!g.invalidated){invalidate();g.invalidated=true;}
    if(g.kind==='move'){
      const anchor=g.before.find(n=>selected.has(n.id));if(anchor){const mx=snap(anchor.x+dx)-anchor.x,my=snap(anchor.y+dy)-anchor.y;nodes=g.before.map(n=>selected.has(n.id)?{...n,x:n.x+mx,y:n.y+my}:E.copy(n));}
    }else if(g.node){
      const original=g.node,n=nodes.find(n=>n.id===original.id);
      if(g.kind==='rotate'){const delta=(Math.atan2(p.y-n.y,p.x-n.x)-g.startAngle)*180/Math.PI;n.rotation=E.snap(original.rotation+delta,Number($('saAngle').value),$('saSnap').checked);}
      else if(g.kind==='scale'){
        const q=E.local(original,p),start=E.local(original,g.start);
        let w=original.w,h=original.h;
        if(g.hx)w=E.clamp(snap(original.w+g.hx*(q.x-start.x)),10,12000);
        if(g.hy)h=E.clamp(snap(original.h+g.hy*(q.y-start.y)),10,12000);
        if(event.shiftKey){if(g.hx)h=E.clamp(w*original.h/original.w,10,12000);else w=E.clamp(h*original.w/original.h,10,12000);}
        const center=E.world(original,g.hx*(w-original.w)/2,g.hy*(h-original.h)/2);Object.assign(n,{w,h,x:center.x,y:center.y});
      }else if(g.kind==='x'||g.kind==='y'){
        const q=E.local(original,p),start=E.local(original,g.start),ax=g.kind==='x'?snap(q.x-start.x):0,ay=g.kind==='y'?snap(q.y-start.y):0;Object.assign(n,E.world(original,ax,ay));
      }
    }
    renderDrawing();
  });
  function finishGesture(cancel=false){if(!gesture)return;const g=gesture;gesture=null;if(cancel){if(!['pan','marquee'].includes(g.kind))nodes=g.before;if(g.kind!=='pan')selected=g.selectedBefore;view=g.view;}if(svg.hasPointerCapture(g.pointer))svg.releasePointerCapture(g.pointer);$('saMarquee').setAttribute('visibility','hidden');if(!cancel&&g.moved&&!['pan','marquee'].includes(g.kind))commit();else render();}
  svg.addEventListener('pointerup',()=>finishGesture());svg.addEventListener('pointercancel',()=>finishGesture(true));svg.addEventListener('lostpointercapture',()=>{if(gesture)finishGesture(true);});
  function zoom(factor,anchor={x:view.x,y:view.y}){if(gesture)return;const old=view.z,next=E.clamp(old*factor,.03,5);view.x=anchor.x-(anchor.x-view.x)*old/next;view.y=anchor.y-(anchor.y-view.y)*old/next;view.z=next;renderView();}
  svg.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(-e.deltaY*.0015),point(e));},{passive:false});
  $('saZoomIn').onclick=()=>zoom(1.25);$('saZoomOut').onclick=()=>zoom(.8);$('saZoomFit').onclick=fit;
  $('saGrid').onchange=renderView;$('saUndo').onclick=()=>undo(false);$('saRedo').onclick=()=>undo(true);$('saDelete').onclick=remove;$('saDuplicate').onclick=duplicate;
  $('saClear').onclick=()=>{nodes=[];selected.clear();commit();};
  $('saCloseRing').onclick=()=>{const n=nodes.find(n=>selected.has(n.id));if(n&&E.isRing(n)){n.type=n.type==='ring'?'openRing':'ring';commit();}};
  $('saExit').onclick=()=>$('campaignMapButton').click();
  for(const tool of ['select','pan'])$('sa'+(tool==='select'?'Select':'Pan')).onclick=()=>{mode=tool;$('saSelect').setAttribute('aria-pressed',tool==='select');$('saPan').setAttribute('aria-pressed',tool==='pan');svg.style.cursor=tool==='pan'?'grab':'crosshair';};
  root.querySelectorAll('[data-example]').forEach(b=>b.onclick=()=>{const [element,behavior]=b.dataset.example.split(':');nodes=E.example(element,behavior);selected.clear();commit();fit();});
  $('saObjects').onclick=e=>{const b=e.target.closest('[data-layer]');if(!b)return;const id=b.dataset.layer;if(e.shiftKey){if(selected.has(id))selected.delete(id);else selected.add(id);}else selected=new Set([id]);renderSelection();renderInspector();};
  root.querySelectorAll('[data-property]').forEach(input=>input.addEventListener('change',()=>{const n=nodes.find(n=>selected.has(n.id));if(drawing||!n||selected.size!==1)return;const k=input.dataset.property,value=input.valueAsNumber*(k==='y'?-1:1);if(!Number.isFinite(value)){renderInspector();return;}n[k]=k==='rotation'?E.snap(value,Number($('saAngle').value),$('saSnap').checked):E.clamp(snap(value),k==='w'||k==='h'?10:-100000,k==='w'||k==='h'?12000:100000);commit();}));
  root.addEventListener('keydown',e=>{
    if(!active||e.target.closest('input,select,textarea'))return;
    const mod=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
    if(drawing){if(k==='escape'){e.preventDefault();cancelDesign();}else if(e.code==='Space'&&e.target===svg){e.preventDefault();space=true;}return;}
    if(mod&&k==='z'){e.preventDefault();undo(e.shiftKey);return;}if(mod&&k==='y'){e.preventDefault();undo(true);return;}
    if(e.code==='Space'&&e.target===svg){e.preventDefault();space=true;}
    if(k==='escape'){e.preventDefault();if(gesture)finishGesture(true);else{selected.clear();stop();render();}}
    if(e.target!==svg)return;
    if(mod&&k==='a'){e.preventDefault();selected=new Set(nodes.map(n=>n.id));renderSelection();renderInspector();}
    if(mod&&k==='d'){e.preventDefault();duplicate();}
    if(k==='delete'||k==='backspace'){e.preventDefault();remove();}
    if(['arrowleft','arrowright','arrowup','arrowdown'].includes(k)&&selected.size){e.preventDefault();const step=($('saSnap').checked?Number($('saGrid').value):1)*(e.shiftKey?5:1);nodes.forEach(n=>{if(selected.has(n.id)){n.x+=(k==='arrowright'?step:k==='arrowleft'?-step:0);n.y+=(k==='arrowdown'?step:k==='arrowup'?-step:0);}});commit();}
  });
  function textTarget(target){return target instanceof Element&&!!target.closest('input,textarea,select,[contenteditable="true"]');}
  root.addEventListener('copy',event=>{
    if(!active||drawing||textTarget(event.target)||!selected.size||window.getSelection()?.toString())return;
    const copied=nodes.filter(n=>selected.has(n.id));
    if(!copied.length||!event.clipboardData)return;
    event.preventDefault();const text=JSON.stringify({format:'spell-atelier',version:1,nodes:copied});
    event.clipboardData.setData('text/plain',text);lastPaste=text;pasteCount=0;
    $('saCoordinates').textContent=`Copied ${copied.length} ${copied.length===1?'symbol':'symbols'}. Ctrl/⌘ V to paste.`;
  });
  root.addEventListener('paste',event=>{
    if(!active||drawing||textTarget(event.target))return;
    const text=event.clipboardData?.getData('text/plain');if(!text||text.length>1000000)return;
    let payload;try{payload=JSON.parse(text);}catch{return;}
    if(payload?.format!=='spell-atelier'||payload.version!==1)return;
    event.preventDefault();
    const copied=E.sanitize(payload.nodes);
    if(!copied.length||copied.length!==payload.nodes?.length){$('saCoordinates').textContent='The clipboard does not contain a valid spell selection.';return;}
    if(nodes.length+copied.length>1200){$('saCoordinates').textContent='Pasting would exceed the 1200-symbol limit.';return;}
    if(lastPaste!==text){lastPaste=text;pasteCount=0;}pasteCount++;
    const offset=Number($('saGrid').value)*2*pasteCount;
    const pasted=copied.map(n=>({...n,id:E.make(n.type,0,0).id,x:n.x+offset,y:n.y-offset}));
    if(pasted.some(n=>Math.abs(n.x)>100000||Math.abs(n.y)>100000)){ $('saCoordinates').textContent='The pasted selection would be outside the drawing limits.';return; }
    nodes.push(...pasted);selected=new Set(pasted.map(n=>n.id));commit();
    if(pasted.some(n=>E.corners(n).some(p=>Math.abs(p.x-view.x)>width/view.z/2||Math.abs(p.y-view.y)>height/view.z/2)))fit();
    svg.focus({preventScroll:true});$('saCoordinates').textContent=`Pasted ${pasted.length} ${pasted.length===1?'symbol':'symbols'}. Drag to position.`;
  });
  window.addEventListener('keyup',e=>{if(e.code==='Space')space=false;});window.addEventListener('blur',()=>{space=false;finishGesture(true);});window.addEventListener('pagehide',save);
  function stop(){clearTimeout(previewLabelTimer);previewLabelTimer=0;restorePreviewControl('saPreviewControls');if($('saPreviewMath'))$('saPreviewMath').hidden=true;cancelAnimationFrame(anim);anim=0;$('saEffects').replaceChildren();$('saEffectLabel').hidden=true;$('saStop').disabled=true;}
  function cast(){
    if(drawing||!window.SpellPreview.available(nodes))return;
    stop();const validation=E.validate(nodes);let spells=validation.spells;let illustrative=false;
    if(reading?.functional&&reading.effects?.length)spells=reading.effects.map(effect=>{const ring=nodes.find(n=>n.id===effect.ring_id&&E.isRing(n))||nodes.find(E.isRing);return {...effect,ring};}).filter(s=>s.ring);
    else if(reading||!validation.valid){spells=window.SpellPreview.illustrate(nodes);illustrative=true;}
    if(!spells.length)return;$('saStop').disabled=false;$('saEffectLabel').textContent=reading?.name||spells.map(s=>s.element==='fire'&&s.behavior==='orb'?'Fireball':`${E.catalog[s.element]?.name||s.element} ${s.behavior}`).join(' + ');if(illustrative)$('saEffectLabel').textContent='Illustrative preview · '+$('saEffectLabel').textContent;$('saEffectLabel').hidden=false;previewLabelTimer=setTimeout(()=>{$('saEffectLabel').hidden=true;previewLabelTimer=0;},5000);
    const models=window.SpellPreview.compile(nodes,spells), panel=$('saPreviewMath');panel.hidden=false;
    panel.innerHTML='<details id="saPreviewDetails" open><summary>Preview details</summary><strong>Composed equation preview</strong><p>Every supported symbol contributes to dX/dt = AX + b. Their contributions add together; positions, sizes and rotations determine the coefficients. This is the site’s simulation model, not canonical physics or biological effects.</p>'+models.map(m=>{
      const q=m.equations,groups=new Map();
      for(const op of q.operators){const g=groups.get(op.type)||{...op,count:0,total:0};g.count++;g.total+=op.weight;groups.set(op.type,g);}
      return `<details open><summary>${esc(E.catalog[m.element]?.name||m.element)} · ${q.operators.length} components</summary><p>A = [${q.matrix[0].toFixed(3)}, ${q.matrix[1].toFixed(3)}; ${q.matrix[3].toFixed(3)}, ${q.matrix[4].toFixed(3)}] · b = (${q.matrix[2].toFixed(3)}, ${q.matrix[5].toFixed(3)}) / s</p><ul>${Array.from(groups.values()).map(g=>`<li>${esc(g.name)} × ${g.count}: ${esc(g.equation)} · total weight ${g.total.toFixed(3)}</li>`).join('')}</ul>${q.unknown.length?`<p>Unresolved: ${esc(q.unknown.join(', '))}. These symbols have no motion rule and do not certify a functional spell.</p>`:''}${q.stabilized?'<p>Extreme coefficients were uniformly scaled to keep this preview numerically stable.</p>':''}</details>`;
    }).join('')+'<details><summary>How the equations combine</summary><p>X is position relative to each ring’s center, divided by its radius R. A is the combined motion matrix, b the combined directional flow. w = 12 × symbol width × height / ring diameter². d follows the symbol rotation; c and s are the inward and tangential components of that direction. I is the identity matrix; J rotates a vector by 90°. The matrix exponential solves motion at each requested time, independent of frame rate. Separate equations control fading, fragment size, cooling color and source shape.</p><p>Each ring combines its enclosed operators. The main ring also includes exterior operators attached through the branch network. Nested bands share their enclosed material sources for this model. Bands without a known source show diagnostic tracers. Open rings are inactive. Branch lines connect components but add no motion of their own. Arcs remain construction guides. Unknown mechanics remain unresolved. Time uses seconds and length uses drawing units; neither predicts real-world injury or physical temperature.</p></details></details><div class="sa-preview-controls" id="saPreviewControls"><button type="button" id="saPreviewPause">Pause</button><label>Time <input id="saPreviewTime" type="range" min="0" max="10" step="0.01" value="0"></label><output id="saPreviewClock">0.00 s</output><label><input id="saPreviewLoop" type="checkbox"> Loop</label><label>Duration (s) <input id="saPreviewDuration" type="number" min="0.5" max="1200" step="0.5" value="10" style="width:70px"></label><label>Speed <select id="saPreviewSpeed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option><option value="4">4×</option><option value="5">5×</option><option value="6">6×</option><option value="8">8×</option><option value="10">10×</option></select></label></div>';
    let paused=matchMedia('(prefers-reduced-motion: reduce)').matches,t=0,last=performance.now();
    $('saPreviewDuration').value=previewDuration;$('saPreviewTime').max=previewDuration;$('saPreviewSpeed').value=previewSpeed;$('saPreviewLoop').checked=previewLoop;
    $('saPreviewLoop').onchange=()=>{previewLoop=$('saPreviewLoop').checked;};
    $('saPreviewDuration').onchange=()=>{const value=$('saPreviewDuration').valueAsNumber;if(Number.isFinite(value))previewDuration=E.clamp(value,.5,1200);$('saPreviewDuration').value=previewDuration;$('saPreviewTime').max=previewDuration;t=Math.min(t,previewDuration);last=performance.now();draw(t);};
    $('saPreviewSpeed').onchange=()=>{previewSpeed=Number($('saPreviewSpeed').value);last=performance.now();};
    $('saPreviewPause').textContent=paused?'Play':'Pause';
    $('saPreviewPause').onclick=()=>{if(t>=previewDuration)t=0;paused=!paused;$('saPreviewPause').textContent=paused?'Play':'Pause';last=performance.now();};
    $('saPreviewTime').oninput=()=>{paused=true;t=Number($('saPreviewTime').value);$('saPreviewPause').textContent='Play';draw(t);};
    function draw(time){
      const out=[];
      for(const m of models){
        const color=E.catalog[m.element]?.color||'#ae98d6';
        for(const v of m.vectors){const length=v.weight;out.push(`<path d="M${v.x} ${v.y} l${v.dx*length} ${v.dy*length}" stroke="${color}" stroke-width="2" opacity=".45"/>`);}
        for(const p of window.SpellPreview.particles(m,time))if([p.x,p.y,p.r,p.opacity].every(Number.isFinite)&&Math.max(Math.abs(p.x),Math.abs(p.y),p.r)<1e12)out.push(`<circle cx="${p.x}" cy="${p.y}" r="${p.r}" fill="${p.color||color}" opacity="${p.opacity}"/>`);
      }
      $('saEffects').innerHTML=out.join('');$('saPreviewTime').value=time;$('saPreviewClock').textContent=time.toFixed(2)+' s';
    }
    function frame(now){if(!paused){t+=(now-last)/1000*previewSpeed;if(t>=previewDuration){if($('saPreviewLoop').checked)t%=previewDuration;else{t=previewDuration;paused=true;$('saPreviewPause').textContent='Play';}}}last=now;draw(t);anim=requestAnimationFrame(frame);}
    draw(0);anim=requestAnimationFrame(frame);syncFullscreen();
  }
  $('saCast').onclick=cast;$('saStop').onclick=stop;
  function syncDesigner(){
    const busy=!!drawing;root.classList.toggle('sa-designing',busy);
    $('saDesign').disabled=busy;$('saDesignPrompt').disabled=busy;$('saDesignDetail').disabled=busy;$('saDetailTarget').disabled=busy||$('saDesignDetail').value==='simple';$('saCancelDesign').disabled=!busy;
    root.querySelectorAll('[data-symbol],[data-example],#saClear').forEach(b=>b.disabled=busy);
    if(busy)root.querySelectorAll('[data-property],#saUndo,#saRedo,#saDuplicate,#saDelete,#saCloseRing,#saInterpret,#saCast').forEach(b=>b.disabled=true);
  }
  $('saDesignDetail').addEventListener('change',syncDesigner);
  function cancelDesign(){
    if(!drawing)return;const task=drawing;drawing=null;task.controller.abort();
    $('saDesignStatus').textContent=task.started?'Drawing stopped. The parts already drawn are saved and editable.':'Drawing stopped. Your earlier drawing is unchanged.';
    render();
  }
  function animateInk(id){
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const group=$('saDrawing').querySelector(`[data-id="${id}"]`);
    group?.querySelectorAll('.sa-ink').forEach(path=>{const length=path.getTotalLength();path.animate([{strokeDasharray:`${length} ${length}`,strokeDashoffset:length},{strokeDasharray:`${length} ${length}`,strokeDashoffset:0}],{duration:450,easing:'ease-out'});});
  }
  function showDesignSummary(summary){
    $('saExplanation').hidden=false;
    const box=$('saDesignSummary');box.replaceChildren();const title=document.createElement('strong');title.textContent=summary.name||'AI spell design';box.append(title);
    const badge=document.createElement('small');badge.className='sa-design-badge';badge.textContent=summary.matches_request==='conceptual'?'Conceptual blueprint':summary.matches_request==='partial'?'Partial design':'Reference-based design';box.append(badge);
    if(summary.helper_models?.length){const p=document.createElement('p');p.textContent='Model helpers: '+summary.helper_models.join(', ');box.append(p);}
    for(const field of ['description','canon','inference'])if(summary[field]){const p=document.createElement('p');p.textContent=({canon:'Established mechanics: ',inference:'Proposed / uncertain: '}[field]||'')+summary[field];box.append(p);}
    if(summary.limitations?.length){const ul=document.createElement('ul');summary.limitations.forEach(text=>{const li=document.createElement('li');li.textContent=text;ul.append(li);});box.append(ul);}
    summary.sources?.forEach(source=>{if(!source.url?.startsWith('https://witchhatatelier.telepedia.net/'))return;const a=document.createElement('a');a.href=source.url;a.textContent=source.title;a.target='_blank';a.rel='noopener';box.append(a,document.createTextNode(' · '));});
  }
  $('saCancelDesign').onclick=cancelDesign;
  $('saDesignForm').addEventListener('submit',async event=>{
    event.preventDefault();const prompt=$('saDesignPrompt').value.trim();if(!prompt||drawing)return;
    finishGesture(true);invalidate();
    const task={controller:new AbortController(),identity:key,started:false,steps:0,done:false};drawing=task;
    $('saExplanation').hidden=true;
    $('saSteps').replaceChildren();$('saStepCount').textContent='';$('saDesignSummary').replaceChildren();$('saBuildLog').hidden=true;
    $('saDesignStatus').textContent='Connecting to the AI designer…';syncDesigner();
    svg.scrollIntoView({behavior:'smooth',block:'center'});
    const isCurrent=()=>drawing===task&&task.identity===key&&active&&!task.controller.signal.aborted;
    const timeout=setTimeout(()=>{task.timedOut=true;task.controller.abort();},$('saDesignDetail').value==='detailed'?510000:270000);
    async function applyEvent(data){
      if(!isCurrent())return;
      if(data.event==='error')throw new Error(data.message||'The AI stopped before finishing.');
      if(data.event==='status'){$('saDesignStatus').textContent=data.message;if(data.total_steps)task.totalSteps=data.total_steps;if(data.reference_status)task.referenceStatus=data.reference_status;return;}
      if(data.event==='step'){
        const valid=E.sanitize([data.node]);if(valid.length!==1||task.steps>=1400)throw new Error('The AI returned an invalid drawing part. Your draft is kept.');
        const n=valid[0];
        if(!task.started){if(data.action!=='add')throw new Error('The AI did not begin with a new drawing part.');nodes=[];history.push(nodes);task.started=true;}
        if(data.action==='add'){if(nodes.some(v=>v.id===n.id))throw new Error('The AI repeated a drawing part.');nodes.push(n);}
        else if(data.action==='update'){const index=nodes.findIndex(v=>v.id===n.id);if(index<0)throw new Error('The AI tried to change a missing drawing part.');nodes[index]=n;}
        else throw new Error('Unrecognized drawing operation.');
        task.steps++;selected=new Set([n.id]);history.push(nodes);revision++;
        // Paint each part, but avoid revalidating and rebuilding the entire
        // inspector on every streamed symbol in a large composition.
        renderDrawing();if(task.steps===1||task.steps%12===0){save();renderInspector();}
        // Reframe only if a new part would leave the visible parchment; zoom/pan remain usable.
        if(task.steps===1||E.corners(n).some(p=>Math.abs(p.x-view.x)>width/view.z*.46||Math.abs(p.y-view.y)>height/view.z*.46))fit();
        animateInk(n.id);$('saBuildLog').hidden=false;
        const li=document.createElement('li');li.textContent=`${displayName(n)} — ${String(data.explanation||'Add this component.').slice(0,500)}`;$('saSteps').append(li);$('saSteps').scrollTop=$('saSteps').scrollHeight;
        $('saStepCount').textContent=`(${task.steps})`;$('saDesignStatus').textContent=`Drawing part ${task.steps}${task.totalSteps?' of '+task.totalSteps:''}: ${displayName(n)}. ${String(data.explanation||'').slice(0,250)}`;
        // A short paint interval keeps separately received steps visible even in a buffered burst.
        await new Promise(resolve=>setTimeout(resolve,task.steps>80?24:60));return;
      }
      if(data.event==='done'){
        if(!task.started)throw new Error('The AI returned no drawing parts.');
        if(JSON.stringify(E.sanitize(data.nodes))!==JSON.stringify(nodes))throw new Error('The drawing stream ended with a different plan. The visible draft is kept.');
        task.done=true;showDesignSummary(data.summary||{});
        $('saDesignStatus').textContent=`Drawing complete · ${nodes.length} components · ${task.steps} drawing steps · ${data.summary?.reference_status||task.referenceStatus||''}. You can edit it or ask the AI to read it.`;
      }
    }
    let reader;
    try{
      const response=await fetch(`/api/campaign/${campaignId}/spells/design`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,detail:$('saDesignDetail').value,target_parts:Number($('saDetailTarget').value)}),signal:task.controller.signal});
      if(!response.ok){const error=await response.json();throw new Error(error.error||'The AI designer could not start.');}
      if(!response.body)throw new Error('This browser could not open the drawing stream.');
      reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';
      while(isCurrent()){
        const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});
        if(buffer.length>1000000)throw new Error('The drawing stream exceeded its limit.');
        let end;while((end=buffer.indexOf('\n'))!==-1){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(line)await applyEvent(JSON.parse(line));if(!isCurrent())break;}
        if(done){if(buffer.trim()&&isCurrent())await applyEvent(JSON.parse(buffer));break;}
      }
      if(isCurrent()&&!task.done)throw new Error('The connection ended before the design was finished. The partial drawing is kept.');
    }catch(error){
      if(drawing===task&&key===task.identity&&active){$('saDesignStatus').textContent=task.timedOut?'The AI timed out. Any parts already drawn are saved. Try a shorter request.':error.name==='AbortError'?'Drawing stopped. Your draft is saved.':error.message;}
    }finally{
      clearTimeout(timeout);task.controller.abort();if(reader)await reader.cancel().catch(()=>{});
      if(drawing===task){drawing=null;save();render();}
    }
  });
  $('saInterpret').onclick=async()=>{
    cancelAI();if(!nodes.length)return;const controller=new AbortController();abort=controller;const version=revision,identity=key;
    $('saInterpret').disabled=true;$('saAiStatus').textContent='Reading the geometry and checking reference material…';
    const timeout=setTimeout(()=>controller.abort(),155000);
    try{
      const res=await fetch(`/api/campaign/${campaignId}/spells/interpret`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nodes}),signal:controller.signal});
      const data=await res.json();if(!res.ok)throw new Error(data.error||'The AI could not read this spell.');
      if(version!==revision||identity!==key||!active)return;reading=data;
      $('saAiStatus').textContent=`${data.model} · ${data.reference_status} · ${data.functional?'Functional interpretation':data.functional===false?'Not functional':'Uncertain interpretation'}`;
      const box=$('saAiReading');box.replaceChildren();const heading=document.createElement('strong');heading.textContent=data.name;box.append(heading);
      for(const field of ['description','geometry','canon','inference']){if(data[field]){const p=document.createElement('p');p.textContent=({geometry:'Geometry: ',canon:'Established mechanics: ',inference:'Interpretation: '}[field]||'')+data[field];box.append(p);}}
      if(data.issues?.length){const ul=document.createElement('ul');data.issues.forEach(issue=>{const li=document.createElement('li');li.textContent=issue;ul.append(li);});box.append(ul);}
      data.sources?.forEach(source=>{const a=document.createElement('a');a.href=source.url;a.textContent=source.title;a.target='_blank';a.rel='noopener';box.append(a,document.createTextNode(' · '));});
      if(data.functional)cast();
    }catch(error){if(version===revision&&identity===key&&active){$('saAiStatus').textContent=error.name==='AbortError'?'The reading timed out. Try again; your drawing is safe.':error.message;}}
    finally{clearTimeout(timeout);if(abort===controller){abort=null;verdict();}}
  };
  window.SpellAtelier={setActive};
})();
