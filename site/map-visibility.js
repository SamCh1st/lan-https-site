/* Conservative viewport bounds and a bounded spatial grid for light queries. */
(function(){
 const intersects=(a,b)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minY<=b.maxY&&a.maxY>=b.minY;
 function viewport(svg,padding=80){
  const box=svg.getBoundingClientRect(),matrix=svg.getScreenCTM();if(!matrix)return null;
  const inverse=matrix.inverse(),a=new DOMPoint(box.left-padding,box.top-padding).matrixTransform(inverse),b=new DOMPoint(box.right+padding,box.bottom+padding).matrixTransform(inverse);
  return {minX:Math.min(a.x,b.x),minY:Math.min(a.y,b.y),maxX:Math.max(a.x,b.x),maxY:Math.max(a.y,b.y)};
 }
 function bounds(n){
  const a=(n.rotation||0)*Math.PI/180,c=Math.abs(Math.cos(a)),s=Math.abs(Math.sin(a));
  // Include outlines, brush feathering, labels and handles beyond the part's box.
  const pad=Math.max(40,(n.brush||0)*Math.max(n.w/(n.baseW||n.w),n.h/(n.baseH||n.h))*.75),rx=c*n.w/2+s*n.h/2+pad,ry=s*n.w/2+c*n.h/2+pad;
  return {minX:n.x+n.w/2-rx,maxX:n.x+n.w/2+rx,minY:n.y+n.h/2-ry,maxY:n.y+n.h/2+ry};
 }
 function index(items,getBounds){
  const cells=new Map(),large=[],size=256,boxes=new Map();
  for(const item of items){const b=getBounds(item);boxes.set(item,b);const x0=Math.floor(b.minX/size),x1=Math.floor(b.maxX/size),y0=Math.floor(b.minY/size),y1=Math.floor(b.maxY/size);
   if((x1-x0+1)*(y1-y0+1)>256){large.push(item);continue;}
   for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const key=x+':'+y;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(item);}
  }
  return {query(b){const found=new Set(large),x0=Math.floor(b.minX/size),x1=Math.floor(b.maxX/size),y0=Math.floor(b.minY/size),y1=Math.floor(b.maxY/size);
   if((x1-x0+1)*(y1-y0+1)>4096)return items.filter(i=>intersects(boxes.get(i),b));
   for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(const item of cells.get(x+':'+y)||[])found.add(item);
   return [...found].filter(i=>intersects(boxes.get(i),b));
  }};
 }
 window.MapVisibility={intersects,viewport,bounds,index};
})();
