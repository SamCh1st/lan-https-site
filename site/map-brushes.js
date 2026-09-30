/* Connected brush strokes share a single mask, fill and outside border. */
(function(){
  const pieces=n=>n.strokes||[{points:n.points,brush:n.brush||40,softness:n.softness??.55}];
  const transformPoint=(m,[x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
  const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
  function bounds(p,padding=1){const m=p.transform||[1,0,0,1,0,0],points=p.points.map(v=>transformPoint(m,v)),xs=points.map(v=>v[0]),ys=points.map(v=>v[1]),rx=p.brush/2*Math.hypot(m[0],m[2])*padding,ry=p.brush/2*Math.hypot(m[1],m[3])*padding;return [Math.min(...xs)-rx,Math.min(...ys)-ry,Math.max(...xs)+rx,Math.max(...ys)+ry];}
  const collision=p=>{const m=p.transform||[1,0,0,1,0,0];return {...p,transform:undefined,points:p.points.map(v=>transformPoint(m,v)),brush:p.brush*Math.max(Math.hypot(m[0],m[1]),Math.hypot(m[2],m[3]))};};
  function pointSegment(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  function touches(a,b){a=collision(a);b=collision(b);const x=bounds(a),y=bounds(b);if(x[2]<y[0]||y[2]<x[0]||x[3]<y[1]||y[3]<x[1])return false;
    const r=(a.brush+b.brush)/2,A=a.points.length>1?a.points:[a.points[0],a.points[0]],B=b.points.length>1?b.points:[b.points[0],b.points[0]];
    for(let i=1;i<A.length;i++)for(let j=1;j<B.length;j++){const p=A[i-1],q=A[i],s=B[j-1],t=B[j];if(Math.max(p[0],q[0])+r<Math.min(s[0],t[0])||Math.max(s[0],t[0])+r<Math.min(p[0],q[0])||Math.max(p[1],q[1])+r<Math.min(s[1],t[1])||Math.max(s[1],t[1])+r<Math.min(p[1],q[1]))continue;const crosses=cross(p,q,s)*cross(p,q,t)<0&&cross(s,t,p)*cross(s,t,q)<0;if(crosses||Math.min(pointSegment(p,s,t),pointSegment(q,s,t),pointSegment(s,p,q),pointSegment(t,p,q))<=r)return true;}
    return false;
  }
  function world(n){const angle=(n.rotation||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),sx=n.w/(n.baseW||n.w),sy=n.h/(n.baseH||n.h),m=[c*sx,s*sx,-s*sy,c*sy,n.x+n.w/2-c*n.w/2+s*n.h/2,n.y+n.h/2-s*n.w/2-c*n.h/2];return pieces(n).map(p=>({...p,transform:multiply(m,p.transform||[1,0,0,1,0,0])}));}
  function merge(nodes,node){if(node.light_enabled||node.locked||node.erasures?.length||!node.points||(node.contents||[]).length)return nodes;let all=world(node),matched=new Set([node.id]),again=true;
    while(again){again=false;for(const n of nodes){if(n.erasures?.length||matched.has(n.id)||n.type!==node.type||(n.walk_over!==false)!==(node.walk_over!==false)||(n.type==='river'&&((n.flow_x??0)!==(node.flow_x??0)||(n.flow_y??1)!==(node.flow_y??1)))||n.light_enabled||(n.part_card_id||null)!==(node.part_card_id||null)||(n.part_image_id||null)!==(node.part_image_id||null)||(n.folder_id||'')!==(node.folder_id||'')||n.shape!=='stroke'||n.locked||(n.contents||[]).length||!!n.border!==!!node.border||(n.opacity??1)!==(node.opacity??1)||(n.effects!==false)!==(node.effects!==false)||n.hidden)continue;const next=world(n);if(all.length+next.length>100||all.reduce((sum,p)=>sum+p.points.length,0)+next.reduce((sum,p)=>sum+p.points.length,0)>12000)continue;if(next.some(p=>all.some(q=>touches(p,q)))){all.push(...next);matched.add(n.id);again=true;}}}
    if(matched.size===1)return nodes;
    const boxes=all.map(bounds),x=Math.min(...boxes.map(b=>b[0])),y=Math.min(...boxes.map(b=>b[1]));node.x=x;node.y=y;node.w=Math.max(...boxes.map(b=>b[2]))-x;node.h=Math.max(...boxes.map(b=>b[3]))-y;node.baseW=node.w;node.baseH=node.h;node.rotation=0;
    node.strokes=all.map(p=>({...p,transform:[...p.transform.slice(0,4),p.transform[4]-x,p.transform[5]-y]}));node.points=node.strokes[0].points;
    return nodes.filter(n=>!matched.has(n.id)||n.id===node.id);
  }
  window.MapBrushes={merge,pieces,bounds};
})();
