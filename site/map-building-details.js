/* Architectural kit pieces follow corners, wall lengths and roof footprints. */
(function(){
 const NS='http://www.w3.org/2000/svg',unit=(a,b)=>{const d=Math.hypot(b[0]-a[0],b[1]-a[1])||1;return [(b[0]-a[0])/d,(b[1]-a[1])/d];};
 const area=pts=>pts.reduce((a,p,i)=>{const q=pts[(i+1)%pts.length];return a+p[0]*q[1]-p[1]*q[0];},0);
 function entrance(pts){let best=-1,result;pts.forEach((a,i)=>{const b=pts[(i+1)%pts.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len>best){best=len;result={edge:i,center:[(a[0]+b[0])/2,(a[1]+b[1])/2],u:unit(a,b),width:Math.min(48,len*.35)};}});return result;}
 function stamp(type,p,w,g,el,angle=0){const group=el('g',{transform:`translate(${p[0]} ${p[1]}) rotate(${angle})`,'data-building-detail':type},g);el('image',{href:'/assets/map-art/items/'+type+'.png',x:-w/2,y:-w/2,width:w,height:w,preserveAspectRatio:'xMidYMid meet'},group);return group;}
 function walls(n,points,g,el,trimGroup=g){const sign=Math.sign(area(points)),door=entrance(points),t=n.wall_width||12,details=n.building_details!==false;
  if(details){
   // Corner joints are cut into the same wall surface, never overlaid with unrelated props.
   points.forEach((p,i)=>{const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length],u=unit(p,b),v=unit(p,a);if(Math.abs(u[0]*v[1]-u[1]*v[0])<.3)return;const size=Math.min(t*1.6,Math.hypot(b[0]-p[0],b[1]-p[1])*.35,Math.hypot(a[0]-p[0],a[1]-p[1])*.35),first=[p[0]+u[0]*size,p[1]+u[1]*size],second=[p[0]+v[0]*size,p[1]+v[1]*size];el('path',{d:`M${first} l${-u[1]*sign*t} ${u[0]*sign*t} M${second} l${v[1]*sign*t} ${-v[0]*sign*t}`,fill:'none',stroke:'#29251f','stroke-opacity':.35,'stroke-width':.6,'data-building-detail':'masonry-corner'},trimGroup);});
   const inset=t*.82,inside=MapSplineTextures.ribbon(points,inset*2,true).slice(0,-1).map(s=>sign>0?s.left:s.right);MapSplineTextures.paint(inside,3,true,'wood','mapTexture-wood',trimGroup,el,'plate-'+n.id);
   points.forEach((a,i)=>{const b=points[(i+1)%points.length],u=unit(a,b),length=Math.hypot(b[0]-a[0],b[1]-a[1]),count=Math.min(12,Math.floor(length/120));for(let j=0;j<count;j++){const d=(j+1)*length/(count+1);if(n.building_entry!==false&&i===door.edge&&Math.abs(d-length/2)<55)continue;stamp('kit_window_wall',[a[0]+u[0]*d-u[1]*sign*t*.5,a[1]+u[1]*d+u[0]*sign*t*.5],54,g,el,Math.atan2(u[1],u[0])*180/Math.PI);}
   });
  }
  if(n.building_entry!==false){const {center:c,u,width}=door,v=[-u[1]*sign,u[0]*sign],hinge=[c[0]-u[0]*width/2,c[1]-u[1]*width/2];const leaf=[[hinge[0],hinge[1]],[hinge[0]+v[0]*width,hinge[1]+v[1]*width]];MapSplineTextures.paint(leaf,5,false,'wood','mapTexture-wood',g,el,'door-leaf-'+n.id);for(const side of [-1,1])stamp('stone_pillar',[c[0]+u[0]*width/2*side,c[1]+u[1]*width/2*side],t*1.4,g,el);const threshold=el('path',{d:'M'+[c[0]-u[0]*width/2,c[1]-u[1]*width/2].join(' ')+' L'+[c[0]+u[0]*width/2,c[1]+u[1]*width/2].join(' '),stroke:'url(#mapTexture-wood)','stroke-width':3,'data-building-detail':'doorway'},g);}
 }
 function roofs(n,points,g,el){if(n.building_details===false)return;
  MapSplineTextures.paint(points,7,true,'wood','mapTexture-wood',g,el,'fascia-'+n.id);
  if(n.roof_chimney===false)return;const inside=(p)=>{let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
  let best=null,clearance=0;for(let x=1;x<7;x++)for(let y=1;y<7;y++){const p=[n.w*x/7,n.h*y/7];if(!inside(p))continue;const d=Math.min(...points.map((a,i)=>{const b=points[(i+1)%points.length],u=unit(a,b),len=Math.hypot(b[0]-a[0],b[1]-a[1]),t=Math.max(0,Math.min(len,(p[0]-a[0])*u[0]+(p[1]-a[1])*u[1]));return Math.hypot(p[0]-a[0]-t*u[0],p[1]-a[1]-t*u[1]);}));const score=d-Math.hypot(p[0]-n.w*.35,p[1]-n.h*.4)*.25;if(score>clearance){clearance=score;best=p;}}if(best&&clearance>22)stamp('kit_chimney',best,28,g,el);
 }
 window.MapBuildingDetails={entrance,walls,roofs};
})();
