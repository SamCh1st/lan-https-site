/* Top-down tabletop: SVG terrain, object layers and shared character tokens. */
(function () {
  'use strict';
  const NS='http://www.w3.org/2000/svg';
  let svg, layer, tokens, handles, options={}, nodes=[], players=[], selected=null, tool='select', partCardId=null, history=[], future=[], drag=null, view=[-600,-400,1200,800],canvasSettings={},background,grid,space=false,selectedIds=new Set(),clipboard=[],inspectorKey='',marquee,clickCandidate=null,drawFrame=0,folders=[],openContentsId=null,buildingSmoothTimer=null,buildingMaskShapes=null,buildingMaskKey='',buildingMaskRevision=0;
  function armBuildingSmoothing(){
    clearTimeout(buildingSmoothTimer);if(!drag||!['outline','interior-wall'].includes(drag.kind))return;drag.smoothPass=0;
    const stroke=drag,tick=()=>{if(drag!==stroke)return;const points=stroke.kind==='outline'?stroke.n.draft_outline:stroke.points;if(points.length>3){const softened=MapBuildingCurves.smoothLine(points,3+stroke.smoothPass*2);points.splice(0,points.length,...softened);scheduleDraw();}if(++stroke.smoothPass<3)buildingSmoothTimer=setTimeout(tick,600);};buildingSmoothTimer=setTimeout(tick,600);
  }
  let viewDrawOnly=false,ambienceSettleTimer=0,renderNodes=[];
  const isLocked=n=>MapFolderBatch.locked(n,folders);
  const characterScalePreviews=new Map();
  function playerImageScale(player){
    const saved=(options.getRecords?.()||[]).find(r=>Number(r.id)===Number(player.character_id)&&r.content?.category==='character')?.content?.map_image_scale;
    return CharacterImageScale.value(characterScalePreviews.get(Number(player.character_id))??saved??player.character_image_scale);
  }
  let selectedPlayerId=null,hoverTile=null,hoverLayer=null,hoverKey='',hoverPointer=null,hoverTimer=0,hoverPart=null;
  const playerById=id=>players.find(p=>Number(p.id)===Number(id));
  const controlledPlayer=()=>playerById(options.dm?selectedPlayerId:options.viewerId);
  const canWalk=()=>!!controlledPlayer()&&(!options.edit||tool==='select');
  function walkStatus(message){for(const id of ['mapWorkspaceStatus','mapFullscreenStatus']){const el=document.getElementById(id);if(el)el.textContent=message||'';}}
  function playerCharacter(player){return (options.getRecords?.()||[]).find(r=>r.content?.category==='character'&&(Number(r.id)===Number(player?.character_id)||Number(r.content.owner_user_id)===Number(player?.id)));}
  function playerRange(player){const value=Number(playerCharacter(player)?.content?.tabletop?.interaction_range??5);return Number.isFinite(value)?Math.max(0,Math.min(50,value)):5;}
  const hasAction=n=>!!n&&(n.needs_item||n.needs_roll||!!n.contents?.length||!!n.money_cp||MapTrade.people.includes(n.type)||!!n.connected_map_id||!!n.card_id&&['npc','encounter','shop'].includes(n.type));
  function clearTileHover(){hoverKey='';hoverTile?.setAttribute('visibility','hidden');}
  function highlightPart(part){if(part===hoverPart)return;hoverPart?.classList.remove('map-part-clickable-hover');hoverPart=part;hoverPart?.classList.add('map-part-clickable-hover');}
  function clearHover(){clearTileHover();highlightPart(null);}
  function movementHover(){if(!hoverPointer||hoverTimer)return;hoverTimer=setTimeout(()=>{hoverTimer=0;if(hoverPointer)updateHover(hoverPointer);},80);}
  function updateHover(event){
    hoverPointer={clientX:event.clientX,clientY:event.clientY};const target=document.elementFromPoint(event.clientX,event.clientY),player=controlledPlayer();
    const element=target?.closest('[data-node]'),part=nodes.find(n=>n.id===element?.dataset.node),action=hasAction(part);
    const selectable=options.edit&&tool==='select'&&!player&&part&&!isLocked(part);
    const actionable=action&&(!options.edit||tool==='select')&&interactionRange(part).allowed;
    highlightPart(!drag&&!space&&target&&svg.contains(target)&&part&&!part.hidden&&(selectable||actionable)?element:null);
    if(!canWalk()||drag||space||!target||!svg.contains(target)||target.closest('[data-player]')||action){clearTileHover();return;}
    const p=point(event),goal=[Math.floor(p.x/40),Math.floor(p.y/40)],range=playerRange(player),key=[player.id,Math.round(player.x*4),Math.round(player.z*4),...goal,range].join(':');
    if(Math.max(Math.abs(goal[0]-player.x),Math.abs(goal[1]-player.z))>range){clearHover();return;}if(key===hoverKey)return;
    if(Number(hoverTile.dataset.tileX)!==goal[0]||Number(hoverTile.dataset.tileZ)!==goal[1])clearHover();hoverKey=key;
    MapTokenWalk.plan(player.id,goal,range).then(result=>{if(key!==hoverKey)return;if(!result.path.length){clearHover();return;}for(const [k,v] of Object.entries({x:goal[0]*40+2,y:goal[1]*40+2,width:36,height:36,visibility:'visible','data-tile-x':goal[0],'data-tile-z':goal[1]}))hoverTile.setAttribute(k,v);});
  }
  function selectPlayer(player){selectedPlayerId=player?.id??null;pick(null);options.onPlayerSelect?.(player||null);clearHover();scheduleDraw(true);}
  async function placeCharacter(id,position){
    if(!options.dm||!options.edit)return;
    const player=playerById(id);if(!player)return;
    const x=Math.max(-100,Math.min(100,Math.floor(position.x/40))),z=Math.max(-100,Math.min(100,Math.floor(position.y/40)));
    MapTokenWalk.stop();await MapTokenWalk.flush();
    try{const saved=await options.onPositionChange?.(id,x,z,0,'idle');if(saved===false)return;Object.assign(player,{x,z,placed:true,motion:'idle'});selectPlayer(player);walkStatus('Player placed. Use Move player to this map to bring them here.');}
    catch(error){walkStatus(error.message);}
  }
  function posePlayer(id,x,z,motion){const player=playerById(id);if(!player)return;Object.assign(player,{x,z,motion});const token=tokens.querySelector('[data-player="'+Number(id)+'"]');if(token){token.setAttribute('transform',`translate(${x*40+20} ${z*40+20})`);token.dataset.motion=motion;}const radius=17*playerImageScale(player);MapLighting.moveToken('character-token-'+id,x*40+20-radius,z*40+20-radius);MapLighting.flushMovement();movementHover();}
  function configureWalking(){MapTokenWalk.configure({nodes,walkable:[...MapCatalog.groups.terrain,...MapArt.ambience],player:playerById,pose:posePlayer,send:options.onPositionChange,status:walkStatus,path:path=>{svg.dataset.walkPath=JSON.stringify(path);},finish:()=>{scheduleDraw();if(hoverPointer)updateHover(hoverPointer);}});}
  function allowInteraction(n){const reach=interactionRange(n);if(!reach.allowed){closeContents();walkStatus(reach.message);return false;}return true;}
  let openingPart=false,openingGeneration=0;
  const openingGrants=new Set();
  const grantKey=n=>JSON.stringify([n.id,controlledPlayer()?.id,...MapOpeningSettings.fields.map(k=>n[k]??MapOpeningSettings.defaults[k])]);
  async function activatePart(n){
    MapTokenWalk.stop();if(!allowInteraction(n))return;await MapTokenWalk.flush();if(!nodes.includes(n))return;
    if(openingPart)return;const generation=openingGeneration,actor=controlledPlayer();openingPart=true;
    try{if((n.needs_item||n.needs_roll)&&(!options.dm||actor)){
      if(!options.onCheckOpen)throw Error('Opening checks are unavailable. Refresh the map.');
      closeContents();const key=grantKey(n);let result=await options.onCheckOpen(n,actor,false);
      if(generation!==openingGeneration||actor?.id!==controlledPlayer()?.id)return;
      if(!result.allowed&&result.needs_roll){const passed=await MapOpenRoll.request({title:n.label||n.part_name||MapCatalog.label(n.type),settings:result.settings,roll:async(mode='normal')=>{if(!allowInteraction(n))throw Error('Move closer before rolling.');return options.onCheckOpen(n,actor,true,mode);}});if(!passed)return;result={allowed:true};}
      n=nodes.find(part=>part.id===n.id);if(!n||generation!==openingGeneration||key!==grantKey(n)||!allowInteraction(n))return;
      if(!result.allowed)return;openingGrants.add(key);
    }
    if(!options.dm&&n.card_id&&['npc','encounter','shop'].includes(n.type)){await options.onMeet?.(n);nodes.filter(v=>v.card_id===n.card_id).forEach(v=>v.met=true);draw();showContents(n);}else if(n.contents?.length||n.money_cp||MapTrade.people.includes(n.type))showContents(n);else if(n.connected_map_id)options.onOpenMap?.(n.connected_map_id,n.id);else if(n.needs_item||n.needs_roll)walkStatus('Opened '+(n.label||n.part_name||MapCatalog.label(n.type))+'.');}catch(error){walkStatus(error.message);}finally{openingPart=false;}
  }

  function scheduleDraw(viewOnly=false){viewDrawOnly=drawFrame?viewDrawOnly&&viewOnly:viewOnly;if(!drawFrame)drawFrame=requestAnimationFrame(()=>{const onlyView=viewDrawOnly;drawFrame=0;draw(onlyView);});}
  const colors={...MapArt.colors,...Object.fromEntries(MapArt.stamps.map(t=>[t,'#977451']))};
  function el(tag,attrs,parent){const n=document.createElementNS(NS,tag);Object.entries(attrs||{}).forEach(([k,v])=>n.setAttribute(k,v));if(parent)parent.append(n);return n;}
  function point(e){const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());}
  function gridSnap(v){return Math.round(v/40)*40;}
  function pick(id,extend=false){if(!extend)selectedIds.clear();if(id){if(extend&&selectedIds.has(id))selectedIds.delete(id);else selectedIds.add(id);}selected=[...selectedIds].at(-1)||null;}
  function snap(v){return document.getElementById('map2Snap').checked?Math.round(v/40)*40:v;}
  const snapshot=()=>JSON.stringify({nodes,folders});
  function restore(value){const state=JSON.parse(value);nodes=state.nodes;folders=state.folders;}
  function remember(){history.push(snapshot());if(history.length>80)history.shift();future=[];}
  function savedNodes(){return JSON.parse(JSON.stringify(nodes)).map(n=>n.type==='camera_bounds'?{...n,type:'zone',camera_boundary:true,color:'#cbe9fa'}:n.type==='point_light'?{...n,type:'zone',point_light:true}:n);}
  function loadedNodes(value){return MapAmbience.pack(JSON.parse(JSON.stringify(value||[])).map(n=>n.type==='zone'&&n.camera_boundary===true?{...n,type:'camera_bounds',rotation:0}:n.type==='zone'&&n.point_light===true?{...n,type:'point_light'}:n));}
  function changed(){MapTokenWalk.setScene(nodes);clearHover();draw();options.onChange?.(savedNodes(),JSON.parse(JSON.stringify(folders)));}
  function cameraBoundary(){return nodes.findLast(n=>n.type==='camera_bounds'&&!n.hidden);}
  function queueMaterialDetail(){MapMaterials.view(svg,canvasSettings,()=>{if(window.MapMobileMode){MapMobileRaster.reset();for(const g of layer.children)g._mapKey='';draw();}});}
  let appliedViewKey='',wheelFrame=0,wheelZoom=null;
  function applyView(fit=false){
    if(!svg)return;const box=svg.getBoundingClientRect();if(!box.width||!box.height)return;
    const bounds=!options.edit&&cameraBoundary();
    if(bounds){const ratio=box.width/box.height,maxW=Math.min(bounds.w,bounds.h*ratio),w=fit?maxW:Math.min(view[2],maxW),h=w/ratio;
      const cx=fit?bounds.x+bounds.w/2:view[0]+view[2]/2,cy=fit?bounds.y+bounds.h/2:view[1]+view[3]/2;
      view=[Math.max(bounds.x,Math.min(bounds.x+bounds.w-w,cx-w/2)),Math.max(bounds.y,Math.min(bounds.y+bounds.h-h,cy-h/2)),w,h];
    }
    const appliedKey=[...view,!!bounds,box.left,box.top,box.width,box.height].join(':');if(appliedKey===appliedViewKey)return;appliedViewKey=appliedKey;
    svg.setAttribute('preserveAspectRatio',bounds?'xMidYMid slice':'xMidYMid meet');
    const nextView=view.join(' ');if(hoverLayer){hoverLayer.setAttribute('viewBox',nextView);hoverLayer.setAttribute('preserveAspectRatio',bounds?'xMidYMid slice':'xMidYMid meet');}if(svg.getAttribute('viewBox')!==nextView){clearHover();svg.setAttribute('viewBox',nextView);scheduleDraw(true);clearTimeout(ambienceSettleTimer);ambienceSettleTimer=setTimeout(()=>scheduleDraw(),190);}MapScene.view();queueMaterialDetail();
  }
  function centerOnConnection(mapId){
    const part=nodes.find(n=>!n.hidden&&n.type==='exit_location'&&Number(n.arrival_from_map_id)===Number(mapId))||nodes.find(n=>!n.hidden&&Number(n.connected_map_id)===Number(mapId));
    if(!part)return false;
    view=[part.x+part.w/2-view[2]/2,part.y+part.h/2-view[3]/2,view[2],view[3]];
    applyView();scheduleDraw(true);return true;
  }
  function lightingNodes(){return nodes.map(n=>{const content=markerCard(n)?.content;if(!content?.image_id)return n;const b=CharacterImageScale.bounds(n,content);return {...n,x:n.x+b.x,y:n.y+b.y,w:b.width,h:b.height,shadow_image_id:content.image_id};}).concat(players.filter(p=>(p.present!==false)&&p.character_image_id).map(p=>{const radius=17*playerImageScale(p);return {id:'character-token-'+p.id,type:'character_token',x:p.x*40+20-radius,y:p.z*40+20-radius,w:radius*2,h:radius*2,shadow_image_id:p.character_image_id};}));}
  function removeRendered(g){g._cancelReplacement?.();MapSurfaceLighting.release(g);g.remove();}
  function replaceWhenReady(previous,next){
    previous._cancelReplacement?.();previous.removeAttribute('data-node');previous.style.pointerEvents='none';next.style.visibility='hidden';
    let finished=false,timer;const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);observer.disconnect();delete next._cancelReplacement;removeRendered(previous);next.style.removeProperty('visibility');};
    const check=()=>{if(!next.isConnected){finish();return;}if(next.hasAttribute('data-render-pending')||next.querySelector('[data-render-pending]')||next.querySelector('[data-map-sprite]:not([href])'))return;finish();};
    const observer=new MutationObserver(check);next._cancelReplacement=finish;observer.observe(next,{childList:true,subtree:true,attributes:true});timer=setTimeout(finish,10000);check();
  }

  function draw(viewOnly=false){
    if(drawFrame){cancelAnimationFrame(drawFrame);drawFrame=0;}
    applyView();if(!viewOnly){renderNodes=MapFolderBatch.prepare(nodes.filter(n=>options.edit||n.type!=='exit_location'),folders);MapScene.geometry(lightingNodes(),canvasSettings);
    const footprintNodes=nodes.filter(n=>!n.hidden&&MapArt.buildings.includes(n.type)&&n.building_view!=='exterior'),footprintKey=JSON.stringify(footprintNodes);
    if(footprintKey!==buildingMaskKey){buildingMaskKey=footprintKey;buildingMaskRevision++;buildingMaskShapes.replaceChildren();for(const building of footprintNodes)for(const shape of MapBuildingCurves.world(building))el('path',{d:shape.points.map(([x,y],i)=>(i?'L':'M')+x+' '+y).join(' ')+' Z',fill:'black',stroke:'black','stroke-width':2,'stroke-linejoin':'round'},buildingMaskShapes);}

    }
    MapMobileRaster.prepare(svg,buildingMaskRevision+':'+JSON.stringify(canvasSettings));
    const old=new Map([...layer.children].filter(g=>g.dataset.node).map(g=>[g.dataset.node,g]));
    tokens.replaceChildren();handles.replaceChildren();
    let renderIndex=0,visibleCount=0;const viewport=MapVisibility.viewport(svg,Math.max(480,Math.min(900,svg.clientWidth*.65)));
    renderNodes.forEach(n=>{
      if(n.hidden&&!options.edit||['camera_bounds','point_light'].includes(n.type)&&!options.edit)return;
      const inView=!viewport||MapVisibility.intersects(viewport,MapVisibility.bounds(n)),simpleImage=MapSprites.has(n.type)&&!n.instances&&!n.erasures?.length&&!MapTiledParts.types.includes(n.type);if(!inView&&!simpleImage&&!selectedIds.has(n.id)&&drag?.n!==n)return;if(inView)visibleCount++;
      const card=markerCard(n),cached=old.get(n.id),contentKey=viewOnly&&cached?cached._mapContentKey:JSON.stringify([n,card?.title,card?.content?.image_id,card?.content?.map_image_scale])+':'+options.edit+':'+selectedIds.has(n.id)+':'+((n.type==='fog'||MapEffects.eligible(n))?buildingMaskRevision:0);const key=viewOnly&&cached?cached._mapKey:(n.instances||n.type==='folder_batch'?view.map((v,i)=>Math.round(v/(i<2?80:40))).join(':')+':'+Math.round(svg.clientWidth/80)+':'+Math.round(svg.clientHeight/80):'')+contentKey;old.delete(n.id);
      if(cached&&cached._mapContentKey===contentKey&&(n.instances||n.type==='folder_batch')&&cached._mapKey!==key){cached._mapKey=key;if(n.type==='folder_batch')MapFolderBatch.render(n,cached);else MapArt.renderAmbience(n,cached);}if(cached?._mapKey===key){if(layer.children[renderIndex]!==cached)layer.insertBefore(cached,layer.children[renderIndex]||null);renderIndex++;return;}

      // Edited spline geometry replaces its old footprint immediately; roof images retain a cached preview.
      if(cached&&n.spline_kind)removeRendered(cached);
      const g=el('g',{'data-node':n.id,transform:`translate(${n.x} ${n.y}) rotate(${n.rotation||0} ${n.w/2} ${n.h/2})`,opacity:(n.opacity??1)*(n.hidden?.3:1)},layer);
      if(layer.children[renderIndex]!==g)layer.insertBefore(g,layer.children[renderIndex]||null);renderIndex++;
      const needsMask=n.type==='fog'||MapEffects.eligible(n),outsideId='map-outside-'+n.id.replace(/[^a-zA-Z0-9_-]/g,'');
      if(needsMask){const padding=Math.max(12,Math.min(200,Number(n.brush)||12)),bounds={x:-padding,y:-padding,width:n.w+padding*2,height:n.h+padding*2},defs=el('defs',{},g),mask=el('mask',{id:outsideId,maskUnits:'userSpaceOnUse',...bounds},defs);el('rect',{...bounds,fill:'white'},mask);el('use',{href:'#mapBuildingOcclusion',transform:`rotate(${-Number(n.rotation||0)} ${n.w/2} ${n.h/2}) translate(${-n.x} ${-n.y})`},mask);}
      if(['npc','encounter','shop'].includes(n.type))el('rect',{...(card?.content?.image_id?CharacterImageScale.bounds(n,card.content):{x:0,y:0,width:n.w,height:n.h}),fill:'transparent','pointer-events':'all'},g);
      g._mapKey=key;g._mapContentKey=contentKey;if(n.type==='folder_batch'){MapFolderBatch.render(n,g);}else if(n.type==='point_light'){el('circle',{cx:n.w/2,cy:n.h/2,r:Math.max(n.w,n.h)/2,fill:'none',stroke:n.color||'#ffd58a','stroke-width':2,'stroke-dasharray':'8 6','pointer-events':'none'},g);el('circle',{cx:n.w/2,cy:n.h/2,r:12,fill:n.color||'#ffd58a',stroke:'#fff1c9','stroke-width':2,'pointer-events':'all'},g);}else if(n.type==='camera_bounds'){el('rect',{width:n.w,height:n.h,fill:'none',stroke:'url(#mapCameraChecks)','stroke-width':10,'pointer-events':'stroke','data-camera-border':'true'},g);el('text',{x:10,y:-12,fill:'#cbe9fa','font-size':14,'pointer-events':'none'},g).textContent='Player camera boundary';}else if(!card?.content?.image_id){const artHost=n.type==='fog'?el('g',{mask:'url(#'+outsideId+')'},g):g;MapArt.render(n,artHost);}if(card?.content?.image_id){el('image',{href:'/api/uploads/'+encodeURIComponent(card.content.image_id),...CharacterImageScale.bounds(n,card.content),preserveAspectRatio:'xMidYMid meet'},g);}if(card){el('title',{},g).textContent=card.title;if(!n.label)el('text',{x:n.w/2,y:card.content?.image_id?CharacterImageScale.bounds(n,card.content).y-7:n.h+18,'text-anchor':'middle',fill:'#f3dfac','font-size':15,'pointer-events':'none'},g).textContent=card.title;}if(inView)MapEffects.render(n,needsMask?el('g',{mask:'url(#'+outsideId+')'},g):g,el);if(MapArt.buildings.includes(n.type))MapBuildingCurves.renderWalls(n,g,el);
      if(n.met)el('text',{x:n.w/2,y:-8,'text-anchor':'middle',fill:'#e9d299','font-size':14,'pointer-events':'none'},g).textContent='✓ Met';
      if(n.connected_map_id){g.style.cursor=options.edit?'move':'pointer';const title=el('title',{},g);title.textContent='Open '+((options.getMaps?.()||[]).find(m=>m.id===n.connected_map_id)?.title||'connected map');el('text',{x:n.w-5,y:16,'text-anchor':'end',fill:'#ffe3a3',stroke:'#30291a','stroke-width':2,'paint-order':'stroke','font-size':18,'pointer-events':'none'},g).textContent='↗';}
      if(selectedIds.has(n.id)&&options.edit)el('rect',{width:n.w,height:n.h,fill:'none',stroke:'#ffe1a1','stroke-width':2,'stroke-dasharray':'5 3','pointer-events':'none'},g);
      if(cached&&!n.spline_kind)replaceWhenReady(cached,g);
      if(n.label&&n.type!=='label')el('text',{x:n.w/2,y:card?.content?.image_id?CharacterImageScale.bounds(n,card.content).y-7:n.h+18,'text-anchor':'middle',fill:'#f3dfac','font-family':'Georgia, serif','font-size':15,'pointer-events':'none'},g).textContent=n.label;
    });
    old.forEach(removeRendered);svg.dataset.visibleParts=String(visibleCount);svg.dataset.retainedParts=String(renderIndex);svg.dataset.totalParts=String(nodes.length);
    if(window.MapMobileMode)for(const g of layer.children)MapMobileRaster.bake(null,g);
    players.filter(p=>p.present!==false).forEach(p=>{const radius=17*playerImageScale(p);const g=el('g',{'data-player':p.id,'data-motion':p.motion||'idle',transform:`translate(${p.x*40+20} ${p.z*40+20})`},tokens);const fallback=()=>el('circle',{r:radius,fill:Number(p.id)===Number(options.viewerId)?'#bfa45f':'#6388a3',stroke:'#f6dfb1','stroke-width':2},g);if(p.character_image_id){const portrait=el('image',{x:-radius,y:-radius,width:radius*2,height:radius*2,href:'/api/uploads/'+encodeURIComponent(p.character_image_id),preserveAspectRatio:'xMidYMid meet','data-character-portrait':p.id},g);portrait.addEventListener('error',()=>{portrait.remove();fallback();},{once:true});}else fallback();el('text',{y:-radius-7,'text-anchor':'middle',fill:'#fff','font-size':15,'pointer-events':'none'},g).textContent=p.character_name||p.name||p.username||'Player';});
    const focus=nodes.find(n=>n.id===selected);if(focus&&options.edit&&!isLocked(focus)){const g=el('g',{transform:`translate(${focus.x} ${focus.y}) rotate(${focus.rotation||0} ${focus.w/2} ${focus.h/2})`},handles);for(const [hx,hy,cursor] of [[-1,-1,'nwse'],[0,-1,'ns'],[1,-1,'nesw'],[-1,0,'ew'],[1,0,'ew'],[-1,1,'nesw'],[0,1,'ns'],[1,1,'nwse']])el('rect',{x:(hx+1)*focus.w/2-7,y:(hy+1)*focus.h/2-7,width:14,height:14,fill:'#ffe1a1',stroke:'#443620','stroke-width':1,'data-handle':'resize','data-hx':hx,'data-hy':hy,style:'cursor:'+cursor+'-resize'},g);if(focus.type!=='camera_bounds'){el('line',{x1:focus.w/2,y1:0,x2:focus.w/2,y2:-30,stroke:'#ffe1a1'},g);el('circle',{cx:focus.w/2,cy:-30,r:8,fill:'#ffe1a1','data-handle':'rotate'},g);}}
    MapSplines.controls(nodes.find(n=>n.id===selected),handles);movementHover();if(viewOnly)return;queueMaterialDetail();
    const effectNode=nodes.find(n=>n.id===selected),effectControl=document.getElementById('map2Effects');effectControl.disabled=!options.edit||!MapEffects.eligible(effectNode)||isLocked(effectNode);effectControl.checked=!!effectNode&&effectNode.effects!==false;
    const fog=nodes.find(n=>n.id===selected&&n.type==='fog');document.getElementById('map2FogPanel').hidden=!fog;const fogInput=document.getElementById('map2FogOpacity');fogInput.disabled=!options.edit||isLocked(fog);if(fogInput!==document.activeElement)fogInput.value=fog?Math.round((fog.opacity??1)*100):'';
    document.getElementById('map2RiverFlow').hidden=effectNode?.type!=='river';
    renderLightingControls();
    updateLayerControl();
    if(options.edit)Map2DFolders.render({nodes:nodes.map(n=>{const card=markerCard(n);return {...n,locked:isLocked(n),_hierarchyName:card?.title||'',_hierarchyImage:card?StarterArt.url(card):''};}),folders,selectedIds,selected,edit:options.edit,pick:(id,extend)=>{if(selectedPlayerId)selectPlayer(null);pick(id,extend);draw();svg.focus({preventScroll:true});},selectGroup:id=>{selectedIds=new Set(nodes.filter(n=>MapFolderBatch.belongs(n,id,folders)).map(n=>n.id));selected=[...selectedIds].at(-1)||null;draw();svg.focus({preventScroll:true});},assign:assignFolder,toggleFolderLock,moveFolder,toggleLock:id=>{if(!options.edit)return;const n=nodes.find(n=>n.id===id);if(!n||MapFolderBatch.ancestors(n.folder_id,folders).some(f=>f.locked))return;remember();n.locked=!n.locked;changed();},rename:(id,value)=>{if(!options.edit)return;const f=folders.find(f=>f.id===id),name=value.trim().slice(0,50);if(f&&name&&name!==f.name){remember();f.name=name;changed();}},remove:id=>{if(!options.edit)return;remember();const parent=folders.find(f=>f.id===id)?.parent_id||'';folders=folders.filter(f=>f.id!==id);folders.filter(f=>f.parent_id===id).forEach(f=>f.parent_id=parent);nodes.filter(n=>n.folder_id===id).forEach(n=>n.folder_id=parent);changed();}});
    const n=nodes.find(n=>n.id===selected);document.getElementById('map2TextureScale').hidden=!MapTextureScale.eligible(n);document.getElementById('map2BuildingOptions').hidden=!n||!MapArt.buildings.includes(n.type);document.getElementById('map2WalkOverBuildingHelp').hidden=!n||!MapArt.buildings.includes(n.type);renderContents(n);renderOpening(n);renderConnection(n);renderCard(n);document.querySelectorAll('[data-map2-property]').forEach(input=>{input.disabled=!n||isLocked(n)||(n.type==='camera_bounds'&&input.dataset.map2Property==='rotation');if(input.type==='checkbox'){input.checked=!!n&&(input.dataset.map2Property==='walk_over'?n.walk_over!==false:!!n[input.dataset.map2Property]);return;}if(input!==document.activeElement)input.value=n?(n[input.dataset.map2Property]??({texture_material:MapArt.buildings.includes(n?.type)?n.floor_texture||'wood':n?.spline_texture||'',texture_scale:1,flow_x:0,flow_y:1,height_scale:1,fire_wave:.35,fire_flicker:.35,light_color:MapPartProfiles.lights[n?.type]?.light_color||'#ffd58a',light_intensity:MapPartProfiles.lights[n?.type]?.light_intensity??1,light_softness:.45,shadow_length:1.5,shadow_strength:1}[input.dataset.map2Property]??'')):'';});
  }
  function renderOpening(n){
    const host=document.getElementById('map2OpeningOptions');host.hidden=!n;if(!n)return;
    const form=host.querySelector('.map-opening-settings');MapOpeningSettings.sync(form,n,records(),!options.edit||isLocked(n));
    form.onchange=e=>{if(!options.edit||isLocked(n)||!MapOpeningSettings.fields.includes(e.target.name))return;if(!e.target.checkValidity()){e.target.reportValidity();return;}remember();Object.assign(n,MapOpeningSettings.read(form));changed();};
  }
  function renderLightingControls(){
    const n=nodes.find(n=>n.id===selected),panel=document.getElementById('map2LightOptions');panel.hidden=!MapPartProfiles.isLight(n);document.getElementById('map2FireControls').hidden=!n?.fire_light;document.getElementById('map2FlameColor').hidden=!MapPartProfiles.isLight(n);document.getElementById('map2HeightOptions').hidden=!n||!MapArt.stamps.includes(n.type)||MapPartProfiles.noShadow.has(n.type)||MapPartProfiles.isLight(n);
    const color=document.querySelector('[data-map2-property="color"]').closest('label');if(!color._home){color._home=document.createComment('color control');color.before(color._home);}if(n?.type==='point_light')panel.querySelector('summary').after(color);else color._home.after(color);
    const strength=document.getElementById('map2SunShadowStrength');if(strength!==document.activeElement)strength.value=canvasSettings.sun_shadow_strength??1;strength.onchange=()=>{if(!options.edit)return;canvasSettings.sun_shadow_strength=Math.max(0,Math.min(1,Number(strength.value)||0));draw();options.onCanvasChange?.({...canvasSettings});};
    if(!panel.hidden){const radius=document.getElementById('map2LightRadius');radius.disabled=!options.edit||isLocked(n);if(radius!==document.activeElement)radius.value=n.type==='point_light'?Math.max(n.w,n.h)/2:(n.light_radius??MapPartProfiles.lights[n.type]?.light_radius??160);radius.onchange=()=>{if(!options.edit||isLocked(n))return;const r=Math.max(10,Math.min(5000,Number(radius.value)||200)),cx=n.x+n.w/2,cy=n.y+n.h/2;remember();if(n.type==='point_light'){n.w=n.h=r*2;n.x=cx-r;n.y=cy-r;}else n.light_radius=r;changed();};}
    const sun=document.getElementById('map2SunShadows');if(sun!==document.activeElement)sun.value=canvasSettings.sun_shadow_length??1;sun.onchange=()=>{if(!options.edit)return;canvasSettings.sun_shadow_length=Math.max(0,Math.min(8,Number(sun.value)||0));MapScene.geometry(lightingNodes(),canvasSettings);options.onCanvasChange?.({...canvasSettings});};
  }
  function updateLayerControl(force=false){
    const index=nodes.findIndex(n=>n.id===selected),disabled=!options.edit||index<0||isLocked(nodes[index]),input=document.getElementById('map2LayerNumber');
    input.disabled=disabled;input.max=Math.max(1,nodes.length);if(force||input!==document.activeElement)input.value=index<0?'':index+1;
    document.getElementById('map2LayerUp').disabled=disabled||index===nodes.length-1;
    document.getElementById('map2LayerDown').disabled=disabled||index===0;
  }
  function setLayer(value){
    const index=nodes.findIndex(n=>n.id===selected),n=nodes[index];
    if(!options.edit||!n||isLocked(n))return;
    if(!Number.isFinite(value)){updateLayerControl(true);return;}
    const target=Math.max(0,Math.min(nodes.length-1,Math.round(value)-1));
    if(target===index){updateLayerControl(true);return;}
    remember();nodes.splice(index,1);nodes.splice(target,0,n);changed();updateLayerControl(true);
  }
  function moveFolder(id,parent){if(!options.edit||id===parent||MapFolderBatch.ancestors(parent,folders).some(f=>f.id===id))return;const folder=folders.find(f=>f.id===id);if(!folder)return;remember();folder.parent_id=parent;changed();}
  function toggleFolderLock(id){if(!options.edit)return;const folder=folders.find(f=>f.id===id);if(!folder)return;remember();folder.locked=!folder.locked;if(folder.locked){const members=nodes.filter(n=>MapFolderBatch.belongs(n,id,folders)),last=nodes.findLastIndex(n=>MapFolderBatch.belongs(n,id,folders)),before=nodes.slice(0,last+1).filter(n=>!members.includes(n)),after=nodes.slice(last+1);nodes=[...before,...members,...after];pick(null);}changed();}
  function assignFolder(id,dragged){if(!options.edit||(id&&!folders.some(f=>f.id===id)))return;const ids=dragged&&!selectedIds.has(dragged)?new Set([dragged]):selectedIds,parts=nodes.filter(n=>ids.has(n.id)&&!isLocked(n)&&(n.folder_id||'')!==id);if(!parts.length)return;remember();parts.forEach(n=>n.folder_id=id);changed();}
  function init(){
    document.getElementById('map2TileDraw').onchange=tileDrawControls;
    document.getElementById('map2Effects').onchange=e=>{const n=nodes.find(n=>n.id===selected);if(!options.edit||!n||isLocked(n)||!MapEffects.eligible(n))return;remember();n.effects=e.target.checked;changed();};
    document.getElementById('map2NewFolder').onclick=()=>{if(!options.edit||folders.length>=100)return;const input=document.getElementById('map2FolderName'),name=input.value.trim().slice(0,50)||'New folder';remember();const id=crypto.randomUUID();folders.push({id,name});nodes.filter(n=>selectedIds.has(n.id)&&!isLocked(n)).forEach(n=>n.folder_id=id);input.value='';changed();};
    document.getElementById('map2FolderName').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();document.getElementById('map2NewFolder').click();}};

    document.getElementById('map2BuildingWalls').onchange=e=>{if(e.target.checked)document.getElementById('map2BuildingOutline').checked=false;};
    document.getElementById('map2BuildingOutline').onchange=e=>{if(e.target.checked)document.getElementById('map2BuildingWalls').checked=false;};
    document.getElementById('map2LayerNumber').onchange=e=>setLayer(e.target.value===''?NaN:Number(e.target.value));
    document.getElementById('map2LayerNumber').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();e.target.blur();}};
    document.getElementById('map2LayerUp').onclick=()=>setLayer(nodes.findIndex(n=>n.id===selected)+2);
    document.getElementById('map2LayerDown').onclick=()=>setLayer(nodes.findIndex(n=>n.id===selected));
    svg=document.getElementById('map2Canvas');new ResizeObserver(()=>applyView()).observe(svg);MapArt.defs(svg);MapEffects.defs(svg);
    const defs=el('defs',{},svg),pattern=el('pattern',{id:'map2Grid',width:40,height:40,patternUnits:'userSpaceOnUse'},defs);el('path',{d:'M 40 0 L 0 0 0 40',fill:'none',stroke:'#a89670','stroke-opacity':.22},pattern);
    const checks=el('pattern',{id:'mapCameraChecks',width:12,height:12,patternUnits:'userSpaceOnUse'},defs);el('rect',{width:12,height:12,fill:'#18222b'},checks);el('path',{d:'M0 0h6v6H0zM6 6h6v6H6z',fill:'#d9e9f2'},checks);
    buildingMaskShapes=el('g',{id:'mapBuildingOcclusion'},defs);
    background=el('rect',{x:-4000,y:-4000,width:8000,height:8000,fill:'url(#mapTexture-grass)'},svg);
    layer=el('g',{},svg);grid=el('rect',{x:-4000,y:-4000,width:8000,height:8000,fill:'url(#map2Grid)','pointer-events':'none'},svg);tokens=el('g',{},svg);handles=el('g',{},svg);
    document.getElementById('map2GridVisible').onchange=()=>{canvasSettings.grid=document.getElementById('map2GridVisible').checked;applyCanvas();options.onCanvasChange?.({...canvasSettings});};
    document.getElementById('map2Background').onchange=()=>{canvasSettings.background=document.getElementById('map2Background').value;applyCanvas();options.onCanvasChange?.({...canvasSettings});};
    marquee=el('rect',{fill:'#ddc38a22',stroke:'#e2c278','stroke-dasharray':'6 4','pointer-events':'none',visibility:'hidden'},svg);
    document.getElementById('map2ConnectedMap').onchange=e=>{const n=nodes.find(n=>n.id===selected);if(!n||!options.edit||isLocked(n))return;remember();n[n.type==='exit_location'?'arrival_from_map_id':'connected_map_id']=e.target.value?Number(e.target.value):null;changed();};
    document.getElementById('map2OpenConnection').onclick=()=>{const n=nodes.find(n=>n.id===selected);if(n?.connected_map_id&&allowInteraction(n))options.onOpenMap?.(n.connected_map_id,n.id);};
    document.getElementById('map2ClosePopup').onclick=closeContents;
    document.getElementById('map2ContentsSearch').oninput=()=>{inspectorKey='';renderContents(nodes.find(n=>n.id===selected));};
    document.getElementById('map2CardSelect').onchange=e=>{const n=nodes.find(n=>n.id===selected);if(!options.edit||!n||isLocked(n))return;remember();n.card_id=Number(e.target.value)||null;delete n.marker_card;delete n.met;changed();};
    document.getElementById('map2FogOpacity').onchange=e=>{const n=nodes.find(n=>n.id===selected);if(!n||n.type!=='fog'||!options.edit||isLocked(n))return;remember();const value=Number(e.target.value);n.opacity=Math.max(0,Math.min(100,Number.isFinite(value)?value:100))/100;e.target.value=Math.round(n.opacity*100);changed();};
    document.getElementById('map2RemoveAfterLooting').onchange=e=>{const n=nodes.find(n=>n.id===selected);if(!n||!options.edit||isLocked(n))return;remember();n.remove_after_looting=e.target.checked;changed();};
    document.getElementById('map2ContentsPublic').onchange=e=>{const n=nodes.find(n=>n.id===selected);if(!n||!options.edit)return;remember();n.contents_public=e.target.checked;changed();};
    document.getElementById('map2TextureSeed').onclick=()=>{canvasSettings.texture_seed=Math.floor(Math.random()*999999)+1;applyCanvas();options.onCanvasChange?.({...canvasSettings});};
    for(const [id,key] of [['map2Light','light_angle'],['map2Relief','relief']])document.getElementById(id).onchange=e=>{canvasSettings[key]=Number(e.target.value);applyCanvas();options.onCanvasChange?.({...canvasSettings});};
    hoverLayer=el('svg',{'aria-hidden':'true',style:'position:absolute;inset:0;width:100%;height:100%;z-index:20;pointer-events:none'},document.getElementById('map2Surface'));
    hoverTile=el('rect',{id:'map2WalkHover',fill:'none',stroke:'#ffe1a1','stroke-width':2,rx:3,visibility:'hidden','pointer-events':'none','vector-effect':'non-scaling-stroke',style:'filter:drop-shadow(0 0 4px #d4a44c)'},hoverLayer);
    svg.addEventListener('pointerleave',()=>{hoverPointer=null;clearHover();});
    applyView();
    svg.addEventListener('wheel',e=>{clearHover();e.preventDefault();const factor=e.deltaY>0?1.12:.89,next=(wheelZoom?.factor||1)*factor;if(view[2]*next<160||view[2]*next>8000)return;wheelZoom={clientX:e.clientX,clientY:e.clientY,factor:next};if(!wheelFrame)wheelFrame=requestAnimationFrame(()=>{wheelFrame=0;const input=wheelZoom;wheelZoom=null;if(!input)return;const p=point(input),factor=input.factor;view=[p.x+(view[0]-p.x)*factor,p.y+(view[1]-p.y)*factor,view[2]*factor,view[3]*factor];applyView();});},{passive:false});
    svg.addEventListener('pointerdown',e=>{
      if(![0,1].includes(e.button)||drag)return;clickCandidate=null;e.preventDefault();svg.focus({preventScroll:true});svg.setPointerCapture(e.pointerId);const p=point(e),pid=e.target.closest('[data-player]')?.dataset.player,nid=e.target.closest('[data-node]')?.dataset.node;
      if(e.button===1||space||(options.edit&&tool==='pan')){drag={kind:'pan',x:e.clientX,y:e.clientY,view:[...view],scale:1/svg.getScreenCTM().a};return;}
      if(pid&&(options.dm||Number(pid)===Number(options.viewerId))){MapTokenWalk.stop();const token=playerById(pid);selectPlayer(token);drag={kind:'token',token,x:e.clientX,y:e.clientY,moved:false};return;}
      if(canWalk()&&!e.shiftKey){const player=controlledPlayer(),node=nodes.find(n=>n.id===nid);clearHover();drag={kind:'walk-pan',actor:player.id,goal:[Math.floor(p.x/40),Math.floor(p.y/40)],action:hasAction(node)?node:null,x:e.clientX,y:e.clientY,view:[...view],scale:1/svg.getScreenCTM().a,moved:false};return;}
      if(options.dm&&selectedPlayerId)selectPlayer(null);
      if(options.edit&&tool==='select'&&e.shiftKey&&!e.target.dataset.handle){drag={kind:'marquee',x:p.x,y:p.y,clickX:e.clientX,clickY:e.clientY,clicked:nid||null,moved:false,prior:new Set(selectedIds)};return;}
      if(!options.edit&&nid){const n=nodes.find(n=>n.id===nid);if(options.dm&&n&&!isLocked(n)&&['npc','encounter','shop'].includes(n.type)){remember();pick(n.id);drag={kind:'move',clickX:e.clientX,clickY:e.clientY,clicked:nid,moved:false,x:p.x,y:p.y,originals:[{n,x:n.x,y:n.y}]};return;}if(!options.dm&&n?.card_id&&['npc','encounter','shop'].includes(n.type)){drag={kind:'meet',n,x:e.clientX,y:e.clientY,moved:false};return;}if(n&&(n.contents?.length||n.money_cp||MapTrade.people.includes(n.type))){showContents(n);return;}if(n?.connected_map_id){drag={kind:'link',n,x:e.clientX,y:e.clientY,moved:false};return;}}
      if(options.edit&&tileDrawing()){
        remember();clickCandidate=null;const reverse=document.getElementById('map2Reverse').checked,n=reverse?null:MapPartCards.apply({id:crypto.randomUUID(),type:tool,x:Math.floor(p.x/40)*40,y:Math.floor(p.y/40)*40,w:40,h:40,rotation:0,color:colors[tool],opacity:Number(document.getElementById('map2BrushOpacity').value)/100,label:'',tile_cells:[],tile_base_w:40,tile_base_h:40},partCardId);
        if(n){if(nodes.length>=5000){history.pop();return;}nodes.push(n);pick(n.id);}drag={kind:reverse?'tile-erase':'tile-paint',n,cells:new Set(),last:p};paintTiles(p);draw();return;
      }
      if(options.edit&&!['select','pan'].includes(tool)&&document.getElementById('map2Reverse').checked){remember();drag={kind:'erase',x:p.x,y:p.y,wallOnly:MapArt.buildings.includes(tool)&&document.getElementById('map2BuildingWalls').checked};erase(p);draw();return;}
      if(options.edit&&MapArt.buildings.includes(tool)&&document.getElementById('map2BuildingWalls').checked){const n=nodes.find(n=>n.id===nid&&MapArt.buildings.includes(n.type));if(!n||isLocked(n))return;if((n.interior_walls||[]).length>=100)return;remember();n.wall_base_w??=n.w;n.wall_base_h??=n.h;const points=[MapBuildingCurves.wallPoint(n,p)];(n.interior_walls??=[]).push(points);pick(n.id);drag={kind:'interior-wall',n,points};armBuildingSmoothing();draw();return;}
      const handle=e.target.dataset.handle;if(handle&&options.edit){if(handle==='rotate'&&nodes.find(n=>n.id===selected)?.type==='camera_bounds')return;const n=nodes.find(n=>n.id===selected);remember();drag={kind:handle,n,cx:n.x+n.w/2,cy:n.y+n.h/2,start:p,original:{x:n.x,y:n.y,w:n.w,h:n.h,rotation:n.rotation||0},hx:Number(e.target.dataset.hx)||0,hy:Number(e.target.dataset.hy)||0};return;}
      if(pid&&(options.dm||Number(pid)===Number(options.viewerId))){const token=players.find(p=>Number(p.id)===Number(pid));drag={kind:'token',token};return;}
      if(e.button===1||tool==='pan'||!options.edit){drag={kind:'pan',x:e.clientX,y:e.clientY,view:[...view],scale:1/svg.getScreenCTM().a};return;}
      if(tool==='select'){
        if(nid&&!e.shiftKey&&selectedIds.has(nid)&&!isLocked(nodes.find(n=>n.id===nid))){
          const moving=nodes.filter(n=>selectedIds.has(n.id)&&!isLocked(n));
          drag={kind:'move',deferredHistory:true,clickX:e.clientX,clickY:e.clientY,clicked:nid,moved:false,x:p.x,y:p.y,originals:moving.map(n=>({n,x:n.x,y:n.y}))};
        }else{
          // Only a completed click selects a part; an unselected press-and-drag pans.
          drag={kind:'select-pan',clicked:nid||null,extend:e.shiftKey,moved:false,x:e.clientX,y:e.clientY,view:[...view],scale:1/svg.getScreenCTM().a};
        }
        return;
      }
      if(nodes.length>=5000)return;remember();if(nid)clickCandidate={id:nid,x:e.clientX,y:e.clientY,extend:e.shiftKey,moved:false};
      if(isAmbience()){drag={kind:'scatter',x:p.x,y:p.y};scatter(p);draw();return;}
      const size=Number(document.getElementById('map2BrushSize').value),opacity=Number(document.getElementById('map2BrushOpacity').value)/100;
      const n={id:crypto.randomUUID(),type:tool,x:snap(p.x),y:snap(p.y),w:size,h:size,rotation:0,color:colors[tool],opacity,label:tool==='label'?'New label':''};nodes.push(n);pick(n.id);
      if(MapPartProfiles.lights[tool])Object.assign(n,MapPartProfiles.lights[tool]);
      if(tool==='label'){n.h=40;n.w=220;}
      if(tool==='point_light'){n.w=n.h=400;n.x=snap(p.x)-200;n.y=snap(p.y)-200;n.color='#ffd58a';n.light_intensity=1;n.light_softness=.45;n.shadow_length=1.5;n.shadow_strength=1;n.opacity=1;}
      if(tool==='camera_bounds'){nodes=nodes.filter(v=>v===n||v.type!=='camera_bounds');n.rotation=0;n.w=n.h=40;drag={kind:'boundary',n,x:n.x,y:n.y};}
      else if(MapArt.buildings.includes(tool)){n.x=gridSnap(p.x);n.y=gridSnap(p.y);n.w=n.h=40;n.floor_texture=tool==='hall'?'marble':tool==='ruin'?'cobble':'wood';n.wall_texture=tool==='cottage'?'brick':'stone';n.wall_width=12;drag={kind:'building',n,x:n.x,y:n.y};if(document.getElementById('map2BuildingOutline').checked){n.x=p.x;n.y=p.y;n.draft_outline=[[0,0]];drag={kind:'outline',n};}}
      else if(MapArt.stamps.includes(tool)||tool==='label'){drag={kind:'stamp',n};}
      else if(document.getElementById('map2DrawMode').value==='brush'||['road','river'].includes(tool)){n.x=p.x;n.y=p.y;n.shape='stroke';n.border=document.getElementById('map2BrushBorder').checked||tool==='river';n.softness=Number(document.getElementById('map2BrushSoftness').value)/100;n.brush=size;n.points=[[0,0]];drag={kind:'brush',n};}
      else drag={kind:'size',n};
      MapPartCards.apply(n,partCardId,(MapArt.stamps.includes(tool)||tool==='label')?'brush-size':false);
      armBuildingSmoothing();draw();

    });
    svg.addEventListener('pointermove',e=>{if(!drag){updateHover(e);return;}clearHover();if(drag.kind==='token'){if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>4)drag.moved=true;if(!drag.moved)return;}if(['outline','interior-wall'].includes(drag.kind))armBuildingSmoothing();if(drag.kind==='move'){if(!drag.moved&&Math.hypot(e.clientX-drag.clickX,e.clientY-drag.clickY)>4){if(drag.deferredHistory)remember();drag.moved=true;}if(!drag.moved)return;}if(clickCandidate&&Math.hypot(e.clientX-clickCandidate.x,e.clientY-clickCandidate.y)>4)clickCandidate.moved=true;const p=point(e);if(['tile-paint','tile-erase'].includes(drag.kind)){paintTiles(p);scheduleDraw();return;}if(['link','meet'].includes(drag.kind)){if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5)drag.moved=true;return;}if(['select-pan','walk-pan'].includes(drag.kind)){if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>4)drag.moved=true;if(!drag.moved)return;}if(['pan','select-pan','walk-pan'].includes(drag.kind)){view[0]=drag.view[0]-(e.clientX-drag.x)*drag.scale;view[1]=drag.view[1]-(e.clientY-drag.y)*drag.scale;applyView();return;}if(drag.kind==='marquee'){if(!drag.moved&&Math.hypot(e.clientX-drag.clickX,e.clientY-drag.clickY)<=4)return;drag.moved=true;const x=Math.min(drag.x,p.x),y=Math.min(drag.y,p.y),w=Math.abs(p.x-drag.x),h=Math.abs(p.y-drag.y);Object.entries({x,y,width:w,height:h,visibility:'visible'}).forEach(([k,v])=>marquee.setAttribute(k,v));selectedIds=new Set(drag.prior);nodes.forEach(n=>{const a=(n.rotation||0)*Math.PI/180,pts=[[0,0],[n.w,0],[0,n.h],[n.w,n.h]].map(([xx,yy])=>[n.x+n.w/2+(xx-n.w/2)*Math.cos(a)-(yy-n.h/2)*Math.sin(a),n.y+n.h/2+(xx-n.w/2)*Math.sin(a)+(yy-n.h/2)*Math.cos(a)]);if(pts.every(([xx,yy])=>xx>=x&&xx<=x+w&&yy>=y&&yy<=y+h))selectedIds.add(n.id);});selected=[...selectedIds].at(-1)||null;}else if(drag.kind==='erase'){const distance=Math.hypot(p.x-drag.x,p.y-drag.y),step=Math.max(2,Number(document.getElementById('map2BrushSize').value)/4),count=Math.ceil(distance/step);for(let i=1;i<=count;i++)erase({x:drag.x+(p.x-drag.x)*i/count,y:drag.y+(p.y-drag.y)*i/count});drag.x=p.x;drag.y=p.y;}else if(drag.kind==='scatter'){if(Math.hypot(p.x-drag.x,p.y-drag.y)>Number(document.getElementById('map2BrushSize').value)*.23){scatter(p);drag.x=p.x;drag.y=p.y;}}else if(drag.kind==='interior-wall'){const q=MapBuildingCurves.wallPoint(drag.n,p),last=drag.points.at(-1);if(Math.hypot(q[0]-last[0],q[1]-last[1])>3&&drag.points.length<1000)drag.points.push(q);}else if(drag.kind==='outline'){const last=drag.n.draft_outline.at(-1),next=[p.x-drag.n.x,p.y-drag.n.y];if(Math.hypot(next[0]-last[0],next[1]-last[1])>3&&drag.n.draft_outline.length<2000)drag.n.draft_outline.push(next);}else if(['building','boundary'].includes(drag.kind)){const x=gridSnap(p.x),y=gridSnap(p.y);drag.n.x=Math.min(drag.x,x);drag.n.y=Math.min(drag.y,y);drag.n.w=Math.max(40,Math.abs(x-drag.x));drag.n.h=Math.max(40,Math.abs(y-drag.y));}else if(drag.kind==='brush'){const last=drag.n.points.at(-1),x=p.x-drag.n.x,y=p.y-drag.n.y;if(Math.hypot(x-last[0],y-last[1])>4&&drag.n.points.length<2000)drag.n.points.push([x,y]);}else if(drag.kind==='stamp'){drag.n.x=snap(p.x);drag.n.y=snap(p.y);}else if(drag.kind==='rotate'){drag.n.rotation=Math.round(Math.atan2(p.y-(drag.n.y+drag.n.h/2),p.x-(drag.n.x+drag.n.w/2))*180/Math.PI+90);}else if(drag.kind==='resize'){const o=drag.original,a=o.rotation*Math.PI/180,dx=p.x-drag.start.x,dy=p.y-drag.start.y,lx=dx*Math.cos(a)+dy*Math.sin(a),ly=-dx*Math.sin(a)+dy*Math.cos(a),minimum=MapArt.buildings.includes(drag.n.type)?40:10;
      let w=drag.hx?Math.max(minimum,snap(o.w+drag.hx*lx)):o.w,h=drag.hy?Math.max(minimum,snap(o.h+drag.hy*ly)):o.h;if(e.shiftKey){if(drag.hx)h=w*o.h/o.w;else w=h*o.w/o.h;}
      const ox=drag.hx*(w-o.w)/2,oy=drag.hy*(h-o.h)/2;Object.assign(drag.n,{w,h,x:drag.cx+ox*Math.cos(a)-oy*Math.sin(a)-w/2,y:drag.cy+ox*Math.sin(a)+oy*Math.cos(a)-h/2});
}else if(drag.kind==='token'){drag.token.x=Math.max(-100,Math.min(100,(document.getElementById('map2Snap').checked?Math.floor(p.x/40):p.x/40-.5)));drag.token.z=Math.max(-100,Math.min(100,(document.getElementById('map2Snap').checked?Math.floor(p.y/40):p.y/40-.5)));}else if(drag.kind==='move'){const dx=snap(p.x-drag.x),dy=snap(p.y-drag.y);drag.originals.forEach(o=>{o.n.x=o.x+dx;o.n.y=o.y+dy;});}else{drag.n.w=Math.max(40,snap(p.x-drag.n.x));drag.n.h=Math.max(40,snap(p.y-drag.n.y));}scheduleDraw();});
    function end(e){clearTimeout(buildingSmoothTimer);if(!drag)return;const d=drag;drag=null;
      if(['tile-paint','tile-erase'].includes(d.kind)){if(e?.type==='pointercancel')restore(history.pop());else{nodes=nodes.filter(n=>!n.tile_cells||n.tile_cells.length);if(d.kind==='tile-paint')nodes=MapTilePaint.merge(nodes,d.n,isLocked);}changed();return;}
      if(d.kind==='walk-pan'){if(!d.moved&&e?.type!=='pointercancel'){if(d.action)activatePart(d.action);else{closeContents();MapTokenWalk.go(d.actor,d.goal,playerRange(playerById(d.actor)));}}return;}
      if(d.kind==='token'&&!d.moved)return;
      if(d.kind==='marquee'){marquee.setAttribute('visibility','hidden');if(e?.type==='pointercancel'){selectedIds=new Set(d.prior);selected=[...selectedIds].at(-1)||null;}else if(!d.moved&&d.clicked)pick(d.clicked,true);draw();return;}
      if(d.kind==='select-pan'){
        if(!d.moved&&e?.type!=='pointercancel'){
          pick(d.clicked,d.extend);draw();const clicked=nodes.find(n=>n.id===d.clicked);
          if(clicked&&(clicked.contents?.length||clicked.money_cp||MapTrade.people.includes(clicked.type)))showContents(clicked);
        }
        return;
      }
      if(d.kind==='move'&&d.deferredHistory&&!d.moved){
        if(e?.type!=='pointercancel'){const clicked=nodes.find(n=>n.id===d.clicked);if(clicked&&(clicked.contents?.length||clicked.money_cp||MapTrade.people.includes(clicked.type)))showContents(clicked);}
        return;
      }
      if(d.kind==='meet'){if(!d.moved&&e?.type!=='pointercancel')Promise.resolve(options.onMeet?.(d.n)).then(()=>{nodes.filter(n=>n.card_id===d.n.card_id).forEach(n=>n.met=true);draw();showContents(d.n);}).catch(e=>{document.getElementById('mapWorkspaceStatus').textContent=e.message;});return;}if(d.kind==='link'){if(!d.moved&&e?.type!=='pointercancel')options.onOpenMap?.(d.n.connected_map_id,d.n.id);return;}if(clickCandidate&&!clickCandidate.moved&&e?.type!=='pointercancel'){restore(history.pop());pick(clickCandidate.id,clickCandidate.extend);const clicked=nodes.find(n=>n.id===clickCandidate.id);clickCandidate=null;draw();if(clicked&&(clicked.contents?.length||clicked.money_cp||MapTrade.people.includes(clicked.type)))showContents(clicked);return;}clickCandidate=null;marquee.setAttribute('visibility','hidden');if(e?.type==='pointercancel'){if(!['pan','marquee','token'].includes(d.kind)&&history.length){restore(history.pop());draw();}return;}if(d.kind==='interior-wall'&&d.points.length<2){restore(history.pop());draw();return;}if(d.kind==='outline'){const shape=MapBuildings.outline(d.n.draft_outline.map(([x,y])=>[x+d.n.x,y+d.n.y]),d.n.type,nodes.filter(n=>n!==d.n));if(!shape){restore(history.pop());pick(null);draw();document.getElementById('map2ToolName').textContent='Close the outline, or connect both ends to the same building';return;}delete d.n.draft_outline;Object.assign(d.n,shape);(d.n.building_shapes||d.n.rooms).forEach(r=>Object.assign(r,{floor_texture:d.n.floor_texture,wall_texture:d.n.wall_texture,wall_width:d.n.wall_width}));}if(d.kind==='brush'){const xs=d.n.points.map(p=>p[0]),ys=d.n.points.map(p=>p[1]),minX=Math.min(...xs)-d.n.brush/2,minY=Math.min(...ys)-d.n.brush/2;d.n.w=Math.max(...xs)-minX+d.n.brush/2;d.n.h=Math.max(...ys)-minY+d.n.brush/2;d.n.baseW=d.n.w;d.n.baseH=d.n.h;d.n.x+=minX;d.n.y+=minY;d.n.points=d.n.points.map(p=>[p[0]-minX,p[1]-minY]);nodes=MapBrushes.merge(nodes,d.n);}if(['building','outline','move','resize','rotate'].includes(d.kind)){for(const id of [...selectedIds]){const n=nodes.find(n=>n.id===id);if(n)nodes=MapBuildings.merge(nodes,n);}selectedIds=new Set([...selectedIds].filter(id=>nodes.some(n=>n.id===id)));selected=[...selectedIds].at(-1)||null;}if(d.kind==='move'&&!d.moved){const clicked=nodes.find(n=>n.id===d.clicked);if(clicked&&(clicked.contents?.length||clicked.money_cp||MapTrade.people.includes(clicked.type)))showContents(clicked);}if(d.kind==='token')MapTokenWalk.place(d.token.id,d.token.x,d.token.z,'idle');else if(!['pan','marquee'].includes(d.kind))changed();}
    svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);
    document.getElementById('map2Tools').addEventListener('click',event=>{const b=event.target.closest('[data-map2-tool]');if(!b)return;if(!['select','pan'].includes(b.dataset.map2Tool)&&selectedPlayerId)selectPlayer(null);partCardId=Number(b.dataset.partCard)||null;const previousStamp=MapArt.stamps.includes(tool),nextStamp=MapArt.stamps.includes(b.dataset.map2Tool);if(previousStamp!==nextStamp){document.getElementById('map2BrushSize').value=nextStamp?80:160;document.getElementById('map2SizeValue').textContent=nextStamp?'80':'160';}tool=b.dataset.map2Tool;tileDrawControls();const card=MapPartCards.find(partCardId);if(card){const size=document.getElementById('map2BrushSize');size.max=Math.max(320,card.content.part_width);size.value=card.content.part_width;document.getElementById('map2SizeValue').textContent=size.value;}document.getElementById('map2OutlineOption').hidden=!MapArt.buildings.includes(tool);document.getElementById('map2OutlineHelp').hidden=!MapArt.buildings.includes(tool);document.getElementById('map2WallOption').hidden=!MapArt.buildings.includes(tool);svg.style.cursor=tool==='pan'?'grab':'crosshair';document.getElementById('map2DrawMode').parentElement.hidden=MapArt.stamps.includes(tool)||['label','select','pan','camera_bounds'].includes(tool);document.getElementById('map2ToolName').textContent=tool==='select'?'Click a part to select; drag it to move. Drag elsewhere to pan. Shift-drag to box-select.':tool==='pan'?'Pan the canvas':tool==='camera_bounds'?'Player camera boundary · drag a rectangle':(MapPartCards.find(partCardId)?.title||MapCatalog.label(tool))+' · '+(MapArt.ambience.includes(tool)?'scatter brush':MapArt.stamps.includes(tool)?'stamp':tool==='label'?'text':'brush');document.querySelectorAll('[data-map2-tool]').forEach(x=>x.classList.toggle('active',x.dataset.map2Tool===tool&&(Number(x.dataset.partCard)||null)===partCardId));});
    const textureSize=document.createElement('label');textureSize.id='map2TextureScale';textureSize.hidden=true;textureSize.innerHTML='Material<select data-map2-property="texture_material"><option value="">Original material</option>'+MapMaterials.names.map(t=>'<option value="'+t+'">'+t+'</option>').join('')+'</select>Texture size<input type="number" min="0.1" max="4" step="0.1" value="1" data-map2-property="texture_scale"><small>1 = normal. Smaller values make finer repeats.</small>';document.getElementById('map2ObjectHalfBody').prepend(textureSize);
    const walkOver=document.createElement('label');walkOver.className='map2-check';walkOver.innerHTML='<input type="checkbox" data-map2-property="walk_over" checked> Walk over';document.getElementById('map2ObjectHalfBody').prepend(walkOver);const walkHelp=document.createElement('small');walkHelp.id='map2WalkOverBuildingHelp';walkHelp.hidden=true;walkHelp.textContent='Allows walking on the floor. Walls stay blocked; use doorways to enter.';walkOver.after(walkHelp);
    document.querySelectorAll('[data-map2-property]').forEach(input=>input.onchange=()=>{const n=nodes.find(n=>n.id===selected);if(!n||!options.edit||isLocked(n))return;remember();const k=input.dataset.map2Property;n[k]=input.type==='checkbox'?input.checked:['label','color','light_color','floor_texture','wall_texture','texture_material'].includes(k)?input.value:Number(input.value)||0;if(k==='texture_material'&&MapArt.buildings.includes(n.type)){n.floor_texture=n[k]||n.floor_texture;(n.building_shapes||n.rooms||[]).forEach(r=>r.floor_texture=n.floor_texture);delete n.texture_material;}else if(k==='texture_material'&&n.spline_kind){n.spline_texture=n[k]||n.spline_texture;delete n.texture_material;}if(k==='label'&&n.type==='label')n.w=Math.max(80,Math.round(n.label.length*n.h*.42));if(k==='w'||k==='h')n[k]=Math.max(10,Math.min(10000,n[k]));if(['floor_texture','wall_texture','wall_width'].includes(k))(n.building_shapes||n.rooms||[]).forEach(r=>r[k]=n[k]);if(k==='rotation'&&n.type==='camera_bounds')n[k]=0;else if(k==='rotation')n[k]=((n[k]%360)+360)%360;if(k==='light_intensity'||k==='shadow_strength'||k==='light_softness'||k==='fire_wave'||k==='fire_flicker')n[k]=Math.max(0,Math.min(1,n[k]));if(k==='flow_x'||k==='flow_y')n[k]=Math.max(-2,Math.min(2,n[k]));if(k==='texture_scale')n[k]=Math.max(.1,Math.min(4,n[k]));if(k==='height_scale')n[k]=Math.max(0,Math.min(4,n[k]));if(k==='shadow_length')n[k]=Math.max(0,Math.min(8,n[k]));if(k==='wall_width')n[k]=Math.max(4,Math.min(32,n[k]));if(k==='opacity')n[k]=Math.max(n.type==='fog'?0:.05,Math.min(1,n[k]));changed();});
    document.querySelectorAll('[data-map2-action]').forEach(b=>b.onclick=()=>action(b.dataset.map2Action));
    svg.addEventListener('dblclick',e=>{const id=e.target.closest('[data-node]')?.dataset.node;const n=nodes.find(n=>n.id===id);if(n&&options.dm&&!controlledPlayer())showContents(n);});
    document.querySelectorAll('#map2FireControls input').forEach(input=>input.oninput=()=>input.onchange());
    document.getElementById('map2Tools').addEventListener('dragstart',e=>{const player=e.target.closest('[data-map2-player]');if(player){e.dataTransfer.setData('application/x-tabletop-player',player.dataset.map2Player);e.dataTransfer.effectAllowed='copy';return;}const b=e.target.closest('[data-map2-tool]');if(!b)return;e.dataTransfer.setData('application/x-tabletop-stamp',b.dataset.map2Tool);e.dataTransfer.setData('application/x-tabletop-part-card',b.dataset.partCard||'');e.dataTransfer.effectAllowed='copy';});
    svg.addEventListener('dragover',e=>{if(options.edit&&(e.dataTransfer.types.includes('application/x-tabletop-stamp')||e.dataTransfer.types.includes('application/x-tabletop-player')))e.preventDefault();});
    svg.addEventListener('drop',e=>{if(!options.edit)return;e.preventDefault();const playerId=Number(e.dataTransfer.getData('application/x-tabletop-player'));if(playerId){placeCharacter(playerId,point(e));return;}if(nodes.length>=5000)return;const type=e.dataTransfer.getData('application/x-tabletop-stamp');if(!MapArt.stamps.includes(type)&&type!=='label'&&!MapArt.buildings.includes(type))return;remember();const p=point(e),n={id:crypto.randomUUID(),type,x:snap(p.x),y:snap(p.y),w:80,h:80,color:colors[type]||'#977451',rotation:0,opacity:1,label:type==='label'?'New label':''};if(MapArt.buildings.includes(type))Object.assign(n,{w:200,h:160,floor_texture:'wood',wall_texture:'stone',wall_width:12});if(MapPartProfiles.lights[type])Object.assign(n,MapPartProfiles.lights[type]);MapPartCards.apply(n,e.dataTransfer.getData('application/x-tabletop-part-card'),true);nodes.push(n);pick(n.id);tool='select';partCardId=null;document.querySelectorAll('[data-map2-tool]').forEach(b=>b.classList.toggle('active',b.dataset.map2Tool==='select'));changed();});
    const mapKey=e=>{
      if(e.code==='Space'){space=true;e.preventDefault();return;}if(!options.edit)return;
      const mod=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
      if(k==='escape'){e.preventDefault();e.stopPropagation();MapTokenWalk.stop();selectPlayer(null);pick(null);draw();return;}
      if(k==='delete'||k==='backspace'){e.preventDefault();action('delete');}
      if(mod&&k==='a'){e.preventDefault();selectedIds=new Set(nodes.map(n=>n.id));selected=nodes.at(-1)?.id;draw();}
      if(mod&&k==='z'){e.preventDefault();action(e.shiftKey?'redo':'undo');}
      if(mod&&k==='y'){e.preventDefault();action('redo');}
      if(mod&&k==='s'){e.preventDefault();options.onSave?.();}
      if(mod&&k==='0'){e.preventDefault();action('fit');}
      if(mod&&k==='d'){e.preventDefault();action('duplicate');}
      if(mod&&k==='x'){e.preventDefault();clipboard=JSON.parse(JSON.stringify(nodes.filter(n=>selectedIds.has(n.id)&&!isLocked(n))));action('delete');}
      if(mod&&k==='c'){e.preventDefault();clipboard=JSON.parse(JSON.stringify(nodes.filter(n=>selectedIds.has(n.id))));}
      if(mod&&k==='v'&&clipboard.length){e.preventDefault();remember();const copies=clipboard.map(n=>({...JSON.parse(JSON.stringify(n)),id:crypto.randomUUID(),x:n.x+40,y:n.y+40}));if(nodes.length+copies.length>5000)return;nodes.push(...copies);selectedIds=new Set(copies.map(n=>n.id));selected=copies.at(-1).id;changed();}
      if(k.startsWith('arrow')&&selectedIds.size){e.preventDefault();remember();const step=(document.getElementById('map2Snap').checked?40:1)*(e.shiftKey?5:1);nodes.filter(n=>selectedIds.has(n.id)&&!isLocked(n)).forEach(n=>{n.x+=k==='arrowright'?step:k==='arrowleft'?-step:0;n.y+=k==='arrowdown'?step:k==='arrowup'?-step:0;});changed();}
    };
    svg.addEventListener('keydown',mapKey);
    document.addEventListener('keydown',e=>{if(!e.target.closest('.modal')&&!svg.contains(e.target)&&!document.getElementById('map2Surface').hidden&&document.getElementById('campaignDashboard').contains(e.target)&&!e.target.closest('input,textarea,select,[contenteditable=true]'))mapKey(e);});
    window.addEventListener('keyup',e=>{if(e.code==='Space')space=false;});window.addEventListener('blur',()=>space=false);
    MapSplines.init(svg,{canEdit:()=>options.edit,canEditNode:n=>options.edit&&!isLocked(n),selected:()=>nodes.find(n=>n.id===selected),point,snapPoint:p=>document.getElementById('map2Snap').checked?p.map(gridSnap):p,prepare:()=>{selectPlayer(null);tool='select';},message:walkStatus,beginEdit:remember,cancelEdit:()=>{if(history.length)restore(history.pop());draw();},preview:()=>scheduleDraw(),finishEdit:changed,commit:n=>{if(nodes.length>=5000)return;remember();nodes.push(n);pick(n.id);tool='select';changed();}});

  }
  function action(a){if(['fit','zoom-in','zoom-out'].includes(a)){if(a==='fit'){const w=Math.max(300,svg.clientWidth*1.5),h=Math.max(300,svg.clientHeight*1.5);view=[-w/2,-h/2,w,h];}else{const f=a==='zoom-in'?.8:1.25;view=[view[0]+view[2]*(1-f)/2,view[1]+view[3]*(1-f)/2,view[2]*f,view[3]*f];}applyView(a==='fit');return;}if(!options.edit)return;
    if(a==='undo'||a==='redo'){const from=a==='undo'?history:future,to=a==='undo'?future:history;if(!from.length)return;to.push(snapshot());restore(from.pop());changed();return;}
    const chosen=nodes.filter(n=>selectedIds.has(n.id));if(!chosen.length)return;remember();
    if(a==='delete')nodes=nodes.filter(n=>!selectedIds.has(n.id)||isLocked(n));
    if(a==='duplicate'){if(nodes.length+chosen.length>5000)return;const copies=chosen.map(n=>({...JSON.parse(JSON.stringify(n)),id:crypto.randomUUID(),x:n.x+40,y:n.y+40}));nodes.push(...copies);selectedIds=new Set(copies.map(n=>n.id));selected=copies.at(-1).id;}
    if(a==='front')nodes=[...nodes.filter(n=>!selectedIds.has(n.id)),...chosen];
    if(a==='back')nodes=[...chosen,...nodes.filter(n=>!selectedIds.has(n.id))];
    if(a==='lock')chosen.filter(n=>!MapFolderBatch.ancestors(n.folder_id,folders).some(f=>f.locked)).forEach(n=>n.locked=!n.locked);if(a==='hide')chosen.forEach(n=>n.hidden=!n.hidden);changed();
  }
  function isAmbience(){return MapArt.ambience.includes(tool);}
  function erase(p){const radius=Number(document.getElementById('map2BrushSize').value)/2;nodes=drag?.wallOnly?MapBuildingCurves.eraseWalls(nodes,p,radius):MapAmbience.erase(nodes,tool,p,radius);selectedIds=new Set([...selectedIds].filter(id=>nodes.some(n=>n.id===id)));selected=[...selectedIds].at(-1)||null;}
  function scatter(p){const radius=Number(document.getElementById('map2BrushSize').value)/2,density=Number(document.getElementById('map2Density').value),count=nodes.reduce((sum,n)=>sum+(n.instances?.length||1),0);for(let i=0;i<density&&count+i<5000;i++){const angle=Math.random()*Math.PI*2,r=Math.sqrt(Math.random())*radius,size=tool.endsWith('_tree')?55+Math.random()*40:tool==='rock'?22+Math.random()*20:12+Math.random()*18;nodes.push(MapPartCards.apply({id:crypto.randomUUID(),type:tool,x:p.x+Math.cos(angle)*r,y:p.y+Math.sin(angle)*r,w:size,h:size,rotation:Math.random()*360,opacity:Number(document.getElementById('map2BrushOpacity').value)/100,color:colors[tool]||'#977451',label:''},partCardId));}nodes=MapAmbience.pack(nodes);pick(nodes.find(n=>n.type===tool&&n.instances&&!isLocked(n)&&!n.hidden)?.id);}


  const tilePaintTool=()=>MapCatalog.groups.terrain.includes(tool)||['road','river'].includes(tool);
  const tileDrawing=()=>tilePaintTool()&&document.getElementById('map2TileDraw').checked;
  function tileDrawControls(){const eligible=tilePaintTool(),enabled=tileDrawing();document.getElementById('map2TileDrawOption').hidden=!eligible;document.getElementById('map2TileDrawHelp').hidden=!enabled;document.getElementById('map2DrawMode').disabled=enabled;for(const id of ['map2BrushSize','map2BrushBorder','map2BrushSoftness'])document.getElementById(id).disabled=enabled;}
  function paintTiles(p){for(const [x,y] of MapTilePaint.between(drag.last||p,p)){if(x < -100||x>99||y < -100||y>99)continue;const key=x+','+y;if(drag.cells.has(key))continue;drag.cells.add(key);if(drag.kind==='tile-erase'){for(const n of nodes)if(n.type===tool&&!n.hidden&&!isLocked(n)&&!n.contents?.length&&!n.connected_map_id)MapTilePaint.erase(n,{x:x*40+20,y:y*40+20});nodes=nodes.filter(n=>!n.tile_cells||n.tile_cells.length);}else{if(drag.cells.size>5000){drag.cells.delete(key);break;}}}if(drag.kind==='tile-paint'&&drag.cells.size)MapTilePaint.setCells(drag.n,drag.cells);drag.last=p;}
  function markerCard(n){if(!['npc','encounter','shop'].includes(n.type)||!n.card_id)return null;return (options.getRecords?.()||[]).find(r=>Number(r.id)===Number(n.card_id)&&r.content?.category===(n.type==='shop'?'npc':n.type))||n.marker_card;}
  function renderCard(n){const panel=document.getElementById('map2CardPanel'),select=document.getElementById('map2CardSelect');panel.hidden=!n||!['npc','encounter','shop'].includes(n.type);if(panel.hidden)return;document.getElementById('map2CardLabel').textContent=n.type==='shop'?'Assign shopkeeper (optional)':n.type==='npc'?'Assign NPC':'Assign encounter';const cards=(options.getRecords?.()||[]).filter(r=>r.content?.category===(n.type==='shop'?'npc':n.type));select.replaceChildren(new Option('Unassigned',''));cards.forEach(r=>select.add(new Option(r.title,r.id)));select.value=n.card_id||'';select.disabled=!options.edit||isLocked(n);}
  function renderConnection(n){const eligible=n&&(MapArt.stamps.includes(n.type)||MapArt.buildings.includes(n.type));const panel=document.getElementById('map2ConnectionPanel'),select=document.getElementById('map2ConnectedMap');panel.hidden=!eligible;if(!eligible)return;const maps=(options.getMaps?.()||[]).filter(m=>m.id!==options.getCurrentMapId?.()),signature=JSON.stringify(maps.map(m=>[m.id,m.title,m.kind]));if(select.dataset.signature!==signature){select.replaceChildren(new Option('No connected map',''));maps.forEach(m=>select.add(new Option(m.title+' · '+m.kind.toUpperCase(),m.id)));select.dataset.signature=signature;}const arrival=n.type==='exit_location';panel.querySelector('summary').textContent=arrival?'Exit location':'Connected map';panel.querySelector('label').firstChild.textContent=arrival?'Arriving from':'Destination';select.options[0].text=arrival?'Choose source map':'No connected map';select.setAttribute('aria-label',arrival?'Arriving from map':'Connected map');select.value=(arrival?n.arrival_from_map_id:n.connected_map_id)||'';select.disabled=!options.edit||isLocked(n);document.getElementById('map2OpenConnection').hidden=arrival;document.getElementById('map2OpenConnection').disabled=!n.connected_map_id;panel.querySelector('small').textContent=arrival?'Players arriving from the selected map appear at the center of this marker. Place one exit location per source map.':'Click this stamp in Story mode to travel to its connected map.';}
  function records(){return (options.getRecords?.()||[]).filter(r=>['item','spell','attack'].includes(r.content?.category));}
  function renderContents(n){
    const panel=document.getElementById('map2ContentsChoices'),equipped=document.getElementById('map2Equipped'),query=document.getElementById('map2ContentsSearch').value.toLowerCase().trim(),list=records();
    const person=!!n&&MapTrade.people.includes(n.type),editable=!!n&&options.edit&&!isLocked(n);
    document.getElementById('map2RemoveAfterLooting').disabled=!editable;document.getElementById('map2RemoveAfterLooting').checked=!!n?.remove_after_looting;
    document.getElementById('map2ContentsPublic').disabled=!editable;document.getElementById('map2ContentsPublic').checked=!!n?.contents_public;
    document.getElementById('map2ContentsTitle').textContent=person?'Equipment':'Object contents';
    document.getElementById('map2EquippedTitle').textContent=person?'Equipped':'Stored items';
    document.getElementById('map2ContentsHelp').textContent=!n?'Select a part to add campaign cards.':isLocked(n)?'Unlock this part to change its contents.':person?'Click a card to equip it. Set quantities and prices below.':'Click a card to store it in this part.';
    document.getElementById('map2ContentsSearch').disabled=!n;
    document.getElementById('map2ContentsCount').textContent=n?'('+((n.contents||[]).reduce((sum,c)=>sum+c.quantity,0))+')':'';
    const wallet=document.getElementById('map2Money');if(!wallet.contains(document.activeElement)){wallet.replaceChildren();if(n){wallet.append(MapTrade.coinSummary(n.money_cp||0));const coins=MapTrade.coinInputs(n.money_cp||0,'Part holds');wallet.append(coins.element);const save=document.createElement('button');save.type='button';save.textContent='Set money';save.disabled=!editable;save.onclick=()=>{try{save.disabled=true;options.onTrade({action:'set_money',node_id:n.id,amount_cp:coins.read()}).catch(e=>{document.getElementById('mapWorkspaceStatus').textContent=e.message;save.disabled=!editable;});}catch(e){document.getElementById('mapWorkspaceStatus').textContent=e.message;save.disabled=!editable;}};wallet.append(save);}}
    const key=JSON.stringify([n?.id,n?.type,n?.locked,n?.contents,options.edit,query,list.map(r=>[r.id,r.title,window.StarterArt?.url(r),r.content.item_type,r.content.category])]);if(key===inspectorKey)return;inspectorKey=key;panel.replaceChildren();equipped.replaceChildren();document.getElementById('map2ContentsStatus').textContent='';if(!n)return;
    const append=(tag,text,cls,parent)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;if(cls)el.className=cls;parent.append(el);return el;};
    function card(record,parent,action){
      const button=RecordCards.create(record,{onOpen:action,className:'map-content-card',description:record.content?.item_type||(record.content?.category==='spell'?'Spell':record.content?.category==='attack'?'Ability':'Item')});parent.append(button);return button;
    }
    function update(change,message,focus){
      const current=nodes.find(part=>part.id===n.id);if(!options.edit||!current||isLocked(current)||selected!==current.id)return;
      remember();change(current);changed();if(openContentsId===current.id)showContents(current);document.getElementById('map2ContentsStatus').textContent=message;
      if(focus){const target=[...document.querySelectorAll('#map2ContentsPanel [data-content-focus]')].find(el=>el.dataset.contentFocus===focus);(target||document.getElementById('map2ContentsSearch')).focus({preventScroll:true});}
    }
    const entries=n.contents||[],held=new Set(entries.map(entry=>entry.record_id));
    for(const entry of entries){
      const record=list.find(r=>r.id===entry.record_id)||{id:entry.record_id,title:entry.title||'Unavailable card',content:{category:entry.category||'item'}};
      const row=append('article',null,'map-equipped-card',equipped);row.dataset.recordId=entry.record_id;
      const preview=card(record,row,()=>options.onOpenRecord?.(record));preview.setAttribute('aria-label','View '+record.title);preview.disabled=!options.onOpenRecord||!list.some(r=>r.id===record.id);
      const remove=append('button','×','map-content-remove',row);remove.type='button';remove.disabled=!editable;remove.title=person?'Unequip':'Remove from container';remove.setAttribute('aria-label',(person?'Unequip ':'Remove ')+record.title);remove.dataset.contentFocus='remove-'+record.id;
      remove.onclick=()=>update(current=>{current.contents=(current.contents||[]).filter(item=>item.record_id!==record.id);},record.title+(person?' unequipped.':' removed from this container.'),'add-'+record.id);
      const fields=append('div',null,'map-equipped-fields',row);
      const quantityLabel=append('label','Quantity',null,fields),qty=append('input',null,null,quantityLabel);qty.type='number';qty.min=1;qty.max=9999;qty.step=1;qty.value=entry.quantity;qty.disabled=!editable;qty.setAttribute('aria-label',record.title+' quantity');qty.dataset.contentFocus='quantity-'+record.id;
      qty.onchange=()=>{const value=Number(qty.value);if(!Number.isInteger(value)||value<1||value>9999){qty.setCustomValidity('Enter a whole quantity between 1 and 9999.');qty.reportValidity();return;}qty.setCustomValidity('');if(value===entry.quantity)return;update(current=>{const item=current.contents.find(item=>item.record_id===record.id);if(item)item.quantity=value;},record.title+' quantity saved.',qty.dataset.contentFocus);};qty.oninput=()=>qty.setCustomValidity('');
      if(person){
        const priceLabel=append('label','Price per item (gp)',null,fields),price=append('input',null,null,priceLabel);price.type='number';price.min=0;price.step='.0001';price.max=100000000;price.value=(entry.price_cp??MapTrade.value(record))/10000;price.disabled=!editable;price.setAttribute('aria-label',record.title+' price in gold');price.dataset.contentFocus='price-'+record.id;
        price.onchange=()=>{let value;try{value=MapTrade.cp(price.value);}catch(error){price.setCustomValidity(error.message);price.reportValidity();return;}price.setCustomValidity('');if(value===(entry.price_cp??MapTrade.value(record)))return;update(current=>{const item=current.contents.find(item=>item.record_id===record.id);if(item)item.price_cp=value;},record.title+' price saved.',price.dataset.contentFocus);};price.oninput=()=>price.setCustomValidity('');
      }
    }
    if(!entries.length)append('p',person?'Nothing equipped yet.':'This part is empty.','map-content-empty',equipped);
    const available=list.filter(r=>!held.has(r.id)&&(r.title+' '+(r.content.item_type||r.content.category)).toLowerCase().includes(query));
    for(const record of available){
      const button=card(record,panel,()=>update(current=>{
        if((current.contents||[]).some(item=>item.record_id===record.id))return;
        const entry={record_id:record.id,quantity:1};if(person)entry.price_cp=MapTrade.value(record);
        current.contents=[...(current.contents||[]),entry];if(current.contents_public===undefined||current.contents.length===1)current.contents_public=true;
      },record.title+(person?' equipped.':' added.'),'remove-'+record.id));
      button.setAttribute('aria-label',(person?'Equip ':'Add ')+record.title);button.dataset.contentFocus='add-'+record.id;button.disabled=!editable||entries.length>=100;
      append('span',person?'Equip':'Add','map-content-add',button);
    }
    if(!available.length)append('p',!list.length?'Create campaign items, spells or abilities first.':query?'No matching cards available.':'All campaign cards have been added.','map-content-empty',panel);
    if(entries.length>=100)document.getElementById('map2ContentsStatus').textContent='This part holds the maximum of 100 different cards.';
  }
  function closeContents(){MapTrade.reset();openContentsId=null;document.getElementById('map2ObjectPopup').hidden=true;document.getElementById('campaignDashboard').classList.remove('map-contents-open');window.MapWorkspace?.refreshPanels?.();}
  function interactionRange(n,character){const player=controlledPlayer();if(options.dm&&!player)return {allowed:true};const range=playerRange(player),distance=player?Math.max(Math.abs(player.x*40+20-n.x-n.w/2),Math.abs(player.z*40+20-n.y-n.h/2))/40:Infinity;return {allowed:distance<=range+1e-9,message:'Move closer. Your interaction range is '+range+' grid squares.'};}
  function showContents(n){
    if(!allowInteraction(n))return;
    if((n.needs_item||n.needs_roll)&&(!options.dm||controlledPlayer())&&!openingGrants.has(grantKey(n))){activatePart(n);return;}
    const quantities=openContentsId===n.id?new Map([...document.querySelectorAll('#map2PopupContents input[data-trade-quantity]')].map(input=>[input.dataset.tradeQuantity,input.value])):new Map();
    options.onPlayerSelect?.(null);
    const oldRecipient=document.querySelector('#map2PopupContents select')?.value;openContentsId=n.id;const root=document.getElementById('map2ObjectPopup'),list=document.getElementById('map2PopupContents');document.getElementById('campaignDashboard').append(root);document.getElementById('campaignDashboard').classList.add('map-contents-open');root.classList.add('map-custom-rail');document.getElementById('map2PopupTitle').textContent=n.label||n.type;list.replaceChildren();
    if(MapTrade.people.includes(n.type)||n.money_cp){MapTrade.render(n,{...options,interactionRange:c=>interactionRange(n,c)},list);list.querySelectorAll('input[data-trade-quantity]').forEach(input=>{const value=quantities.get(input.dataset.tradeQuantity);if(value!==undefined){input.value=Number(value)>Number(input.max)?input.max:value;input.dispatchEvent(new Event('input'));}});root.hidden=false;window.MapWorkspace?.openPanel?.('left');return;}
    const available=records(),characters=(options.getRecords?.()||[]).filter(r=>['character','npc'].includes(r.content.category)&&(options.dm||r.content.category==='character'&&Number(r.content.owner_user_id)===Number(options.viewerId)));
    const label=document.createElement('label');label.textContent='Take as';const recipient=document.createElement('select');recipient.setAttribute('aria-label','Take as character');characters.forEach(c=>recipient.add(new Option(c.title,c.id)));if(characters.some(c=>String(c.id)===oldRecipient))recipient.value=oldRecipient;label.append(recipient);list.append(label);recipient.onchange=()=>showContents(n);const reach=interactionRange(n,characters.find(c=>c.id===Number(recipient.value)));
    if(n.connected_map_id){const link=document.createElement('button');link.type='button';link.textContent='Open connected map';link.onclick=()=>{if(allowInteraction(n))options.onOpenMap?.(n.connected_map_id,n.id);};list.append(link);}
    const status=document.createElement('p');status.setAttribute('role','status');
    (n.contents||[]).forEach(entry=>{const card=available.find(r=>r.id===entry.record_id)||(entry.title?{title:entry.title}:null);if(!card)return;const row=document.createElement('div'),name=document.createElement('span'),take=document.createElement('button');row.className='map2-loot-row';name.append(RecordCards.create(card,{onOpen:()=>options.onOpenRecord?.(card),description:'Quantity '+entry.quantity}));take.type='button';take.textContent='Take';take.disabled=!characters.length||!options.onTake||!reach.allowed;take.onclick=async()=>{take.disabled=true;status.textContent='Taking…';try{await options.onTake(n.id,entry.record_id,Number(recipient.value));if(openContentsId===n.id){const fresh=nodes.find(v=>v.id===n.id);if(fresh)showContents(fresh);else closeContents();}}catch(e){status.textContent=e.message;take.disabled=false;}};row.append(name,take);list.append(row);});
    if(!reach.allowed)status.textContent=reach.message;else if(!(n.contents||[]).length)status.textContent='This part is empty.';else if(!characters.length)status.textContent='Create or select a character in this campaign to take items.';list.append(status);root.hidden=false;window.MapWorkspace?.openPanel?.('left');
  }

  function applyCanvas(){background.setAttribute('fill',!canvasSettings.background||canvasSettings.background==='empty'?'#252a29':'url(#mapTexture-'+canvasSettings.background+')');MapMaterials.update(svg,canvasSettings);MapScene.geometry(lightingNodes(),canvasSettings);document.querySelectorAll('.map2-palette [data-map2-tool]').forEach(b=>{const url=b.dataset.partCard?null:MapMaterials.preview(b.dataset.map2Tool);if(url){let img=b.querySelector('img');if(!img){b.querySelector('svg')?.remove();img=document.createElement('img');img.alt='';b.prepend(img);}if(img.src!==url)img.src=url;}});document.getElementById('map2MaterialStatus').textContent=svg.dataset.materialRenderer==='pbr'?'PBR surface lighting':'Flat textures · WebGL unavailable';document.getElementById('map2Light').value=canvasSettings.light_angle??315;document.getElementById('map2Relief').value=canvasSettings.relief??1;grid.style.display=canvasSettings.grid===false?'none':'';document.getElementById('map2GridVisible').checked=canvasSettings.grid!==false;document.getElementById('map2Background').value=canvasSettings.background||'empty';}
  let recordsDirty=false;
  function refreshRecords(){
    MapPartCards.palette(options.getRecords?.()||[]);
    recordsDirty=true;
    if(!svg||drag||document.activeElement?.closest('#map2Inspector input,#map2Inspector select,#map2PopupContents input,#map2PopupContents select'))return;
    recordsDirty=false;inspectorKey='';draw();
    if(openContentsId){const part=nodes.find(n=>n.id===openContentsId);if(part)showContents(part);else closeContents();}
  }
  window.Map2D={init,previewCharacterScale(id,scale){characterScalePreviews.set(Number(id),CharacterImageScale.value(scale));draw();},clearCharacterScalePreview(id){characterScalePreviews.delete(Number(id));draw();},refreshRecords,centerOnConnection,selectCharacter(id){if(options.dm)selectPlayer(id?playerById(id):null);},stopMovement(){cancelAnimationFrame(wheelFrame);wheelFrame=0;wheelZoom=null;MapSplines.cancel();openingGeneration++;MapOpenRoll.cancel();MapTokenWalk.reset();selectedPlayerId=null;clearHover();},configure(o){characterScalePreviews.clear();appliedViewKey='';cancelAnimationFrame(wheelFrame);wheelFrame=0;wheelZoom=null;MapSplines.cancel();openingGeneration++;MapOpenRoll.cancel();openingGrants.clear();selectedPlayerId=null;clearHover();MapMobileRaster.reset();options=o;MapPartCards.palette(options.getRecords?.()||[]);partCardId=null;folders=JSON.parse(JSON.stringify(o.folders||[]));Map2DFolders.reset();canvasSettings={...o.canvas};applyCanvas();nodes=loadedNodes(o.nodes);players=o.players||[];configureWalking();pick(null);history=[];future=[];inspectorKey='';closeContents();draw();},sync(o){if(recordsDirty)refreshRecords();if(drag||MapSplines.dragging)return;if(!o.nodes&&!o.canvas&&!o.folders&&!o.clearHistory&&JSON.stringify(o.players||[])===JSON.stringify(players))return;if(o.clearHistory){history=[];future=[];}if(o.folders)folders=JSON.parse(JSON.stringify(o.folders));if(o.canvas){canvasSettings={...o.canvas};applyCanvas();}players=MapTokenWalk.merge(o.players||[]);if(o.nodes){nodes=loadedNodes(o.nodes);MapTokenWalk.setScene(nodes);clearHover();if(openContentsId){const open=nodes.find(n=>n.id===openContentsId);if(open)showContents(open);else closeContents();}}if(!o.nodes&&openContentsId){const open=nodes.find(n=>n.id===openContentsId);if(open)showContents(open);}draw();},closeContents,isDragging(){return !!drag;}};
})();

