/* Surface pixel shading runs independently of navigation and token animation. */
const bases=new Map();
self.onmessage=({data:t})=>{
 try{
  if(t.base)bases.set(t.baseKey,t.base);
  for(const key of t.drop||[])bases.delete(key);
  const {pixels,normals}=bases.get(t.baseKey),size=t.size,p=t.profile,out=new Uint8ClampedArray(pixels.length),lx=Math.cos(p.angle)*.8,ly=Math.sin(p.angle)*.8;
  for(let i=0;i<pixels.length/4;i++){
   const offset=i*4;if(!pixels[offset+3])continue;
   const nx=normals[i*2]*p.height,ny=normals[i*2+1]*p.height,dot=(nx*lx+ny*ly+.7)/Math.hypot(nx,ny,1),shade=.8+p.strength*(dot-.38)*.85;
   for(let ch=0;ch<3;ch++)out[offset+ch]=Math.min(255,pixels[offset+ch]*shade*p.color[ch]);out[offset+3]=pixels[offset+3];
  }
  const canvas=new OffscreenCanvas(size,size);canvas.getContext('2d').putImageData(new ImageData(out,size,size),0,0);const bitmap=canvas.transferToImageBitmap();self.postMessage({id:t.id,bitmap},[bitmap]);
 }catch(error){self.postMessage({id:t.id,error:String(error)});}
};
