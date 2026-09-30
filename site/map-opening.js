/* Shared opening settings for archive templates and placed map parts. */
(function(){
 const defaults={needs_item:false,required_item_id:0,needs_roll:false,open_die_sides:20,open_die_count:1,open_die_bonus:0,open_roll_target:10,open_dice:[]};
 const fields=Object.keys(defaults);
 function markup(){return `<fieldset class="map-opening-base-settings"><legend>Opening requirements</legend>
 <label><input name="needs_item" type="checkbox"> Needs item to open</label>
 <div data-open-item hidden><h4>Required item</h4><div data-open-selected></div><details open><summary>Add items</summary><label>Find an item<input type="search" data-open-item-search placeholder="Search existing items"></label><select name="required_item_id" aria-label="Required item" hidden></select><div data-open-item-cards></div></details><small>The player must have this item. It is not consumed.</small></div>
 <label><input name="needs_roll" type="checkbox"> Dice roll to open</label>
 <div data-open-dice hidden><label>Dice<select name="open_die_sides">${[4,6,8,10,12,20,100].map(n=>`<option value="${n}">D${n}</option>`).join('')}</select></label>
 <label>Number of dice<input name="open_die_count" type="number" min="1" max="100" step="1" required></label>
 <div data-open-extra-dice></div><label>Bonus / penalty<input name="open_die_bonus" type="number" min="-999" max="999" step="1" required></label>
 <label>Total needed<input name="open_roll_target" type="number" min="-999" max="10999" step="1" required></label>
 <small>Roll this total or higher. A successful check stays passed for that character until these requirements change.</small></div>
 <small data-open-empty hidden>Create an item in this campaign to choose an item requirement.</small>
 </fieldset>`;}
 function read(root){const result=Object.fromEntries(fields.filter(k=>k!=='open_dice').map(k=>{const e=root.querySelector(`[name="${k}"]`);return [k,e.type==='checkbox'?e.checked:Number(e.value)];}));result.open_dice=[result.open_die_sides,...[...root.querySelectorAll('[data-open-die]')].map(e=>Number(e.value))].slice(0,result.open_die_count);while(result.open_dice.length<result.open_die_count)result.open_dice.push(result.open_die_sides);return result;}
 function sync(root,value,records,disabled=false){
  const items=records.filter(r=>r.content?.category==='item').sort((a,b)=>a.title.localeCompare(b.title)),select=root.querySelector('[name=required_item_id]');
  root.disabled=disabled;
  const signature=JSON.stringify(items.map(i=>[i.id,i.title]));
  if(root.dataset.items!==signature){root.dataset.items=signature;select.replaceChildren(...items.map(i=>new Option(i.title,i.id)));}
  for(const key of fields.filter(k=>k!=='open_dice')){const input=root.querySelector(`[name="${key}"]`),v=value?.[key]??defaults[key];if(input.type==='checkbox')input.checked=v;else if(document.activeElement!==input)input.value=v;}
  if(!select.value&&items.length){if(value?.required_item_id){select.add(new Option('Unavailable item — choose another',value.required_item_id));select.value=value.required_item_id;}else select.value=items[0].id;}
  root.querySelector('[name=needs_item]').disabled=!items.length&&!value?.needs_item;
  root.querySelector('[data-open-empty]').hidden=!!items.length;
  root.querySelector('[data-open-item]').hidden=!root.querySelector('[name=needs_item]').checked;
  root.querySelector('[data-open-dice]').hidden=!root.querySelector('[name=needs_roll]').checked;
  const selectedHost=root.querySelector('[data-open-selected]'),cardHost=root.querySelector('[data-open-item-cards]'),search=root.querySelector('[data-open-item-search]');
  function cards(){const q=search.value.trim().toLowerCase(),key=JSON.stringify([signature,select.value,q]);if(cardHost.dataset.key===key)return;cardHost.dataset.key=key;cardHost.replaceChildren();selectedHost.replaceChildren();for(const item of items.filter(i=>Number(select.value)===i.id||[i.title,i.content.item_type].join(' ').toLowerCase().includes(q))){const selected=Number(select.value)===item.id,card=RecordCards.create(item,{className:'map-open-item-card',label:(selected?'Remove ':'Add ')+item.title,description:item.content.item_type||'Item',onOpen:()=>{if(selected){root.querySelector('[name=needs_item]').checked=false;select.value='';}else select.value=item.id;select.dispatchEvent(new Event('change',{bubbles:true}));cards();}}),action=document.createElement('b');action.textContent=selected?'Remove':'Add';card.querySelector('.rail-entry-copy').append(action);card.setAttribute('aria-pressed',String(selected));(selected?selectedHost:cardHost).append(card);}if(!cardHost.children.length)cardHost.textContent='No items match your search.';}
  search.oninput=cards;cards();
  const extra=root.querySelector('[data-open-extra-dice]'),dice=value?.open_dice||[],count=value?.open_die_count||1;
  if(extra.children.length!==count-1){extra.replaceChildren();for(let i=1;i<count;i++){const label=document.createElement('label');label.textContent='Dice type '+(i+1);const input=document.createElement('select');input.dataset.openDie=i;input.name='open_die_'+(i+1);for(const sides of [4,6,8,10,12,20,100])input.add(new Option('D'+sides,sides));input.onchange=()=>root.querySelector('[name=open_die_sides]').dispatchEvent(new Event('change',{bubbles:true}));label.append(input);extra.append(label);}}
  for(const input of extra.querySelectorAll('select'))if(document.activeElement!==input)input.value=dice[Number(input.dataset.openDie)]||value?.open_die_sides||20;

 }
 function bind(root,value,records,onChange){sync(root,value,records);root.onchange=e=>{if(!fields.includes(e.target.name))return;if(!e.target.checkValidity()){e.target.reportValidity();return;}const next=read(root);sync(root,next,records);onChange?.(next);};}
 window.MapOpeningSettings={defaults,fields,markup,read,sync,bind};
})();

