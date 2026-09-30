/* Cached relief shading. Height and alpha share the exact albedo crop. */
(function(){
 const bases=new Map(),tiles=new Map(),watchers=new Map(),queue=[];
 let scene={},lights=[],roomAt=()=>null,contextKey='',timer=0,working=false;
 const sun={Dawn:[1.8,-.65],Morning:[.8,-.4],Day:[-.24,-.32],Evening:[-1.8,-.65],Night:[0,0]};
 let refreshVersion=0,shadeWorker=null,shadeSerial=0;const shadeRequests=new Map(),workerBases=new Set();
 function update(value,sources,findRoom){scene=value;lights=sources;roomAt=findRoom;const key=JSON.stringify([scene.time,scene.weather,scene.light_angle,scene.relief,lights.map(l=>[l.id,l.cx,l.cy,l.radius,l.light_intensity,l.color,l.room?.id])]);if(key===contextKey)return;contextKey=key;
  for(const task of queue.splice(0)){tiles.delete(task.key);task.resolve(null);}
  const version=++refreshVersion;clearTimeout(timer);timer=setTimeout(()=>{const pending=[...watchers];let index=0;const batch=()=>{if(version!==refreshVersion)return;const start=performance.now();while(index<pending.length){const [g,refresh]=pending[index++];if(g.isConnected&&watchers.get(g)===refresh)refresh();else if(!g.isConnected)watchers.delete(g);if(performance.now()-start>4)break;}if(index<pending.length)timer=setTimeout(batch,0);};batch();},40);
 }
 function shade(task,data){
  if(!shadeWorker){shadeWorker=new Worker('/map-surface-lighting-worker.js?v=20260921-smooth-light');shadeWorker.onmessage=({data:r})=>{const request=shadeRequests.get(r.id);shadeRequests.delete(r.id);if(!request){r.bitmap?.close();return;}r.error?request.reject(Error(r.error)):request.resolve(r.bitmap);};shadeWorker.onerror=()=>{for(const request of shadeRequests.values())request.reject(Error('Surface shading failed'));shadeRequests.clear();workerBases.clear();shadeWorker.terminate();shadeWorker=null;};}
  const id=++shadeSerial,baseKey=[task.n.type,task.n.part_image_id||'',task.n.part_image_id?(task.n.w/task.n.h).toFixed(3):'',task.size].join(':'),message={id,size:task.size,profile:task.p,baseKey,drop:[]};
  if(!workerBases.has(baseKey)){message.base={pixels:data.pixels.data,normals:data.normals};workerBases.add(baseKey);while(workerBases.size>32){const key=workerBases.values().next().value;workerBases.delete(key);message.drop.push(key);}}
  return new Promise((resolve,reject)=>{shadeRequests.set(id,{resolve,reject});shadeWorker.postMessage(message);});
 }

 function release(g){for(const node of [g,...g.querySelectorAll('*')]){watchers.delete(node);for(const key of ['_ambienceURL','_overviewURL','_batchURL'])if(node[key]){URL.revokeObjectURL(node[key]);delete node[key];}}}
 function watch(g,refresh){watchers.set(g,refresh);if(watchers.size>512)for(const node of watchers.keys())if(!node.isConnected)watchers.delete(node);}
 function profile(n){
  const base=sun[scene.time]||sun.Day,sourceAngle=(scene.light_angle??Math.atan2(base[1],base[0])*180/Math.PI)*Math.PI/180,sx=Math.cos(sourceAngle)*Math.hypot(...base),sy=Math.sin(sourceAngle)*Math.hypot(...base),room=n.building_view==='exterior'?null:roomAt([n.x+n.w/2,n.y+n.h/2]);let dx=room?0:sx,dy=room?0:sy,strength=room||scene.time==='Night'?.12:.65,total=0,rx=0,ry=0,rgb=[0,0,0];
  for(const l of lights){if(l.room!==room)continue;const x=l.cx-n.x-n.w/2,y=l.cy-n.y-n.h/2,d=Math.hypot(x,y),power=Math.max(0,1-d/l.radius)*(l.light_intensity??1)*(l.opacity??1);if(power<=0)continue;const len=d||1;total+=power;rx+=x/len*power;ry+=y/len*power;const color=/^#[0-9a-f]{6}$/i.test(l.color)?[1,3,5].map(i=>parseInt(l.color.slice(i,i+2),16)/255):[1,1,1];for(let i=0;i<3;i++)rgb[i]+=Math.pow(color[i],2.2)*power;}
  const influence=1-Math.exp(-total*2),color=total?rgb.map(v=>1-influence*.72+Math.pow(v/total,1/2.2)*influence*.72):[1,1,1];if(total){dx=dx*(1-influence)+rx/total*1.5*influence;dy=dy*(1-influence)+ry/total*1.5*influence;strength=Math.max(strength,.4+influence*.6);}
  const angle=Math.round((Math.atan2(dy,dx)-(n.rotation||0)*Math.PI/180)/(Math.PI/16))*Math.PI/16;
  return {angle,strength:Math.round(strength*16)/16,color:color.map(v=>Math.round(v*32)/32),height:Math.round((n.height_scale??1)*4)/4};
 }
 async function base(n,size){const type=n.type,key=[type,n.part_image_id||'',n.part_image_id?(n.w/n.h).toFixed(3):'',size].join(':');if(!bases.has(key))bases.set(key,(n.part_image_id?MapPartImages.bitmap(n,size):MapSprites.load(type)).then(atlas=>{
  const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d',{willReadFrequently:true});if(n.part_image_id)ctx.drawImage(atlas,0,0,size,size);else MapSprites.draw(ctx,type,atlas,size);const pixels=ctx.getImageData(0,0,size,size),h=new Float32Array(size*size),normals=new Float32Array(size*size*2);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=y*size+x,p=i*4;h[i]=MapPartProfiles.height(type,(x+.5)/size,(y+.5)/size)*.24+(pixels.data[p]*.21+pixels.data[p+1]*.72+pixels.data[p+2]*.07)/255*.065;}
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=y*size+x;const sample=(xx,yy)=>{const j=yy*size+xx;return pixels.data[j*4+3]>32?h[j]:h[i];};normals[i*2]=(sample(Math.max(0,x-1),y)-sample(Math.min(size-1,x+1),y))*size*.5;normals[i*2+1]=(sample(x,Math.max(0,y-1))-sample(x,Math.min(size-1,y+1)))*size*.5;}
  return {pixels,normals};}));return bases.get(key);}
 function bitmap(n,size=256){if(n.type.startsWith('marker_')||MapPartProfiles.isLight(n))return (n.part_image_id?MapPartImages.bitmap(n,size):MapSprites.load(n.type)).then(atlas=>{const c=document.createElement('canvas');c.width=c.height=size;if(n.part_image_id)c.getContext('2d').drawImage(atlas,0,0,size,size);else MapSprites.draw(c.getContext('2d'),n.type,atlas,size);return {canvas:c};});
  const p=profile(n),key=[n.type,n.part_image_id||'',n.part_image_id?(n.w/n.h).toFixed(3):'',size,p.angle,p.strength,p.color,p.height].join(':');if(!tiles.has(key)){let resolve;const promise=new Promise(r=>resolve=r);tiles.set(key,promise);queue.push({n:{...n},size,p,resolve,key});run();}return tiles.get(key);
 }
 async function run(){if(working||!queue.length)return;working=true;const task=queue.shift();try{
  const data=await base(task.n,task.size),c=document.createElement('canvas');c.width=c.height=task.size;
  const bitmap=await shade(task,data);c.getContext('2d').drawImage(bitmap,0,0);bitmap.close();task.resolve({canvas:c,key:task.key});

 }catch{tiles.delete(task.key);task.resolve(null);}finally{working=false;if(tiles.size>384)tiles.delete(tiles.keys().next().value);if(queue.length)setTimeout(run,0);}}
 async function image(n,size=256){const tile=await bitmap(n,size);if(!tile)return null;if(!tile.url)tile.url=new Promise(resolve=>tile.canvas.toBlob(blob=>resolve(blob?URL.createObjectURL(blob):null)));return tile.url;}
 function surface(n){const p=profile(n),a=-(n.rotation||0)*Math.PI/180,room=n.building_view==='exterior'?null:roomAt([n.x+n.w/2,n.y+n.h/2]);const base=sun[scene.time]||sun.Day,angle=(scene.light_angle??Math.atan2(base[1],base[0])*180/Math.PI)*Math.PI/180+a;return {angle,strength:room||scene.time==='Night'?.08:.65,height:p.height*(scene.relief??1),color:[1,1,1],lights:lights.filter(l=>l.room===room&&Math.hypot(l.cx-n.x-n.w/2,l.cy-n.y-n.h/2)<l.radius+Math.hypot(n.w,n.h)/2).slice(0,16).map(l=>{const x=l.cx-n.x-n.w/2,y=l.cy-n.y-n.h/2;return {x:n.w/2+x*Math.cos(a)-y*Math.sin(a),y:n.h/2+x*Math.sin(a)+y*Math.cos(a),radius:l.radius,power:(l.light_intensity??1)*(l.opacity??1),color:[1,3,5].map(i=>parseInt((l.color||'#ffffff').slice(i,i+2),16)/255)};})};}
 window.MapSurfaceLighting={surface,update,watch,release,bitmap,image,profile,get key(){return contextKey;}};
})();
