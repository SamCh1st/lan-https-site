/* Shared high-resolution atlases: one decoded image per collection, no per-part files. */
(function(){
 const collections={
  environment:['mossy_boulder','rock_outcrop','standing_stone','driftwood','fern_patch','cattails','tide_pool','ice_crystal','stalagmite','fallen_leaves','glowing_mushrooms','brazier','lantern','candle_cluster','rune_stone','oak_tree','pine_tree','blossom_tree','rock','tree_stump','fallen_log','lily_pads','thorn_bush','spider_web','mountain','house','tower','tent','campfire','torch','well','fountain','cart','hay_bale','forge','crystal_cluster'],
  interiors:['chest','barrel','crate','table','round_table','chair','bench','bed','bookshelf','cupboard','writing_desk','weapon_rack','altar','sarcophagus','coffin','cage','boat','rug','stone_pillar','broken_pillar','trapdoor','spike_pit','pressure_plate','lever','bone_pile','gravestone','anvil','bedroll','supply_crates','camp_tarp','portal','arcane_obelisk','potion_table','market_stall','mushrooms','pebbles']
 };
 const markers=['marker_village','marker_castle','marker_city','marker_tower','marker_mountain_pass','marker_cave','marker_forest','marker_ruins','marker_temple','marker_mine','marker_harbor','marker_camp','marker_graveyard','marker_volcano','marker_portal','marker_waterfall'];
 collections.locations=markers.slice();
 Object.assign(collections,window.MapSettlement?.collections||{});
 Object.assign(collections,window.MapBuildingKit?.collections||{});MapArt.extend(Object.fromEntries(Object.values(window.MapBuildingKit?.collections||{}).flat().map(t=>[t,''])),{});
 Object.assign(collections,window.MapLocationStamps?.collections||{});markers.push(...Object.values(window.MapLocationStamps?.collections||{}).flat());
 const props=["book_red", "book_blue", "book_green", "book_purple", "book_brown", "book_open", "ceramic_mug", "pewter_tankard", "plate", "wooden_bowl", "goblet", "potion_red", "potion_blue", "potion_green", "potion_purple", "scroll", "brass_key", "silver_spoon"];collections.props=['table','round_table','writing_desk','altar','potion_table','market_stall',...props];
 collections.scatter=['flowers','wildflowers','sunflowers','grass_tuft','foliage','fern','reeds','butterfly','bee','dragonfly','firefly','ladybug','door','bridge','rope_bridge','stairs','portcullis','timber_fence','ritual_circle','summoning_sigil','npc','shop','encounter','spider_web'];
 MapArt.extend(Object.fromEntries(props.map(t=>[t,''])),{});
 MapArt.extend(Object.fromEntries(markers.map(type=>[type,'<path d="M50 8 87 35V85H13V35Z" fill="#a9976c"/><path d="M38 85V52h24v33" fill="#4c5141"/>'])),{});
 for(const type of markers)MapPartProfiles.noShadow.add(type);
 Object.assign(collections,window.MapItemProps?.collections||{});const itemTypes=Object.values(window.MapItemProps?.byTitle||{});props.push(...itemTypes);MapArt.extend(Object.fromEntries(itemTypes.map(t=>[t,''])),{});
 Object.assign(collections,window.BusinessCatalog?.collections||{});Object.assign(MapSpriteBounds,window.BusinessCatalog?.bounds||{});MapArt.extend(Object.fromEntries(Object.keys(window.BusinessCatalog?.labels||{}).map(t=>[t,''])),{});
 const entries=new Map(),images=new Map(),tiles=new Map();
 for(const [atlas,types] of Object.entries(collections))types.forEach((type,index)=>entries.set(type,{atlas,index,grid:atlas==='locations'?4:6,url:'/assets/map-art/'+atlas+'-atlas.png'}));
 for(const [type,source] of Object.entries({tree:'pine_tree',oak:'oak_tree'}))entries.set(type,entries.get(source));
 for(const [type,source] of Object.entries(window.MapSettlement?.spriteAliases||{}))entries.set(type,entries.get(source));
 function load(type){const entry=entries.get(type);if(!entry)return Promise.reject(new Error('Unknown map sprite'));
  if(!images.has(entry.atlas)){const img=new Image();img.src=entry.url;images.set(entry.atlas,img.decode().then(()=>img));}return images.get(entry.atlas);
 }
 function crop(type){const entry=entries.get(type);return MapSpriteBounds[entry.atlas].rects[entry.index];}
 function draw(ctx,type,atlas,size){if(window.BusinessCatalog?.labels[type]){ctx.drawImage(atlas,...crop(type),0,0,size,size);return;}const rect=crop(type),scale=size*.84/Math.max(rect[2],rect[3]),w=rect[2]*scale,h=rect[3]*scale;ctx.drawImage(atlas,...rect,(size-w)/2,(size-h)/2,w,h);}
 function tile(type){if(!tiles.has(type))tiles.set(type,load(type).then(atlas=>{const rect=crop(type),canvas=document.createElement('canvas');canvas.width=canvas.height=Math.ceil(Math.max(rect[2],rect[3])/.84);draw(canvas.getContext('2d'),type,atlas,canvas.width);const url=canvas.toDataURL();canvas.width=canvas.height=1;return url;}));return tiles.get(type);}
 function render(n,g,el){const entry=entries.get(n.type);if(!entry)return false;
  const img=el('image',{href:'/assets/map-art/items/'+n.type+'.png',x:0,y:0,width:n.w,height:n.h,preserveAspectRatio:'none','data-map-sprite':n.type},g);
  tile(n.type).then(url=>{if(img.isConnected&&!img.hasAttribute('data-height-lit'))img.setAttribute('href',url);});let generation=0;const refresh=()=>{const current=++generation;(window.MapSurfaceLighting&&!n.type.startsWith('marker_')&&!MapPartProfiles.isLight(n)?MapSurfaceLighting.image(n):tile(n.type)).then(async url=>{if(!url)return;const decoded=new Image();decoded.src=url;await decoded.decode();if(img.isConnected&&current===generation){img.setAttribute('href',url);img.setAttribute('data-height-lit','true');}}).catch(()=>{});};window.MapSurfaceLighting?.watch(img,refresh);refresh();return true;
 }
 function icon(type){const entry=entries.get(type);if(!entry)return null;const atlas=MapSpriteBounds[entry.atlas];return `<svg viewBox="${crop(type).join(' ')}" aria-hidden="true" overflow="hidden"><image href="${entry.url}" width="${atlas.width}" height="${atlas.height}"/></svg>`;}
 window.MapSprites={has:type=>entries.has(type),load,crop,draw,tile,render,icon,markers,props,types:[...entries.keys()]};
})();
