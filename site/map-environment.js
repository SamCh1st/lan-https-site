/* Map-unit materials, environmental artwork and shared physical part profiles. */
(function(){
 'use strict';
 const path=(d,fill,stroke='#303d36',width=1.5)=>`<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"/>`;
 const circle=(x,y,r,fill,stroke='#39473c')=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`;
 const ellipse=(x,y,rx,ry,fill)=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
 const stone=(x,y,s=1)=>`<g transform="translate(${x} ${y}) scale(${s})">${path('M-20-5-9-20 12-17 23 0 13 19-13 16Z','#7d887e')+path('M-20-5-9-20 12-17 8 1-7 7Z','#b0b7a3')+path('M-7 7 8 1 23 0 13 19-13 16Z','#596c62')+path('M-9-20-7 7 13 19','none','#c5c7b0',.8)}</g>`;
 const leaf=(x,y,a,s=1)=>`<g transform="translate(${x} ${y}) rotate(${a}) scale(${s})">${path('M0 0Q-16-14 0-36Q15-15 0 0Z','#53784b')+path('M0-2V-30m0 13-6-6m6 0 6-6','none','#a0b277',1)}</g>`;
 const flame=(x,y,s=1)=>`<g transform="translate(${x} ${y}) scale(${s})" data-untextured="true">${path('M0-27C-22-6-14 16 0 17 20 13 20-7 9-16L5 0Z','#e28d35','#863f24')+path('M0-10C-10 0-9 11 0 12 10 9 8 0 4-4L1 5Z','#fff0ae','none')}</g>`;
 const art={
  mossy_boulder:stone(48,48,1.8)+path('M13 41 28 25 38 32 31 44 42 52 27 66 17 57Z','#587344')+path('M65 60 83 53 82 66 66 78 57 70Z','#718a50')+circle(34,36,3,'#a5b27a'),
  rock_outcrop:stone(30,57,1.1)+stone(64,34,1.3)+stone(68,76,.8)+path('M59 13 51 34 66 48M20 53 36 64','none','#d1d0b5',1),
  standing_stone:ellipse(50,52,30,39,'#434e46')+path('M28 26 44 8 68 19 77 69 59 90 29 77Z','#849387')+path('M44 8 49 68 29 77 28 26Z','#bac0aa')+path('M49 68 68 19 77 69 59 90Z','#5d7268')+path('M48 29 59 39 48 49 59 60','none','#d9ddbd',2),
  driftwood:path('M5 46 31 38 60 43 88 31 96 40 69 55 82 78 73 83 54 60 16 65Z','#8d8062')+path('M12 52 56 50 87 39M23 58 53 55 75 78','none','#c8b894',2)+path('M32 44 40 49 30 54','none','#574e3b',1.2),
  fern_patch:[[28,39,0],[68,37,31],[47,73,18]].map(([x,y,a])=>Array.from({length:7},(_,i)=>leaf(x,y,a+i*51,.7)).join('')).join(''),
  cattails:[22,37,54,70,81].map((x,i)=>leaf(49,88,(i-2)*23,1.3)+path(`M49 88Q${x-8} 51 ${x} ${14+i%2*10}`,'none','#94a364',2)+path(`M${x} ${14+i%2*10}v18`,'none','#775336',5)+path(`M${x-1} ${16+i%2*10}v12`,'none','#bd9256',1)).join(''),
  tide_pool:path('M8 42Q12 6 45 13T92 45Q101 77 69 88T12 70Z','#677a6b')+path('M18 43Q18 18 47 23T82 47Q90 69 65 78T21 69Z','#37676b')+path('M26 42Q29 29 47 31M45 70q23 5 29-12','none','#acd1bd',2)+stone(19,25,.35)+stone(79,73,.4)+leaf(13,68,20,.45),
  ice_crystal:path('M13 38 32 13 46 38 37 83 23 77Z','#81becb')+path('M38 27 57 4 75 30 66 88 46 95Z','#a1d6db')+path('M57 4 54 78 46 95 38 27Z','#d9efe5')+path('M66 51 82 28 95 48 86 84 68 89Z','#659cab')+path('M32 16 31 70M82 31 79 78','none','#e4f6ee',2),
  stalagmite:stone(29,69,.9)+stone(70,70,.7)+path('M31 71 49 6 67 72 52 89Z','#8e9381')+path('M49 6 48 71 31 71Z','#c4c3a8')+path('M49 6 67 72 52 89 48 71Z','#626f64'),
  fallen_leaves:Array.from({length:19},(_,i)=>`<g transform="translate(${15+i*31%72} ${13+i*23%74}) rotate(${i*137})">${path('M0 9-8 1-4-3-5-10 1-7 7-10 6-2 11 2Z',['#af753e','#c29750','#826239'][i%3],'#654f34',.6)+path('M0 10V-7','none','#e1bf7d',.7)}</g>`).join(''),
  glowing_mushrooms:[[29,35,21],[68,61,25],[24,78,12]].map(([x,y,r])=>circle(x,y,r,'#47767b')+circle(x-1,y-2,r-3,'#84c5bb')+`<g data-untextured="true">${circle(x-4,y-6,3,'#ddf9ca')+circle(x+7,y+3,2,'#c2edbd')}</g>`).join(''),
  brazier:circle(50,50,39,'#737c6b')+circle(50,50,30,'#343e3a')+[0,1,2,3,4,5,6,7].map(i=>{const a=i*Math.PI/4;return stone(50+Math.cos(a)*34,50+Math.sin(a)*34,.28);}).join('')+path('M29 62 71 38M29 38 71 62','none','#7f5835',7)+flame(50,45),
  lantern:path('M28 22 50 10 72 22 78 75 50 91 22 75Z','#47594f')+path('M35 28 50 22 65 28 68 68 50 78 32 68Z','#dfa75d')+`<g data-untextured="true">${ellipse(50,49,12,23,'#fff1b6')}</g>`+path('M50 17V82M28 28l44 44M72 28 28 72','none','#687765',3)+circle(50,12,7,'none'),
  candle_cluster:[[30,35,13],[65,59,16],[26,78,10]].map(([x,y,r])=>circle(x,y,r+3,'#82724c')+circle(x,y,r,'#dfd2a7')+circle(x,y,r*.65,'#f4e6ba')+flame(x,y,.25)).join(''),
  rune_stone:stone(50,50,1.9)+`<g data-untextured="true">${path('M50 23 65 48 50 76 35 48Z','none','#8addd1',3)+path('M50 32v30M42 48h16','none','#d0f6d9',2)}</g>`,
  timber_fence:path('M8 23H92V77H8Z','#927247')+path('M12 33H88M12 67H88','none','#c3a275',4)+[17,50,83].map(x=>path(`M${x-6} 10h12v80h-12Z`,'#9d8058')+circle(x,30,2,'#343d32')+circle(x,70,2,'#343d32')).join('')
 };
 const environmentTypes=Object.keys(art);
 const crystal=(x,y,r,color)=>`<g transform="translate(${x} ${y})">${path(`M${-r} 0 ${-r*.4} ${-r} ${r*.65} ${-r*.7} ${r} ${r*.3} 0 ${r}Z`,color)+path(`M${-r} 0 0 -3 ${-r*.4} ${-r}Z`,'#d8eee5')+path(`M0-3 ${r*.65} ${-r*.7} ${r} ${r*.3}Z`,'#87b3bb')+path(`M0-3 0 ${r} ${r} ${r*.3}Z`,'#527d93')+path(`M${-r} 0 0-3 0 ${r}M0-3 ${r*.65} ${-r*.7}`,'none','#bce3df',1)}</g>`;
 const embers=radius=>circle(50,50,radius,'#43493d')+Array.from({length:11},(_,i)=>{const a=i*2.4,r=8+i%3*6;return ellipse(50+Math.cos(a)*r,50+Math.sin(a)*r,4+i%3,3+i%2,i%3?'#dd8e3b':'#ffe3a0');}).join('');
 const fireTop=path('M21 28 77 74M24 75 78 27','none','#795232',10)+embers(25)+`<g data-untextured="true">${ellipse(49,47,10,13,'#fbc76d')+ellipse(48,44,5,7,'#fff0b4')}</g>`;
 Object.assign(art,{
  tree:MapArt.icon('pine_tree').replace(/^<svg[^>]*>|<\/svg>$/g,''),oak:MapArt.icon('oak_tree').replace(/^<svg[^>]*>|<\/svg>$/g,''),
  house:path('M8 10H92V90H8Z','#774f3c')+path('M8 10 50 22V78L8 90Z','#b98659')+path('M92 10 50 22V78L92 90Z','#85543e')+path('M8 10 50 22 92 10M8 90 50 78 92 90M50 22V78','none','#dab482',3)+[24,36,48,60,72].map(y=>path(`M9 ${y} 49 ${y+7}M51 ${y+7} 91 ${y}`,'none','#d09a69',1.2)).join('')+path('M68 19h14v18H68Z','#676f62')+path('M72 23h6v10h-6Z','#303b35'),
  tower:circle(50,50,43,'#777f70')+circle(50,50,33,'#aaa993')+circle(50,50,26,'#525e54')+Array.from({length:10},(_,i)=>`<g transform="rotate(${i*36} 50 50)">${path('M43 5h14v16H43Z','#b8b69c')}</g>`).join('')+path('M33 32H67V68H33Z','#8e7353')+path('M36 40h28M36 49h28M36 58h28','none','#c3a275',2),
  tent:path('M10 17 50 7 90 17 90 83 50 93 10 83Z','#bdac7c')+path('M50 7 90 17V83L50 93Z','#897b53')+path('M50 7V93M10 17 90 83M90 17 10 83','none','#daceab',2)+path('M10 17 2 8M90 17 98 8M10 83 2 92M90 83 98 92','none','#826d48',2)+path('M40 89 50 72 61 89Z','#4d503a'),
  chest:path('M12 19H88V81H12Z','#61492f')+path('M17 24H83V76H17Z','#a98451')+path('M20 37h60M20 50h60M20 63h60','none','#d1ad76',1.5)+path('M29 21V79M71 21V79','none','#61716b',8)+path('M43 65h14v15H43Z','#d0b36b')+circle(50,72,2,'#39433a'),
  mountain:path('M8 37 31 12 66 7 91 34 95 66 64 91 27 85 5 60Z','#616f63')+path('M31 12 48 43 66 7 69 44 91 34 66 60Z','#a8aa91')+path('M8 37 48 43 27 85 48 62 64 91 66 60 95 66','none','#c4bd9b',3)+path('M48 43 58 28 69 44 66 60 48 62Z','#d9dfcc')+path('M58 28 57 50 66 60 69 44Z','#9fafaa'),
  standing_stone:stone(50,50,1.9)+path('M30 30 67 25 74 62 48 77 28 59Z','#a3b09a')+path('M39 41 56 38 60 57 43 60Z','none','#d4d4b4',2),
  stalagmite:circle(50,50,41,'#4f6055')+path('M12 42 29 15 68 12 90 40 82 79 40 92 11 68Z','#838f7b')+path('M29 15 48 42 68 12 57 47 90 40 56 56 82 79 48 55 40 92 40 55 11 68 43 49 12 42Z','#b0b49b')+circle(49,49,8,'#d1d3b5'),
  ice_crystal:crystal(31,36,25,'#a8d4d4')+crystal(68,61,27,'#bde1dc')+crystal(26,78,14,'#8fc5cf'),
  crystal_cluster:crystal(28,35,24,'#9aa7c8')+crystal(66,44,29,'#accdd1')+crystal(38,76,20,'#8c98b8'),
  campfire:fireTop,brazier:circle(50,50,41,'#79816f')+Array.from({length:8},(_,i)=>{const a=i*Math.PI/4;return stone(50+Math.cos(a)*34,50+Math.sin(a)*34,.28);}).join('')+fireTop,
  torch:path('M44 48h12v44H44Z','#8d6d43')+circle(50,40,24,'#536354')+`<g data-untextured="true">${circle(50,40,18,'#d08a3a')+ellipse(49,39,10,13,'#ffe3a0')}</g>`,
  lantern:path('M19 19H81V81H19Z','#53675b')+path('M26 26H74V74H26Z','#c2a369')+`<g data-untextured="true">${circle(50,50,22,'#ffe1a0')}</g>`+path('M19 19 81 81M81 19 19 81','none','#65796a',5)+circle(50,50,8,'#89937a'),
  candle_cluster:[[30,35,13],[65,59,16],[26,78,10]].map(([x,y,r])=>circle(x,y,r+3,'#82724c')+circle(x,y,r,'#e2d6b2')+circle(x,y,r*.6,'#b5a881')+`<g data-untextured="true">${ellipse(x,y-1,3,5,'#fff0bb')+circle(x,y,1,'#826135')}</g>`).join('')
 });
 MapArt.extend(art,{});
 const lights={
  torch:{light_radius:160,light_color:'#ffd58a'},campfire:{light_radius:240,light_color:'#ffc477'},
  forge:{light_radius:220,light_color:'#ffab61'},brazier:{light_radius:220,light_color:'#ffc477'},
  lantern:{light_radius:180,light_color:'#ffe1a0'},candle_cluster:{light_radius:110,light_color:'#ffe6b2',light_intensity:.8},
  portal:{light_radius:240,light_color:'#aa99ff',light_intensity:.75},crystal_cluster:{light_radius:150,light_color:'#98e0e3',light_intensity:.65},
  arcane_obelisk:{light_radius:170,light_color:'#9dccf0',light_intensity:.7},rune_stone:{light_radius:140,light_color:'#8addd1',light_intensity:.65},
  glowing_mushrooms:{light_radius:110,light_color:'#a2e9bd',light_intensity:.55},ritual_circle:{light_radius:160,light_color:'#c0a0f0',light_intensity:.55},summoning_sigil:{light_radius:160,light_color:'#eea076',light_intensity:.55}
 };
 const ground=new Set(['spike_pit','trapdoor','pressure_plate','rug','bedroll','lily_pads','reeds','spider_web','ritual_circle','summoning_sigil','fallen_leaves','tide_pool','fern_patch','cattails']);
 const noShadow=new Set(['point_light','torch','campfire','brazier','lantern','candle_cluster',...ground]);
 const stoneParts=new Set(['rock','mountain','mossy_boulder','rock_outcrop','standing_stone','stalagmite','rune_stone','stone_pillar','broken_pillar','gravestone','fountain','well','forge','altar','sarcophagus']);
 const woodParts=new Set(['fallen_log','tree_stump','driftwood','timber_fence','chest','crate','barrel','table','round_table','bench','chair','cupboard','bookshelf','writing_desk','trapdoor','door','cart','boat','supply_crates','weapon_rack']);
 const foliageParts=new Set(['tree','oak','oak_tree','pine_tree','blossom_tree','thorn_bush','fern_patch','cattails','foliage','fern','grass_tuft']);
 function material(type,color){
  if(!/^#[0-9a-f]{6}$/i.test(color))return null;
  const [r,g,b]=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
  if(Math.max(r,g,b)<65)return null;
  if(type==='ice_crystal')return 'ice';
  if(woodParts.has(type))return g>r*1.08?'iron':'wood';
  if(stoneParts.has(type))return g>r*1.15&&g>b*1.15?'moss':'slate';
  if(foliageParts.has(type))return g>r*.95?'moss':'wood';
  return null;
 }
 function texture(n,group,el){
  if(n._silhouette)return;
  const defs=el('defs',{},group),paints=new Map(),sx=n.w/100,sy=n.h/100;
  for(const shape of group.querySelectorAll('[fill]')){
   if(shape.closest('[data-untextured]'))continue;
   const color=shape.getAttribute('fill'),name=material(n.type,color);if(!name)continue;
   const key=name+color;let id=paints.get(key);
   if(!id){id='part-'+n.id.replace(/[^a-zA-Z0-9_-]/g,'')+'-'+paints.size;paints.set(key,id);
    const pattern=el('pattern',{id,width:640,height:640,patternUnits:'userSpaceOnUse',patternTransform:`scale(${1/sx} ${1/sy})`,'data-part-material':name},defs);
    el('rect',{width:640,height:640,fill:color},pattern);
    el('rect',{width:640,height:640,fill:`url(#mapTexture-${name})`,opacity:.6},pattern);
    el('rect',{width:640,height:640,fill:color,opacity:.22},pattern);
   }
   shape.setAttribute('fill',`url(#${id})`);
  }
  if(!paints.size)defs.remove();
 }
 // Normalized height fields are sampled inside the artwork's alpha silhouette.
 // Different elevations cast different lengths instead of extruding a flat cutout.
 function height(type,x,y){
  const dome=(cx,cy,rx,ry)=>Math.sqrt(Math.max(0,1-((x-cx)/rx)**2-((y-cy)/ry)**2));
  if(ground.has(type))return 0;
  if(window.MapSettlement?.crops.includes(type))return .04+.28*dome(.5,.5,.48,.48);
  if(['rock','mossy_boulder','rune_stone'].includes(type))return .12+.65*dome(.48,.46,.48,.48);
  if(type==='rock_outcrop')return .12+.85*Math.max(dome(.3,.57,.26,.26)*.7,dome(.64,.34,.3,.3),dome(.68,.76,.2,.2)*.5);
  if(['tree','oak','oak_tree','pine_tree','blossom_tree','thorn_bush'].includes(type))return .2+1.15*dome(.5,.45,.5,.5);
  if(['mountain','stalagmite','standing_stone','ice_crystal','crystal_cluster','arcane_obelisk'].includes(type))return .2+1.3*Math.max(0,1-Math.hypot((x-.5)*1.7,(y-.42)*1.4));
  if(['fallen_log','driftwood','timber_fence'].includes(type))return .1+.3*dome(.5,.5,.8,.5);
  if(type==='tree_stump')return .3;
  if(type==='glowing_mushrooms')return .22;
  if(type.startsWith('item_'))return .04+.2*dome(.5,.5,.48,.48);
  if(type.startsWith('book_')||['scroll','brass_key','silver_spoon'].includes(type))return .04+.09*dome(.5,.5,.48,.48);
  if(['ceramic_mug','pewter_tankard','wooden_bowl','plate','goblet'].includes(type)){const r=Math.hypot(x-.5,y-.5);return .08+.2*Math.exp(-(((r-.33)/.065)**2));}
  if(type.startsWith('potion_')&&!type.endsWith('table'))return .12+.3*dome(.5,.52,.4,.45);
  if(['table','round_table','writing_desk','potion_table','altar','market_stall','bookshelf','cupboard','chest','crate','barrel','bed','chair','bench'].includes(type))return .35+.16*dome(.5,.5,.5,.5);
  if(['flowers','wildflowers','sunflowers','foliage','fern','grass_tuft','reeds','mushrooms'].includes(type))return .03+.22*dome(.5,.5,.47,.47);
  if(['butterfly','bee','dragonfly','firefly','ladybug'].includes(type))return .01+.04*dome(.5,.5,.45,.45);
  return 1;
 }
 window.MapPartProfiles={lights,ground,noShadow,texture,height,isLight:value=>value&&typeof value==='object'?(typeof value.light_enabled==='boolean'?value.light_enabled:value.type==='point_light'||!!lights[value.type]):value==='point_light'||!!lights[value],newTypes:environmentTypes,nature:environmentTypes.filter(t=>!['brazier','lantern','candle_cluster','rune_stone','timber_fence'].includes(t))};
})();
