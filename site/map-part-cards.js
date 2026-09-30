/* Archive records are templates; placements retain a snapshot of their settings. */
(function(){
 const fields=['walk_over',...MapOpeningSettings.fields,'height_scale','light_enabled','light_radius','light_color','light_intensity','light_softness','shadow_length','shadow_strength','fire_light','fire_wave','fire_flicker'];
 const names={building_kits:'Building kits',terrain:'Terrain',buildings:'Buildings',dungeon:'Dungeon',furniture:'Furniture',settlement:'Settlement',magic:'Magic',travel:'Travel',nature:'Nature',ambience:'Ambience brushes',paths:'Paths & walls',lighting:'Lighting',notes:'Notes & markers',props:'Props',locations:'Location markers',stamps:'Other stamps'};
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let records=[],signature='';
 const collapsed=new Set();
 const groups=()=>Object.keys(MapCatalog.groups);
 const choices=g=>(MapCatalog.groups[g]||MapCatalog.groups.props);
 const option=(v,label)=>'<option value="'+esc(v)+'">'+esc(label)+'</option>';
 function form(c){
  const group=c.part_group||document.querySelector('#partTypeFilter')?.value||'props';
  return '<div class="part-card-fields"><label>Type<select class="form-control" name="part_group">'+groups().map(g=>option(g,names[g]||g)).join('')+'</select></label><label>Appearance & behavior<select class="form-control" name="part_type">'+choices(group).map(t=>option(t,MapCatalog.label(t))).join('')+'</select><small>Choose the original part to reuse its artwork and placement behavior. An uploaded image replaces its artwork.</small></label><div class="part-card-grid"><label>Default width<input class="form-control" name="part_width" type="number" min="1" max="10000" value="80" required></label><label>Default height<input class="form-control" name="part_height" type="number" min="1" max="10000" value="80" required></label><label>Surface height<input class="form-control" name="height_scale" type="number" min="0" max="4" step="0.1" value="1" required></label></div><label><input type="checkbox" name="walk_over" checked> Walk over</label><label class="important-toggle"><input type="checkbox" name="light_enabled"><span>Light source</span><small>Illuminate nearby parts with this card. Light sources do not cast their own shadow.</small></label><fieldset id="partLightFields"><legend>Light settings</legend><div class="part-card-grid">'+[['light_radius','Radius',10,5000,200,1],['light_intensity','Brightness',0,1,1,.05],['light_softness','Soft edge',0,1,.45,.05],['shadow_length','Shadow length',0,8,1.5,.1],['shadow_strength','Shadow strength',0,1,1,.05]].map(([key,label,min,max,value,step])=>'<label>'+label+'<input class="form-control" name="'+key+'" type="number" min="'+min+'" max="'+max+'" value="'+value+'" step="'+step+'" required></label>').join('')+'<label>Light color<input class="form-control" name="light_color" type="color" value="#ffd58a"></label></div><label><input name="fire_light" type="checkbox"> Fire flicker</label><div class="part-card-grid"><label>Wave<input name="fire_wave" type="range" min="0" max="1" step=".01" value=".35"></label><label>Flicker<input name="fire_flicker" type="range" min="0" max="1" step=".01" value=".35"></label></div></fieldset>'+MapOpeningSettings.markup()+'<small>40 units = one map square. Saved changes apply to future placements.</small></div>';
 }
 function bindForm(c,items=[]){
  const form=document.querySelector('#workForm'),group=form.elements.part_group,appearance=form.elements.part_type;
  if(!group)return;form.elements.walk_over.checked=c.walk_over!==false;
  MapOpeningSettings.bind(form.querySelector('.map-opening-settings'),c,items);
  const refreshLight=()=>{document.querySelector('#partLightFields').hidden=!form.elements.light_enabled.checked;};
  const defaults=()=>{const light=MapPartProfiles.lights[appearance.value]||{};form.elements.light_enabled.checked=MapPartProfiles.isLight(appearance.value);for(const k of fields)if(k in light&&form.elements[k]){if(form.elements[k].type==='checkbox')form.elements[k].checked=light[k];else form.elements[k].value=light[k];}refreshLight();};
  group.value=c.part_group||document.querySelector('#partTypeFilter')?.value||'props';
  group.onchange=()=>{appearance.innerHTML=choices(group.value).map(t=>option(t,MapCatalog.label(t))).join('');defaults();};
  appearance.onchange=defaults;form.elements.light_enabled.onchange=refreshLight;
  if(!c.part_type)defaults();else refreshLight();
 }
 function collect(form,prior){const data=new FormData(form),c={part_group:data.get('part_group'),part_type:data.get('part_type'),part_width:Number(data.get('part_width')),part_height:Number(data.get('part_height'))};for(const key of fields)c[key]=['walk_over','light_enabled','fire_light','needs_item','needs_roll','steal_needs_item','steal_needs_roll'].includes(key)?data.has(key):key==='light_color'?data.get(key):Number(data.get(key));Object.assign(c,MapOpeningSettings.read(form.querySelector('.map-opening-settings')));if(prior.builtin_part)c.builtin_part=prior.builtin_part;return c;}
 function preview(c){if(c.image_id)return '/api/uploads/'+Number(c.image_id);if(MapSprites.has(c.part_type))return '/assets/map-art/items/'+c.part_type+'.png';return window.MapMaterials?.thumbnail(c.part_type)||'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(MapArt.icon(c.part_type).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" '));}
 function palette(list){
  records=list.filter(r=>r.content?.category==='map_part');const key=JSON.stringify(records.map(r=>[r.id,r.title,r.content]));if(key===signature)return;signature=key;
  if(!records.length)return;
  document.querySelectorAll('[data-map2-catalog]').forEach(host=>{const group=host.dataset.map2Catalog;host.replaceChildren();for(const r of records.filter(r=>r.content.part_group===group||(group==='lighting'&&r.content.light_enabled))){const b=document.createElement('button');b.type='button';b.draggable=true;b.dataset.map2Tool=r.content.part_type;b.dataset.partCard=r.id;b.dataset.catalogType=group;b.title=r.title;const img=new Image();img.src=preview(r.content);img.alt='';img.loading='lazy';const label=document.createElement('span');label.textContent=r.title;b.append(img,label);host.append(b);}});
  document.querySelector('#map2CatalogSearch')?.dispatchEvent(new Event('input'));
 }
 const find=id=>records.find(r=>r.id===Number(id));
 function apply(n,id,size=false){const r=find(id);if(!r)return n;const c=r.content,cx=n.x+n.w/2,cy=n.y+n.h/2;n.part_card_id=r.id;n.part_name=r.title;for(const k of fields)if(c[k]!==undefined)n[k]=c[k];if(c.image_id)n.part_image_id=Number(c.image_id);if(size){const scale=size==='brush-size'?n.w/(c.part_width||80):1;n.w=(c.part_width||80)*scale;n.h=(c.part_height||80)*scale;}if(n.type==='point_light'){n.color=c.light_color||'#ffd58a';n.w=n.h=(c.light_radius||200)*2;n.x=cx-n.w/2;n.y=cy-n.h/2;}return n;}
 window.MapPartCards={fields,groups,names,collapsed,form,bindForm,collect,preview,palette,find,apply};
})();

