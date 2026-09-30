(function () {
  'use strict';
  const R=window.TabletopRules;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const label=key=>key.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
  const input=(key,title,type='text',value='',extra='')=>`<label>${title}<input class="form-control" name="tt_${key}" type="${type}" value="${escape(value)}" ${extra}></label>`;
  const number=(key,title,value=0,max=999,min=0)=>input(key,title,'number',value,`min="${min}" max="${max}" step="1"`);
  const select=(key,title,options)=>`<label>${title}<select class="form-control" name="tt_${key}">${options.map(o=>Array.isArray(o)?`<option value="${escape(o[0])}">${escape(o[1])}</option>`:`<option>${escape(o)}</option>`).join('')}</select></label>`;
  const check=(key,title)=>`<label class="tt-check"><input type="checkbox" name="tt_${key}"> ${title}</label>`;
  const memo=(key,title,placeholder='')=>`<label>${title}<textarea class="form-control" rows="3" name="tt_${key}" maxlength="12000" placeholder="${escape(placeholder)}"></textarea></label>`;
  const group=(title,body,help='')=>`<section class="tt-section"><h4>${title}</h4>${body}${help?`<details class="editor-help"><summary>About ${title.toLowerCase()}</summary><p class="tt-help">${help}</p></details>`:''}</section>`;
  const grid=body=>`<div class="tt-grid">${body}</div>`;
  let encounterRows=[];
  let activeTurn='';
  let inheritedRules={};
  const character=type=>['character','character_template'].includes(type);
  function fields(type,content={},campaign={}) {
    inheritedRules=campaign.tabletop||{};
    let body='';
    if(type==='campaign') body=group('Table rules',grid(select('ruleset','Rules version',[['2024','Revised fifth edition (2024)'],['2014','Fifth edition (2014)'],['custom','House rules / other']])+select('advancement','Advancement',[['milestone','Story milestones (DM awards levels)'],['xp','Experience points']]))+memo('house_rules','House rules & allowed sources','Record exceptions, books, starting level, and table agreements.'),'New 2024 campaigns include a starter reference library: equipment, magic items, starter spells, actions and classes. Nothing is automatically awarded to characters. Other rule versions start without this revised library. Changing rules later does not rewrite existing cards.');
    if(character(type)) {
      body+=group('At the table',grid(select('ruleset','Sheet rules',[['2024','Revised fifth edition (2024)'],['2014','Fifth edition (2014)'],['custom','House rules / other']])+select('advancement','Advancement',[['milestone','Story milestones'],['xp','Experience points']])+input('multiclass','Class levels, if multiclassed','text','','placeholder="Fighter 3 / Wizard 2" maxlength="160"')+number('hit_dice_spent','Hit Dice spent',0,20)+number('exhaustion','Exhaustion level',0,6)+input('concentration','Concentrating on','text','','maxlength="120" placeholder="Spell / effect and remaining duration"'))+check('inspiration','Heroic Inspiration / Inspiration available')+'<p class="tt-help" id="ttClassHint"></p><p class="tt-help" id="ttConditionHint"></p>', 'Track resources here; class features and the DM determine their limits. Save the sheet to keep changes.');
      body+='<datalist id="ttClasses">'+Object.keys(R.classes).map(c=>'<option>'+c+'</option>').join('')+'</datalist>';
      body+=group('Hit point tracker',grid(number('hp_amount','Damage / healing amount',0,999999))+'<div class="tt-actions"><button type="button" data-tt-hp="damage">Apply damage</button><button type="button" data-tt-hp="heal">Heal</button><button type="button" data-tt-hp="temp">Gain temporary HP</button><button type="button" id="ttStartHP">Set level-1 HP &amp; Hit Die</button></div><p class="tt-help" id="ttHpStatus" aria-live="polite">Damage uses temporary HP first. Enter damage after resistance or other reductions.</p>');
      body+=group('Saving throws & skills','<div class="tt-actions">'+select('roll_mode','Roll mode',[['normal','Normal'],['advantage','Advantage'],['disadvantage','Disadvantage']])+'</div><div class="tt-skills">'+R.abilities.map(a=>training('save_'+a,label(a)+' save',a,false)).join('')+'</div><div class="tt-skills">'+Object.entries(R.skills).map(([name,a])=>training('skill_'+R.skillKey(name),name,a,true)).join('')+'</div><output class="tt-result" id="ttSheetRoll" aria-live="polite">Choose a skill or saving throw to roll.</output>'+grid(number('initiative_extra','Initiative other bonus',0,50,-50)+number('perception_extra','Passive Perception other bonus',0,50,-50))+'<div class="tt-actions"><button type="button" id="ttDerive">Update initiative & passive Perception</button></div>', 'Training adds proficiency once; expertise doubles it. Other bonuses are entered separately. These rolls include the 2024 exhaustion penalty; apply other conditions and features at the table.');
      body+=group('Conditions','<div class="tt-conditions">'+R.conditions.map(c=>check('condition_'+c.toLowerCase(),c)).join('')+'</div>'+memo('condition_notes','Durations, sources & reminders','Who caused the effect? When does it end? What save can remove it?'));
      body+=group('Spellcasting',grid(select('spell_ability','Spellcasting ability',[['','Not a spellcaster'],...R.abilities.map(a=>[a,label(a)])])+number('spell_attack_extra','Other spell attack bonus',0,99,-99)+number('spell_dc_extra','Other spell save DC bonus',0,99,-99))+'<p class="tt-help" id="ttSpellMath"></p><div class="tt-slots">'+Array.from({length:9},(_,i)=>`<div><strong>Level ${i+1}</strong>${number('slot_'+(i+1)+'_max','Maximum',0,20)}${number('slot_'+(i+1)+'_remaining','Remaining',0,20)}</div>`).join('')+'</div>'+grid(number('pact_level','Pact slot level',1,5,1)+number('pact_max','Pact slots maximum',0,10)+number('pact_remaining','Pact slots remaining',0,10))+memo('spell_notes','Prepared spells & additional spellcasting','Note each class’s prepared spells and ability separately if multiclassed; include rituals and limited free castings.'),'Copy slot totals from your class or multiclass table. Spell level differs from character level. Cantrips use no slots. Track Pact Magic separately.');
      body+=group('Features & equipment',memo('features','Features, feats & limited uses','For each ability: activation, uses remaining / maximum, and recovery condition.')+memo('proficiencies','Armor training, weapons, tools & languages')+memo('defenses','Resistances, immunities & vulnerabilities')+memo('inventory','Carried equipment & currency','Quantities, weight, coins, and who carries each item.')+memo('attunement','Attuned items','Normally no more than three; record exceptions granted by a feature.'));
    }
    if(type==='spell') body=group('Casting requirements',grid(check('verbal','Verbal (V)')+check('somatic','Somatic (S)')+check('material','Material (M)')+check('concentration','Requires concentration')+check('ritual','Ritual'))+input('materials','Material components & cost','text','','maxlength="500"')+check('consumed','Material component is consumed')+grid(select('resolution','Resolution',['Effect only','Spell attack','Saving throw','Attack and saving throw'])+select('save_ability','Target save',['None',...R.abilities.map(label)])+input('area','Targets / area','text','','maxlength="160"'))+memo('upcast','Using a higher-level slot')+memo('spell_access','Who has it prepared / other access'),'Record the spell’s exact requirements. A focus does not replace priced or consumed materials. Linked users alone do not mean the spell is prepared.');
    if(type==='item') body=group('Using this item',grid(number('weight','Weight per item (lb.)',0,999999)+input('value','Value','text','','placeholder="50 gp" maxlength="80"')+input('activation','Activation','text','','placeholder="Passive, action, bonus action…" maxlength="120"')+select('equipment_state','Equipment state',['Carried','Equipped / wielded','Stored','Expended'])+check('requires_attunement','Requires attunement')+input('attuned_to','Attuned character','text','','maxlength="120"')+number('charges_max','Maximum charges',0,9999)+number('charges_remaining','Charges remaining',0,9999)+input('recharge','Recharge condition','text','','placeholder="At dawn, short rest, none…" maxlength="240"'))+memo('item_properties','Weapon, armor & other properties','Damage dice / type, range, weapon properties and mastery; armor AC formula and requirements.')+memo('requirements','Attunement / use prerequisites'),'Quantity, charges and attunement are separate. Nonmagical gear has no magic-item rarity. Apply equipped effects to the sheet when appropriate.');
    if(type==='attack') body=group('Timing & resolution',grid(select('activation','Activation',['Action','Bonus Action','Reaction','No action','Part of an action','Legendary Action'])+input('trigger','Trigger / prerequisites','text','','maxlength="240"')+select('save_ability','Saving throw ability',['None',...R.abilities.map(label)])+number('uses_max','Maximum uses',0,9999)+number('uses_remaining','Uses remaining',0,9999)+input('recharge','Recovery','text','','maxlength="240"'))+memo('on_save','On a successful / failed save')+memo('limits','Limits & additional effects','Once per turn / round, conditions, duration, and required resource.'),'An attack roll and a saving throw resolve differently. Record an attack bonus or a save DC as appropriate; a bonus action requires an ability that grants it.');
    if(type==='encounter') {
      encounterRows=JSON.parse(JSON.stringify(content.tabletop?.combatants||[]));activeTurn=content.tabletop?.active_turn||'';
      body=group('Initiative & round tracker',grid(number('round','Round',1,9999,1))+ '<div class="tt-actions"><button type="button" id="ttAddCombatant">＋ Combatant</button><button type="button" id="ttSortInitiative">Sort initiative</button><button type="button" id="ttNextTurn">Next turn</button></div><div id="ttCombatants"></div><p class="tt-help" id="ttTurnStatus" aria-live="polite"></p>'+memo('environment','Terrain, cover & objectives','5-foot squares; difficult terrain costs extra movement. Describe exits, hazards and victory conditions.')+memo('turn_notes','Turn resources & ongoing effects','Track actions, bonus actions, reactions, concentration and start/end-of-turn effects.'),'Roll initiative once, enter totals, then sort. Use arrows to resolve ties. A round represents about six seconds. These entries are encounter notes, not automatic changes to linked character sheets. Save to share updates; unrevealed encounters remain private.');
    }
    if(type==='session') body=group('Session notes',memo('discoveries','People, places & clues')+memo('decisions','Decisions & consequences')+memo('rewards','Treasure, XP & milestone awards')+memo('next_session','Unresolved leads & next session'));
    if(['character','npc','encounter'].includes(type)){const parts=MapTrade.split(content.tabletop?.money_cp||0);body=group('Money held','<div class="coin-inputs">'+MapTrade.denominations.map(([unit,name])=>input('money_'+unit,name,'number',parts[unit],'min="0" step="1" max="1000000000000"') .replace('<label>','<label><img class="coin-image coin-'+unit+'" src="/assets/coins/two-coins.svg" alt="">')).join('')+'</div>','100 copper = 1 silver · 100 silver = 1 gold. Trades and coin transfers update this balance automatically. The DM can set it.')+body;}
    if(['item','spell','attack'].includes(type))body=group('Monetary value',input('value_gold','Sell value per item (gp)','number',MapTrade.value({content})/10000,'min="0" step="0.0001" max="10000000000"'),'This is the amount a merchant pays for one item. Equipment uses its listed cost; magic items use their rarity value (potions are halved). Add the base gear cost for generic magic weapons/armor. Otherwise unpriced cards start at 0. Shop buying prices are set separately.')+body;
    if(character(type)) body+=group('Equipment rules',grid(select('equipment_size','Creature size',['Medium','Small','Tiny','Large','Huge','Gargantuan'])+select('equipment_order','Cleric / Druid order',[['','None'],['protector','Cleric · Protector'],['warden','Druid · Warden']])+input('equipment_armor_training','Additional armor training','text','','placeholder="light, medium, heavy, shield"')+input('equipment_weapon_training','Additional weapon proficiency','text','','placeholder="martial, Longsword, Rapier"')+input('equipment_coin_weight','Actual coin weight (lb; blank if unknown)','number','','min="0" step="0.01"'))+check('equipment_powerful_build','A feature doubles carrying capacity')+check('equipment_reviewed','DM has verified multiclass equipment training'),'The DM saves training, size and feature exceptions here. Free-text class features do not grant equipment permissions automatically. Equip and unequip from the inventory; the sheet’s manual AC remains available for effects not covered by equipment.');
    if(type==='item') body+=group('Equipment fitting',grid(input('equipment_base','Base equipment name','text','','placeholder="Longsword, Plate, Shield, Leather Armor…" maxlength="100"')+select('equipment_slot','Custom item position',[['','Use base item rules'],...['main_hand','off_hand','both_hands','head','cloak','hands','feet','bracers','ring','neck','belt','body'].map(s=>[s,label(s)])])+number('equipment_ac_bonus','Magic AC bonus while equipped',0,10)+number('equipment_attack_bonus','Magic weapon attack bonus',0,10))+check('equipment_reviewed','DM verified this item’s prerequisites and exceptions')+check('equipment_cursed','Curse prevents ending attunement'),'Standard equipment is recognized by its exact name or base item. Custom items need a position and DM review. Record a magic bonus separately; attunement-gated bonuses stay inactive until attuned. Other magical effects remain in the item description. The legacy equipment-state field is not a character loadout.');
    if(type==='item') body+=group('Special use prerequisites',grid(R.abilities.map(a=>number('equipment_min_'+a,label(a)+' minimum (0 = none)',0,30)).join('')+input('equipment_classes','Required classes, if the item explicitly restricts use','text','','placeholder="Wizard, Sorcerer" maxlength="200"')),'Only enter explicit item-specific requirements here. Ordinary armor Strength and Heavy weapon thresholds are penalties, not equip restrictions, and are checked from the base equipment automatically.');
    return body?'<div class="tt-panel">'+body+'</div>':'';
  }
  function training(key,title,ability,expertise) {
    return `<div class="tt-training" data-training="${key}" data-ability="${ability}">${select(key,title,[['0','Untrained'],['1','Proficient'],...(expertise?[['2','Expertise']]:[])])}${number(key+'_extra','Other bonus',0,99,-99)}<button type="button" data-tt-roll="${key}" title="Roll ${escape(title)}">+0</button></div>`;
  }
  function field(key){return document.querySelector('#workForm [name="'+key+'"]');}
  function value(key){return field(key)?.value??'';}
  function set(key,v){if(field(key))field(key).value=v;}
  function hydrate(content={}) {
    const weight=field('tt_weight');if(weight)weight.step='0.01';
    const data={ruleset:inheritedRules.ruleset||'2024',advancement:inheritedRules.advancement||'milestone',...(content.tabletop||{})};
    if(field('tt_money_cp')){const parts=MapTrade.split(data.money_cp||0);MapTrade.denominations.forEach(([unit])=>set('tt_money_'+unit,parts[unit]));}
    Object.entries(data).filter(([key])=>!['money_cp','money_sp','money_gp'].includes(key)).forEach(([key,v])=>{const el=field('tt_'+key);if(el)el.type==='checkbox'?el.checked=!!v:el.value=v;});
    if(Number(data.equipment_coin_weight)<0)set('tt_equipment_coin_weight','');
    if(character(value('category'))){
      if(!('initiative_extra' in data))set('tt_initiative_extra',R.integer(content.initiative)-R.modifier(content.dexterity??10));
      if(!('perception_extra' in data))set('tt_perception_extra',R.integer(content.passive_perception,10)-10-R.modifier(content.wisdom??10));
    }
    renderCombatants();update();
  }
  function update() {
    if(!character(value('category')))return;
    const level=R.clamp(value('character_level'),1,20), pb=R.proficiency(level);
    const penalty=value('tt_ruleset')==='2024'?2*R.integer(value('tt_exhaustion')):0;
    document.querySelectorAll('[data-training]').forEach(row=>{
      const key=row.dataset.training,total=R.modifier(value(row.dataset.ability))+R.integer(value('tt_'+key))*pb+R.integer(value('tt_'+key+'_extra'))-penalty;
      row.querySelector('button').textContent=R.signed(total);row.querySelector('button').dataset.bonus=total;
    });
    const ability=value('tt_spell_ability'), spell=document.getElementById('ttSpellMath');
    if(spell)spell.textContent=ability?'Spell attack '+R.signed(R.modifier(value(ability))+pb+R.integer(value('tt_spell_attack_extra'))-penalty)+' · Spell save DC '+(8+R.modifier(value(ability))+pb+R.integer(value('tt_spell_dc_extra'))):'Choose a spellcasting ability to calculate attack and save DC.';
    const cls=Object.keys(R.classes).find(c=>c.toLowerCase()===value('character_class').trim().toLowerCase());
    document.getElementById('ttClassHint').textContent=cls?`${cls}: ${R.classes[cls]} Hit Die. At first character level, maximum HP starts at ${Number(R.classes[cls].slice(1))+R.modifier(value('constitution'))} before other features. Check your class table when leveling; existing HP and features are not replaced.`:'For multiclass characters, total class levels must equal character level. Track mixed Hit Dice in feature notes.';
    const exhaustion=R.integer(value('tt_exhaustion'));
    document.getElementById('ttConditionHint').textContent=exhaustion===6?'Exhaustion 6: death.':value('tt_ruleset')==='2024'?`Exhaustion: −${penalty} to D20 Tests; speed reduced by ${5*exhaustion} ft. Displayed skill/save rolls include the penalty; base Speed remains unchanged.`:'Use your edition’s condition rules. No exhaustion penalty is automatically applied to rolls.';
    if(value('tt_advancement')==='milestone')document.getElementById('characterNextLevel').textContent='The DM awards levels at story milestones. XP does not change your level automatically.';
  }
  function collect(form,base={}) {
    const data={...(base.tabletop||{})};
    form.querySelectorAll('[name^="tt_"]').forEach(el=>{const key=el.name.slice(3);if(['hp_amount','roll_mode','money_cp','money_sp','money_gp','value_gold'].includes(key))return;data[key]=el.type==='checkbox'?el.checked:el.type==='number'?(key==='weight'?Number(el.value):R.integer(el.value)):el.value;});
    if(field('tt_equipment_coin_weight')) data.equipment_coin_weight=value('tt_equipment_coin_weight')===''?-1:Number(value('tt_equipment_coin_weight'));
    if(field('tt_money_cp')){data.money_cp=MapTrade.denominations.reduce((sum,[unit,,rate])=>{const amount=Number(field('tt_money_'+unit).value);if(!Number.isSafeInteger(amount)||amount<0)throw Error('Enter whole, nonnegative coins.');return sum+amount*rate;},0);if(data.money_cp>1e12)throw Error('This coin total is too large.');}
    if(field('tt_value_gold'))data.value_cp=MapTrade.cp(field('tt_value_gold').value);
    if(character(value('category'))){
      if(R.integer(value('hp_current'))>R.integer(value('hp_max')))throw new Error('Current HP cannot exceed maximum HP. Temporary HP belongs in its separate field.');
      if(R.integer(data.hit_dice_spent)>R.integer(value('character_level')))throw new Error('Spent Hit Dice cannot exceed total character level.');
      for(let i=1;i<=9;i++)if(data['slot_'+i+'_remaining']>data['slot_'+i+'_max'])throw new Error('Level '+i+' remaining slots cannot exceed their maximum.');
      if(data.pact_remaining>data.pact_max)throw new Error('Remaining Pact Magic slots cannot exceed their maximum.');
    }
    if(data.charges_remaining>data.charges_max)throw new Error('Remaining charges cannot exceed maximum charges.');
    if(data.uses_remaining>data.uses_max)throw new Error('Remaining uses cannot exceed maximum uses.');
    if(value('category')==='encounter'){data.combatants=encounterRows;data.active_turn=activeTurn;}
    return data;
  }
  function renderCombatants() {
    const host=document.getElementById('ttCombatants');if(!host)return;
    host.innerHTML=encounterRows.map((row,i)=>`<div class="tt-combatant ${row.id===activeTurn?'tt-active':''}" data-combatant="${escape(row.id)}"><label>Name<input class="form-control" data-key="name" maxlength="120" value="${escape(row.name)}"></label><label>Initiative<input class="form-control" data-key="initiative" type="number" min="-99" max="99" value="${escape(row.initiative)}"></label><label>HP<input class="form-control" data-key="hp" type="number" min="0" max="999999" value="${escape(row.hp)}"></label><label>Conditions / notes<input class="form-control" data-key="notes" maxlength="500" value="${escape(row.notes)}"></label><div class="tt-actions"><button type="button" data-turn="${i}" aria-label="Make ${escape(row.name)} active">▶</button><button type="button" data-up="${i}" aria-label="Move ${escape(row.name)} earlier">↑</button><button type="button" data-remove="${i}" aria-label="Remove ${escape(row.name)}">×</button></div></div>`).join('');
    document.getElementById('ttTurnStatus').textContent=encounterRows.length?'Current turn: '+(encounterRows.find(r=>r.id===activeTurn)?.name||'Choose a combatant')+'. Reactions refresh at the start of that creature’s turn.':'Add PCs and creatures, then enter their rolled initiative totals.';
  }
  function detail(content) {
    const data=content.tabletop||{}, type=content.category;let body='';
    if(character(type)) {
      const pb=R.proficiency(content.character_level);
      body+=`<p>Initiative ${R.signed(R.integer(content.initiative))} · Speed ${R.integer(content.speed,30)} ft. · Passive Perception ${R.integer(content.passive_perception,10)}</p>`;
      body+=`<p>${escape(content.hit_die||'d8')} Hit Dice: ${R.integer(content.character_level,1)-R.integer(data.hit_dice_spent)} unspent · Death saves: ${R.integer(content.death_save_successes)} successes / ${R.integer(content.death_save_failures)} failures</p>`;
      body+=`<p>Concentration: ${escape(data.concentration||'None recorded')} · Inspiration: ${data.inspiration?'Available':'Not marked'} · Exhaustion: ${R.integer(data.exhaustion)}</p>`;
      const active=R.conditions.filter(c=>data['condition_'+c.toLowerCase()]);if(active.length)body+='<p>Conditions: '+active.join(', ')+'</p>';
      if(data.spell_ability)body+='<p>Spell attack '+R.signed(R.modifier(content[data.spell_ability])+pb+R.integer(data.spell_attack_extra))+' · Spell save DC '+(8+R.modifier(content[data.spell_ability])+pb+R.integer(data.spell_dc_extra))+' (before situational penalties)</p>';
      const slots=[];for(let i=1;i<=9;i++)if(data['slot_'+i+'_max'])slots.push('L'+i+': '+data['slot_'+i+'_remaining']+'/'+data['slot_'+i+'_max']);
      if(data.pact_max)slots.push('Pact L'+data.pact_level+': '+data.pact_remaining+'/'+data.pact_max);
      if(slots.length)body+='<p>Slots remaining — '+escape(slots.join(' · '))+'</p>';
      body+='<p><strong>Saving throws:</strong> '+R.abilities.map(a=>label(a)+' '+R.signed(R.modifier(content[a])+R.integer(data['save_'+a])*pb+R.integer(data['save_'+a+'_extra']))).join(' · ')+'</p>';
      body+='<p><strong>Skills:</strong> '+Object.entries(R.skills).map(([name,a])=>name+' '+R.signed(R.modifier(content[a])+R.integer(data['skill_'+R.skillKey(name)])*pb+R.integer(data['skill_'+R.skillKey(name)+'_extra']))).join(' · ')+' (before situational penalties)</p>';
    }
    if(type==='encounter' && Array.isArray(data.combatants))body+='<p>Round '+R.integer(data.round,1)+'</p><ol>'+data.combatants.filter(r=>r&&typeof r==='object').map(r=>'<li>'+escape(r.name)+' · initiative '+R.integer(r.initiative)+' · '+R.integer(r.hp)+' HP'+(r.id===data.active_turn?' · Current turn':'')+(r.notes?' · '+escape(r.notes):'')+'</li>').join('')+'</ol>';
    const names={ruleset:'Rules version',advancement:'Advancement',house_rules:'House rules',multiclass:'Class levels',condition_notes:'Condition reminders',features:'Features & limited uses',proficiencies:'Training & languages',defenses:'Defenses',inventory:'Inventory',attunement:'Attuned items',spell_notes:'Spell notes',materials:'Materials',area:'Targets / area',resolution:'Resolution',save_ability:'Saving throw',upcast:'Higher-level casting',spell_access:'Prepared / accessible to',weight:'Weight (lb.)',value:'Value',activation:'Activation',equipment_state:'Equipment state',attuned_to:'Attuned to',recharge:'Recovery',item_properties:'Properties',requirements:'Requirements',trigger:'Trigger',on_save:'Save effects',limits:'Limits',environment:'Terrain & objectives',turn_notes:'Turn reminders',discoveries:'Discoveries',decisions:'Decisions',rewards:'Rewards',next_session:'Next session'};
    Object.entries(names).forEach(([key,name])=>{if(data[key]!==undefined && data[key]!=='' && data[key]!=='None')body+=`<p><strong>${name}:</strong> ${escape(data[key])}</p>`;});
    if(['character','npc','encounter'].includes(type))body+='<div>Money held: '+MapTrade.coinSummary(data.money_cp||0).outerHTML+'</div>';
    if(['item','spell','attack'].includes(type))body+='<div>Sell value: '+MapTrade.coinSummary(MapTrade.value({content})).outerHTML+'</div>';
    if(type==='spell')body+='<p>Components: '+(['verbal','somatic','material'].filter(k=>data[k]).map(k=>k[0].toUpperCase()).join(', ')||'Not recorded')+' · Concentration: '+(data.concentration?'Yes':'No')+' · Ritual: '+(data.ritual?'Yes':'No')+' · Consumed materials: '+(data.consumed?'Yes':'No')+'</p>';
    if(type==='item')body+='<p>Requires attunement: '+(data.requires_attunement?'Yes':'No')+(data.charges_max?' · Charges: '+R.integer(data.charges_remaining)+'/'+R.integer(data.charges_max):'')+'</p>';
    if(type==='attack'&&data.uses_max)body+='<p>Uses remaining: '+R.integer(data.uses_remaining)+'/'+R.integer(data.uses_max)+'</p>';
    if(content.source_url && /^https:\/\/www\.dndbeyond\.com\/sources\/dnd\/br-2024\/[a-z-]+$/.test(content.source_url) || /^https:\/\/media\.dndbeyond\.com\/compendium-images\/srd\/5\.2\/SRD_CC_v5\.2\.1\.pdf#page=\d+$/.test(content.source_url||''))body+='<p><a href="'+escape(content.source_url)+'" target="_blank" rel="noopener noreferrer">Full official rule</a> · <a href="rules-attribution.html" target="_blank" rel="noopener noreferrer">SRD attribution</a></p>';
    return body?group('Tabletop reference',body):'';
  }
  document.addEventListener('input',event=>{
    const row=event.target.closest('[data-combatant]');if(row){const item=encounterRows.find(r=>r.id===row.dataset.combatant);if(item)item[event.target.dataset.key]=event.target.type==='number'?R.integer(event.target.value):event.target.value;}
  });
  document.addEventListener('change',event=>{if(event.target.closest('#workForm'))update();});
  document.addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.dataset.ttRoll){try{const result=R.roll('1d20'+R.signed(Number(b.dataset.bonus)),value('tt_roll_mode'));document.getElementById('ttSheetRoll').textContent=label(b.dataset.ttRoll)+': '+result.total+' — '+result.breakdown+' ('+result.mode+').';}catch(e){document.getElementById('ttSheetRoll').textContent=e.message;}}
    if(b.id==='ttDerive'){
      set('initiative',R.modifier(value('dexterity'))+R.integer(value('tt_initiative_extra')));
      set('passive_perception',10+R.modifier(value('wisdom'))+R.integer(value('tt_skill_perception'))*R.proficiency(value('character_level'))+R.integer(value('tt_skill_perception_extra'))+R.integer(value('tt_perception_extra')));
    }
    if(b.id==='ttStartHP'){
      const cls=Object.keys(R.classes).find(c=>c.toLowerCase()===value('character_class').trim().toLowerCase());
      if(!cls||R.integer(value('character_level'))!==1){document.getElementById('ttHpStatus').textContent='Choose a single core class at character level 1 first. At higher levels, use your class advancement table.';return;}
      const hp=Math.max(1,Number(R.classes[cls].slice(1))+R.modifier(value('constitution')));
      set('hp_max',hp);set('hp_current',hp);set('hit_die',R.classes[cls]);set('death_save_successes',0);set('death_save_failures',0);
      document.getElementById('ttHpStatus').textContent='Level-1 class HP set. Add any species, feat or other feature bonuses before saving.';
    }
    if(b.dataset.ttHp){
      const amount=R.clamp(value('tt_hp_amount'),0,999999);let message='';
      if(b.dataset.ttHp==='damage'){const state={hp_current:R.integer(value('hp_current')),hp_max:R.integer(value('hp_max')),hp_temporary:R.integer(value('hp_temporary'))};Object.entries(R.damage(state,amount)).forEach(([k,v])=>set(k,v));message='Damage applied. Resolve concentration saves, damage at 0 HP, massive damage and other effects at the table.';}
      if(b.dataset.ttHp==='heal'){set('hp_current',Math.min(R.integer(value('hp_max')),R.integer(value('hp_current'))+amount));message='Healing applied.';}
      if(b.dataset.ttHp==='temp'){set('hp_temporary',Math.max(R.integer(value('hp_temporary')),amount));message='Kept the higher temporary HP pool; temporary HP does not stack or revive a creature.';}
      if(R.integer(value('hp_current'))>0 && b.dataset.ttHp==='heal'){set('death_save_successes',0);set('death_save_failures',0);}
      document.getElementById('ttHpStatus').textContent=message+' Save to keep changes.';
    }
    if(b.id==='ttAddCombatant'){if(encounterRows.length>=50)return;const id=crypto.randomUUID();encounterRows.push({id,name:'Combatant '+(encounterRows.length+1),initiative:0,hp:1,notes:''});if(!activeTurn)activeTurn=id;renderCombatants();}
    if(b.id==='ttSortInitiative'){encounterRows.sort((a,b)=>b.initiative-a.initiative);activeTurn=encounterRows[0]?.id||'';renderCombatants();}
    if(b.id==='ttNextTurn' && encounterRows.length){const i=encounterRows.findIndex(r=>r.id===activeTurn);activeTurn=encounterRows[(i+1)%encounterRows.length].id;if(i===encounterRows.length-1)set('tt_round',R.integer(value('tt_round'),1)+1);renderCombatants();}
    if(b.hasAttribute('data-turn')){activeTurn=encounterRows[Number(b.dataset.turn)].id;renderCombatants();}
    if(b.hasAttribute('data-up')){const i=Number(b.dataset.up);if(i>0)[encounterRows[i-1],encounterRows[i]]=[encounterRows[i],encounterRows[i-1]];renderCombatants();}
    if(b.hasAttribute('data-remove')){const i=Number(b.dataset.remove),removed=encounterRows.splice(i,1)[0];if(removed.id===activeTurn)activeTurn=encounterRows[Math.min(i,encounterRows.length-1)]?.id||'';renderCombatants();}
  });
  window.Tabletop={fields,hydrate,update,collect,detail};
  $(function(){
    $('#tabletopDiceButton').on('click',function(){$('body').removeClass('realm-menu-open');$('#realmSidebar').attr('aria-hidden','true');$('#realmMenuButton').attr('aria-expanded','false');bootstrap.Modal.getOrCreateInstance('#diceModal').show();});
    $('#diceForm').on('submit',function(e){e.preventDefault();try{const result=R.roll($('#diceExpression').val(),$('#diceMode').val());$('#diceError').text('');const li=$('<li>').text(result.expression+' = '+result.total+' · '+result.breakdown+' · '+result.mode);$('#diceHistory').prepend(li).children().slice(20).remove();$('#diceResult').text(result.total);}catch(error){$('#diceError').text(error.message);}});
    $('[data-dice]').on('click',function(){$('#diceExpression').val('1d'+this.dataset.dice);$('#diceMode').val('normal');$('#diceForm').trigger('submit');});
  });
})();
