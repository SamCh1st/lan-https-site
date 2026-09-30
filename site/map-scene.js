/* Scene atmosphere: one bounded weather canvas, no per-particle DOM. */
(function(){
  let root,svg,canvas,context,light,edge,locationLabel,moodLabel,pace,scene={},buildings=[],timer=null,lastSignature='',temperatureLayer,temperatureFill,timeFill,weatherFill,temperatureMask,buildingSignature='',outdoorCanvas,pointLightsActive=false;
  let active=false;
  function setActive(value){if(active===value)return;active=value;MapLighting.setActive(value);clearTimeout(timer);timer=null;if(active){view();if(['Rain','Storm','Snow','Fog'].includes(scene.weather))paint();}}
  const time={Day:['0,0,0',0],Dawn:['123,77,111',.20],Morning:['249,202,121',.07],Evening:['115,53,25',.27],Night:['4,10,29',.57]};
  const temperature={Freezing:['97,165,236',.20],Cold:['120,181,231',.10],Mild:['0,0,0',0],Warm:['244,159,78',.09],Hot:['230,106,42',.18]};
  const visibility={Clear:[0,0],Dim:[.13,.32],Dark:[.32,.68],Obscured:[.43,.88]};
  const dangers={Uneasy:'168,80,219',Dangerous:'224,177,65',Combat:'239,32,32',Angry:'156,214,255'};
  const paces={Resting:'😴',Exploration:'🔎',Travel:'🥾','Social scene':'💬',Chase:'🏃',Combat:'⚔️'};
  function element(tag,id,parent){const n=document.createElement(tag);n.id=id;parent.append(n);return n;}
  function init(){root=document.getElementById('map2Surface');svg=document.getElementById('map2Canvas');canvas=element('canvas','mapSceneWeather',root);canvas.setAttribute('aria-hidden','true');context=canvas.getContext('2d');
    const ns='http://www.w3.org/2000/svg',make=(tag,attrs,parent)=>{const n=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));parent.append(n);return n;};
    temperatureLayer=make('svg',{id:'mapSceneTemperature','aria-hidden':'true'},root);const defs=make('defs',{},temperatureLayer),mask=make('mask',{id:'mapTemperatureOutside',maskUnits:'userSpaceOnUse',x:0,y:0,width:1,height:1},defs);make('rect',{x:0,y:0,width:1,height:1,fill:'white'},mask);temperatureMask=make('g',{fill:'black'},mask);timeFill=make('rect',{x:0,y:0,width:1,height:1,mask:'url(#mapTemperatureOutside)'},temperatureLayer);temperatureFill=make('rect',{x:0,y:0,width:1,height:1,mask:'url(#mapTemperatureOutside)'},temperatureLayer);weatherFill=make('rect',{x:0,y:0,width:1,height:1,mask:'url(#mapTemperatureOutside)'},temperatureLayer);view();
    if(window.MapMobileMode){temperatureLayer.style.display='none';outdoorCanvas=element('canvas','mapSceneOutdoorCanvas',root);outdoorCanvas.setAttribute('aria-hidden','true');}
    light=element('div','mapSceneLighting',root);edge=element('div','mapSceneEdges',root);light.setAttribute('aria-hidden','true');edge.setAttribute('aria-hidden','true');locationLabel=element('div','mapSceneLocation',root);moodLabel=element('div','mapSceneMood',root);pace=element('span','mapScenePace',root.querySelector('.map2-view-controls'));pace.setAttribute('role','img');MapLighting.init(root,svg);update({});}
  function update(value){if(!root)return;const key=JSON.stringify(value||{});if(key===lastSignature)return;lastSignature=key;scene={...value};
    const t=time[scene.time]||time.Day,c=temperature[scene.temperature]||temperature.Mild,v=visibility[scene.visibility]||visibility.Clear,d=dangers[scene.danger];
    const weatherShade=scene.weather==='Storm'?.18:scene.weather==='Cloudy'?.10:scene.weather==='Fog'?.13:0;
    MapLighting.update(scene);
    light.style.background=pointLightsActive?'none':`linear-gradient(rgba(0,0,0,${v[0]}),rgba(0,0,0,${v[0]}))`;
    weatherFill.setAttribute('fill',`rgba(0,0,0,${weatherShade})`);
    timeFill.setAttribute('fill',`rgba(${t[0]},${t[1]})`);
    temperatureFill.setAttribute('fill',`rgba(${c[0]},${c[1]})`);
    edge.style.background=`radial-gradient(ellipse at center,transparent 25%,rgba(0,0,0,${v[1]}) 100%)`;
    edge.style.boxShadow=d?`inset 0 0 48px 12px rgba(${d},.55)`:'';
    locationLabel.textContent=scene.location||'';locationLabel.hidden=!scene.location;
    moodLabel.textContent=scene.mood?'Mood · '+scene.mood:'';moodLabel.hidden=!scene.mood;
    const name=scene.pace||'Exploration';pace.textContent=paces[name]||'🔎';pace.title=name;pace.setAttribute('aria-label','Pace: '+name);
    drawOutdoor();
    canvas.dataset.weather=scene.weather||'Clear';clearTimeout(timer);timer=null;context.clearRect(0,0,canvas.width,canvas.height);if(['Rain','Storm','Snow','Fog'].includes(scene.weather))paint();
  }
  function geometry(nodes,settings={}){MapLighting.geometry(nodes,settings);const active=nodes.some(n=>!n.hidden&&MapPartProfiles.isLight(n));if(active!==pointLightsActive){pointLightsActive=active;temperatureLayer.style.visibility=active?'hidden':'';if(outdoorCanvas)outdoorCanvas.style.visibility=active?'hidden':'';const v=visibility[scene.visibility]||visibility.Clear;light.style.background=active?'none':`linear-gradient(rgba(0,0,0,${v[0]}),rgba(0,0,0,${v[0]}))`;}buildings=nodes.filter(n=>!n.hidden&&MapArt.buildings.includes(n.type)&&n.building_view!=='exterior').flatMap(n=>MapBuildingCurves.world(n).map(s=>MapLighting.orient(s.points)));if(!temperatureMask)return;const signature=JSON.stringify(buildings);if(signature===buildingSignature)return;buildingSignature=signature;temperatureMask.replaceChildren();for(const points of buildings){const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',points.map(([x,y],i)=>(i?'L':'M')+x+' '+y).join(' ')+' Z');path.setAttribute('stroke','black');path.setAttribute('stroke-width','2');temperatureMask.append(path);}drawOutdoor();if(['Rain','Storm','Snow','Fog'].includes(scene.weather))paint();}
  function view(){if(!temperatureLayer||!svg)return;MapLighting.view();for(const key of ['viewBox','preserveAspectRatio']){const value=svg.getAttribute(key);if(value&&temperatureLayer.getAttribute(key)!==value)temperatureLayer.setAttribute(key,value);}const values=(svg.getAttribute('viewBox')||'0 0 1 1').split(/\s+/).map(Number),bounds={x:values[0],y:values[1],width:values[2],height:values[3]};const rect=svg.getBoundingClientRect(),matrix=svg.getScreenCTM();if(matrix&&rect.width&&rect.height){const inverse=matrix.inverse(),a=new DOMPoint(rect.left,rect.top).matrixTransform(inverse),b=new DOMPoint(rect.right,rect.bottom).matrixTransform(inverse);Object.assign(bounds,{x:a.x,y:a.y,width:b.x-a.x,height:b.y-a.y});}for(const node of [temperatureLayer.querySelector('mask'),temperatureLayer.querySelector('mask > rect'),timeFill,temperatureFill,weatherFill])for(const [key,value] of Object.entries(bounds)){if(node.getAttribute(key)!==String(value))node.setAttribute(key,value);}drawOutdoor();if(['Rain','Storm','Snow','Fog'].includes(scene.weather))paint();}
  function drawOutdoor(){
    if(!outdoorCanvas)return;const rect=svg.getBoundingClientRect(),m=svg.getScreenCTM();if(!rect.width||!rect.height||!m)return;const scale=Math.min(1,1024/Math.max(rect.width,rect.height)),w=Math.ceil(rect.width*scale),h=Math.ceil(rect.height*scale);
    if(outdoorCanvas.width!==w||outdoorCanvas.height!==h){outdoorCanvas.width=w;outdoorCanvas.height=h;}const ctx=outdoorCanvas.getContext('2d');ctx.clearRect(0,0,w,h);ctx.save();ctx.scale(scale,scale);
    for(const fill of [timeFill,temperatureFill,weatherFill]){ctx.fillStyle=fill.getAttribute('fill')||'transparent';ctx.fillRect(0,0,rect.width,rect.height);}
    ctx.globalCompositeOperation='destination-out';ctx.fillStyle='#000';ctx.strokeStyle='#000';ctx.lineWidth=2;ctx.beginPath();for(const points of buildings){points.forEach(([x,y],i)=>{const px=m.a*x+m.c*y+m.e-rect.left,py=m.b*x+m.d*y+m.f-rect.top;i?ctx.lineTo(px,py):ctx.moveTo(px,py);});ctx.closePath();}ctx.fill();ctx.stroke();ctx.restore();
  }
  function paint(){clearTimeout(timer);timer=null;if(!active)return;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!root.getClientRects().length||document.hidden){timer=setTimeout(paint,500);return;}
    const box=svg.getBoundingClientRect(),w=Math.round(box.width),h=Math.round(box.height);if(!w||!h){timer=setTimeout(paint,500);return;}
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}context.clearRect(0,0,w,h);const now=reduced?0:performance.now(),snow=scene.weather==='Snow';
    if(scene.weather==='Fog'){context.fillStyle='rgba(189,200,207,.15)';context.fillRect(0,0,w,h);}else if(snow){
      const count=Math.min(80,Math.ceil(w*h/6500));context.fillStyle='rgba(242,248,255,.65)';context.beginPath();
      for(let i=0;i<count;i++){const x=((i*137.51+now*.008)%(w+30))-15,y=((i*93.17+now*.028)%(h+35))-20;context.moveTo(x+2,y);context.arc(x,y,1.5+i%2,0,Math.PI*2);}context.fill();
    }else{
      const mobile=(window.MapMobileMode||matchMedia('(pointer: coarse)').matches),storm=scene.weather==='Storm',count=Math.min(mobile?90:160,Math.ceil(w*h/(storm?4300:6500))),wind=(storm?.26:.12)+Math.sin(now/2800)*.035;
      const random=i=>{const n=Math.sin(i*127.1+311.7)*43758.5453;return n-Math.floor(n);};
      // Three batched depths, with independent lengths and speeds; no DOM particles.
      for(let depth=0;depth<3;depth++){
        context.strokeStyle=`rgba(190,217,235,${.16+depth*.12})`;context.lineWidth=.65+depth*.35;context.lineCap='round';context.beginPath();
        for(let i=depth;i<count;i+=3){const speed=(.25+random(i+9)*.24+depth*.08)*(storm?1.45:1),length=7+random(i+19)*13+depth*3,cycle=now*speed,y=(random(i+1)*(h+70)+cycle)%(h+70)-35,x=(random(i+101)*(w+100)+cycle*wind)%(w+100)-50;
          context.moveTo(x,y);context.lineTo(x+length*wind,y+length);
        }context.stroke();
      }
      // Small top-down impact rings, staggered across the outdoor map.
      const impacts=Math.min(mobile?14:24,Math.ceil(w*h/32000));
      for(let i=0;i<impacts;i++){const age=((now+random(i+501)*1100)%1100)/1100;if(age>.65)continue;const x=random(i+301)*w,y=random(i+401)*h,radius=1+age*7;context.strokeStyle=`rgba(202,224,234,${(1-age/.65)*.22})`;context.lineWidth=.7;context.beginPath();context.ellipse(x,y,radius,radius*.55,0,0,Math.PI*2);context.stroke();}
    }
    // Cut precipitation out of exact room footprints, including merged and rotated rooms.
    const m=svg.getScreenCTM();context.save();context.globalCompositeOperation='destination-out';context.fillStyle='#000';context.beginPath();for(const polygon of buildings){polygon.forEach(([x,y],i)=>{const px=m.a*x+m.c*y+m.e-box.left,py=m.b*x+m.d*y+m.f-box.top;i?context.lineTo(px,py):context.moveTo(px,py);});context.closePath();}context.fill();context.strokeStyle='#000';context.lineWidth=2;context.lineJoin='round';context.stroke();context.restore();
    if(scene.weather!=='Fog'&&!reduced)timer=setTimeout(paint,(window.MapMobileMode||matchMedia('(pointer: coarse)').matches)?42:33);
  }
  window.MapScene={init,update,geometry,view,setActive};
})();
