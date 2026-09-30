/* Uploaded part artwork shares the same cached relief and silhouette pipeline. */
(function(){
 const images=new Map(),bitmaps=new Map();
 function load(id){if(!images.has(id)){const image=new Image();image.src='/api/uploads/'+Number(id);images.set(id,image.decode().then(()=>image));}return images.get(id);}
 function bitmap(n,size=256){const key=[n.part_image_id,size,(n.w/n.h).toFixed(3)].join(':');if(!bitmaps.has(key))bitmaps.set(key,load(n.part_image_id).then(img=>{const c=document.createElement('canvas');c.width=c.height=size;const scale=Math.min(n.w/img.naturalWidth,n.h/img.naturalHeight),w=img.naturalWidth*scale/n.w*size,h=img.naturalHeight*scale/n.h*size;c.getContext('2d').drawImage(img,(size-w)/2,(size-h)/2,w,h);return c;}));if(bitmaps.size>256)bitmaps.delete(bitmaps.keys().next().value);return bitmaps.get(key);}
 function render(n,g,el){
  if(!n.part_image_id||!MapArt.stamps.includes(n.type)||MapArt.buildings.includes(n.type))return false;
  const image=el('image',{href:'/api/uploads/'+n.part_image_id,width:n.w,height:n.h,preserveAspectRatio:'xMidYMid meet','data-part-image':n.part_image_id},g);let version=0;
  const refresh=()=>{const current=++version;if(MapPartProfiles.isLight(n))return;MapSurfaceLighting.image(n).then(async url=>{if(!url)return;const decoded=new Image();decoded.src=url;await decoded.decode();if(image.isConnected&&current===version){image.setAttribute('href',url);image.setAttribute('preserveAspectRatio','none');image.dataset.heightLit='true';}}).catch(()=>{});};
  MapSurfaceLighting.watch(image,refresh);refresh();return true;
 }
 function texture(n,g,el){if(!n.part_image_id)return null;const id='map-part-image-'+String(n.id).replace(/[^a-zA-Z0-9_-]/g,''),defs=el('defs',{},g),pattern=el('pattern',{id,width:160,height:160,patternUnits:'userSpaceOnUse'},defs);el('image',{href:'/api/uploads/'+n.part_image_id,width:160,height:160,preserveAspectRatio:'none'},pattern);if(n.effects!==false&&['water','river','lava','swamp','arcane'].includes(n.type))el('animateTransform',{attributeName:'patternTransform',type:'translate',from:'0 0',to:'160 160',dur:'24s',repeatCount:'indefinite'},pattern);return id;}
 window.MapPartImages={load,bitmap,render,texture};
})();
