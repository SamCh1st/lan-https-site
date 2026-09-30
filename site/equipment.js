(function () {
  'use strict';
  const label = s => s.startsWith('ring_') ? 'Ring' : s.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
  function node(tag, text, cls) {
    const el = document.createElement(tag); if (text != null) el.textContent = text;
    if (cls) el.className = cls; return el;
  }
  function mount(host, character, campaignId, api, changed, filterId, openDetail, afterDraw) {
    if (!character) return;
    const panel = node('section', null, 'equipment-panel');
    panel.setAttribute('aria-label', 'Character equipment'); host.append(panel);
    const status = node('p', 'Checking equipment…', 'equipment-feedback');
    status.setAttribute('role', 'status'); panel.append(status);
    let busy = false;
    const call = data => api('/api/campaign/' + campaignId + '/equipment', {
      method: 'POST', body: JSON.stringify({character_id: character.id, ...data})
    });
    async function act(data) {
      if (busy) return;
      busy = true;
      panel.querySelectorAll('button,select,input').forEach(el => el.disabled = true);
      try {
        const state = await call(data);
        await changed(state);
        if (!panel.isConnected) return;
        draw(state); status.textContent = 'Equipment saved.';
      } catch (e) {
        if (panel.isConnected) {
          try { draw(await call({action:'inspect'})); } catch (_) { /* preserve error */ }
          status.textContent = e.message;
        }
      } finally { busy = false; }
    }
    function draw(state) {
      panel.replaceChildren();
      panel.append(node('h4', state.character_name + ' · Equipment'));
      if (window.MapTrade) { const wallet=node('div','Money held · ','character-wallet');wallet.append(MapTrade.coinSummary(character.content?.tabletop?.money_cp || 0));panel.append(wallet); }
      const summary = node('div', null, 'equipment-summary');
      const hands = Object.keys(state.loadout).filter(s => /hand/.test(s) && s!=='hands').reduce((n,s)=>n+(s==='both_hands'?2:1),0);
      for (const text of [`${state.weight} / ${state.capacity} lb carried`, `Equipment AC ${state.ac}`, `${hands} / 2 hands occupied`, `${state.attuned.length} / 3 attuned`]) summary.append(node('span',text));
      if (state.over_capacity) summary.classList.add('equipment-warning');
      panel.append(summary);
      if (state.speed_penalty) panel.append(node('p', `Armor reduces speed by ${state.speed_penalty} ft.`, 'equipment-warning'));
      if (!state.can_cast_in_armor) panel.append(node('p', 'Cannot cast spells while wearing this untrained armor.', 'equipment-warning'));
      if (state.stealth_disadvantage) panel.append(node('p', 'Equipped armor: disadvantage on Stealth.', 'equipment-warning'));
      if (state.loadout.both_hands || (state.loadout.main_hand && state.loadout.off_hand)) panel.append(node('p', 'Both hands occupied. Spell components and ammunition may require freeing a hand or an applicable feature.', 'equipment-warning'));
      state.notices.forEach(text => panel.append(node('p', text, 'equipment-warning')));
      const help = node('details'); help.append(node('summary','How equipment is checked'));
      help.append(node('p', state.effects_note));
      help.append(node('p', 'All owned inventory counts toward carried weight, including unequipped items. “Stored” is a legacy label, not an off-character storage location. Put gear in a separate container or transfer it to stop carrying it. Equipping records your completed donning action or time; it does not advance combat turns. Weapon mastery, spell components, ammunition, conditions, and other situational effects still apply.'));
      const shown = state.items.filter(item => !filterId || item.id === filterId);
      if (!shown.length) panel.append(node('p', 'No usable items owned by this character.'));
      const groups = {};
      for (const [key,title] of [['equipped','Equipped'],['inventory','Unequipped']]) {
        const section=node('section',null,'equipment-group');section.dataset.equipmentGroup=key;
        section.append(node('h4',title));groups[key]=section;
        if (shown.some(item => (item.equipped.length ? 'equipped' : 'inventory') === key)) panel.append(section);
      }
      shown.forEach(item => {
        const card = node('article', null, 'equipment-item');
        card.dataset.recordId=item.id;
        const header = node('div', null, 'equipment-item-header');
        header.append(RecordCards.create(item.record,{onOpen:openDetail ? ()=>openDetail(item.record) : null,description:item.record.content.item_type||'Item'}));
        card.append(header);
        const available = item.options.some(o => o.allowed);
        card.append(node('span', item.equipped.length ? 'Equipped · '+item.equipped.map(label).join(', ') : available ? (item.warnings.length ? 'Can equip · penalties / requirements' : 'Ready to equip') : 'Cannot equip yet', 'equipment-badge '+(item.equipped.length?'equipment-active':!available?'equipment-blocked':item.warnings.length?'equipment-caution':'equipment-ready')));
        const controls = node('div', null, 'equipment-controls');
        controls.append(node('small', `Quantity ${item.quantity} · ${item.weight < 0 ? 'Weight unknown' : item.weight+' lb each'}${item.attuned ? ' · Attuned' : ''}`));
        card.append(controls);
        const explanations = node('details', null, 'equipment-reasons');
        explanations.append(node('summary', 'Requirements & penalties'+(item.warnings.length ? ' ('+item.warnings.length+')' : '')));
        [...item.requirements, ...item.warnings, ...item.review].forEach(text => explanations.append(node('p', text)));
        card.append(explanations);
        const select = document.createElement('select'); select.className='form-control';
        select.setAttribute('aria-label','Equip position for '+item.title);
        item.options.forEach(o => select.append(new Option(label(o.slot), o.slot)));
        const reason = node('p', '', 'equipment-warning'); reason.setAttribute('aria-live','polite');
        const equip = node('button', 'Equip', 'equipment-equip'); equip.type='button';
        if (item.warnings.length) equip.setAttribute('aria-label', 'Equip with listed penalties');
        let acceptance;
        if (item.warnings.length) {
          const ack=node('label',null,'equipment-ack'); acceptance=document.createElement('input'); acceptance.type='checkbox';
          ack.append(acceptance,document.createTextNode(' I have read the penalties and requirements.')); card.append(ack);
        }
        function update() {
          const choice=item.options.find(o=>o.slot===select.value);
          equip.disabled=!choice?.allowed || (!!acceptance && !acceptance.checked);
          reason.textContent=choice ? choice.reasons.join(' ') : 'The DM must configure this item’s equipment rules.';
          reason.hidden=!reason.textContent;
          explanations.hidden=![...item.requirements, ...item.warnings, ...item.review].length && !reason.textContent;
        }
        const first=item.options.find(o=>o.allowed); if(first)select.value=first.slot;
        select.addEventListener('change',update); acceptance?.addEventListener('change',update);
        equip.addEventListener('click',()=>act({action:'equip',item_id:item.id,slot:select.value,accept_penalties:!!acceptance?.checked}));
        controls.append(select); header.append(equip); explanations.append(reason); update();
        if (item.equipped.length) {
          const remove=node('button','×','equipment-unequip');remove.type='button';remove.title='Unequip';remove.setAttribute('aria-label','Unequip '+item.title);
          remove.addEventListener('click',()=>act({action:'unequip',item_id:item.id}));card.append(remove);
        }
        if (item.requires_attunement) {
          const details=node('details'); details.append(node('summary', item.attuned?'End attunement':'Attune to this item'));
          details.append(node('p','Use this after completing the required dedicated short rest. Equipping alone does not attune an item.'));
          const button=node('button',item.attuned?'Short rest completed · end attunement':'Short rest completed · attune');button.type='button';
          button.disabled=!item.attuned && (state.attuned.length>=3 || item.review.length>0 || item.unmet.length>0);
          button.addEventListener('click',()=>act({action:item.attuned?'unattune':'attune',item_id:item.id,rest_completed:true}));
          details.append(button);card.append(details);
        }
        groups[item.equipped.length ? 'equipped' : 'inventory'].append(card);
      });
      status.textContent=''; panel.append(help,status);afterDraw?.(panel);
    }
    call({action:'inspect'}).then(state=>{if(panel.isConnected)draw(state);}).catch(e=>{if(panel.isConnected)status.textContent=e.message;});
  }
  window.Equipment = {mount};
})();
