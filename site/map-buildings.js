/* Axis-aligned grid room unions. Walls exist only on the outer cell boundary. */
(function(){
  function rooms(n){return n.rooms||[{x:0,y:0,w:n.w,h:n.h,floor_texture:n.floor_texture||'wood',wall_texture:n.wall_texture||'stone',wall_width:n.wall_width||12}];}
  function world(n){const sx=n.w/(n.room_base_w||n.w),sy=n.h/(n.room_base_h||n.h),a=(n.rotation||0)*Math.PI/180,cx=n.x+n.w/2,cy=n.y+n.h/2;
    return rooms(n).map(r=>{const points=[[r.x,r.y],[r.x+r.w,r.y],[r.x,r.y+r.h],[r.x+r.w,r.y+r.h]].map(([x,y])=>[cx+(x*sx-n.w/2)*Math.cos(a)-(y*sy-n.h/2)*Math.sin(a),cy+(x*sx-n.w/2)*Math.sin(a)+(y*sy-n.h/2)*Math.cos(a)]);const x=Math.round(Math.min(...points.map(p=>p[0]))/40)*40,y=Math.round(Math.min(...points.map(p=>p[1]))/40)*40;return {...r,x,y,w:Math.max(40,Math.round((Math.max(...points.map(p=>p[0]))-x)/40)*40),h:Math.max(40,Math.round((Math.max(...points.map(p=>p[1]))-y)/40)*40)};});
  }
  function touches(a,b){const dx=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),dy=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);return dx>=0&&dy>=0&&dx+dy>0;}
  function merge(nodes,node){if(node.spline_kind)return nodes;if(window.MapBuildingCurves&&nodes.some(n=>n.type===node.type&&(n.building_shapes||(n.rotation||0)%90)))return MapBuildingCurves.merge(nodes,node);if(!MapArt.buildings.includes(node.type)||(node.rotation||0)%90||node.locked)return nodes;
    let joined=world(node),ids=new Set([node.id]),again=true;
    while(again){again=false;for(const other of nodes){if(other.spline_kind||ids.has(other.id)||other.type!==node.type||(other.walk_over!==false)!==(node.walk_over!==false)||(other.folder_id||'')!==(node.folder_id||'')||other.locked||(other.connected_map_id&&node.connected_map_id&&other.connected_map_id!==node.connected_map_id)||(other.rotation||0)%90||!!other.hidden!==!!node.hidden)continue;const next=world(other);if(joined.length+next.length>100)continue;if(joined.some(a=>next.some(b=>touches(a,b)))){joined.push(...next);ids.add(other.id);again=true;}}}
    if(ids.size===1)return nodes;
    if(joined.reduce((sum,r)=>sum+Math.ceil(r.w/40)*Math.ceil(r.h/40),0)>4096)return nodes;
    const x=Math.min(...joined.map(r=>r.x)),y=Math.min(...joined.map(r=>r.y)),w=Math.max(...joined.map(r=>r.x+r.w))-x,h=Math.max(...joined.map(r=>r.y+r.h))-y;
    const contents=new Map();let publicContents=true;for(const n of nodes.filter(n=>ids.has(n.id))){if((n.contents||[]).length&&!n.contents_public)publicContents=false;for(const entry of n.contents||[])contents.set(entry.record_id,Math.min(9999,(contents.get(entry.record_id)||0)+entry.quantity));if(!node.label&&n.label)node.label=n.label;if(!node.connected_map_id&&n.connected_map_id)node.connected_map_id=n.connected_map_id;}
    if(contents.size>100)return nodes;
    const finishWalls=window.MapBuildingCurves?.carryWalls(node,nodes.filter(n=>ids.has(n.id)));
    Object.assign(node,{x,y,w,h,rotation:0,room_base_w:w,room_base_h:h,rooms:joined.map(r=>({...r,x:r.x-x,y:r.y-y})),contents:[...contents].map(([record_id,quantity])=>({record_id,quantity})),contents_public:publicContents});
    finishWalls?.();return nodes.filter(n=>!ids.has(n.id)||n.id===node.id);
  }
  function render(n,g,el){const group=el('g',{transform:`scale(${n.w/(n.room_base_w||n.w)} ${n.h/(n.room_base_h||n.h)})`},g),rs=rooms(n),cells=new Map();
    for(const r of rs){el('rect',{x:r.x,y:r.y,width:r.w,height:r.h,fill:`url(#mapTexture-${r.floor_texture||n.floor_texture||'wood'})`},group);for(let x=Math.round(r.x/40);x<Math.round((r.x+r.w)/40);x++)for(let y=Math.round(r.y/40);y<Math.round((r.y+r.h)/40);y++)cells.set(x+','+y,r);}
    const boundary=[];for(const [key,r] of cells){const [x,y]=key.split(',').map(Number);for(const [dx,dy,side] of [[-1,0,'w'],[1,0,'e'],[0,-1,'n'],[0,1,'s']])if(!cells.has((x+dx)+','+(y+dy)))boundary.push({x:x*40,y:y*40,side,r});}
    const south=boundary.filter(b=>b.side==='s').sort((a,b)=>b.y-a.y||Math.abs(a.x+20-(n.room_base_w||n.w)/2)-Math.abs(b.x+20-(n.room_base_w||n.w)/2)),door=south[0];
    const walls=el('g',{filter:'url(#mapStampShadow)'},group);
    for(const b of boundary){if(b===door)continue;const t=b.r.wall_width||n.wall_width||12,attrs={x:b.x,y:b.y,width:40,height:40,fill:`url(#mapTexture-${b.r.wall_texture||n.wall_texture||'stone'})`};if(b.side==='n'||b.side==='s'){attrs.height=t;if(b.side==='s')attrs.y+=40-t;}else{attrs.width=t;if(b.side==='e')attrs.x+=40-t;}el('rect',attrs,walls);}
    // Concave joins need the wall square in the diagonally opposite floor cell.
    for(const [key,r] of cells){const [x,y]=key.split(',').map(Number),t=r.wall_width||n.wall_width||12;for(const [dx,dy] of [[-1,-1],[1,-1],[-1,1],[1,1]])if(cells.has((x+dx)+','+y)&&cells.has(x+','+(y+dy))&&!cells.has((x+dx)+','+(y+dy)))el('rect',{x:x*40+(dx>0?40-t:0),y:y*40+(dy>0?40-t:0),width:t,height:t,fill:`url(#mapTexture-${r.wall_texture||n.wall_texture||'stone'})`},walls);}
    if(door)el('path',{d:`M${door.x} ${door.y+40}v-40a40 40 0 0 1 40 40`,fill:'none',stroke:'#b79759','stroke-width':2},group);
  }
  function outline(points,type,nodes){return MapBuildingCurves.outline(points,type,nodes);}
  window.MapBuildings={merge,rooms,render,outline};
})();
