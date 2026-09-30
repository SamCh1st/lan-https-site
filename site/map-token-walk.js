/* Plan away from the render thread; animate only token transforms. */
(function(){
 let context=null,worker=null,scene=null,serial=0,revision=0,active=null,frame=0;
 const requests=new Map(),cache=new Map(),poses=new Map(),sends=new Map();
 function reset(){cancelAnimationFrame(frame);frame=0;active=null;worker?.terminate();worker=null;for(const resolve of requests.values())resolve({path:[],reason:''});requests.clear();cache.clear();poses.clear();for(const q of sends.values())q.resolve();sends.clear();revision++;}
 function configure(value){reset();context=value;scene={nodes:value.nodes,walkable:value.walkable};}
 function setScene(nodes){if(!context)return;stop();scene={...scene,nodes};revision++;cache.clear();worker?.postMessage({type:'scene',...scene});}
 function getWorker(){if(worker)return worker;worker=new Worker('map-navigation-worker.js?v=20260921-building-walls');worker.postMessage({type:'scene',...scene});worker.onmessage=e=>{const resolve=requests.get(e.data.id);requests.delete(e.data.id);resolve?.(e.data);};worker.onerror=()=>{for(const resolve of requests.values())resolve({path:[],reason:'Unable to find a path.'});requests.clear();worker.terminate();worker=null;};return worker;}
 function plan(id,goal,range){const p=context?.player(id);if(!p)return Promise.resolve({path:[],reason:'Select a player first.'});const start=[p.x,p.z],key=JSON.stringify([revision,id,start,goal,range]);if(!cache.has(key)){const promise=new Promise(resolve=>{try{const w=getWorker(),request=++serial;requests.set(request,resolve);w.postMessage({type:'path',id:request,start,goal,range});}catch{resolve({path:[],reason:'Unable to find a path.'});}});cache.set(key,promise);if(cache.size>64)cache.delete(cache.keys().next().value);}return cache.get(key);}
 function pose(id,x,z,motion){poses.set(Number(id),{x,z,motion,until:performance.now()+1500});context?.pose(id,x,z,motion);}
 function publish(id,x,z,motion){
  const key=Number(id),ctx=context;let queue=sends.get(key);if(!queue){queue={next:null,running:false};queue.done=new Promise(resolve=>queue.resolve=resolve);sends.set(key,queue);}queue.next={x,z,motion};if(queue.running)return;
  queue.running=true;(async()=>{while(queue.next&&context===ctx&&sends.get(key)===queue){const packet=queue.next;queue.next=null;try{const ok=await ctx.send(key,packet.x,packet.z,0,packet.motion);if(ok===false)throw Error('Unable to save movement.');}catch{if(context===ctx){if(active?.id===key)stop(false);poses.delete(key);ctx.status('Unable to save movement. Reload the map to restore the player’s position.');}break;}}queue.running=false;queue.resolve();if(sends.get(key)===queue)sends.delete(key);})();
 }
 function place(id,x,z,motion='idle'){pose(id,x,z,motion);publish(id,x,z,motion);}
 function stop(save=true){const old=active;active=null;cancelAnimationFrame(frame);frame=0;if(old){const p=context?.player(old.id);if(p){pose(old.id,p.x,p.z,'idle');if(save)publish(old.id,p.x,p.z,'idle');}context?.finish();}}
 async function go(id,goal,range){
  const p=context?.player(id);if(!p)return;if(active&&active.id!==Number(id))stop();
  // Replace the route at the current fractional position, without publishing an
  // intermediate stop or rebuilding the scene. Only the latest click may win.
  cancelAnimationFrame(frame);frame=0;const job={id:Number(id),last:performance.now(),sent:active?.sent||0,index:0,path:null};active=job;context.status('Finding a path…');const result=await plan(id,goal,range);if(active!==job)return;
  if(!result.path.length){stop();context.status(result.reason);return;}job.path=result.path;context.status('');context.path?.(result.path);job.last=performance.now();
  const tick=now=>{if(active!==job)return;const player=context.player(job.id);if(!player){stop(false);return;}let distance=Math.min(.06,(now-job.last)/1000)*5;job.last=now;let x=player.x,z=player.z;
   while(distance>0&&job.index<job.path.length){const [tx,tz]=job.path[job.index],length=Math.hypot(tx-x,tz-z);if(length<=distance){x=tx;z=tz;distance-=length;job.index++;}else{x+=(tx-x)*distance/length;z+=(tz-z)*distance/length;distance=0;}}
   const done=job.index>=job.path.length;pose(job.id,x,z,done?'idle':'walk');if(done||now-job.sent>=250){publish(job.id,x,z,done?'idle':'walk');job.sent=now;}
   if(done){active=null;context.finish();return;}frame=requestAnimationFrame(tick);
  };frame=requestAnimationFrame(tick);
 }
 function merge(players){const now=performance.now();return players.map(p=>{const local=poses.get(Number(p.id));if(local&&(active?.id===Number(p.id)||sends.has(Number(p.id))||local.until>now))return {...p,x:local.x,z:local.z,motion:local.motion};poses.delete(Number(p.id));return p;});}
 window.MapTokenWalk={configure,setScene,plan,go,stop,place,merge,reset,flush:()=>Promise.all([...sends.values()].map(q=>q.done)),get moving(){return !!active;}};
})();
