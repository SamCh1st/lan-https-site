/* Procedural, seamless material tiles shaded with a metallic/roughness GGX BRDF.
   The top-down SVG editor uses these baked tiles; changing the light rebakes them.
   Relief provides surface normals and short-range height occlusion. Part heightmaps
   are projected separately by MapLighting for daylight and local cast shadows. */
(function(){
  'use strict';
  const tileSize=640,mobile=window.MapMobileMode||matchMedia('(pointer: coarse)').matches;let resolution=mobile?128:512,qualityTimer=0;
  const quality=root=>{const zoom=Math.abs(root.getScreenCTM()?.a||1);return mobile?(zoom>2?512:zoom>1?256:128):(zoom>1.25?1024:512);};
  const names=['grass','water','sand','stone','snow','wood','path','wall','marble','brick','cobble','slate','iron','moss','mud','lava','swamp','ice','gravel','basalt','tiles','carpet','arcane'];
  const photoFiles={stone:'masonry',wall:'masonry',cobble:'cobble',wood:'wood'},photoTextures=new Map(),photoImages=new Map(),photoSettings=new WeakMap();let gl,program,canvas;const rootKeys=new WeakMap(),cache=new Map(),flowTypes=['water','lava','swamp','arcane'];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),animations=new WeakMap(),frameCount=8;
  let flowRoot=null,flowNames=new Set(),flowRivers=[],flowTimer=0,flowSettings={};
  function animate(){
    flowTimer=0;if(!flowRoot?.isConnected||!flowRoot.getClientRects().length||(!flowNames.size&&!flowRivers.length)||reduced.matches||document.hidden)return;
    const now=performance.now();
    for(const name of flowNames){const a=animations.get(flowRoot)?.get(name);if(!a?.ready)continue;const phase=now/(name==='lava'||name==='swamp'?11000:6500)*frameCount,index=Math.floor(phase)%frameCount,next=(index+1)%frameCount;
      if(a.index!==index){a.front.setAttribute('href',a.frames[index]);a.back.setAttribute('href',a.frames[next]);a.index=index;}a.back.setAttribute('opacity',(phase%1).toFixed(3));}
    for(const pattern of flowRivers){const x=((now*Number(pattern.dataset.flowX)*.02)%tileSize+tileSize)%tileSize,y=((now*Number(pattern.dataset.flowY)*.02)%tileSize+tileSize)%tileSize;pattern.firstElementChild.setAttribute('transform',`translate(${x.toFixed(3)} ${y.toFixed(3)})`);}
    flowTimer=setTimeout(animate,mobile?125:66);
  }
  function resumeFlow(){if(flowRoot&&!reduced.matches)flowNames.forEach(name=>prepareAnimation(flowRoot,name,flowSettings));if(!flowTimer)animate();}
  document.addEventListener('visibilitychange',resumeFlow);reduced.addEventListener('change',resumeFlow);
  const vertex='attribute vec2 p;varying vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
  const fragment=`precision highp float;uniform sampler2D photo;uniform float usePhoto,photoRepeat;
  varying vec2 uv;uniform float kind;uniform float texel;uniform float angle;uniform float relief;uniform float seed;uniform float phase;
  const float PI=3.14159265;
  float hash(vec2 p){return fract(sin(dot(p+vec2(seed*.731,seed*.193)+kind*17.31,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p,float cells){p*=cells;vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(mod(i,cells)),hash(mod(i+vec2(1,0),cells)),f.x),mix(hash(mod(i+vec2(0,1),cells)),hash(mod(i+1.,cells)),f.x),f.y);}
  float grain(vec2 p){return noise(p,16.)*.35+noise(p,64.)*.30+noise(p,128.)*.20+noise(p,256.)*.15;}
  vec4 material(vec2 p){if(usePhoto>.5){vec3 rgb=texture2D(photo,fract(p*photoRepeat)).rgb;float lum=dot(rgb,vec3(.299,.587,.114));return vec4(rgb,.35+lum*.22);} if(abs(kind-15.)<.5||abs(kind-16.)<.5||kind>21.5)p+=vec2(sin(phase)*sin(p.y*PI*8.),(cos(phase)-1.)*sin(p.x*PI*8.))*.009;
    if(abs(kind-5.)>.5)p+=vec2(noise(p,4.)-.5,noise(p+vec2(.37,.71),4.)-.5)*.026;float n=grain(p),h=n;vec3 c=vec3(.28,.36,.15);
    if(kind<.5){float tufts=noise(p,32.),blades=pow(noise(p,128.),2.);h=n*.35+tufts*.35+blades*.3;c=mix(vec3(.10,.17,.055),vec3(.46,.50,.22),n*.55+tufts*.3+blades*.15);}
    else if(kind<1.5){h=.5+.12*sin(p.x*PI*12.+sin(p.y*PI*8.)*2.)*cos(phase)+.09*cos(p.y*PI*16.+sin(p.x*PI*8.))*sin(phase)+.045*sin((p.x+p.y)*PI*24.)*cos(phase*2.);c=mix(vec3(.025,.16,.20),vec3(.10,.33,.36),n);}
    else if(kind<2.5){h=n*.35;c=mix(vec3(.49,.35,.18),vec3(.77,.66,.41),n);}
    else if(kind<3.5||abs(kind-7.)<.5||abs(kind-9.)<.5){vec2 cells=kind<3.5?vec2(8.,8.):abs(kind-7.)<.5?vec2(12.,24.):vec2(16.,32.);vec2 cell=p*cells;cell.x+=mod(floor(cell.y),2.)*.5;vec2 f=fract(cell);float edge=min(min(f.x,1.-f.x),min(f.y,1.-f.y));float mortar=smoothstep(.025,.075+(n-.5)*.04,edge);float block=hash(mod(floor(cell),cells));h=mortar*(.52+.22*n+.16*block);c=mix(vec3(.13,.14,.12),vec3(.32,.35,.31)+block*.22+(n-.5)*.10,mortar);if(abs(kind-9.)<.5)c=mix(vec3(.18,.16,.13),vec3(.42,.22,.13)+block*vec3(.19,.13,.08)+(n-.5)*.09,mortar);}
    else if(kind<4.5){h=n*.3;c=mix(vec3(.60,.69,.70),vec3(.91,.94,.90),n);}
    else if(kind<5.5){float board=floor(p.y*32.),stagger=mod(board,4.)*.25;vec2 cell=vec2(p.x*8.+stagger,p.y*32.),f=fract(cell);float seam=smoothstep(.006,.018,min(f.x,1.-f.x))*smoothstep(.018,.045,min(f.y,1.-f.y));float tone=hash(vec2(mod(floor(cell.x),8.),mod(board,32.)));float fibers=noise(vec2(p.x,p.y*4.),64.)*.65+(.5+.5*sin(p.y*PI*512.+sin(p.x*PI*8.)*1.5+noise(p,8.)*3.))*.35;float wear=noise(p,32.);h=.40+seam*.045+fibers*.009+wear*.012;c=mix(vec3(.20,.15,.105),mix(vec3(.34,.25,.16),vec3(.58,.46,.32),.25+tone*.40+fibers*.18)+(wear-.5)*.035,seam);}
    else if(kind<6.5){h=n*.4;c=mix(vec3(.31,.23,.13),vec3(.55,.44,.28),n);}
    else if(abs(kind-8.)<.5){float vein=pow(.5+.5*sin(p.x*PI*12.+noise(p,8.)*12.+noise(p,32.)*2.),18.);h=n*.035;c=mix(vec3(.74,.75,.68),vec3(.29,.36,.34),vein*.8);}
    else if(kind<10.5){vec2 q=p*24.,i=floor(q);float dist=10.,stone=0.;for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){vec2 cell=i+vec2(float(x),float(y));vec2 seed=vec2(hash(mod(cell,24.)),hash(mod(cell+37.,24.)));float d=length(cell+.25+seed*.5-q);if(d<dist){dist=d;stone=hash(mod(cell+81.,24.));}}h=smoothstep(.64,.34,dist)*(.6+stone*.2)+n*.1;c=mix(vec3(.13,.16,.12),vec3(.30,.34,.29)+stone*.19,smoothstep(.65,.48,dist));}
    else if(kind<11.5){float strata=floor(noise(p,16.)*9.)/9.,vein=pow(.5+.5*sin((p.x+p.y)*PI*16.+noise(p,8.)*10.),24.);h=n*.22+strata*.14;c=mix(vec3(.13,.19,.20),vec3(.40,.46,.44),n*.65+strata*.35)+vein*.045;}
    else if(kind<12.5){h=n*.04;c=mix(vec3(.33,.36,.38),vec3(.54,.56,.57),n);}
    else if(kind<13.5){h=n*.65;c=mix(vec3(.10,.19,.055),vec3(.38,.43,.16),n);}
    else if(kind<14.5){h=n*.4;c=mix(vec3(.12,.085,.045),vec3(.29,.22,.12),n);}
    else if(kind<15.5){float cracks=pow(1.-abs(sin(p.x*PI*16.+noise(p,8.)*10.)*sin(p.y*PI*16.+noise(p,16.)*5.)),9.);h=n*.4+cracks*.15;c=mix(vec3(.10,.07,.06),vec3(1.,.32,.025),cracks);}
    else if(kind<16.5){h=n*.14;c=mix(vec3(.055,.14,.09),vec3(.28,.36,.14),n);}
    else if(kind<17.5){float crack=pow(.5+.5*sin((p.x+p.y)*PI*16.+noise(p,8.)*9.),30.);h=n*.08+crack*.05;c=mix(vec3(.24,.48,.59),vec3(.73,.87,.86),n*.6+crack*.4);}
    else if(kind<18.5){float pebble=noise(p,128.);h=pebble*.6;c=mix(vec3(.23,.22,.18),vec3(.58,.56,.47),pebble);}
    else if(kind<19.5){h=n*.3;c=mix(vec3(.065,.08,.095),vec3(.24,.27,.29),n);}
    else if(kind<20.5){vec2 f=fract(p*16.);float seam=smoothstep(.02,.06,min(min(f.x,1.-f.x),min(f.y,1.-f.y)));float check=mod(floor(p.x*16.)+floor(p.y*16.),2.);h=seam*.65;c=mix(vec3(.13,.15,.14),mix(vec3(.23,.32,.30),vec3(.67,.64,.51),check),seam);}
    else if(kind<21.5){float weave=.5+.5*sin(p.x*PI*512.)*sin(p.y*PI*512.);h=weave*.08+n*.1;c=mix(vec3(.22,.06,.09),vec3(.48,.20,.21),n*.7+weave*.3);}
    else {float vein=pow(.5+.5*sin(p.x*PI*16.+noise(p,8.)*8.),16.);h=n*.1;c=mix(vec3(.10,.08,.20),vec3(.33,.48,.56),vein);}

    c*=.87+noise(p,4.)*.22;h+=noise(p,256.)*.012;return vec4(c,h);
  }
  void main(){vec4 m=material(uv);float e=texel;float dx=material(uv+vec2(e,0)).a-material(uv-vec2(e,0)).a;float dy=material(uv+vec2(0,e)).a-material(uv-vec2(0,e)).a;
    vec3 N=normalize(vec3(-dx*relief*9./(texel*512.),-dy*relief*9./(texel*512.),1.));vec3 L=normalize(vec3(cos(angle)*.75,sin(angle)*.75,.8)),V=vec3(0,0,1),H=normalize(L+V);
    float rough=.88,metal=0.;if(abs(kind-1.)<.5)rough=.20;if(abs(kind-8.)<.5)rough=.27;if(abs(kind-12.)<.5){rough=.32;metal=.9;}if(abs(kind-14.)<.5||abs(kind-16.)<.5)rough=.4;if(abs(kind-17.)<.5)rough=.16;
    rough=clamp(rough+(grain(uv)-.5)*.13,.12,1.);float nl=max(dot(N,L),0.),nv=max(N.z,.001),nh=max(dot(N,H),0.),vh=max(H.z,0.);
    vec3 albedo=pow(m.rgb,vec3(2.2));vec3 f0=mix(vec3(.04),albedo,metal);vec3 F=f0+(1.-f0)*pow(1.-vh,5.);
    float a=rough*rough,a2=a*a,den=nh*nh*(a2-1.)+1.,D=a2/(PI*den*den),k=(rough+1.)*(rough+1.)/8.;float G=nv/(nv*(1.-k)+k)*nl/(nl*(1.-k)+k);
    vec3 spec=D*G*F/max(.001,4.*nl*nv);vec3 diffuse=(1.-F)*(1.-metal)*albedo/PI;float ao=.75+.25*m.a;
    vec2 ray=vec2(cos(angle),sin(angle));float nearHeight=material(uv+ray*.006).a,farHeight=material(uv+ray*.018).a;
    float horizon=max(nearHeight-m.a-.06,farHeight-m.a-.18);float visibility=1.-clamp(horizon*relief*2.5,0.,.55);
    vec3 lit=albedo*.38*ao+(diffuse+spec)*nl*2.8*visibility;lit=lit/(lit+vec3(.65));gl_FragColor=vec4(pow(lit,vec3(1./2.2)),1.);
  }`;
  function init(){canvas=document.createElement('canvas');canvas.width=canvas.height=resolution;gl=canvas.getContext('webgl',{preserveDrawingBuffer:true});if(!gl)return;
    function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
    program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);const fallback=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,fallback);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([128,128,128,255]));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const p=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);gl.viewport(0,0,resolution,resolution);
  }
  function uniforms(settings,size){
    if(!gl)init();if(!gl)return false;
    if(resolution!==size){resolution=size;canvas.width=canvas.height=size;gl.viewport(0,0,size,size);}
    gl.useProgram(program);gl.uniform1f(gl.getUniformLocation(program,'usePhoto'),0);gl.uniform1f(gl.getUniformLocation(program,'texel'),1/size);
    gl.uniform1f(gl.getUniformLocation(program,'angle'),(settings.light_angle??315)*Math.PI/180);
    gl.uniform1f(gl.getUniformLocation(program,'relief'),settings.relief??1);gl.uniform1f(gl.getUniformLocation(program,'seed'),settings.texture_seed??1);gl.uniform1f(gl.getUniformLocation(program,'phase'),0);return true;
  }
  function loadPhoto(root,name){const file=photoFiles[name];if(!file)return;
    if(!photoImages.has(file)){const img=new Image();img.src='/assets/map-art/materials/detailed-'+file+'.png';photoImages.set(file,img.decode().then(()=>img));}
    photoImages.get(file).then(img=>{if(!root.isConnected)return;if(!photoTextures.has(file)){const tile=document.createElement('canvas');tile.width=tile.height=1024;tile.getContext('2d').drawImage(img,0,0,1024,1024);const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,tile);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);photoTextures.set(file,texture);}uniforms(photoSettings.get(root)||{},mobile?256:1024);bake(root,name);root.dispatchEvent(new CustomEvent('map-material-ready',{detail:name}));}).catch(e=>console.warn('Map material image:',e.message));
  }
  function bake(root,name){
    const pattern=root.querySelector('#mapTexture-'+name);if(!pattern)return;
    const photo=photoTextures.get(photoFiles[name]);gl.uniform1f(gl.getUniformLocation(program,'usePhoto'),photo?1:0);if(photo){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,photo);gl.uniform1i(gl.getUniformLocation(program,'photo'),0);gl.uniform1f(gl.getUniformLocation(program,'photoRepeat'),1);}else if(photoFiles[name])loadPhoto(root,name);
    gl.uniform1f(gl.getUniformLocation(program,'phase'),0);gl.uniform1f(gl.getUniformLocation(program,'kind'),names.indexOf(name));gl.drawArrays(gl.TRIANGLES,0,6);
    const size=period(name),url=canvas.toDataURL();cache.set(name,url);pattern.replaceChildren();const img=document.createElementNS('http://www.w3.org/2000/svg','image');
    img.setAttribute('width',size);img.setAttribute('height',size);img.setAttribute('href',url);
    pattern.setAttribute('width',size);pattern.setAttribute('height',size);pattern.dataset.resolution=String(resolution);
    if(flowTypes.includes(name)){
      const ns='http://www.w3.org/2000/svg',group=document.createElementNS(ns,'g');group.setAttribute('data-texture-flow',name);group.setAttribute('data-motion','ripple');group.append(img);
      const back=img.cloneNode(true);back.setAttribute('opacity',0);group.append(back);pattern.append(group);
      if(!animations.has(root))animations.set(root,new Map());animations.get(root).set(name,{frames:[url],front:img,back,size:resolution,index:-1});
      let still=root.querySelector('#mapTexture-'+name+'-still');if(!still){still=document.createElementNS(ns,'pattern');still.setAttribute('id','mapTexture-'+name+'-still');still.setAttribute('patternUnits','userSpaceOnUse');pattern.parentElement.append(still);}
      still.setAttribute('width',tileSize);still.setAttribute('height',tileSize);const frozen=img.cloneNode(true);frozen.removeAttribute('id');still.replaceChildren(frozen);
    }else pattern.append(img);
    root.dispatchEvent(new CustomEvent('map-material-ready',{detail:name}));
  }
  // Bake a short seamless loop once per visible material and quality level. Runtime
  // animation only blends these shared, lit images; it never shades each map part.
  function prepareAnimation(root,name,settings){
    const a=animations.get(root)?.get(name);if(!a||a.ready||a.pending||reduced.matches)return;a.pending=true;
    const schedule=fn=>window.requestIdleCallback?requestIdleCallback(fn,{timeout:1500}):setTimeout(fn,30);
    async function next(){if(!root.isConnected||animations.get(root)?.get(name)!==a)return;
      if(document.hidden||!root.getClientRects().length){a.pending=false;return;}
      try{if(!uniforms(settings,a.size))return;gl.uniform1f(gl.getUniformLocation(program,'kind'),names.indexOf(name));gl.uniform1f(gl.getUniformLocation(program,'phase'),a.frames.length*Math.PI*2/frameCount);gl.drawArrays(gl.TRIANGLES,0,6);
        const url=canvas.toDataURL(),decoded=new Image();decoded.src=url;await decoded.decode();if(animations.get(root)?.get(name)!==a)return;a.frames.push(url);
        if(a.frames.length<frameCount)schedule(next);else{a.ready=true;a.pending=false;a.front.parentElement.dataset.frames=String(frameCount);resumeFlow();}
      }catch(error){a.pending=false;console.warn('Map ripple animation:',error.message);}
    }schedule(next);
  }
  function riverSource(root,n){
    if(n.effects===false)return 'mapTexture-water-still';
    const value=(v,fallback)=>Number.isFinite(Number(v))?Math.round(Math.max(-2,Math.min(2,Number(v)))*100)/100:fallback,vx=value(n.flow_x??0,0),vy=value(n.flow_y??1,1),angle=(n.rotation||0)*Math.PI/180;
    // X and Y refer to map directions even when the river part is rotated.
    const x=Math.round((vx*Math.cos(angle)+vy*Math.sin(angle))*10000)/10000,y=Math.round((-vx*Math.sin(angle)+vy*Math.cos(angle))*10000)/10000,id='mapRiverFlow-'+String(x).replace('-','n').replace('.','p')+'-'+String(y).replace('-','n').replace('.','p');
    if(!root.querySelector('#'+id)){const ns='http://www.w3.org/2000/svg',pattern=document.createElementNS(ns,'pattern');for(const [key,v] of Object.entries({id,width:tileSize,height:tileSize,patternUnits:'userSpaceOnUse','data-flow-x':x,'data-flow-y':y}))pattern.setAttribute(key,v);
      const image=document.createElementNS(ns,'rect');for(const [key,v] of Object.entries({x:-tileSize,y:-tileSize,width:tileSize*2,height:tileSize*2,fill:'url(#mapTexture-water)'}))image.setAttribute(key,v);pattern.append(image);root.querySelector('defs').append(pattern);
    }return id;
  }
  function splineSource(root,n,material){
    if(!flowTypes.includes(material))return 'mapTexture-'+material;
    if(n.effects===false)return 'mapTexture-'+material+'-still';
    const speed=Math.max(-2,Math.min(2,n.spline_flow??1)),id='mapRiverFlow-spline-'+material+'-'+String(speed).replace('-','n').replace('.','p');
    if(!root.querySelector('#'+id)){const ns='http://www.w3.org/2000/svg',pattern=document.createElementNS(ns,'pattern');for(const [key,v] of Object.entries({id,width:tileSize,height:tileSize,patternUnits:'userSpaceOnUse','data-flow-x':speed,'data-flow-y':0,'data-spline-flow':true}))pattern.setAttribute(key,v);const rect=document.createElementNS(ns,'rect');for(const [key,v] of Object.entries({x:-tileSize,y:-tileSize,width:tileSize*2,height:tileSize*2,fill:'url(#mapTexture-'+material+')'}))rect.setAttribute(key,v);pattern.append(rect);root.querySelector('defs').append(pattern);}return id;
  }
  let generation=0;
  function update(root,settings={}){photoSettings.set(root,{...settings});
    const key=(settings.light_angle??315)+':'+(settings.relief??1)+':'+(settings.texture_seed??1);if(key===rootKeys.get(root))return;
    generation++;clearTimeout(qualityTimer);
    try{if(!uniforms(settings,mobile?128:512)){root.dataset.materialRenderer='flat-fallback';return;}
      names.forEach(name=>bake(root,name));root.dataset.materialRenderer='pbr';root.dataset.materialResolution=String(resolution);rootKeys.set(root,key);
    }catch(error){root.dataset.materialRenderer='flat-fallback';console.warn('Map material fallback:',error.message);}
  }
  function view(root,settings,ready){
    clearTimeout(qualityTimer);const token=++generation;if(root.dataset.materialRenderer==='flat-fallback')return;
    // Only refine materials used by the visible scene; each tile yields to input.
    qualityTimer=setTimeout(()=>{
      const target=quality(root),used=new Set();
      root.querySelectorAll('[data-part-material]').forEach(p=>used.add(p.dataset.partMaterial));
      root.querySelectorAll('[fill],[href]').forEach(p=>{if(p.closest('defs')?.parentElement===root)return;for(const attr of ['fill','href']){const value=p.getAttribute(attr)||'',match=value.match(/#mapTexture-([a-z]+)/);if(match)used.add(match[1]);}});
      const riverIds=new Set();root.querySelectorAll('[fill],[href]').forEach(p=>{if(p.closest('defs')?.parentElement===root)return;for(const attr of ['fill','href']){const match=(p.getAttribute(attr)||'').match(/#(mapRiverFlow-[\w-]+)/);if(match)riverIds.add(match[1]);}});
      root.querySelectorAll('[data-flow-x]').forEach(pattern=>{if(!riverIds.has(pattern.id))pattern.remove();});
      flowRoot=root;flowSettings={...settings};flowRivers=[...riverIds].map(id=>root.querySelector('#'+id)).filter(Boolean);for(const p of flowRivers){const material=p.firstElementChild.getAttribute('fill')?.match(/#mapTexture-([a-z]+)/)?.[1];if(material)used.add(material);}flowNames=new Set([...used].filter(name=>flowTypes.includes(name)));resumeFlow();
      const pending=[...used].filter(name=>names.includes(name)&&Number(root.querySelector('#mapTexture-'+name)?.dataset.resolution)<target);
      if(!pending.length){root.dataset.materialResolution=String(target);flowNames.forEach(name=>prepareAnimation(root,name,settings));return;}
      function next(){if(token!==generation||!root.isConnected)return;try{if(!uniforms(settings,target))return;bake(root,pending.shift());}catch(error){console.warn('Map detail refinement:',error.message);return;}
        if(pending.length){if(window.requestIdleCallback)requestIdleCallback(next,{timeout:500});else setTimeout(next,20);}
        else{root.dataset.materialResolution=String(target);flowNames.forEach(name=>prepareAnimation(root,name,settings));ready?.();}
      }
      if(window.requestIdleCallback)requestIdleCallback(next,{timeout:500});else setTimeout(next,20);
    },260);
  }
  function period(type){return photoFiles[type]?(type==='wood'?160:80):tileSize;}
  function thumbnail(type){const name=type==='river'?'water':type==='road'?'path':type;return names.includes(name)?'/assets/map-art/materials/'+(photoFiles[name]?'detailed-'+photoFiles[name]:name)+'.png?v=20260920-repaired':null;}
  window.MapMaterials={names,tileSize,period,update,view,riverSource,splineSource,thumbnail,preview:name=>cache.get(name)};
})();
