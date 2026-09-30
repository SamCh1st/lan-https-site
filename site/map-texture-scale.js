/* Per-part repeat size and photographic kit materials; source art stays shared. */
(function(){
 function apply(n,g,el){const scale=Math.max(.1,Math.min(4,n.texture_scale||1)),detailed=!!n.texture_material,root=g.ownerSVGElement;if(!root||(!detailed&&scale===1))return;let defs,index=0;const wrappers=new Map();
  for(const node of [...g.querySelectorAll('[fill],[stroke],[href]')])for(const attr of ['fill','stroke','href']){const value=node.getAttribute(attr)||'',match=value.match(/^url\(#((?:mapTexture-|map-part-image-)[\w-]+)\)$|^#((?:mapTexture-|map-part-image-)[\w-]+)$/);if(!match)continue;const source=match[1]||match[2],base=detailed&&source.startsWith('mapTexture-')&&!MapArt.buildings.includes(n.type)?'mapTexture-'+n.texture_material:source;if(node.tagName.toLowerCase()==='pattern'){
    node.setAttribute('href','#'+base);if(scale!==1)node.setAttribute('patternTransform',(node.getAttribute('patternTransform')||'')+' scale('+scale+')');if(base.startsWith('mapTexture-')){const size=MapMaterials.period(base.slice(11).replace(/-still$/,''));node.setAttribute('width',size);node.setAttribute('height',size);}
   }else{const key=base+':'+scale;let id=wrappers.get(key);if(!id){defs||=el('defs',{},g);id='part-repeat-'+n.id.replace(/[^\w-]/g,'')+'-'+index++;el('pattern',{id,href:'#'+base,patternUnits:'userSpaceOnUse',patternTransform:'scale('+scale+')'},defs);wrappers.set(key,id);}node.setAttribute(attr,'url(#'+id+')');}}
  // Moving ribbons keep their local arc-length mapping and share one flow clock.
  if(scale!==1)for(const pattern of g.querySelectorAll('pattern[href^="#mapRiverFlow-"]'))pattern.setAttribute('patternTransform',(pattern.getAttribute('patternTransform')||'')+' scale('+scale+')');
 }
 function eligible(n){return !!n&&(!!n.spline_kind||n.shape==='stroke'||!!n.tile_cells||MapMaterials.names.includes(n.type)||MapArt.buildings.includes(n.type)||['road','river','bridge','rope_bridge','stairs','portcullis','timber_fence'].includes(n.type));}
 window.MapTextureScale={apply,eligible};
})();
