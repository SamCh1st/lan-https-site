/* Fit roof courses to the nearest eave. Work stays off the navigation thread. */
self.onmessage=({data:j})=>{
 const {width,height,worldW,worldH,points,texture,textureSize,repeat,lighting}=j,edges=points.map((a,i)=>{const b=points[(i+1)%points.length],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;return {a,b,dx,dy,len,nx:dx/len,ny:dy/len};}),out=new Uint8ClampedArray(width*height*4),scaleX=worldW/width,scaleY=worldH/height,light=lighting.angle;
 const wrap=v=>((Math.floor(v)%textureSize)+textureSize)%textureSize;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const px=(x+.5)*scaleX,py=(y+.5)*scaleY;let inside=false,best=Infinity,second=Infinity,edge,along=0,normalX=0,normalY=0;
  for(const e of edges){if((e.a[1]>py)!==(e.b[1]>py)&&px<(e.b[0]-e.a[0])*(py-e.a[1])/(e.b[1]-e.a[1])+e.a[0])inside=!inside;
   const u=(px-e.a[0])*e.nx+(py-e.a[1])*e.ny,t=Math.max(0,Math.min(e.len,u)),dx=px-e.a[0]-t*e.nx,dy=py-e.a[1]-t*e.ny,d=dx*dx+dy*dy;
   if(d<best){second=best;best=d;edge=e;along=u;const len=Math.sqrt(d)||1;normalX=-dx/len;normalY=-dy/len;}else if(d<second)second=d;
  }
  if(!inside)continue;const distance=Math.sqrt(best),ridge=Math.sqrt(second)-distance,tx=wrap(along/repeat*textureSize),ty=wrap(distance*1.4/repeat*textureSize),src=(ty*textureSize+tx)*4,dest=(y*width+x)*4;
  const slope=.6*lighting.height,normalLength=Math.hypot(slope,1),nx=normalX*slope/normalLength,ny=normalY*slope/normalLength,nz=1/normalLength;
  const dot=nx*Math.cos(light)*.65+ny*Math.sin(light)*.65+nz*.76;
  let shade=.72+lighting.strength*(Math.max(0,dot)-.35)*.65;
  if(ridge<1.3&&distance>5)shade*=1.08;
  if(distance<1)shade*=.84;
  const illumination=[shade,shade,shade];
  for(const lamp of lighting.lights||[]){const dx=lamp.x-px,dy=lamp.y-py,dist=Math.hypot(dx,dy),falloff=Math.max(0,1-dist/lamp.radius);if(!falloff)continue;const z=60,len=Math.hypot(dx,dy,z),facing=Math.max(0,(nx*dx+ny*dy+nz*z)/len),power=falloff*falloff*lamp.power*facing*.8;for(let c=0;c<3;c++)illumination[c]+=power*lamp.color[c];}
  for(let c=0;c<3;c++)out[dest+c]=Math.min(255,texture[src+c]*illumination[c]);out[dest+3]=Math.min(255,distance/Math.max(scaleX,scaleY)*255);
 }
 self.postMessage({id:j.id,width,height,pixels:out},[out.buffer]);
};
