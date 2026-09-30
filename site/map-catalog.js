/* Original top-down fantasy props, with names and searchable scene categories. */
(function(){
 const r=(x,y,w,h,c='#92704c',rx=3)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${c}" stroke="#3d352c" stroke-width="2"/>`,c=(x,y,r,fill)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="#49493e" stroke-width="2"/>`,p=(d,fill,stroke='#504c40',w=2)=>`<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round"/>`,radial=(count,art)=>Array.from({length:count},(_,i)=>`<g transform="rotate(${i*360/count} 50 50)">${art}</g>`).join('');
 const art={
 exit_location:'<circle cx="50" cy="50" r="40" fill="#203b46" stroke="#a8e1d2" stroke-width="4"/><path d="M18 50h53M53 30l20 20-20 20" fill="none" stroke="#e9d49c" stroke-width="7"/>',
 point_light:c(50,50,13,"#f9d98a")+radial(8,p("M50 14V5","none","#f9d98a",4)),
 shop:r(9,16,82,73)+r(8,12,84,42,"#b58f57")+[8,32,56,80].map(x=>r(x,12,12,42,"#537c70",0)).join("")+c(50,72,15,"#d9b15f"),
 encounter:c(50,50,42,"#663b35")+p("M25 22 75 78M75 22 25 78","none","#e7ce8c",9),
 stone_pillar:r(14,14,72,72,'#626d66')+c(50,50,31,'#999e8b')+c(50,50,22,'#c0c0a5')+radial(8,p('M50 22v8','none','#6f7a6e',3)),
 broken_pillar:c(47,43,31,'#9b9c89')+p('M20 35 43 32 38 52 60 43 65 66','none','#4a5149',5)+p('M72 66 90 70 81 90 65 83Z','#858d7c'),
 portcullis:r(4,13,16,74,'#747d70')+r(80,13,16,74,'#747d70')+[28,42,56,70].map(x=>p(`M${x} 15v70`,'none','#a5afa3',5)).join('')+p('M20 28h60M20 72h60','none','#59665e',7),
 trapdoor:r(9,9,82,82,'#403c31')+r(16,16,68,68)+[30,45,60,75].map(x=>p(`M${x} 18v64`,'none','#bd9865')).join('')+r(16,24,15,7,'#48544c')+r(16,69,15,7,'#48544c')+c(72,50,6,'#403a2d'),
 spike_pit:r(8,8,84,84,'#868477')+r(16,16,68,68,'#171f1e')+[28,50,72].map(x=>[28,50,72].map(y=>p(`M${x-7} ${y+8} ${x} ${y-10} ${x+7} ${y+8}Z`,'#bac0ab')).join('')).join(''),
 pressure_plate:r(12,12,76,76,'#555e54')+r(18,18,64,64,'#a4a78d')+p('M29 29h42v42H29Z','none','#777e68',3)+[26,74].map(x=>[26,74].map(y=>c(x,y,3,'#515d50')).join('')).join(''),
 lever:r(26,20,48,60,'#777c6d')+c(50,52,16,'#46534b')+p('M50 55 68 26','none','#b6b9a3',8)+c(69,25,9,'#984f3d'),
 bone_pile:[[-10,-9,25],[15,10,-35],[0,20,70]].map(([x,y,a])=>`<g transform="translate(${x} ${y}) rotate(${a} 50 50)">${p('M25 50h50','none','#d9d0ac',7)+c(23,47,5,'#c9c2a1')+c(23,53,5,'#c9c2a1')+c(77,47,5,'#c9c2a1')+c(77,53,5,'#c9c2a1')}</g>`).join('')+c(54,28,16,'#d8d0b6')+c(48,27,4,'#353b31')+c(61,27,4,'#353b31'),
 coffin:p('M30 8h40l13 25-12 59H29L17 33Z','#795b41')+p('M35 16h30l10 20-10 48H35L25 36Z','#9d7750')+p('M50 28v43M37 42h26','none','#d6b279',4),
 bench:r(9,30,82,40)+r(8,24,84,9,'#c49a65')+p('M16 45h68M16 58h68','none','#c3a06b'),
 round_table:c(50,50,39,'#57412d')+c(50,50,34,'#aa8250')+p('M24 33h52M17 49h66M24 65h52','none','#765333',2)+c(49,48,7,'#ccb98b'),
 cupboard:r(14,10,72,80)+r(20,16,28,66,'#b08a5c')+r(52,16,28,66,'#b08a5c')+c(41,50,3,'#dfc178')+c(59,50,3,'#dfc178'),
 writing_desk:r(8,18,84,62)+r(18,28,40,33,'#dacdab')+p('M25 37h25M25 44h21M25 51h25','none','#93815c')+c(76,40,8,'#252f2a')+p('M68 55 85 21','none','#ece0b9',3),
 weapon_rack:r(12,17,76,10)+r(12,72,76,10)+[27,50,73].map(x=>p(`M${x} 13v72`,'none','#ad9270',4)+p(`M${x-7} 25 ${x} 5 ${x+7} 25Z`,'#afb9af')+p(`M${x-9} 57h18`,'none','#d5b260',4)).join(''),
 market_stall:r(9,16,82,73)+r(8,12,84,42,'#b58f57')+[8,32,56,80].map(x=>r(x,12,12,42,'#9d4e43',0)).join('')+r(13,61,74,22,'#c29558')+[24,42,61,77].map((x,i)=>c(x,70,6,['#8caa55','#c3843d','#a74736','#879458'][i])).join(''),
 fountain:c(50,50,44,'#737f79')+c(50,50,36,'#619293')+c(50,50,23,'#9eb7aa')+c(50,50,14,'#5e9295')+c(50,50,6,'#c8d5c2')+radial(6,p('M50 25v-8','none','#c1ddd0',3)),
 cart:r(16,16,68,60)+p('M25 24h50M25 38h50M25 52h50','none','#c09d6a',3)+r(5,27,9,40,'#353c36')+r(86,27,9,40,'#353c36')+p('M31 75v23M69 75v23','none','#a38c59',5),
 hay_bale:r(9,20,82,60,'#c2ac64',12)+[28,38,48,58,68].map(y=>p(`M16 ${y}q20-5 36 0t34 0`,'none','#e0c77f')).join('')+p('M32 19v62M69 19v62','none','#7f7141',5),
 forge:r(10,10,80,80,'#7c7c6d')+r(20,20,60,60,'#332d26')+c(50,50,25,'#bc5f32')+c(47,47,15,'#efb94c')+p('M22 33h56M22 50h56M22 67h56','none','#48524b',5),
 gravestone:r(18,12,64,75,'#777f70',15)+r(26,20,48,58,'#a3a88f',10)+p('M50 28v35M37 42h26','none','#626b5c',5),
 ritual_circle:c(50,50,43,'#513c5b44')+c(50,50,36,'none')+p('M50 14 82 69H18Z','none','#c5a1d1',3)+p('M50 86 18 31h64Z','none','#c5a1d1',3)+radial(8,p('M48 5v6h5','none','#dbc398',2)),
 portal:c(50,50,44,'#31464f')+c(50,50,36,'#6d68ac')+c(50,50,27,'#504a80')+p('M28 57c-15-25 37-43 46-13S34 83 37 53 71 39 60 58','none','#b4dcda',4)+radial(8,r(47,5,6,10,'#cab98b',1)),
 crystal_cluster:p('M18 36 33 14 47 41 39 83 22 75Z','#8190b8')+p('M43 22 59 4 73 27 64 84 46 90Z','#a5cbd0')+p('M64 51 81 26 94 45 83 85 64 91Z','#7b84ac')+p('M59 6 57 79M33 17 32 72M81 29 77 81','none','#d0e4dc',2),
 arcane_obelisk:r(12,12,76,76,'#55586c')+p('M50 14 81 50 50 86 19 50Z','#81819b')+p('M50 14v72M19 50h62','none','#383f56',2)+p('m50 32 10 18-10 18-10-18Z','none','#b7dacf',3),
 summoning_sigil:c(50,50,43,'#6f493933')+p('M50 8 74 84 10 37h80L26 84Z','none','#bc7353',3)+radial(5,c(50,9,4,'#e4c586')),
 potion_table:r(7,14,86,72)+[25,49,73].map((x,i)=>c(x,43,11,['#658d71','#8b69a2','#af695b'][i])+r(x-4,25,8,9,'#c4aa76')+c(x+2,41,3,'#d6e2c1')).join('')+r(23,63,51,10,'#d0bb88'),
 bedroll:r(24,8,52,84,'#54736a',12)+r(23,8,54,21,'#88a18a',10)+p('M28 36h44M29 80h42','none','#c1ad7c',3),
 supply_crates:r(5,10,47,48)+p('m10 15 37 38m0-38L10 53','none','#d0ad73',5)+r(49,47,45,45)+p('m54 52 35 35m0-35L54 87','none','#c6a16a',5)+r(58,9,28,28,'#758576'),
 camp_tarp:p('M16 9 86 20 82 90 10 78Z','#819285')+p('M16 9 82 90M10 78 86 20','none','#53665b',3)+p('M16 9 5 2M86 20 97 9M82 90l10 8M10 78 2 91','none','#c1ac7a',2),
 rope_bridge:p('M20 3q12 47 0 94M80 3q-12 47 0 94','none','#c6b58a',4)+[15,29,43,57,71,85].map(y=>r(20,y,60,9,'#9b7850',1)).join(''),
 fallen_log:r(7,32,86,39,'#65543d',16)+p('M15 44q30-10 67 1M18 58h65','none','#9c8054',4)+c(15,51,16,'#bd9a64')+c(15,51,9,'none'),
 tree_stump:c(50,50,35,'#695239')+radial(5,p('M44 77 39 94 54 88 59 77Z','#695239'))+c(50,50,27,'#b08c5b')+c(50,50,18,'none')+c(50,50,8,'none'),
 lily_pads:[[28,33,21],[71,30,17],[58,71,23]].map(([x,y,r])=>c(x,y,r,'#6c8c51')+p(`M${x} ${y}l${r} -8 -3 17Z`,'#3d6260','#3d6260',1)).join(''),
 reeds:[22,36,51,67,81].map((x,i)=>p(`M50 84Q${x-10} 50 ${x} 12`,'none','#7d9561',4)+p(`M${x} 15v18`,'none','#8e7046',6)).join(''),
 thorn_bush:radial(7,p('M49 52 36 22 48 29 51 7 61 32 71 19 66 46Z','#496645','#2e4935',1.5))+c(50,50,15,'#70825a'),
 spider_web:radial(8,p('M50 50V5','none','#ced1bd',1.2))+[15,27,39].map(radius=>`<polygon points="${Array.from({length:8},(_,i)=>[50+Math.cos(i*Math.PI/4)*radius,50+Math.sin(i*Math.PI/4)*radius].join(',')).join(' ')}" fill="none" stroke="#b8c0b0" stroke-width="1.4"/>`).join('')
 };
 MapArt.extend(art,{lava:'#b35024',swamp:'#49613d',ice:'#94bfc5',gravel:'#8f8876',basalt:'#39454b',tiles:'#9eab93',carpet:'#783c43',arcane:'#625480'});
 const groups={terrain:['grass','water','sand','stone','snow','wood','path','marble','brick','cobble','slate','iron','moss','mud','lava','swamp','ice','gravel','basalt','tiles','carpet','arcane'],buildings:MapArt.buildings,dungeon:['door','stairs','stone_pillar','broken_pillar','portcullis','trapdoor','spike_pit','pressure_plate','lever','bone_pile','coffin','sarcophagus','cage'],furniture:['table','round_table','chair','bench','bed','bookshelf','cupboard','writing_desk','rug','weapon_rack'],settlement:['house','tower','market_stall','fountain','well','cart','hay_bale','forge','anvil','gravestone'],magic:['altar','ritual_circle','portal','crystal_cluster','arcane_obelisk','summoning_sigil','potion_table'],travel:['tent','campfire','torch','bedroll','supply_crates','camp_tarp','rope_bridge','bridge','boat','chest','barrel','crate'],nature:['tree','oak','mountain','fallen_log','tree_stump','lily_pads','reeds','thorn_bush','spider_web'],ambience:MapArt.ambience,paths:['road','river','wall'],lighting:['point_light','torch','campfire'],notes:['exit_location','label','fog','zone','npc','encounter','shop','camera_bounds']};
 groups.props=MapSprites.props;groups.locations=MapSprites.markers;groups.nature.push(...MapPartProfiles.nature);groups.settlement.push('timber_fence','lantern','brazier');groups.magic.push('rune_stone');groups.furniture.push('candle_cluster');groups.lighting=[...new Set(['point_light',...Object.keys(MapPartProfiles.lights)])];
 groups.building_kits=Object.values(window.MapBuildingKit?.collections||{}).flat();
 groups.settlement.push(...MapSettlement.types);
 groups.props=groups.props.filter(t=>!window.BusinessCatalog?.labels[t]);for(const [type,group] of Object.entries(window.BusinessCatalog?.partGroups||{})){if(!groups[group].includes(type))groups[group].push(type);}
 const assigned=new Set(Object.values(groups).flat());const leftovers=MapArt.stamps.filter(t=>!assigned.has(t));if(leftovers.length)groups.stamps=leftovers;
 const tags={dungeon:'ruins underground crypt tomb prison traps',furniture:'interior tavern inn house furniture',settlement:'town village city market street',magic:'wizard mage arcane temple ritual fantasy',travel:'camp campsite wilderness supplies adventure',nature:'forest swamp wild woodland outdoor',ambience:'scatter foliage plants insects trees brush',terrain:'paint floor ground texture',buildings:'room walls floor architecture',paths:'route road water walls',notes:'annotation visibility encounter'};
 const aliases={bridge:'bridge crossing planks timber tiled repeat',rope_bridge:'bridge crossing rope planks tiled repeat',stairs:'steps staircase tiled repeat',portcullis:'gate bars prison tiled repeat',lava:'volcano molten fire animated',swamp:'marsh bog water animated',ice:'frozen glacier winter',gravel:'pebbles rocky ground',basalt:'volcanic dark rock',tiles:'tile mosaic checker floor',carpet:'rug fabric textile',arcane:'magic aether enchanted animated',weapon_rack:'armory armoury swords spears weapons guard',spike_pit:'trap hazard spikes hole',pressure_plate:'trap trigger puzzle',lever:'switch puzzle trigger',trapdoor:'secret hatch entrance',portcullis:'gate bars prison',coffin:'graveyard cemetery burial undead',gravestone:'graveyard cemetery tomb headstone',bone_pile:'skeleton remains undead',portal:'teleport gate planar',ritual_circle:'spell circle runes',summoning_sigil:'spell rune circle',potion_table:'alchemy laboratory lab potions',writing_desk:'study library scroll parchment',fountain:'water plaza',lily_pads:'pond water swamp',reeds:'swamp marsh water',bedroll:'sleep sleeping bag',camp_tarp:'tent shelter',tree_stump:'cut tree forest',spider_web:'web cobweb spiders',oak_tree:'oak forest canopy',pine_tree:'pine conifer evergreen',blossom_tree:'cherry blossom flowers'};
 MapPartProfiles.noShadow.add('exit_location');
 const labels={exit_location:'Exit location',locations:'Location markers',point_light:'Point light',camera_bounds:'Player camera boundary',npc:'NPC marker',encounter:'Encounter marker',zone:'Area marker',fog:'Fog of war'};
 const label=t=>window.BusinessCatalog?.labels[t]||window.MapSettlement?.labels[t]||window.MapBuildingKit?.labels[t]||window.MapLocationStamps?.labels[t]||window.MapItemProps?.labels[t]||labels[t]||(t.startsWith('marker_')?t.slice(7).replaceAll('_',' ')+' marker':t.replaceAll('_',' '));
 window.MapCatalog={groups,newTypes:[...Object.keys(window.BusinessCatalog?.labels||{}),...MapSettlement.types,...Object.keys(art),...MapPartProfiles.newTypes,...MapSprites.markers,...MapSprites.props],label,searchText:(t,g)=>[label(t),t,g,window.BusinessCatalog?.search[t]||'',tags[g]||'',aliases[t]||MapSettlement.aliases[t]||'',MapPartProfiles.nature.includes(t)?'environment scenery wilderness outdoors':'',MapPartProfiles.isLight(t)?'lighting glow luminous illumination':''].join(' ').toLowerCase()};
})();

