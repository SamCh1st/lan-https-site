/* Bounded lighting buffers with cached shadows and lightweight fire animation. */
(function(){
 const sun={Dawn:[-1.8,.65,.30],Morning:[-.8,.4,.24],Day:[.24,.32,.18],Evening:[1.8,.65,.32],Night:[0,0,0]};
 const times={Day:['0,0,0',0],Dawn:['123,77,111',.20],Morning:['249,202,121',.07],Evening:['115,53,25',.27],Night:['4,10,29',.57]};
 const temps={Freezing:['97,165,236',.20],Cold:['120,181,231',.10],Mild:['0,0,0',0],Warm:['244,159,78',.09],Hot:['230,106,42',.18]};
 let root,svg,canvas,mask,tint,scene={},rooms=[],objects=[],lights=[],settings={},geometryKey='',viewKey='',frame=0,draws=0,fireTimer=0;
 let silhouetteRevision=0,footprintCache=null,shadowQuality=96,objectIndex=null,sunIndex=null,navigationUntil=0,navigationTimer=0,renderedView=null;const pathCache=new WeakMap();let geometryRevision=0,alphaMask=null,alphaMaskKey='',navigationFrame=0;
 let daylightCache=null,ambientCacheKey='',maskBuilds=0;let lightScratch;
 const movingObjects=new Map();let movementTimer=0,lastMovementDraw=0,lastDrawDuration=0,movementRevision=0,renderedMovementRevision=-1;
 const silhouetteReady=()=>{silhouetteRevision++;schedule();};
 const make=()=>document.createElement('canvas');
 function pathFor(polys){let path=pathCache.get(polys);if(!path){path=new Path2D(polys.map(poly=>poly.length?'M'+poly.map(p=>p.join(' ')).join('L')+'Z':'').join(''));pathCache.set(polys,path);}return path;}
 function inside(p,poly){let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
 function orient(poly){const area=poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p[0]*q[1]-q[0]*p[1];},0);return area<0?poly.slice().reverse():poly;}
 function roomAt(p){return rooms.find(r=>r.polys.some(poly=>inside(p,poly)));}
 function rotate(n,p){const a=(n.rotation||0)*Math.PI/180,x=p[0]-n.w/2,y=p[1]-n.h/2;return [n.x+n.w/2+x*Math.cos(a)-y*Math.sin(a),n.y+n.h/2+x*Math.sin(a)+y*Math.cos(a)];}
 function footprint(n){return [[0,0],[n.w,0],[n.w,n.h],[0,n.h]].map(p=>rotate(n,p));}
 function hull(points){const p=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);const half=list=>{const out=[];for(const v of list){while(out.length>1&&cross(out.at(-2),out.at(-1),v)<=0)out.pop();out.push(v);}out.pop();return out;};return [...half(p),...half(p.slice().reverse())];}
 function projection(poly,dx,dy){return hull(poly.concat(poly.map(p=>[p[0]+dx,p[1]+dy])));}
 function radialProjection(poly,x,y,length){return hull(poly.concat(poly.map(p=>{const dx=p[0]-x,dy=p[1]-y,d=Math.hypot(dx,dy)||1;return [p[0]+dx/d*length,p[1]+dy/d*length];})));}
 let active=false;
 function setActive(value){active=value;if(value){view();schedule();return;}clearTimeout(fireTimer);clearTimeout(navigationTimer);clearTimeout(movementTimer);cancelAnimationFrame(frame);cancelAnimationFrame(navigationFrame);fireTimer=navigationTimer=movementTimer=frame=navigationFrame=0;}
 function schedule(){if(!active)return;if(performance.now()<navigationUntil)return;if(canvas&&!frame)frame=requestAnimationFrame(()=>{frame=0;draw();});}
 function init(host,source){root=host;svg=source;canvas=make();canvas.id='mapPointLighting';canvas.setAttribute('aria-hidden','true');root.append(canvas);mask=make();tint=make();lightScratch=make();document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});schedule();}
 function update(value){const key=JSON.stringify(value||{});if(key===JSON.stringify(scene))return;scene={...value};window.MapSurfaceLighting?.update({...scene,light_angle:settings.light_angle,relief:settings.relief},lights,roomAt);schedule();}
 function scheduleMovement(){schedule();}
 function flushMovement(){if(!active||!canvas||renderedMovementRevision===movementRevision)return;if(frame){cancelAnimationFrame(frame);frame=0;}draw();}
 function moveToken(id,x,y){const o=movingObjects.get(id);if(!o||o.art.x===x&&o.art.y===y)return;
  o.art.x=x;o.art.y=y;o.poly=footprint(o.art);o.center=[x+o.art.w/2,y+o.art.h/2];o.room=roomAt(o.center);delete o.silhouettes;delete o.sunCache;movementRevision++;scheduleMovement();
 }
 function tokenGeometry(nodes){const ids=new Set(nodes.map(n=>n.id));let changed=false;
  for(const id of movingObjects.keys())if(!ids.has(id)){movingObjects.delete(id);changed=true;}
  for(const n of nodes){const prior=movingObjects.get(n.id);if(prior&&prior.art.shadow_image_id===n.shadow_image_id&&prior.art.w===n.w&&prior.art.h===n.h){moveToken(n.id,n.x,n.y);prior.room=roomAt(prior.center);continue;}
   const art={...n},center=[n.x+n.w/2,n.y+n.h/2];movingObjects.set(n.id,{poly:footprint(art),center,size:Math.max(n.w,n.h),room:roomAt(center),art,transform:([x,y])=>rotate(art,[x*art.w,y*art.h]),moving:true});changed=true;
  }if(changed){movementRevision++;schedule();}
 }
 function geometry(nodes,canvasSettings={}){
  const tokens=nodes.filter(n=>!n.hidden&&n.type==='character_token'),candidates=nodes.filter(n=>!n.hidden&&n.type!=='character_token'&&(MapPartProfiles.isLight(n)||MapArt.buildings.includes(n.type)||(n.spline_kind&&n.type==='wall')||MapArt.stamps.includes(n.type)&&!['label','zone','fog','camera_bounds'].includes(n.type)&&!MapPartProfiles.noShadow.has(n.type)));
  const key=JSON.stringify([canvasSettings.light_angle,canvasSettings.relief,canvasSettings.sun_shadow_length,canvasSettings.sun_shadow_strength,candidates.map(n=>[n.id,n.type,n.light_enabled,n.part_image_id,n.x,n.y,n.w,n.h,n.rotation,n.color,n.opacity,n.light_intensity,n.light_radius,n.light_color,n.height_scale,n.fire_light,n.fire_wave,n.fire_flicker,n.light_softness,n.shadow_length,n.shadow_strength,n.spline_kind,n.points,n.brush,n.baseW,n.baseH,n.building_view,n.building_shapes,n.rooms,n.room_base_w,n.room_base_h,n.interior_walls,n.wall_base_w,n.wall_base_h,n.wall_width,n.ambience_w,n.ambience_h,n.instances,n.shadow_image_id,n.marker_card?.content?.image_id])]);
  if(key===geometryKey){tokenGeometry(tokens);return;}geometryKey=key;geometryRevision++;settings={...canvasSettings};
  rooms=candidates.filter(n=>MapArt.buildings.includes(n.type)&&n.building_view!=='exterior').map(n=>({id:n.id,polys:MapBuildingCurves.world(n).map(s=>orient(s.points)),node:n}));
  lights=candidates.filter(n=>MapPartProfiles.isLight(n)).map(node=>{const n={...MapPartProfiles.lights[node.type],...node};return {...n,color:n.type==='point_light'?n.color:(n.light_color||'#ffd58a'),cx:n.x+n.w/2,cy:n.y+n.h/2,radius:n.type==='point_light'?Math.max(n.w,n.h)/2:(n.light_radius??160)};});
  lights.forEach(l=>l.room=roomAt([l.cx,l.cy]));window.MapSurfaceLighting?.update({...scene,light_angle:settings.light_angle,relief:settings.relief},lights,roomAt);
  objects=[];
  for(const n of candidates){if(MapPartProfiles.isLight(n)||MapPartProfiles.noShadow.has(n.type)||n.height_scale===0||(MapArt.buildings.includes(n.type)&&n.building_view!=='exterior'))continue;
   // Ground scatter has no height. Packed trees retain their individual silhouettes.
   if(n.instances){if(!['oak_tree','pine_tree','blossom_tree','rock'].includes(n.type))continue;for(const i of n.instances){const a=(i.rotation||0)*Math.PI/180,poly=[[0,0],[i.w,0],[i.w,i.h],[0,i.h]].map(([x,y])=>{x-=i.w/2;y-=i.h/2;return rotate(n,[(i.x+i.w/2+x*Math.cos(a)-y*Math.sin(a))*n.w/(n.ambience_w||n.w),(i.y+i.h/2+x*Math.sin(a)+y*Math.cos(a))*n.h/(n.ambience_h||n.h)]);}),center=[poly.reduce((s,p)=>s+p[0],0)/4,poly.reduce((s,p)=>s+p[1],0)/4];objects.push({poly,center,size:Math.max(i.w*n.w/(n.ambience_w||n.w),i.h*n.h/(n.ambience_h||n.h)),room:roomAt(center),art:{type:n.type,w:i.w,h:i.h,height_scale:n.height_scale,part_image_id:n.part_image_id},transform:([x,y])=>{x=(x-.5)*i.w;y=(y-.5)*i.h;return rotate(n,[(i.x+i.w/2+x*Math.cos(a)-y*Math.sin(a))*n.w/(n.ambience_w||n.w),(i.y+i.h/2+x*Math.sin(a)+y*Math.cos(a))*n.h/(n.ambience_h||n.h)]);}});}continue;}
   if(n.spline_kind&&n.type==='wall'){const pts=n.points.map(p=>rotate(n,[p[0]*n.w/n.baseW,p[1]*n.h/n.baseH])),half=n.brush*Math.min(n.w/n.baseW,n.h/n.baseH)/2;for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],len=Math.hypot(b[0]-a[0],b[1]-a[1])||1,dx=-(b[1]-a[1])*half/len,dy=(b[0]-a[0])*half/len,poly=[[a[0]+dx,a[1]+dy],[b[0]+dx,b[1]+dy],[b[0]-dx,b[1]-dy],[a[0]-dx,a[1]-dy]],center=[(a[0]+b[0])/2,(a[1]+b[1])/2];poly.elevation=n.height_scale??1;objects.push({poly,center,size:Math.max(30,half*4),room:roomAt(center),art:n,polygonShadow:true});}continue;}
   if(n.building_view==='exterior'&&n.building_shapes){for(const shape of MapBuildingCurves.world(n)){const poly=shape.points;poly.elevation=n.height_scale??1;objects.push({poly,center:[n.x+n.w/2,n.y+n.h/2],size:Math.max(n.w,n.h),room:null,art:n,polygonShadow:true});}continue;}
   const center=[n.x+n.w/2,n.y+n.h/2];objects.push({poly:footprint(n),center,size:Math.max(n.w,n.h),room:roomAt(center),art:n,transform:([x,y])=>rotate(n,[x*n.w,y*n.h])});
  }
  for(const room of rooms)for(const line of room.node.interior_walls||[])for(let i=1;i<line.length;i++){
   const n=room.node,a=rotate(n,[line[i-1][0]*n.w/(n.wall_base_w||n.w),line[i-1][1]*n.h/(n.wall_base_h||n.h)]),b=rotate(n,[line[i][0]*n.w/(n.wall_base_w||n.w),line[i][1]*n.h/(n.wall_base_h||n.h)]),width=(n.wall_width||12)/2,dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1,ox=-dy/len*width,oy=dx/len*width;
   objects.push({poly:[[a[0]+ox,a[1]+oy],[b[0]+ox,b[1]+oy],[b[0]-ox,b[1]-oy],[a[0]-ox,a[1]-oy]],center:[(a[0]+b[0])/2,(a[1]+b[1])/2],size:Math.max(len,width*2),room,wall:true});
  }
  const bounds=o=>{const xs=o.poly.map(p=>p[0]),ys=o.poly.map(p=>p[1]);return {minX:Math.min(...xs),minY:Math.min(...ys),maxX:Math.max(...xs),maxY:Math.max(...ys)};};
  objectIndex=MapVisibility.index(objects,bounds);sunIndex=MapVisibility.index(objects,o=>{const b=bounds(o),reach=o.size*3.3*(settings.sun_shadow_length??1)*(o.art?.height_scale??1);return {minX:b.minX-reach,minY:b.minY-reach,maxX:b.maxX+reach,maxY:b.maxY+reach};});
  tokenGeometry(tokens);
  schedule();
 }
 function view(){if(!active||!svg)return;const r=svg.getBoundingClientRect(),m=svg.getScreenCTM(),key=[r.width,r.height,m?.a,m?.d,m?.e,m?.f].join(',');if(viewKey!==key){viewKey=key;navigationUntil=performance.now()+140;clearTimeout(navigationTimer);if(frame){cancelAnimationFrame(frame);frame=0;}if(renderedView&&m){const ratio=m.a/renderedView.a,dx=m.e-r.left-ratio*(renderedView.e-renderedView.left)+renderedView.pad,dy=m.f-r.top-ratio*(renderedView.f-renderedView.top)+renderedView.pad;canvas.style.transformOrigin='0 0';canvas.style.transform=`translate(${dx}px,${dy}px) scale(${ratio})`;const left=dx-renderedView.pad,top=dy-renderedView.pad;const right=left+renderedView.width*ratio,bottom=top+renderedView.height*ratio,margin=Math.max(r.width,r.height)*.35;if(left>0||top>0||right<r.width||bottom<r.height){cancelAnimationFrame(navigationFrame);navigationFrame=0;draw(true);}else if((left>-margin||top>-margin||right<r.width+margin||bottom<r.height+margin)&&!navigationFrame)navigationFrame=requestAnimationFrame(()=>{navigationFrame=0;draw(true);});}navigationTimer=setTimeout(()=>{navigationUntil=0;schedule();},145);}}
 function draw(preview=false){
  clearTimeout(fireTimer);fireTimer=0;const started=performance.now();
  if(!root?.getClientRects().length||document.hidden)return;const screen=svg.getBoundingClientRect(),m=svg.getScreenCTM();if(!m||!screen.width||!screen.height)return;const pad=Math.max(screen.width,screen.height)*.65,rect={left:screen.left-pad,top:screen.top-pad,width:screen.width+pad*2,height:screen.height+pad*2};
  const visibleLights=lights.filter(l=>{const x=m.a*l.cx+m.e-rect.left,y=m.d*l.cy+m.f-rect.top,r=l.radius*Math.abs(m.a);return x+r>=0&&y+r>=0&&x-r<rect.width&&y-r<rect.height&&(l.light_intensity??1)>0;});
  const zoom=Math.abs(m.a),quality=preview?shadowQuality:zoom>2?192:zoom>1?128:96;
  if(quality!==shadowQuality){shadowQuality=quality;silhouetteRevision++;footprintCache=null;for(const o of [...objects,...movingObjects.values()])delete o.silhouettes;}
  const cap=preview?512:window.MapMobileMode?1024:3072,pixelBudget=preview?180000:window.MapMobileMode?(zoom>1?650000:350000):(zoom>1?2400000:1400000),scale=Math.min(Math.min(window.devicePixelRatio||1,2),cap/Math.max(rect.width,rect.height),Math.sqrt(pixelBudget/(rect.width*rect.height))),w=Math.max(1,Math.ceil(rect.width*scale)),h=Math.max(1,Math.ceil(rect.height*scale));
  for(const c of [canvas,mask,tint])if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
  const ctx=canvas.getContext('2d'),mc=mask.getContext('2d'),tc=tint.getContext('2d');
  for(const c of [ctx,tc]){c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation='source-over';c.globalAlpha=1;c.clearRect(0,0,w,h);}
  const pixel=p=>[(m.a*p[0]+m.c*p[1]+m.e-rect.left)*scale,(m.b*p[0]+m.d*p[1]+m.f-rect.top)*scale],unit=Math.abs(m.a)*scale;
  const fill=(c,polys,color)=>{const path=pathFor(polys);c.save();c.setTransform(m.a*scale,m.b*scale,m.c*scale,m.d*scale,(m.e-rect.left)*scale,(m.f-rect.top)*scale);c.fillStyle=color;c.fill(path);c.restore();};
  const roomPolys=rooms.flatMap(r=>r.polys);
  function contain(c,room){c.globalCompositeOperation=room?'destination-in':'destination-out';fill(c,room?room.polys:roomPolys,'#000');c.globalCompositeOperation='source-over';}
  function silhouettes(o){if(!o.art||o.polygonShadow)return [o.poly];const lod=o.moving?16:o.size*zoom<180?32:0;if(o.silhouettes&&o.silhouetteQuality===shadowQuality&&o.silhouetteLOD===lod)return o.silhouettes;const rects=MapSilhouettes.request(o.art,silhouetteReady,shadowQuality);if(rects===null)return [];o.silhouetteQuality=rects.resolution;o.silhouetteLOD=lod;o.alpha=rects.alpha;const compact=o.size*zoom<120&&['tree','oak','oak_tree','pine_tree','blossom_tree','thorn_bush','rock','mossy_boulder'].includes(o.art.type);o.silhouettes=(compact?(rects.bands||[]).map(b=>({points:b.points,elevation:b.elevation})):(lod?rects['coarse'+lod]||rects:rects).map(([x,y,w,h,elevation])=>({points:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],elevation}))).map(({points,elevation})=>{const poly=points.map(o.transform);poly.elevation=elevation*(o.art.height_scale??1);return poly;});return o.silhouettes;}

  const viewBounds=MapVisibility.viewport(svg,pad),viewObjects=(objectIndex?objectIndex.query(viewBounds):objects).concat([...movingObjects.values()]);
  const visibleObjects=viewObjects.filter(o=>{const [x,y]=pixel(o.center),pad=o.size*unit;return x+pad>=0&&y+pad>=0&&x-pad<=w&&y-pad<=h;});
  if(!footprintCache||footprintCache.movement!==movementRevision||footprintCache.revision!==silhouetteRevision||footprintCache.objects.length!==visibleObjects.length||visibleObjects.some((o,i)=>footprintCache.objects[i]!==o))footprintCache={movement:movementRevision,revision:silhouetteRevision,objects:visibleObjects,polys:visibleObjects.flatMap(silhouettes)};
  function cutFootprints(c,includeMoving=true){const key=[geometryRevision,silhouetteRevision,viewKey,w,h].join(':');if(key!==alphaMaskKey){alphaMaskKey=key;alphaMask??=make();alphaMask.width=w;alphaMask.height=h;const ac=alphaMask.getContext('2d');for(const o of visibleObjects.filter(o=>!o.moving)){if(o.alpha&&o.transform){const a=pixel(o.transform([0,0])),b=pixel(o.transform([1,0])),d=pixel(o.transform([0,1]));ac.setTransform((b[0]-a[0])/o.alpha.width,(b[1]-a[1])/o.alpha.width,(d[0]-a[0])/o.alpha.height,(d[1]-a[1])/o.alpha.height,a[0],a[1]);ac.drawImage(o.alpha,0,0);}else fill(ac,o.art&&!o.polygonShadow?[]:[o.poly],'#000');}}c.save();c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation='destination-out';c.drawImage(alphaMask,0,0);for(const o of visibleObjects.filter(o=>includeMoving&&o.moving)){if(!o.alpha)continue;const a=pixel(o.transform([0,0])),b=pixel(o.transform([1,0])),d=pixel(o.transform([0,1]));c.setTransform((b[0]-a[0])/o.alpha.width,(b[1]-a[1])/o.alpha.width,(d[0]-a[0])/o.alpha.height,(d[1]-a[1])/o.alpha.height,a[0],a[1]);c.drawImage(o.alpha,0,0);}c.restore();}


  const baseSun=sun[scene.time]||sun.Day,angle=(settings.light_angle??Math.atan2(-baseSun[1],-baseSun[0])*180/Math.PI)*Math.PI/180,length=Math.hypot(baseSun[0],baseSun[1]),sx=-Math.cos(angle)*length,sy=-Math.sin(angle)*length,alpha=baseSun[2],sunLength=settings.sun_shadow_length??1;
  const daylightKey=[geometryRevision,silhouetteRevision,viewKey,w,h,sx,sy,alpha,sunLength,settings.sun_shadow_strength,scene.weather].join(':');
  if(daylightCache?.key===daylightKey)ctx.drawImage(daylightCache.canvas,0,0);
  else{if(alpha&&sunLength){
   const weather=['Storm','Rain','Cloudy','Fog'].includes(scene.weather)?.4:1;
   const shadows=(sunIndex?sunIndex.query(viewBounds):objects).filter(o=>{const [x,y]=pixel(o.center),pad=o.size*(1+sunLength*3*(o.art?.height_scale??1))*unit;return !o.room&&x+pad>=0&&y+pad>=0&&x-pad<=w&&y-pad<=h;}).flatMap(o=>{const polys=silhouettes(o),key=[sx,sy,sunLength].join(':');if(o.sunCache?.polys!==polys||o.sunCache.key!==key)o.sunCache={polys,key,projected:polys.flatMap(poly=>{const dx=sx*o.size*sunLength*(poly.elevation??1),dy=sy*o.size*sunLength*(poly.elevation??1);return o.polygonShadow?[orient(poly),orient(poly.map(p=>[p[0]+dx,p[1]+dy])),...poly.map((p,i)=>{const q=poly[(i+1)%poly.length];return orient([p,q,[q[0]+dx,q[1]+dy],[p[0]+dx,p[1]+dy]]);})]:[projection(poly,dx,dy)];})};return o.sunCache.projected;});
   for(const room of rooms)for(const poly of room.polys)shadows.push(projection(poly,sx*65*sunLength,sy*65*sunLength));
   tc.filter=`blur(${Math.max(.45,Math.min(3,unit*1.1))}px)`;fill(tc,shadows,`rgba(0,0,0,${alpha*weather*(settings.sun_shadow_strength??1)})`);tc.filter='none';ctx.drawImage(tint,0,0);tc.clearRect(0,0,w,h);contain(ctx,null);cutFootprints(ctx,false);
  }
    const cached=daylightCache?.canvas||make();cached.width=w;cached.height=h;cached.getContext('2d').drawImage(canvas,0,0);daylightCache={key:daylightKey,canvas:cached};
  }
  if(alpha&&sunLength&&movingObjects.size){
   const weather=['Storm','Rain','Cloudy','Fog'].includes(scene.weather)?.4:1;
   const shadows=[...movingObjects.values()].filter(o=>!o.room).flatMap(o=>silhouettes(o).map(poly=>projection(poly,sx*o.size*sunLength*(poly.elevation??1),sy*o.size*sunLength*(poly.elevation??1))));
   tc.clearRect(0,0,w,h);tc.filter=`blur(${Math.max(.45,Math.min(3,unit*1.1))}px)`;fill(tc,shadows,`rgba(0,0,0,${alpha*weather*(settings.sun_shadow_strength??1)})`);tc.filter='none';contain(tc,null);cutFootprints(tc);ctx.drawImage(tint,0,0);tc.clearRect(0,0,w,h);
  }
  if(lights.length){
   const ambientKey=[geometryRevision,viewKey,w,h,scene.time,scene.temperature,scene.weather,scene.visibility].join(':');
   if(ambientCacheKey!==ambientKey){mc.setTransform(1,0,0,1,0,0);mc.globalCompositeOperation='source-over';mc.clearRect(0,0,w,h);
    const t=times[scene.time]||times.Day,temp=temps[scene.temperature]||temps.Mild,weather=({Storm:.18,Rain:.07,Cloudy:.10,Fog:.13,Snow:.04})[scene.weather]||0,v=({Dim:.13,Dark:.32,Obscured:.43})[scene.visibility]||0;
    for(const color of [`rgba(${t[0]},${t[1]})`,`rgba(${temp[0]},${temp[1]})`,`rgba(0,0,0,${weather})`,`rgba(0,0,0,${v})`]){mc.fillStyle=color;mc.fillRect(0,0,w,h);}contain(mc,null);
    const indoor=new Set(lights.filter(l=>l.room).map(l=>l.room));for(const room of indoor)fill(mc,room.polys,'rgba(2,4,10,.86)');ambientCacheKey=ambientKey;
   }
   const rendered=[];for(const light of visibleLights){
    const reach=light.radius*1.08,diameter=reach*2,maskSize=Math.max(128,Math.min(window.MapMobileMode?512:1024,Math.ceil(diameter*unit/128)*128));
    const moving=[...movingObjects.values()].filter(o=>o.room===light.room&&Math.hypot(o.center[0]-light.cx,o.center[1]-light.cy)-o.size<reach);
    const baseKey=[geometryRevision,silhouetteRevision,maskSize].join(':'),key=[baseKey,...moving.flatMap(o=>[o.art.id,o.art.x,o.art.y,o.art.shadow_image_id])].join(':');
    const localScale=maskSize/diameter,left=light.cx-reach,top=light.cy-reach;
    const localFill=(c,polys,color)=>{c.save();c.setTransform(localScale,0,0,localScale,-left*localScale,-top*localScale);c.fillStyle=color;c.fill(pathFor(polys));c.restore();};
    const cutObjects=(c,list)=>{for(const o of list){if(!o.alpha||!o.transform)continue;const a=o.transform([0,0]),b=o.transform([1,0]),d=o.transform([0,1]);c.setTransform((b[0]-a[0])*localScale/o.alpha.width,(b[1]-a[1])*localScale/o.alpha.width,(d[0]-a[0])*localScale/o.alpha.height,(d[1]-a[1])*localScale/o.alpha.height,(a[0]-left)*localScale,(a[1]-top)*localScale);c.drawImage(o.alpha,0,0);}c.setTransform(1,0,0,1,0,0);};
    if(light.baseMaskKey!==baseKey){
     const nearby=objectIndex?objectIndex.query({minX:light.cx-reach,minY:light.cy-reach,maxX:light.cx+reach,maxY:light.cy+reach}):objects,length=light.shadow_length??1.5;
     const shadowPolys=[],wallShadows=[];
     for(const o of nearby){if(o.room!==light.room||(!length&&!o.wall))continue;const d=Math.hypot(o.center[0]-light.cx,o.center[1]-light.cy);if(d<1||d-o.size>reach)continue;for(const poly of silhouettes(o))(o.wall?wallShadows:shadowPolys).push(radialProjection(poly,light.cx,light.cy,o.wall?reach*2:Math.min(reach*2,o.size*length*(poly.elevation??1))));}
     light.baseMask??=make();light.baseMask.width=light.baseMask.height=maskSize;lightScratch.width=lightScratch.height=maskSize;
     const sc=lightScratch.getContext('2d'),lc=light.baseMask.getContext('2d');lc.fillStyle='#fff';lc.fillRect(0,0,maskSize,maskSize);lc.globalCompositeOperation=light.room?'destination-in':'destination-out';localFill(lc,light.room?light.room.polys:roomPolys,'#fff');lc.globalCompositeOperation='source-atop';
     sc.filter=`blur(${Math.max(.6,Math.min(5,localScale*(.55+2*(light.light_softness??.45))))}px)`;localFill(sc,shadowPolys,`rgba(0,0,0,${light.shadow_strength??1})`);sc.filter='none';sc.globalCompositeOperation='destination-out';cutObjects(sc,nearby);
     sc.globalCompositeOperation='source-over';localFill(sc,wallShadows,'#000');sc.globalCompositeOperation='destination-out';localFill(sc,nearby.filter(o=>o.wall).map(o=>o.poly),'#000');sc.globalCompositeOperation='source-over';lc.drawImage(lightScratch,0,0);lc.globalCompositeOperation='source-over';
     light.nearby=nearby;light.baseMaskKey=baseKey;maskBuilds++;
    }
    if(light.maskKey!==key){
     light.mask??=make();if(light.mask.width!==maskSize)light.mask.width=light.mask.height=maskSize;const lc=light.mask.getContext('2d');lc.globalCompositeOperation='copy';lc.drawImage(light.baseMask,0,0);lc.globalCompositeOperation='source-over';
     if(moving.length&&(light.shadow_length??1.5)){
      const shadows=moving.flatMap(o=>Math.hypot(o.center[0]-light.cx,o.center[1]-light.cy)<1?[]:silhouettes(o).map(poly=>radialProjection(poly,light.cx,light.cy,Math.min(reach*2,o.size*(light.shadow_length??1.5)*(poly.elevation??1)))));
      if(lightScratch.width!==maskSize)lightScratch.width=lightScratch.height=maskSize;const sc=lightScratch.getContext('2d');sc.clearRect(0,0,maskSize,maskSize);sc.globalCompositeOperation='source-over';
      sc.filter=`blur(${Math.max(.6,Math.min(3,localScale))}px)`;localFill(sc,shadows,`rgba(0,0,0,${light.shadow_strength??1})`);sc.filter='none';sc.globalCompositeOperation='destination-out';cutObjects(sc,moving.concat(light.nearby.filter(o=>moving.some(t=>Math.hypot(o.center[0]-t.center[0],o.center[1]-t.center[1])<t.size*(1+(light.shadow_length??1.5))+o.size))));sc.globalCompositeOperation='source-over';lc.globalCompositeOperation='source-atop';lc.drawImage(lightScratch,0,0);lc.globalCompositeOperation='source-over';
     }light.maskKey=key;
    }
    const phase=String(light.id).split('').reduce((s,c)=>s+c.charCodeAt(0),0),time=started/1000+phase;
    const wave=light.fire_light?(light.fire_wave??.35)*(.045*Math.sin(time*2.3)+.025*Math.sin(time*3.7)):0;
    const flicker=light.fire_light?1-(light.fire_flicker??.35)*(.16+.10*Math.sin(time*11.7)+.06*Math.sin(time*17.3)):1;
    const center=pixel([light.cx,light.cy]),origin=pixel([light.cx-reach,light.cy-reach]),hex=/^#[0-9a-f]{6}$/i.test(light.color||'')?light.color:'#ffd58a';
    rendered.push({id:light.id,key:light.maskKey,mask:light.mask,rect:[origin[0],origin[1],diameter*unit,diameter*unit],center,radius:light.radius*unit*(1+wave),power:(light.light_intensity??1)*(light.opacity??1)*flicker,softness:light.light_softness??.45,color:[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)});
   }
   const blended=MapLightCompositor.render(w,h,mask,ambientKey,rendered);ctx.drawImage(blended,0,0);canvas.dataset.lightRenderer=blended.dataset.renderer;
   // Release masks for culled lights; only visible lights retain raster resources.
   for(const light of lights)if(!visibleLights.includes(light)){delete light.mask;delete light.maskKey;delete light.baseMask;delete light.baseMaskKey;delete light.nearby;}
  }
  canvas.style.transform='';canvas.style.left=-pad+'px';canvas.style.top=-pad+'px';canvas.style.width=rect.width+'px';canvas.style.height=rect.height+'px';renderedView={a:m.a,e:m.e,f:m.f,left:rect.left,top:rect.top,pad,width:rect.width,height:rect.height};const duration=performance.now()-started;
  if(!preview&&visibleLights.some(l=>l.fire_light&&((l.fire_wave??.35)>0||(l.fire_flicker??.35)>0)))fireTimer=setTimeout(schedule,window.MapMobileMode?33:16);
  lastMovementDraw=performance.now();lastDrawDuration=duration;renderedMovementRevision=movementRevision;canvas.dataset.geometryRevision=String(geometryRevision);canvas.dataset.movingObjects=String(movingObjects.size);canvas.dataset.movementRevision=String(movementRevision);canvas.dataset.tokenPositions=JSON.stringify([...movingObjects.values()].map(o=>[o.art.id,o.art.x,o.art.y]));canvas.dataset.maskBuilds=String(maskBuilds);canvas.dataset.preview=String(preview);canvas.dataset.visibleObjects=String(visibleObjects.length);canvas.dataset.totalObjects=String(objects.length+movingObjects.size);canvas.dataset.visibleLights=String(visibleLights.length);canvas.dataset.shadowResolution=String(shadowQuality);canvas.dataset.renderMs=duration.toFixed(2);canvas.dataset.renderCount=String(++draws);canvas.dataset.lightCount=String(lights.length);canvas.dataset.sunVector=[sx*sunLength,sy*sunLength].join(',');
 }
 window.MapLighting={setActive,init,update,geometry,moveToken,flushMovement,view,inside,projection,orient,radialProjection};
})();
