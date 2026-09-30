(function () {
  'use strict';
  const canUse3D=()=>!!window.MapWorkspace?.active&&window.MapWorkspace.kind==='3d';
  function initialize3D(){
  const events=new AbortController();
  let disposed=false;
  // Only persistent targets need explicit cleanup; detached tree rows are collected normally.
  function listen(target,type,handler,options){
    const persistent=target===window||target===document||target.isConnected;
    target.addEventListener(type,handler,persistent?{...(typeof options==='boolean'?{capture:options}:options),signal:events.signal}:options);
  }


  const canvas = document.getElementById('campaignMapCanvas');
  const message = document.getElementById('mapMessage') || { textContent: '' };
  const world = document.getElementById('mapPlaceholder');
  const playerLayer = document.getElementById('mapPlayerLayer');
  if (!canvas) return;
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false, stencil: true, depth: true, powerPreference: 'high-performance' });
  if (!gl) {
    message.textContent = 'This browser cannot open the 3D map.';
    return;
  }
  const maxWarmLights=12;

  const vertexSource = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    uniform mat4 uProjection, uView, uModel;
    uniform mat3 uNormalMatrix;
    varying vec3 vNormal;
    varying vec3 vWorld;
    varying vec3 vLocal;
    void main() {
      vec4 world = uModel * vec4(aPosition, 1.0);
      vWorld = world.xyz;
      vLocal = aPosition;
      vNormal = normalize(uNormalMatrix * aNormal);
      gl_Position = uProjection * uView * world;
    }`;
  const fragmentSource = `
    precision mediump float;
    uniform vec4 uColor;
    uniform vec3 uLightDirection;
    uniform vec3 uCamera;
    uniform float uUnlit, uAmbient, uPattern, uSkyNight, uWeather, uRoughness, uNormalStrength, uHasTexture, uFogDensity, uTime;
    uniform sampler2D uAlbedoAtlas, uNormalAtlas, uRoughnessAtlas;
    uniform vec4 uTextureRect;
    uniform vec3 uCelestialDirection, uFogColor;
    uniform vec3 uWarmLights[${maxWarmLights}];
    uniform float uWarmLightCount;
    varying vec3 vNormal;
    varying vec3 vWorld;
    varying vec3 vLocal;
    float hash21(vec2 value){return fract(sin(dot(value,vec2(127.1,311.7)))*43758.5453);}
    float skyNoise(vec2 point){
      vec2 cell=floor(point),part=fract(point);part=part*part*(3.0-2.0*part);
      float a=hash21(cell),b=hash21(cell+vec2(1.0,0.0)),c=hash21(cell+vec2(0.0,1.0)),d=hash21(cell+vec2(1.0,1.0));
      return mix(mix(a,b,part.x),mix(c,d,part.x),part.y);
    }
    float skyFbm(vec2 point){
      float value=skyNoise(point)*.52;point=point*2.03+vec2(13.7,9.2);
      value+=skyNoise(point)*.26;point=point*2.01+vec2(7.1,15.4);
      value+=skyNoise(point)*.13;point=point*2.04+vec2(11.3,4.8);
      value+=skyNoise(point)*.065;return value;
    }
    void main() {
      vec4 surface = uColor;
      vec3 textureNormal=abs(normalize(vNormal));
      vec2 textureWorld=textureNormal.y>=textureNormal.x&&textureNormal.y>=textureNormal.z?vWorld.xz:(textureNormal.x>=textureNormal.z?vWorld.zy:vWorld.xy);
      vec3 textureTangent=textureNormal.y>=textureNormal.x&&textureNormal.y>=textureNormal.z?vec3(1.0,0.0,0.0):(textureNormal.x>=textureNormal.z?vec3(0.0,0.0,1.0):vec3(1.0,0.0,0.0));
      vec3 textureBitangent=textureNormal.y>=textureNormal.x&&textureNormal.y>=textureNormal.z?vec3(0.0,0.0,1.0):(textureNormal.x>=textureNormal.z?vec3(0.0,1.0,0.0):vec3(0.0,1.0,0.0));
      vec2 tile=floor(textureWorld*2.0),tileUv=fract(textureWorld*2.0);
      float tileTurn=floor(hash21(tile)*4.0);
      if(tileTurn<.5)tileUv=tileUv;else if(tileTurn<1.5)tileUv=vec2(1.0-tileUv.y,tileUv.x);else if(tileTurn<2.5)tileUv=1.0-tileUv;else tileUv=vec2(tileUv.y,1.0-tileUv.x);
      vec2 texturePixel=floor(tileUv*16.0);
      float pixelNoise=hash21(texturePixel+tile*19.0);
      vec2 atlasUv=uTextureRect.xy+tileUv*uTextureRect.zw;
      vec3 mappedTextureNormal=vec3(0.0,0.0,1.0);
      float sampledRoughness=uRoughness;
      if(uHasTexture>.5){
        vec3 tiledAlbedo=texture2D(uAlbedoAtlas,atlasUv).rgb;
        surface.rgb*=mix(vec3(1.0),tiledAlbedo*1.28,.86);
        mappedTextureNormal=texture2D(uNormalAtlas,atlasUv).rgb*2.0-1.0;
        sampledRoughness=clamp(uRoughness*(.72+texture2D(uRoughnessAtlas,atlasUv).r*.48),.025,1.0);
      }
      if (uPattern > 0.5 && uPattern < 1.5) {
        float joints=step(14.5,texturePixel.x)+step(14.5,texturePixel.y);
        surface.rgb*=.76+pixelNoise*.3-min(joints,1.0)*.18;
      } else if (uPattern > 1.5 && uPattern < 2.5) {
        float blades=step(.76,pixelNoise)*step(mod(texturePixel.x+texturePixel.y,3.0),.5);
        surface.rgb*=.7+pixelNoise*.28+blades*.25;
      } else if (uPattern > 2.5 && uPattern < 3.5) {
        float mist = sin(vWorld.x * 2.2 + sin(vWorld.z * 1.7)) * sin(vWorld.z * 2.5 - vWorld.x);
        surface.rgb *= .9 + mist * .1; surface.a *= .65 + mist * .18;
      } else if (uPattern > 3.5 && uPattern < 4.5) {
        float lattice = max(step(.91, fract((vWorld.x + vWorld.z) * 2.0)), step(.91, fract((vWorld.x - vWorld.z) * 2.0)));
        surface.rgb = mix(surface.rgb, vec3(.9,.55,1.0), lattice * .48);
      } else if (uPattern > 4.5 && uPattern < 5.5) {
        vec3 direction=normalize(vWorld-uCamera),celestial=normalize(uCelestialDirection);
        float up=clamp(direction.y,0.0,1.0),skyHeight=smoothstep(-.08,.86,direction.y),horizonBand=pow(1.0-clamp(abs(direction.y),0.0,1.0),5.0);
        float towardBody=dot(direction,celestial),lowSun=1.0-smoothstep(.42,.82,celestial.y),sunsetFacing=pow(max(dot(normalize(direction.xz+vec2(.0001)),normalize(celestial.xz+vec2(.0001))),0.0),4.0);
        vec3 bodyColor=mix(vec3(1.0,.975,.88),vec3(.82,.88,1.0),uSkyNight);
        vec3 zenith=surface.rgb*mix(1.18,.62,uSkyNight),dayHorizon=surface.rgb*1.48+vec3(.2,.25,.28),nightHorizon=vec3(.055,.075,.14);
        vec3 horizonColor=mix(dayHorizon,nightHorizon,uSkyNight);
        horizonColor=mix(horizonColor,vec3(1.0,.3,.08),sunsetFacing*lowSun*(1.0-uSkyNight)*.48);
        vec3 skyColor=mix(horizonColor,zenith,skyHeight);
        skyColor+=vec3(.035,.09,.18)*pow(up,.72)*(1.0-uSkyNight);
        float halo=smoothstep(.78,.998,towardBody),disc=smoothstep(.9972,.99965,towardBody),mie=pow(max(towardBody,0.0),8.0)*(1.0-up*.34);
        skyColor+=bodyColor*mie*.075*(1.0-uSkyNight)*(1.0-clamp(uWeather*.35,0.0,.7));
        vec2 cloudPlane=direction.xz/max(direction.y+.32,.13);
        vec2 cloudWind=vec2(uTime*.045,uTime*.018);
        vec2 cloudCoord=cloudPlane*.72+cloudWind;
        float broadCloud=skyFbm(cloudCoord*.72),detailCloud=skyFbm(cloudCoord*1.92+vec2(8.2,3.7));
        float cloudLobes=.5+.2*sin(cloudCoord.x*2.4+sin(cloudCoord.y*1.7))+.15*sin(cloudCoord.y*3.15-cloudCoord.x*.72)+.08*sin((cloudCoord.x+cloudCoord.y)*5.3);
        float cloudField=clamp(cloudLobes*.7+(broadCloud*.68+detailCloud*.32)*.3,0.0,1.0),cloudThreshold=mix(.54,.43,clamp(uWeather,0.0,1.0));
        cloudThreshold=mix(cloudThreshold,.34,step(1.5,uWeather));
        float cloudMask=smoothstep(cloudThreshold,cloudThreshold+.16,cloudField)*smoothstep(-.65,.08,direction.y);
        float cirrusField=skyFbm(cloudPlane*.18-cloudWind*.22+vec2(4.8,11.3));
        float cirrus=smoothstep(.68,.82,cirrusField+.09*sin(cloudPlane.x*.7+cloudPlane.y*.18))*smoothstep(-.42,.2,direction.y)*(1.0-cloudMask);
        float cloudRelief=smoothstep(.25,.86,detailCloud),cloudLight=clamp(dot(normalize(vec3(.28,.82,.36)),celestial)*.28+.72,0.42,1.0);
        vec3 fairCloud=mix(vec3(.48,.5,.54),vec3(1.02,.98,.88),cloudRelief*cloudLight),stormCloud=mix(vec3(.075,.085,.11),vec3(.3,.34,.39),cloudRelief);
        vec3 cloudColor=mix(fairCloud,stormCloud,clamp(uWeather*.62,0.0,1.0));
        skyColor=mix(skyColor,cloudColor,cloudMask*mix(.68,.96,clamp(uWeather,0.0,1.0)));
        skyColor=mix(skyColor,fairCloud*.92,cirrus*.28*(1.0-clamp(uWeather*.36,0.0,.72)));
        float silverLining=pow(max(towardBody,0.0),18.0)*cloudMask*(1.0-cloudRelief)*(1.0-uSkyNight);
        skyColor+=bodyColor*silverLining*.38*(1.0-clamp(uWeather*.25,0.0,.5));
        float angularDistance=acos(clamp(towardBody,-1.0,1.0)),rayNoise=.58+.42*skyNoise(cloudPlane*.22-cloudWind*.18);
        vec3 rayReference=abs(celestial.y)>.92?vec3(1.0,0.0,0.0):vec3(0.0,1.0,0.0),rayTangent=normalize(cross(rayReference,celestial)),rayBitangent=cross(celestial,rayTangent);
        float rayAngle=atan(dot(direction,rayBitangent),dot(direction,rayTangent)),rayStrands=.72+.28*sin(rayAngle*19.0+skyNoise(cloudPlane*.16)*5.0);
        float rays=(1.0-smoothstep(.025,.62,angularDistance))*rayNoise*rayStrands*(1.0-cloudMask*.88)*(1.0-uSkyNight)*smoothstep(-.06,.25,direction.y);
        skyColor+=bodyColor*(halo*.15+rays*.34)*(1.0-clamp(uWeather*.34,0.0,.68));
        skyColor=mix(skyColor,horizonColor*1.08,horizonBand*.12);
        if(uSkyNight>.5){
          vec2 starUv=vec2(atan(direction.z,direction.x)/6.2831853+.5,asin(clamp(direction.y,-1.0,1.0))/3.1415926+.5),starMap=starUv*vec2(240.0,120.0),starCell=floor(starMap),starLocal=fract(starMap)-.5;
          float starSeed=hash21(starCell),starRadius=mix(.075,.19,hash21(starCell+vec2(17.0,31.0))),starDistance=length(starLocal);
          float starPresence=step(.976,starSeed),starCore=(1.0-smoothstep(starRadius,starRadius+.055,starDistance))*starPresence;
          float brightStar=step(.9965,starSeed)*(1.0-smoothstep(starRadius,starRadius*3.7,starDistance))*.55;
          float twinkle=.78+.22*sin(uTime*(.8+starSeed*1.7)+starSeed*41.0),starVisibility=smoothstep(-.02,.16,direction.y)*(1.0-cloudMask)*(1.0-cirrus*.65);
          vec3 starColor=mix(vec3(1.0,.76,.58),vec3(.64,.8,1.0),hash21(starCell+vec2(5.0,73.0)));
          skyColor+=starColor*(starCore*twinkle+brightStar)*starVisibility;
        }
        float bodyTexture=mix(1.0,.78+.22*skyNoise(vec2(atan(direction.z,direction.x),direction.y)*180.0),uSkyNight);
        surface.rgb=mix(skyColor,bodyColor*bodyTexture,disc*(1.0-cloudMask*.82));
      } else if (uPattern > 5.5 && uPattern < 6.5) {
        float grain = sin(vWorld.x * 31.0 + sin(vWorld.z * 7.0)) * .06;
        float plank = step(.94, fract(vWorld.x * 1.5));
        surface.rgb *= .9 + grain - plank * .28;
      } else if (uPattern > 6.5 && uPattern < 7.5) {
        vec2 stoneCell = floor(vWorld.xz * 2.2 + vec2(step(.5, fract(vWorld.z * 1.1)) * .5, 0.0));
        float stoneNoise = fract(sin(dot(stoneCell, vec2(12.9898,78.233))) * 43758.5453);
        float mortar = max(step(.91, fract(vWorld.x * 2.2)), step(.88, fract(vWorld.z * 1.1)));
        surface.rgb *= .76 + stoneNoise * .3 - mortar * .25;
      } else if (uPattern > 7.5 && uPattern < 8.5) {
        float shingle = step(.82, fract((vWorld.x + floor(vWorld.z * 2.0) * .25) * 2.4));
        surface.rgb *= .8 + .16 * sin(vWorld.z * 10.0) - shingle * .3;
      } else if (uPattern > 8.5 && uPattern < 9.5) {
        float wornEdge=step(14.5,texturePixel.x)+step(14.5,texturePixel.y)+step(texturePixel.x,.5)+step(texturePixel.y,.5);
        surface.rgb*=.7+pixelNoise*.34-min(wornEdge,1.0)*.08;
      } else if (uPattern > 9.5 && uPattern < 10.5) {
        float billow = sin(vWorld.x * 2.1 + uTime * .32) * sin(vWorld.y * 3.4 - uTime * .22) * sin(vWorld.z * 1.8 + uTime * .17);
        float edge = (1.0 - smoothstep(.58, 1.0, abs(vLocal.x))) * smoothstep(0.0,.24,vLocal.y) * (1.0-smoothstep(1.25,2.0,vLocal.y));
        surface.a *= edge * (.5 + billow * .22);
      } else if (uPattern > 10.5 && uPattern < 11.5) {
        float ripple = sin((textureWorld.x + textureWorld.y) * 14.0 + uTime * 1.4) * .06;
        float glint = step(.91, pixelNoise + ripple);
        surface.rgb *= .78 + pixelNoise * .16 + ripple;
        surface.rgb += vec3(.14,.3,.36) * glint;
      } else if (uPattern > 11.5 && uPattern < 12.5) {
        float clod = step(.72, pixelNoise) * .16 - step(pixelNoise,.12) * .12;
        surface.rgb *= .78 + pixelNoise * .24 + clod;
      } else if (uPattern > 12.5 && uPattern < 13.5) {
        float dune = sin((texturePixel.x + texturePixel.y * .45) * .7) * .055;
        surface.rgb *= .9 + pixelNoise * .12 + dune;
      } else if (uPattern > 13.5 && uPattern < 14.5) {
        vec2 cobble = floor(texturePixel / 4.0);
        float mortar = max(step(.77,fract(texturePixel.x/4.0)),step(.77,fract(texturePixel.y/4.0)));
        surface.rgb *= .72 + hash21(cobble + tile * 7.0) * .3 - mortar * .22;
      } else if (uPattern > 14.5 && uPattern < 15.5) {
        float crystal = step(.92,pixelNoise) * .22;
        surface.rgb *= .94 + pixelNoise * .08 + crystal;
      } else if (uPattern > 15.5 && uPattern < 16.5) {
        float puddle = smoothstep(.45,.7,sin(textureWorld.x*8.0)*sin(textureWorld.y*7.0));
        surface.rgb *= .7 + pixelNoise * .12 + puddle * .2;
      } else if (uPattern > 16.5 && uPattern < 17.5) {
        float crack = step(.78,sin(textureWorld.x*16.0 + sin(textureWorld.y*9.0))*sin(textureWorld.y*13.0));
        surface.rgb = mix(surface.rgb * .55,vec3(1.0,.18,.015),crack*.78);
      }
      vec3 normal=normalize(vNormal);
      if(uNormalStrength>.001&&uHasTexture>.5)normal=normalize(textureTangent*mappedTextureNormal.x*uNormalStrength+textureBitangent*mappedTextureNormal.y*uNormalStrength+normal*max(.18,mappedTextureNormal.z));
      if (uUnlit > 0.5) {
        gl_FragColor = surface;
      } else {
        float diffuse = max(dot(normal, normalize(-uLightDirection)), 0.0);
        vec3 viewDir = normalize(uCamera - vWorld);
        vec3 halfDir = normalize(viewDir - normalize(uLightDirection));
        float specularPower=mix(112.0,9.0,sampledRoughness),specularAmount=mix(.58,.035,sampledRoughness);
        float shine=pow(max(dot(normal,halfDir),0.0),specularPower)*specularAmount;
        vec2 cloudWind=vec2(uTime*.045,uTime*.018),sunPlane=uCelestialDirection.xz/max(abs(uCelestialDirection.y),.28),cloudShadowPoint=(vWorld.xz-sunPlane*vWorld.y)*.055+cloudWind;
        float cloudShadowBroad=.5+.2*sin(cloudShadowPoint.x*2.4+sin(cloudShadowPoint.y*1.7))+.15*sin(cloudShadowPoint.y*3.15-cloudShadowPoint.x*.72)+.08*sin((cloudShadowPoint.x+cloudShadowPoint.y)*5.3),cloudShadowDetail=skyNoise(cloudShadowPoint*2.07+vec2(7.3,11.8)),cloudShadowField=clamp(cloudShadowBroad*.82+cloudShadowDetail*.18,0.0,1.0);
        float cloudShadowThreshold=mix(.54,.43,clamp(uWeather,0.0,1.0));cloudShadowThreshold=mix(cloudShadowThreshold,.34,step(1.5,uWeather));
        float cloudOcclusion=smoothstep(cloudShadowThreshold,cloudShadowThreshold+.2,cloudShadowField),cloudShadowStrength=mix(.42,.61,clamp(uWeather,0.0,1.0));cloudShadowStrength=mix(cloudShadowStrength,.72,step(1.5,uWeather));
        float directSkyVisibility=1.0-cloudOcclusion*cloudShadowStrength*mix(1.0,.42,uSkyNight);diffuse*=directSkyVisibility;shine*=directSkyVisibility;
        float skyFacing = normal.y * .5 + .5;
        vec3 hemisphere = mix(vec3(.07,.06,.055), vec3(.28,.34,.39), skyFacing) * uAmbient;
        vec3 lit = surface.rgb * (hemisphere + vec3(uAmbient * .68 + diffuse * .8 + shine));
        vec3 warmLight=vec3(0.0);
        for(int warmIndex=0;warmIndex<${maxWarmLights};warmIndex++){
          if(float(warmIndex)<uWarmLightCount){
            vec3 toWarm=uWarmLights[warmIndex]-vWorld;
            float distanceSquared=dot(toWarm,toWarm),facing=max(dot(normal,normalize(toWarm)),.16),attenuation=facing/(1.0+distanceSquared*.32);
            warmLight+=vec3(1.0,.38,.08)*attenuation*2.3;
          }
        }
        lit+=surface.rgb*warmLight;
        if(uPattern>10.5&&uPattern<11.5){
          float fresnel=pow(1.0-clamp(dot(normal,viewDir),0.0,1.0),3.0),reflectionHeight=clamp(reflect(-viewDir,normal).y*.55+.45,0.0,1.0);
          vec3 reflectedSky=mix(uFogColor*1.18,mix(vec3(.12,.34,.58),vec3(.055,.085,.18),uSkyNight),reflectionHeight);
          float sunGlint=pow(max(dot(reflect(normalize(uLightDirection),normal),viewDir),0.0),72.0)*(1.0-uSkyNight);
          lit=mix(lit,reflectedSky,.2+fresnel*.52);lit+=vec3(1.0,.96,.8)*sunGlint*.72;
        }else if(surface.a<.78){
          float glassFresnel=pow(1.0-clamp(dot(normal,viewDir),0.0,1.0),3.0);
          lit=mix(lit,uFogColor*1.24,glassFresnel*.22);
        }else if(sampledRoughness<.48){
          float surfaceFresnel=pow(1.0-clamp(dot(normal,viewDir),0.0,1.0),3.0)*(1.0-sampledRoughness);
          lit=mix(lit,uFogColor*1.2,surfaceFresnel*.14);
        }
        float distanceFog = 1.0 - exp(-length(uCamera - vWorld) * uFogDensity);
        lit = mix(lit, uFogColor, clamp(distanceFog, 0.0, .72));
        gl_FragColor = vec4(pow(max(lit, vec3(0.0)), vec3(.92)), surface.a);
      }
    }`;

  function shader(type, source) {
    const value = gl.createShader(type);
    gl.shaderSource(value, source); gl.compileShader(value);
    if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(value));
    return value;
  }
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);

  const locations = {};
  ['aPosition', 'aNormal'].forEach(n => locations[n] = gl.getAttribLocation(program, n));
  ['uProjection', 'uView', 'uModel', 'uNormalMatrix', 'uColor', 'uLightDirection', 'uCamera', 'uUnlit', 'uAmbient', 'uPattern', 'uSkyNight', 'uWeather', 'uRoughness', 'uNormalStrength', 'uHasTexture', 'uAlbedoAtlas', 'uNormalAtlas', 'uRoughnessAtlas', 'uTextureRect', 'uCelestialDirection', 'uFogDensity', 'uFogColor', 'uTime', 'uWarmLightCount'].forEach(n => locations[n] = gl.getUniformLocation(program, n));
  locations.uWarmLights=gl.getUniformLocation(program,'uWarmLights[0]');

  const textureTileSize=16,textureAtlasColumns=8,textureAtlasRows=4;
  const texturedPatterns=new Set([1,2,6,7,8,9,11,12,13,14,15,16,17]);
  const wrapPixel=value=>(value%textureTileSize+textureTileSize)%textureTileSize;
  function textureNoise(x,y,seed){
    x=wrapPixel(x);y=wrapPixel(y);
    const value=Math.sin((x+seed*17.13)*12.9898+(y-seed*9.71)*78.233)*43758.5453;
    return value-Math.floor(value);
  }
  function materialTexel(pattern,x,y){
    const px=wrapPixel(x),py=wrapPixel(y),noise=textureNoise(px,py,pattern),fine=textureNoise(px*3,py*3,pattern+31),edgeX=Math.min(px,textureTileSize-1-px),edgeY=Math.min(py,textureTileSize-1-py);
    let color=[210,210,210],height=.45,roughness=.76;
    if(pattern===1){
      const pebble=noise>.78?18:0;color=[186+noise*30,164+noise*24,126+noise*16];height=.28+noise*.22+pebble/90;roughness=.84;
    }else if(pattern===2){
      const blade=(px+py*3)%7===0?22:0;color=[158+noise*26,197+noise*34+blade,148+noise*22];height=.32+noise*.3+blade/75;roughness=.94;
    }else if(pattern===6){
      const grain=Math.sin((px/textureTileSize)*Math.PI*8+Math.sin(py/textureTileSize*Math.PI*2)*1.2),seam=py===0||py===textureTileSize-1;
      color=[188+grain*19+noise*10,151+grain*13+noise*8,110+grain*8];height=.48+grain*.16-(seam?.2:0);roughness=.72;
    }else if(pattern===7){
      const mortar=px%8===0||py%8===0,stone=textureNoise(Math.floor(px/8)*8,Math.floor(py/8)*8,pattern);
      color=mortar?[137,137,132]:[190+stone*24,187+stone*22,177+stone*18];height=mortar?.12:.48+stone*.18;roughness=.9;
    }else if(pattern===8){
      const stagger=(Math.floor(py/4)%2)*4,join=(px+stagger)%8===0||py%4===0;
      color=join?[123,106,98]:[195+noise*18,155+noise*13,135+noise*10];height=join?.16:.55+noise*.12;roughness=.83;
    }else if(pattern===9){
      color=[164+noise*26,190+noise*31,151+fine*20];height=.36+noise*.26+fine*.08;roughness=.93;
    }else if(pattern===11){
      const wave=Math.sin(px/textureTileSize*Math.PI*4+Math.sin(py/textureTileSize*Math.PI*2));color=[154+wave*9,202+wave*13,227+noise*18];height=.48+wave*.17+noise*.05;roughness=.08;
    }else if(pattern===12){
      color=[184+noise*31,155+noise*24,118+noise*18];height=.34+noise*.28;roughness=.94;
    }else if(pattern===13){
      const ripple=Math.sin((px+py*.42)/textureTileSize*Math.PI*4);color=[224+ripple*8+noise*8,207+ripple*7+noise*8,166+ripple*5];height=.45+ripple*.1+noise*.04;roughness=.88;
    }else if(pattern===14){
      const offset=(Math.floor(py/4)%2)*2,mortar=(px+offset)%4===0||py%4===0,rock=textureNoise(Math.floor((px+offset)/4)*4,Math.floor(py/4)*4,pattern);
      color=mortar?[121,118,111]:[181+rock*35,178+rock*33,169+rock*28];height=mortar?.1:.5+rock*.22;roughness=.96;
    }else if(pattern===15){
      color=[230+noise*18,235+noise*16,239+fine*13];height=.44+noise*.1;roughness=.78;
    }else if(pattern===16){
      const puddle=noise>.68;color=puddle?[139,144,132]:[169+fine*15,150+fine*13,119+fine*10];height=puddle?.22:.4+noise*.18;roughness=puddle?.24:.86;
    }else if(pattern===17){
      const flow=Math.sin(px/textureTileSize*Math.PI*4+Math.sin(py/textureTileSize*Math.PI*2)*1.7),hot=flow>.35;color=hot?[255,198+noise*35,105]:[176+noise*22,116+noise*15,82];height=.43+flow*.2;roughness=.32;
    }
    if(edgeX===0||edgeY===0)height=(height+materialTexelEdge(pattern,px,py,height))*.5;
    return {color:color.map(value=>Math.max(0,Math.min(255,Math.round(value)))),height:Math.max(0,Math.min(1,height)),roughness};
  }
  function materialTexelEdge(pattern,x,y,fallback){
    if(pattern===6)return fallback;
    return .42+textureNoise(x,y,pattern)*.16;
  }
  function createTextureAtlas(kind){
    const width=textureTileSize*textureAtlasColumns,height=textureTileSize*textureAtlasRows,data=new Uint8Array(width*height*4);
    for(let pattern=0;pattern<textureAtlasColumns*textureAtlasRows;pattern++){
      const tileX=(pattern%textureAtlasColumns)*textureTileSize,tileY=Math.floor(pattern/textureAtlasColumns)*textureTileSize;
      for(let y=0;y<textureTileSize;y++)for(let x=0;x<textureTileSize;x++){
        const sample=materialTexel(pattern,x,y),index=((tileY+y)*width+tileX+x)*4;
        if(kind==='albedo'){data[index]=sample.color[0];data[index+1]=sample.color[1];data[index+2]=sample.color[2];}
        else if(kind==='roughness'){const value=Math.round(sample.roughness*255);data[index]=data[index+1]=data[index+2]=value;}
        else{
          const left=materialTexel(pattern,x-1,y).height,right=materialTexel(pattern,x+1,y).height,down=materialTexel(pattern,x,y-1).height,up=materialTexel(pattern,x,y+1).height,nx=(left-right)*1.7,ny=(down-up)*1.7,nz=1,length=Math.hypot(nx,ny,nz)||1;
          data[index]=Math.round((nx/length*.5+.5)*255);data[index+1]=Math.round((ny/length*.5+.5)*255);data[index+2]=Math.round((nz/length*.5+.5)*255);
        }
        data[index+3]=255;
      }
    }
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,data);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return texture;
  }
  const materialAtlases=[createTextureAtlas('albedo'),createTextureAtlas('normal'),createTextureAtlas('roughness')];
  materialAtlases.forEach((texture,index)=>{gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,texture);});
  gl.uniform1i(locations.uAlbedoAtlas,0);gl.uniform1i(locations.uNormalAtlas,1);gl.uniform1i(locations.uRoughnessAtlas,2);

  function mesh(values) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
    return { buffer, count: values.length / 6 };
  }
  function quad(a, b, c, d, n, out) {
    [a,b,c,a,c,d].forEach(p => out.push(p[0],p[1],p[2],n[0],n[1],n[2]));
  }
  const cubeData = [];
  quad([-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],[0,0,1],cubeData);
  quad([1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1],[0,0,-1],cubeData);
  quad([-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1],[-1,0,0],cubeData);
  quad([1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1],[1,0,0],cubeData);
  quad([-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1],[0,1,0],cubeData);
  quad([-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1],[0,-1,0],cubeData);
  const cube = mesh(cubeData);
  function triangle(a,b,c,out){const edgeA=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],edgeB=[c[0]-a[0],c[1]-a[1],c[2]-a[2]],normal=normalize(cross(edgeA,edgeB));[a,b,c].forEach(point=>out.push(point[0],point[1],point[2],normal[0],normal[1],normal[2]));}
  const wedgeData=[],wa=[-1,-1,1],wb=[1,-1,1],wc=[0,1,1],wd=[-1,-1,-1],we=[1,-1,-1],wf=[0,1,-1];triangle(wa,wb,wc,wedgeData);triangle(we,wd,wf,wedgeData);quad(wd,wa,wc,wf,normalize([-1,1,0]),wedgeData);quad(wb,we,wf,wc,normalize([1,1,0]),wedgeData);quad(wd,we,wb,wa,[0,-1,0],wedgeData);const wedge=mesh(wedgeData);
  const pyramidData=[],pa=[-1,-1,-1],pb=[1,-1,-1],pc=[1,-1,1],pd=[-1,-1,1],peak=[0,1,0];triangle(pa,pb,peak,pyramidData);triangle(pb,pc,peak,pyramidData);triangle(pc,pd,peak,pyramidData);triangle(pd,pa,peak,pyramidData);quad(pa,pd,pc,pb,[0,-1,0],pyramidData);const pyramid=mesh(pyramidData);
  function roofTileMesh(heights){const data=[],bottom=-1,p00=[-1,heights[0],-1],p10=[1,heights[1],-1],p11=[1,heights[2],1],p01=[-1,heights[3],1],b00=[-1,bottom,-1],b10=[1,bottom,-1],b11=[1,bottom,1],b01=[-1,bottom,1];triangle(p00,p01,p11,data);triangle(p00,p11,p10,data);quad(b00,b10,p10,p00,[0,0,-1],data);quad(b10,b11,p11,p10,[1,0,0],data);quad(b11,b01,p01,p11,[0,0,1],data);quad(b01,b00,p00,p01,[-1,0,0],data);quad(b00,b01,b11,b10,[0,-1,0],data);return mesh(data);}
  const roofPanelMesh=roofTileMesh([1,-1,-1,1]),roofCornerMesh=roofTileMesh([1,-1,-1,-1]),roofValleyMesh=roofTileMesh([-1,1,1,1]);
  const coneData=[];
  for(let index=0;index<12;index++){const a=index*Math.PI*2/12,b=(index+1)*Math.PI*2/12,normal=normalize([Math.cos((a+b)/2),.45,Math.sin((a+b)/2)]),points=[[0,1,0],[Math.cos(b),-1,Math.sin(b)],[Math.cos(a),-1,Math.sin(a)]];points.forEach(point=>coneData.push(point[0],point[1],point[2],normal[0],normal[1],normal[2]));[[0,-1,0],[Math.cos(a),-1,Math.sin(a)],[Math.cos(b),-1,Math.sin(b)]].forEach(point=>coneData.push(point[0],point[1],point[2],0,-1,0));}
  const cone=mesh(coneData),cylinderData=[];
  for(let index=0;index<14;index++){const a=index*Math.PI*2/14,b=(index+1)*Math.PI*2/14,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b),normalA=[ca,0,sa],normalB=[cb,0,sb],bottomA=[ca,-1,sa],topA=[ca,1,sa],topB=[cb,1,sb],bottomB=[cb,-1,sb],side=[[bottomA,normalA],[topA,normalA],[topB,normalB],[bottomA,normalA],[topB,normalB],[bottomB,normalB]];side.forEach(value=>cylinderData.push(value[0][0],value[0][1],value[0][2],value[1][0],value[1][1],value[1][2]));triangle([0,1,0],[cb,1,sb],[ca,1,sa],cylinderData);triangle([0,-1,0],[ca,-1,sa],[cb,-1,sb],cylinderData);}
  const cylinder=mesh(cylinderData),ringData=[];
  for(let index=0;index<64;index++){const a=index*Math.PI*2/64,b=(index+1)*Math.PI*2/64;ringData.push(Math.cos(a),Math.sin(a),0,0,0,1,Math.cos(b),Math.sin(b),0,0,0,1);}
  const ring=mesh(ringData);
  const sphereData=[];
  for(let latitude=0;latitude<10;latitude++){const v0=latitude/10*Math.PI-Math.PI/2,v1=(latitude+1)/10*Math.PI-Math.PI/2;for(let longitude=0;longitude<14;longitude++){const u0=longitude/14*Math.PI*2,u1=(longitude+1)/14*Math.PI*2,point=(u,v)=>[Math.cos(v)*Math.cos(u),Math.sin(v),Math.cos(v)*Math.sin(u)],a=point(u0,v0),b=point(u1,v0),c=point(u1,v1),d=point(u0,v1);[a,c,b,a,d,c].forEach(value=>sphereData.push(value[0],value[1],value[2],value[0],value[1],value[2]));}}
  const sphere=mesh(sphereData);
  const planeData = []; quad([-1,0,-1],[-1,0,1],[1,0,1],[1,0,-1],[0,1,0],planeData);
  const plane = mesh(planeData);
  const rainMesh = mesh([]);
  const mistData=[];quad([-1,0,0],[1,0,0],[1,2,0],[-1,2,0],[0,0,1],mistData);
  const mistPlane=mesh(mistData);
  const diskData = [];
  for (let i=0;i<32;i++) {
    const a=i*Math.PI*2/32,b=(i+1)*Math.PI*2/32;
    diskData.push(0,0,0,0,1,0, Math.cos(a),0,Math.sin(a),0,1,0, Math.cos(b),0,Math.sin(b),0,1,0);
  }
  const disk = mesh(diskData);
  let terrainChunks=new Map(),terrainMeshKey='',terrainMeshReady=false;
  function voxelKey(x,z,level){return Number(x).toFixed(2)+','+Number(z).toFixed(2)+','+Number(level||0);}
  function terrainVoxels(){const voxels=new Map();for(let x=baseMin+gridStep/2;x<baseMax;x+=gridStep)for(let z=baseMin+gridStep/2;z<baseMax;z+=gridStep)if(!removed.some(cell=>sameCell(cell,x,z)))voxels.set(voxelKey(x,z,0),{x:x,z:z,level:0});expanded.forEach(cell=>{const level=Math.round(Number(cell.level)||0);voxels.set(voxelKey(cell.x,cell.z,level),{x:Number(cell.x),z:Number(cell.z),level:level});});return voxels;}
  function addVoxelGeometry(data,x,z,level,voxels,material,materialAt){
    const numericLevel=Number(level||0),half=gridStep/2,bottom=numericLevel*gridStep-gridStep,has=(dx,dz,dy)=>voxels.has(voxelKey(x+dx*gridStep,z+dz*gridStep,numericLevel+dy)),aboveMaterial=has(0,0,1)?materialAt(x,z,numericLevel+1):'',belowMaterial=has(0,0,-1)?materialAt(x,z,numericLevel-1):'',waterTop=material==='water'&&aboveMaterial!=='water',top=numericLevel*gridStep-(waterTop?gridStep*.2:0),sideVisible=(dx,dz)=>!has(dx,dz,0)||(material!=='water'&&materialAt(x+dx*gridStep,z+dz*gridStep,numericLevel)==='water'),waterLip=(dx,dz)=>{if(material!=='water'||!has(dx,dz,0)||materialAt(x+dx*gridStep,z+dz*gridStep,numericLevel)!=='water')return null;const neighborHasWaterAbove=has(dx,dz,1)&&materialAt(x+dx*gridStep,z+dz*gridStep,numericLevel+1)==='water',neighborTop=numericLevel*gridStep-(neighborHasWaterAbove?0:gridStep*.2);return top>neighborTop+.001?neighborTop:null;};
    if(!has(0,0,1)||(material!=='water'&&aboveMaterial==='water'))quad([x-half,top,z+half],[x+half,top,z+half],[x+half,top,z-half],[x-half,top,z-half],[0,1,0],data);
    if(!has(0,0,-1)||(material!=='water'&&belowMaterial==='water'))quad([x-half,bottom,z-half],[x+half,bottom,z-half],[x+half,bottom,z+half],[x-half,bottom,z+half],[0,-1,0],data);
    const northLip=waterLip(0,1);if(sideVisible(0,1))quad([x-half,bottom,z+half],[x+half,bottom,z+half],[x+half,top,z+half],[x-half,top,z+half],[0,0,1],data);else if(northLip!==null)quad([x-half,northLip,z+half],[x+half,northLip,z+half],[x+half,top,z+half],[x-half,top,z+half],[0,0,1],data);
    const southLip=waterLip(0,-1);if(sideVisible(0,-1))quad([x+half,bottom,z-half],[x-half,bottom,z-half],[x-half,top,z-half],[x+half,top,z-half],[0,0,-1],data);else if(southLip!==null)quad([x+half,southLip,z-half],[x-half,southLip,z-half],[x-half,top,z-half],[x+half,top,z-half],[0,0,-1],data);
    const westLip=waterLip(-1,0);if(sideVisible(-1,0))quad([x-half,bottom,z-half],[x-half,bottom,z+half],[x-half,top,z+half],[x-half,top,z-half],[-1,0,0],data);else if(westLip!==null)quad([x-half,westLip,z-half],[x-half,westLip,z+half],[x-half,top,z+half],[x-half,top,z-half],[-1,0,0],data);
    const eastLip=waterLip(1,0);if(sideVisible(1,0))quad([x+half,bottom,z+half],[x+half,bottom,z-half],[x+half,top,z-half],[x+half,top,z+half],[1,0,0],data);else if(eastLip!==null)quad([x+half,eastLip,z+half],[x+half,eastLip,z-half],[x+half,top,z-half],[x+half,top,z+half],[1,0,0],data);
  }
  function rebuildTerrainChunks(){const gridPaint=painted.filter(stamp=>stamp.grid&&stamp.type!=='fog'),signature=removed.map(cell=>voxelKey(cell.x,cell.z,0)).sort().join('|')+'::'+expanded.map(cell=>voxelKey(cell.x,cell.z,cell.level)).sort().join('|')+'::'+gridPaint.map(stamp=>voxelKey(stamp.x,stamp.z,stamp.level)+':'+stamp.type).sort().join('|');if(terrainMeshReady&&signature===terrainMeshKey)return;terrainChunks.forEach(value=>gl.deleteBuffer(value.mesh.buffer));terrainChunks=new Map();const voxels=terrainVoxels(),paintByVoxel=new Map();gridPaint.forEach(stamp=>paintByVoxel.set(voxelKey(stamp.x,stamp.z,stamp.level),stamp.type));const materialAt=(x,z,level)=>paintByVoxel.get(voxelKey(x,z,level))||'base',dataByChunk=new Map(),chunkSpan=gridStep*8;voxels.forEach(cell=>{const material=materialAt(cell.x,cell.z,cell.level),chunk=Math.floor((cell.x-gridMin)/chunkSpan)+','+Math.floor((cell.z-gridMin)/chunkSpan)+','+Math.floor(cell.level/8)+'|'+material,data=dataByChunk.get(chunk)||[];addVoxelGeometry(data,cell.x,cell.z,cell.level,voxels,material,materialAt);dataByChunk.set(chunk,data);});dataByChunk.forEach((data,key)=>{const material=key.slice(key.lastIndexOf('|')+1);terrainChunks.set(key,{mesh:mesh(data),material:material});});terrainMeshKey=signature;terrainMeshReady=true;}

  function identity() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
  function multiply(a,b) {
    const o=new Array(16);
    for(let c=0;c<4;c++) for(let r=0;r<4;r++) o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
    return o;
  }
  function transform(x,y,z,sx,sy,sz) {
    return [sx,0,0,0, 0,sy,0,0, 0,0,sz,0, x,y,z,1];
  }
  function cameraFacingTransform(x,y,z,sx,sy,camera){const normal=normalize([camera[0]-x,camera[1]-y,camera[2]-z]),flatLength=Math.hypot(normal[0],normal[2]),right=flatLength>.0001?[normal[2]/flatLength,0,-normal[0]/flatLength]:[1,0,0],up=[normal[1]*right[2],normal[2]*right[0]-normal[0]*right[2],-normal[1]*right[0]];return [right[0]*sx,right[1]*sx,right[2]*sx,0,up[0]*sy,up[1]*sy,up[2]*sy,0,normal[0],normal[1],normal[2],0,x,y,z,1];}
  function objectTransform(o){
    const cx=Math.cos(o.rx||0),sx=Math.sin(o.rx||0),cy=Math.cos(o.ry||0),sy=Math.sin(o.ry||0),cz=Math.cos(o.rz||0),sz=Math.sin(o.rz||0);
    const t=transform(o.x,o.y,o.z,1,1,1),rx=[1,0,0,0,0,cx,sx,0,0,-sx,cx,0,0,0,0,1],ry=[cy,0,-sy,0,0,1,0,0,sy,0,cy,0,0,0,0,1],rz=[cz,sz,0,0,-sz,cz,0,0,0,0,1,0,0,0,0,1],scale=transform(0,0,0,o.sx,o.sy,o.sz);
    return multiply(multiply(multiply(multiply(t,rz),ry),rx),scale);
  }
  function localPart(x,y,z,sx,sy,sz,color,pattern,rx,ry,rz,unlit){return {x:x,y:y,z:z,sx:sx,sy:sy,sz:sz,color:color,pattern:pattern||0,rx:rx||0,ry:ry||0,rz:rz||0,unlit:unlit||0};}
  function worldPart(x,y,z,sx,sy,sz,color,pattern,rx,ry,rz,primitive){return {world:{x:x,y:y,z:z,sx:sx,sy:sy,sz:sz,rx:rx||0,ry:ry||0,rz:rz||0},color:color,pattern:pattern||0,mesh:primitive||cube};}
  function objectParts(o){
    const wood=[.38,.22,.09,1],darkWood=[.22,.11,.045,1],stone=[.4,.39,.35,1],iron=[.16,.17,.17,1],leaf=[.12,.34,.1,1],leafLight=[.2,.45,.13,1],trunkHalf=(Number(o.trunkThickness)||gridStep*.3)/2,trunkX=trunkHalf/Math.max(.001,Number(o.sx)||.25),trunkZ=trunkHalf/Math.max(.001,Number(o.sz)||.25),treeVariant=Math.max(3,Math.min(6,Math.round(Number(o.treeVariant)||3)));
    switch(o.model||o.type){
      case 'oak':
      case 'tree':{const parts=[localPart(0,-.3,0,trunkX,.7,trunkZ,darkWood,6)],crowns=[];if(treeVariant===3)crowns.push(localPart(-.18,.42,0,1.05,.43,1.02,leaf,2),localPart(.32,.53,.08,.9,.34,.88,leafLight,2),localPart(0,.72,-.08,.78,.27,.78,leaf,2));else if(treeVariant===4)crowns.push(localPart(-.42,.35,.08,1.38,.48,1.24,leaf,2),localPart(.44,.5,-.16,1.28,.44,1.2,leafLight,2),localPart(0,.7,.14,1.12,.3,1.08,leaf,2),localPart(.02,.38,.48,1.08,.38,.92,[.14,.39,.11,1],2));else if(treeVariant===5){parts.push(localPart(-.22,.05,0,trunkX*.65,.45,trunkZ*.7,darkWood,6,0,0,-.42),localPart(.24,.08,.02,trunkX*.6,.42,trunkZ*.7,darkWood,6,0,0,.45));crowns.push(localPart(-.52,.36,.05,1.45,.4,1.24,leaf,2),localPart(.52,.4,-.1,1.4,.42,1.3,leafLight,2),localPart(-.15,.68,.2,1.24,.36,1.18,[.14,.39,.11,1],2),localPart(.28,.75,-.2,1.1,.28,1.05,leaf,2),localPart(0,.48,.5,1.12,.34,.9,leafLight,2));}else{parts.push(localPart(-.28,-.02,0,trunkX*.72,.52,trunkZ*.75,darkWood,6,0,0,-.38),localPart(.3,.02,.02,trunkX*.7,.5,trunkZ*.75,darkWood,6,0,0,.4),localPart(0,.22,.18,trunkX*.55,.42,trunkZ*.58,darkWood,6,.4,0,0));crowns.push(localPart(-.68,.3,.08,1.55,.42,1.35,leaf,2),localPart(.66,.34,-.1,1.52,.44,1.38,leafLight,2),localPart(-.28,.62,.35,1.42,.4,1.22,[.14,.39,.11,1],2),localPart(.35,.7,-.3,1.38,.36,1.24,leaf,2),localPart(0,.82,.05,1.18,.25,1.14,leafLight,2),localPart(0,.36,.65,1.25,.34,1.02,leaf,2));}crowns.forEach(part=>part.mesh=sphere);return parts.concat(crowns);}
      case 'palm':{const parts=[localPart(0,-.08,0,trunkX,.92,trunkZ,[.42,.27,.1,1],6)],fronds=treeVariant+3;parts[0].mesh=cylinder;for(let index=0;index<fronds;index++){const angle=index*Math.PI*2/fronds,part=localPart(Math.sin(angle)*.56,.72,Math.cos(angle)*.56,.16,.09,.82,index%2?leafLight:leaf,2,.18*Math.cos(angle),angle,-.18*Math.sin(angle));part.mesh=sphere;parts.push(part);}const crown=localPart(0,.68,0,.34,.2,.34,[.21,.42,.1,1],2);crown.mesh=sphere;parts.push(crown);return parts;}
      case 'rock':return [localPart(-.2,-.27,.05,.72,.72,.7,stone,7,.12,.28,-.12),localPart(.4,-.12,-.18,.5,.56,.48,[.32,.33,.31,1],7,-.08,-.35,.16)];
      case 'chest':return [localPart(0,-.34,0,1,.46,1,wood,6),localPart(0,.25,0,1,.26,1,darkWood,6),localPart(-.7,-.03,0,.075,.78,1.025,iron),localPart(.7,-.03,0,.075,.78,1.025,iron),localPart(0,-.02,1.015,.16,.24,.04,[.72,.5,.16,1],0,0,0,0,1),localPart(0,-.48,1.018,.09,.07,.045,iron)];
      case 'wall':
      case 'wood_wall':
      case 'window_wall':
      case 'wood_window_wall':{
        const timber=o.type==='wood_wall'||o.type==='wood_window_wall',windowed=o.type==='window_wall'||o.type==='wood_window_wall',material=timber?wood:stone,pattern=timber?6:7;
        const connections=buildingConnections(o,isWallObject),thickness=Math.max(.045,Math.min(.11,Number(o.sz)||.1)),parts=[],jointMaterial=timber?darkWood:[.3,.29,.26,1],trim=timber?wood:[.32,.31,.28,1];
        const addSpan=(direction,cx,cz,halfLength)=>{const alongX=!!direction.x,hx=alongX?halfLength:thickness,hz=alongX?thickness:halfLength;if(!windowed){parts.push(worldPart(cx,o.y,cz,hx,o.sy,hz,material,pattern));return;}const panelHeight=o.sy*.34,yOffset=o.sy*.66,glassLength=Math.max(.035,halfLength*.72),glassThickness=Math.max(.012,thickness*.28);parts.push(worldPart(cx,o.y-yOffset,cz,hx,panelHeight,hz,material,pattern),worldPart(cx,o.y+yOffset,cz,hx,panelHeight,hz,material,pattern),worldPart(cx,o.y,cz,alongX?glassLength:glassThickness,o.sy*.31,alongX?glassThickness:glassLength,[.58,.78,.86,.18],0,0,0,0,cube),worldPart(cx,o.y-o.sy*.345,cz,alongX?glassLength:thickness*1.08,.025,alongX?thickness*1.08:glassLength,trim,pattern),worldPart(cx,o.y+o.sy*.345,cz,alongX?glassLength:thickness*1.08,.025,alongX?thickness*1.08:glassLength,trim,pattern));};
        if(connections.length){parts.push(worldPart(o.x,o.y,o.z,thickness*1.08,o.sy,thickness*1.08,jointMaterial,pattern));connections.filter(direction=>direction.x>0||direction.z>0).forEach(direction=>addSpan(direction,Number(o.x)+direction.x*gridStep/2,Number(o.z)+direction.z*gridStep/2,Math.max(.04,gridStep/2-thickness*.92)));}
        else{const direction=wallAxisDirections(o)[0];addSpan(direction,o.x,o.z,gridStep/2);parts.push(worldPart(Number(o.x)-direction.x*(gridStep/2-thickness),o.y,Number(o.z)-direction.z*(gridStep/2-thickness),thickness,o.sy,thickness,jointMaterial,pattern),worldPart(Number(o.x)+direction.x*(gridStep/2-thickness),o.y,Number(o.z)+direction.z*(gridStep/2-thickness),thickness,o.sy,thickness,jointMaterial,pattern));}
        return parts;
      }
      case 'torch':{const outer=localPart(0,.62,0,.34,.38,.34,[1,.2,.02,.72],0,0,0,.04,1),inner=localPart(0,.74,0,.18,.3,.18,[1,.76,.08,.95],0,0,0,-.05,1),bowl=localPart(0,.3,0,.36,.13,.36,iron);outer.mesh=inner.mesh=cone;bowl.mesh=cylinder;return [localPart(0,-.28,0,.12,.72,.12,darkWood,6,0,0,.08),localPart(0,.1,0,.3,.07,.3,iron),bowl,localPart(-.25,.35,0,.04,.3,.04,iron,0,0,0,-.2),localPart(.25,.35,0,.04,.3,.04,iron,0,0,0,.2),outer,inner];}
      case 'floor':return [-.8,-.4,0,.4,.8].map(x=>localPart(x,0,0,.18,1,.98,wood,6));
      case 'foundation':return [localPart(0,0,0,1,1,1,stone,7),localPart(0,.75,0,1.07,.22,1.07,[.29,.28,.25,1],7)];
      case 'stairs':{const parts=[];for(let i=0;i<6;i++){const center=-5/6+i/3;parts.push(localPart(0,center,center,1,1/6,1/6,wood,6));}return parts;}
      case 'ladder':{const parts=[localPart(-.68,0,0,.1,1,.26,darkWood,6),localPart(.68,0,0,.1,1,.26,darkWood,6)];for(let i=0;i<8;i++)parts.push(localPart(0,-.82+i*.235,.02,.64,.055,.22,wood,6));return parts;}
      case 'roof':
      case 'roof_low':
      case 'roof_high':
      case 'roof_gable':{const part=localPart(0,0,0,1,1,1,o.color||[.34,.12,.065,1],8);part.mesh=wedge;return [part];}
      case 'roof_dormer':{const color=o.color||[.34,.12,.065,1],part=localPart(0,0,0,1,1,1,color,8),window=localPart(0,-.18,-1.006,.27,.3,.018,[.08,.19,.25,.92],0,0,0,0,1);part.mesh=wedge;return [part,window];}
      case 'roof_panel':{const part=localPart(0,0,0,1,1,1,o.color||[.35,.13,.07,1],8);part.mesh=roofPanelMesh;return [part];}
      case 'roof_pyramid':{const part=localPart(0,0,0,1,1,1,o.color||[.34,.12,.065,1],8);part.mesh=pyramid;return [part];}
      case 'roof_corner':{const part=localPart(0,0,0,1,1,1,o.color||[.34,.12,.065,1],8);part.mesh=roofCornerMesh;return [part];}
      case 'roof_inverted':{const part=localPart(0,0,0,1,1,1,o.color||[.3,.1,.055,1],8);part.mesh=roofValleyMesh;return [part];}
      case 'door':return [localPart(0,0,0,1,1,1,wood,6),localPart(-.78,0,0,.1,1.08,1.15,darkWood,6),localPart(.78,0,0,.1,1.08,1.15,darkWood,6),localPart(0,.82,0,1,.12,1.15,darkWood,6),localPart(.5,0,1.08,.1,.1,.12,[.75,.53,.18,1],0,0,0,0,1)];
      case 'pillar':{const horizontal=buildingConnections(o,'pillar'),vertical=verticalBuildingConnections(o,'pillar'),joinsX=horizontal.some(value=>value.x),joinsZ=horizontal.some(value=>value.z),halfX=joinsX?gridStep/2:Math.max(.13,Number(o.sx)*.75),halfZ=joinsZ?gridStep/2:Math.max(.13,Number(o.sz)*.75),height=Number(o.sy),bodyHeight=vertical.above||vertical.below?height:height*.78,parts=[worldPart(o.x,o.y,o.z,halfX,bodyHeight,halfZ,[.46,.44,.39,1],7)];if(!vertical.below)parts.push(worldPart(o.x,objectBase(o)+height*.14,o.z,halfX+.025,height*.14,halfZ+.025,stone,7));if(!vertical.above)parts.push(worldPart(o.x,objectTop(o)-height*.14,o.z,halfX+.025,height*.14,halfZ+.025,stone,7));return parts;}
      case 'campfire':{const parts=[];for(let index=0;index<8;index++){const angle=index*Math.PI/4,stonePart=localPart(Math.cos(angle)*.78,-.65,Math.sin(angle)*.78,.24,.18,.24,index%2?stone:[.31,.3,.28,1],7,0,angle,.1);stonePart.mesh=sphere;parts.push(stonePart);}parts.push(localPart(0,-.46,0,.82,.13,.16,darkWood,6,0,.72,0),localPart(0,-.46,0,.82,.13,.16,wood,6,0,-.72,0),localPart(0,-.4,0,.7,.1,.13,darkWood,6,0,0,.08),localPart(0,-.34,0,.45,.08,.45,[.12,.06,.025,1],0));const outer=localPart(0,.08,0,.48,.66,.48,[1,.18,.015,.68],0,0,0,.04,1),inner=localPart(0,.18,0,.25,.48,.25,[1,.76,.06,.95],0,0,0,-.08,1);outer.mesh=inner.mesh=cone;parts.push(outer,inner);return parts;}
      case 'barrel':{const body=localPart(0,0,0,.92,1,.92,wood,6),lower=localPart(0,-.7,0,.98,.055,.98,iron),middle=localPart(0,0,0,1,.05,1,iron),upper=localPart(0,.7,0,.98,.055,.98,iron),lid=localPart(0,.965,0,.84,.025,.84,darkWood,6);[body,lower,middle,upper,lid].forEach(part=>part.mesh=cylinder);return [body,lower,middle,upper,lid];}
      case 'fence':return [localPart(-.78,0,0,.12,1,.35,darkWood,6),localPart(.78,0,0,.12,1,.35,darkWood,6),localPart(0,-.28,0,1,.12,.25,wood,6),localPart(0,.35,0,1,.12,.25,wood,6)];
      case 'gate':return [localPart(-.83,0,0,.1,1.15,1.1,darkWood,6),localPart(.83,0,0,.1,1.15,1.1,darkWood,6),localPart(0,0,0,.75,.86,.22,wood,6),localPart(0,0,.25,.7,.06,.08,iron,0,0,0,.55)];
      case 'arch':return [localPart(-.72,-.2,0,.22,.8,1,stone,7),localPart(.72,-.2,0,.22,.8,1,stone,7),localPart(0,.68,0,1,.2,1,stone,7),localPart(0,.42,0,.48,.16,1,[.27,.26,.24,1],7)];
      case 'window':return [localPart(-.78,0,0,.12,1,1,darkWood,6),localPart(.78,0,0,.12,1,1,darkWood,6),localPart(0,.58,0,.78,.42,1,darkWood,6),localPart(0,-.58,0,.78,.42,1,darkWood,6),localPart(0,0,0,.7,.35,.055,[.58,.78,.86,.18],0,0,0,0,1)];
      case 'bridge':return [-.75,-.25,.25,.75].map(z=>localPart(0,0,z,1,.18,.2,wood,6)).concat([localPart(-.86,-.4,0,.08,.16,1,darkWood,6),localPart(.86,-.4,0,.08,.16,1,darkWood,6)]);
      case 'pine':{const parts=[localPart(0,-.28,0,trunkX,.7,trunkZ,darkWood,6)],tiers=treeVariant-1;for(let index=0;index<tiers;index++){const ratio=index/Math.max(1,tiers-1),part=localPart(0,-.02+ratio*.72,0,1.5-ratio*.82,.28-(ratio*.07),1.5-ratio*.82,index%2?leafLight:leaf,2);part.mesh=pyramid;parts.push(part);}if(treeVariant>=5)parts.push(localPart(.28,.05,.05,trunkX*.42,.35,trunkZ*.5,darkWood,6,0,0,.55));return parts;}
      case 'bush':{const parts=[localPart(-.35,0,0,.62,.7,.62,leaf,2),localPart(.35,.08,.08,.62,.7,.62,leafLight,2),localPart(0,.28,-.12,.58,.62,.58,leaf,2)];parts.forEach(part=>part.mesh=sphere);return parts;}
      case 'boulder':return [localPart(0,-.2,0,1,.8,.92,stone,7,.12,.3,-.08),localPart(.48,-.4,.16,.38,.35,.4,[.31,.32,.3,1],7,-.1,-.2,.08)];
      case 'mushroom':{const cap=localPart(0,.45,0,1,.3,1,[.62,.12,.1,1],2);cap.mesh=sphere;return [localPart(0,-.2,0,.2,.7,.2,[.72,.65,.5,1],0),cap,localPart(.2,.5,-.18,.08,.08,.08,[.9,.78,.58,1],0)];}
      case 'fallen_log':{const body=localPart(0,-.15,0,.72,1,.72,darkWood,6,0,0,Math.PI/2),left=localPart(-.97,-.15,0,.76,.025,.76,wood,6,0,0,Math.PI/2),right=localPart(.97,-.15,0,.76,.025,.76,wood,6,0,0,Math.PI/2),ringA=localPart(-.6,-.15,0,.77,.035,.77,[.2,.09,.03,1],6,0,0,Math.PI/2),ringB=localPart(.55,-.15,0,.77,.035,.77,[.2,.09,.03,1],6,0,0,Math.PI/2);[body,left,right,ringA,ringB].forEach(part=>part.mesh=cylinder);return [body,left,right,ringA,ringB];}
      case 'table':return [localPart(0,.72,0,1,.14,1,wood,6),localPart(0,.48,0,.88,.12,.82,darkWood,6),localPart(-.72,-.16,-.66,.11,.72,.11,darkWood,6),localPart(.72,-.16,-.66,.11,.72,.11,darkWood,6),localPart(-.72,-.16,.66,.11,.72,.11,darkWood,6),localPart(.72,-.16,.66,.11,.72,.11,darkWood,6),localPart(0,-.12,0,.72,.08,.08,wood,6)];
      case 'chair':return [localPart(0,-.02,0,.82,.14,.82,wood,6),localPart(-.64,-.52,-.62,.1,.5,.1,darkWood,6),localPart(.64,-.52,-.62,.1,.5,.1,darkWood,6),localPart(-.64,-.52,.62,.1,.5,.1,darkWood,6),localPart(.64,-.52,.62,.1,.5,.1,darkWood,6),localPart(-.64,.5,-.66,.1,.62,.1,darkWood,6),localPart(.64,.5,-.66,.1,.62,.1,darkWood,6),localPart(0,.35,-.66,.64,.11,.1,wood,6),localPart(0,.72,-.66,.64,.11,.1,wood,6)];
      case 'bed':return [localPart(0,-.62,0,1,.12,1,darkWood,6),localPart(0,-.42,-.88,1,.14,.1,darkWood,6),localPart(0,-.42,.88,1,.14,.1,darkWood,6),localPart(-.9,.08,0,.1,.86,1,darkWood,6),localPart(.9,-.38,0,.1,.38,1,darkWood,6),localPart(.03,-.34,0,.82,.22,.78,wood,6),localPart(.08,-.04,0,.76,.12,.72,[.46,.12,.12,1],0),localPart(-.62,.14,0,.2,.13,.58,[.82,.76,.61,1],0)];
      case 'bookshelf':return [localPart(0,0,-.72,1,1,.14,darkWood,6),localPart(-.9,0,0,.1,1,.72,darkWood,6),localPart(.9,0,0,.1,1,.72,darkWood,6),localPart(0,-.86,0,.82,.1,.72,wood,6),localPart(0,-.28,0,.82,.08,.72,wood,6),localPart(0,.3,0,.82,.08,.72,wood,6),localPart(0,.88,0,.82,.1,.72,wood,6),localPart(-.58,-.56,.34,.1,.2,.28,[.45,.12,.08,1],0),localPart(-.28,-.55,.34,.1,.21,.28,[.1,.24,.42,1],0),localPart(.18,.02,.34,.1,.2,.28,[.3,.38,.12,1],0),localPart(.5,.02,.34,.1,.2,.28,[.48,.24,.08,1],0),localPart(-.42,.6,.34,.1,.2,.28,[.28,.18,.42,1],0)];
      case 'crate':return [localPart(0,0,0,.94,.94,.94,wood,6),localPart(0,-.82,0,1,.1,1,darkWood,6),localPart(0,.82,0,1,.1,1,darkWood,6),localPart(-.82,0,0,.1,1,1,darkWood,6),localPart(.82,0,0,.1,1,1,darkWood,6),localPart(0,0,.955,.1,.96,.045,darkWood,6,0,0,.72),localPart(0,0,.957,.1,.96,.045,darkWood,6,0,0,-.72)];
      case 'tent':{const shell=localPart(0,0,0,1,1,1,[.36,.2,.1,1],0);shell.mesh=wedge;return [shell,localPart(0,-.8,-.82,.08,.2,.08,darkWood,6),localPart(0,-.8,.82,.08,.2,.08,darkWood,6)];}
      case 'well':return [localPart(0,-.25,0,1,.55,1,stone,7),localPart(0,.08,0,.66,.4,.66,[.03,.12,.16,1],11),localPart(-.72,.5,0,.1,1,.1,darkWood,6),localPart(.72,.5,0,.1,1,.1,darkWood,6),localPart(0,1.05,0,1,.12,.18,wood,6)];
      case 'altar':return [localPart(0,-.42,0,.82,.18,.82,stone,7),localPart(0,-.05,0,.66,.22,.62,stone,7),localPart(0,.4,0,.92,.18,.72,[.48,.44,.37,1],7)];
      case 'statue':{const head=localPart(0,.62,0,.32,.32,.32,[.48,.47,.44,1],7);head.mesh=sphere;return [localPart(0,-.78,0,.72,.18,.72,stone,7),localPart(0,-.1,0,.34,.62,.28,[.45,.44,.41,1],7),head,localPart(-.4,-.05,0,.12,.5,.12,stone,7,0,0,-.25),localPart(.4,-.05,0,.12,.5,.12,stone,7,0,0,.25)];}
      case 'signpost':return [localPart(0,-.28,0,.16,.8,.16,darkWood,6),localPart(0,.42,0,1,.28,.18,wood,6),localPart(.72,.42,0,.28,.28,.18,wood,6,0,0,.78)];
      case 'lantern':return [localPart(0,-.4,0,.24,.35,.24,iron),localPart(0,.1,0,.5,.48,.5,[1,.48,.08,.58],0,0,0,0,1),localPart(0,.58,0,.28,.12,.28,iron),localPart(0,.78,0,.35,.25,.08,iron,0,0,0,.6)];
      default:return [localPart(0,0,0,1,1,1,o.color||[.4,.4,.4,1],0)];
    }
  }
  function partTransform(o,part){return part.world?objectTransform(part.world):multiply(objectTransform(o),objectTransform(part));}
  function shadowMatrix(model,light){const dy=Math.abs(light[1])<.08?-.08:light[1],projection=[1,0,0,0,-light[0]/dy,0,-light[2]/dy,0,0,0,1,0,0,.018,0,1];return multiply(projection,model);}
  function drawSceneObject(o,light,shadow,highlighted){const parts=objectParts(o).map((part,index)=>({part:part,index:index})),transparent=value=>!shadow&&Number((value.part.color||[])[3])<.98,id=String(o.id||o.type||''),seed=Array.from(id).reduce((total,letter)=>(total*31+letter.charCodeAt(0))%17,0)/17,renderPart=value=>{const part=value.part;let color=shadow?[.015,.012,.01,timeOfDay==='night'?.2:.34]:part.color;if(highlighted&&!shadow)color=color.map((channel,index)=>index===3?channel:Math.min(1,channel*1.45+.13));if(!shadow){gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(-.08,-(.65+seed+value.index*.32));}draw(part.mesh||cube,shadow?shadowMatrix(partTransform(o,part),light):partTransform(o,part),color,shadow?1:part.unlit,gl.TRIANGLES,shadow?0:part.pattern);if(!shadow)gl.disable(gl.POLYGON_OFFSET_FILL);};if(shadow){parts.filter(value=>Number((value.part.color||[])[3])>=.98).forEach(renderPart);return;}parts.filter(value=>!transparent(value)).forEach(renderPart);const glass=parts.filter(transparent);if(glass.length){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);glass.forEach(renderPart);gl.depthMask(true);gl.disable(gl.BLEND);}}
  function drawPlacementPreview(o){objectParts(o).forEach(part=>{const source=part.color||[.5,.5,.5,1],color=[Math.min(1,source[0]*.62+.38),Math.min(1,source[1]*.62+.26),source[2]*.55,.42];draw(part.mesh||cube,partTransform(o,part),color,1,gl.TRIANGLES,part.pattern);});}
  function shadowTransform(o,light){
    const dy=Math.abs(light[1])<.08?-.08:light[1];
    const projection=[1,0,0,0,-light[0]/dy,0,-light[2]/dy,0,0,0,1,0,0,.018,0,1];
    return multiply(projection,objectTransform(o));
  }
  const characterJointNames=['left_foot','right_foot','left_knee','right_knee','left_hip','right_hip','spine_1','spine_2','spine_3','neck','head','left_shoulder','right_shoulder','left_elbow','right_elbow','left_hand','right_hand'];
  const characterBones=[['left_foot','left_knee'],['left_knee','left_hip'],['right_foot','right_knee'],['right_knee','right_hip'],['left_hip','right_hip'],['left_hip','spine_1'],['right_hip','spine_1'],['spine_1','spine_2'],['spine_2','spine_3'],['spine_3','neck'],['neck','head'],['spine_3','left_shoulder'],['spine_3','right_shoulder'],['left_shoulder','left_elbow'],['left_elbow','left_hand'],['right_shoulder','right_elbow'],['right_elbow','right_hand']];
  const defaultCharacterPose={left_foot:[-.16,.05,0],right_foot:[.16,.05,0],left_knee:[-.12,.55,0],right_knee:[.12,.55,0],left_hip:[-.1,1.02,0],right_hip:[.1,1.02,0],spine_1:[0,1.10,0],spine_2:[0,1.30,0],spine_3:[0,1.52,0],neck:[0,1.66,0],head:[0,1.84,0],left_shoulder:[-.34,1.50,0],right_shoulder:[.34,1.50,0],left_elbow:[-.48,1.18,0],right_elbow:[.48,1.18,0],left_hand:[-.54,.86,0],right_hand:[.54,.86,0]};
  function mapHex(value){const text=String(value||'#888888').replace('#',''),full=text.length===3?text.split('').map(v=>v+v).join(''):text,number=parseInt(full,16);return [((number>>16)&255)/255,((number>>8)&255)/255,(number&255)/255,1];}
  function normalizeCharacterRig(value){const loaded=value&&typeof value==='object'?value:{},pose={};characterJointNames.forEach(name=>{const saved=(loaded.bindPose||{})[name];if(!saved){pose[name]=defaultCharacterPose[name].slice();return;}pose[name]=Number(loaded.version)>=3&&saved.length>=3?saved.slice(0,3).map(Number):[(Number(saved[0])-360)/160,(432-Number(saved[1]))/200,Number(saved[2]||0)/200];});return {build:Math.max(.7,Math.min(1.45,(Number(loaded.build)||100)/100)),colors:Object.assign({skin:'#c98f65',armor:'#38506b',accent:'#d6a43d'},loaded.colors||{}),bindPose:pose,meshes:Array.isArray(loaded.meshes)?loaded.meshes.map(part=>{const offset=Array.isArray(part.offset)?part.offset:[0,0,0],rotation=Array.isArray(part.rotation)?part.rotation:[0,0,Number(part.rotation)||0],partScale=Array.isArray(part.scale)?part.scale:[1,1,1];return Object.assign({},part,{offset:Number(loaded.version)>=3?[Number(offset[0])||0,Number(offset[1])||0,Number(offset[2])||0]:[(Number(offset[0])||0)/160,-(Number(offset[1])||0)/200,(Number(offset[2])||0)/200],scale:partScale.map(value=>Math.max(.25,Math.min(4,Number(value)||1))),rotation:rotation.map(Number)});}):[]};}
  function animatedCharacterPose(rig,entity,now){const pose={};characterJointNames.forEach(name=>pose[name]=rig.bindPose[name].slice());const moving=Number(entity._movingUntil||0)>now,phase=now*.008+(Number(entity.id)||0),wave=Math.sin(phase),motion=entity._motion||entity.motion||'idle';if(motion==='fall'){pose.left_hand[0]-=.22;pose.right_hand[0]+=.22;pose.left_hand[1]+=.18;pose.right_hand[1]+=.18;pose.left_elbow[0]-=.12;pose.right_elbow[0]+=.12;pose.left_knee[1]+=.1;pose.right_knee[1]+=.1;pose.left_foot[2]+=.12;pose.right_foot[2]+=.12;pose.spine_2[2]-=.05;pose.spine_3[2]-=.09;}else if(motion==='climb'){const climbWave=moving?wave:0;pose.left_hand[1]+=.23+climbWave*.18;pose.right_hand[1]+=.23-climbWave*.18;pose.left_hand[2]+=.2;pose.right_hand[2]+=.2;pose.left_elbow[2]+=.12;pose.right_elbow[2]+=.12;pose.left_foot[1]+=climbWave*.16;pose.right_foot[1]-=climbWave*.16;pose.left_foot[2]+=.13;pose.right_foot[2]+=.13;pose.left_knee[2]+=.16;pose.right_knee[2]+=.16;}else if(motion==='swim'){const swimWave=moving?wave:Math.sin(phase*.45)*.35;pose.left_hand[0]-=.2;pose.right_hand[0]+=.2;pose.left_hand[2]+=.24+swimWave*.2;pose.right_hand[2]+=.24-swimWave*.2;pose.left_elbow[0]-=.14;pose.right_elbow[0]+=.14;pose.left_elbow[2]+=.12-swimWave*.12;pose.right_elbow[2]+=.12+swimWave*.12;pose.left_foot[2]-=swimWave*.14;pose.right_foot[2]+=swimWave*.14;pose.left_knee[1]+=Math.max(0,swimWave)*.08;pose.right_knee[1]+=Math.max(0,-swimWave)*.08;['spine_1','spine_2','spine_3','neck','head'].forEach(name=>pose[name][1]+=Math.sin(phase*.5)*.012);}else if(moving){pose.left_foot[2]+=wave*.18;pose.right_foot[2]-=wave*.18;pose.left_knee[2]+=wave*.1;pose.right_knee[2]-=wave*.1;pose.left_hand[2]-=wave*.17;pose.right_hand[2]+=wave*.17;}else ['spine_2','spine_3','neck','head'].forEach(name=>pose[name][1]+=Math.sin(now*.003+(Number(entity.id)||0))*.012);return pose;}
  function characterPoint(entity,point,scale){const facing=Number(entity.facing!==undefined?entity.facing:entity.ry)||0,c=Math.cos(facing),s=Math.sin(facing),baseY=(entity.type==='npc'?Number(entity.y||0)-Number(entity.sy||0):Number(entity.y)||0)+Number(entity._renderYOffset||0);return [Number(entity.x)+(point[0]*c+point[2]*s)*scale,baseY+point[1]*scale,Number(entity.z)+(-point[0]*s+point[2]*c)*scale];}
  function characterSegmentMatrix(a,b,radius){const up=normalize([b[0]-a[0],b[1]-a[1],b[2]-a[2]]),reference=Math.abs(up[1])>.92?[1,0,0]:[0,1,0],right=normalize(cross(reference,up)),forward=normalize(cross(up,right)),length=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2])/2,center=[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2];return [right[0]*radius,right[1]*radius,right[2]*radius,0,up[0]*length,up[1]*length,up[2]*length,0,forward[0]*radius,forward[1]*radius,forward[2]*radius,0,center[0],center[1],center[2],1];}
  function drawCharacterPart(entity,part,pose,scale,light,shadow){const joint=pose[part.joint]||pose.spine_2,center=characterPoint(entity,[joint[0]+part.offset[0],joint[1]+part.offset[1],joint[2]+part.offset[2]],scale),size=(Number(part.size)||48)/210*scale,rotation=part.rotation||[0,0,0],facing=Number(entity.facing!==undefined?entity.facing:entity.ry)||0,partScale=part.scale||[1,1,1],scaled=values=>({sx:values[0]*partScale[0],sy:values[1]*partScale[1],sz:values[2]*partScale[2]}),base={x:center[0],y:center[1],z:center[2],rx:Number(rotation[0]||0)*Math.PI/180,ry:Number(rotation[1]||0)*Math.PI/180+facing,rz:Number(rotation[2]||0)*Math.PI/180},color=shadow?[.015,.012,.01,timeOfDay==='night'?.2:.34]:mapHex(part.color),render=(primitive,values,position)=>{const matrix=objectTransform(Object.assign({},base,position||{},scaled(values)));draw(primitive,shadow?shadowMatrix(matrix,light):matrix,color,shadow?1:0);};if(part.type==='head')render(sphere,[size*.78,size*.9,size*.76]);else if(part.type==='torso')render(sphere,[size*1.05,size*1.3,size*.62]);else if(part.type==='body')render(sphere,[size*1.2,size*.85,size]);else if(part.type==='limb')render(cube,[size*.28,size,size*.28]);else if(part.type==='hand')render(sphere,[size*.48,size*.6,size*.3]);else if(part.type==='foot')render(sphere,[size*.48,size*.28,size*.72]);else if(part.type==='muzzle')render(sphere,[size*.62,size*.38,size*.72]);else if(part.type==='ear')render(cone,[size*.34,size*.68,size*.18]);else if(part.type==='plate')render(cube,[size*.9,size*.65,size*.22]);else if(part.type==='horn'||part.type==='spike'||part.type==='claw')render(cone,[size*(part.type==='claw'?.18:.28),size*(part.type==='claw'?.62:1),size*(part.type==='claw'?.18:.28)]);else if(part.type==='wing')render(cube,[size*1.2,size*.12,size*.55]);else if(part.type==='tail'){for(let i=0;i<3;i++)render(cube,[size*.16,size*.16,size*.38],{x:center[0]+Math.sin(facing)*i*size*.5,y:center[1]-i*size*.12,z:center[2]+Math.cos(facing)*i*size*.5});}else if(part.type==='eye')render(sphere,[size*.42,size*.3,size*.18]);else if(part.type==='shell'){render(sphere,[size*1.05,size*.78,size*.38]);render(cube,[size*.72,size*.5,size*.12],{x:center[0]-Math.sin(facing)*size*.22,z:center[2]-Math.cos(facing)*size*.22});}else render(sphere,[size*.5,size*.5,size*.5]);}
  function drawCharacterEntity(entity,rigValue,light,shadow,now){const water=waterStateAt(Number(entity.x),Number(entity.z)),renderEntity=Object.assign({},entity,{_renderYOffset:0,_motion:water.depth>=2?'swim':entity._motion}),rig=normalizeCharacterRig(rigValue),pose=animatedCharacterPose(rig,renderEntity,now),scale=.48*rig.build,armor=shadow?[.015,.012,.01,timeOfDay==='night'?.2:.34]:mapHex(rig.colors.armor),drawMatrix=(primitive,matrix,color)=>draw(primitive,shadow?shadowMatrix(matrix,light):matrix,color,shadow?1:0);characterBones.forEach(bone=>{const a=characterPoint(renderEntity,pose[bone[0]],scale),b=characterPoint(renderEntity,pose[bone[1]],scale);drawMatrix(cube,characterSegmentMatrix(a,b,.025*rig.build),armor);});rig.meshes.forEach(part=>drawCharacterPart(renderEntity,part,pose,scale,light,shadow));}
  function perspective(fov,aspect,near,far) {
    const f=1/Math.tan(fov/2),nf=1/(near-far);
    return [f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0];
  }
  function normalize(v) { const l=Math.hypot(v[0],v[1],v[2])||1; return v.map(x=>x/l); }
  function cross(a,b) { return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]; }
  function lookAt(eye,target) {
    const z=normalize([eye[0]-target[0],eye[1]-target[1],eye[2]-target[2]]),x=normalize(cross([0,1,0],z)),y=cross(z,x);
    return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-x[0]*eye[0]-x[1]*eye[1]-x[2]*eye[2],-y[0]*eye[0]-y[1]*eye[1]-y[2]*eye[2],-z[0]*eye[0]-z[1]*eye[1]-z[2]*eye[2],1];
  }
  function inverse(m) {
    const o=[], a=m; let det;
    o[0]=a[5]*a[10]*a[15]-a[5]*a[11]*a[14]-a[9]*a[6]*a[15]+a[9]*a[7]*a[14]+a[13]*a[6]*a[11]-a[13]*a[7]*a[10];
    o[4]=-a[4]*a[10]*a[15]+a[4]*a[11]*a[14]+a[8]*a[6]*a[15]-a[8]*a[7]*a[14]-a[12]*a[6]*a[11]+a[12]*a[7]*a[10];
    o[8]=a[4]*a[9]*a[15]-a[4]*a[11]*a[13]-a[8]*a[5]*a[15]+a[8]*a[7]*a[13]+a[12]*a[5]*a[11]-a[12]*a[7]*a[9];
    o[12]=-a[4]*a[9]*a[14]+a[4]*a[10]*a[13]+a[8]*a[5]*a[14]-a[8]*a[6]*a[13]-a[12]*a[5]*a[10]+a[12]*a[6]*a[9];
    o[1]=-a[1]*a[10]*a[15]+a[1]*a[11]*a[14]+a[9]*a[2]*a[15]-a[9]*a[3]*a[14]-a[13]*a[2]*a[11]+a[13]*a[3]*a[10];
    o[5]=a[0]*a[10]*a[15]-a[0]*a[11]*a[14]-a[8]*a[2]*a[15]+a[8]*a[3]*a[14]+a[12]*a[2]*a[11]-a[12]*a[3]*a[10];
    o[9]=-a[0]*a[9]*a[15]+a[0]*a[11]*a[13]+a[8]*a[1]*a[15]-a[8]*a[3]*a[13]-a[12]*a[1]*a[11]+a[12]*a[3]*a[9];
    o[13]=a[0]*a[9]*a[14]-a[0]*a[10]*a[13]-a[8]*a[1]*a[14]+a[8]*a[2]*a[13]+a[12]*a[1]*a[10]-a[12]*a[2]*a[9];
    o[2]=a[1]*a[6]*a[15]-a[1]*a[7]*a[14]-a[5]*a[2]*a[15]+a[5]*a[3]*a[14]+a[13]*a[2]*a[7]-a[13]*a[3]*a[6];
    o[6]=-a[0]*a[6]*a[15]+a[0]*a[7]*a[14]+a[4]*a[2]*a[15]-a[4]*a[3]*a[14]-a[12]*a[2]*a[7]+a[12]*a[3]*a[6];
    o[10]=a[0]*a[5]*a[15]-a[0]*a[7]*a[13]-a[4]*a[1]*a[15]+a[4]*a[3]*a[13]+a[12]*a[1]*a[7]-a[12]*a[3]*a[5];
    o[14]=-a[0]*a[5]*a[14]+a[0]*a[6]*a[13]+a[4]*a[1]*a[14]-a[4]*a[2]*a[13]-a[12]*a[1]*a[6]+a[12]*a[2]*a[5];
    o[3]=-a[1]*a[6]*a[11]+a[1]*a[7]*a[10]+a[5]*a[2]*a[11]-a[5]*a[3]*a[10]-a[9]*a[2]*a[7]+a[9]*a[3]*a[6];
    o[7]=a[0]*a[6]*a[11]-a[0]*a[7]*a[10]-a[4]*a[2]*a[11]+a[4]*a[3]*a[10]+a[8]*a[2]*a[7]-a[8]*a[3]*a[6];
    o[11]=-a[0]*a[5]*a[11]+a[0]*a[7]*a[9]+a[4]*a[1]*a[11]-a[4]*a[3]*a[9]-a[8]*a[1]*a[7]+a[8]*a[3]*a[5];
    o[15]=a[0]*a[5]*a[10]-a[0]*a[6]*a[9]-a[4]*a[1]*a[10]+a[4]*a[2]*a[9]+a[8]*a[1]*a[6]-a[8]*a[2]*a[5];
    det=a[0]*o[0]+a[1]*o[4]+a[2]*o[8]+a[3]*o[12]; return o.map(x=>x/det);
  }
  function vector(m,v) {
    const o=[]; for(let r=0;r<4;r++) o[r]=m[r]*v[0]+m[4+r]*v[1]+m[8+r]*v[2]+m[12+r]*v[3];
    return o.map(x=>x/o[3]);
  }
  function screenRay(clientX,clientY){const rect=canvas.getBoundingClientRect(),x=(clientX-rect.left)/rect.width*2-1,y=1-(clientY-rect.top)/rect.height*2,inv=inverse(multiply(projection,view));return {near:vector(inv,[x,y,-1,1]).slice(0,3),far:vector(inv,[x,y,1,1]).slice(0,3)};}
  function voxelPaintType(x,z,level){for(let index=painted.length-1;index>=0;index--){const stamp=painted[index];if(stamp.grid&&stamp.type!=='fog'&&sameCell(stamp,x,z)&&Math.round(Number(stamp.level)||0)===Math.round(Number(level)||0))return stamp.type;}return 'base';}
  function pickTerrainVoxel(clientX,clientY){const ray=screenRay(clientX,clientY),direction=ray.far.map((value,index)=>value-ray.near[index]),half=gridStep/2;let result=null,best=Infinity;terrainVoxels().forEach(cell=>{const material=voxelPaintType(cell.x,cell.z,cell.level),bottom=cell.level*gridStep-gridStep,top=cell.level*gridStep-(material==='water'&&voxelPaintType(cell.x,cell.z,cell.level+1)!=='water'?gridStep*.2:0),minimum=[cell.x-half,bottom,cell.z-half],maximum=[cell.x+half,top,cell.z+half];let low=0,high=1,normal=[0,0,0];for(let axis=0;axis<3;axis++){if(Math.abs(direction[axis])<.00001){if(ray.near[axis]<minimum[axis]||ray.near[axis]>maximum[axis]){low=2;break;}continue;}let a=(minimum[axis]-ray.near[axis])/direction[axis],b=(maximum[axis]-ray.near[axis])/direction[axis],entryNormal=direction[axis]>0?-1:1;if(a>b){const swap=a;a=b;b=swap;}if(a>low){low=a;normal=[0,0,0];normal[axis]=entryNormal;}high=Math.min(high,b);if(low>high)break;}if(low>=0&&low<=1&&low<=high&&low<best){best=low;result={x:cell.x,z:cell.z,level:cell.level,normal:normal,point:[ray.near[0]+direction[0]*low,ray.near[1]+direction[1]*low,ray.near[2]+direction[2]*low]};}});return result;}
  function adjacentVoxel(hit,forceDown){if(!hit)return null;if(forceDown)return {x:hit.x,z:hit.z,level:hit.level-1};return {x:hit.x+hit.normal[0]*gridStep,z:hit.z+hit.normal[2]*gridStep,level:hit.level+hit.normal[1]};}
  function transformPointRaw(matrix,point){const value=[point[0],point[1],point[2],1],out=[];for(let row=0;row<4;row++)out[row]=matrix[row]*value[0]+matrix[4+row]*value[1]+matrix[8+row]*value[2]+matrix[12+row];return [out[0]/out[3],out[1]/out[3],out[2]/out[3]];}
  function rayBoxHit(ray,matrix,padding){const inv=inverse(matrix),start=transformPointRaw(inv,ray.near),end=transformPointRaw(inv,ray.far),direction=end.map((value,index)=>value-start[index]);let low=0,high=1;for(let axis=0;axis<3;axis++){const min=-1-padding,max=1+padding;if(Math.abs(direction[axis])<.00001){if(start[axis]<min||start[axis]>max)return null;continue;}let a=(min-start[axis])/direction[axis],b=(max-start[axis])/direction[axis];if(a>b){const swap=a;a=b;b=swap;}low=Math.max(low,a);high=Math.min(high,b);if(low>high)return null;}return low;}
  let lastPickPoint=null;
  function pickObject(clientX,clientY){const ray=screenRay(clientX,clientY);let result=null,best=Infinity;scene.forEach(object=>{objectParts(object).forEach(part=>{const hit=rayBoxHit(ray,partTransform(object,part),.1);if(hit!==null&&hit<best){best=hit;result=object;}});});lastPickPoint=result?[ray.near[0]+(ray.far[0]-ray.near[0])*best,ray.near[1]+(ray.far[1]-ray.near[1])*best,ray.near[2]+(ray.far[2]-ray.near[2])*best]:null;return result;}
  const gizmoColors={x:[.96,.18,.14,1],y:[.24,.86,.3,1],z:[.18,.42,1,1]};
  function selectedObjects(){return selectedGroup.length?selectedGroup:(selectedObject?[selectedObject]:[]);}
  function selectionCenter(){const values=selectedObjects();if(!values.length)return [0,0,0];return values.reduce((center,object)=>[center[0]+Number(object.x)/values.length,center[1]+Number(object.y)/values.length,center[2]+Number(object.z)/values.length],[0,0,0]);}
  function selectSceneObject(object){selectedObject=object||null;selectedGroup=object&&object.folder_id?scene.filter(value=>value.folder_id===object.folder_id):object?[object]:[];rebuildHierarchy();}
  function selectOnlySceneObject(object){selectedObject=object||null;selectedGroup=object?[object]:[];rebuildHierarchy();}
  function clearSceneSelection(){selectedObject=null;selectedGroup=[];rebuildHierarchy();}
  function toggleSceneObject(object){if(!object)return;const selected=selectedObjects().slice(),index=selected.indexOf(object);if(index>=0)selected.splice(index,1);else selected.push(object);selectedGroup=selected;selectedObject=selected[selected.length-1]||null;rebuildHierarchy();}
  function gizmoState(){if(!selectedObject||!activeTool||activeTool.kind!=='transform')return null;const center=selectionCenter(),values=selectedObjects(),largest=values.reduce((size,object)=>Math.max(size,Number(object.sx)||0,Number(object.sy)||0,Number(object.sz)||0),0),length=Math.max(.9,Math.min(2.5,largest+.8)),mode=activeTool.value,drawParts=[],hitParts=[];function add(axis,sign,meshValue,matrix){drawParts.push({axis:axis,sign:sign,mesh:meshValue,matrix:matrix});hitParts.push({axis:axis,sign:sign,matrix:matrix});}
    if(mode==='rotate'){['x','y','z'].forEach(axis=>{const rotation=axis==='x'?{rx:0,ry:Math.PI/2,rz:0}:axis==='y'?{rx:Math.PI/2,ry:0,rz:0}:{rx:0,ry:0,rz:0};[.985,1,1.015].forEach(scale=>drawParts.push({axis:axis,sign:1,mesh:ring,matrix:objectTransform(Object.assign({x:center[0],y:center[1],z:center[2],sx:length*scale,sy:length*scale,sz:length*scale},rotation)),ring:true}));for(let index=0;index<32;index++){const angle=index*Math.PI*2/32;let point=axis==='x'?[center[0],center[1]+Math.cos(angle)*length,center[2]+Math.sin(angle)*length]:axis==='y'?[center[0]+Math.cos(angle)*length,center[1],center[2]+Math.sin(angle)*length]:[center[0]+Math.cos(angle)*length,center[1]+Math.sin(angle)*length,center[2]];hitParts.push({axis:axis,sign:1,matrix:transform(point[0],point[1],point[2],.1,.1,.1)});}});}else{['x','y','z'].forEach(axis=>{const vector=axis==='x'?[1,0,0]:axis==='y'?[0,1,0]:[0,0,1],signs=mode==='stretch'?[-1,1]:[1];signs.forEach(sign=>{const rod=transform(center[0]+vector[0]*sign*length*.55,center[1]+vector[1]*sign*length*.55,center[2]+vector[2]*sign*length*.55,axis==='x'?length*.45:.055,axis==='y'?length*.45:.055,axis==='z'?length*.45:.055);add(axis,sign,cube,rod);const tipPosition=[center[0]+vector[0]*sign*length,center[1]+vector[1]*sign*length,center[2]+vector[2]*sign*length];if(mode==='move'){const tip=objectTransform({x:tipPosition[0],y:tipPosition[1],z:tipPosition[2],sx:.16,sy:.24,sz:.16,rx:axis==='z'?Math.PI/2:0,ry:0,rz:axis==='x'?-Math.PI/2:0});add(axis,sign,cone,tip);}else add(axis,sign,cube,transform(tipPosition[0],tipPosition[1],tipPosition[2],.17,.17,.17));});});}return {drawParts:drawParts,hitParts:hitParts};}
  function drawGizmo(){const state=gizmoState();if(!state)return;gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.lineWidth(4);state.drawParts.forEach(part=>draw(part.mesh,part.matrix,gizmoColors[part.axis],1,part.ring?gl.LINES:gl.TRIANGLES));gl.depthMask(true);gl.enable(gl.DEPTH_TEST);}
  function pickGizmo(clientX,clientY){const state=gizmoState();if(!state)return null;const ray=screenRay(clientX,clientY);let result=null,best=Infinity;state.hitParts.forEach(part=>{const hit=rayBoxHit(ray,part.matrix,.5);if(hit!==null&&hit<best){best=hit;result={axis:part.axis,sign:part.sign||1};}});return result;}
  function worldToClient(point){const clip=vector(multiply(projection,view),[point[0],point[1],point[2],1]),rect=canvas.getBoundingClientRect();return {x:rect.left+(clip[0]+1)*rect.width*.5,y:rect.top+(1-clip[1])*rect.height*.5};}

  let scene = [],mapNpcs=[],folders=[];
  const baseScene=scene.map(o=>Object.assign({},o));
  const objectStyles={
    tree:{name:'Ancient tree',model:'tree',y:.75,sx:.25,sy:.75,sz:.25,treeVariant:3,trunkThickness:.15,color:[.16,.34,.12,1]},
    oak:{name:'Ancient oak',model:'oak',y:.75,sx:.25,sy:.75,sz:.25,treeVariant:3,trunkThickness:.15,color:[.16,.34,.12,1]},
    palm:{name:'Palm tree',model:'palm',y:.75,sx:.25,sy:.75,sz:.25,treeVariant:3,trunkThickness:.15,color:[.18,.42,.12,1]},
    rock:{name:'Weathered rock',model:'rock',y:.25,sx:.25,sy:.25,sz:.25,color:[.34,.32,.29,1]},
    chest:{name:'Treasure chest',model:'chest',y:.25,sx:.5,sy:.25,sz:.25,color:[.4,.22,.07,1]},
    wall:{name:'Stone wall',model:'wall',y:.5,sx:.25,sy:.5,sz:.1,fineAxes:['z'],color:[.39,.37,.32,1]},
    wood_wall:{name:'Timber wall',model:'wood_wall',y:.5,sx:.25,sy:.5,sz:.1,fineAxes:['z'],color:[.38,.22,.09,1]},
    window_wall:{name:'Stone window wall',model:'window_wall',y:.5,sx:.25,sy:.5,sz:.1,fineAxes:['z'],color:[.39,.37,.32,1]},
    wood_window_wall:{name:'Timber window wall',model:'wood_window_wall',y:.5,sx:.25,sy:.5,sz:.1,fineAxes:['z'],color:[.38,.22,.09,1]},
    torch:{name:'Wall torch',model:'torch',y:.5,sx:.1,sy:.5,sz:.1,fineAxes:['x','z'],color:[.43,.25,.09,1]},
    floor:{name:'Raised timber floor',model:'floor',y:.0625,sx:.25,sy:.0625,sz:.25,fineAxes:['y'],walkable:true,raisedFloor:true,color:[.39,.23,.1,1]},
    foundation:{name:'Stone foundation',model:'foundation',y:.1,sx:.25,sy:.1,sz:.25,fineAxes:['y'],walkable:true,color:[.38,.37,.33,1]},
    stairs:{name:'Wooden stairs',model:'stairs',y:.5,sx:.25,sy:.5,sz:.5,walkable:true,color:[.4,.24,.11,1]},
    ladder:{name:'Wooden ladder',model:'ladder',y:.5,sx:.25,sy:.5,sz:.05,fineAxes:['z'],color:[.38,.22,.09,1]},
    roof:{name:'Gabled roof',model:'roof',y:.25,sx:.5,sy:.25,sz:.25,color:[.32,.12,.07,1]},
    roof_low:{name:'Low roof',model:'roof_low',y:.12,sx:.25,sy:.12,sz:.25,color:[.34,.13,.07,1]},
    roof_high:{name:'High roof',model:'roof_high',y:.38,sx:.25,sy:.38,sz:.25,color:[.31,.1,.055,1]},
    roof_gable:{name:'Triangular gable roof',model:'roof_gable',y:.32,sx:.5,sy:.32,sz:.25,color:[.37,.14,.07,1]},
    roof_pyramid:{name:'Pyramidal roof',model:'roof_pyramid',y:.34,sx:.5,sy:.34,sz:.5,color:[.35,.12,.065,1]},
    roof_corner:{name:'Roof corner',model:'roof_corner',y:.25,sx:.25,sy:.25,sz:.25,color:[.34,.12,.065,1]},
    roof_inverted:{name:'Inverted roof corner',model:'roof_inverted',y:.25,sx:.25,sy:.25,sz:.25,color:[.3,.1,.055,1]},
    roof_panel:{name:'Pitched roof panel',model:'roof_panel',y:.22,sx:.25,sy:.22,sz:.25,color:[.36,.14,.075,1]},
    roof_dormer:{name:'Dormer window roof',model:'roof_dormer',y:.3,sx:.5,sy:.3,sz:.25,color:[.35,.13,.07,1]},
    door:{name:'Reinforced door',model:'door',y:.5,sx:.25,sy:.5,sz:.08,fineAxes:['z'],color:[.34,.18,.07,1]},
    pillar:{name:'Carved pillar',model:'pillar',y:.5,sx:.2,sy:.5,sz:.2,fineAxes:['x','z'],color:[.42,.4,.34,1]},
    campfire:{name:'Campfire',model:'campfire',y:.2,sx:.25,sy:.2,sz:.25,fineAxes:['y'],color:[.35,.18,.06,1]},
    barrel:{name:'Supply barrel',model:'barrel',y:.25,sx:.25,sy:.25,sz:.25,color:[.36,.2,.08,1]},
    fence:{name:'Timber fence',model:'fence',y:.3,sx:.25,sy:.3,sz:.06,fineAxes:['z'],color:[.36,.2,.08,1]},
    gate:{name:'Timber gate',model:'gate',y:.5,sx:.5,sy:.5,sz:.08,fineAxes:['z'],color:[.34,.18,.07,1]},
    arch:{name:'Stone arch',model:'arch',y:.75,sx:.5,sy:.75,sz:.12,fineAxes:['z'],color:[.4,.39,.35,1]},
    window:{name:'Leadglass window',model:'window',y:.5,sx:.25,sy:.5,sz:.06,fineAxes:['z'],color:[.24,.48,.64,1]},
    bridge:{name:'Timber bridge',model:'bridge',y:.08,sx:.5,sy:.08,sz:.25,fineAxes:['y'],walkable:true,color:[.38,.22,.09,1]},
    pine:{name:'Highland pine',model:'pine',y:.75,sx:.25,sy:.75,sz:.25,treeVariant:3,trunkThickness:.15,color:[.1,.3,.1,1]},
    bush:{name:'Thick bush',model:'bush',y:.2,sx:.25,sy:.2,sz:.25,color:[.15,.38,.11,1]},
    boulder:{name:'Large boulder',model:'boulder',y:.4,sx:.5,sy:.4,sz:.5,color:[.34,.33,.31,1]},
    mushroom:{name:'Giant mushroom',model:'mushroom',y:.25,sx:.25,sy:.25,sz:.25,color:[.58,.13,.1,1]},
    fallen_log:{name:'Fallen log',model:'fallen_log',y:.2,sx:.5,sy:.2,sz:.2,fineAxes:['z'],color:[.28,.14,.05,1]},
    table:{name:'Tavern table',model:'table',y:.3,sx:.5,sy:.3,sz:.25,color:[.37,.21,.08,1]},
    chair:{name:'Wooden chair',model:'chair',y:.3,sx:.25,sy:.3,sz:.25,color:[.34,.19,.07,1]},
    bed:{name:'Adventurer bed',model:'bed',y:.2,sx:.5,sy:.2,sz:.25,color:[.42,.15,.12,1]},
    bookshelf:{name:'Filled bookshelf',model:'bookshelf',y:.5,sx:.5,sy:.5,sz:.12,fineAxes:['z'],color:[.31,.16,.06,1]},
    crate:{name:'Supply crate',model:'crate',y:.25,sx:.25,sy:.25,sz:.25,color:[.4,.24,.1,1]},
    tent:{name:'Canvas tent',model:'tent',y:.35,sx:.5,sy:.35,sz:.5,color:[.38,.22,.12,1]},
    well:{name:'Stone well',model:'well',y:.35,sx:.5,sy:.35,sz:.5,color:[.38,.37,.34,1]},
    altar:{name:'Ritual altar',model:'altar',y:.3,sx:.5,sy:.3,sz:.25,color:[.43,.4,.35,1]},
    statue:{name:'Ancient statue',model:'statue',y:.75,sx:.25,sy:.75,sz:.25,color:[.46,.45,.42,1]},
    signpost:{name:'Road signpost',model:'signpost',y:.5,sx:.25,sy:.5,sz:.12,fineAxes:['z'],color:[.38,.22,.08,1]},
    lantern:{name:'Standing lantern',model:'lantern',y:.25,sx:.15,sy:.25,sz:.15,fineAxes:['x','z'],color:[.8,.42,.08,1]}
  };
  const player={x:0,y:0,z:0,targetX:0,targetY:0,targetZ:0,path:[],velocityY:0,motion:'idle'};
  const atmospheres={
    morning:{sky:[.16,.31,.5,1],ambient:.66,light:[.86,-.43,.27],celestial:[-14,7,-5],color:[1,.9,.76,1]},
    day:{sky:[.075,.29,.56,1],ambient:.68,light:[-.42,-.82,.38],celestial:[8,16,-7],color:[1,.98,.88,1]},
    evening:{sky:[.12,.17,.36,1],ambient:.55,light:[-.89,-.38,.25],celestial:[14,6,-4],color:[1,.78,.62,1]},
    night:{sky:[.012,.026,.075,1],ambient:.28,light:[.57,-.67,-.48],celestial:[-12,14,10],color:[.72,.8,1,1]}
  };
  let timeOfDay='day',weather='clear',environmentChange=null,mapChange=null,objectSelect=null,playerSelect=null,positionChange=null,isCreator=false,activeTool=null,draggingObjectType='',placementRotation=0,lastHoverClient=null,gridStrokeLevel=null,painted=[],expanded=[],removed=[],mapIcons=[],visibleIcons=new Set(),editingPointer=null,mapPlayers=[],viewerId=0,controlledId=0,lastPositionSent=0,lastSentMotion='idle',localMapDirtyUntil=0,positionInitialized=false;
  const brushSizes={};
  let editorClipboard=[],undoStack=[],lastHistoryState='',historyApplying=false,historyBatchBase='';
  const heldKeys=new Set();
  const gridStep=.5,playerHalfWidth=gridStep*.4,playerHalfHeight=gridStep*.9,baseMin=-10,baseMax=10,gridMin=-50,gridMax=50,gridSize=Math.round((gridMax-gridMin)/gridStep);

  function sameCell(a,x,z){return Math.abs(Number(a.x)-x)<.01&&Math.abs(Number(a.z)-z)<.01;}
  function insideBaseTerrain(x,z){const cell=snapped({x:x,z:z});return cell.x>=baseMin+gridStep/2&&cell.x<=baseMax-gridStep/2&&cell.z>=baseMin+gridStep/2&&cell.z<=baseMax-gridStep/2;}
  function baseTerrainCell(x,z){const cell=snapped({x:x,z:z});return insideBaseTerrain(cell.x,cell.z)&&!removed.some(value=>sameCell(value,cell.x,cell.z));}
  function terrainLevelsAt(x,z){const cell=snapped({x:x,z:z}),levels=[];if(baseTerrainCell(cell.x,cell.z))levels.push(0);expanded.forEach(value=>{if(sameCell(value,cell.x,cell.z))levels.push(Math.round(Number(value.level)||0));});return Array.from(new Set(levels));}
  function waterStateAt(x,z){
    const cell=snapped({x:x,z:z}),levels=terrainLevelsAt(cell.x,cell.z).sort((a,b)=>b-a);
    if(!levels.length)return {depth:0,surface:null,floor:null,float:null};
    const top=levels[0];
    if(voxelPaintType(cell.x,cell.z,top)!=='water')return {depth:0,surface:null,floor:null,float:null};
    let depth=0,lowest=top;
    while(levels.includes(lowest)&&voxelPaintType(cell.x,cell.z,lowest)==='water'){depth++;lowest--;}
    const solidBelow=levels.filter(level=>level<=lowest&&voxelPaintType(cell.x,cell.z,level)!=='water').sort((a,b)=>b-a)[0],floor=Number.isFinite(solidBelow)?solidBelow*gridStep:(lowest+1)*gridStep-gridStep,surface=top*gridStep-gridStep*.2;
    return {depth:depth,surface:surface,floor:floor,float:surface-playerHalfHeight};
  }
  function terrainHeightAt(x,z){const levels=terrainLevelsAt(x,z);if(!levels.length)return null;const level=Math.max.apply(Math,levels);return level*gridStep-(voxelPaintType(snapped({x:x,z:z}).x,snapped({x:x,z:z}).z,level)==='water'?gridStep*.2:0);}
  function collideCameraWithTerrain(position){const ground=terrainHeightAt(position[0],position[2]);if(ground!==null)position[1]=Math.max(position[1],ground+gridStep*.32);return position;}
  function walkableWorld(x,z){return terrainLevelsAt(x,z).length>0;}
  function objectFootprint(object){const angle=Number(object.ry)||0,c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle));return {x:c*Number(object.sx)+s*Number(object.sz),z:s*Number(object.sx)+c*Number(object.sz)};}
  function objectBase(object){return Number(object.y)-Number(object.sy);}
  function objectTop(object){return Number(object.y)+Number(object.sy);}
  function buildingLevel(object){return Number.isFinite(Number(object.level))?Math.round(Number(object.level)):Math.round(objectBase(object)/gridStep);}
  function buildingConnections(object,type){const level=buildingLevel(object),matches=value=>typeof type==='function'?type(value):value.type===type,directions=[{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}];return directions.filter(direction=>scene.some(candidate=>candidate!==object&&matches(candidate)&&buildingLevel(candidate)===level&&Math.abs(Number(candidate.x)-(Number(object.x)+direction.x*gridStep))<.02&&Math.abs(Number(candidate.z)-(Number(object.z)+direction.z*gridStep))<.02));}
  function verticalBuildingConnections(object,type){const level=buildingLevel(object),matches=value=>value!==object&&value.type===type&&Math.abs(Number(value.x)-Number(object.x))<.02&&Math.abs(Number(value.z)-Number(object.z))<.02;return {above:scene.some(value=>matches(value)&&buildingLevel(value)===level+1),below:scene.some(value=>matches(value)&&buildingLevel(value)===level-1)};}
  function wallAxisDirections(object){const angle=Number(object.ry)||0,x=Math.cos(angle),z=-Math.sin(angle),direction=Math.abs(x)>=Math.abs(z)?{x:x>=0?1:-1,z:0}:{x:0,z:z>=0?1:-1};return [direction,{x:-direction.x,z:-direction.z}];}
  function isWallObject(object){return ['wall','wood_wall','window_wall','wood_window_wall'].includes(String(object&&object.type||''));}
  function isRoofObject(object){return String(object.type||'').indexOf('roof')===0;}
  function roofConnectionParts(){return [];}
  function overlapsPoint(object,x,z,padding){const footprint=objectFootprint(object),extra=Number(padding)||0;return Math.abs(x-Number(object.x))<footprint.x+extra&&Math.abs(z-Number(object.z))<footprint.z+extra;}
  function isLowWalkable(object){return object.type!=='npc'&&(object.walkable||(Number(object.sx)<=gridStep*.51&&Number(object.sz)<=gridStep*.51))&&Number(object.sy)*2<gridStep*.5+.001;}
  function stairHeight(object,x,z){const angle=Number(object.ry)||0,dx=x-Number(object.x),dz=z-Number(object.z),localZ=dx*Math.sin(angle)+dz*Math.cos(angle),progress=Math.max(0,Math.min(1,(localZ+Number(object.sz))/(Number(object.sz)*2||1)));return objectBase(object)+progress*Number(object.sy)*2;}
  function navigationSurface(x,z,referenceY){const reference=Number(referenceY),cell=snapped({x:x,z:z}),water=waterStateAt(cell.x,cell.z),onStair=Number.isFinite(reference)&&scene.some(object=>object.type==='stairs'&&overlapsPoint(object,x,z,playerHalfWidth*.9)&&objectBase(object)<=reference+.08&&objectTop(object)>=reference-.08),maxReach=Number.isFinite(reference)?reference+gridStep*(onStair?1.1:.55):Infinity,terrainSurfaces=terrainLevelsAt(cell.x,cell.z).filter(level=>voxelPaintType(cell.x,cell.z,level)!=='water').map(level=>level*gridStep).filter(value=>value<=maxReach+.001);let height=terrainSurfaces.length?Math.max.apply(Math,terrainSurfaces):null,waterHeight=water.depth>=2?water.float:water.depth===1?water.floor:null,stair=false;if(Number.isFinite(waterHeight)&&(height===null||waterHeight>height))height=waterHeight;if(height===null)height=0;scene.forEach(object=>{const lowWalkable=isLowWalkable(object),supportPadding=lowWalkable?playerHalfWidth*.9:0;if(!overlapsPoint(object,x,z,supportPadding))return;if(object.type==='stairs'){const candidate=stairHeight(object,x,z);if(candidate<=maxReach+.001&&candidate>=height-.001){height=candidate;stair=true;}}else if(lowWalkable){const candidate=objectTop(object);if(candidate<=maxReach+.001&&candidate>height){height=candidate;stair=false;}}});return {height:height,stair:stair,waterDepth:water.depth};}
  function ladderAt(x,z,feetY,direction){const y=Number(feetY),candidates=scene.filter(object=>object.type==='ladder'&&overlapsPoint(object,x,z,playerHalfWidth*.35)&&y>=objectBase(object)-.08&&y<=objectTop(object)+.08);if(direction>0){const upward=candidates.filter(object=>objectTop(object)>y+.005).sort((a,b)=>objectTop(a)-objectTop(b));if(upward.length)return upward[0];}else if(direction<0){const downward=candidates.filter(object=>objectBase(object)<y-.005).sort((a,b)=>objectBase(b)-objectBase(a));if(downward.length)return downward[0];}return candidates.sort((a,b)=>Math.abs((objectBase(a)+objectTop(a))*.5-y)-Math.abs((objectBase(b)+objectTop(b))*.5-y))[0]||null;}
  function blockedWorld(x,z,feetY,entryY) {
    if(!walkableWorld(x,z))return true;
    const floorY=Number.isFinite(Number(feetY))?Number(feetY):navigationSurface(x,z).height,entryFloor=Number.isFinite(Number(entryY))?Math.max(floorY,Number(entryY)):floorY;
    const terrainCells=[],sampleInset=playerHalfWidth*.98;[-sampleInset,sampleInset].forEach(dx=>[-sampleInset,sampleInset].forEach(dz=>{const cell=snapped({x:x+dx,z:z+dz});if(!terrainCells.some(value=>sameCell(value,cell.x,cell.z)))terrainCells.push(cell);}));const terrainBlocked=terrainCells.some(cell=>terrainLevelsAt(cell.x,cell.z).some(level=>{if(voxelPaintType(cell.x,cell.z,level)==='water')return false;const bottom=level*gridStep-gridStep,top=level*gridStep;return top>entryFloor+.03&&bottom<floorY+playerHalfHeight*2-.03;}));
    if(terrainBlocked)return true;
    return scene.some(object=>{if(object.type==='door'||object.type==='gate'||object.type==='arch'||object.type==='stairs'||object.type==='ladder')return false;if(!overlapsPoint(object,x,z,playerHalfWidth))return false;if(isLowWalkable(object)&&objectTop(object)<=floorY+.03)return false;return objectTop(object)>floorY+.03&&objectBase(object)<floorY+playerHalfHeight*2-.03;});
  }
  function navigationPoint(x,z,i,j,referenceY){const surface=navigationSurface(x,z,referenceY);return {x:x,y:surface.height,z:z,i:i,j:j,stair:surface.stair,waterDepth:surface.waterDepth,blocked:blockedWorld(x,z,surface.height)};}
  function canTraverse(from,to){if(!to||to.blocked)return false;const rise=Number(to.y)-Number(from.y),stair=!!(from.stair||to.stair),waterTransition=Number(from.waterDepth)>0||Number(to.waterDepth)>0,maximumRise=waterTransition?gridStep*1.1:stair?gridStep*1.1:gridStep*.55;return rise<=maximumRise;}
  function gridPoint(i,j,referenceY) {const x=gridMin+(i+.5)*gridStep,z=gridMin+(j+.5)*gridStep;return navigationPoint(x,z,i,j,referenceY);}
  function nearestOpen(i,j,referenceY) {
    for(let radius=0;radius<gridSize;radius++) {
      for(let x=i-radius;x<=i+radius;x++) for(let z=j-radius;z<=j+radius;z++) {
        if(x<0||z<0||x>=gridSize||z>=gridSize||Math.max(Math.abs(x-i),Math.abs(z-j))!==radius)continue;
        const p=gridPoint(x,z,referenceY); if(!p.blocked)return p;
      }
    }
    return null;
  }
  function findPath(fromX,fromZ,toX,toZ,fromY) {
    const clampIndex=v=>Math.max(0,Math.min(gridSize-1,Math.floor((v-gridMin)/gridStep)));
    const start=nearestOpen(clampIndex(fromX),clampIndex(fromZ),fromY),goal=nearestOpen(clampIndex(toX),clampIndex(toZ),fromY);
    if(!start||!goal)return [];
    const key=(i,j)=>i+','+j, goalKey=key(goal.i,goal.j), open=[start], came=new Map(),nodes=new Map([[key(start.i,start.j),start],[goalKey,goal]]), scores=new Map([[key(start.i,start.j),0]]), closed=new Set();
    start.f=Math.hypot(goal.i-start.i,goal.j-start.j);
    const directions=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
    while(open.length) {
      let best=0; for(let n=1;n<open.length;n++)if(open[n].f<open[best].f)best=n;
      const current=open.splice(best,1)[0],currentKey=key(current.i,current.j);
      if(currentKey===goalKey) {
        const route=[]; let cursor=currentKey;
        while(cursor!==key(start.i,start.j)) {route.push(nodes.get(cursor));cursor=came.get(cursor);}
        route.reverse();
        return route;
      }
      closed.add(currentKey);
      directions.forEach(d=>{
        const ni=current.i+d[0],nj=current.j+d[1],nextKey=key(ni,nj);
        if(ni<0||nj<0||ni>=gridSize||nj>=gridSize||closed.has(nextKey))return;
        const next=gridPoint(ni,nj,current.y); if(!canTraverse(current,next))return;
        if(d[0]&&d[1]) {
          const sideA=gridPoint(current.i+d[0],current.j,current.y),sideB=gridPoint(current.i,current.j+d[1],current.y);
          if(!canTraverse(current,sideA)||!canTraverse(current,sideB))return;
        }
        const rise=Math.max(0,next.y-current.y),stairBonus=rise>0&&(current.stair||next.stair)?.28:0,score=scores.get(currentKey)+(d[0]&&d[1]?Math.SQRT2:1)+rise*2-stairBonus;
        if(score>=(scores.get(nextKey)??Infinity))return;
        came.set(nextKey,currentKey);nodes.set(nextKey,next);scores.set(nextKey,score);next.f=score+Math.hypot(goal.i-ni,goal.j-nj);
        const existing=open.find(p=>p.i===ni&&p.j===nj);if(existing)existing.f=next.f;else open.push(next);
      });
    }
    return [];
  }
  let yaw=.65,pitch=.62,distance=18,active=false,frame=0,last=performance.now(),cameraFocus={x:0,z:0,targetX:0,targetZ:0};
  let projection=identity(),view=identity(),eye=[0,0,0],drag=null,moved=false,pinchDistance=0,hoverCell=null,hoverObject=null,selectedObject=null,selectedGroup=[],lastHierarchyObjectId='',collapsedFolders=new Set(),gizmoDrag=null,lastBrushPoint=null,rightDragged=false,splineDraft=null;
  const pointers=new Map();

  function bind(m) {
    gl.bindBuffer(gl.ARRAY_BUFFER,m.buffer);
    gl.enableVertexAttribArray(locations.aPosition); gl.vertexAttribPointer(locations.aPosition,3,gl.FLOAT,false,24,0);
    gl.enableVertexAttribArray(locations.aNormal); gl.vertexAttribPointer(locations.aNormal,3,gl.FLOAT,false,24,12);
  }
  function surfaceProperties(pattern,color,unlit){
    if(unlit)return {roughness:1,normal:0};
    const alpha=Number(color&&color[3]);if(alpha<.78)return {roughness:.08,normal:.02};
    const values={1:[.86,.38],2:[.92,.62],4:[.55,.05],5:[1,0],6:[.78,.4],7:[.92,.58],8:[.84,.46],9:[.94,.66],10:[1,0],11:[.06,.3],12:[.94,.58],13:[.88,.34],14:[.95,.72],15:[.74,.2],16:[.8,.48],17:[.34,.38]},value=values[Math.round(Number(pattern)||0)]||[.46,.08];
    return {roughness:value[0],normal:value[1]};
  }
  function draw(m,model,color,unlit,mode,pattern,roughness,normalStrength) {
    bind(m);gl.uniformMatrix4fv(locations.uModel,false,new Float32Array(model));const inverseModel=inverse(model);
    gl.uniformMatrix3fv(locations.uNormalMatrix,false,new Float32Array([inverseModel[0],inverseModel[4],inverseModel[8],inverseModel[1],inverseModel[5],inverseModel[9],inverseModel[2],inverseModel[6],inverseModel[10]]));
    const material=surfaceProperties(pattern,color,unlit),patternId=Math.round(Number(pattern)||0),hasTexture=texturedPatterns.has(patternId);gl.uniform4fv(locations.uColor,color);gl.uniform1f(locations.uUnlit,unlit||0);gl.uniform1f(locations.uPattern,pattern||0);gl.uniform1f(locations.uRoughness,roughness===undefined?material.roughness:roughness);gl.uniform1f(locations.uNormalStrength,normalStrength===undefined?material.normal:normalStrength);gl.uniform1f(locations.uHasTexture,hasTexture?1:0);gl.uniform4fv(locations.uTextureRect,new Float32Array([(patternId%textureAtlasColumns)/textureAtlasColumns,Math.floor(patternId/textureAtlasColumns)/textureAtlasRows,1/textureAtlasColumns,1/textureAtlasRows]));gl.drawArrays(mode||gl.TRIANGLES,0,m.count);
  }
  function rainRandom(index,salt){return ((Math.sin(index*91.731+salt*47.113)*43758.5453)%1+1)%1;}
  function drawRain(now,focus){
    if(weather==='clear')return;
    const storm=weather==='storm',count=storm?520:320,spread=Math.max(16,Math.min(46,distance*1.8)),height=Math.max(12,Math.min(26,distance*.7+10)),speed=storm?.0024:.00165,dropLength=storm?.72:.48,wind=storm?.5:.24,centerX=(Number(focus[0])+Number(eye[0]))*.5,centerZ=(Number(focus[2])+Number(eye[2]))*.5,values=[];
    for(let index=0;index<count;index++){
      const phase=(rainRandom(index,3)+now*speed)%1,x=centerX+(rainRandom(index,7)-.5)*spread+phase*wind,z=centerZ+(rainRandom(index,13)-.5)*spread-phase*wind*.35,y=Number(focus[1])+.15+(1-phase)*height,length=dropLength*(.7+rainRandom(index,19)*.6);
      values.push(x,y,z,0,1,0,x-wind*.12,y-length,z+wind*.04,0,1,0);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER,rainMesh.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.DYNAMIC_DRAW);rainMesh.count=values.length/6;
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.disable(gl.CULL_FACE);draw(rainMesh,identity(),storm?[.67,.78,.9,.64]:[.72,.84,.9,.52],1,gl.LINES);gl.enable(gl.CULL_FACE);gl.depthMask(true);gl.disable(gl.BLEND);
  }
  function resize() {
    if(disposed||!canUse3D()||world.hidden)return;
    const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight),coarse=window.matchMedia&&window.matchMedia('(pointer: coarse)').matches,qualityScale=coarse?1.15:1.5,requestedScale=Math.min((window.devicePixelRatio||1)*qualityScale,3),pixelBudget=coarse?4200000:8300000,budgetScale=Math.sqrt(pixelBudget/(w*h)),maxDimension=gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)||4096,dimensionScale=Math.min(maxDimension/w,maxDimension/h),renderScale=Math.max(1,Math.min(requestedScale,budgetScale,dimensionScale)),targetWidth=Math.max(1,Math.round(w*renderScale)),targetHeight=Math.max(1,Math.round(h*renderScale));
    if(canvas.width!==targetWidth||canvas.height!==targetHeight){canvas.width=targetWidth;canvas.height=targetHeight;gl.viewport(0,0,targetWidth,targetHeight);}
    projection=perspective(Math.PI/4,w/h,.1,300);
  }
  function render(now) {
    if(!active||!canUse3D()||world.hidden){active=false;frame=0;return;}
    resize(); const dt=Math.min((now-last)/1000,.05); last=now;
    let inputX=(heldKeys.has('d')?1:0)-(heldKeys.has('a')?1:0),inputZ=(heldKeys.has('s')?1:0)-(heldKeys.has('w')?1:0),inputLength=Math.hypot(inputX,inputZ),climbing=false,climbMoving=false,currentWater=controlledId?waterStateAt(player.x,player.z):{depth:0};
    const climbInput=(heldKeys.has('w')?1:0)-(heldKeys.has('s')?1:0),nearbyLadder=controlledId?ladderAt(player.x,player.z,player.y,climbInput):null;
    if(nearbyLadder&&Math.abs(inputX)<.01){const bottom=objectBase(nearbyLadder),top=objectTop(nearbyLadder),canClimb=climbInput&&!(climbInput>0&&player.y>=top-.01)&&!(climbInput<0&&player.y<=bottom+.01),holding=!inputLength&&!player.path.length&&player.y>bottom+.01&&player.y<top-.01;if(canClimb||holding){climbing=true;climbMoving=!!canClimb;player.path=[];player.velocityY=0;player.motion='climb';if(canClimb){player.y=Math.max(bottom,Math.min(top,player.y+climbInput*(heldKeys.has('shift')?2.5:1.65)*dt));player.x+=(Number(nearbyLadder.x)-player.x)*Math.min(1,dt*8);player.z+=(Number(nearbyLadder.z)-player.z)*Math.min(1,dt*8);player.facing=(Number(nearbyLadder.ry)||0)+Math.PI;}}}
    if(inputLength&&!climbing){inputX/=inputLength;inputZ/=inputLength;const worldX=inputX*Math.cos(yaw)+inputZ*Math.sin(yaw),worldZ=-inputX*Math.sin(yaw)+inputZ*Math.cos(yaw),waterSpeed=currentWater.depth>=2?.5:currentWater.depth===1?.65:1,speed=(heldKeys.has('shift')?7:4)*waterSpeed*dt;
      if(isCreator&&!controlledId){cameraFocus.x+=worldX*speed;cameraFocus.z+=worldZ*speed;cameraFocus.targetX=cameraFocus.x;cameraFocus.targetZ=cameraFocus.z;}
      else if(controlledId){player.path=[];const startX=player.x,startZ=player.z,attempt=(x,z)=>{const surface=navigationSurface(x,z,player.y),next={x:x,y:surface.height,z:z,stair:surface.stair,waterDepth:surface.waterDepth,blocked:blockedWorld(x,z,surface.height,player.y)},currentSurface=navigationSurface(player.x,player.z,player.y),current={x:player.x,y:player.y,z:player.z,stair:currentSurface.stair,waterDepth:currentSurface.waterDepth};if(canTraverse(current,next)){player.x=x;if(next.y>player.y)player.y=next.y;player.z=z;return true;}return false;},moveX=worldX*speed,moveZ=worldZ*speed,steps=Math.max(1,Math.ceil(Math.hypot(moveX,moveZ)/(playerHalfWidth*.45)));for(let step=0;step<steps;step++){const dx=moveX/steps,dz=moveZ/steps,nextX=player.x+dx,nextZ=player.z+dz;if(!attempt(nextX,nextZ)&&!attempt(nextX,player.z)&&!attempt(player.x,nextZ))break;}const movedX=player.x-startX,movedZ=player.z-startZ;if(Math.hypot(movedX,movedZ)>.0001)player.facing=Math.atan2(movedX,movedZ);}
    }else if(!climbing){
      const waypoint=player.path[0],dx=waypoint?waypoint.x-player.x:0,dz=waypoint?waypoint.z-player.z:0,d=Math.hypot(dx,dz);
      if(waypoint&&d>.03){const pathWater=waterStateAt(player.x,player.z),waterSpeed=pathWater.depth>=2?.5:pathWater.depth===1?.65:1,step=Math.min(d,dt*3.2*waterSpeed),ratio=step/d;player.facing=Math.atan2(dx,dz);player.x+=dx*ratio;player.z+=dz*ratio;const height=navigationSurface(player.x,player.z,player.y).height;if(height>player.y)player.y=height;}
      else if(waypoint){player.x=waypoint.x;if(waypoint.y>player.y)player.y=waypoint.y;player.z=waypoint.z;player.path.shift();if(!player.path.length){if(positionChange&&controlledId)positionChange(controlledId,player.x,player.z,player.y,player.motion);}}
    }
    if(controlledId&&!climbing){const support=navigationSurface(player.x,player.z,player.y).height,waterNow=waterStateAt(player.x,player.z),groundMotion=waterNow.depth>=2?'swim':inputLength||player.path.length?'walk':'idle';if(player.y>support+.012){player.velocityY=Math.max(-14,Number(player.velocityY||0)-18*dt);player.y=Math.max(support,player.y+player.velocityY*dt);if(player.y>support+.012)player.motion='fall';else{player.y=support;player.velocityY=0;player.motion=groundMotion;}}else{player.y=support;player.velocityY=0;player.motion=groundMotion;}}
    const controlled=mapPlayers.find(p=>Number(p.id)===Number(controlledId));if(controlled){controlled.x=player.x;controlled.y=player.y;controlled.z=player.z;controlled.facing=Number.isFinite(Number(player.facing))?Number(player.facing):(Number(controlled.facing)||0);controlled._motion=player.motion;if(inputLength||player.path.length||climbMoving)controlled._movingUntil=now+180;const positionActive=inputLength||player.path.length||climbMoving||player.motion==='fall'||player.motion!==lastSentMotion;if(positionActive&&positionChange&&now-lastPositionSent>80){lastPositionSent=now;lastSentMotion=player.motion;positionChange(controlled.id,player.x,player.z,player.y,player.motion);}}
    if(isCreator&&!controlledId){const fdx=cameraFocus.targetX-cameraFocus.x,fdz=cameraFocus.targetZ-cameraFocus.z,fd=Math.hypot(fdx,fdz);if(fd>.02){const step=Math.min(fd,dt*7);cameraFocus.x+=fdx/fd*step;cameraFocus.z+=fdz/fd*step;}}
    const focusSource=isCreator&&!controlledId?cameraFocus:player,focus=[focusSource.x,Number(focusSource.y)||0,focusSource.z];eye=collideCameraWithTerrain([focus[0]+Math.sin(yaw)*Math.cos(pitch)*distance,focus[1]+Math.sin(pitch)*distance,focus[2]+Math.cos(yaw)*Math.cos(pitch)*distance]);
    view=lookAt(eye,focus); const atmosphere=atmospheres[timeOfDay]||atmospheres.day,weatherShade=weather==='storm'?.58:weather==='rain'?.78:1,lightDirection=normalize([-atmosphere.celestial[0],-atmosphere.celestial[1],-atmosphere.celestial[2]]);
    gl.clearColor(atmosphere.sky[0]*weatherShade,atmosphere.sky[1]*weatherShade,atmosphere.sky[2]*weatherShade,1);gl.clearStencil(0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT|gl.STENCIL_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
    gl.uniformMatrix4fv(locations.uProjection,false,new Float32Array(projection)); gl.uniformMatrix4fv(locations.uView,false,new Float32Array(view));
    const warmSources=scene.filter(o=>o.type==='torch'||o.type==='campfire'||o.type==='lantern').sort((a,b)=>Math.hypot(Number(a.x)-focus[0],Number(a.z)-focus[2])-Math.hypot(Number(b.x)-focus[0],Number(b.z)-focus[2])).slice(0,maxWarmLights),fogColor=[atmosphere.sky[0]*.72,atmosphere.sky[1]*.76,atmosphere.sky[2]*.78];
    gl.uniform3fv(locations.uLightDirection,new Float32Array(lightDirection));gl.uniform3fv(locations.uCamera,new Float32Array(eye));gl.uniform1f(locations.uAmbient,atmosphere.ambient*weatherShade);gl.uniform3fv(locations.uCelestialDirection,new Float32Array(normalize(atmosphere.celestial)));gl.uniform1f(locations.uSkyNight,timeOfDay==='night'?1:0);gl.uniform1f(locations.uWeather,weather==='storm'?2:weather==='rain'?1:0);gl.uniform1f(locations.uTime,now*.001);gl.uniform1f(locations.uFogDensity,weather==='storm'?.025:weather==='rain'?.016:.007);gl.uniform3fv(locations.uFogColor,new Float32Array(fogColor));
    const warmLightPositions=new Float32Array(maxWarmLights*3);warmSources.forEach((source,index)=>{warmLightPositions[index*3]=Number(source.x);warmLightPositions[index*3+1]=Number(source.y)+Number(source.sy);warmLightPositions[index*3+2]=Number(source.z);});gl.uniform1f(locations.uWarmLightCount,warmSources.length);gl.uniform3fv(locations.uWarmLights,warmLightPositions);
    gl.disable(gl.CULL_FACE);gl.depthMask(false);draw(cube,transform(eye[0],eye[1],eye[2],60,60,60),[atmosphere.sky[0]*weatherShade,atmosphere.sky[1]*weatherShade,atmosphere.sky[2]*weatherShade,1],1,gl.TRIANGLES,5);gl.depthMask(true);
    const terrainMaterials={base:{color:[.24,.4,.2,1],pattern:9},path:{color:[.42,.29,.16,1],pattern:1},grass:{color:[.18,.5,.13,1],pattern:2},floor:{color:[.39,.23,.1,1],pattern:6},zone:{color:[.5,.18,.5,1],pattern:4},water:{color:[.08,.34,.48,.72],pattern:11},dirt:{color:[.36,.22,.11,1],pattern:12},sand:{color:[.68,.55,.31,1],pattern:13},stone:{color:[.4,.41,.4,1],pattern:14},snow:{color:[.78,.84,.86,1],pattern:15},mud:{color:[.22,.16,.1,1],pattern:16},lava:{color:[.62,.09,.015,1],pattern:17}};
    rebuildTerrainChunks();terrainChunks.forEach(chunk=>{if(chunk.material==='water')return;const material=terrainMaterials[chunk.material]||terrainMaterials.base;draw(chunk.mesh,identity(),material.color,0,gl.TRIANGLES,material.pattern);});
    const paintColors={path:[.42,.29,.16,.82],grass:[.18,.5,.13,.75],fog:[.72,.75,.7,.38],zone:[.5,.18,.5,.52],dirt:[.36,.22,.11,.84],sand:[.68,.55,.31,.82],stone:[.4,.41,.4,.86],snow:[.78,.84,.86,.82],mud:[.22,.16,.1,.86],lava:[.62,.09,.015,.88]};
    gl.clear(gl.STENCIL_BUFFER_BIT);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.enable(gl.STENCIL_TEST);gl.stencilMask(0xff);gl.stencilFunc(gl.EQUAL,0,0xff);gl.stencilOp(gl.KEEP,gl.KEEP,gl.INCR);
    const paintPatterns={path:1,grass:2,zone:4,dirt:12,sand:13,stone:14,snow:15,mud:16,lava:17};painted.forEach(stamp=>{if(!stamp.grid&&paintColors[stamp.type]&&stamp.type!=='fog'){const radius=Number(stamp.radius)||.38;draw(disk,transform(Number(stamp.x),.035,Number(stamp.z),radius,1,radius),paintColors[stamp.type],1,gl.TRIANGLES,paintPatterns[stamp.type]);}});
    gl.disable(gl.STENCIL_TEST);gl.depthMask(true);gl.disable(gl.BLEND);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    const eraserHover=activeTool&&activeTool.kind==='brush'&&activeTool.value==='erase',objectPlacement=hoverCell&&hoverCell.placement;
    if(hoverCell&&!objectPlacement&&(!hoverObject||eraserHover)){if(eraserHover){const size=brushSize('erase'),half=size*gridStep/2,offset=size%2===0?gridStep/2:0;gl.disable(gl.DEPTH_TEST);draw(cube,transform(hoverCell.x+offset,hoverCell.y+offset,hoverCell.z+offset,half,half,half),[.95,.25,.12,.28],1);gl.enable(gl.DEPTH_TEST);}else if(activeTool&&activeTool.kind==='brush'&&!['expand','erase-grid'].includes(activeTool.value)&&!activeTool.value.startsWith('grid-')&&!activeTool.value.startsWith('scatter-')){const radii={path:.34,grass:.52,fog:.78,zone:.62,dirt:.46,sand:.5,stone:.42,snow:.5,mud:.46,lava:.42},radius=(radii[activeTool.value]||.45)*brushSize(activeTool.value);draw(disk,transform(hoverCell.rawX,.018,hoverCell.rawZ,radius,1,radius),[.95,.69,.18,.38],1);}else{const size=activeTool&&activeTool.kind==='brush'?brushSize(activeTool.value):1,offset=size%2===0?gridStep/2:0;gl.disable(gl.DEPTH_TEST);draw(cube,transform(hoverCell.x+offset,hoverCell.level*gridStep-gridStep/2,hoverCell.z+offset,.25*size,.25,.25*size),[.95,.69,.18,.34],1);gl.enable(gl.DEPTH_TEST);}}
    if(splineDraft&&splineDraft.points.length){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);splineDraft.points.forEach(point=>draw(plane,transform(point.x,.025,point.z,.245,1,.245),[1,.66,.12,.52],1));gl.disable(gl.BLEND);}
    gl.disable(gl.BLEND);
    gl.clear(gl.STENCIL_BUFFER_BIT);gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.enable(gl.STENCIL_TEST);gl.stencilMask(0xff);gl.stencilFunc(gl.EQUAL,0,0xff);gl.stencilOp(gl.KEEP,gl.KEEP,gl.INCR);
    gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(-1,-2);
    scene.forEach(o=>{const npc=o.type==='npc'&&mapNpcs.find(value=>Number(value.id)===Number(o.npc_id));if(npc)drawCharacterEntity(o,npc.character_rig,lightDirection,true,now);else drawSceneObject(o,lightDirection,true,false);});
    mapPlayers.forEach(p=>drawCharacterEntity(p,p.character_rig,lightDirection,true,now));gl.disable(gl.STENCIL_TEST);gl.disable(gl.POLYGON_OFFSET_FILL);gl.depthMask(true);gl.disable(gl.BLEND);
    scene.forEach(o=>{const npc=o.type==='npc'&&mapNpcs.find(value=>Number(value.id)===Number(o.npc_id));if(npc)drawCharacterEntity(o,npc.character_rig,lightDirection,false,now);else drawSceneObject(o,lightDirection,false,o===hoverObject||selectedObjects().includes(o));});
    drawRain(now,focus);
    gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);painted.filter(stamp=>stamp.type==='fog').forEach((stamp,index)=>{const radius=Number(stamp.radius)||.78,wave=Math.sin(now*.00035+index*2.17)*.08,baseY=(Number(stamp.level)||0)*gridStep+.02;[0,1].forEach(layer=>{const x=Number(stamp.x)+wave*(layer?1:-1),y=baseY+layer*radius*.08,z=Number(stamp.z);draw(mistPlane,cameraFacingTransform(x,y,z,radius*(1.12-layer*.08),radius*(.68+layer*.08),eye),[.72,.78,.77,.4],1,gl.TRIANGLES,10);});});gl.depthMask(true);gl.disable(gl.BLEND);gl.enable(gl.CULL_FACE);
    if(eraserHover&&hoverCell){const size=brushSize('erase'),half=size*gridStep/2,offset=size%2===0?gridStep/2:0;gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.DEPTH_TEST);draw(cube,transform(hoverCell.x+offset,hoverCell.y+offset,hoverCell.z+offset,half,half,half),[.95,.25,.12,.3],1);gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);}
    const portraitMode=distance>=24;
    if(!portraitMode)mapPlayers.forEach(p=>drawCharacterEntity(p,p.character_rig,lightDirection,false,now));
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.disable(gl.CULL_FACE);terrainChunks.forEach(chunk=>{if(chunk.material!=='water')return;const material=terrainMaterials.water;draw(chunk.mesh,identity(),material.color,0,gl.TRIANGLES,material.pattern);});gl.enable(gl.CULL_FACE);gl.depthMask(true);gl.disable(gl.BLEND);
    if(objectPlacement){const preview=Object.assign({},objectPlacement,{y:hoverCell.level*gridStep+Number(objectPlacement.sy)});gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.disable(gl.DEPTH_TEST);drawPlacementPreview(preview);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.BLEND);}
    drawGizmo();
    if(playerLayer)playerLayer.querySelectorAll('.map-player-token').forEach(marker=>{const p=mapPlayers.find(value=>String(value.id)===marker.dataset.userId);if(!p){marker.hidden=true;return;}const clip=vector(multiply(projection,view),[Number(p.x),(Number(p.y)||0)+playerHalfHeight*2+.12,Number(p.z),1]);marker.style.left=((clip[0]+1)*50)+'%';marker.style.top=((1-clip[1])*50)+'%';marker.classList.toggle('visible',portraitMode&&clip[2]>-1&&clip[2]<1);});
    const gizmo=document.getElementById('mapTransformGizmo');if(gizmo)gizmo.hidden=true;
    const checkpointLayer=document.getElementById('mapCheckpointLayer');
    if(checkpointLayer){checkpointLayer.querySelectorAll('[data-object-id]').forEach(marker=>{const object=scene.find(o=>o.id===marker.dataset.objectId),icon=mapIcons.find(i=>String(i.id)===marker.dataset.iconId);if(!object||!icon||!visibleIcons.has(String(icon.id))){marker.hidden=true;return;}const clip=vector(multiply(projection,view),[object.x,object.y+object.sy+.35,object.z,1]);marker.hidden=clip[2]<-1||clip[2]>1;marker.style.left=((clip[0]+1)*50)+'%';marker.style.top=((1-clip[1])*50)+'%';});}
    frame=requestAnimationFrame(render);
  }
  function groundPoint(clientX,clientY) {
    const ray=screenRay(clientX,clientY),near=ray.near,far=ray.far;
    const dy=far[1]-near[1]; if(Math.abs(dy)<.0001)return null;
    const t=-near[1]/dy; if(t<0)return null;
    return {x:Math.max(gridMin,Math.min(gridMax,near[0]+(far[0]-near[0])*t)),z:Math.max(gridMin,Math.min(gridMax,near[2]+(far[2]-near[2])*t))};
  }
  function updateHover(clientX,clientY) {
    lastHoverClient={x:clientX,y:clientY};
    const p=groundPoint(clientX,clientY),terrainHit=pickTerrainVoxel(clientX,clientY);if(!p&&!terrainHit){hoverCell=null;hoverObject=null;return;}
    hoverObject=pickObject(clientX,clientY);
    const brush=activeTool&&activeTool.kind==='brush'?activeTool.value:'',erasing=brush==='erase',objectType=draggingObjectType||(activeTool&&activeTool.kind==='object'?activeTool.value:''),style=objectStyles[objectType],voxelTarget=brush==='expand'?adjacentVoxel(terrainHit,heldKeys.has('shift')):(brush==='erase-grid'||brush.startsWith('grid-'))&&terrainHit?terrainHit:null,stairNext=objectType==='stairs'?stairContinuation(hoverObject,style):null,objectTarget=stairNext||(style&&hoverObject&&lastPickPoint?{x:lastPickPoint[0],z:lastPickPoint[2]}:null),target=erasing&&lastPickPoint?{x:lastPickPoint[0],z:lastPickPoint[2]}:objectTarget||voxelTarget||p,cell=snapped(target),placementCell=stairNext?stairNext:cell;let level=voxelTarget?Number(voxelTarget.level):erasing&&lastPickPoint?Math.floor((lastPickPoint[1]-.001)/gridStep):0,placement=null;if(brush==='expand'&&gridStrokeLevel!==null)level=gridStrokeLevel;if(style){placement=Object.assign({},style,{type:objectType,x:placementCell.x,z:placementCell.z,rx:0,ry:stairNext?stairNext.ry:placementRotation,rz:0});snapObjectToGrid(placement,placementCell.x,placementCell.z);level=stairNext?stairNext.level:placementLevel(placement);}hoverCell={x:placementCell.x,y:level*gridStep+gridStep/2,z:placementCell.z,level:level,rawX:target.x,rawZ:target.z,placement:placement,continuation:stairNext};
    canvas.style.cursor=pickGizmo(clientX,clientY)||hoverObject?'pointer':'grab';
  }
  function snapValue(value,step,offset){return Math.round((Number(value)-(offset||0))/step)*step+(offset||0);}
  function snapped(p){const low=gridMin+gridStep/2,high=gridMax-gridStep/2;return {x:Math.max(low,Math.min(high,snapValue(p.x,gridStep,gridStep/2))),z:Math.max(low,Math.min(high,snapValue(p.z,gridStep,gridStep/2)))};}
  function splineNode(p){return {x:Math.max(gridMin,Math.min(gridMax,snapValue(p.x,gridStep,0))),z:Math.max(gridMin,Math.min(gridMax,snapValue(p.z,gridStep,0)))};}
  function objectGridOffset(object,axis){const quarterTurns=Math.abs(Math.round((Number(object.ry)||0)/(Math.PI/2)))%2;if(isWallObject(object))return object.spline?0:(axis==='x'?(quarterTurns?0:gridStep/2):(quarterTurns?gridStep/2:0));const halfSize=axis==='x'?(quarterTurns?Number(object.sz):Number(object.sx)):(quarterTurns?Number(object.sx):Number(object.sz)),cells=Math.max(1,Math.round(halfSize*2/gridStep));return cells%2?gridStep/2:0;}
  function snapObjectToGrid(object,x,z){object.x=snapValue(x,gridStep,objectGridOffset(object,'x'));object.z=snapValue(z,gridStep,objectGridOffset(object,'z'));return object;}
  function objectScaleStep(object,axis){if(object&&object.type==='floor'&&axis==='y')return gridStep/40;return (object&&object.fineAxes||[]).includes(axis)?.05:.25;}
  function selectHierarchyRow(object,event){const modifier=!!(event.ctrlKey||event.metaKey||(event.getModifierState&&event.getModifierState('Control')));if(event.shiftKey&&lastHierarchyObjectId){const ids=Array.from(document.querySelectorAll('#mapHierarchy [data-map-tree-object]:not([hidden])')).map(row=>row.dataset.mapTreeObject),start=ids.indexOf(lastHierarchyObjectId),end=ids.indexOf(object.id);if(start>=0&&end>=0){const range=ids.slice(Math.min(start,end),Math.max(start,end)+1).map(id=>scene.find(value=>value.id===id)).filter(Boolean),values=modifier?selectedObjects().slice():[];range.forEach(value=>{if(!values.includes(value))values.push(value);});selectedGroup=values;selectedObject=object;lastHierarchyObjectId=object.id;rebuildHierarchy();return;}}lastHierarchyObjectId=object.id;if(modifier)toggleSceneObject(object);else selectOnlySceneObject(object);}
  function applyHierarchySearch(){
    const input=document.getElementById('mapHierarchySearch'),hierarchy=document.getElementById('mapHierarchy');if(!input||!hierarchy)return;const query=input.value.trim().toLowerCase(),root=hierarchy.querySelector('.map-tree-root');
    if(root){let matches=0;root.querySelectorAll('.map-tree-object').forEach(row=>{const visible=!query||row.textContent.toLowerCase().includes(query);row.hidden=!visible;if(visible)matches++;});root.hidden=!!query&&!matches;}
    hierarchy.querySelectorAll('.map-tree-folder').forEach(group=>{const heading=group.querySelector('.map-tree-folder-head'),items=group.querySelector('.map-tree-folder-items'),folderMatch=!!query&&heading&&heading.textContent.toLowerCase().includes(query);let matches=0;items.querySelectorAll('.map-tree-object').forEach(row=>{const visible=!query||folderMatch||row.textContent.toLowerCase().includes(query);row.hidden=!visible;if(visible)matches++;});group.hidden=!!query&&!folderMatch&&!matches;if(query&&!group.hidden)items.hidden=false;else if(!query)items.hidden=collapsedFolders.has(group.dataset.mapFolderId);});
  }
  function rebuildHierarchy(){
    const hierarchy=document.getElementById('mapHierarchy');if(!hierarchy)return;hierarchy.innerHTML='';
    const addObject=(object,parent)=>{const row=document.createElement('button');row.type='button';row.className='map-tree-object';row.draggable=true;row.dataset.mapTreeObject=object.id;row.textContent=object.name||object.type;row.classList.toggle('selected',selectedObjects().includes(object));row.setAttribute('aria-pressed',selectedObjects().includes(object)?'true':'false');listen(row,'dragstart',event=>{event.dataTransfer.setData('application/x-map-scene-object',object.id);event.dataTransfer.effectAllowed='move';});parent.appendChild(row);};
    const makeDropTarget=(element,folderId)=>{listen(element,'dragover',event=>{if(event.dataTransfer.types.includes('application/x-map-scene-object')){event.preventDefault();element.classList.add('drag-over');}});listen(element,'dragleave',()=>element.classList.remove('drag-over'));listen(element,'drop',event=>{event.preventDefault();element.classList.remove('drag-over');const object=scene.find(value=>value.id===event.dataTransfer.getData('application/x-map-scene-object'));if(!object)return;object.folder_id=folderId||'';selectSceneObject(object);saveMap();rebuildHierarchy();});};
    const root=document.createElement('div'),rootHead=document.createElement('div');root.className='map-tree-root';rootHead.className='map-tree-folder-head';rootHead.textContent='Scene root';root.appendChild(rootHead);makeDropTarget(root,'');scene.filter(object=>!object.folder_id&&String(object.id).startsWith('placed-')).forEach(object=>addObject(object,root));hierarchy.appendChild(root);
    folders.forEach(folder=>{const group=document.createElement('div'),bar=document.createElement('div'),head=document.createElement('button'),arrow=document.createElement('span'),label=document.createElement('span'),remove=document.createElement('button'),items=document.createElement('div'),members=scene.filter(object=>object.folder_id===folder.id),collapsed=collapsedFolders.has(folder.id);group.className='map-tree-folder';group.dataset.mapFolderId=folder.id;bar.className='map-tree-folder-bar';head.type='button';head.className='map-tree-folder-head';arrow.className='map-tree-folder-toggle';arrow.textContent=collapsed?'▸':'▾';arrow.title=collapsed?'Open folder':'Close folder';arrow.setAttribute('aria-label',arrow.title);listen(arrow,'click',event=>{event.preventDefault();event.stopPropagation();if(collapsedFolders.has(folder.id))collapsedFolders.delete(folder.id);else collapsedFolders.add(folder.id);rebuildHierarchy();});label.textContent=folder.name+' ('+members.length+')';head.append(arrow,label);head.classList.toggle('selected',members.length>0&&members.every(object=>selectedObjects().includes(object)));listen(head,'click',event=>{if(event.ctrlKey||event.metaKey){members.forEach(object=>{if(!selectedObjects().includes(object))selectedGroup.push(object);});selectedObject=selectedGroup[selectedGroup.length-1]||null;rebuildHierarchy();}else{selectedGroup=members.slice();selectedObject=members[0]||null;rebuildHierarchy();}});remove.type='button';remove.className='map-tree-folder-delete';remove.textContent='−';remove.title='Delete '+folder.name+' folder';remove.setAttribute('aria-label',remove.title);listen(remove,'click',event=>{event.preventDefault();event.stopPropagation();members.forEach(object=>object.folder_id='');folders=folders.filter(value=>value.id!==folder.id);collapsedFolders.delete(folder.id);saveMap();rebuildHierarchy();});bar.append(head,remove);items.className='map-tree-folder-items';items.hidden=collapsed;makeDropTarget(group,folder.id);members.forEach(object=>addObject(object,items));if(!members.length)items.innerHTML='<div class="map-tree-empty">Drop scene objects here</div>';group.append(bar,items);hierarchy.appendChild(group);});applyHierarchySearch();
  }
  const mapHierarchyElement=document.getElementById('mapHierarchy');if(mapHierarchyElement)listen(mapHierarchyElement,'click',event=>{const row=event.target.closest('[data-map-tree-object]');if(!row)return;const object=scene.find(value=>value.id===row.dataset.mapTreeObject);if(!object)return;event.preventDefault();event.stopImmediatePropagation();selectHierarchyRow(object,event);},true);
  const mapHierarchySearch=document.getElementById('mapHierarchySearch');if(mapHierarchySearch)listen(mapHierarchySearch,'input',applyHierarchySearch);
  const mapNewFolder=document.getElementById('mapNewFolder');if(mapNewFolder)listen(mapNewFolder,'click',()=>{let form=document.getElementById('map3FolderForm');if(form){form.querySelector('input').focus();return;}form=document.createElement('form');form.id='map3FolderForm';const input=document.createElement('input'),save=document.createElement('button'),cancel=document.createElement('button');input.placeholder='Folder name';input.maxLength=50;input.setAttribute('aria-label','New 3D folder name');save.type='submit';save.textContent='Create';cancel.type='button';cancel.textContent='Cancel';cancel.onclick=()=>form.remove();input.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();form.remove();}};form.append(input,save,cancel);mapNewFolder.parentElement.after(form);form.onsubmit=e=>{e.preventDefault();const name=input.value.trim();if(!name)return;folders.push({id:'folder-'+Date.now()+'-'+Math.random().toString(16).slice(2),name});saveMap();rebuildHierarchy();form.remove();message.textContent=name+' folder created. Drag objects into it.';};input.focus();});

  function mapPayload(){return {objects:scene.filter(o=>String(o.id).startsWith('placed-')).map(o=>{if(o.type!=='npc')o.level=Math.max(0,Math.round(objectBase(o)/gridStep));return {id:o.id,type:o.type,npc_id:o.npc_id||null,folder_id:o.folder_id||'',icon_id:o.icon_id||'',spline:!!o.spline,spline_id:o.spline_id||'',scatter:o.scatter||'',scatterX:Number.isFinite(Number(o.scatterX))?Number(o.scatterX):null,scatterZ:Number.isFinite(Number(o.scatterZ))?Number(o.scatterZ):null,treeVariant:o.treeVariant||null,trunkThickness:o.trunkThickness||null,x:o.x,y:o.y,z:o.z,level:o.level,sx:o.sx,sy:o.sy,sz:o.sz,rx:o.rx||0,ry:o.ry||0,rz:o.rz||0,sizeVersion:3};}),paint:painted,expanded:expanded,removed:removed,folders:folders,checkpoints:scene.filter(o=>o.icon_id).map(o=>({object_id:o.id,icon_id:o.icon_id}))};}
  function saveMap(){const payload=mapPayload(),snapshot=JSON.stringify(payload);if(!historyApplying&&!historyBatchBase&&lastHistoryState&&snapshot!==lastHistoryState){undoStack.push(lastHistoryState);if(undoStack.length>50)undoStack.shift();}lastHistoryState=snapshot;localMapDirtyUntil=performance.now()+1800;if(mapChange)mapChange(payload);}
  function beginHistoryBatch(){if(!historyBatchBase)historyBatchBase=lastHistoryState||JSON.stringify(mapPayload());}
  function endHistoryBatch(){if(!historyBatchBase)return;if(lastHistoryState&&lastHistoryState!==historyBatchBase){undoStack.push(historyBatchBase);if(undoStack.length>50)undoStack.shift();}historyBatchBase='';}
  function restoreEditorSnapshot(snapshot){let state;try{state=JSON.parse(snapshot);}catch(error){return;}historyApplying=true;folders=state.folders||[];painted=state.paint||[];expanded=state.expanded||[];removed=state.removed||[];scene=baseScene.map(o=>Object.assign({},o));(state.objects||[]).forEach(saved=>{const object=restoreObject(saved);if(object)scene.push(object);});(state.checkpoints||[]).forEach(saved=>{const object=scene.find(o=>o.id===saved.object_id);if(object)object.icon_id=saved.icon_id;});clearSceneSelection();rebuildHierarchy();rebuildMarkers();lastHistoryState=JSON.stringify(mapPayload());if(mapChange)mapChange(mapPayload());localMapDirtyUntil=performance.now()+1800;historyApplying=false;}
  function undoEditor(){const snapshot=undoStack.pop();if(snapshot)restoreEditorSnapshot(snapshot);}
  function copySelection(){const values=selectedObjects().filter(object=>String(object.id).startsWith('placed-'));if(!values.length)return false;const center=selectionCenter();editorClipboard={anchor:{x:center[0],z:center[2]},objects:values.map(object=>JSON.parse(JSON.stringify(object)))};return true;}
  function removeSelection(){const values=selectedObjects().filter(object=>String(object.id).startsWith('placed-'));if(!values.length)return false;const ids=new Set(values.map(object=>object.id));scene=scene.filter(object=>!ids.has(object.id));clearSceneSelection();rebuildMarkers();saveMap();return true;}
  function pasteClipboard(clipboard,targetOverride,keepHeight){if(!clipboard||!clipboard.objects||!clipboard.objects.length)return false;const target=targetOverride||(hoverCell?{x:hoverCell.x,z:hoverCell.z}:clipboard.anchor),created=[];clipboard.objects.forEach((source,index)=>{const object=JSON.parse(JSON.stringify(source));object.id='placed-'+Date.now()+'-'+index+'-'+Math.random().toString(16).slice(2);object.folder_id='';snapObjectToGrid(object,target.x+(Number(source.x)-clipboard.anchor.x),target.z+(Number(source.z)-clipboard.anchor.z));if(!walkableWorld(object.x,object.z))return;if(keepHeight){object.level=Number(source.level)||0;object.y=Number(source.y);}else alignObjectLevel(object,placementLevel(object));scene.push(object);created.push(object);});if(!created.length)return false;selectedGroup=created;selectedObject=created[created.length-1];saveMap();rebuildHierarchy();rebuildMarkers();return true;}
  function duplicateSelection(){const previous=editorClipboard;if(!copySelection())return false;const duplicate=editorClipboard,result=pasteClipboard(duplicate,duplicate.anchor,true);editorClipboard=previous;return result;}
  function restoreObject(saved){let style=objectStyles[saved.type];if(saved.type==='npc'){const npc=mapNpcs.find(value=>Number(value.id)===Number(saved.npc_id));if(!npc)return null;style={name:npc.name,model:'npc',y:playerHalfHeight,sx:playerHalfWidth,sy:playerHalfHeight,sz:playerHalfWidth,color:[.35,.3,.5,1]};}if(!style)return null;const object=Object.assign({},style,saved);if(![2,3].includes(Number(saved.sizeVersion))){object.sx=style.sx;object.sy=style.sy;object.sz=style.sz;}if(saved.type==='stairs'&&Number(object.sy)<.49){object.sx=.25;object.sy=.5;object.sz=.5;}if(saved.type==='barrel'){object.sx=style.sx;object.sy=style.sy;object.sz=style.sz;}object.level=Number.isFinite(Number(saved.level))?Math.max(0,Math.round(Number(saved.level))):Math.max(0,Math.round((Number(object.y)-Number(object.sy))/gridStep));if(saved.type==='floor')object.level=Math.max(1,object.level);object.y=saved.type==='npc'&&Number.isFinite(Number(saved.y))?Number(saved.y):object.level*gridStep+Number(object.sy);['x','y','z'].forEach(axis=>object['r'+axis]=snapValue(object['r'+axis]||0,Math.PI/36,0));if(saved.type==='npc'){object.x=snapValue(object.x,gridStep,gridStep/2);object.z=snapValue(object.z,gridStep,gridStep/2);}else snapObjectToGrid(object,object.x,object.z);object.sizeVersion=3;return object;}
  function footprintsOverlap(a,b){const af=objectFootprint(a),bf=objectFootprint(b);return Math.abs(Number(a.x)-Number(b.x))<af.x+bf.x-.001&&Math.abs(Number(a.z)-Number(b.z))<af.z+bf.z-.001;}
  function placementLevel(proposed,ignored){const terrainHeight=terrainHeightAt(proposed.x,proposed.z);let level=terrainHeight===null?0:Math.ceil((terrainHeight-.001)/gridStep);if(proposed.raisedFloor)level=Math.max(1,level);scene.forEach(object=>{if(object===ignored||object.type==='npc'||!String(object.id).startsWith('placed-')||!footprintsOverlap(proposed,object))return;level=Math.max(level,Math.max(0,Math.ceil((objectTop(object)-.001)/gridStep)));});return level;}
  function alignObjectLevel(object,level){object.level=Math.max(0,Math.round(Number(level)||0));object.y=object.level*gridStep+Number(object.sy);return object;}
  function makePlacedObject(type,point,overrides){const exactGrid=!!(overrides&&(overrides.spline||overrides.exactGrid)),cell=exactGrid?{x:Number(point.x),z:Number(point.z)}:snapped(point),style=objectStyles[type];if(!style||!walkableWorld(cell.x,cell.z))return null;const randomFacing=['tree','oak','pine','palm','rock','barrel','campfire'].includes(type)?Math.floor(Math.random()*72)*Math.PI/36:0,object=Object.assign({},style,{id:'placed-'+Date.now()+'-'+Math.random().toString(16).slice(2),type:type,x:cell.x,z:cell.z,rx:0,ry:randomFacing,rz:0,sizeVersion:3},overrides||{});delete object.exactGrid;['x','y','z'].forEach(axis=>{const key='s'+axis,step=objectScaleStep(object,axis);object[key]=Math.max(step,snapValue(object[key],step,0));});snapObjectToGrid(object,cell.x,cell.z);return alignObjectLevel(object,placementLevel(object));}
  function stairContinuation(source,style){if(!source||source.type!=='stairs'||!style)return null;const angle=Number(source.ry)||0,distance=Number(source.sz)+Number(style.sz);return {x:Number(source.x)+Math.sin(angle)*distance,z:Number(source.z)+Math.cos(angle)*distance,level:buildingLevel(source)+Math.round(Number(source.sy)*2/gridStep),ry:angle};}
  function placeObject(type,point,continuation){const overrides={ry:continuation?continuation.ry:placementRotation,exactGrid:!!continuation},object=makePlacedObject(type,point,overrides);if(!object)return;if(continuation)alignObjectLevel(object,continuation.level);scene.push(object);saveMap();rebuildHierarchy();return object;}
  function placeNpc(npcId,point){const npc=mapNpcs.find(value=>Number(value.id)===Number(npcId));if(!npc)return;const cell=snapped(point),surface=navigationSurface(cell.x,cell.z);if(!walkableWorld(cell.x,cell.z)||blockedWorld(cell.x,cell.z,surface.height))return;const object={id:'placed-'+Date.now()+'-'+Math.random().toString(16).slice(2),type:'npc',npc_id:Number(npc.id),name:npc.name,model:'npc',x:cell.x,y:surface.height+playerHalfHeight,z:cell.z,sx:playerHalfWidth,sy:playerHalfHeight,sz:playerHalfWidth,rx:0,ry:0,rz:0,level:Math.round(surface.height/gridStep),sizeVersion:3};scene.push(object);saveMap();rebuildHierarchy();return object;}
  function appendGridLine(points,target){let current=points[points.length-1]||splineNode(target),guard=0;target=splineNode(target);while(!sameCell(current,target.x,target.z)&&guard++<gridSize*2){const dx=Math.round((target.x-current.x)/gridStep),dz=Math.round((target.z-current.z)/gridStep),moveX=Math.abs(dx)>=Math.abs(dz)&&dx!==0,next=splineNode({x:current.x+(moveX?Math.sign(dx)*gridStep:0),z:current.z+(!moveX&&dz!==0?Math.sign(dz)*gridStep:0)});if(sameCell(current,next.x,next.z)||!walkableWorld(next.x,next.z))break;points.push(next);current=next;}}
  function commitSpline(){if(!splineDraft||splineDraft.points.length<2){splineDraft=null;return;}const type=splineDraft.type,style=objectStyles[type],points=splineDraft.points,placed=[],splineId='spline-'+Date.now()+'-'+Math.random().toString(16).slice(2);points.forEach((cell,index)=>{const from=index<points.length-1?cell:points[index-1],to=index<points.length-1?points[index+1]:cell,dx=to.x-from.x,dz=to.z-from.z,angle=snapValue(-Math.atan2(dz,dx),Math.PI/2,0),object=makePlacedObject(type,cell,{ry:angle,sx:style.sx,sy:style.sy,sz:style.sz,spline:true,spline_id:splineId});if(object){scene.push(object);placed.push(object);}});splineDraft=null;if(placed.length){saveMap();rebuildHierarchy();}}
  function brushSize(type){return Math.max(1,Math.min(9,Number(brushSizes[type])||1));}
  function brushGridCells(center,size){const cells=[],low=-Math.floor((size-1)/2),high=Math.ceil((size-1)/2),minimum=gridMin+gridStep/2,maximum=gridMax-gridStep/2;for(let x=low;x<=high;x++)for(let z=low;z<=high;z++){const cell={x:center.x+x*gridStep,z:center.z+z*gridStep};if(cell.x>=minimum&&cell.x<=maximum&&cell.z>=minimum&&cell.z<=maximum)cells.push(cell);}return cells;}
  function applyTool(clientX,clientY){
    if(!isCreator||!activeTool)return false;const point=groundPoint(clientX,clientY),terrainHit=pickTerrainVoxel(clientX,clientY),placementHit=activeTool.kind==='object'?pickObject(clientX,clientY):null;if(!point&&!terrainHit&&!placementHit)return true;const brush=activeTool.kind==='brush'?activeTool.value:'',voxelTarget=brush==='expand'?adjacentVoxel(terrainHit,heldKeys.has('shift')):(brush==='erase-grid'||brush.startsWith('grid-'))&&terrainHit?terrainHit:null,continuation=activeTool.kind==='object'&&activeTool.value==='stairs'?stairContinuation(placementHit,objectStyles.stairs):null,objectTarget=continuation||(placementHit&&lastPickPoint?{x:lastPickPoint[0],z:lastPickPoint[2]}:null),target=objectTarget||voxelTarget||point,cell=snapped(target);let targetLevel=voxelTarget?Math.round(Number(voxelTarget.level)||0):0;if(brush==='expand'){if(gridStrokeLevel===null)gridStrokeLevel=targetLevel;targetLevel=gridStrokeLevel;}
    if(activeTool.kind==='brush'){
      const size=brushSize(activeTool.value),cells=brushGridCells(cell,size);
      if(activeTool.value==='expand'){
        cells.forEach(tile=>{if(targetLevel===0&&insideBaseTerrain(tile.x,tile.z)){removed=removed.filter(value=>!sameCell(value,tile.x,tile.z));}else if(!expanded.some(value=>sameCell(value,tile.x,tile.z)&&Math.round(Number(value.level)||0)===targetLevel))expanded.push({x:tile.x,z:tile.z,level:targetLevel});});saveMap();
        return true;
      }
      if(activeTool.value==='erase-grid'){
        cells.forEach(tile=>{if(targetLevel===0&&insideBaseTerrain(tile.x,tile.z)&&!removed.some(value=>sameCell(value,tile.x,tile.z)))removed.push({x:tile.x,z:tile.z});});expanded=expanded.filter(tile=>Math.round(Number(tile.level)||0)!==targetLevel||!cells.some(cellValue=>sameCell(tile,cellValue.x,cellValue.z)));
        painted=painted.filter(stamp=>Math.round(Number(stamp.level)||0)!==targetLevel||!cells.some(cellValue=>sameCell(stamp,cellValue.x,cellValue.z)));saveMap();
        return true;
      }
      if(activeTool.value.startsWith('scatter-')){
        const kind=activeTool.value.slice(8),treeType={oak:'oak',pine:'pine',palm:'palm'}[kind],variants=treeType?[treeType]:['rock','boulder'];cells.filter(tile=>walkableWorld(tile.x,tile.z)).forEach(tile=>{if(scene.some(object=>object.scatter===kind&&sameCell({x:Number.isFinite(Number(object.scatterX))?object.scatterX:object.x,z:Number.isFinite(Number(object.scatterZ))?object.scatterZ:object.z},tile.x,tile.z)))return;const type=variants[Math.floor(Math.random()*variants.length)],height=3+Math.floor(Math.random()*4),treeOptions=treeType?{treeVariant:height,sy:height*gridStep/2,trunkThickness:gridStep*(.3+(height-3)/6)}:{},object=makePlacedObject(type,tile,Object.assign({ry:Math.floor(Math.random()*4)*Math.PI/2,scatter:kind,scatterX:tile.x,scatterZ:tile.z},treeOptions));if(object){const terrainHeight=terrainHeightAt(object.x,object.z);alignObjectLevel(object,terrainHeight===null?0:Math.ceil((terrainHeight-.001)/gridStep));scene.push(object);}});saveMap();rebuildHierarchy();lastBrushPoint=point;return true;
      }
      if(activeTool.value.startsWith('grid-')){
        const type=activeTool.value.slice(5);cells.filter(tile=>terrainLevelsAt(tile.x,tile.z).includes(targetLevel)).forEach(tile=>{if(type!=='fog')painted=painted.filter(stamp=>stamp.type==='fog'||stamp.type===type||Math.round(Number(stamp.level)||0)!==targetLevel||!sameCell(stamp,tile.x,tile.z));if(!painted.some(stamp=>stamp.grid&&stamp.type===type&&Math.round(Number(stamp.level)||0)===targetLevel&&sameCell(stamp,tile.x,tile.z)))painted.push({x:tile.x,z:tile.z,level:targetLevel,type:type,radius:type==='fog'?.34:.25,grid:true});});saveMap();
        lastBrushPoint=point;return true;
      }
      if(activeTool.value==='erase'){
        pickObject(clientX,clientY);const target=lastPickPoint?{x:lastPickPoint[0],y:lastPickPoint[1],z:lastPickPoint[2]}:{x:point.x,y:0,z:point.z},targetCell=snapped(target),level=lastPickPoint?Math.max(0,Math.floor((target.y-.001)/gridStep)):0,half=size*gridStep/2,offset=size%2===0?gridStep/2:0,center={x:targetCell.x+offset,y:level*gridStep+gridStep/2+offset,z:targetCell.z+offset},bottom=center.y-half;
        if(bottom<=.061)painted=painted.filter(stamp=>Math.abs(Number(stamp.x)-center.x)>half+(Number(stamp.radius)||0)||Math.abs(Number(stamp.z)-center.z)>half+(Number(stamp.radius)||0));
        const removed=scene.filter(object=>String(object.id).startsWith('placed-')&&Math.abs(Number(object.x)-center.x)<half-.001&&Math.abs(Number(object.z)-center.z)<half-.001&&objectTop(object)>center.y-half+.001&&objectBase(object)<center.y+half-.001);if(removed.length){const removedIds=new Set(removed.map(object=>object.id));scene=scene.filter(object=>!removedIds.has(object.id));if(selectedObjects().some(object=>removedIds.has(object.id)))clearSceneSelection();rebuildMarkers();rebuildHierarchy();}lastBrushPoint=target;saveMap();return true;
      }
      if(!point||!walkableWorld(point.x,point.z))return true;
      const radii={path:.34,grass:.52,fog:.78,zone:.62,dirt:.46,sand:.5,stone:.42,snow:.5,mud:.46,lava:.42},radius=(radii[activeTool.value]||.45)*size;
      const start=lastBrushPoint||point,distance=Math.hypot(point.x-start.x,point.z-start.z),steps=Math.max(1,Math.ceil(distance/(radius*.32)));
      for(let step=1;step<=steps;step++){const x=start.x+(point.x-start.x)*step/steps,z=start.z+(point.z-start.z)*step/steps;if(!walkableWorld(x,z))continue;if(activeTool.value!=='fog')painted=painted.filter(stamp=>stamp.type==='fog'||stamp.type===activeTool.value||Math.hypot(Number(stamp.x)-x,Number(stamp.z)-z)>radius+(Number(stamp.radius)||.25)*.35);if(!painted.some(stamp=>stamp.type===activeTool.value&&Math.hypot(Number(stamp.x)-x,Number(stamp.z)-z)<radius*.2))painted.push({x:x,z:z,type:activeTool.value,radius:radius});}
      lastBrushPoint=point;saveMap();return true;
    }
    if(activeTool.kind==='object'&&walkableWorld(cell.x,cell.z)){
      placeObject(activeTool.value,continuation||cell,continuation);
    }else if(activeTool.kind==='npc'&&walkableWorld(cell.x,cell.z)){
      placeNpc(activeTool.value,cell);
    }
    return true;
  }
  function rebuildMarkers(){
    const layer=document.getElementById('mapCheckpointLayer');if(!layer)return;layer.innerHTML='';scene.forEach(object=>{if(!object.icon_id)return;const icon=mapIcons.find(i=>String(i.id)===String(object.icon_id));if(!icon)return;const marker=document.createElement('button');marker.type='button';marker.className='map-checkpoint'+(icon.important?' important':'');marker.dataset.objectId=object.id;marker.dataset.iconId=String(icon.id);marker.title=icon.name+(icon.description?' — '+icon.description:'');const img=document.createElement('img');img.src=icon.image_id?'/api/uploads/'+icon.image_id:'assets/realm-mark.svg';img.alt=icon.name;marker.appendChild(img);listen(marker,'click',e=>{e.stopPropagation();message.textContent=marker.title;});layer.appendChild(marker);});
  }
  function rebuildPlayers(){
    if(!playerLayer)return;const ids=new Set(mapPlayers.map(p=>String(p.id)));playerLayer.querySelectorAll('.map-player-token').forEach(marker=>{if(!ids.has(marker.dataset.userId))marker.remove();});mapPlayers.forEach(p=>{const id=String(p.id),avatarKey=p.character_image_id?'character-'+p.character_image_id:p.avatar_id?'avatar-'+id:'placeholder';let marker=Array.from(playerLayer.querySelectorAll('.map-player-token')).find(value=>value.dataset.userId===id);if(!marker){marker=document.createElement('button');marker.type='button';marker.className='map-player-token';marker.dataset.userId=id;const img=document.createElement('img');marker.appendChild(img);listen(marker,'click',e=>{e.stopPropagation();if(!isCreator)return;const current=mapPlayers.find(value=>String(value.id)===marker.dataset.userId);if(!current)return;controlledId=Number(current.id);player.x=Number(current.x);player.z=Number(current.z);player.y=Number.isFinite(Number(current.y))?Number(current.y):navigationSurface(player.x,player.z).height;player.targetX=player.x;player.targetY=player.y;player.targetZ=player.z;player.path=[];});playerLayer.appendChild(marker);}const portraitSize=42*CharacterImageScale.value(p.character_image_scale);marker.style.width=portraitSize+'px';marker.style.height=portraitSize+'px';marker.title=p.character_name||p.username||'Adventurer';const img=marker.querySelector('img');img.alt=p.character_name||p.username||'Adventurer';if(marker.dataset.avatarKey!==avatarKey){marker.dataset.avatarKey=avatarKey;img.onerror=function(){this.onerror=null;this.src=p.avatar_id?'/api/avatars/'+id:'assets/profile-placeholder.svg';};img.src=p.character_image_id?'/api/uploads/'+p.character_image_id:p.avatar_id?'/api/avatars/'+id:'assets/profile-placeholder.svg';}});
  }
  function travelTo(x,z){const route=findPath(player.x,player.z,x,z,player.y);if(route.length){player.targetX=route[route.length-1].x;player.targetY=route[route.length-1].y;player.targetZ=route[route.length-1].z;player.path=route;}}
  function chooseTool(button,kind,value,instructions){
    const repeated=activeTool&&activeTool.kind===kind&&activeTool.value===value;
    activeTool=repeated?null:{kind:kind,value:value};if(activeTool&&kind==='object')placementRotation=0;if(!activeTool)clearSceneSelection();
    document.querySelectorAll('.map-tool-list button').forEach(b=>b.classList.toggle('active',!!activeTool&&b===button));
    message.textContent=activeTool?instructions:'Movement mode restored.';
  }
  const mapObjectTools=document.getElementById('mapObjectTools'),roofAnchor=mapObjectTools&&mapObjectTools.querySelector('[data-map-object="roof"]');if(mapObjectTools&&roofAnchor)[['roof_low','⌂ Low pitched roof · 1×1'],['roof_high','⌃ High pitched roof · 1×1'],['roof_gable','△ Framed gable roof · 2×1'],['roof_pyramid','◇ Hip pyramid roof · 2×2'],['roof_corner','⌞ Hip corner roof · 1×1'],['roof_inverted','⌜ Valley corner roof · 1×1'],['roof_panel','▱ Pitched roof panel · 1×1'],['roof_dormer','▣ Dormer window roof · 2×1']].reverse().forEach(entry=>{const button=document.createElement('button');button.type='button';button.draggable=true;button.dataset.mapObject=entry[0];button.textContent=entry[1];roofAnchor.insertAdjacentElement('afterend',button);});
  const wallSplineAnchor=mapObjectTools&&mapObjectTools.querySelector('[data-map-spline="wall"]');if(wallSplineAnchor)[['wood_wall','〰 Timber wall spline · 1×2'],['window_wall','〰 Stone window wall spline · 1×2'],['wood_window_wall','〰 Timber window wall spline · 1×2']].reverse().forEach(entry=>{const button=document.createElement('button');button.type='button';button.dataset.mapSpline=entry[0];button.textContent=entry[1];wallSplineAnchor.insertAdjacentElement('afterend',button);});
  const extraObjectButtons=[['wood_wall','▥ Timber wall · 1×2'],['window_wall','▧ Stone window wall · 1×2'],['wood_window_wall','▧ Timber window wall · 1×2'],['ladder','╫ Wooden ladder · 1×2'],['fence','╫ Timber fence · 1×1'],['gate','▥ Timber gate · 2×2'],['arch','⌒ Stone arch · 2×3'],['window','▧ Leadglass window · 1×2'],['bridge','═ Timber bridge · 2×1'],['oak','♣ Ancient oak · 1×3'],['pine','♠ Highland pine · 1×3'],['palm','♧ Palm tree · 1×3'],['bush','♣ Thick bush · 1×1'],['boulder','⬟ Large boulder · 2×2'],['mushroom','♧ Giant mushroom · 1×1'],['fallen_log','▬ Fallen log · 2×1'],['table','▰ Tavern table · 2×1'],['chair','♙ Wooden chair · 1×1'],['bed','▱ Adventurer bed · 2×1'],['bookshelf','▥ Filled bookshelf · 2×2'],['crate','▣ Supply crate · 1×1'],['tent','△ Canvas tent · 2×2'],['well','◉ Stone well · 2×2'],['altar','▰ Ritual altar · 2×1'],['statue','♟ Ancient statue · 1×3'],['signpost','⚑ Road signpost · 1×2'],['lantern','♨ Standing lantern · 1×1']];
  extraObjectButtons.forEach(entry=>{if(!mapObjectTools||mapObjectTools.querySelector('[data-map-object="'+entry[0]+'"]'))return;const button=document.createElement('button');button.type='button';button.draggable=true;button.dataset.mapObject=entry[0];button.textContent=entry[1];mapObjectTools.appendChild(button);});
  const mapBrushTools=document.getElementById('mapBrushTools'),extraPaintButtons=[['grid-floor','Grid timber floor'],['grid-dirt','Grid dirt'],['grid-sand','Grid sand'],['grid-stone','Grid cobblestone'],['grid-snow','Grid snow'],['grid-mud','Grid mud'],['grid-lava','Grid lava'],['dirt','Smooth dirt'],['sand','Smooth sand'],['stone','Smooth cobblestone'],['snow','Smooth snow'],['mud','Smooth mud'],['lava','Smooth lava'],['scatter-oak','Random oaks'],['scatter-pine','Random pines'],['scatter-palm','Random palms'],['scatter-rock','Random rocks']];
  extraPaintButtons.forEach(entry=>{if(!mapBrushTools||mapBrushTools.querySelector('[data-map-brush="'+entry[0]+'"]'))return;const button=document.createElement('button');button.type='button';button.dataset.mapBrush=entry[0];button.textContent=entry[1];mapBrushTools.appendChild(button);});
  function organizeToolList(container,groups,keyFor){if(!container)return;const buttons=Array.from(container.querySelectorAll(':scope > button'));groups.forEach(group=>{const section=document.createElement('section'),title=document.createElement('h4');section.className='map-tool-category';title.textContent=group.name;section.appendChild(title);group.keys.forEach(key=>{const button=buttons.find(value=>keyFor(value)===key);if(button)section.appendChild(button);});if(section.children.length>1)container.appendChild(section);});const leftovers=buttons.filter(button=>button.parentNode===container);if(leftovers.length){const section=document.createElement('section'),title=document.createElement('h4');section.className='map-tool-category';title.textContent='Other';section.appendChild(title);leftovers.forEach(button=>section.appendChild(button));container.appendChild(section);}}
  organizeToolList(mapObjectTools,[{name:'Structures',keys:['spline-wall','spline-wood_wall','spline-window_wall','spline-wood_window_wall','spline-foundation','floor','foundation','wall','wood_wall','window_wall','wood_window_wall','stairs','ladder','bridge','door','gate','arch','window','pillar','fence']},{name:'Roofs',keys:['roof','roof_low','roof_high','roof_gable','roof_pyramid','roof_corner','roof_inverted','roof_panel','roof_dormer']},{name:'Nature',keys:['tree','oak','pine','palm','bush','rock','boulder','mushroom','fallen_log']},{name:'Furnishings',keys:['chest','barrel','crate','table','chair','bed','bookshelf']},{name:'Adventure props',keys:['campfire','torch','lantern','tent','well','altar','statue','signpost']}],button=>button.dataset.mapObject||(button.dataset.mapSpline?'spline-'+button.dataset.mapSpline:''));
  organizeToolList(mapBrushTools,[{name:'Selection',keys:['transform-move','transform-rotate','transform-stretch']},{name:'Voxel tools',keys:['expand','erase-grid']},{name:'Terrain blocks',keys:['grid-grass','grid-path','grid-floor','grid-dirt','grid-sand','grid-stone','grid-snow','grid-mud','grid-water','grid-lava','grid-zone']},{name:'Nature scatter',keys:['scatter-oak','scatter-pine','scatter-palm','scatter-rock']},{name:'Smooth paints',keys:['grass','path','dirt','sand','stone','snow','mud','lava','zone']},{name:'Atmosphere',keys:['grid-fog','fog']},{name:'Cleanup',keys:['erase','none']}],button=>button.dataset.mapBrush||(button.dataset.mapTransform?'transform-'+button.dataset.mapTransform:''));
  function bindToolSearch(inputId,container,selector){const input=document.getElementById(inputId);if(!input||!container)return;listen(input,'input',()=>{const query=input.value.trim().toLowerCase(),buttons=Array.from(container.querySelectorAll(selector));buttons.forEach(button=>{const entry=button.closest('.map-sized-tool')||button;entry.hidden=!!query&&!button.textContent.toLowerCase().includes(query);});container.querySelectorAll('.map-tool-category').forEach(category=>{const entries=Array.from(category.querySelectorAll(selector)).map(button=>button.closest('.map-sized-tool')||button);category.hidden=!!query&&!entries.some(entry=>!entry.hidden);});});}
  bindToolSearch('mapObjectSearch',mapObjectTools,'[data-map-object],[data-map-spline]');bindToolSearch('mapBrushSearch',mapBrushTools,'[data-map-brush],[data-map-transform]');
  document.querySelectorAll('[data-map-object]').forEach(button=>listen(button,'click',()=>chooseTool(button,'object',button.dataset.mapObject,'Click a free grid cell to place '+button.textContent.trim()+'.')));
  document.querySelectorAll('[data-map-spline]').forEach(button=>listen(button,'click',()=>{splineDraft=null;chooseTool(button,'spline',button.dataset.mapSpline,'Hold and draw a connected '+button.dataset.mapSpline+' spline.');}));
  document.querySelectorAll('[data-map-object]').forEach(button=>{listen(button,'dragstart',event=>{draggingObjectType=button.dataset.mapObject;placementRotation=0;event.dataTransfer.setData('application/x-map-object',button.dataset.mapObject);event.dataTransfer.effectAllowed='copy';});listen(button,'dragend',()=>{draggingObjectType='';});});
  listen(world,'dragover',event=>{if(isCreator&&Array.from(event.dataTransfer.types).includes('application/x-map-object')){event.preventDefault();event.dataTransfer.dropEffect='copy';updateHover(event.clientX,event.clientY);world.classList.add('map-drop-ready');}});
  listen(world,'dragleave',event=>{if(!world.contains(event.relatedTarget))world.classList.remove('map-drop-ready');});
  listen(world,'drop',event=>{const type=event.dataTransfer.getData('application/x-map-object');draggingObjectType='';world.classList.remove('map-drop-ready');if(!isCreator||!type)return;event.preventDefault();const hit=pickObject(event.clientX,event.clientY),continuation=type==='stairs'?stairContinuation(hit,objectStyles.stairs):null,point=continuation||(hit&&lastPickPoint?{x:lastPickPoint[0],z:lastPickPoint[2]}:groundPoint(event.clientX,event.clientY));if(point)placeObject(type,point,continuation);});
  document.querySelectorAll('[data-map-transform]').forEach(button=>listen(button,'click',()=>{chooseTool(button,'transform',button.dataset.mapTransform,'Select a placed object, then drag its X, Y, or Z handle.');}));
  function beginGizmoDrag(handle,event){const axis=handle.axis,sign=handle.sign||1,axisIndex='xyz'.indexOf(axis),center=selectionCenter(),origin=worldToClient(center),axisPoint=worldToClient([center[0]+(axis==='x'?sign:0),center[1]+(axis==='y'?sign:0),center[2]+(axis==='z'?sign:0)]);let direction={x:axisPoint.x-origin.x,y:axisPoint.y-origin.y},length=Math.hypot(direction.x,direction.y)||1,axisPixelsPerUnit=length;if(activeTool.value==='rotate'){direction={x:-(event.clientY-origin.y),y:event.clientX-origin.x};length=Math.hypot(direction.x,direction.y)||1;}direction.x/=length;direction.y/=length;const originals=selectedObjects().map(object=>({object:object,state:{x:Number(object.x),y:Number(object.y),z:Number(object.z),sx:Number(object.sx),sy:Number(object.sy),sz:Number(object.sz),rx:Number(object.rx)||0,ry:Number(object.ry)||0,rz:Number(object.rz)||0}})),anchor=originals.find(value=>value.object===selectedObject)||originals[0],rootExtent=Math.max.apply(Math,originals.map(value=>Math.abs(value.state[axis]-center[axisIndex])+value.state['s'+axis]));gizmoDrag={axis:axis,sign:sign,x:event.clientX,y:event.clientY,mode:activeTool.value,center:center,rootExtent:rootExtent,fixedEdge:center[axisIndex]-sign*rootExtent,screenDirection:direction,axisPixelsPerUnit:axisPixelsPerUnit,rotationSign:-1,groupRoot:originals.length>1,originals:originals,original:anchor.state};}
  function completedDragSteps(pixelDistance,pixelsPerStep){return pixelDistance<0?Math.ceil(pixelDistance/pixelsPerStep):Math.floor(pixelDistance/pixelsPerStep);}
  function rotateGroupedPoint(point,center,axis,angle){const x=point.x-center[0],y=point.y-center[1],z=point.z-center[2],c=Math.cos(angle),s=Math.sin(angle);if(axis==='x')return {x:point.x,y:center[1]+y*c-z*s,z:center[2]+y*s+z*c};if(axis==='y')return {x:center[0]+x*c+z*s,y:point.y,z:center[2]-x*s+z*c};return {x:center[0]+x*c-y*s,y:center[1]+x*s+y*c,z:point.z};}
  listen(window,'pointermove',event=>{
    if(!gizmoDrag||!selectedObject)return;
    const dx=event.clientX-gizmoDrag.x,dy=event.clientY-gizmoDrag.y,axis=gizmoDrag.axis,original=gizmoDrag.original,direction=gizmoDrag.screenDirection,projectedPixels=dx*direction.x+dy*direction.y,amount=projectedPixels*.018*(gizmoDrag.mode==='rotate'?gizmoDrag.rotationSign:1);
    if(gizmoDrag.mode==='move'){
      const step=gridStep,offset=axis==='y'?Number(selectedObject.sy):objectGridOffset(selectedObject,axis),pixelsPerStep=Math.max(24,gizmoDrag.axisPixelsPerUnit*step),steps=completedDragSteps(projectedPixels,pixelsPerStep),target=Math.max(axis==='y'?Number(selectedObject.sy):gridMin,Math.min(axis==='y'?8:gridMax,snapValue(original[axis]+steps*step,step,offset))),delta=target-original[axis];
      gizmoDrag.originals.forEach(value=>{value.object[axis]=value.state[axis]+delta;if(axis==='y')value.object.level=Math.max(0,Math.round(objectBase(value.object)/gridStep));});
    }else if(gizmoDrag.mode==='rotate'){
      const angleStep=gizmoDrag.groupRoot?Math.PI/2:Math.PI/36,target=gizmoDrag.groupRoot?snapValue(amount,angleStep,0):snapValue(original['r'+axis]+amount,angleStep,0),delta=gizmoDrag.groupRoot?target:target-original['r'+axis];
      gizmoDrag.originals.forEach(value=>{if(!gizmoDrag.groupRoot)value.object['r'+axis]=value.state['r'+axis]+delta;const rotated=rotateGroupedPoint(value.state,gizmoDrag.center,axis,delta);snapObjectToGrid(value.object,rotated.x,rotated.z);value.object.y=Math.max(Number(value.object.sy),snapValue(rotated.y-Number(value.object.sy),gridStep,0)+Number(value.object.sy));value.object.level=Math.max(0,Math.round(objectBase(value.object)/gridStep));});
    }else if(gizmoDrag.mode==='stretch'){
      const key='s'+axis,axisIndex='xyz'.indexOf(axis),step=objectScaleStep(selectedObject,axis),newExtent=Math.max(step,Math.min(10,snapValue(gizmoDrag.rootExtent+amount*.5,step,0))),factor=newExtent/Math.max(.001,gizmoDrag.rootExtent),fixed=gizmoDrag.fixedEdge;
      gizmoDrag.originals.forEach(value=>{value.object[key]=Math.max(step,snapValue(value.state[key]*factor,step,0));value.object[axis]=fixed+(value.state[axis]-fixed)*factor;if(axis==='x'||axis==='z')snapObjectToGrid(value.object,value.object.x,value.object.z);else value.object.level=Math.max(0,Math.round(objectBase(value.object)/gridStep));});
    }
  });
  listen(window,'pointerup',()=>{if(gizmoDrag){gizmoDrag=null;saveMap();message.textContent='Object transformation saved.';}});
  Array.from(document.querySelectorAll('[data-map-brush]')).filter(button=>button.dataset.mapBrush!=='none').forEach(button=>{const type=button.dataset.mapBrush,wrapper=document.createElement('div'),controls=document.createElement('span'),minus=document.createElement('button'),label=document.createElement('b'),plus=document.createElement('button');wrapper.className='map-sized-tool';controls.className='map-tool-size';minus.type=plus.type='button';minus.textContent='−';plus.textContent='+';label.textContent='1';minus.setAttribute('aria-label','Make '+button.textContent.trim()+' smaller');plus.setAttribute('aria-label','Make '+button.textContent.trim()+' larger');button.parentNode.insertBefore(wrapper,button);wrapper.append(button,controls);controls.append(minus,label,plus);const update=amount=>{brushSizes[type]=Math.max(1,Math.min(9,(brushSizes[type]||1)+amount));label.textContent=String(brushSizes[type]);};listen(minus,'click',event=>{event.stopPropagation();update(-1);});listen(plus,'click',event=>{event.stopPropagation();update(1);});});
  document.querySelectorAll('[data-map-brush]').forEach(button=>listen(button,'click',()=>{if(button.dataset.mapBrush==='none'){activeTool=null;clearSceneSelection();document.querySelectorAll('.map-tool-list button').forEach(b=>b.classList.remove('active'));}else{const instructions=button.dataset.mapBrush==='expand'?'Click an exposed block face to build beside it. Hold Shift to build downward.':'Hold and drag across the grid to paint.';chooseTool(button,'brush',button.dataset.mapBrush,instructions);}}));
  function pointerGap(){const values=Array.from(pointers.values());return values.length<2?0:Math.hypot(values[0].x-values[1].x,values[0].y-values[1].y);}
  listen(canvas,'pointerdown',e=>{if(isCreator&&e.button!==2&&activeTool&&activeTool.kind==='transform'&&selectedObject){const axis=pickGizmo(e.clientX,e.clientY);if(axis){e.preventDefault();beginGizmoDrag(axis,e);canvas.setPointerCapture(e.pointerId);return;}}if(activeTool&&isCreator&&e.button!==2&&!e.ctrlKey&&!e.metaKey&&activeTool.kind!=='transform'){beginHistoryBatch();editingPointer=e.pointerId;lastBrushPoint=null;gridStrokeLevel=null;if(activeTool.kind==='spline'){const point=groundPoint(e.clientX,e.clientY),cell=point&&splineNode(point);splineDraft=cell&&walkableWorld(cell.x,cell.z)?{type:activeTool.value,points:[cell]}:null;}else applyTool(e.clientX,e.clientY);canvas.setPointerCapture(e.pointerId);return;}pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});drag={id:e.pointerId,x:e.clientX,y:e.clientY,button:e.button};moved=pointers.size>1;if(e.button===2)rightDragged=false;if(pointers.size===2)pinchDistance=pointerGap();canvas.setPointerCapture(e.pointerId);});
  listen(canvas,'pointermove',e=>{
    if(editingPointer===e.pointerId){updateHover(e.clientX,e.clientY);if(activeTool&&activeTool.kind==='brush')applyTool(e.clientX,e.clientY);else if(activeTool&&activeTool.kind==='spline'&&splineDraft){const point=groundPoint(e.clientX,e.clientY),cell=point&&splineNode(point),lastPoint=splineDraft.points[splineDraft.points.length-1];if(cell&&walkableWorld(cell.x,cell.z)&&!sameCell(lastPoint,cell.x,cell.z))appendGridLine(splineDraft.points,cell);}return;}
    if(!pointers.has(e.pointerId)){updateHover(e.clientX,e.clientY);return;}const previous=pointers.get(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size>=2){const gap=pointerGap();if(pinchDistance){distance=Math.max(4,Math.min(96,distance-(gap-pinchDistance)*.055));}pinchDistance=gap;moved=true;return;}
    if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-previous.x,dy=e.clientY-previous.y;if(Math.hypot(dx,dy)>2){moved=true;if(drag.button===2)rightDragged=true;}yaw-=dx*.008;pitch=Math.max(-.45,Math.min(1.55,pitch+dy*.006));drag.x=e.clientX;drag.y=e.clientY;
  });
  listen(canvas,'pointerup',e=>{
    if(editingPointer===e.pointerId){if(activeTool&&activeTool.kind==='spline')commitSpline();editingPointer=null;lastBrushPoint=null;gridStrokeLevel=null;endHistoryBatch();return;}
    if(!pointers.has(e.pointerId))return;const wasPinching=pointers.size>1;pointers.delete(e.pointerId);pinchDistance=pointers.size>1?pointerGap():0;
    if(wasPinching){const remaining=Array.from(pointers.entries())[0];drag=remaining?{id:remaining[0],x:remaining[1].x,y:remaining[1].y}:null;moved=true;return;}
    if(!drag||drag.id!==e.pointerId)return;const releasedButton=drag.button;drag=null;if(releasedButton===2)return;
    if(!moved){const p=groundPoint(e.clientX,e.clientY);if(!p)return;const clickedPlayer=mapPlayers.find(value=>Math.hypot(Number(value.x)-p.x,Number(value.z)-p.z)<.65);if(playerSelect)playerSelect(clickedPlayer||null);if(isCreator&&clickedPlayer&&(!activeTool||activeTool.kind!=='transform')){controlledId=Number(clickedPlayer.id);player.x=Number(clickedPlayer.x);player.z=Number(clickedPlayer.z);player.y=Number.isFinite(Number(clickedPlayer.y))?Number(clickedPlayer.y):navigationSurface(player.x,player.z).height;player.path=[];return;}const hit=pickObject(e.clientX,e.clientY);if(hit){player.path=[];if(isCreator&&(e.ctrlKey||e.metaKey)&&String(hit.id).startsWith('placed-'))toggleSceneObject(hit);else if(isCreator&&activeTool&&activeTool.kind==='transform'){if(String(hit.id).startsWith('placed-'))selectSceneObject(hit);}else if(isCreator&&objectSelect)objectSelect(hit);}else if(controlledId)travelTo(p.x,p.z);else if(isCreator){cameraFocus.targetX=p.x;cameraFocus.targetZ=p.z;}}
  });
  listen(canvas,'pointercancel',e=>{pointers.delete(e.pointerId);pinchDistance=0;lastBrushPoint=null;gridStrokeLevel=null;splineDraft=null;if(drag&&drag.id===e.pointerId)drag=null;if(editingPointer===e.pointerId){editingPointer=null;endHistoryBatch();}});
  listen(canvas,'pointerleave',()=>{if(!pointers.size){hoverCell=null;hoverObject=null;canvas.style.cursor='grab';}});
  listen(canvas,'wheel',e=>{e.preventDefault();distance=Math.max(4,Math.min(96,distance+e.deltaY*.02));},{passive:false});
  listen(canvas,'contextmenu',e=>{e.preventDefault();if(rightDragged){rightDragged=false;return;}if(!isCreator||!activeTool||!['object','npc'].includes(activeTool.kind))return;const hit=pickObject(e.clientX,e.clientY),matches=hit&&String(hit.id).startsWith('placed-')&&(activeTool.kind==='npc'?hit.type==='npc'&&Number(hit.npc_id)===Number(activeTool.value):hit.type===activeTool.value),index=matches?scene.indexOf(hit):-1;if(index<0){message.textContent='Right-click a matching placed object to remove it.';return;}const removed=scene.splice(index,1)[0];if(selectedObjects().includes(removed))clearSceneSelection();saveMap();rebuildMarkers();rebuildHierarchy();message.textContent=removed.name+' removed.';});
  listen(window,'resize',resize);
  listen(window,'keydown',event=>{
    if(!active||event.altKey||/INPUT|TEXTAREA|SELECT/.test((event.target&&event.target.tagName)||''))return;
    const key=event.key.toLowerCase(),modifier=event.ctrlKey||event.metaKey;
    if(isCreator&&modifier){let handled=false;if(key==='z'){undoEditor();handled=true;}else if(key==='c')handled=copySelection();else if(key==='x'){handled=copySelection();if(handled)removeSelection();}else if(key==='v')handled=pasteClipboard(editorClipboard);else if(key==='d')handled=duplicateSelection();if(handled){event.preventDefault();event.stopPropagation();}return;}
    if(isCreator&&(key==='delete'||key==='backspace')&&removeSelection()){event.preventDefault();return;}
    if(isCreator&&key==='r'&&activeTool&&activeTool.kind==='object'){placementRotation=(placementRotation+Math.PI/2)%(Math.PI*2);if(lastHoverClient)updateHover(lastHoverClient.x,lastHoverClient.y);message.textContent='Placement rotated '+Math.round(placementRotation*180/Math.PI)+'°.';event.preventDefault();return;}
    if(!['w','a','s','d','shift'].includes(key))return;event.preventDefault();heldKeys.add(key);
  });
  listen(window,'keyup',event=>{const key=event.key.toLowerCase(),wasMoving=heldKeys.has(key)&&['w','a','s','d'].includes(key);heldKeys.delete(key);if(wasMoving&&positionChange&&controlledId)positionChange(controlledId,player.x,player.z,player.y,player.motion);});listen(window,'blur',()=>{heldKeys.clear();if(positionChange&&controlledId)positionChange(controlledId,player.x,player.z,player.y,player.motion);});

  function setEnvironment(type,value,notify) {
    if(type==='time'&&atmospheres[value])timeOfDay=value;
    if(type==='weather'&&['clear','rain','storm'].includes(value))weather=value;
    world.dataset.mapTime=timeOfDay;world.dataset.mapWeather=weather;
    world.querySelectorAll('[data-map-time]').forEach(b=>b.classList.toggle('active',b.dataset.mapTime===timeOfDay));
    world.querySelectorAll('[data-map-weather]').forEach(b=>b.classList.toggle('active',b.dataset.mapWeather===weather));
    if(notify&&environmentChange)environmentChange({time:timeOfDay,weather:weather});
  }
  world.querySelectorAll('[data-map-time]').forEach(button=>listen(button,'click',()=>setEnvironment('time',button.dataset.mapTime,true)));
  world.querySelectorAll('[data-map-weather]').forEach(button=>listen(button,'click',()=>setEnvironment('weather',button.dataset.mapWeather,true)));
  listen(document.getElementById('mapResetView'),'click',()=>{yaw=0;pitch=1.52;distance=18;if(isCreator){controlledId=0;cameraFocus={x:0,z:0,targetX:0,targetZ:0};}message.textContent='View reset.';});
  const fullscreenButton=document.getElementById('mapFullscreen');
  const campaignDashboard=document.getElementById('campaignDashboard');
  function fullscreenElement(){return document.fullscreenElement||document.webkitFullscreenElement;}
  function clearFullscreenFallback(){delete world.dataset.fullscreenFallback;world.classList.remove('map-fullscreen-fallback');if(campaignDashboard){delete campaignDashboard.dataset.fullscreenFallback;campaignDashboard.classList.remove('map-dashboard-fullscreen-fallback');}}
  function updateFullscreenButton(){const actual=fullscreenElement(),worldFallback=world.dataset.fullscreenFallback==='true',dashboardFallback=campaignDashboard&&campaignDashboard.dataset.fullscreenFallback==='true',full=actual===world||actual===campaignDashboard||worldFallback||dashboardFallback,dmFull=!!(isCreator&&campaignDashboard&&(actual===campaignDashboard||dashboardFallback));fullscreenButton.textContent=full?'Leave fullscreen':'Fullscreen';fullscreenButton.setAttribute('aria-pressed',String(full));world.classList.toggle('map-fullscreen-fallback',worldFallback);if(campaignDashboard)campaignDashboard.classList.toggle('map-dm-fullscreen',dmFull);setTimeout(resize,0);}
  listen(fullscreenButton,'click',async()=>{
    if(fullscreenElement()){const leave=document.exitFullscreen||document.webkitExitFullscreen;if(leave)await leave.call(document);return;}
    if(world.dataset.fullscreenFallback==='true'||campaignDashboard&&campaignDashboard.dataset.fullscreenFallback==='true'){clearFullscreenFallback();updateFullscreenButton();return;}
    const target=isCreator&&campaignDashboard?campaignDashboard:world,enter=target.requestFullscreen||target.webkitRequestFullscreen;
    if(enter){try{await enter.call(target);}catch(error){target.dataset.fullscreenFallback='true';target.classList.add(target===campaignDashboard?'map-dashboard-fullscreen-fallback':'map-fullscreen-fallback');}}
    else{target.dataset.fullscreenFallback='true';target.classList.add(target===campaignDashboard?'map-dashboard-fullscreen-fallback':'map-fullscreen-fallback');}
    updateFullscreenButton();
  });
  listen(document,'fullscreenchange',updateFullscreenButton);listen(document,'webkitfullscreenchange',updateFullscreenButton);

  return {
    configure:function(options){
      options=options||{};isCreator=!!options.creator;document.getElementById('mapEnvironmentControls').classList.toggle('d-none',!isCreator);
      viewerId=Number(options.viewerId)||0;mapPlayers=Array.isArray(options.players)?options.players.filter(p=>p.present!==false):[];mapNpcs=Array.isArray(options.npcs)?options.npcs:[];folders=Array.isArray(options.folders)?options.folders:[];controlledId=isCreator?0:viewerId;positionInitialized=false;
      environmentChange=options.onEnvironmentChange||null;mapChange=options.onMapChange||null;objectSelect=options.onObjectSelect||null;playerSelect=options.onPlayerSelect||null;positionChange=options.onPositionChange||null;
      painted=Array.isArray(options.paint)?options.paint:[];expanded=Array.isArray(options.expanded)?options.expanded:[];removed=Array.isArray(options.removed)?options.removed:[];mapIcons=Array.isArray(options.icons)?options.icons:[];visibleIcons=new Set((options.visibleIcons||[]).map(String));
      scene=baseScene.map(o=>Object.assign({},o));(options.objects||[]).forEach(saved=>{const object=restoreObject(saved);if(object)scene.push(object);});
      (options.checkpoints||[]).forEach(saved=>{const object=scene.find(o=>o.id===saved.object_id);if(object)object.icon_id=saved.icon_id;});mapPlayers.forEach(value=>{const motion=value.motion||'idle',savedY=Number(value.y),surface=navigationSurface(Number(value.x),Number(value.z),savedY).height;value.y=(motion==='climb'||motion==='fall')&&Number.isFinite(savedY)?savedY:surface;value._motion=motion;});const own=mapPlayers.find(p=>Number(p.id)===controlledId);if(own){player.x=Number(own.x);player.y=Number(own.y)||0;player.z=Number(own.z);player.motion=own.motion||'idle';lastSentMotion=player.motion;player.targetX=player.x;player.targetY=player.y;player.targetZ=player.z;positionInitialized=true;}rebuildPlayers();rebuildMarkers();
      setEnvironment('time',options.time||'day',false);setEnvironment('weather',options.weather||'clear',false);clearSceneSelection();rebuildHierarchy();undoStack=[];lastHistoryState=JSON.stringify(mapPayload());
    },
    setVisibleIcons:function(ids){visibleIcons=new Set((ids||[]).map(String));},
    setIcons:function(icons){mapIcons=Array.isArray(icons)?icons:[];rebuildMarkers();},
    setSharedState:function(state){
      if(!state)return;setEnvironment('time',state.time||'day',false);setEnvironment('weather',state.weather||'clear',false);mapIcons=state.icons||[];mapNpcs=Array.isArray(state.npcs)?state.npcs:mapNpcs;
      if(!gizmoDrag&&performance.now()>localMapDirtyUntil){const selectedId=selectedObject&&selectedObject.id,selectedIds=new Set(selectedObjects().map(object=>String(object.id)));folders=Array.isArray(state.folders)?state.folders:folders;scene=baseScene.map(o=>Object.assign({},o));(state.objects||[]).forEach(saved=>{const object=restoreObject(saved);if(object)scene.push(object);});(state.checkpoints||[]).forEach(saved=>{const object=scene.find(o=>o.id===saved.object_id);if(object)object.icon_id=saved.icon_id;});selectedGroup=scene.filter(object=>selectedIds.has(String(object.id)));selectedObject=scene.find(o=>o.id===selectedId)||selectedGroup[selectedGroup.length-1]||null;expanded=state.expanded||[];removed=state.removed||[];painted=state.paint||[];rebuildHierarchy();lastHistoryState=JSON.stringify(mapPayload());}
      const movingId=controlledId&&(player.path.length||heldKeys.size||player.motion==='fall'||player.motion==='climb')?Number(controlledId):0,stamp=performance.now();mapPlayers=(state.players||[]).filter(p=>p.present!==false).map(remote=>{const local=mapPlayers.find(p=>Number(p.id)===Number(remote.id));if(movingId===Number(remote.id)&&local)return local;const motion=remote.motion||'idle',savedY=Number(remote.y);if(local){const dx=Number(remote.x)-Number(local.x),dy=savedY-Number(local.y),dz=Number(remote.z)-Number(local.z),movement=Math.hypot(dx,dy,dz);if(movement>.01){remote._movingUntil=stamp+350;if(Math.hypot(dx,dz)>.01)remote.facing=Math.atan2(dx,dz);}else{remote._movingUntil=local._movingUntil||0;remote.facing=Number(local.facing)||0;}}remote.y=(motion==='climb'||motion==='fall')&&Number.isFinite(savedY)?savedY:navigationSurface(Number(remote.x),Number(remote.z),savedY).height;remote._motion=motion;return remote;});if(controlledId&&!mapPlayers.some(p=>Number(p.id)===Number(controlledId))){controlledId=0;player.path=[];heldKeys.clear();}if(!isCreator){controlledId=mapPlayers.some(p=>Number(p.id)===viewerId)?viewerId:0;const own=mapPlayers.find(p=>Number(p.id)===viewerId);if(own&&!positionInitialized){player.x=Number(own.x);player.y=Number(own.y)||0;player.z=Number(own.z);player.motion=own.motion||'idle';lastSentMotion=player.motion;player.facing=Number(own.facing)||0;player.targetX=player.x;player.targetY=player.y;player.targetZ=player.z;player.path=[];positionInitialized=true;}}rebuildPlayers();rebuildMarkers();
    },
    setObjectIcon:function(objectId,iconId){const object=scene.find(o=>o.id===objectId);if(object){object.icon_id=iconId||'';rebuildMarkers();saveMap();}},
    beginNpcPlacement:function(npcId){const npc=mapNpcs.find(value=>Number(value.id)===Number(npcId));if(!isCreator||!npc)return;activeTool={kind:'npc',value:Number(npcId)};clearSceneSelection();document.querySelectorAll('.map-tool-list button').forEach(button=>button.classList.toggle('active',button.classList.contains('map-npc-tool')&&button.textContent.includes(npc.name)));message.textContent='Click a free grid cell to place '+npc.name+'.';},
    activate:function(){if(disposed||!canUse3D()||world.hidden)return;if(active)return;active=true;last=performance.now();message.textContent='Choose a place to explore.';frame=requestAnimationFrame(render);},
    deactivate:function(){if(active&&canUse3D()&&positionChange&&controlledId)positionChange(controlledId,player.x,player.z,player.y,player.motion);active=false;if(frame)cancelAnimationFrame(frame);frame=0;heldKeys.clear();player.path=[];},
    dispose:function(){
      disposed=true;active=false;if(frame)cancelAnimationFrame(frame);frame=0;events.abort();heldKeys.clear();pointers.clear();player.path=[];
      environmentChange=mapChange=objectSelect=playerSelect=positionChange=null;
      document.getElementById('map3FolderForm')?.remove();
      for(const id of ['mapPlayerLayer','mapCheckpointLayer','mapHierarchy'])document.getElementById(id)?.replaceChildren();
      document.querySelectorAll('.map-sized-tool').forEach(wrapper=>{const button=wrapper.querySelector('[data-map-brush]');if(button)wrapper.replaceWith(button);});
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      const fresh=canvas.cloneNode(false);fresh.width=fresh.height=1;canvas.replaceWith(fresh);
    },
    get active(){return active;}

  };
  }
  let renderer=null;
  // Keep a single facade: late icon/sync calls cannot create or update a hidden 3D world.
  const facade={
    deactivate(){renderer?.deactivate();},
    dispose(){renderer?.dispose();renderer=null;},
    get initialized(){return !!renderer;},
    get active(){return !!renderer?.active;}
  };
  for(const name of ['configure','setVisibleIcons','setIcons','setSharedState','setObjectIcon','beginNpcPlacement','activate'])facade[name]=function(...args){
    if(!canUse3D())return;
    if(!renderer&&(name==='configure'||name==='activate'))renderer=initialize3D();
    return renderer?.[name](...args);
  };
  window.campaignMap=facade;
})();
