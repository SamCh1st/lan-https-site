/* Original vector cartography artwork and repeatable terrain textures. */
(function(){
  const NS='http://www.w3.org/2000/svg';
  function el(tag,attrs,parent){const n=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));parent?.append(n);return n;}
  const art={
    tree:'<ellipse cx="52" cy="80" rx="37" ry="13" fill="#182821" opacity=".4"/><path d="M45 48h12l5 42H40z" fill="#695038"/><path d="M50 5 15 49h15L8 72h84L70 49h15z" fill="#3b6347" stroke="#213f32" stroke-width="3"/><path d="m50 12-9 41 13-7-5 21 28-1-17-25h10z" fill="#77916a" opacity=".65"/><path d="m24 70 24-7M36 47l14-7" stroke="#a6b788" opacity=".5"/>',
    oak:'<ellipse cx="53" cy="82" rx="39" ry="12" fill="#12271e" opacity=".4"/><path d="m45 54-5 40h22l-5-39" fill="#775439"/><path d="M19 66C-1 53 8 25 27 26 20 7 49-1 61 12 82 0 98 27 85 41 107 62 78 83 64 70 46 88 20 86 19 66Z" fill="#536e3c" stroke="#2c452c" stroke-width="3"/><path d="M24 43C21 18 50 19 52 34M59 26q26-4 19 20M31 62q10-13 26-5" fill="none" stroke="#91a365" stroke-width="8" stroke-linecap="round" opacity=".5"/>',
    rock:'<ellipse cx="52" cy="81" rx="40" ry="11" fill="#172025" opacity=".35"/><path d="m12 68 8-35 28-22 31 12 15 38-28 25-33-3z" fill="#858880" stroke="#454b48" stroke-width="3"/><path d="m20 33 32 5 27-15-13 39-54 6z" fill="#b3b1a0"/><path d="m52 38 14 24 28-1-28 25-33-3z" fill="#626d69"/>',
    mountain:'<path d="m2 86 27-49 12 12L64 8l34 79z" fill="#877a60" stroke="#4c4b43" stroke-width="3"/><path d="m64 8-8 77h40z" fill="#5e645d"/><path d="m64 8-20 36 17-8 10 8 5-14z" fill="#d9d6ba"/><path d="m29 37-9 43 21-31z" fill="#c1ac85"/>',
    chest:'<ellipse cx="50" cy="84" rx="39" ry="10" fill="#24180c" opacity=".35"/><path d="M15 43q0-30 35-30t35 30v40H15z" fill="#9b6636" stroke="#422e21" stroke-width="3"/><path d="M15 44h70M19 60h62M33 18v63M67 18v63" fill="none" stroke="#d0ad62" stroke-width="6"/><path d="M43 41h14v22H43z" fill="#d9bb73" stroke="#654c2f"/><circle cx="50" cy="50" r="3" fill="#493727"/>',
    torch:'<path d="m42 52 5 40h9l4-40" fill="#775335" stroke="#342820" stroke-width="3"/><path d="M50 6C27 35 32 58 50 62 75 58 76 30 60 21L56 40z" fill="#d37936"/><path d="M50 28Q28 53 50 58q20-7 7-21l-4 10z" fill="#f2d575"/>',
    house:'<path d="M16 40h72v50H16z" fill="#31291d" opacity=".3"/><path d="M14 34h70v50H14z" fill="#c6b58b" stroke="#524437" stroke-width="3"/><path d="m6 40 43-30 48 30z" fill="#925b44" stroke="#553a2d" stroke-width="3"/><path d="m43 12 1 27M18 32h57M30 24h33" stroke="#c08762" stroke-width="3"/><path d="M43 56h15v28H43z" fill="#564337"/><path d="M23 49h12v13H23zm43 0h11v13H66z" fill="#607b7e" stroke="#715f47" stroke-width="3"/>',
    tower:'<ellipse cx="50" cy="87" rx="34" ry="10" fill="#172025" opacity=".35"/><path d="M24 26h53l-5 61H29z" fill="#a7a18b" stroke="#4c514a" stroke-width="3"/><path d="M20 10h13v10h12V10h13v10h12V10h12v26H20z" fill="#bdb599" stroke="#4c514a" stroke-width="3"/><path d="M25 51h49M26 69h47M39 37v14m18 0v18M39 69v17" stroke="#777d70" stroke-width="2"/><path d="M46 43h11v15H46zm-3 29q8-12 16 0v14H43z" fill="#3c463e"/>',
    tent:'<path d="m4 85 46-67 45 67z" fill="#c4a978" stroke="#594a33" stroke-width="3"/><path d="m50 18 16 67h29z" fill="#8e794f"/><path d="m50 45-17 40h33z" fill="#493e2e"/><path d="M50 5v15M9 70 2 93m85-21 10 20" stroke="#594a33" stroke-width="3"/>',
    bridge:'<path d="M10 19h80v65H10z" fill="#8d6845" stroke="#463a2b" stroke-width="3"/><path d="M12 31h76M12 43h76M12 55h76M12 67h76M12 79h76" stroke="#c49b64" stroke-width="3"/><path d="M18 8v85M82 8v85" stroke="#4f3e2c" stroke-width="7"/><path d="M18 8v85M82 8v85" stroke="#b4905e" stroke-width="3"/>',
    npc:'<ellipse cx="50" cy="84" rx="27" ry="10" fill="#101c20" opacity=".35"/><circle cx="50" cy="27" r="15" fill="#d0b187" stroke="#5b4734" stroke-width="3"/><path d="M31 46q19-12 38 0l11 38H20z" fill="#8d5650" stroke="#422e2d" stroke-width="3"/><path d="M50 44v39" stroke="#c5a275" stroke-width="3"/>',
    door:'<rect x="18" y="5" width="64" height="90" rx="4" fill="#644d35" stroke="#302c26" stroke-width="5"/><path d="M35 9v82M51 9v82M67 9v82" stroke="#aa8551" stroke-width="3"/><path d="M22 23h24M22 76h24" stroke="#353c39" stroke-width="6"/><circle cx="69" cy="52" r="5" fill="#d2ac5d"/>'
  };
  const colors={grass:'#647346',water:'#3f707b',path:'#ad9366',stone:'#8b8979',sand:'#c4aa73',snow:'#d1d4c6',wood:'#99764f',wall:'#706e60',road:'#b49a6f',river:'#598792',fog:'#000000',zone:'#a088a9',label:'#f1dfab'};
  function defs(root){
    const d=el('defs',{},root);
    Object.entries(colors).filter(([k])=>!['label','fog','zone','road','river'].includes(k)).forEach(([k,color])=>{const p=el('pattern',{id:'mapTexture-'+k,width:80,height:80,patternUnits:'userSpaceOnUse'},d);el('rect',{width:80,height:80,fill:color},p);
      for(let i=0;i<16;i++){const x=(i*37+11)%80,y=(i*23+7)%80;
        if(k==='water')el('path',{d:`M${x} ${y}q6 -4 12 0t12 0`,fill:'none',stroke:'#bbd7c5','stroke-width':1,opacity:.18},p);
        else if(k==='stone'||k==='wall')el('path',{d:`M0 ${i*20}h80M${i%2?20:60} ${i*20}v20`,fill:'none',stroke:'#434e49','stroke-width':2,opacity:.32},p);
        else if(k==='wood')el('path',{d:`M0 ${i*8}h80m-75 2q18 2 36 0t36 0`,fill:'none',stroke:'#493c2b','stroke-width':1,opacity:.28},p);
        else if(k==='grass')el('path',{d:`M${x} ${y}l-3 -5m3 5 3-7`,fill:'none',stroke:i%2?'#283f2c':'#adb77b',opacity:.35},p);
        else el('circle',{cx:x,cy:y,r:i%3+1,fill:i%2?'#504a36':'#f3dfa8',opacity:.13},p);
      }
    });
    for(const name of ['water','lava','swamp','arcane']){const source=d.querySelector('#mapTexture-'+name);if(source){const still=source.cloneNode(true);still.setAttribute('id','mapTexture-'+name+'-still');d.append(still);}}
    const ground=el('filter',{id:'mapGroundShadow',x:'-15%',y:'-15%',width:'130%',height:'130%'},d);el('feDropShadow',{dx:.5,dy:1,stdDeviation:1,'flood-opacity':.22},ground);
    const shadow=el('filter',{id:'mapStampShadow',x:'-30%',y:'-30%',width:'160%',height:'170%'},d);el('feDropShadow',{dx:2,dy:4,stdDeviation:2,'flood-opacity':.28},shadow);
  }
  const ambienceSprites=new Map();
  function maskOverview(g,detail){const image=g.querySelector('[data-ambience-overview]');if(!image)return;let mask=g.querySelector('[data-overview-mask]');if(!mask){const defs=el('defs',{},g);mask=el('mask',{id:'overview-'+crypto.randomUUID(),'data-overview-mask':'true',maskUnits:'userSpaceOnUse'},defs);el('rect',{fill:'white'},mask);el('rect',{fill:'black'},mask);}for(const k of ['x','y','width','height']){mask.setAttribute(k,image.getAttribute(k));mask.children[0].setAttribute(k,image.getAttribute(k));mask.children[1].setAttribute(k,detail.getAttribute(k));}image.setAttribute('mask','url(#'+mask.id+')');}
  function renderAmbience(n,g){
    g.setAttribute('data-render-pending','true');
    const spriteKey=n.part_image_id?'image:'+n.part_image_id:n.type;let sprite=ambienceSprites.get(spriteKey);
    if(!sprite){sprite=new Image();if(n.part_image_id){sprite.ready=MapPartImages.bitmap({...n,w:100,h:100}).then(tile=>{sprite.bitmap=tile;});}else if(window.MapSprites?.has(n.type)){sprite.ready=MapSprites.load(n.type).then(atlas=>{const tile=document.createElement('canvas');tile.width=tile.height=256;MapSprites.draw(tile.getContext('2d'),n.type,atlas,256);sprite.bitmap=tile;});}else sprite.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="-10 -10 120 120">'+(art[n.type]||'')+'</svg>');ambienceSprites.set(spriteKey,sprite);}
    const paint=async()=>{
      if(!g.isConnected)return;const current=g._ambienceGeneration=(g._ambienceGeneration||0)+1;
      if(!sprite.bitmap){const tile=document.createElement('canvas');tile.width=tile.height=256;tile.getContext('2d').drawImage(sprite,0,0,256,256);sprite.bitmap=tile;}
      const w=n.ambience_w,h=n.ambience_h,sx=n.w/w,sy=n.h/h,root=g.ownerSVGElement,box=root.getBoundingClientRect(),matrix=g.getScreenCTM();if(!matrix)return;const inverse=matrix.inverse(),padding=Math.max(480,Math.min(900,box.width*.65));
      const corners=[[box.left-padding,box.top-padding],[box.right+padding,box.top-padding],[box.right+padding,box.bottom+padding],[box.left-padding,box.bottom+padding]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(inverse));
      const left=Math.max(-50,Math.min(...corners.map(p=>p.x))/sx),top=Math.max(-50,Math.min(...corners.map(p=>p.y))/sy),right=Math.min(w+50,Math.max(...corners.map(p=>p.x))/sx),bottom=Math.min(h+50,Math.max(...corners.map(p=>p.y))/sy);if(right<=left||bottom<=top)return;
      const cw=right-left,ch=bottom-top,zoom=Math.hypot(matrix.a,matrix.b)*Math.max(sx,sy),cap=window.MapMobileMode?1024:2048,scale=Math.min(Math.max(.25,zoom*(window.devicePixelRatio||1)),cap/Math.max(cw,ch)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(cw*scale));canvas.height=Math.max(1,Math.ceil(ch*scale));const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.translate(-left,-top);
      const visible=n.instances.filter(i=>{const r=Math.hypot(i.w,i.h)*.65,cx=i.x+i.w/2,cy=i.y+i.h/2;return cx+r>=left&&cx-r<=right&&cy+r>=top&&cy-r<=bottom;});
      const shade=i=>{if(!window.MapSurfaceLighting||(!n.part_image_id&&!MapSprites.has(n.type)))return null;const a=(n.rotation||0)*Math.PI/180,x=(i.x+i.w/2)*sx-n.w/2,y=(i.y+i.h/2)*sy-n.h/2;return MapSurfaceLighting.bitmap({...n,x:n.x+n.w/2+x*Math.cos(a)-y*Math.sin(a)-i.w*sx/2,y:n.y+n.h/2+x*Math.sin(a)+y*Math.cos(a)-i.h*sy/2,w:i.w*sx,h:i.h*sy,rotation:(n.rotation||0)+(i.rotation||0)},zoom>1.5?256:128);};
      const bitmaps=await Promise.all(visible.map(shade));
      if(!g.isConnected||current!==g._ambienceGeneration)return;
      const overviewKey=JSON.stringify([n.instances,n.w,n.h,n.rotation,n.opacity,MapSurfaceLighting.key]);if(g._overviewKey!==overviewKey){g._overviewKey=overviewKey;const overview=document.createElement('canvas'),overviewScale=Math.min(1,(window.MapMobileMode?768:1024)/Math.max(w+100,h+100));overview.width=Math.ceil((w+100)*overviewScale);overview.height=Math.ceil((h+100)*overviewScale);const oc=overview.getContext('2d');oc.scale(overviewScale,overviewScale);oc.translate(50,50);const overviewTiles=await Promise.all(n.instances.map(shade));if(!g.isConnected||current!==g._ambienceGeneration)return;for(let index=0;index<n.instances.length;index++){const i=n.instances[index];oc.save();oc.translate(i.x+i.w/2,i.y+i.h/2);oc.rotate((i.rotation||0)*Math.PI/180);oc.drawImage(overviewTiles[index]?.canvas||sprite.bitmap,-i.w/2,-i.h/2,i.w,i.h);oc.restore();}overview.toBlob(async blob=>{if(!blob)return;const url=URL.createObjectURL(blob),decoded=new Image();decoded.src=url;await decoded.decode();if(!g.isConnected||g._overviewKey!==overviewKey){URL.revokeObjectURL(url);return;}const image=g.querySelector('[data-ambience-overview]')||el('image',{},g);for(const [k,v] of Object.entries({href:url,x:-50*sx,y:-50*sy,width:(w+100)*sx,height:(h+100)*sy,'data-ambience-overview':n.type,preserveAspectRatio:'none'}))image.setAttribute(k,v);g.insertBefore(image,g.firstChild);const detail=g.querySelector('[data-ambience-batch]');if(detail)maskOverview(g,detail);if(g._overviewURL)URL.revokeObjectURL(g._overviewURL);g._overviewURL=url;});}
      visible.forEach((i,index)=>{ctx.save();ctx.translate(i.x+i.w/2,i.y+i.h/2);ctx.rotate((i.rotation||0)*Math.PI/180);ctx.drawImage(bitmaps[index]?.canvas||sprite.bitmap,-i.w/2,-i.h/2,i.w,i.h);ctx.restore();});
      canvas.toBlob(async blob=>{if(!blob||!g.isConnected||current!==g._ambienceGeneration)return;const url=URL.createObjectURL(blob),decoded=new Image();decoded.src=url;await decoded.decode();if(!g.isConnected||current!==g._ambienceGeneration){URL.revokeObjectURL(url);return;}const img=g.querySelector('[data-ambience-batch]')||el('image',{},g);for(const [k,v] of Object.entries({href:url,x:left*sx,y:top*sy,width:cw*sx,height:ch*sy,'data-ambience-batch':n.type,'data-visible-instances':visible.length,preserveAspectRatio:'none'}))img.setAttribute(k,v);g.removeAttribute('data-render-pending');maskOverview(g,img);if(g._ambienceURL)URL.revokeObjectURL(g._ambienceURL);g._ambienceURL=url;});
    };
    window.MapSurfaceLighting?.watch(g,paint);
    if(sprite.bitmap)paint();else if(sprite.ready)sprite.ready.then(paint).catch(()=>{});else if(sprite.complete&&sprite.naturalWidth)paint();else sprite.addEventListener('load',paint,{once:true});
  }
  function render(n,g){
    if(['water','river','lava','swamp','arcane'].includes(n.type)&&n.effects!==false)g.setAttribute('data-live-material',n.type);
    if(n.draft_outline){el('path',{d:n.draft_outline.map((p,i)=>(i?'L':'M')+p[0]+' '+p[1]).join(' '),fill:'none',stroke:'#ffe1a1','stroke-width':4,'stroke-linejoin':'round','stroke-linecap':'round'},g);el('circle',{cx:0,cy:0,r:14,fill:'none',stroke:'#ffe1a1','stroke-dasharray':'4 4'},g);return;}

    if(n.erasures?.length){
      const id='erase-'+n.id.replace(/[^a-zA-Z0-9_-]/g,''),defs=el('defs',{},g),mask=el('mask',{id,maskUnits:'userSpaceOnUse',x:-n.w,y:-n.h,width:n.w*3,height:n.h*3},defs);
      el('rect',{x:-n.w,y:-n.h,width:n.w*3,height:n.h*3,fill:'white'},mask);
      n.erasures.forEach(([x,y,rx,ry])=>el('ellipse',{cx:x*n.w,cy:y*n.h,rx:rx*n.w,ry:ry*n.h,fill:'black'},mask));
      g=el('g',{mask:'url(#'+id+')'},g);
    }
    if(n.instances){renderAmbience(n,g);return;}
    if(window.MapPartImages?.render(n,g,el))return;
    const partTexture=window.MapPartImages?.texture(n,g,el);
    if(partTexture&&MapArt.buildings.includes(n.type)){const material='part-floor-'+n.id,defs=el('defs',{},g);el('pattern',{id:'mapTexture-'+material,href:'#'+partTexture,width:160,height:160,patternUnits:'userSpaceOnUse'},defs);n={...n,floor_texture:material,rooms:n.rooms?.map(r=>({...r,floor_texture:material})),building_shapes:n.building_shapes?.map(r=>({...r,floor_texture:material}))};}
    if(window.MapBuildingRoofs?.render(n,g,el))return;
    if(window.MapSplineTextures?.render(n,g,el))return;
    if(n.building_shapes?.length){MapBuildingCurves.render(n,g,el);return;}
    if(n.rooms?.length){MapBuildings.render(n,g,el);return;}
    if(['building','hall','cottage','ruin'].includes(n.type)){
      const floor=n.floor_texture||'wood',wall=n.wall_texture||'stone',t=n.wall_width||12;
      el('rect',{width:n.w,height:n.h,fill:`url(#mapTexture-${floor})`,stroke:'#171d19','stroke-width':2},g);
      const walls=el('g',{filter:'url(#mapStampShadow)'},g);
      el('rect',{width:n.w,height:t,fill:`url(#mapTexture-${wall})`},walls);
      el('rect',{width:t,height:n.h,fill:`url(#mapTexture-${wall})`},walls);
      el('rect',{x:n.w-t,width:t,height:n.h,fill:`url(#mapTexture-${wall})`},walls);
      const gap=Math.min(40,n.w-2*t),side=(n.w-gap)/2;
      el('rect',{y:n.h-t,width:side,height:t,fill:`url(#mapTexture-${wall})`},walls);
      el('rect',{x:side+gap,y:n.h-t,width:side,height:t,fill:`url(#mapTexture-${wall})`},walls);
      el('path',{d:`M${side} ${n.h-t}v${-gap}a${gap} ${gap} 0 0 1 ${gap} ${gap}`,fill:'none',stroke:'#b79759','stroke-width':2},g);
      if(n.type==='hall')for(let y=40;y<n.h-30;y+=80)for(const x of [30,n.w-30])el('circle',{cx:x,cy:y,r:8,fill:`url(#mapTexture-${wall})`,stroke:'#30352c','stroke-width':2},g);
      if(n.type==='cottage')el('rect',{x:Math.max(20,n.w-60),y:t,width:36,height:22,fill:'url(#mapTexture-brick)',stroke:'#453429'},g);
      return;
    }
    if(MapTiledParts.render(n,g,el))return;
    if(!n._silhouette&&window.MapSprites?.render(n,g,el))return;
    if(art[n.type]){const a=el('g',{transform:`scale(${n.w/100} ${n.h/100})`,filter:window.MapPartProfiles?.isLight(n)?'none':MapArt.ambience?.includes(n.type)?'url(#mapGroundShadow)':'url(#mapStampShadow)'},g);a.innerHTML=art[n.type];window.MapPartProfiles?.texture(n,a,el);return;}
    if(n.type==='label'){el('text',{x:0,y:n.h*.75,fill:n.color||colors.label,'font-family':'Georgia, serif','font-size':n.h*.7,'font-style':'italic',textLength:n.w,lengthAdjust:'spacingAndGlyphs','paint-order':'stroke',stroke:'#262820','stroke-width':1},g).textContent=n.label||'New label';return;}
    const riverTexture=n.type==='river'?MapMaterials.riverSource(g.ownerSVGElement,n):null;
    const fill=partTexture?'url(#'+partTexture+')':riverTexture?'url(#'+riverTexture+')':n.type==='fog'?'#000000':colors[n.type]&&!['fog','zone','road','river'].includes(n.type)?`url(#mapTexture-${n.type}${n.effects===false&&['water','lava','swamp','arcane'].includes(n.type)?'-still':''})`:n.color||colors[n.type]||'#a49b7f';
    if(n.tile_cells?.length){const material=n.type==='river'?'water':n.type,source=partTexture||riverTexture||(MapMaterials.names.includes(material)?'mapTexture-'+material+(n.effects===false&&['water','lava','swamp','arcane'].includes(material)?'-still':''):null);MapTilePaint.render(n,g,el,fill,source);return;}
    if(n.shape==='stroke'&&n.points?.length){
      if(n.baseW&&n.baseH)g=el('g',{transform:`scale(${n.w/n.baseW} ${n.h/n.baseH})`},g);
      const pieces=MapBrushes.pieces(n),local=el('defs',{},g),id='stroke-'+n.id.replace(/[^a-zA-Z0-9_-]/g,''),material=n.spline_texture||(n.type==='river'?'water':n.type);
      const isMaterial=!!partTexture||MapMaterials.names.includes(material),paint=isMaterial?'url(#'+id+'-texture)':fill;
      if(isMaterial)el('pattern',{id:id+'-texture',href:partTexture||riverTexture?'#'+(partTexture||riverTexture):'#mapTexture-'+material+(n.effects===false&&['water','lava','swamp','arcane'].includes(material)?'-still':''),width:MapMaterials.period(material),height:MapMaterials.period(material),patternUnits:'userSpaceOnUse',patternTransform:`scale(${n.baseW?n.baseW/n.w:1} ${n.baseH?n.baseH/n.h:1}) translate(${-n.x} ${-n.y})`},local);
      const boxes=pieces.map(p=>MapBrushes.bounds(p,2));
      const x=Math.min(...boxes.map(b=>b[0])),y=Math.min(...boxes.map(b=>b[1])),bounds={x,y,width:Math.max(...boxes.map(b=>b[2]))-x,height:Math.max(...boxes.map(b=>b[3]))-y};
      const mask=el('mask',{id:id+'-mask',maskUnits:'userSpaceOnUse',...bounds},local);
      const outline=n.border?el('mask',{id:id+'-border',maskUnits:'userSpaceOnUse',...bounds},local):null;
      pieces.forEach((p,i)=>{const d=p.points.map((v,j)=>(j?'L':'M')+v[0]+' '+v[1]).join(' ')+(p.points.length===1?' l.01 .01':''),feather=(p.softness??.55)*p.brush*.12;
        if(feather>0&&(window.MapMobileMode||matchMedia('(pointer: coarse)').matches)){
          const attrs={d,...(p.transform?{transform:'matrix('+p.transform.join(' ')+')'}:{}),fill:'none',stroke:'white','stroke-linecap':'round','stroke-linejoin':'round'};
          for(const [spread,opacity] of [[2,.10],[1,.22],[0,.42],[-1,.75],[-2,1]]){el('path',{...attrs,'stroke-width':Math.max(1,p.brush+spread*feather),opacity},mask);if(outline)el('path',{...attrs,'stroke-width':Math.max(1,p.brush+6+spread*feather),opacity},outline);}return;
        }
        if(feather>0){const b=MapBrushes.bounds({...p,transform:undefined},2),f=el('filter',{id:id+'-soft-'+i,filterUnits:'userSpaceOnUse',x:b[0],y:b[1],width:b[2]-b[0],height:b[3]-b[1]},local);el('feGaussianBlur',{stdDeviation:feather},f);}
        const attrs={d,...(p.transform?{transform:'matrix('+p.transform.join(' ')+')'}:{}),fill:'none',stroke:'white','stroke-width':p.brush,'stroke-linecap':'round','stroke-linejoin':'round',...(feather>0?{filter:'url(#'+id+'-soft-'+i+')'}:{})};el('path',attrs,mask);if(outline)el('path',{...attrs,'stroke-width':p.brush+6},outline);
      });
      if(outline)el('rect',{...bounds,fill:n.type==='river'?'#304a46':'#b3a078',mask:'url(#'+id+'-border)'},g);
      el('rect',{...bounds,fill:paint,mask:'url(#'+id+'-mask)'},g);
      if(MapEffects.texture(n))el('rect',{...bounds,fill:MapEffects.texture(n),mask:'url(#'+id+'-mask)','pointer-events':'none','data-animated-texture':n.type},g);
      return;
    }

    el('rect',{width:n.w,height:n.h,fill,stroke:n.type==='zone'?'#ddc6dc':'#203026','stroke-opacity':.25,'stroke-width':1},g);
    if(MapEffects.texture(n))el('rect',{width:n.w,height:n.h,fill:MapEffects.texture(n),'pointer-events':'none','data-animated-texture':n.type},g);
  }
  window.MapArt={renderAmbience,colors,stamps:Object.keys(art),defs,render(n,g){render(n,g);window.MapTextureScale?.apply(n,g,el);},extend(extra,palette){Object.assign(art,extra);Object.assign(colors,palette);this.stamps=Object.keys(art);},icon(type){const texture=window.MapMaterials?.thumbnail(type);if(texture)return '<svg viewBox="0 0 100 100" aria-hidden="true"><image width="100" height="100" href="'+texture+'"/></svg>';const sprite=window.MapSprites?.icon(type);if(sprite)return sprite;if(type==='camera_bounds')return '<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="10" y="16" width="80" height="68" fill="none" stroke="#18222b" stroke-width="10"/><rect x="10" y="16" width="80" height="68" fill="none" stroke="#d9e9f2" stroke-width="10" stroke-dasharray="6 6"/></svg>';return `<svg viewBox="0 0 100 100" aria-hidden="true">${art[type]||`<rect x="8" y="8" width="84" height="84" rx="12" fill="${colors[type]||'#a49b7f'}"/><path d="M15 65q20-30 40 0t30-15M15 35q20-30 40 0t30-15" fill="none" stroke="#e4d6af" opacity=".3" stroke-width="4"/>`}</svg>`;}};
})();
