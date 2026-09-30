/* Continuous building footprints. Union masks remove shared walls without a grid. */
(function(){
 const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 function smooth(points){let p=points;for(let pass=0;pass<2;pass++){const next=[];for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];next.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25],[a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75]);}p=next;}return p;}
 function inside(p,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
 function shapes(n){return n.building_shapes||MapBuildings.rooms(n).map(r=>({...r,points:[[r.x,r.y],[r.x+r.w,r.y],[r.x+r.w,r.y+r.h],[r.x,r.y+r.h]]}));}
 function roundCorners(p){const out=[];for(let i=0;i<p.length;i++){const a=p[(i+p.length-1)%p.length],b=p[i],c=p[(i+1)%p.length],r=Math.min(12,dist(a,b)*.2,dist(b,c)*.2),start=[b[0]+(a[0]-b[0])*r/dist(a,b),b[1]+(a[1]-b[1])*r/dist(a,b)],end=[b[0]+(c[0]-b[0])*r/dist(b,c),b[1]+(c[1]-b[1])*r/dist(b,c)];for(let j=0;j<=4;j++){const t=j/4;out.push([(1-t)**2*start[0]+2*(1-t)*t*b[0]+t*t*end[0],(1-t)**2*start[1]+2*(1-t)*t*b[1]+t*t*end[1]]);}}return out;}
 function world(n){const sx=n.w/(n.room_base_w||n.w),sy=n.h/(n.room_base_h||n.h),a=(n.rotation||0)*Math.PI/180;return shapes(n).map(s=>({...s,points:(!n.building_shapes&&(n.rotation||0)%90?roundCorners(s.points):s.points).map(([x,y])=>{x=x*sx-n.w/2;y=y*sy-n.h/2;return [n.x+n.w/2+x*Math.cos(a)-y*Math.sin(a),n.y+n.h/2+x*Math.sin(a)+y*Math.cos(a)];})}));}
 function segment(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return dist(p,[a[0]+t*dx,a[1]+t*dy]);}
 function touches(a,b){if(a.some(p=>inside(p,b))||b.some(p=>inside(p,a)))return true;const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){const p=a[i],q=a[(i+1)%a.length],r=b[j],s=b[(j+1)%b.length];if(cross(p,q,r)*cross(p,q,s)<0&&cross(r,s,p)*cross(r,s,q)<0)return true;if(segment(p,r,s)<.1||segment(r,p,q)<.1)return true;}return false;}
 function normalize(parts){const pts=parts.flatMap(s=>s.points),x=Math.min(...pts.map(p=>p[0])),y=Math.min(...pts.map(p=>p[1])),w=Math.max(...pts.map(p=>p[0]))-x,h=Math.max(...pts.map(p=>p[1]))-y;if(w<10||h<10||w>10000||h>10000)return null;return {x,y,w,h,room_base_w:w,room_base_h:h,building_shapes:parts.map(s=>({...s,points:s.points.map(p=>[p[0]-x,p[1]-y])}))};}
 function outline(points,type,nodes){if(points.length<3)return null;const first=points[0],last=points.at(-1);const connected=nodes.some(n=>n.type===type&&!n.locked&&!n.hidden&&world(n).some(s=>inside(first,s.points)||s.points.some((p,i)=>segment(first,p,s.points[(i+1)%s.points.length])<12))&&world(n).some(s=>inside(last,s.points)||s.points.some((p,i)=>segment(last,p,s.points[(i+1)%s.points.length])<12)));if(dist(first,last)>50&&!connected)return null;
 let p=[];for(const v of points)if(!p.length||dist(v,p.at(-1))>=10)p.push(v);if(dist(p[0],p.at(-1))<10)p.pop();if(p.length<3)return null;
 // Simplify nearly straight segments before corner smoothing, preserving the drawn silhouette.
 let changed=true;while(changed&&p.length>3){changed=false;for(let i=0;i<p.length;i++){if(segment(p[i],p[(i+p.length-1)%p.length],p[(i+1)%p.length])<3){p.splice(i,1);changed=true;break;}}}
 if(p.length>500)p=p.filter((_,i)=>i%Math.ceil(p.length/500)===0);
 return normalize([{points:smooth(p)}]);
 }
 function merge(nodes,node){if(node.spline_kind)return nodes;if(!MapArt.buildings.includes(node.type)||node.locked)return nodes;let parts=world(node),ids=new Set([node.id]),again=true;while(again){again=false;for(const other of nodes){if(other.spline_kind||ids.has(other.id)||other.type!==node.type||(other.walk_over!==false)!==(node.walk_over!==false)||(other.folder_id||'')!==(node.folder_id||'')||other.locked||!!other.hidden!==!!node.hidden||(other.connected_map_id&&node.connected_map_id&&other.connected_map_id!==node.connected_map_id))continue;const next=world(other);if(parts.length+next.length>100||parts.concat(next).reduce((sum,s)=>sum+s.points.length,0)>12000)continue;if(parts.some(a=>next.some(b=>touches(a.points,b.points)))){parts.push(...next);ids.add(other.id);again=true;}}}if(ids.size===1)return nodes;const shape=normalize(parts);if(!shape)return nodes;const contents=new Map();let publicContents=true;for(const n of nodes.filter(n=>ids.has(n.id))){if(n.contents?.length&&!n.contents_public)publicContents=false;for(const e of n.contents||[])contents.set(e.record_id,Math.min(9999,(contents.get(e.record_id)||0)+e.quantity));}if(contents.size>100)return nodes;for(const n of nodes.filter(n=>ids.has(n.id))){if(!node.label&&n.label)node.label=n.label;if(!node.connected_map_id&&n.connected_map_id)node.connected_map_id=n.connected_map_id;}const finishWalls=carryWalls(node,nodes.filter(n=>ids.has(n.id)));Object.assign(node,shape,{rotation:0,contents:[...contents].map(([record_id,quantity])=>({record_id,quantity})),contents_public:publicContents});delete node.rooms;finishWalls();return nodes.filter(n=>!ids.has(n.id)||n.id===node.id);}
 function render(n,g,el){const w=n.room_base_w,h=n.room_base_h,group=el('g',{transform:`scale(${n.w/w} ${n.h/h})`},g),defs=el('defs',{},group),id='building-'+n.id.replace(/[^a-zA-Z0-9_-]/g,''),bounds={x:-40,y:-40,width:w+80,height:h+80};const footprint=el('g',{id:id+'-footprint'},defs);const path=s=>s.points.map((p,i)=>(i?'L':'M')+p.join(' ')).join(' ')+' Z';n.building_shapes.forEach(s=>el('path',{d:path(s),fill:'white'},footprint));
 const outer=el('mask',{id:id+'-outer',maskUnits:'userSpaceOnUse',...bounds},defs);el('use',{href:'#'+id+'-footprint'},outer);
 const erosion=el('filter',{id:id+'-inset',filterUnits:'userSpaceOnUse',...bounds},defs);el('feMorphology',{operator:'erode',radius:n.wall_width||12},erosion);
 const inner=el('mask',{id:id+'-floor',maskUnits:'userSpaceOnUse',...bounds},defs);el('use',{href:'#'+id+'-footprint',filter:'url(#'+id+'-inset)'},inner);
 el('rect',{x:0,y:0,width:w,height:h,fill:'url(#mapTexture-'+(n.wall_texture||'stone')+')',mask:'url(#'+id+'-outer)'},group);
 const floors=el('g',{mask:'url(#'+id+'-floor)'},group);n.building_shapes.forEach(s=>el('path',{d:path(s),fill:'url(#mapTexture-'+(s.floor_texture||n.floor_texture||'wood')+')'},floors));
 }
 function smoothLine(points,tolerance=4){
   if(points.length<3)return points;
   const simplify=p=>{if(p.length<3)return p;let max=0,index=0;for(let i=1;i<p.length-1;i++){const d=segment(p[i],p[0],p.at(-1));if(d>max){max=d;index=i;}}return max>tolerance?[...simplify(p.slice(0,index+1)).slice(0,-1),...simplify(p.slice(index))]:[p[0],p.at(-1)];};
   const p=simplify(points),result=[p[0]];for(let i=0;i<p.length-1;i++){const a=p[i],b=p[i+1];result.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25],[a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75]);}result.push(p.at(-1));return result.length>1000?Array.from({length:1000},(_,i)=>result[Math.round(i*(result.length-1)/999)]):result;
 }
 function wallPoint(n,p){const a=-(n.rotation||0)*Math.PI/180,x=p.x-n.x-n.w/2,y=p.y-n.y-n.h/2;return [(x*Math.cos(a)-y*Math.sin(a)+n.w/2)*(n.wall_base_w||n.w)/n.w,(x*Math.sin(a)+y*Math.cos(a)+n.h/2)*(n.wall_base_h||n.h)/n.h];}
 function wallsWorld(n){const a=(n.rotation||0)*Math.PI/180;return (n.interior_walls||[]).map(line=>line.map(([x,y])=>{x=x*n.w/(n.wall_base_w||n.w)-n.w/2;y=y*n.h/(n.wall_base_h||n.h)-n.h/2;return [n.x+n.w/2+x*Math.cos(a)-y*Math.sin(a),n.y+n.h/2+x*Math.sin(a)+y*Math.cos(a)];}));}
 function carryWalls(target,members){const lines=members.flatMap(wallsWorld);return ()=>{if(lines.length){target.interior_walls=lines.map(line=>line.map(([x,y])=>[x-target.x,y-target.y]));target.wall_base_w=target.w;target.wall_base_h=target.h;}};}
 function eraseWalls(nodes,center,radius){
   for(const n of nodes){
     if(!MapArt.buildings.includes(n.type)||n.locked||n.hidden||!n.interior_walls?.length)continue;
     const cut=radius+(n.wall_width||12)/2,lines=[];let touched=false;
     for(const line of wallsWorld(n)){
       let part=[];
       const finish=()=>{if(part.length>1)lines.push(part);part=[];};
       for(let i=1;i<line.length;i++){
         const a=line[i-1],b=line[i],dx=b[0]-a[0],dy=b[1]-a[1],ox=a[0]-center.x,oy=a[1]-center.y,A=dx*dx+dy*dy;
         if(A<1e-12)continue;
         const B=2*(ox*dx+oy*dy),C=ox*ox+oy*oy-cut*cut,D=B*B-4*A*C,ts=[0,1];
         if(D>0)for(const t of [(-B-Math.sqrt(D))/(2*A),(-B+Math.sqrt(D))/(2*A)])if(t>0&&t<1)ts.push(t);
         ts.sort((a,b)=>a-b);
         for(let j=1;j<ts.length;j++){
           const lo=ts[j-1],hi=ts[j],mid=(lo+hi)/2;
           if(Math.hypot(ox+dx*mid,oy+dy*mid)<cut){touched=true;finish();continue;}
           const start=[a[0]+dx*lo,a[1]+dy*lo],end=[a[0]+dx*hi,a[1]+dy*hi];
           if(part.length&&dist(part.at(-1),start)>1e-6)finish();
           if(!part.length)part.push(start);part.push(end);
         }
       }
       finish();
     }
     if(touched&&lines.length<=100&&lines.every(line=>line.length<=1000)&&lines.reduce((sum,l)=>sum+l.length,0)<=12000)n.interior_walls=lines.map(line=>line.map(([x,y])=>wallPoint(n,{x,y})));
   }
   return nodes;
 }
 function renderWalls(n,g,el){if(!n.interior_walls?.length)return;const id='inner-wall-'+n.id.replace(/[^a-zA-Z0-9_-]/g,''),defs=el('defs',{},g),clip=el('clipPath',{id,clipPathUnits:'userSpaceOnUse'},defs),sx=n.w/(n.room_base_w||n.w),sy=n.h/(n.room_base_h||n.h);for(const s of shapes(n))el('path',{d:s.points.map(([x,y],i)=>(i?'L':'M')+(x*sx)+' '+(y*sy)).join(' ')+' Z'},clip);const group=el('g',{'clip-path':'url(#'+id+')','data-interior-walls':'true'},g);for(const line of n.interior_walls)el('path',{d:line.map(([x,y],i)=>(i?'L':'M')+(x*n.w/(n.wall_base_w||n.w))+' '+(y*n.h/(n.wall_base_h||n.h))).join(' '),fill:'none',stroke:'url(#mapTexture-'+(n.wall_texture||'stone')+')','stroke-width':n.wall_width||12,'stroke-linecap':'round','stroke-linejoin':'round'},group);}
 window.MapBuildingCurves={outline,merge,render,world,wallPoint,carryWalls,renderWalls,smoothLine,eraseWalls};
})();
