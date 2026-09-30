"""Apply structured AI-DM scene and record changes in one SQLite transaction."""
import copy
import json
import storage

SCENE_OPTIONS = {
    'time':['Dawn','Morning','Day','Evening','Night'],
    'weather':['Clear','Cloudy','Rain','Storm','Snow','Fog'],
    'visibility':['Clear','Dim','Dark','Obscured'],
    'temperature':['Freezing','Cold','Mild','Warm','Hot'],
    'danger':['Safe','Uneasy','Dangerous','Angry','Combat'],
    'pace':['Resting','Exploration','Travel','Social scene','Chase','Combat'],
}
CATEGORIES = ['item','spell','attack','encounter','quest','npc','location','faction','lore','session','chronicle']
FIELDS = {'summary':500,'notes':20000,'tags':160,'state':80,'difficulty':40,'item_type':60,'rarity':40,'damage':60,'damage_type':40,'action_type':60,'attack_bonus':60,'range':120,'spell_level':20,'school':60,'casting_time':120,'duration':120,'role':40,'affiliation':100,'place_type':80,'date_played':30}

def schema():
    scene = {key:{'type':['string','null'],'enum':values+[None]} for key,values in SCENE_OPTIONS.items()}
    scene.update({key:{'type':['string','null']} for key in ('location','mood')})
    fields = {key:{'type':'string'} for key in FIELDS}
    fields.update({'quantity':{'type':'integer'},'important':{'type':'boolean'},'tabletop':{'type':'object'}})
    card = {'category':{'type':'string','enum':CATEGORIES},'title':{'type':'string'},'record_id':{'type':'integer'},'source_id':{'type':'integer'},'character_ids':{'type':'array','items':{'type':'integer'}},'share_with_party':{'type':'boolean'}, **fields}
    return {'type':'object','properties':{
        'reply':{'type':'string'},'memory':{'type':'string'},'story_update':{'type':'string'},
        'scene':{'type':'object','properties':scene,'required':list(scene),'additionalProperties':False},
        'cards':{'type':'array','maxItems':10,'items':{'type':'object','properties':card,'required':['category','title','character_ids','share_with_party','summary','notes'],'additionalProperties':False}},
        'grants':{'type':'array','maxItems':20,'items':{'type':'object','properties':{'record_id':{'type':'integer'},'character_ids':{'type':'array','items':{'type':'integer'}},'quantity':{'type':'integer'}},'required':['record_id','character_ids'],'additionalProperties':False}},
    },'required':['reply','scene','cards','grants'],'additionalProperties':False}

INSTRUCTIONS = '''
You can now APPLY changes through structured output, not narration alone. Return reply first, then memory, story_update, scene, cards and grants. Include all eight scene keys, setting unchanged values to null; use [] for unchanged cards/grants.
scene is a PATCH of public scene controls: location, time, weather, visibility, temperature, danger, pace, mood. Use the allowed values in the schema. Change the scene when established events move the party, advance time, alter the weather, start/end danger or change the atmosphere. Do not overwrite unaffected fields. Private conversations cannot change the global public scene.
cards creates a new campaign record, or updates an existing non-reference record with record_id. Supported categories: item (including weapons), spell, attack (abilities), encounter, quest, npc, location, faction, lore, session, chronicle. Give a descriptive title, summary and notes. Weapons use category item and item_type Weapon, with damage, damage_type, quantity, rarity and tabletop.item_properties. Spells include spell_level, school, casting_time, range, duration and tabletop components/concentration/resolution. Encounters use participant character_ids, state, difficulty and notes. Quests use state, notes and assigned character_ids. Include exact mechanical details only when known; label invented material as homebrew.
character_ids must contain actual character record IDs from character_sheets/character_directory, never user IDs. Assign rewards to the characters who actually receive them. Empty character_ids and share_with_party false keeps a new record DM-only. Public visibility shares knowledge, not ownership. Existing quantities/settings are shared if one card has multiple recipients; create distinct cards for independent copies. Never turn a reference card into a possession by updating it in place.
grants gives an EXISTING record to characters: {"record_id":123,"character_ids":[456],"quantity":1}. A reference is copied into a playable card, leaving the library intact. A non-reference adds these recipients without duplicating the card. To create a customized copy from a reference use a card with source_id, category, title and character_ids. Reuse existing record IDs when updating a quest, encounter or previously awarded item; do not duplicate cards every turn. Only award things established by the story or explicitly instructed by the human DM, not merely because a player demands them. Private replies may grant only to characters controlled by their audience and cannot reveal new records to the whole party.
On successful processing, scene changes and cards/grants are saved automatically and appear in the appropriate character panels. Your prose must agree with the structured actions. HP, spell slots, XP and character levels are still manual; never claim those changed. Creating a spell card does not bypass preparation, class access, attunement or other prerequisites. Do not create player character sheets through cards; use npc for a new creature/person in the story. Narration edits/regeneration do not replay these effects.
'''

