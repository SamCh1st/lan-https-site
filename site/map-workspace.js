(function(){
  'use strict';
  let ctx=null,current=null,timer=null,visible=false,mode='story',pending={},saving=null,epoch=0,busy=false,mapChoices=[],navigation=0,arrivalFocus=null;
  const $=window.jQuery;
  const compactPanels=window.matchMedia('(max-width: 950px), (pointer: coarse)');
  let panelOpen={left:true,right:true}, inspectedPlayer=null;
  const enums={time:['Dawn','Morning','Day','Evening','Night'],weather:['Clear','Cloudy','Rain','Storm','Snow','Fog'],visibility:['Clear','Dim','Dark','Obscured'],temperature:['Freezing','Cold','Mild','Warm','Hot'],danger:['Safe','Uneasy','Dangerous','Angry','Combat'],pace:['Resting','Exploration','Travel','Social scene','Chase','Combat']};
  const defaults={time:'Day',weather:'Clear',visibility:'Clear',temperature:'Mild',danger:'Safe',pace:'Exploration'};
  const button=(text,attrs='')=>`<button type="button" ${attrs}>${text}</button>`;
  function init(){
    $('#campaignDashboard').before('<div id="mapWorkspaceHeader" class="map-workspace-header d-none"><label>Campaign map <select id="mapWorkspaceSelect" aria-label="Campaign map"></select></label><span id="mapWorkspaceDM">'+button('New map','id="mapNewToggle"')+button('Reload','id="mapReload"')+button('Story','data-map-mode="story"')+button('Edit','data-map-mode="edit"')+'</span><span id="mapWorkspaceStatus" role="status"></span><small id="mapKindNotice"></small><form id="mapNewForm" hidden><input name="title" aria-label="Map name" placeholder="Map name" maxlength="120" required><span id="mapNewKind"></span><button type="submit">Create map</button></form></div>');
    $('#campaignDashboard').append('<aside id="mapPlayerInventory" class="map-custom-rail"></aside><aside id="mapPlayerAbilities" class="map-custom-rail"></aside>');
    const fields=Object.keys({location:0,...enums,mood:0}).map(k=>`<label>${k==='mood'?'Public mood':k==='location'?'Current location':k}<${enums[k]?'select':'input'} data-scene="${k}" ${enums[k]?'':'maxlength="120"'}>${enums[k]?enums[k].map(v=>`<option>${v}</option>`).join('')+'</select>':''}</label>`);
    $('#campaignDashboard').prepend('<aside id="mapStoryLeft" class="map-custom-rail"><button type="button" id="mapStoryDiceToggle" aria-expanded="false">Scene ▸ Dice</button><div id="mapStoryFields">'+fields.slice(0,4).join('')+'</div><div id="mapStoryDiceHost" hidden></div></aside>');
    $('#campaignDashboard').append('<aside id="mapStoryRight" class="map-custom-rail">'+fields.slice(4).join('')+'<small>Scene changes are shared with the table.</small></aside>');
    const groups=MapCatalog.groups;
    $('#campaignDashboard').prepend('<aside id="map2Tools" class="map-custom-rail"><div class="map2-panel-heading"><span>CARTOGRAPHER</span><h3>Build your realm</h3></div><div class="map2-core-tools">'+button('↖ Select','data-map2-tool="select"')+button('✥ Pan','data-map2-tool="pan"')+'</div><nav class="map2-catalog-tabs" aria-label="Map tools">'+['all',...Object.keys(groups)].map((g,i)=>button(g,`data-map2-group="${g}" class="${i?'':'active'}"`)).join('')+'</nav><input id="map2CatalogSearch" type="search" placeholder="Search all parts…" aria-label="Search map catalog"><div class="map2-catalog">'+Object.entries(groups).map(([g,tools])=>`<section class="map2-catalog-section" data-map2-section="${g}"><h4>${g}</h4><div class="map2-palette" data-map2-catalog="${g}">`+tools.map(t=>button(MapArt.icon(t)+'<span>'+MapCatalog.label(t)+'</span>',`data-map2-tool="${t}" data-catalog-type="${g}" title="${MapCatalog.label(t)}"`)).join('')+'</div></section>').join('')+'<p id="map2CatalogEmpty" hidden>No matching parts. Try another word or choose All.</p></div><small id="map2CatalogCount" role="status"></small><div class="map2-brush-options"><h4 id="map2ToolName">Select an object</h4><label>Size <output id="map2SizeValue">80</output><input id="map2BrushSize" type="range" min="20" max="320" step="10" value="80"></label><label class="map2-check" id="map2OutlineOption" hidden><input id="map2BuildingOutline" type="checkbox"> Draw building outline</label><label class="map2-check" id="map2WallOption" hidden><input id="map2BuildingWalls" type="checkbox"> Draw walls inside a building</label><small id="map2OutlineHelp" hidden>Drag a line back to its start, or between two points on the same building. With Draw walls and Reverse checked, erase only painted walls. Pause while holding the mouse button to smooth your line. Drawn outlines become smooth walls; rectangle dragging keeps square corners.</small><label class="map2-check" title="Remove only the selected type under the brush"><input id="map2Reverse" type="checkbox"> Reverse · remove selected type</label><label class="map2-check"><input id="map2BrushBorder" type="checkbox"> Outline brush edges</label><label>Soft edges<input id="map2BrushSoftness" type="range" min="0" max="100" value="55"></label><label>Opacity <output id="map2OpacityValue">100%</output><input id="map2BrushOpacity" type="range" min="10" max="100" step="5" value="100"></label><label class="map2-check" id="map2TileDrawOption" hidden><input id="map2TileDraw" type="checkbox"> Tile draw</label><small id="map2TileDrawHelp" hidden>Fill whole grid tiles. Reverse removes painted tiles.</small><label>Terrain shape<select id="map2DrawMode"><option value="brush">Freehand brush</option><option value="rectangle">Rectangle</option></select></label><label class="map2-check"><input id="map2Snap" type="checkbox" checked> Snap · 5 ft squares</label><label class="map2-check"><input id="map2GridVisible" type="checkbox" checked> Show grid</label><label>Canvas<select id="map2Background"><option value="empty">Empty grid</option><option value="grass">Woodland</option><option value="water">Ocean</option><option value="sand">Parchment</option><option value="stone">Dungeon</option></select></label></div><div class="map2-history">'+button('↶ Undo','data-map2-action="undo"')+button('↷ Redo','data-map2-action="redo"')+'</div><small>Paint terrain, place stamps, then select to move, resize or rotate. Scroll to zoom.</small></aside>');
    $('#map2Tools .map2-catalog-tabs').append(button('Characters','data-map2-group="characters"'));
    $('#map2CatalogEmpty').before('<section class="map2-catalog-section" data-map2-section="characters"><h4>Player characters</h4><p class="map-character-help">Drag a character onto the map to place them. Select them to move their player here.</p><div id="map2CharacterPalette" class="map2-palette"></div></section>');
    const catalogSections=[{id:'map2TypesToggle',label:'Types',selector:'.map2-catalog-tabs'},{id:'map2PartsToggle',label:'Parts',selector:'#map2CatalogSearch,.map2-catalog,#map2CatalogCount'}];
    catalogSections.forEach(({id,label,selector})=>{const targets=$('#map2Tools').find(selector),toggle=$('<button type="button" class="map2-catalog-toggle" aria-expanded="true"></button>').attr('id',id).text(label);targets.each(function(i){if(!this.id)this.id=id+'Content'+i;});toggle.attr('aria-controls',targets.toArray().map(el=>el.id).join(' '));targets.first().before(toggle);toggle.on('click',()=>{const open=toggle.attr('aria-expanded')!=='true';toggle.attr('aria-expanded',String(open));targets.toggleClass('map2-catalog-collapsed',!open);});});
    $('#campaignDashboard').append('<aside id="map2Inspector" class="map-custom-rail"><div class="map2-panel-heading"><span>SCENE DETAILS</span><h3>Objects & layers</h3></div><details open><summary>Selected object</summary><div class="map2-property-grid">'+['label','x','y','w','h','rotation','color','opacity'].map(k=>`<label>${({w:'Width',h:'Height',rotation:'Rotation (°)',opacity:'Opacity (0–1)'})[k]||k}<input data-map2-property="${k}" step="${k==='opacity'?'.05':'1'}" type="${k==='label'?'text':k==='color'?'color':'number'}"></label>`).join('')+'</div><label class="map2-check"><input id="map2Effects" type="checkbox" disabled> Ambient effect</label><label>Folder<select id="map2ObjectFolder" aria-label="Object folder"><option value="">Scene root</option></select></label><label for="map2LayerNumber">Layer</label><div class="map2-layer-control"><input id="map2LayerNumber" type="number" min="1" step="1" aria-label="Selected object layer" aria-describedby="map2LayerHelp" disabled><div><button type="button" id="map2LayerUp" aria-label="Move up one layer" title="Move up one layer" disabled>▲</button><button type="button" id="map2LayerDown" aria-label="Move down one layer" title="Move down one layer" disabled>▼</button></div></div><small id="map2LayerHelp">1 is the bottom. Higher numbers appear on top.</small><div class="map2-object-actions">'+['duplicate','delete','front','back','hide','lock'].map(t=>button(t,`data-map2-action="${t}"`)).join('')+'</div></details><details id="map2Hierarchy" open><summary class="map2-layer-heading">Hierarchy <small>Top to bottom</small></summary><div class="map2-folder-create"><input id="map2FolderName" maxlength="50" placeholder="Folder name" aria-label="New folder name"><button type="button" id="map2NewFolder">+ Folder</button></div><small>Select parts first to group them, or drag them into a folder.</small><div id="map2Layers"></div></details></aside>');
    $('#map2Tools .map2-brush-options').append('<label>Scenery density<input id="map2Density" type="range" min="1" max="8" value="3"></label><details><summary>Material lighting</summary><label>Light direction<input id="map2Light" type="range" min="0" max="360" value="315"></label><label>Surface relief<input id="map2Relief" type="range" min="0" max="3" step="0.1" value="1"></label><button type="button" id="map2TextureSeed">New texture variation</button><small id="map2MaterialStatus">PBR surface lighting</small></details>');
    const materialOptions=MapMaterials.names.map(name=>'<option value="'+name+'">'+name+'</option>').join('');
    $('#map2Inspector details').first().after('<details id="map2BuildingOptions" hidden open><summary>Building materials</summary><label>Floor texture<select id="map2Floor" data-map2-property="floor_texture">'+materialOptions+'</select></label><label>Wall texture<select id="map2Wall" data-map2-property="wall_texture">'+materialOptions+'</select></label><label>Wall thickness<input type="number" min="4" max="32" id="map2WallWidth" data-map2-property="wall_width"></label><small>Drag out rooms on the grid. Every room has its own floor and walls.</small></details><details id="map2ContentsPanel"><summary><span id="map2ContentsTitle">Equipment &amp; contents</span> <span id="map2ContentsCount"></span></summary><p id="map2ContentsHelp">Select a part to add campaign cards.</p><section class="map-equipped-section" aria-labelledby="map2EquippedTitle"><h4 id="map2EquippedTitle">Equipped</h4><div id="map2Equipped"></div></section><p id="map2ContentsStatus" role="status"></p><details class="map-card-picker" open><summary>Add cards</summary><input id="map2ContentsSearch" type="search" placeholder="Find a campaign card…" aria-label="Search object contents"><div id="map2ContentsChoices"></div></details><details class="map-contents-wallet"><summary>Money held</summary><div id="map2Money"></div></details><label hidden><input type="checkbox" id="map2ContentsPublic"> Players can open and take contents</label><small>Players can take contents from visible parts. Hide the part to keep it secret.</small><label class="map2-check"><input type="checkbox" id="map2RemoveAfterLooting"> Remove part after looting</label></details>');
    $('#map2Inspector').prepend('<details id="map2FogPanel" hidden open><summary>Fog of war</summary><label>Fog opacity / thickness (%)<input id="map2FogOpacity" type="number" min="0" max="100" step="1" aria-label="Fog opacity percentage"></label><small>0% is transparent; 100% completely hides the map below.</small></details>');
    $('#map2Inspector').prepend('<details id="map2CardPanel" hidden open><summary>Assigned card</summary><label id="map2CardLabel">NPC or encounter</label><select id="map2CardSelect" aria-labelledby="map2CardLabel"></select><small>The marker uses the assigned card’s image. Its name and image are visible on the map.</small></details>');
    $('#map2Inspector details').first().after('<details id="map2ConnectionPanel" open hidden><summary>Connected map</summary><label>Destination<select id="map2ConnectedMap" aria-label="Connected map"></select></label>'+button('Open connected map','id="map2OpenConnection"')+'<small>Click this stamp in Story mode to open its map. Players travel by clicking this connected part. Their location stays separate from the DM’s map.</small></details>');
    function filterCatalog(){const group=document.querySelector('[data-map2-group].active')?.dataset.map2Group||'all',terms=$('#map2CatalogSearch').val().toLowerCase().trim().split(/\s+/).filter(Boolean);let count=0;document.querySelectorAll('[data-map2-section]').forEach(section=>{const category=section.dataset.map2Section;let shown=0;section.querySelectorAll('[data-map2-tool],[data-map2-player]').forEach(b=>{const text=(b.dataset.map2Player?b.textContent:MapCatalog.searchText(b.dataset.map2Tool,category))+' '+b.title.toLowerCase();b.hidden=!terms.every(term=>text.toLowerCase().includes(term));if(!b.hidden)shown++;});section.hidden=(group!=='all'&&group!==category)||!shown;if(!section.hidden)count+=shown;});$('#map2CatalogEmpty').prop('hidden',count>0);$('#map2CatalogCount').text(count+(group==='characters'?' characters':' entries'));$('#map2CatalogSearch').attr('placeholder',group==='all'?'Search all parts…':'Search '+group+'…');}
    $('[data-map2-group]').on('click',function(){$('[data-map2-group]').removeClass('active').attr('aria-pressed','false');$(this).addClass('active').attr('aria-pressed','true');filterCatalog();});
    $('#map2CatalogSearch').on('input',filterCatalog);filterCatalog();
    $('#map2BrushSize').on('input',function(){$('#map2SizeValue').text(this.value);});
    $('#map2BrushOpacity').on('input',function(){$('#map2OpacityValue').text(this.value+'%');});
    $('.map-stage').append('<section id="map2Surface" hidden><div class="map2-view-controls">'+button('+','data-map2-action="zoom-in" aria-label="Zoom in"')+button('−','data-map2-action="zoom-out" aria-label="Zoom out"')+button('Fit view','data-map2-action="fit"')+button('Fullscreen','data-map-fullscreen aria-label="Fullscreen map"')+'</div><svg id="map2Canvas" tabindex="0" aria-label="2D tabletop map"></svg><section id="map2ObjectPopup" hidden aria-label="Object contents"><button type="button" id="map2ClosePopup" aria-label="Close object contents">Close</button><h3 id="map2PopupTitle"></h3><div id="map2PopupContents"></div></section></section>');
    $('#mapWorkspaceHeader').append(button('Fullscreen','data-map-fullscreen'));
    $('#campaignDashboard').prepend('<div id="mapFullscreenBar"><div><span>CARTOGRAPHER’S TABLE</span><strong id="mapFullscreenTitle"></strong></div><div class="map-fullscreen-modes">'+button('Story','data-fullscreen-mode="story"')+button('Edit','data-fullscreen-mode="edit"')+'</div><span id="mapFullscreenStatus" role="status"></span>'+button('Left panel','id="mapLeftPanelToggle" aria-expanded="true"')+button('Right panel','id="mapRightPanelToggle" aria-expanded="true"')+button('Exit fullscreen','data-map-fullscreen')+'</div>');
    $('#mapLeftPanelToggle').on('click',()=>togglePanel('left'));
    $('#mapRightPanelToggle').on('click',()=>togglePanel('right'));
    compactPanels.addEventListener('change',()=>{if($('#campaignDashboard').hasClass('map-workspace-fullscreen')&&compactPanels.matches)panelOpen={left:false,right:false};refreshPanels();});

    $('[data-map-fullscreen],#mapFullscreen').after(button('Stats','data-map-stats aria-label="Character stats and notes"'));
    $(document).on('click','[data-map-stats]',()=>{if(ctx)MapStats.open(ctx,inspectedPlayer?.character_id).catch(e=>status(e.message));});
    $(document).on('click','[data-map-fullscreen]',async()=>{
      const root=$('#campaignDashboard')[0];
      if(document.fullscreenElement){await document.exitFullscreen();return;}
      if(root.classList.contains('map-workspace-fullscreen')){root.classList.remove('map-workspace-fullscreen','map-workspace-fullscreen-fallback');refreshPanels();return;}
      panelOpen={left:!compactPanels.matches,right:!compactPanels.matches};root.classList.remove('map-inspector-open');root.classList.add('map-workspace-fullscreen');refreshPanels();
      try{await root.requestFullscreen();}catch(e){root.classList.add('map-workspace-fullscreen-fallback');}
    });
    document.addEventListener('fullscreenchange',()=>{const root=$('#campaignDashboard')[0];if(document.fullscreenElement!==root)root.classList.remove('map-workspace-fullscreen','map-workspace-fullscreen-fallback');refreshPanels();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.defaultPrevented&&$('#campaignDashboard').hasClass('map-workspace-fullscreen-fallback')){$('#campaignDashboard').removeClass('map-workspace-fullscreen-fallback map-workspace-fullscreen');refreshPanels();}});
    $('[data-fullscreen-mode]').on('click',function(){$(`[data-map-mode="${this.dataset.fullscreenMode}"]`).trigger('click');});
    document.getElementById('mapFullscreen').addEventListener('click',e=>{if(ctx){e.stopImmediatePropagation();$('#mapWorkspaceHeader [data-map-fullscreen]').trigger('click');}},true);
    $('#map2Inspector details').first().after('<details id="map2RiverFlow" hidden open><summary>River flow</summary><label>X · horizontal<input data-map2-property="flow_x" type="number" min="-2" max="2" step="0.1"></label><label>Y · vertical<input data-map2-property="flow_y" type="number" min="-2" max="2" step="0.1"></label><small>Positive X flows right; positive Y flows down. Negative values reverse it. Larger values flow faster. Set both to 0 for ripples only.</small></details>');
    $('#map2Inspector details').first().after('<details id="map2HeightOptions" hidden open><summary>Part height</summary><label>Height multiplier<input data-map2-property="height_scale" type="number" min="0" max="4" step="0.1"></label><small>Heightmaps shape daylight and lamp shadows. Set to 0 for a flat part.</small></details><details id="map2LightOptions" hidden open><summary>Light options</summary><label id="map2FlameColor" hidden>Light color<input data-map2-property="light_color" type="color"></label><label>Radius (map units)<input id="map2LightRadius" type="number" min="10" max="5000" step="10"></label><label>Brightness<input data-map2-property="light_intensity" type="number" min="0" max="1" step="0.05"></label><label>Soft edge (0-1)<input data-map2-property="light_softness" type="number" min="0" max="1" step="0.05"></label><label>Shadow length<input data-map2-property="shadow_length" type="number" min="0" max="8" step="0.1"></label><label>Shadow strength (0-1)<input data-map2-property="shadow_strength" type="number" min="0" max="1" step="0.05"></label><label class="map2-check"><input data-map2-property="fire_light" type="checkbox"> Fire light</label><div id="map2FireControls" hidden><label>Wave strength<input data-map2-property="fire_wave" type="range" min="0" max="1" step="0.01"></label><label>Flicker strength<input data-map2-property="fire_flicker" type="range" min="0" max="1" step="0.01"></label></div><small>Drag its handles to resize. Indoor lights illuminate only their building.</small></details><details open><summary>Daylight shadows</summary><label>Outdoor shadow length<input id="map2SunShadows" type="number" min="0" max="8" step="0.1" value="1"></label><label>Outdoor shadow strength (0-1)<input id="map2SunShadowStrength" type="number" min="0" max="1" step="0.05" value="1"></label><small>Direction follows the scene time. Daylight shadows never enter building interiors. Set length to 0 to turn them off.</small></details>');
    $('#map2Inspector details').first().after('<div id="map2OpeningOptions" hidden>'+MapOpeningSettings.markup()+'</div>');
    splitEditPanels();Map2D.init();MapScene.init();
    window.addEventListener('beforeunload',e=>{if(saving||Object.keys(pending).length){e.preventDefault();e.returnValue='';}});
    $('#mapReload').on('click',async()=>{if(saving)return;if(Object.keys(pending).length&&!confirm('Discard unsaved map changes and load the latest saved map?'))return;pending={};current=null;await sync();status('Map reloaded');});
    $('#mapNewToggle').on('click',()=>$('#mapNewForm').prop('hidden',!$('#mapNewForm').prop('hidden')));
    $('#mapNewForm').on('submit',async function(e){e.preventDefault();try{await flush();const data=Object.fromEntries(new FormData(this));await request('', 'POST', data);this.reset();this.hidden=true;await sync();}catch(e){status(e.message);}});
    $('#mapWorkspaceSelect').on('change',function(){openConnectedMap(this.value);});
    $('[data-map-mode]').on('click',async function(){try{await flush();mode=this.dataset.mapMode;configure();}catch(e){status(e.message);}});
    $('[data-scene]').on('change',function(){const scene={[this.dataset.scene]:this.value};const patch={scene};if(this.dataset.scene==='time')patch.time=this.value==='Dawn'?'morning':this.value.toLowerCase();if(this.dataset.scene==='weather')patch.weather=['Rain','Storm'].includes(this.value)?this.value.toLowerCase():'clear';queue(patch);});
    $('#mapStoryDiceToggle').on('click',function(){const open=$('#mapStoryDiceHost').prop('hidden');$('#mapStoryDiceHost').prop('hidden',!open);$('#mapStoryFields').prop('hidden',open);this.setAttribute('aria-expanded',String(open));this.textContent=open?'Dice ▸ Scene':'Scene ▸ Dice';if(open)$('#inventoryDicePanel').appendTo('#mapStoryDiceHost').prop('hidden',false);});
  }
  function splitEditPanels(){
    const tools=document.getElementById('map2Tools'),inspector=document.getElementById('map2Inspector');
    const half=(rail,id,title,children)=>{const section=document.createElement('section'),toggle=document.createElement('button'),body=document.createElement('div');
      section.id=id;section.className='map2-rail-half';toggle.type='button';toggle.className='map2-half-toggle';toggle.id=id+'Toggle';toggle.textContent=title;toggle.setAttribute('aria-expanded','true');toggle.setAttribute('aria-controls',id+'Body');body.id=id+'Body';body.className='map2-half-body';body.setAttribute('role','region');body.setAttribute('aria-labelledby',toggle.id);
      body.append(...children);section.append(toggle,body);rail.append(section);toggle.onclick=()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));section.classList.toggle('is-collapsed',!open);body.hidden=!open;rail.dispatchEvent(new Event('map2-half-toggle'));};return section;
    };
    const drawing=tools.querySelector('.map2-brush-options'),history=tools.querySelector('.map2-history'),hint=tools.lastElementChild;
    tools.querySelector('.map2-panel-heading').remove();const catalog=[...tools.children].filter(n=>![drawing,history,hint].includes(n));
    half(tools,'map2CatalogHalf','Parts & types',catalog);half(tools,'map2DrawingHalf','Selected part options',[drawing,history,hint]);
    const hierarchy=document.getElementById('map2Hierarchy'),hierarchyChildren=[...hierarchy.children].filter(n=>n.tagName!=='SUMMARY');hierarchy.remove();inspector.querySelector('.map2-panel-heading').remove();
    const selected=inspector.querySelector('.map2-property-grid').closest('details'),settings=[selected,...inspector.children].filter((n,i,a)=>a.indexOf(n)===i);
    half(inspector,'map2Hierarchy','Hierarchy',hierarchyChildren);half(inspector,'map2ObjectHalf','Object & map options',settings);
    tools.classList.add('map2-split-rail');inspector.classList.add('map2-split-rail');
    [tools,inspector].forEach(resizeEditHalves);
  }
  function resizeEditHalves(rail){
    const [top,bottom]=rail.querySelectorAll(':scope > .map2-rail-half'),divider=document.createElement('div'),key='map2-panel-split:'+rail.id;let ratio=.5,drag=null;
    try{const saved=Number(localStorage.getItem(key));if(saved>=.15&&saved<=.85)ratio=saved;}catch{}
    divider.className='map2-half-resizer';divider.tabIndex=0;divider.setAttribute('role','separator');divider.setAttribute('aria-orientation','horizontal');divider.setAttribute('aria-label',rail.id==='map2Tools'?'Resize parts and drawing options':'Resize hierarchy and object options');divider.setAttribute('aria-controls',top.id+' '+bottom.id);divider.setAttribute('aria-valuemin','15');divider.setAttribute('aria-valuemax','85');divider.title='Drag to resize · Arrow keys adjust · Double-click to reset';top.after(divider);
    const apply=value=>{ratio=Math.max(.15,Math.min(.85,value));top.style.setProperty('--map2-half-weight',ratio*100);bottom.style.setProperty('--map2-half-weight',(1-ratio)*100);divider.setAttribute('aria-valuenow',Math.round(ratio*100));divider.setAttribute('aria-valuetext',Math.round(ratio*100)+'% top, '+Math.round((1-ratio)*100)+'% bottom');};
    const save=()=>{try{localStorage.setItem(key,String(ratio));}catch{}};
    const finish=(commit=true)=>{if(!drag)return;const old=drag;drag=null;if(!commit)apply(old.ratio);else save();divider.classList.remove('is-dragging');if(divider.hasPointerCapture(old.id))divider.releasePointerCapture(old.id);};
    const visibility=()=>{divider.hidden=top.classList.contains('is-collapsed')||bottom.classList.contains('is-collapsed');if(divider.hidden)finish();};rail.addEventListener('map2-half-toggle',visibility);
    divider.addEventListener('pointerdown',e=>{if(e.button!==0||divider.hidden||drag)return;e.preventDefault();divider.focus({preventScroll:true});drag={id:e.pointerId,y:e.clientY,top:top.getBoundingClientRect().height,total:top.getBoundingClientRect().height+bottom.getBoundingClientRect().height,ratio};divider.setPointerCapture(e.pointerId);divider.classList.add('is-dragging');});
    divider.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;e.preventDefault();apply((drag.top+e.clientY-drag.y)/Math.max(1,drag.total));});
    divider.addEventListener('pointerup',()=>finish());divider.addEventListener('pointercancel',()=>finish(false));divider.addEventListener('lostpointercapture',()=>finish());
    divider.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag){e.preventDefault();finish(false);return;}const step=e.shiftKey ? .1 : .02,value=e.key==='ArrowUp'?ratio-step:e.key==='ArrowDown'?ratio+step:e.key==='Home' ? .15 : e.key==='End' ? .85 : null;if(value===null)return;e.preventDefault();apply(value);save();});
    divider.addEventListener('dblclick',()=>{apply(.5);save();});apply(ratio);visibility();
  }
  function togglePanel(side){panelOpen[side]=!panelOpen[side];if(compactPanels.matches&&panelOpen[side])panelOpen[side==='left'?'right':'left']=false;refreshPanels();}
  function refreshPanels(){
    const root=document.getElementById('campaignDashboard');if(!root)return;const full=root.classList.contains('map-workspace-fullscreen'),mobile=compactPanels.matches;
    root.classList.toggle('map-mobile-drawers',mobile);root.classList.toggle('map-left-collapsed',!panelOpen.left);root.classList.toggle('map-right-collapsed',!panelOpen.right);
    const edit=ctx?.dm&&mode==='edit',two=current?.kind==='2d',contents=root.classList.contains('map-contents-open');
    const left=inspectedPlayer?document.getElementById('mapPlayerInventory'):contents?document.getElementById('map2ObjectPopup'):root.querySelector(!ctx?.dm?'.inventory-rail':mode==='story'?'#mapStoryLeft':two?'#map2Tools':'.map-editor-rail:not(.tool-rail-end)');
    const right=inspectedPlayer?document.getElementById('mapPlayerAbilities'):root.querySelector(!ctx?.dm?'.attacks-rail':mode==='story'?'#mapStoryRight':two?'#map2Inspector':'.tool-rail-end');
    const rails=root.querySelectorAll(':scope > .inventory-rail,:scope > .attacks-rail,:scope > .map-editor-rail,:scope > .map-custom-rail,:scope > #map2ObjectPopup');
    rails.forEach(rail=>{if(!full&&!inspectedPlayer){rail.style.removeProperty('display');rail.removeAttribute('data-fullscreen-side');return;}const side=rail===left?'left':rail===right?'right':null;if(side)rail.dataset.fullscreenSide=side;else rail.removeAttribute('data-fullscreen-side');rail.style.setProperty('display',side&&(!full||panelOpen[side])?(rail.classList.contains('map2-split-rail')||rail.classList.contains('inventory-rail')?'flex':'block'):'none','important');});
    if(full)root.style.gridTemplateColumns=mobile?'minmax(0,1fr)':(panelOpen.left?(contents?'320px':'260px'):'0px')+' minmax(0,1fr) '+(panelOpen.right?'260px':'0px');else root.style.removeProperty('grid-template-columns');
    for(const [side,label] of [['left',inspectedPlayer?'Inventory':contents?'Contents':!ctx?.dm?'Inventory':edit?(two?'Parts':'Tools'):'Scene'],['right',inspectedPlayer?'Spells':!ctx?.dm?'Spells':edit?(two?'Hierarchy':'Layers'):'Details']]){const b=document.getElementById(side==='left'?'mapLeftPanelToggle':'mapRightPanelToggle');if(!b)continue;b.textContent=label+' '+(panelOpen[side]?'▾':'▸');b.setAttribute('aria-expanded',String(panelOpen[side]));b.setAttribute('aria-label',(panelOpen[side]?'Hide ':'Show ')+label.toLowerCase());b.classList.toggle('active',panelOpen[side]);}
  }
  function inspectPlayer(player){
    if(!ctx?.dm)return;
    inspectedPlayer=player||null;
    if(player){Map2D.closeContents?.();renderPlayerPanels();panelOpen={left:true,right:!compactPanels.matches};}
    refreshPanels();
  }
  function renderCharacterPalette(){
    const palette=$('#map2CharacterPalette'),characters=(current?.players||[]).filter(p=>p.character_id);
    const signature=JSON.stringify(characters.map(p=>[p.id,p.character_id,p.character_name,p.character_image_id,p.username]));
    if(palette.attr('data-signature')===signature)return;
    palette.attr('data-signature',signature).empty();
    characters.forEach(player=>{
      const name=player.character_name||player.username,card=$('<button type="button" draggable="true">').attr('data-map2-player',player.id).attr('title','Drag '+name+' onto the map').attr('aria-label','Place '+name);
      if(player.character_image_id)$('<img alt="">').attr('src','/api/uploads/'+player.character_image_id).appendTo(card);
      else $('<span aria-hidden="true" class="map-character-sigil">').text('♙').appendTo(card);
      $('<span>').text(name).appendTo(card);palette.append(card);
      card.on('click',()=>{Map2D.selectCharacter(player.id);});
    });
    if(!characters.length)palette.append('<p>No player characters in this campaign yet.</p>');
    $('#map2CatalogSearch').trigger('input');
  }
  function playerGrants(record,key){
    const c=record.content||{},links=(c[key]||[]).map(Number);
    if(c.grant_mode==='characters'||links.length)return links;
    return ctx.getRecords().filter(r=>r.content?.category==='character'&&Number(r.content.campaign_id)===Number(ctx.campaign.id)&&(c.assigned_user_ids||[]).map(Number).includes(Number(r.content.owner_user_id))).map(r=>Number(r.id));
  }
  async function savePlayerImageScale(characterId,scale){
    const context=ctx;
    const fresh=await context.api('/api/work'),character=fresh.items.find(r=>r.id===characterId&&r.content?.category==='character');
    if(!character)throw new Error('This character is no longer available.');
    await context.api('/api/work/'+characterId,{method:'PUT',body:JSON.stringify({title:character.title,content:{...character.content,map_image_scale:CharacterImageScale.value(scale)}})});
    await context.onRefreshRecords?.();
    if(ctx!==context)return;
    await sync();renderPlayerPanels();status('Character size saved across maps.');
  }
  function renderPlayerPanels(){
    if(!inspectedPlayer||!ctx?.dm)return;
    const characterId=Number(inspectedPlayer.character_id),name=inspectedPlayer.character_name||inspectedPlayer.username||'Player';
    for(const [selector,categories,key,title] of [['#mapPlayerInventory',['item'],'owner_ids','Inventory'],['#mapPlayerAbilities',['attack','spell'],'user_ids','Attacks & Spells']]){
      const rail=$(selector).empty();$('<h3>').text(name+' · '+title).appendTo(rail);if(key==='owner_ids'&&characterId){const c=ctx.getRecords().find(r=>r.id===characterId);if(current.kind==='2d'){const label=$('<label>').text('Interaction range '),output=$('<output>').text((c?.content.tabletop?.interaction_range??5)+' squares'),slider=$('<input type="range" min="0" max="50" step="1" aria-label="Interaction range">').val(c?.content.tabletop?.interaction_range??5);label.append(output,slider).appendTo(rail);slider.on('input',()=>output.text(slider.val()+' squares')).on('change',()=>{slider.prop('disabled',true);tradeContents({action:'set_range',character_id:characterId,range:Number(slider.val())}).catch(e=>{status(e.message);slider.prop('disabled',false);});});} rail.append(MapTrade.coinSummary(c?.content.tabletop?.money_cp||0));const money=MapTrade.coinInputs(c?.content.tabletop?.money_cp||0,'Character holds');rail.append(money.element);$('<button type=button>').text('Set money').on('click',()=>{try{tradeContents({action:'set_money',character_id:characterId,amount_cp:money.read()}).catch(e=>status(e.message));}catch(e){status(e.message);}}).appendTo(rail);}
      if(key==='owner_ids'&&characterId){
        const character=ctx.getRecords().find(r=>r.id===characterId),scale=CharacterImageScale.value(character?.content?.map_image_scale);
        const label=$('<label>').text('Map image scale '),output=$('<output>').text(scale+'×'),input=$('<input id="mapPlayerImageScale" type="range" min="0.25" max="8" step="0.05" aria-label="Map image scale">').val(scale);
        label.append(output,input,$('<small>').text('Saved on this character across all maps.')).appendTo(rail);
        input.on('input',()=>{output.text(Number(input.val())+'×');if(current.kind==='2d')Map2D.previewCharacterScale(characterId,Number(input.val()));}).on('change',async()=>{input.prop('disabled',true);try{await savePlayerImageScale(characterId,Number(input.val()));}catch(e){status(e.message);input.val(scale);output.text(scale+'×');}finally{if(current?.kind==='2d')Map2D.clearCharacterScalePreview(characterId);input.prop('disabled',false);}});
      }
      if(key==='owner_ids'&&mode==='edit'){
        const controls=$('<div class="map-player-placement">').prependTo(rail);
        $('<button type="button" id="mapForcePlayer">').text('Move player to this map').on('click',async function(){
          const context=ctx,mapId=current.id,playerId=Number(inspectedPlayer.id);this.disabled=true;
          try{await MapTokenWalk.flush();await flush();if(ctx!==context||current?.id!==mapId)return;await request('/'+mapId+'/summon','PUT',{user_id:playerId});status(name+' moved to '+current.title+'.');await sync();}
          catch(error){status(error.message);}finally{this.disabled=false;}
        }).appendTo(controls);
      }
      if(key==='owner_ids'){
        const heading=$('<div class="map-player-heading">').prependTo(rail);
        rail.children('h3').first().appendTo(heading);
        $('<button type="button" id="mapClosePlayer" aria-label="Close player information" title="Close player information">').text('×').on('click',()=>{
          if(current.kind==='2d')Map2D.selectCharacter(null);else inspectPlayer(null);
        }).appendTo(heading);
      }
      const records=ctx.getRecords().filter(r=>Number(r.content?.campaign_id)===Number(ctx.campaign.id)&&categories.includes(r.content.category)&&!r.content.reference_only&&playerGrants(r,key).includes(characterId));
      if(!records.length)$('<p>').text(characterId?'Nothing assigned yet.':'This player has no character yet.').appendTo(rail);
      const cards=$('<div class="map-player-card-grid">').appendTo(rail);
      records.forEach(record=>{const row=$('<div class="map-player-card">').appendTo(cards);row.append(RecordCards.create(record,{className:'map-player-card-name',onOpen:()=>ctx.onOpenRecord(record)}));
        $('<button type="button" class="map-card-remove">').text('×').attr('title','Remove from '+name).attr('aria-label','Remove '+record.title+' from '+name).on('click',async function(){
          this.disabled=true;const context=ctx;
          try{const fresh=await ctx.api('/api/work');const item=fresh.items.find(r=>r.id===record.id);if(!item)throw new Error('This card is no longer available.');
            const content={...item.content,[key]:playerGrants(item,key).filter(id=>id!==characterId),grant_mode:'characters'};
            await context.api('/api/work/'+item.id,{method:'PUT',body:JSON.stringify({title:item.title,content})});await context.onRefreshRecords?.();if(ctx===context)renderPlayerPanels();
          }catch(e){status(e.message);this.disabled=false;}
        }).appendTo(row);
      });
    }
  }
  function status(s){$('#mapWorkspaceStatus,#mapFullscreenStatus').text(s);}
  function request(path,method='GET',body){return ctx.api('/api/campaign/'+ctx.campaign.id+'/maps'+path,{method,...(body?{body:JSON.stringify(body)}:{})});}
  function queue(patch){if(!current||!ctx.dm)return;const scene=patch.scene?{...current.state.scene,...patch.scene}:null,queuedScene=patch.scene?{...pending.scene,...patch.scene}:pending.scene;Object.assign(current.state,patch);if(scene){current.state.scene=scene;MapScene.update(scene);}Object.assign(pending,patch);if(queuedScene)pending.scene=queuedScene;status('Saving…');flush().catch(e=>status('Not saved: '+e.message));}
  async function flush(){if(saving){await saving;if(Object.keys(pending).length)return flush();return;}if(!Object.keys(pending).length)return;
    const patch=pending;pending={};const target=current,version=epoch;
    saving=request('/'+target.id,'PUT',{revision:target.revision,state:patch}).then(r=>{target.revision=r.revision;status('Saved');}).catch(e=>{if(version===epoch){const retryScene=patch.scene||pending.scene?{...patch.scene,...pending.scene}:null;pending={...patch,...pending};if(retryScene)pending.scene=retryScene;status('Not saved: '+e.message);}throw e;}).finally(()=>saving=null);
    await saving;if(Object.keys(pending).length)await flush();
  }
  function configure(){if(!current||!ctx)return;inspectedPlayer=null;renderCharacterPalette();const s=current.state,edit=ctx.dm&&mode==='edit';MapScene.update(s.scene||{});
    if(current.kind==='2d'){campaignMap.dispose();Map2D.configure({nodes:s.nodes||[],folders:s.folders||[],canvas:s.canvas||{},players:current.players,viewerId:ctx.user.id,dm:ctx.dm,edit,getMaps:()=>mapChoices,getCurrentMapId:()=>current?.id,onOpenMap:openConnectedMap,getRecords:()=>ctx.getRecords().filter(r=>Number(r.content?.campaign_id)===ctx.campaign.id),onOpenRecord:ctx.onOpenRecord,onTrade:tradeContents,onTake:takeContents,onMeet:async n=>{await request('/'+current.id+'/meet','POST',{node_id:n.id});status((n.marker_card?.title||n.type)+' · Met');},onSave:()=>flush().catch(e=>status(e.message)),onChange:(nodes,folders)=>queue({nodes,folders}),onCanvasChange:canvas=>queue({canvas}),onPlayerSelect:inspectPlayer,onPositionChange:move,onCheckOpen:async(n,player,roll=false,mode='normal')=>{await flush();return request('/'+current.id+'/open','POST',{node_id:n.id,character_id:player?.character_id||undefined,roll,mode});}});}
    else {campaignMap.configure({...s,creator:edit,viewerId:ctx.user.id,players:current.players,npcs:current.npcs,onMapChange:queue,onEnvironmentChange:env=>queue({...env,scene:{time:env.time[0].toUpperCase()+env.time.slice(1),weather:env.weather[0].toUpperCase()+env.weather.slice(1)}}),onObjectSelect:o=>ctx.onObjectSelect(o,{map_icons:s.icons||[]}),onPlayerSelect:inspectPlayer,onPositionChange:move});ctx.onIcons({map_icons:s.icons||[]});}
    Object.keys({location:0,...enums,mood:0}).forEach(k=>$(`[data-scene="${k}"]`).val((s.scene||{})[k]||defaults[k]||'').prop('disabled',!ctx.dm));
    $('#mapFullscreenTitle').text(current.title+' · '+current.kind.toUpperCase());
    $('.map-fullscreen-modes').toggle(ctx.dm);
    document.dispatchEvent(new Event('map-workspace-configured'));
    paintVisibility();
    if(arrivalFocus?.mapId===current.id&&arrivalFocus.navigation===navigation){
      const origin=arrivalFocus.fromMapId;arrivalFocus=null;
      if(current.kind==='2d')Map2D.centerOnConnection(origin);
    }
  }
  function paintVisibility(){const active=!!ctx&&visible,story=active&&mode==='story',two=active&&current?.kind==='2d';
    $('#mapWorkspaceHeader').toggleClass('d-none',!active);$('#campaignDashboard').toggleClass('map-workspace-active',active).toggleClass('map-workspace-story',story).toggleClass('map-workspace-2d',two).toggleClass('map-workspace-dm',active&&ctx.dm);
    const three=active&&current?.kind==='3d';
    $('#map2Surface').prop('hidden',!two).prop('inert',!two);$('#mapPlaceholder').prop('hidden',!three).prop('inert',!three).toggleClass('d-none',!three);
    MapScene.setActive(two);
    $('[data-fullscreen-mode]').each(function(){this.classList.toggle('active',this.dataset.fullscreenMode===mode);});refreshPanels();
    $('[data-map-mode]').each(function(){this.classList.toggle('active',this.dataset.mapMode===mode);this.setAttribute('aria-pressed',String(this.dataset.mapMode===mode));});
    if(three)campaignMap.activate();else if(!ctx||current?.kind!=='3d')campaignMap.dispose();else campaignMap.deactivate();
  }
  async function tradeContents(data){await flush();const id=current.id;if(['take_money','buy','steal','steal_money'].includes(data.action))await checkLootOpening(data.node_id,data.character_id,id,['steal','steal_money'].includes(data.action)?'steal':data.action==='take_money'?'take':'open');await request('/'+id+'/trade','POST',data);await ctx.onRefreshRecords?.();const next=await request('/'+id);if(current?.id===id){current=next;Map2D.sync({nodes:next.state.nodes||[],folders:next.state.folders||[],players:next.players,clearHistory:true});renderPlayerPanels();}return next;}
  let lootOpening=false;
  async function checkLootOpening(nodeId,characterId,mapId,purpose='take'){
    const context=ctx,node=current?.state.nodes?.find(n=>n.id===nodeId);
    if(!node)throw Error('This part is no longer available.');
    if(purpose!=='open'?!node.steal_needs_item&&!node.steal_needs_roll:!node.needs_item&&!node.needs_roll)return;
    if(lootOpening)throw Error('Finish the current opening check first.');
    lootOpening=true;
    const check=async (roll,mode='normal')=>{
      if(ctx!==context||current?.id!==mapId)throw Error('The map changed. Select the part again.');
      return request('/'+mapId+'/open','POST',{node_id:nodeId,character_id:characterId,roll,purpose,mode});
    };
    try{
      let result=await check(false);
      if(!result.allowed&&result.needs_roll){
        const passed=await MapOpenRoll.request({title:node.label||node.part_name||MapCatalog.label(node.type),actionLabel:purpose==='steal'?'Steal':'Take',settings:result.settings,roll:mode=>check(true,mode)});
        if(!passed)throw Error('Nothing taken. The opening check was not passed.');
        result=await check(false);
      }
      if(!result.allowed)throw Error('Nothing taken. The part is still closed.');
      if(ctx!==context||current?.id!==mapId)throw Error('The map changed. Nothing was taken.');
    }finally{lootOpening=false;}
  }
  async function takeContents(node_id,record_id,character_id){await flush();const id=current.id;await checkLootOpening(node_id,character_id,id);await request('/'+id+'/take','POST',{node_id,record_id,character_id});await ctx.onRefreshRecords?.();const next=await request('/'+id);if(current?.id===id){current=next;Map2D.sync({nodes:next.state.nodes||[],folders:next.state.folders||[],players:next.players,clearHistory:true});}return next;}
  function move(user_id,x,z,y,motion){
    // Deactivation can emit a final position after the campaign has closed.
    if(!ctx||!current)return;
    return request('/'+current.id+'/position','PUT',{user_id,x,z,y,motion}).then(()=>true).catch(e=>{status(e.message);return false;});
  }
  async function openConnectedMap(id,nodeId){try{status('Opening map…');await window.MapWorkspace.openMap(id,nodeId);}catch(e){status(e.message);}}
  async function sync(){if(!ctx||!visible||document.hidden||busy||saving||Object.keys(pending).length)return;busy=true;const generation=epoch,selection=navigation;try{
    const list=await request('');if(generation!==epoch||selection!==navigation)return;mapChoices=list.maps;$('#mapNewKind').text((list.map_kind||list.maps[0]?.kind||'').toUpperCase()+' map');$('#mapKindNotice').text(list.archived_map_count?list.archived_map_count+' older maps of the other type are preserved but hidden.':'');const shownMapId=ctx.dm?list.active_map_id:list.viewer_map_id;
    const select=$('#mapWorkspaceSelect')[0],signature=JSON.stringify(list.maps.map(m=>[m.id,m.title,m.kind]));if(select.dataset.signature!==signature){select.replaceChildren();list.maps.forEach(m=>select.add(new Option(m.title+' · '+m.kind.toUpperCase(),m.id)));select.dataset.signature=signature;}select.value=shownMapId;
    const next=await request('/'+shownMapId);if(generation!==epoch||selection!==navigation||saving||Object.keys(pending).length||(current?.id===next.id&&next.revision<current.revision))return;
    if(!current||current.id!==next.id){current=next;configure();status('');}else{const previousState=current.state,changed=next.revision!==current.revision||JSON.stringify((next.state.nodes||[]).map(n=>[n.id,n.money_cp,n.contents,n.marker_card,n.met]))!==JSON.stringify((current.state.nodes||[]).map(n=>[n.id,n.money_cp,n.contents,n.marker_card,n.met]));current=next;renderCharacterPalette();$('#mapFullscreenTitle').text(current.title+' · '+current.kind.toUpperCase());MapScene.update(next.state.scene||{});if(changed){Object.keys({location:0,...enums,mood:0}).forEach(k=>{const input=$(`[data-scene="${k}"]`)[0];if(input!==document.activeElement)input.value=(next.state.scene||{})[k]||defaults[k]||'';});}if(current.kind==='2d')Map2D.sync({players:next.players,...(changed?Object.fromEntries(['nodes','folders','canvas'].filter(k=>JSON.stringify(previousState[k])!==JSON.stringify(next.state[k])).map(k=>[k,next.state[k]||(k==='canvas'?{}:[])])): {})});else campaignMap.setSharedState({...next.state,players:next.players,npcs:next.npcs});}
  }catch(e){status(e.message);}finally{busy=false;}}
  window.MapWorkspace={refreshPanels,async openMap(id,nodeId){
    if(!ctx)return false;
    const context=ctx,generation=epoch,fromMapId=current?.id;
    const selection=++navigation;arrivalFocus=null;
    Map2D.stopMovement?.();
    await flush();
    if(ctx!==context||epoch!==generation)return false;
    const list=await request('');
    if(ctx!==context||epoch!==generation)return false;
    if(ctx.dm&&!list.maps.some(map=>map.id===Number(id)))throw Error('This map is no longer available.');
    if(!ctx.dm&&!nodeId)throw Error('Use a connected map part to travel to this location.');
    if(selection!==navigation)return false;
    await request('/'+Number(id)+(ctx.dm?'/activate':'/visit'),'PUT',ctx.dm?{}:{node_id:nodeId,from_map_id:fromMapId});
    if(ctx!==context||epoch!==generation||selection!==navigation)return false;
    if(nodeId&&fromMapId&&fromMapId!==Number(id))arrivalFocus={mapId:Number(id),fromMapId,navigation:selection};
    mapChoices=list.maps;mode='story';
    await sync();
    return ctx===context&&epoch===generation;
  },refreshRecords(){
    if(!ctx)return;
    ctx.campaign=ctx.getRecords().find(r=>r.id===ctx.campaign.id)||ctx.campaign;
    if(current?.kind==='2d')Map2D.refreshRecords();
    if(!document.activeElement?.closest('#mapPlayerInventory input,#mapPlayerInventory select,#mapPlayerAbilities input'))renderPlayerPanels();
  },trade:tradeContents,openPanel(side){if(!['left','right'].includes(side))return;panelOpen[side]=true;if(compactPanels.matches)panelOpen[side==='left'?'right':'left']=false;refreshPanels();},start(options){this.stop();ctx={...options,dm:options.campaign.membership_role==='creator'};visible=true;mode='story';$('#mapWorkspaceDM').toggle(ctx.dm);$('#mapWorkspaceSelect').prop('disabled',!ctx.dm);paintVisibility();sync();timer=setInterval(sync,compactPanels.matches?1500:900);},setVisible(v){if(!v)Map2D.stopMovement?.();visible=v;paintVisibility();},stop(){MapStats.close();Map2D.stopMovement?.();Map2D.closeContents?.();inspectedPlayer=null;epoch++;mapChoices=[];navigation++;arrivalFocus=null;clearInterval(timer);ctx=null;current=null;pending={};busy=false;visible=false;$('#inventoryDicePanel').appendTo('.inventory-rail').prop('hidden',true);$('#mapStoryDiceHost').prop('hidden',true);$('#mapStoryFields').prop('hidden',false);$('#mapStoryDiceToggle').attr('aria-expanded','false').text('Scene ▸ Dice');paintVisibility();},async addIcon(icon){queue({icons:[...(current.state.icons||[]),icon]});await flush();ctx.onIcons({map_icons:current.state.icons});campaignMap.setIcons(current.state.icons);},get active(){return !!ctx;},get kind(){return current?.kind;}};
  $(init);
})();
