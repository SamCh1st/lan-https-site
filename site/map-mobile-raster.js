/* Flatten expensive SVG layers on touch devices; keep map coordinates and input on SVG. */
(function(){
  const mobile=matchMedia('(pointer: coarse)').matches||(/iPhone|iPad|iPod/.test(navigator.userAgent))||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  window.MapMobileMode=mobile;
  if(mobile)document.documentElement.classList.add('map-mobile-performance');
  let queue=[],working=false,epoch=0,definitions='',source=null,definitionKey='';
  const ns='http://www.w3.org/2000/svg';
  function prepare(svg,key){if(!mobile||source===svg&&definitionKey===key)return;source=svg;definitionKey=key;definitions=[...svg.querySelectorAll(':scope > defs')].map(n=>new XMLSerializer().serializeToString(n)).join('');}
  function reset(){epoch++;queue=[];definitions='';source=null;definitionKey='';}
  function bake(n,g){if(g.hasAttribute('data-live-material')||g.querySelector('[data-map-sprite],[data-ambience-batch],[data-folder-batch],[data-fitted-roof],foreignObject'))return;if(mobile)g.querySelectorAll('[filter]').forEach(node=>{if(/mapStampShadow|mapGroundShadow/.test(node.getAttribute('filter')))node.removeAttribute('filter');});if(!mobile||!g.querySelector('[mask],[filter]')||g._rasterPending===g._mapKey)return;g._rasterPending=g._mapKey;queue.push({g,key:g._mapKey,epoch,defs:definitions});run();}
  async function run(){if(working||!queue.length)return;working=true;const task=queue.shift(),g=task.g;let url;
    try{
      if(!g.isConnected||task.epoch!==epoch||g._mapKey!==task.key)return;
      const box=g.getBBox(),pad=12,w=Math.max(1,box.width+pad*2),h=Math.max(1,box.height+pad*2),scale=Math.min(Math.max(1,Math.abs(source?.getScreenCTM()?.a||1)),1024/Math.max(w,h)),width=Math.max(1,Math.ceil(w*scale)),height=Math.max(1,Math.ceil(h*scale)),copy=g.cloneNode(true);
      copy.style.removeProperty('visibility');copy.removeAttribute('transform');copy.removeAttribute('opacity');copy.removeAttribute('data-raster-pending');
      const markup='<svg xmlns="'+ns+'" width="'+width+'" height="'+height+'" viewBox="'+[box.x-pad,box.y-pad,w,h].join(' ')+'">'+task.defs+new XMLSerializer().serializeToString(copy)+'</svg>';
      url=URL.createObjectURL(new Blob([markup],{type:'image/svg+xml'}));const img=new Image();img.src=url;await img.decode();
      if(!g.isConnected||task.epoch!==epoch||g._mapKey!==task.key)return;
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(img,0,0,width,height);
      const bitmap=document.createElementNS(ns,'image');for(const [k,v] of Object.entries({x:box.x-pad,y:box.y-pad,width:w,height:h,href:canvas.toDataURL('image/png'),preserveAspectRatio:'none','data-mobile-raster':'true'}))bitmap.setAttribute(k,v);
      g.replaceChildren(bitmap);canvas.width=canvas.height=1;
    }catch(error){/* Retain the original artwork if this browser cannot rasterize a layer. */}
    finally{if(g._mapKey===task.key)g.style.removeProperty('visibility');if(url)URL.revokeObjectURL(url);working=false;if(queue.length)setTimeout(run,32);}
  }
  window.MapMobileRaster={prepare,bake,reset};
})();
