"""Server-authoritative, per-character loadouts. SRD 5.2.1; see rules-attribution.html.

Free-form features are never interpreted as permissions. Unmodelled rules require
explicit DM review; derived values do not overwrite manually maintained sheets.
"""
import json
import math
import re
from functools import lru_cache

ARMOR = {
    'Padded': ('light', 11, 8, 0, True), 'Leather Armor': ('light', 11, 10, 0, False),
    'Studded Leather': ('light', 12, 13, 0, False), 'Hide Armor': ('medium', 12, 12, 0, False),
    'Chain Shirt': ('medium', 13, 20, 0, False), 'Scale Mail': ('medium', 14, 45, 0, True),
    'Breastplate': ('medium', 14, 20, 0, False), 'Half Plate': ('medium', 15, 40, 0, True),
    'Ring Mail': ('heavy', 14, 40, 0, True), 'Chain Mail': ('heavy', 16, 55, 13, True),
    'Splint': ('heavy', 17, 60, 15, True), 'Plate': ('heavy', 18, 65, 15, True),
    'Shield': ('shield', 2, 6, 0, False),
}
TRAINING = {
    'barbarian': ('light medium shield', 'simple martial'), 'bard': ('light', 'simple'),
    'cleric': ('light medium shield', 'simple'), 'druid': ('light shield', 'simple'),
    'fighter': ('light medium heavy shield', 'simple martial'), 'monk': ('', 'simple'),
    'paladin': ('light medium heavy shield', 'simple martial'), 'ranger': ('light medium shield', 'simple martial'),
    'rogue': ('light', 'simple'), 'sorcerer': ('', 'simple'), 'warlock': ('light', 'simple'), 'wizard': ('', 'simple'),
}
SLOTS = ('main_hand', 'off_hand', 'both_hands', 'body', 'head', 'cloak', 'hands', 'feet', 'bracers', 'ring', 'neck', 'belt')

def number(v, default=0):
    try:
        n = float(v)
        return n if math.isfinite(n) else default
    except (TypeError, ValueError):
        return default

def mod(c, key):
    return math.floor((number(c.get(key), 10) - 10) / 2)

def valid_slot(slot):
    return slot in SLOTS or bool(re.fullmatch(r'ring_\d+', str(slot)))

@lru_cache(maxsize=1)
def catalog():
    import campaign_defaults
    return {r['title'].lower(): r for r in campaign_defaults.starter_records() if r['content']['category'] == 'item'}

def profile(row, edition):
    c = row['content']; t = c.get('tabletop') or {}
    base = str(t.get('equipment_base') or row['title']).strip()
    aliases = {'plate armor':'Plate', 'splint armor':'Splint', 'half plate armor':'Half Plate', 'studded leather armor':'Studded Leather', 'padded armor':'Padded'}
    base = aliases.get(base.lower(), base)
    ref = catalog().get(base.lower())
    p = {'base': base, 'slots': [], 'weight': number(t.get('weight'), -1), 'review': [], 'magic': bool(c.get('rarity') not in (None, '', 'Nonmagical'))}
    if ref:
        base = ref['title']; p['base'] = base
        rc = ref['content']; rt = rc['tabletop']; props = rt.get('item_properties', '').lower()
        if p['weight'] < 0: p['weight'] = number(rt.get('weight'), -1)
        if base in ARMOR:
            kind, ac, weight, strength, stealth = ARMOR[base]
            p.update(kind=kind, ac=ac, strength=strength, stealth=stealth, slots=['off_hand', 'main_hand'] if kind == 'shield' else ['body'])
            if p['weight'] < 0: p['weight'] = weight
        elif rc.get('item_type') == 'Weapon' and base != 'Weapon +1':
            p.update(kind='weapon', martial='martial' in props, ranged='ranged' in props, heavy='heavy' in props,
                     finesse='finesse' in props, light='light' in props, two='two-handed' in props, versatile='versatile' in props,
                     loading='loading' in props, ammunition='ammunition' in props)
            p['slots'] = ['both_hands'] if p['two'] else ['main_hand', 'off_hand'] + (['both_hands'] if p['versatile'] else [])
        else:
            p['slots'] = {'Cloak of Protection':['cloak'], 'Goggles of Night':['head'], 'Holy Symbol — Amulet':['neck'], 'Component Pouch':['belt']}.get(base, ['main_hand', 'off_hand'])
            if base in ('Armor +1', 'Weapon +1', 'Shield +1'):
                p['review'].append('Choose the exact base weapon or armor in the item editor.')
    else:
        p['review'].append('Unknown equipment: the DM must select a base item or review its wearing rules.')
    if t.get('equipment_slot') in SLOTS and not p.get('kind'):
        p['slots'] = [t['equipment_slot']]
    p['slots'] = ['ring_'+str(row['id']) if s=='ring' else s for s in p['slots']]
    if t.get('requirements'):
        p['review'].append('Additional prerequisites: ' + str(t['requirements']))
    if p['magic'] and base not in ('Cloak of Protection', 'Goggles of Night'):
        p['review'].append('Magic properties and prerequisites need DM review; base gear rules still apply.')
    if edition != '2024':
        p['review'].append('This rules version needs DM review; the base equipment catalog uses 2024 rules.')
    return p

