(function () {
  'use strict';
  const R=window.TabletopRules, el=id=>document.getElementById(id);
  let character=null, identity='', sheetSignature='',requiredCheck=null,rolling=false,savedCheckControls=null,savedCheckDice=null;
  const checkControls=['railDieType','railDieCount','railDieStat','railDieMode','railDieExtra','railDiceAdd'];
  const names={strength:'Strength',dexterity:'Dexterity',constitution:'Constitution',intelligence:'Intelligence',wisdom:'Wisdom',charisma:'Charisma'};
  const shapes={
    4:['M70 12 L128 118 L12 118 Z','M70 12 L70 83 L12 118 M70 83 L128 118'],
    6:['M27 20 L113 20 L126 108 L40 122 L14 42 Z','M27 20 L40 35 L126 25 M40 35 L40 122 M40 35 L14 42 M113 20 L126 25 L126 108'],
    8:['M70 8 L128 66 L70 132 L12 66 Z','M70 8 L92 70 L70 132 M12 66 L92 70 L128 66'],
    10:['M70 8 L126 52 L113 106 L70 132 L27 106 L14 52 Z','M70 8 L97 72 L70 132 M14 52 L43 72 L70 8 M43 72 L70 132 M43 72 L97 72 M97 72 L126 52'],
    12:['M45 10 L95 10 L129 52 L116 105 L70 132 L24 105 L11 52 Z','M45 10 L43 48 L11 52 M95 10 L97 48 L129 52 M43 48 L70 30 L97 48 L88 84 L52 84 Z M52 84 L24 105 M88 84 L116 105 M52 84 L70 132 L88 84'],
    20:['M70 8 L124 38 L124 102 L70 132 L16 102 L16 38 Z','M70 8 L43 51 L16 38 M70 8 L97 51 L124 38 M43 51 L97 51 L70 101 Z M16 38 L43 51 L16 102 L70 101 L70 132 M124 38 L97 51 L124 102 L70 101'],
    100:['M70 8 L126 52 L113 106 L70 132 L27 106 L14 52 Z','M70 8 L97 72 L70 132 M14 52 L43 72 L70 8 M43 72 L70 132 M43 72 L97 72 M97 72 L126 52']
  };
  function resetResult(){if(requiredCheck)return;el('railDieResult').textContent='Ready to roll';el('railDieBreakdown').textContent='';el('railDieError').textContent='';el('railDieFace').textContent=el('railDieType').value;}
  function bonus(){
    const c=character?.content||{}, t=c.tabletop||{}, key=el('railDieStat').value;
    if(key==='raw'||el('railDieType').value!=='20')return {total:0,text:'No sheet bonus applied.'};
    const [kind,stat]=key.split(':'), a=kind==='skill'?R.skills[stat]:stat;
    const training=kind==='skill'?R.integer(t['skill_'+R.skillKey(stat)]):kind==='save'?R.integer(t['save_'+a]):0;
    const extra=kind==='skill'?R.integer(t['skill_'+R.skillKey(stat)+'_extra']):kind==='save'?R.integer(t['save_'+a+'_extra']):0;
    const exhaustion=t.ruleset==='2024'?2*R.integer(t.exhaustion):0;
    const total=R.modifier(c[a])+training*R.proficiency(c.character_level)+extra-exhaustion;
    return {total,text:`${names[a]} ${R.signed(R.modifier(c[a]))} · training ${R.signed(training*R.proficiency(c.character_level))} · other ${R.signed(extra)}${exhaustion?' · exhaustion −'+exhaustion:''} = ${R.signed(total)}`};
  }
  function update(){
    const sides=Number(el('railDieType').value), count=Number(el('railDieCount').value), d20=sides===20&&count===1&&!additionalDice().some(d=>d.sides===20);
    el('railDieOutline').setAttribute('d',shapes[sides][0]);el('railDieFacets').setAttribute('d',shapes[sides][1]);
    el('railDie').setAttribute('aria-label','Roll '+[count+'d'+sides,...additionalDice().map(d=>d.count+'d'+d.sides)].join(' + '));
    if(requiredCheck){for(const id of checkControls)el(id).disabled=true;const dice=requiredCheck.settings.open_dice?.length?requiredCheck.settings.open_dice:Array(requiredCheck.settings.open_die_count).fill(requiredCheck.settings.open_die_sides);el('railDieMode').disabled=dice.filter(d=>d===20).length!==1;return;}
    el('railDieStat').disabled=!d20||!character;el('railDieMode').disabled=!d20;
    if(!d20){el('railDieStat').value='raw';el('railDieMode').value='normal';}
    el('railDieBonus').textContent=bonus().text;
    el('railDieNotice').textContent=(d20?'Advantage or disadvantage applies only to the D-20; added dice roll normally.':'For a stat check or advantage, choose one D-20 as the first die and no additional D-20s.')+' All dice are added together, with the bonus applied once. Rolls stay on this device.';
  }
  function additionalDice(){return Array.from(el('railDiceAdditional').children,row=>({sides:Number(row.querySelector('select').value),count:Number(row.querySelector('input').value)}));}
  el('railDiceAdd').addEventListener('click',()=>{
    const row=document.createElement('div');row.className='rail-dice-added';
    const typeLabel=document.createElement('label');typeLabel.textContent='Roll type';
    const type=document.createElement('select');Object.keys(shapes).forEach(s=>type.add(new Option('D-'+s,s)));typeLabel.append(type);
    const countLabel=document.createElement('label');countLabel.textContent='Number of dice';
    const count=document.createElement('input');count.type='number';count.min='1';count.max='100';count.step='1';count.value='1';count.required=true;count.inputMode='numeric';countLabel.append(count);
    const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';remove.setAttribute('aria-label','Remove added dice');
    remove.addEventListener('click',()=>{row.remove();resetResult();update();});
    row.addEventListener('change',()=>{resetResult();update();});row.append(typeLabel,countLabel,remove);el('railDiceAdditional').append(row);resetResult();update();
  });
  function setCharacter(next,campaignId){
    if(requiredCheck)return;
    const nextIdentity=String(campaignId)+':'+String(next?.id||''), signature=JSON.stringify(next||null);
    if(identity===nextIdentity&&sheetSignature===signature)return;
    const changed=identity!==nextIdentity;identity=nextIdentity;sheetSignature=signature;character=next;
    const select=el('railDieStat'), previous=changed?'raw':select.value;
    select.replaceChildren(new Option('No stat bonus','raw'));
    if(next){
      [['Ability checks','ability'],['Saving throws','save']].forEach(([title,kind])=>{const group=document.createElement('optgroup');group.label=title;R.abilities.forEach(a=>group.append(new Option(names[a],kind+':'+a)));select.append(group);});
      const group=document.createElement('optgroup');group.label='Skills';Object.keys(R.skills).forEach(s=>group.append(new Option(s,'skill:'+s)));select.append(group);
    }
    select.value=previous;el('railDiceCharacter').textContent=next?.title||'No character selected — manual rolls available';
    el('railDiceAbilities').replaceChildren();
    if(next)R.abilities.forEach(a=>{const span=document.createElement('span');span.textContent=a.slice(0,3).toUpperCase()+' '+R.signed(R.modifier(next.content[a]));el('railDiceAbilities').append(span);});
    const t=next?.content?.tabletop||{}, conditions=R.conditions.filter(c=>t['condition_'+c.toLowerCase()]);
    if(t.exhaustion)conditions.push('Exhaustion '+t.exhaustion);
    el('railDieConditions').textContent=conditions.length?'Sheet conditions: '+conditions.join(', ')+'. Check whether they affect this roll.':'No conditions marked on the sheet.';
    if(changed){el('railDieExtra').value='0';el('railDieMode').value='normal';}
    resetResult();update();
  }
  el('inventoryDiceToggle').addEventListener('click',()=>{
    const open=el('inventoryDicePanel').hidden;
    el('inventoryDicePanel').hidden=!open;el('inventoryPreview').classList.toggle('d-none',open);el('inventoryCount').classList.toggle('d-none',open);
    el('inventoryDiceToggle').setAttribute('aria-expanded',String(open));el('inventoryDiceToggle').setAttribute('aria-label',open?'Close dice roller and show inventory':'Open dice roller');
    el('inventoryRailTitle').textContent=open?'Dice roller':'Inventory';el('inventoryDiceArrow').textContent=open?'◂':'▸';el('inventoryDiceToggle').closest('aside').classList.toggle('dice-open',open);
  });
  ['railDieType','railDieCount','railDieStat','railDieMode','railDieExtra'].forEach(id=>el(id).addEventListener('change',()=>{resetResult();update();}));
  el('railDie').addEventListener('click',async()=>{
    if(rolling)return;
    if(requiredCheck){const check=requiredCheck;rolling=true;el('railDie').disabled=true;el('railDieError').textContent='';try{const result=await check.roll(el('railDieMode').value);if(requiredCheck!==check)return;el('railDieFace').textContent=result.total??'✓';el('railDieResult').textContent=result.total===undefined?'Check already passed':'Total '+result.total;el('railDieBreakdown').textContent=(result.breakdown||'')+(result.mode&&result.mode!=='normal'?' · '+result.mode:'');check.result(result);}catch(error){if(requiredCheck===check)el('railDieError').textContent=error.message;}finally{rolling=false;el('railDie').disabled=false;}return;}
    try{
      if(!el('railDieCount').checkValidity())throw new Error('Enter a whole number of dice between 1 and 100.');
      if(Array.from(el('railDiceAdditional').querySelectorAll('input')).some(input=>!input.checkValidity()))throw new Error('Enter a whole number of dice between 1 and 100 for each type.');
      const additional=additionalDice();
      if(Number(el('railDieCount').value)+additional.reduce((n,d)=>n+d.count,0)>100)throw new Error('Use no more than 100 dice in one roll.');
      if(!el('railDieExtra').checkValidity())throw new Error('Enter a whole bonus or penalty between −999 and 999.');
      update();
      const sides=Number(el('railDieType').value), modifier=bonus().total+R.integer(el('railDieExtra').value);
      const result=R.roll(Number(el('railDieCount').value)+'d'+sides+R.signed(modifier),el('railDieMode').value);
      if(additional.length){
        const extra=R.roll(additional.map(d=>d.count+'d'+d.sides).join('+'));
        result.total+=extra.total;result.breakdown+=' · '+extra.breakdown;
      }
      el('railDieFace').textContent=result.total-modifier;
      el('railDieResult').textContent='Total '+result.total;el('railDieBreakdown').textContent=result.breakdown+(result.mode==='normal'?'':' · '+result.mode);el('railDieError').textContent='';
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches)el('railDie').animate([{transform:'rotate(-12deg) scale(.9)'},{transform:'rotate(9deg) scale(1.05)'},{transform:'rotate(0) scale(1)'}],{duration:300});
    }catch(error){el('railDieError').textContent=error.message;}
  });
  function beginCheck(check){
    if(requiredCheck)endCheck();
    savedCheckControls=checkControls.map(id=>({id,value:el(id).value,disabled:el(id).disabled}));
    const s=check.settings;el('railDieType').value=s.open_die_sides;el('railDieCount').value=s.open_die_count;el('railDieExtra').value=s.open_die_bonus;el('railDieStat').value='raw';el('railDieMode').value='normal';
    savedCheckDice=document.createDocumentFragment();savedCheckDice.append(...el('railDiceAdditional').childNodes);
    const dice=s.open_dice?.length?s.open_dice:Array(s.open_die_count).fill(s.open_die_sides);el('railDieType').value=dice[0];el('railDieCount').value=1;
    for(const sides of dice.slice(1)){const row=document.createElement('div');row.className='rail-dice-added';const label=document.createElement('label');label.textContent='Dice type';const select=document.createElement('select');select.add(new Option('D-'+sides,sides));select.disabled=true;const count=document.createElement('input');count.type='number';count.value=1;count.disabled=true;count.setAttribute('aria-label','Number of dice');label.append(select);row.append(label,count);el('railDiceAdditional').append(row);}el('railDiceAdditional').hidden=false;update();resetResult();requiredCheck=check;
    for(const id of checkControls)el(id).disabled=true;
    el('railDieMode').disabled=dice.filter(d=>d===20).length!==1;
    el('railDieNotice').textContent='Roll '+dice.map(d=>'D'+d).join(' + ')+' to reach '+s.open_roll_target+' or higher. This check is recorded for your character.';
  }
  function endCheck(){requiredCheck=null;if(savedCheckControls)for(const c of savedCheckControls){el(c.id).value=c.value;el(c.id).disabled=c.disabled;}savedCheckControls=null;if(savedCheckDice)el('railDiceAdditional').replaceChildren(savedCheckDice);savedCheckDice=null;el('railDiceAdditional').hidden=false;el('railDie').disabled=false;update();}
  window.RailDice={setCharacter,beginCheck,endCheck};setCharacter(null,null);update();
})();