/* Shared opening settings for archive templates and placed map parts. */
(function(){
 const defaults={steal_needs_item:false,steal_required_item_id:0,steal_needs_roll:false,steal_open_die_sides:20,steal_open_die_count:1,steal_open_die_bonus:0,steal_open_roll_target:10,steal_open_dice:[]};
 const fields=Object.keys(defaults);
 function markup(){return `<fieldset class="map-stealing-settings"><legend>Take / steal requirements</legend>
 <label><input name="steal_needs_item" type="checkbox"> Needs item to take or steal</label>
 <div data-steal-item hidden><h4>Required item</h4><div data-steal-selected></div><details open><summary>Add items</summary><label>Find an item<input type="search" data-steal-item-search placeholder="Search existing items"></label><select name="steal_required_item_id" aria-label="Required item" hidden></select><div data-steal-item-cards></div></details><small>The player must have this item. It is not consumed.</small></div>
 <label><input name="steal_needs_roll" type="checkbox"> Dice roll to take or steal</label>
 <div data-steal-dice hidden><label>Dice<select name="steal_open_die_sides">${[4,6,8,10,12,20,100].map(n=>`<option value="${n}">D${n}</option>`).join('')}</select></label>
 <label>Number of dice<input name="steal_open_die_count" type="number" min="1" max="100" step="1" required></label>
 <div data-steal-extra-dice></div><label>Bonus / penalty<input name="steal_open_die_bonus" type="number" min="-999" max="999" step="1" required></label>
 <label>Total needed<input name="steal_open_roll_target" type="number" min="-999" max="10999" step="1" required></label>
 <small>Roll this total or higher. Checked after opening, when taking or stealing contents. Each successful roll allows one transfer of the selected quantity.</small></div>
 <small data-steal-empty hidden>Create an item in this campaign to choose an item requirement.</small>
 </fieldset>`;}
 function read(root){const result=Object.fromEntries(fields.filter(k=>k!=='steal_open_dice').map(k=>{const e=root.querySelector(`[name="${k}"]`);return [k,e.type==='checkbox'?e.checked:Number(e.value)];}));result.steal_open_dice=[result.steal_open_die_sides,...[...root.querySelectorAll('[data-steal-die]')].map(e=>Number(e.value))].slice(0,result.steal_open_die_count);while(result.steal_open_dice.length<result.steal_open_die_count)result.steal_open_dice.push(result.steal_open_die_sides);return result;}
 function sync(root,value,records,disabled=false){
  const items=records.filter(r=>r.content?.category==='item').sort((a,b)=>a.title.localeCompare(b.title)),select=root.querySelector('[name=steal_required_item_id]');
  root.disabled=disabled;
  const signature=JSON.stringify(items.map(i=>[i.id,i.title]));
  if(root.dataset.items!==signature){root.dataset.items=signature;select.replaceChildren(...items.map(i=>new Option(i.title,i.id)));}
  for(const key of fields.filter(k=>k!=='steal_open_dice')){const input=root.querySelector(`[name="${key}"]`),v=value?.[key]??defaults[key];if(input.type==='checkbox')input.checked=v;else if(document.activeElement!==input)input.value=v;}
  if(!select.value&&items.length){if(value?.steal_required_item_id){select.add(new Option('Unavailable item — choose another',value.steal_required_item_id));select.value=value.steal_required_item_id;}else select.value=items[0].id;}
  root.querySelector('[name=steal_needs_item]').disabled=!items.length&&!value?.steal_needs_item;
  root.querySelector('[data-steal-empty]').hidden=!!items.length;
  root.querySelector('[data-steal-item]').hidden=!root.querySelector('[name=steal_needs_item]').checked;
  root.querySelector('[data-steal-dice]').hidden=!root.querySelector('[name=steal_needs_roll]').checked;
  const selectedHost=root.querySelector('[data-steal-selected]'),cardHost=root.querySelector('[data-steal-item-cards]'),search=root.querySelector('[data-steal-item-search]');
  function cards(){const q=search.value.trim().toLowerCase(),key=JSON.stringify([signature,select.value,q]);if(cardHost.dataset.key===key)return;cardHost.dataset.key=key;cardHost.replaceChildren();selectedHost.replaceChildren();for(const item of items.filter(i=>Number(select.value)===i.id||[i.title,i.content.item_type].join(' ').toLowerCase().includes(q))){const selected=Number(select.value)===item.id,card=RecordCards.create(item,{className:'map-open-item-card',label:(selected?'Remove ':'Add ')+item.title,description:item.content.item_type||'Item',onOpen:()=>{if(selected){root.querySelector('[name=steal_needs_item]').checked=false;select.value='';}else select.value=item.id;select.dispatchEvent(new Event('change',{bubbles:true}));cards();}}),action=document.createElement('b');action.textContent=selected?'Remove':'Add';card.querySelector('.rail-entry-copy').append(action);card.setAttribute('aria-pressed',String(selected));(selected?selectedHost:cardHost).append(card);}if(!cardHost.children.length)cardHost.textContent='No items match your search.';}
  search.oninput=cards;cards();
  const extra=root.querySelector('[data-steal-extra-dice]'),dice=value?.steal_open_dice||[],count=value?.steal_open_die_count||1;
  if(extra.children.length!==count-1){extra.replaceChildren();for(let i=1;i<count;i++){const label=document.createElement('label');label.textContent='Dice type '+(i+1);const input=document.createElement('select');input.dataset.stealDie=i;input.name='steal_open_die_'+(i+1);for(const sides of [4,6,8,10,12,20,100])input.add(new Option('D'+sides,sides));input.onchange=()=>root.querySelector('[name=steal_open_die_sides]').dispatchEvent(new Event('change',{bubbles:true}));label.append(input);extra.append(label);}}
  for(const input of extra.querySelectorAll('select'))if(document.activeElement!==input)input.value=dice[Number(input.dataset.stealDie)]||value?.steal_open_die_sides||20;

 }
 function bind(root,value,records,onChange){sync(root,value,records);root.onchange=e=>{if(!fields.includes(e.target.name))return;if(!e.target.checkValidity()){e.target.reportValidity();return;}const next=read(root);sync(root,next,records);onChange?.(next);};}
 window.MapStealingSettings={defaults,fields,markup,read,sync,bind};
})();

(function(){const opening=window.MapOpeningSettings,theft=window.MapStealingSettings;
 const fields=[...opening.fields,...theft.fields],defaults={...opening.defaults,...theft.defaults};
 const read=root=>({...opening.read(root.querySelector('.map-opening-base-settings')),...theft.read(root.querySelector('.map-stealing-settings'))});
 const sync=(root,value,records,disabled=false)=>{opening.sync(root.querySelector('.map-opening-base-settings'),value,records,disabled);theft.sync(root.querySelector('.map-stealing-settings'),value,records,disabled);};
 window.MapOpeningSettings={fields,defaults,read,sync,markup:()=>'<fieldset class="map-opening-settings">'+opening.markup()+theft.markup()+'</fieldset>',bind(root,value,records,onChange){sync(root,value,records);root.onchange=e=>{if(!fields.includes(e.target.name))return;if(!e.target.checkValidity()){e.target.reportValidity();return;}const next=read(root);sync(root,next,records);onChange?.(next);};}};
})();

