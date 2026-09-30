/* Alpha-masked heightmaps: each merged strip carries its own elevation. */
(function(){
 const cache=new Map(),queue=[];let working=false;
 function coarse(heights,size,levels,target){const rects=[],active=new Map();for(let y=0;y<target;y++){const row=[];for(let x=0;x<target;x++){let value=0;for(let yy=Math.floor(y*size/target);yy<Math.ceil((y+1)*size/target);yy++)for(let xx=Math.floor(x*size/target);xx<Math.ceil((x+1)*size/target);xx++)value=Math.max(value,heights[yy*size+xx]/levels);row.push(Math.ceil(value*4));}const next=new Map();for(let x=0;x<target;){const level=row[x];if(!level){x++;continue;}const start=x;while(x<target&&row[x]===level)x++;const key=[start,x,level].join(':'),previous=active.get(key);if(previous){previous[3]++;next.set(key,previous);}else{const rect=[start,y,x-start,1,level/4];rects.push(rect);next.set(key,rect);}}active.clear();for(const [k,v] of next)active.set(k,v);}return rects.map(([x,y,w,h,z])=>[x/target,y/target,w/target,h/target,z]);}
 // A few nested height contours keep canopy shadows independent of leaf count.
 function bands(heights,size,levels){const result=[];for(const elevation of [.15,.5,.85,1.15]){const points=[];for(let y=0;y<size;y++){let left=size,right=-1;for(let x=0;x<size;x++)if(heights[y*size+x]/levels>=elevation){left=Math.min(left,x);right=x;}if(right>=0)points.push([left/size,y/size],[(right+1)/size,(y+1)/size]);}if(points.length<3)continue;points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const half=list=>{const out=[];for(const p of list){while(out.length>1){const a=out.at(-2),b=out.at(-1);if((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])>0)break;out.pop();}out.push(p);}out.pop();return out;};result.push({points:[...half(points),...half(points.slice().reverse())],elevation});}return result;}
 function request(node,ready,resolution=64){
  const image=node.part_image_id||node.shadow_image_id||node.marker_card?.content?.image_id;
  const tiled=MapTiledParts.types.includes(node.type);
  const baseKey=image?'image:'+image+':'+(node.w/node.h).toFixed(3):'stamp:'+node.type+(tiled?':'+node.w+':'+node.h:'');
  const key=baseKey+':quality:'+resolution;let entry=cache.get(key);
  if(!entry){entry={rects:null,listeners:new Set()};cache.set(key,entry);queue.push({node:{...node},image,key,entry,tiled,resolution});run();}
  if(entry.rects===null){entry.listeners.add(ready);for(const fallback of [96,64]){const previous=cache.get(baseKey+':quality:'+fallback);if(fallback<resolution&&previous?.rects?.length)return previous.rects;}}
  return entry.rects;
 }
 async function run(){if(working||!queue.length)return;working=true;const task=queue.shift();let url;
  try{
   const image=new Image(),size=task.resolution,canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d',{willReadFrequently:true});
   if(task.image){image.src='/api/uploads/'+encodeURIComponent(task.image);await image.decode();const ratio=task.node.w/task.node.h,fit=Math.min(task.node.w/image.naturalWidth,task.node.h/image.naturalHeight),iw=image.naturalWidth*fit/task.node.w*size,ih=image.naturalHeight*fit/task.node.h*size;ctx.drawImage(image,(size-iw)/2,(size-ih)/2,iw,ih);}
   else if(!task.tiled&&window.MapSprites?.has(task.node.type)){const atlas=await MapSprites.load(task.node.type);MapSprites.draw(ctx,task.node.type,atlas,size);}
   else{
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),g=document.createElementNS(ns,'g'),w=task.tiled?task.node.w:100,h=task.tiled?task.node.h:100;
    svg.setAttribute('width',size);svg.setAttribute('height',size);svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.append(g);MapArt.render({...task.node,id:'silhouette',x:0,y:0,w,h,rotation:0,opacity:1,instances:undefined,_silhouette:true},g);
    for(const el of g.querySelectorAll('*')){el.removeAttribute('filter');for(const attr of ['fill','stroke'])if(el.getAttribute(attr)?.startsWith('url(')&&!g.querySelector('#'+el.getAttribute(attr).slice(5,-1)))el.setAttribute(attr,'#fff');}
    url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));image.src=url;await image.decode();ctx.drawImage(image,0,0,size,size);
   }
   const pixels=ctx.getImageData(0,0,size,size).data,heights=new Uint8Array(size*size),rects=[],active=new Map(),preview=ctx.createImageData(size,size),levels=size>=96?12:6;
   for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=y*size+x;if(pixels[i*4+3]<32)continue;const value=task.image?(MapPartProfiles.height(task.node.type,(x+.5)/size,(y+.5)/size)*.8+(pixels[i*4]*.21+pixels[i*4+1]*.72+pixels[i*4+2]*.07)/255*.2):MapPartProfiles.height(task.node.type,(x+.5)/size,(y+.5)/size);heights[i]=Math.ceil(value*levels);const shade=Math.round(heights[i]/(levels*1.5)*255);preview.data.set([shade,shade,shade,255],i*4);}
   for(let y=0;y<size;y++){const next=new Map();for(let x=0;x<size;){const elevation=heights[y*size+x];if(!elevation){x++;continue;}const start=x;while(x<size&&heights[y*size+x]===elevation)x++;const key=start+':'+x+':'+elevation,prior=active.get(key);if(prior){prior[3]++;next.set(key,prior);}else{const r=[start,y,x-start,1,elevation/levels];rects.push(r);next.set(key,r);}}active.clear();for(const [k,v] of next)active.set(k,v);}
   task.entry.rects=rects.map(([x,y,w,h,elevation])=>[x/size,y/size,w/size,h/size,elevation]);task.entry.rects.resolution=size;
   // A shadow cutout must stay inside the opaque artwork. Reusing its soft alpha
   // fringe clears shadows from exposed floor and creates a bright outline when
   // the low-resolution mask is enlarged. Erode one texel and feather inward.
   const alpha=document.createElement('canvas');alpha.width=alpha.height=size;const ac=alpha.getContext('2d'),cutout=ac.createImageData(size,size);
   for(let y=1;y<size-1;y++)for(let x=1;x<size-1;x++){let opacity=255;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)opacity=Math.min(opacity,pixels[((y+dy)*size+x+dx)*4+3]);const i=(y*size+x)*4;cutout.data[i+3]=Math.max(0,(opacity-192)*255/63);}
   ac.putImageData(cutout,0,0);task.entry.rects.alpha=alpha;task.entry.rects.bands=bands(heights,size,levels);task.entry.rects.coarse16=coarse(heights,size,levels,16);task.entry.rects.coarse32=coarse(heights,size,levels,32);ctx.putImageData(preview,0,0);task.entry.heightmap=canvas.toDataURL();canvas.width=canvas.height=1;
  }catch{task.entry.rects=[];/* A missing image casts no invented rectangle. */}
  finally{if(url)URL.revokeObjectURL(url);for(const ready of task.entry.listeners)ready();task.entry.listeners.clear();working=false;if(cache.size>256){for(const [key,value] of cache){if(value.rects!==null&&key!==task.key){cache.delete(key);break;}}}if(queue.length)setTimeout(run,16);}
 }
 window.MapSilhouettes={request,heightmap:(type,resolution=64)=>cache.get('stamp:'+type+':quality:'+resolution)?.heightmap};
})();
