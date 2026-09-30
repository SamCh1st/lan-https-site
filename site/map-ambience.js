/* Plain scenery shares one layer per type/opacity; interactive stamps stay separate. */
(function(){
  const plain=n=>MapArt.ambience.includes(n.type)&&!n.locked&&!n.light_enabled&&!n.hidden&&!n.label&&!n.contents?.length&&!n.connected_map_id&&!n.erasures?.length;
  function pack(nodes){
    const groups=new Map(),result=[],created=[];
    for(const n of nodes){
      if(!plain(n)||(n.instances&&(n.rotation||n.w!==n.ambience_w||n.h!==n.ambience_h))){result.push(n);continue;}
      const key=(n.part_card_id||'')+':'+(n.part_image_id||'')+':'+n.type+':'+(n.opacity??1)+':'+(n.folder_id||'')+':'+(n.height_scale??1)+':'+(n.walk_over!==false),items=n.instances?n.instances.map(i=>({...i,x:i.x+n.x,y:i.y+n.y})):[{x:n.x,y:n.y,w:n.w,h:n.h,rotation:n.rotation||0}];
      let group=groups.get(key);
      if(!group||group.instances.length+items.length>5000){group={...n,x:0,y:0,rotation:0,instances:[]};groups.set(key,group);result.push(group);created.push(group);}
      group.instances.push(...items);
    }
    for(const n of created)bounds(n);
    return result;
  }
  function bounds(n){
    if(!n.instances.length)return;
    const left=Math.min(...n.instances.map(i=>i.x)),top=Math.min(...n.instances.map(i=>i.y));
    n.w=Math.max(...n.instances.map(i=>i.x+i.w))-left;n.h=Math.max(...n.instances.map(i=>i.y+i.h))-top;
    n.instances.forEach(i=>{i.x-=left;i.y-=top;});n.x+=left;n.y+=top;n.ambience_w=n.w;n.ambience_h=n.h;
  }
  function local(n,p){const a=-(n.rotation||0)*Math.PI/180,dx=p.x-n.x-n.w/2,dy=p.y-n.y-n.h/2;return {x:dx*Math.cos(a)-dy*Math.sin(a)+n.w/2,y:dx*Math.sin(a)+dy*Math.cos(a)+n.h/2};}
  function erase(nodes,type,p,r){
    return nodes.filter(n=>{
      if(n.type!==type||n.locked||n.hidden)return true;
      const q=local(n,p);
      if(n.instances){const sx=n.w/n.ambience_w,sy=n.h/n.ambience_h;n.instances=n.instances.filter(i=>Math.hypot((i.x+i.w/2)*sx-q.x,(i.y+i.h/2)*sy-q.y)>r+Math.max(i.w*sx,i.h*sy)/2);return !!n.instances.length;}
      if(q.x < -r||q.y < -r||q.x > n.w+r||q.y > n.h+r)return true;
      if(MapArt.stamps.includes(type)||MapArt.buildings.includes(type)||type==='label')return false;
      // Normalized cutouts follow subsequent moves, rotations and stretching.
      n.erasures??=[];if(n.erasures.length<4000)n.erasures.push([q.x/n.w,q.y/n.h,r/n.w,r/n.h]);return true;
    });
  }
  window.MapAmbience={pack,erase};
})();