def owned(row, character):
    c = row['content']; ch = character['content']
    links = c.get('owner_ids') or []
    return (c.get('category') == 'item' and not c.get('reference_only') and number(c.get('quantity'), 1) > 0
            and c.get('tabletop', {}).get('equipment_state') != 'Expended'
            and (character['id'] in links if links or c.get('grant_mode') == 'characters'
                 else ch.get('owner_user_id') in (c.get('assigned_user_ids') or [])))

def training(c):
    t = c.get('tabletop') or {}; cls = str(c.get('character_class', '')).lower().strip()
    armor, weapons = TRAINING.get(cls, ('', ''))
    armor = set(armor.split()); weapons = set(weapons.split())
    if cls == 'cleric' and t.get('equipment_order') == 'protector': armor.add('heavy'); weapons.add('martial')
    if cls == 'druid' and t.get('equipment_order') == 'warden': armor.add('medium'); weapons.add('martial')
    armor.update(str(t.get('equipment_armor_training', '')).lower().replace(',', ' ').split())
    weapons.update(x.strip().lower() for x in str(t.get('equipment_weapon_training', '')).split(','))
    return cls, armor, weapons

def snapshot(character, rows, campaign):
    c = character['content']; t = c.get('tabletop') or {}; edition = (campaign.get('tabletop') or {}).get('ruleset', '2024')
    cls, armor_training, weapon_training = training(c)
    inventory = [r for r in rows if owned(r, character)]
    by_id = {r['id']:r for r in inventory}
    raw = t.get('equipment_loadout') or {}
    # Equipment no longer owned (sold, removed, transferred) never grants effects.
    loadout = {k:v for k,v in raw.items() if valid_slot(k) and type(v) is int and v in by_id} if isinstance(raw, dict) else {}
    counts={}
    for slot,ident in list(loadout.items()):
        counts[ident]=counts.get(ident,0)+1
        if counts[ident]>number(by_id[ident]['content'].get('quantity'),1): del loadout[slot]
    attuned = [i for i in t.get('equipment_attuned', []) if type(i) is int and i in by_id]
    profiles = {r['id']:profile(r, edition) for r in inventory}
    reviews = []
    if cls not in TRAINING: reviews.append('Choose a supported class or ask the DM to record training.')
    if t.get('multiclass'): reviews.append('Multiclass equipment training needs DM review; record the actual training in the sheet.')
    if t.get('proficiencies') or t.get('features'): reviews.append('Free-text feats and training are not parsed. Record equipment exceptions in the structured sheet fields.')
    weight = sum(max(0, profiles[r['id']]['weight']) * number(r['content'].get('quantity'), 1) for r in inventory)
    # The app stores coin value in a custom denomination system, not coin counts.
    coin_weight = number(t.get('equipment_coin_weight'), -1)
    if coin_weight >= 0: weight += coin_weight
    elif number(t.get('money_cp')): reviews.append('Coin weight is unknown: enter the actual coin weight in the sheet.')
    if any(p['weight'] < 0 for p in profiles.values()): reviews.append('Some item weights are unknown; the carried total is incomplete.')
    size = t.get('equipment_size', 'Medium'); factor = {'Tiny':.5, 'Small':1, 'Medium':1, 'Large':2, 'Huge':4, 'Gargantuan':8}.get(size, 1)
    capacity = max(0, number(c.get('strength'), 10)) * 15 * factor * (2 if t.get('equipment_powerful_build') else 1)
    if weight > capacity: reviews.append(f'Over carrying capacity by {round(weight-capacity, 2)} lb. Put down or transfer gear; unequipping does not remove weight.')
    result = []
    equipped_profiles = [(slot, profiles[i], by_id[i]) for slot,i in loadout.items()]
    ac = 10 + mod(c, 'dexterity'); speed_penalty = 0; spellcasting = True; stealth = False
    armor = next((p for slot,p,r in equipped_profiles if slot == 'body' and p.get('kind') in ('light','medium','heavy')), None)
    shield = any(p.get('kind') == 'shield' for slot,p,r in equipped_profiles)
    if armor:
        ac = armor['ac'] + (mod(c,'dexterity') if armor['kind']=='light' else min(2,mod(c,'dexterity')) if armor['kind']=='medium' else 0)
        if armor['kind'] not in armor_training: spellcasting = False
        if number(c.get('strength'),10) < armor['strength']: speed_penalty = 10
        stealth = armor['stealth']
    elif cls == 'barbarian': ac += max(0,mod(c,'constitution'))
    elif cls == 'monk' and not shield: ac += max(0,mod(c,'wisdom'))
    if shield and 'shield' in armor_training: ac += 2
    if any(p['base']=='Cloak of Protection' and r['id'] in attuned for slot,p,r in equipped_profiles): ac += 1
    for slot,p,r in equipped_profiles:
        it=r['content'].get('tabletop') or {}
        if it.get('equipment_reviewed') and (not it.get('requires_attunement') or r['id'] in attuned):
            ac += max(0,min(10,number(it.get('equipment_ac_bonus'))))
    for row in inventory:
        ident=row['id']; item=row['content']; it=item.get('tabletop') or {}; p=profiles[ident]
        current = [slot for slot,i in loadout.items() if i == ident]
        warnings=[]; requirements=[]; review=list(p['review']); unmet=[]
        for ability in ('strength','dexterity','constitution','intelligence','wisdom','charisma'):
            minimum=number(it.get('equipment_min_'+ability))
            if minimum>0:
                requirements.append(f'{ability.title()} {minimum:g} required (yours: {number(c.get(ability),10):g}).')
                if number(c.get(ability),10)<minimum: unmet.append(f'Requires {ability.title()} {minimum:g}.')
        required_classes=[s.strip().lower() for s in str(it.get('equipment_classes','')).split(',') if s.strip()]
        if required_classes:
            requirements.append('Required class: '+', '.join(required_classes))
            if cls not in required_classes: unmet.append('Requires class: '+', '.join(required_classes)+'.')
        if cls not in TRAINING or t.get('multiclass'): review += reviews[:1] if cls not in TRAINING else ['Multiclass training requires DM review.']
        kind=p.get('kind')
        if kind in ('light','medium','heavy','shield'):
            requirements.append(kind.title()+' armor training' if kind!='shield' else 'Shield training for +2 AC')
            if kind not in armor_training: warnings.append('No shield AC bonus.' if kind=='shield' else 'Untrained armor: cannot cast spells; disadvantage on Strength and Dexterity D20 Tests.')
            if p['strength']:
                requirements.append(f"Strength {p['strength']} to avoid −10 ft. speed (yours: {number(c.get('strength'),10):g}).")
                if number(c.get('strength'),10)<p['strength']: warnings.append('Speed reduced by 10 ft.')
            if p['stealth']: warnings.append('Disadvantage on Stealth checks.')
            requirements.append('Don/doff: '+{'light':'1 minute / 1 minute','medium':'5 minutes / 1 minute','heavy':'10 minutes / 5 minutes','shield':'Utilize action / Utilize action'}[kind])
        if kind=='weapon':
            proficient = ('martial' if p['martial'] else 'simple') in weapon_training or p['base'].lower() in weapon_training
            proficient |= cls=='rogue' and (p['finesse'] or p['light']) or cls=='monk' and p['light']
            ability='dexterity' if p['ranged'] else 'strength'
            if p['finesse'] and mod(c,'dexterity')>mod(c,'strength'): ability='dexterity'
            attack=mod(c,ability)+(2+(max(1,min(20,int(number(c.get('character_level'),1))))-1)//4 if proficient else 0)
            if it.get('equipment_reviewed') and (not it.get('requires_attunement') or ident in attuned): attack+=int(max(0,min(10,number(it.get('equipment_attack_bonus')))))
            requirements.append(f"{'Martial' if p['martial'] else 'Simple'} weapon proficiency for the proficiency bonus. Base attack {attack:+d} ({ability}).")
            if not proficient: warnings.append('Not proficient: no proficiency bonus to attacks.')
            if p['heavy']:
                ability='dexterity' if p['ranged'] else 'strength'
                requirements.append(ability.title()+' 13 to avoid Heavy-weapon disadvantage.')
                if number(c.get(ability),10)<13: warnings.append('Disadvantage on attacks with this Heavy weapon.')
            if p['ammunition']: warnings.append('Requires matching ammunition; loading a one-handed weapon needs a free hand.')
            if p['loading']: warnings.append('Loading limits shots per action, bonus action, or reaction unless a feature overrides it.')
            if p['base']=='Lance': review.append('Mounted use can change hand requirements; DM review needed for mounted exceptions.')
        if it.get('requires_attunement'):
            requirements.append('Requires attunement after a dedicated short rest; normally 3 items maximum.')
            if ident not in attuned: warnings.append('Not attuned: magical benefits inactive; ordinary gear benefits remain.')
        if t.get('equipment_reviewed') and not p['review']: review=[]
        if it.get('equipment_reviewed'): review=list([] if cls in TRAINING and (not t.get('multiclass') or t.get('equipment_reviewed')) else ['The DM must verify character training.'])
        options=[]
        for slot in p['slots']:
            blockers=[]
            # A stack can supply two one-handed weapons. Once all copies are in
            # use, equipping elsewhere moves one existing copy.
            move_from=current[0] if current and len(current)>=number(item.get('quantity'),1) else None
            occupied={s:i for s,i in loadout.items() if s!=move_from}
            needed=['main_hand','off_hand','both_hands'] if slot=='both_hands' else [slot,'both_hands'] if slot in ('main_hand','off_hand') else [slot]
            for s in needed:
                if s in occupied: blockers.append('Unequip '+by_id[occupied[s]]['title']+' from '+s.replace('_',' ')+'.')
            if kind=='shield' and any(profiles[i].get('kind')=='shield' for s,i in occupied.items()): blockers.append('Only one shield can be wielded.')
            elsewhere=sum(sum(1 for i in (r['content'].get('tabletop',{}).get('equipment_loadout') or {}).values() if i==ident)
                          for r in rows if r['id']!=character['id'] and r['content'].get('category')=='character' and owned(row,r))
            if elsewhere+len(current)-(1 if move_from else 0)>=number(item.get('quantity'),1): blockers.append('No unused copy: another character has this item equipped.')
            if review: blockers += review
            blockers += unmet
            if not blockers and current and slot in current: blockers.append('Already equipped here.')
            options.append({'slot':slot,'allowed':not blockers,'reasons':list(dict.fromkeys(blockers))})
        if not options: review.append('The DM must specify how this item is held or worn.')
        result.append({'id':ident,'title':row['title'],'record':row,'quantity':item.get('quantity',1),'weight':p['weight'], 'equipped':current,
                       'attuned':ident in attuned,'requires_attunement':bool(it.get('requires_attunement')),
                       'warnings':warnings,'requirements':requirements,'review':review,'unmet':unmet,'options':options})
    return {'character_id':character['id'],'character_name':character['title'],'edition':edition,'items':result,'loadout':loadout,
            'attuned':attuned,'weight':round(weight,2),'capacity':capacity,'over_capacity':weight>capacity,
            'ac':ac,'speed_penalty':speed_penalty,'can_cast_in_armor':spellcasting,'stealth_disadvantage':stealth,'notices':reviews,
            'effects_note':'Equipment AC includes standard armor, shield, Unarmored Defense and an attuned Cloak of Protection. Other magic, spells, fighting styles and situational effects require sheet adjustments. Saved sheet AC is not overwritten.'}

def request(user_id, cid, data):
    import storage
    import economy
    if not storage.has_campaign_access(user_id,cid): raise PermissionError('Join this campaign first.')
    dm=storage.campaign_role(user_id,cid)=='creator'
    with storage.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        cr,c=economy.card(db,data.get('character_id'),cid)
        if c.get('category')!='character' or (not dm and c.get('owner_user_id')!=user_id): raise PermissionError('Choose a character you control.')
        character={'id':cr['id'],'title':cr['title'],'content':c}
        campaign_row=db.execute('SELECT content FROM work_items WHERE id=?',(cid,)).fetchone()
        campaign=json.loads(campaign_row['content'])
        rows=[{'id':r['id'],'title':r['title'],'content':json.loads(r['content'])} for r in db.execute("SELECT * FROM work_items WHERE CAST(json_extract(content,'$.campaign_id') AS INTEGER)=?",(cid,))]
        state=snapshot(character,rows,campaign); action=data.get('action','inspect')
        if action=='inspect': return state
        if action not in ('equip','unequip','attune','unattune'): raise ValueError('Unknown equipment action.')
        ident=data.get('item_id'); item=next((i for i in state['items'] if i['id']==ident),None)
        if item is None: raise PermissionError('This character does not own that item.')
        t=c.setdefault('tabletop',{}); loadout=dict(state['loadout']); attuned=list(state['attuned'])
        if action=='equip':
            choice=next((o for o in item['options'] if o['slot']==data.get('slot')),None)
            if not choice or not choice['allowed']: raise ValueError('; '.join(choice['reasons']) if choice else 'Choose an available equipment position.')
            # Account-wide/shared grants still represent a finite physical stack.
            used=0
            for r in rows:
                if r['id']!=cr['id'] and r['content'].get('category')=='character':
                    other=r['content'].get('tabletop') or {}
                    if owned(next(x for x in rows if x['id']==ident),r): used+=sum(i==ident for i in (other.get('equipment_loadout') or {}).values())
            if used>=number(item['quantity'],1): raise ValueError('Every copy is equipped by another character. Ask them to unequip it first.')
            if item['warnings'] and not data.get('accept_penalties'): raise ValueError('Read the equipment penalties before equipping.')
            current=[s for s,i in loadout.items() if i==ident]
            if current and len(current)>=number(item['quantity'],1): del loadout[current[0]]
            loadout[choice['slot']]=ident
        elif action=='unequip': loadout={s:i for s,i in loadout.items() if i!=ident}
        elif action=='attune':
            if not item['requires_attunement']: raise ValueError('This item does not require attunement.')
            if item['review']: raise ValueError('; '.join(item['review']))
            if item['unmet']: raise ValueError('; '.join(item['unmet']))
            if ident in attuned: raise ValueError('Already attuned.')
            if len(attuned)>=3: raise ValueError('All three attunement places are occupied.')
            target=next(r for r in rows if r['id']==ident)
            if any(next(r for r in rows if r['id']==i)['title'].casefold()==target['title'].casefold() for i in attuned): raise ValueError('You cannot attune to another copy of the same item.')
            if any(ident in (r['content'].get('tabletop') or {}).get('equipment_attuned',[]) for r in rows if r['id']!=cr['id'] and r['content'].get('category')=='character'): raise ValueError('Another character is attuned to this item. The DM must resolve the transfer.')
            if data.get('rest_completed') is not True: raise ValueError('Finish a dedicated short rest with this item first.')
            attuned.append(ident)
        else:
            target=next(r for r in rows if r['id']==ident)
            if target['content'].get('tabletop',{}).get('equipment_cursed'): raise ValueError('The curse must be broken before ending attunement.')
            if data.get('rest_completed') is not True: raise ValueError('Finish a short rest to end attunement.')
            attuned=[i for i in attuned if i!=ident]
        t['equipment_loadout']=loadout;t['equipment_attuned']=attuned
        economy.write(db,cr['id'],c)
        return snapshot(character,rows,campaign)


def reconcile_item(db, ident, content):
    """Drop withdrawn physical copies from loadouts in the same write transaction."""
    if content.get('category') != 'item': return
    cid=content.get('campaign_id')
    for row in db.execute("SELECT * FROM work_items WHERE CAST(json_extract(content,'$.campaign_id') AS INTEGER)=? AND json_extract(content,'$.category')='character'",(cid,)).fetchall():
        c=json.loads(row['content']);t=c.get('tabletop') or {}
        loadout=t.get('equipment_loadout') or {};attuned=t.get('equipment_attuned') or []
        if ident not in loadout.values() and ident not in attuned: continue
        before=json.dumps(t,sort_keys=True)
        allowed=owned({'id':ident,'content':content},{'id':row['id'],'content':c})
        remaining=max(0,int(number(content.get('quantity'),1))) if allowed else 0
        for slot in list(loadout):
            if loadout[slot]==ident:
                if remaining>0: remaining-=1
                else: del loadout[slot]
        t['equipment_loadout']=loadout
        if not allowed: t['equipment_attuned']=[i for i in attuned if i!=ident]
        if json.dumps(t,sort_keys=True)!=before:
            c['tabletop']=t
            db.execute('UPDATE work_items SET content=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',(json.dumps(c),row['id']))