def integer(value, default=0):
    try: return int(value)
    except (ValueError, TypeError, OverflowError): return default

def apply(campaign_id, message_id, answer, normalize, is_dm=True):
    result={'cards':[],'scene':{},'warnings':[]}
    if not is_dm: return result
    with storage.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        message=db.execute('SELECT * FROM campaign_ai_messages WHERE id=? AND campaign_id=?',(message_id,campaign_id)).fetchone()
        if not message or message['role']!='assistant' or message['persona_type']!='dm':
            raise ValueError('Only an AI DM reply can apply campaign changes')
        previous=db.execute('SELECT result FROM campaign_ai_effects WHERE message_id=?',(message_id,)).fetchone()
        if previous: return json.loads(previous['result'])
        campaign=db.execute('SELECT * FROM work_items WHERE id=?',(campaign_id,)).fetchone()
        campaign_content=json.loads(campaign['content'])
        if not campaign_content.get('ai_dm'): raise ValueError('This is not an AI campaign')
        rows={row['id']:dict(row) | {'content':json.loads(row['content'])} for row in db.execute("SELECT * FROM work_items WHERE CAST(json_extract(content,'$.campaign_id') AS INTEGER)=?",(campaign_id,))}
        characters={key:row for key,row in rows.items() if row['content'].get('category')=='character'}
        members={row['username'].casefold():row['user_id'] for row in db.execute("SELECT m.user_id,u.username FROM campaign_members m JOIN users u ON u.id=m.user_id WHERE m.campaign_id=? AND m.status='accepted'",(campaign_id,))}
        audience=set(json.loads(message['audience_user_ids'] or '[]'))
        private=bool(audience or message['chat_id'])
        if message['chat_id']:
            chat=rows.get(message['chat_id'])
            audience.update((chat or {}).get('content',{}).get('assigned_user_ids',[]))
        def targets(proposed):
            requested=proposed.get('character_ids',proposed.get('given_to_characters',[]))
            requested=requested if isinstance(requested,list) else [requested]
            found=set()
            for value in requested:
                cid=integer(value)
                if cid not in characters:
                    matches=[key for key,row in characters.items() if row['title'].casefold()==str(value).strip().casefold()]
                    cid=matches[0] if len(matches)==1 else 0
                if not cid or cid not in characters: raise ValueError('Unknown or ambiguous character recipient')
                found.add(cid)
            legacy=proposed.get('assigned_to',[])
            legacy=legacy if isinstance(legacy,list) else [legacy]
            for name in legacy:
                uid=members.get(str(name).strip().casefold())
                if str(name).casefold()=='all': found.update(characters)
                elif uid: found.update(key for key,row in characters.items() if integer(row['content'].get('owner_user_id'))==uid)
                else:
                    matches=[key for key,row in characters.items() if row['title'].casefold()==str(name).strip().casefold()]
                    if len(matches)!=1: raise ValueError('Unknown character recipient')
                    found.add(matches[0])
            if private and any(integer(characters[cid]['content'].get('owner_user_id')) not in audience for cid in found):
                raise ValueError('Private reply cannot grant to characters outside its audience')
            return sorted(found)
        def link(content, ids, replace=False):
            category=content['category']
            key='owner_ids' if category=='item' else 'user_ids' if category in ('spell','attack') else 'participant_ids'
            content[key]=sorted(set(ids) | (set() if replace else {integer(v) for v in content.get(key,[]) if integer(v) in characters}))
            if category in ('item','spell','attack'): content['grant_mode']='characters'
            else:
                content['assigned_user_ids']=sorted({integer(characters[cid]['content'].get('owner_user_id')) for cid in content[key]}-{0})
        def save(title, content, existing=None):
            normalize(content)
            storage.normalize_character_grants(db,content)
            if existing:
                db.execute('UPDATE work_items SET title=?,content=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',(title,json.dumps(content),existing['id']))
                cid=existing['id']
            else:
                cid=db.execute('INSERT INTO work_items(user_id,title,content) VALUES (?,?,?)',(campaign['user_id'],title,json.dumps(content))).lastrowid
            rows[cid]={'id':cid,'title':title,'content':content}
            result['cards'].append({'id':cid,'title':title,'category':content['category'],'assigned_user_ids':content.get('assigned_user_ids',[])})
        scene=answer.get('scene',answer.get('world_update',{}))
        if isinstance(scene,dict): scene={key:value for key,value in scene.items() if value is not None}
        if isinstance(scene,dict) and scene:
            if private: result['warnings'].append('Public scene update skipped for a private reply.')
            else:
                world=campaign_content.get('ai_world') or {}
                for key,value in scene.items():
                    if value is None: continue
                    if key in ('location','mood') and isinstance(value,str): result['scene'][key]=value.strip()[:120]
                    elif key in SCENE_OPTIONS:
                        match=next((v for v in SCENE_OPTIONS[key] if v.casefold()==str(value).strip().casefold()),None)
                        if match: result['scene'][key]=match
                        else: result['warnings'].append('Unrecognized scene value: '+key)
                campaign_content['ai_world']={**world,**result['scene']}
                db.execute('UPDATE work_items SET content=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',(json.dumps(campaign_content),campaign_id))
        grants=answer.get('grants',[])
        # Local models sometimes describe a reference award in both arrays (and
        # even mislabel a spell as an item). The explicit source grant wins.
        reference_awards=set()
        for grant in (grants[:20] if isinstance(grants,list) else []):
            if not isinstance(grant,dict): continue
            source=rows.get(integer(grant.get('record_id')))
            if source and source['content'].get('reference_only'):
                try:
                    ids=targets(grant)
                    if ids: reference_awards.add((source['title'].casefold(),tuple(ids)))
                except ValueError: pass
        proposals=answer.get('cards',[])
        for proposal in (proposals[:10] if isinstance(proposals,list) else []):
            if not isinstance(proposal,dict): continue
            try:
                ids=targets(proposal)
                if not proposal.get('record_id') and (str(proposal.get('title','')).strip().casefold(),tuple(ids)) in reference_awards:
                    continue
                category=str(proposal.get('category','')).lower()
                category={'weapon':'item','ability':'attack','monster':'npc'}.get(category,category)
                if category not in CATEGORIES: raise ValueError('Unsupported card category')
                existing=rows.get(integer(proposal.get('record_id')))
                source=rows.get(integer(proposal.get('source_id')))
                if proposal.get('record_id') and (not existing or existing['content'].get('reference_only') or existing['content'].get('category')!=category): raise ValueError('Record update must target a matching playable card in this campaign')
                if proposal.get('source_id') and (not source or source['content'].get('category')!=category): raise ValueError('Copy source must belong to this campaign and category')
                if private and existing:
                    linked_key='owner_ids' if category=='item' else 'user_ids' if category in ('spell','attack') else 'participant_ids'
                    outside=any(integer(characters.get(integer(cid),{}).get('content',{}).get('owner_user_id')) not in audience for cid in existing['content'].get(linked_key,[]))
                    if outside or existing['content'].get('player_visible') or not set(existing['content'].get('assigned_user_ids',[])).issubset(audience): raise ValueError('Private reply cannot update a shared card')
                title=str(proposal.get('title') or (existing or source or {}).get('title','')).strip()[:120]
                if not title: raise ValueError('Card title missing')
                # Repeated new-card proposals reuse an identical prior AI award.
                if not existing:
                    key='owner_ids' if category=='item' else 'user_ids' if category in ('spell','attack') else 'participant_ids'
                    existing=next((r for r in rows.values() if r['content'].get('ai_created') and not r['content'].get('reference_only') and r['content'].get('category')==category and r['title'].casefold()==title.casefold() and sorted(r['content'].get(key,[]))==ids and bool(r['content'].get('ai_private'))==private),None)
                content=copy.deepcopy((existing or source or {}).get('content',{}))
                if source and not existing:
                    for key in ('owner_ids','user_ids','participant_ids','assigned_user_ids'): content[key]=[]
                content.update(category=category,campaign_id=campaign_id,reference_only=False,ai_created=True,ai_private=private)
                for key,limit in FIELDS.items():
                    if key in proposal: content[key]=str(proposal[key])[:limit]
                if str(proposal.get('category','')).lower()=='weapon': content['item_type']='Weapon'
                content.setdefault('quantity',1)
                if 'quantity' in proposal: content['quantity']=max(0,min(9999,integer(proposal['quantity'],1)))
                if isinstance(proposal.get('tabletop'),dict): content['tabletop']={**content.get('tabletop',{}),**proposal['tabletop']}
                if 'important' in proposal: content['important']=proposal['important'] is True
                if 'share_with_party' in proposal or not existing: content['player_visible']=proposal.get('share_with_party') is True and not private
                content.setdefault('assigned_user_ids',[])
                link(content,ids)
                save(title,content,existing)
            except ValueError as error: result['warnings'].append(str(error))
        for grant in (grants[:20] if isinstance(grants,list) else []):
            if not isinstance(grant,dict): continue
            try:
                ids=targets(grant)
                source=rows.get(integer(grant.get('record_id')))
                if not ids or not source or source['content'].get('category') not in CATEGORIES: raise ValueError('Grant needs an existing campaign card and character recipients')
                content=copy.deepcopy(source['content'])
                existing=source
                if content.get('reference_only'):
                    existing=next((r for r in rows.values() if r['content'].get('ai_source_id')==source['id'] and r['content'].get('ai_granted_characters')==ids and bool(r['content'].get('ai_private'))==private),None)
                    if existing: continue
                    for key in ('owner_ids','user_ids','participant_ids','assigned_user_ids'): content[key]=[]
                    content.update(reference_only=False,ai_created=True,ai_private=private,ai_source_id=source['id'],ai_granted_characters=ids,player_visible=False)
                    if 'quantity' in grant: content['quantity']=max(1,min(9999,integer(grant['quantity'],1)))
                elif private:
                    key='owner_ids' if content['category']=='item' else 'user_ids' if content['category'] in ('spell','attack') else 'participant_ids'
                    if content.get('player_visible') or any(integer(characters.get(cid,{}).get('content',{}).get('owner_user_id')) not in audience for cid in content.get(key,[])): raise ValueError('Private reply cannot alter another audience’s card')
                link(content,ids)
                save(source['title'],content,existing)
            except ValueError as error: result['warnings'].append(str(error))
        db.execute('INSERT INTO campaign_ai_effects(message_id,result) VALUES (?,?)',(message_id,json.dumps(result)))
    return result
