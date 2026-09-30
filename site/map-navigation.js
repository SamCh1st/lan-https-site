/* Tile navigation geometry. This module also runs in a worker and in Node tests. */
(function(root){
 'use strict';
 const TILE=40,MIN=-100,MAX=100;
 const inside=(p,poly)=>{let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
 const distance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
 const bounds=pts=>({minX:Math.min(...pts.map(p=>p[0])),minY:Math.min(...pts.map(p=>p[1])),maxX:Math.max(...pts.map(p=>p[0])),maxY:Math.max(...pts.map(p=>p[1]))});
 const contains=(b,p,pad=0)=>p[0]>=b.minX-pad&&p[0]<=b.maxX+pad&&p[1]>=b.minY-pad&&p[1]<=b.maxY+pad;
 function transform(n,x,y,sx=1,sy=1){const a=(n.rotation||0)*Math.PI/180,dx=x*sx-n.w/2,dy=y*sy-n.h/2;return [n.x+n.w/2+dx*Math.cos(a)-dy*Math.sin(a),n.y+n.h/2+dx*Math.sin(a)+dy*Math.cos(a)];}
 function createScene(nodes){
  const buckets=new Map(),wide=[],blockedCache=new Map(),edges=new Map();let count=0;
  const add=o=>{o.id=count++;const b=o.bounds,x0=Math.floor((b.minX-3)/320),x1=Math.floor((b.maxX+3)/320),y0=Math.floor((b.minY-3)/320),y1=Math.floor((b.maxY+3)/320);if((x1-x0+1)*(y1-y0+1)>256){wide.push(o);return;}for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const key=x+','+y;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(o);}};
  const polygon=poly=>add({poly,bounds:bounds(poly)});
  const rect=(n,x,y,w,h,sx=1,sy=1)=>polygon([[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(([xx,yy])=>transform(n,xx,yy,sx,sy)));
  const line=(a,b,r,clip)=>add({a,b,r,clip,bounds:{minX:Math.min(a[0],b[0])-r,minY:Math.min(a[1],b[1])-r,maxX:Math.max(a[0],b[0])+r,maxY:Math.max(a[1],b[1])+r}});
  for(const n of nodes){
   const building=['building','hall','cottage','ruin'].includes(n.type);
   if(n.hidden||(!building&&n.walk_over!==false))continue;
   if(n.tile_cells?.length){
    for(const [x,y] of n.tile_cells)rect(n,x*40,y*40,40,40,n.w/(n.tile_base_w||n.w),n.h/(n.tile_base_h||n.h));
   }else if(n.instances?.length){
    for(const instance of n.instances){const sx=n.w/(n.ambience_w||n.w),sy=n.h/(n.ambience_h||n.h);polygon([[0,0],[instance.w,0],[instance.w,instance.h],[0,instance.h]].map(([x,y])=>transform(n,...transform(instance,x,y),sx,sy)));}
   }else if(building){
    const sx=n.w/(n.room_base_w||n.w),sy=n.h/(n.room_base_h||n.h),rooms=n.rooms||[{x:0,y:0,w:n.w,h:n.h}],polys=(n.building_shapes||rooms.map(r=>({points:[[r.x,r.y],[r.x+r.w,r.y],[r.x+r.w,r.y+r.h],[r.x,r.y+r.h]]}))).map(s=>s.points.map(([x,y])=>transform(n,x,y,sx,sy)));
    if(n.walk_over===false){polys.forEach(polygon);continue;}
    // Walk over opens the floor; the building's rendered walls remain obstacles.
    if(n.building_shapes){
     let door;if(n.spline_kind&&n.building_view!=='exterior'&&n.building_entry!==false){const pts=polys[0];let longest=0;pts.forEach((a,i)=>{const b=pts[(i+1)%pts.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len>longest){longest=len;door={center:[(a[0]+b[0])/2,(a[1]+b[1])/2],u:[(b[0]-a[0])/len,(b[1]-a[1])/len],width:Math.min(48,len*.35)};}});}
     add({shell:polys,door,t:(n.wall_width||12)*(n.spline_kind?1:Math.max(sx,sy)),bounds:bounds(polys.flat())});
    }else if(n.rooms){
     const cells=new Map();for(const r of rooms)for(let x=Math.round(r.x/40);x<Math.round((r.x+r.w)/40);x++)for(let y=Math.round(r.y/40);y<Math.round((r.y+r.h)/40);y++)cells.set(x+','+y,r);
     const boundary=[];for(const [key,r] of cells){const [x,y]=key.split(',').map(Number);for(const [dx,dy,side] of [[-1,0,'w'],[1,0,'e'],[0,-1,'n'],[0,1,'s']])if(!cells.has((x+dx)+','+(y+dy)))boundary.push({x:x*40,y:y*40,side,r});}
     const door=boundary.filter(b=>b.side==='s').sort((a,b)=>b.y-a.y||Math.abs(a.x+20-(n.room_base_w||n.w)/2)-Math.abs(b.x+20-(n.room_base_w||n.w)/2))[0];
     for(const b of boundary){if(b===door)continue;const t=b.r.wall_width||n.wall_width||12;rect(n,b.x+(b.side==='e'?40-t:0),b.y+(b.side==='s'?40-t:0),['n','s'].includes(b.side)?40:t,['w','e'].includes(b.side)?40:t,sx,sy);}
     for(const [key,r] of cells){const [x,y]=key.split(',').map(Number),t=r.wall_width||n.wall_width||12;for(const [dx,dy] of [[-1,-1],[1,-1],[-1,1],[1,1]])if(cells.has((x+dx)+','+y)&&cells.has(x+','+(y+dy))&&!cells.has((x+dx)+','+(y+dy)))rect(n,x*40+(dx>0?40-t:0),y*40+(dy>0?40-t:0),t,t,sx,sy);}
    }else{
     const t=n.wall_width||12,gap=Math.min(40,n.w-2*t),side=(n.w-gap)/2;rect(n,0,0,n.w,t);rect(n,0,0,t,n.h);rect(n,n.w-t,0,t,n.h);rect(n,0,n.h-t,side,t);rect(n,side+gap,n.h-t,side,t);
    }
    for(const points of n.interior_walls||[])for(let i=1;i<points.length;i++)line(transform(n,...points[i-1],n.w/(n.wall_base_w||n.w),n.h/(n.wall_base_h||n.h)),transform(n,...points[i],n.w/(n.wall_base_w||n.w),n.h/(n.wall_base_h||n.h)),(n.wall_width||12)/2,polys);
   }else if(n.shape==='stroke'){
    for(const p of n.strokes||[{points:n.points||[],brush:n.brush||40}]){const m=p.transform||[1,0,0,1,0,0],sx=n.w/(n.baseW||n.w),sy=n.h/(n.baseH||n.h),pts=p.points.map(([x,y])=>transform(n,m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5],sx,sy)),r=(p.brush||40)/2*Math.max(sx*Math.hypot(m[0],m[2]),sy*Math.hypot(m[1],m[3]));if(pts.length===1)line(pts[0],pts[0],r);for(let i=1;i<pts.length;i++)line(pts[i-1],pts[i],r);}
   }else rect(n,0,0,n.w,n.h);
  }
  function solid(p){const nearby=buckets.get(Math.floor(p[0]/320)+','+Math.floor(p[1]/320))||[];for(const o of nearby.concat(wide)){if(!contains(o.bounds,p,2))continue;if(o.poly){if(inside(p,o.poly)||o.poly.some((a,i)=>distance(p,a,o.poly[(i+1)%o.poly.length])<2))return true;}else if(o.shell){if(o.door){const dx=p[0]-o.door.center[0],dy=p[1]-o.door.center[1],u=o.door.u;if(Math.abs(dx*u[0]+dy*u[1])<o.door.width/2-2&&Math.abs(-dx*u[1]+dy*u[0])<o.t*2+2)continue;}const inUnion=q=>o.shell.some(poly=>inside(q,poly));if(inUnion(p)&&[-1,0,1].some(x=>[-1,0,1].some(y=>!inUnion([p[0]+x*(o.t+2),p[1]+y*(o.t+2)]))))return true;}else if((!o.clip||o.clip.some(poly=>inside(p,poly)))&&distance(p,o.a,o.b)<o.r+2)return true;}return false;}
  function blocked(x,y){if(x<MIN||x>MAX||y<MIN||y>MAX)return true;const key=x+','+y;if(!blockedCache.has(key))blockedCache.set(key,solid([x*40+20,y*40+20]));return blockedCache.get(key);}
  function clear(a,b){const key=[a[0],a[1],b[0],b[1]].join(',');if(edges.has(key))return edges.get(key);const len=Math.hypot(b[0]-a[0],b[1]-a[1])*40,steps=Math.max(1,Math.ceil(len/2));let ok=true;for(let i=1;i<=steps;i++)if(solid([(a[0]+(b[0]-a[0])*i/steps)*40+20,(a[1]+(b[1]-a[1])*i/steps)*40+20])){ok=false;break;}edges.set(key,ok);if(edges.size>100000)edges.clear();return ok;}
  return {blocked,clear,solid,count};
 }
 class Heap{constructor(){this.a=[];}push(v){const a=this.a;let i=a.length;a.push(v);while(i){const p=(i-1)>>1;if(a[p].f<=v.f)break;a[i]=a[p];i=p;}a[i]=v;}pop(){const a=this.a,top=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let j=i*2+1;if(j+1<a.length&&a[j+1].f<a[j].f)j++;if(a[j].f>=last.f)break;a[i]=a[j];i=j;}a[i]=last;}return top;}get length(){return this.a.length;}}
 function findPath(scene,start,goal,range=Infinity){
  const inRange=(x,y)=>Math.max(Math.abs(x-start[0]),Math.abs(y-start[1]))<=range+1e-9;
  if(!inRange(...goal))return {path:[],reason:"That tile is outside your interaction range."};
  const gx=goal[0],gy=goal[1];if(!Number.isInteger(gx)||!Number.isInteger(gy)||scene.blocked(gx,gy))return {path:[],reason:'That tile is blocked.'};
  const starts=[];for(const x of new Set([Math.floor(start[0]),Math.ceil(start[0])]))for(const y of new Set([Math.floor(start[1]),Math.ceil(start[1])]))if(inRange(x,y)&&!scene.blocked(x,y)&&scene.clear(start,[x,y]))starts.push([x,y]);
  if(!starts.length)return {path:[],reason:'Move the token off the blocking part first.'};
  const key=(x,y)=>(y-MIN)*201+x-MIN,heuristic=(x,y)=>{const dx=Math.abs(x-gx),dy=Math.abs(y-gy);return Math.max(dx,dy)+(Math.SQRT2-1)*Math.min(dx,dy);},open=new Heap(),best=new Map(),parents=new Map(),closed=new Set();
  for(const [x,y] of starts){const g=Math.hypot(x-start[0],y-start[1]);best.set(key(x,y),g);open.push({x,y,g,f:g+heuristic(x,y)});}
  while(open.length){const n=open.pop(),id=key(n.x,n.y);if(closed.has(id))continue;closed.add(id);if(n.x===gx&&n.y===gy){const path=[];let next=id;while(next!==undefined){path.push([next%201+MIN,Math.floor(next/201)+MIN]);next=parents.get(next);}return {path:path.reverse(),visited:closed.size};}
   for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){const x=n.x+dx,y=n.y+dy,k=key(x,y);if(!inRange(x,y)||scene.blocked(x,y)||closed.has(k))continue;if(dx&&dy&&(scene.blocked(n.x+dx,n.y)||scene.blocked(n.x,n.y+dy)||!scene.clear([n.x,n.y],[n.x+dx,n.y])||!scene.clear([n.x,n.y],[n.x,n.y+dy])))continue;const cost=n.g+(dx&&dy?Math.SQRT2:1);if(cost>=(best.get(k)??Infinity)||!scene.clear([n.x,n.y],[x,y]))continue;best.set(k,cost);parents.set(k,id);open.push({x,y,g:cost,f:cost+heuristic(x,y)});}
  }
  return {path:[],reason:'No clear path to that tile.'};
 }
 const api={createScene,findPath};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MapNavigation=api;
})(globalThis);
