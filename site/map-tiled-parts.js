/* Structural stamps repeat in map units, keeping planks, steps and bars proportional. */
(function(){
 const types=['bridge','rope_bridge','stairs','portcullis','timber_fence'];
 function render(n,g,el){if(!types.includes(n.type))return false;
 const w=n.w,h=n.h,defs=el('defs',{},g),id='structure-'+n.id.replace(/[^a-zA-Z0-9_-]/g,''),group=el('g',{'data-tiled-part':n.type},g);
 if(n.type==='timber_fence'){
   for(const y of [h*.27,h*.7]){el('rect',{x:0,y,width:w,height:Math.min(8,h*.12),fill:'url(#mapTexture-wood)',stroke:'#453a29','stroke-width':1},group);}
   const posts=el('pattern',{id,width:32,height:Math.max(1,h),patternUnits:'userSpaceOnUse'},defs);
   el('rect',{x:5,y:0,width:8,height:h,rx:1,fill:'url(#mapTexture-wood)',stroke:'#51412e','stroke-width':1},posts);
   for(const y of [h*.31,h*.74])el('circle',{cx:9,cy:y,r:1.4,fill:'#333e35'},posts);
   el('rect',{width:w,height:h,fill:'url(#'+id+')'},group);return true;
 }
 if(n.type==='portcullis'){
   const pattern=el('pattern',{id,width:16,height:Math.max(1,h),patternUnits:'userSpaceOnUse'},defs);
   el('rect',{x:6,y:0,width:4,height:h,fill:'#899b92',stroke:'#3b4942','stroke-width':1},pattern);
   el('rect',{x:5,y:0,width:Math.max(0,w-10),height:h,fill:'url(#'+id+')'},group);
   for(const y of [Math.min(12,h*.25),Math.max(0,h-Math.min(12,h*.25)-4)])el('rect',{x:0,y,width:w,height:4,fill:'#52665b',stroke:'#273a30','stroke-width':1},group);
   for(const x of [0,Math.max(0,w-7)])el('rect',{x,y:0,width:7,height:h,fill:'url(#mapTexture-stone)'},group);
   return true;
 }
 const stair=n.type==='stairs',rope=n.type==='rope_bridge',rail=Math.min(stair?6:8,w*.15),pad=rail+3,pitch=stair?14:12,deck=Math.max(1,w-2*pad);
 const pattern=el('pattern',{id,x:pad,y:0,width:deck,height:pitch,patternUnits:'userSpaceOnUse'},defs);
 el('rect',{x:0,y:0,width:deck,height:pitch,fill:stair?'url(#mapTexture-stone)':'url(#mapTexture-wood)'},pattern);
 el('rect',{x:0,y:0,width:deck,height:2,fill:stair?'#b7bba6':'#bb9562'},pattern);
 el('rect',{x:0,y:pitch-2,width:deck,height:2,fill:stair?'#485449':'#493c2b'},pattern);
 if(!stair)for(const x of [3,Math.max(3,deck-4)])el('circle',{cx:x,cy:pitch/2,r:1.2,fill:'#373c30'},pattern);
 el('rect',{x:pad,y:0,width:deck,height:h,fill:'url(#'+id+')'},group);
 for(const x of [rail/2,w-rail/2])el('path',{d:`M${x} 0V${h}`,fill:'none',stroke:stair?'#7e897b':rope?'#bbaa7c':'#6b5235','stroke-width':rope?3:rail},group);
 if(rope){const knots=el('pattern',{id:id+'-knots',width:w,height:24,patternUnits:'userSpaceOnUse'},defs);for(const x of [rail/2,w-rail/2])el('path',{d:`M${x-2} 5l4 4m-4 0 4-4`,stroke:'#dfcba0','stroke-width':2},knots);el('rect',{width:w,height:h,fill:'url(#'+id+'-knots)','pointer-events':'none'},group);}
 return true;
 }
 window.MapTiledParts={types,render};
})();
