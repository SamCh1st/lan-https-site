"""Integer copper accounting; all map trades commit money and goods together."""
import json
import re
from decimal import Decimal

PEOPLE = ('npc', 'encounter', 'shop')
LIMIT = 1_000_000_000_000

def coins(value):
    if type(value) is not int or not 0 <= value <= LIMIT:
        raise ValueError('Enter a nonnegative coin amount with at most four decimal places in gold.')
    return value

def value_cp(content):
    tt = content.get('tabletop') or {}
    if 'value_cp' in tt: return coins(tt['value_cp'])
    match = re.fullmatch(r'\s*([\d,]+(?:\.\d+)?)\s*(cp|sp|ep|gp|pp)\s*', str(tt.get('value', '')), re.I)
    if match: return min(LIMIT, int(Decimal(match[1].replace(',', '')) * {'cp':1,'sp':100,'ep':5000,'gp':10000,'pp':100000}[match[2].lower()]))
    # SRD magic-item rarity values; a potion is a consumable. The DM can
    # override these and add the base equipment cost to generic magic gear.
    if content.get('category') == 'item':
        gp = {'Common':100,'Uncommon':400,'Rare':4000,'Very Rare':40000,'Legendary':200000}.get(content.get('rarity'),0)
        return gp * (5000 if content.get('item_type')=='Potion' else 10000)
    return 0

def balance(content):
    return coins((content.get('tabletop') or {}).get('money_cp', 0))

def normalize(content):
    if content.get('category') in ('character','npc','encounter','item','spell','attack'):
        tt = content.setdefault('tabletop', {})
        if content['category'] in ('character','npc','encounter'): tt['money_cp'] = balance(content)
        if content['category'] in ('item','spell','attack'): tt['value_cp'] = value_cp(content)

def card(db, ident, cid):
    row = db.execute('SELECT * FROM work_items WHERE id=?', (ident,)).fetchone()
    content = json.loads(row['content']) if row else {}
    if not row or int(content.get('campaign_id') or 0) != cid: raise ValueError('That card is not in this campaign.')
    return row, content

def write(db, ident, content):
    from equipment import reconcile_item
    reconcile_item(db, ident, content)
    db.execute('UPDATE work_items SET content=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', (json.dumps(content), ident))


def item_stack_key(title, content):
    """Compare the item itself, independent of its owners or stock-card ancestry."""
    content=json.loads(json.dumps(content))
    for key in ('quantity','owner_ids','user_ids','assigned_user_ids','encounter_ids','grant_mode',
                'reference_only','player_visible','important','loot_source_record_id','source_url','source_name','default_art',
                'owner_user_id','is_my_character','ai_dm','ai_model','ai_story_mode','ai_story_prompt','initial_map_kind'):
        content.pop(key,None)
    table=content.setdefault('tabletop',{})
    table['value_cp']=value_cp(content)
    table.setdefault('ruleset','2024')
    table.setdefault('equipment_state','Stored')
    for key in ('value','source_price','price_economy_version'):
        table.pop(key,None)
    def compact(value):
        if isinstance(value,dict):
            return {key:clean for key,value in value.items() if (clean:=compact(value)) not in (None,'',False,[],{})}
        if isinstance(value,list): return [compact(entry) for entry in value]
        return value
    # Dictionary equality also treats equivalent numeric values (1 and 1.0) equally.
    return title.strip().casefold(),compact(content)


def receive_card(db, cid, source, content, character_id, quantity=1):
    """Add goods to the recipient's stack, preserving equipped copies when stacks merge."""
    category=content['category'];key='owner_ids' if category=='item' else 'user_ids'
    identity=item_stack_key(source['title'],content) if category=='item' else None
    matches=[]
    for row in db.execute("SELECT * FROM work_items WHERE CAST(json_extract(content,'$.campaign_id') AS INTEGER)=? AND json_extract(content,'$.category')=? ORDER BY id",(cid,category)):
        candidate=json.loads(row['content'])
        if candidate.get(key)!=[character_id] or candidate.get('reference_only') or int(candidate.get('quantity',1))<1: continue
        same=item_stack_key(row['title'],candidate)==identity if category=='item' else candidate.get('loot_source_record_id')==source['id']
        if same: matches.append((row,candidate))
    if not matches:
        clone=dict(content);clone.update(owner_ids=[],user_ids=[],assigned_user_ids=[],encounter_ids=[],reference_only=False,grant_mode='characters',player_visible=False,loot_source_record_id=source['id'],quantity=quantity)
        clone[key]=[character_id]
        return db.execute('INSERT INTO work_items(user_id,title,content) VALUES (?,?,?)',(source['user_id'],source['title'],json.dumps(clone))).lastrowid
    if category!='item': raise ValueError('That character already has this spell or ability.')
    total=sum(int(c.get('quantity',1)) for _,c in matches)+quantity
    if total>9999: raise ValueError('That inventory stack is full.')
    target,combined=matches[0]
    combined['quantity']=total
    if any(c.get('important') for _,c in matches): combined['important']=True
    write(db,target['id'],combined)
    if len(matches)>1:
        duplicates={row['id'] for row,_ in matches[1:]}
        _,character=card(db,character_id,cid)
        table=character.setdefault('tabletop',{})
        if 'equipment_loadout' in table:
            table['equipment_loadout']={slot:target['id'] if ident in duplicates else ident for slot,ident in table['equipment_loadout'].items()}
        if 'equipment_attuned' in table:
            table['equipment_attuned']=list(dict.fromkeys(target['id'] if ident in duplicates else ident for ident in table['equipment_attuned']))
        write(db,character_id,character)
        # Retain old cards for references elsewhere; remove only their inventory copies.
        for row,duplicate in matches[1:]:
            duplicate.update(quantity=0,owner_ids=[])
            write(db,row['id'],duplicate)
    return target['id']

def restock_card(db, cid, node, source, content, quantity):
    """Restock matching goods while retaining the merchant's existing asking price."""
    identity=item_stack_key(source['title'],content)
    matches=[]
    for entry in node.get('contents',[]):
        row=db.execute('SELECT * FROM work_items WHERE id=?',(entry['record_id'],)).fetchone()
        candidate=json.loads(row['content']) if row else {}
        if candidate.get('category')!='item' or candidate.get('campaign_id')!=cid: continue
        if item_stack_key(row['title'],candidate)==identity:
            matches.append((entry,coins(entry.get('price_cp',value_cp(candidate)))))
    if matches:
        preferred=content.get('loot_source_record_id') or source['id']
        target,asking_price=next((match for match in matches if match[0]['record_id']==preferred),matches[0])
        # Separately priced offers remain separate; matching offers become one stock row.
        group=[entry for entry,price in matches if price==asking_price]
        total=sum(entry['quantity'] for entry in group)+quantity
        if total>9999: raise ValueError('The merchant’s item stack is full.')
        target['quantity']=total
        duplicates={entry['record_id'] for entry in group if entry is not target}
        node['contents']=[entry for entry in node['contents'] if entry['record_id'] not in duplicates]
        return target['record_id']
    if len(node.get('contents',[]))>=100: raise ValueError('The merchant’s inventory is full.')
    clone=dict(content);clone.update(owner_ids=[],user_ids=[],assigned_user_ids=[],reference_only=True,quantity=1,player_visible=False)
    clone.pop('loot_source_record_id',None)
    stock_id=db.execute('INSERT INTO work_items(user_id,title,content) VALUES (?,?,?)',(source['user_id'],source['title'],json.dumps(clone))).lastrowid
    node.setdefault('contents',[]).append({'record_id':stock_id,'quantity':quantity,'price_cp':value_cp(content)})
    return stock_id


def person_card(db, node, cid):
    if node.get('type') in PEOPLE and node.get('card_id'):
        row,c = card(db,node['card_id'],cid)
        if c.get('category') == ('npc' if node['type']=='shop' else node['type']): return row,c
    return None

def node_balance(db,node,cid):
    linked = person_card(db,node,cid)
    return balance(linked[1]) if linked else coins(node.get('money_cp',0))

def set_node_balance(db,node,cid,amount):
    amount=coins(amount)
    linked=person_card(db,node,cid)
    if linked:
        row,c=linked;c.setdefault('tabletop',{})['money_cp']=amount;write(db,row['id'],c)
    node['money_cp']=amount

def transact(user_id,cid,mid,data):
    import storage
    import campaign_maps as maps
    maps.access(user_id,cid)
    dm=storage.campaign_role(user_id,cid)=='creator'
    action=data.get('action')
    if action not in ('buy','sell','steal','take_money','steal_money','set_money','set_range'): raise ValueError('Unknown transaction.')
    if action in ('set_money','set_range') and not dm: raise PermissionError('Only the DM can set money or interaction range.')
    with storage.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        maprow=maps.row_for(db,cid,mid);state=json.loads(maprow['state'])
        node=next((n for n in state.get('nodes',[]) if n['id']==data.get('node_id')),None)
        if data.get('node_id') and (not node or (not dm and node.get('hidden'))): raise PermissionError('That part is not available.')
        if action=='set_range':
            value=data.get('range')
            if type(value) is not int or not 0<=value<=50: raise ValueError('Choose a range from 0 to 50 grid squares.')
            row,c=card(db,data.get('character_id'),cid)
            if c.get('category')!='character': raise ValueError('Choose a player character.')
            c.setdefault('tabletop',{})['interaction_range']=value;write(db,row['id'],c)
        elif action=='set_money':
            amount=coins(data.get('amount_cp'))
            if node: set_node_balance(db,node,cid,amount)
            else:
                row,c=card(db,data.get('character_id'),cid)
                if c.get('category') not in ('character','npc','encounter'): raise ValueError('Choose a character.')
                c.setdefault('tabletop',{})['money_cp']=amount;write(db,row['id'],c)
        else:
            if not node: raise ValueError('Choose a map part.')
            cr,character=card(db,data.get('character_id'),cid)
            if character.get('category') not in ('character','npc') or (not dm and (character.get('category')!='character' or character.get('owner_user_id')!=user_id)):
                raise PermissionError('Choose a character you control.')
            if node.get('card_id')==cr['id']: raise ValueError('Choose a different character from this merchant.')
            if not dm:
                maps.require_interaction_range(db,mid,user_id,node,character,maprow['kind'])
                maps.part_opening.require_open(db,cid,mid,user_id,node,cr['id'])
            if action in ('steal','steal_money'):
                if node['type'] not in PEOPLE: raise ValueError('Choose a shop, NPC or encounter to steal from.')
                maps.part_opening.require_open(db,cid,mid,user_id,maps.part_opening.theft_node(node,maprow['revision']),cr['id'])
            if action=='take_money':
                maps.part_opening.require_open(db,cid,mid,user_id,maps.part_opening.theft_node(node,maprow['revision']),cr['id'])
            purse=node_balance(db,node,cid);held=balance(character)
            if action in ('take_money','steal_money'):
                if node['type'] in PEOPLE and action!='steal_money': raise PermissionError('Use Steal to take coins from a person.')
                amount=coins(data.get('amount_cp'))
                if not amount or amount>purse: raise ValueError('Not enough coins in this part.')
                purse-=amount;held+=amount
            else:
                source,c=card(db,data.get('record_id'),cid)
                if action=='sell':
                    if node['type'] not in PEOPLE: raise ValueError('Choose a shop, NPC or encounter to trade with.')
                    if c.get('category')!='item' or c.get('reference_only') or c.get('owner_ids')!=[cr['id']] or int(c.get('quantity',1))<1:
                        raise PermissionError('Only an item held exclusively by this character can be sold.')
                    quantity=data.get('quantity',1)
                    if type(quantity) is not int or not 1<=quantity<=9999: raise ValueError('Choose a whole quantity from 1 to 9999.')
                    if quantity>int(c.get('quantity',1)): raise ValueError('This character does not hold that many items.')
                    unit_price=value_cp(c)
                    price=unit_price*quantity
                    if purse<price: raise ValueError('The merchant does not have enough coins.')
                    c['quantity']=int(c.get('quantity',1))-quantity
                    if not c['quantity']: c['owner_ids']=[]
                    write(db,source['id'],c)
                    restock_card(db,cid,node,source,c,quantity)
                    purse-=price;held+=price
                else:
                    if action=='buy' and node['type'] not in PEOPLE: raise ValueError('This part is not a merchant.')
                    quantity=data.get('quantity',1)
                    if type(quantity) is not int or not 1<=quantity<=9999: raise ValueError('Choose a whole quantity from 1 to 9999.')
                    entry=next((e for e in node.get('contents',[]) if e['record_id']==source['id']),None)
                    if not entry or entry['quantity']<quantity: raise ValueError('Not enough of that item remains in stock.')
                    if c.get('category') not in ('item','spell','attack'): raise ValueError('This card cannot be transferred.')
                    if c['category']!='item' and quantity!=1: raise ValueError('Buy one spell or ability at a time.')
                    price=coins(entry.get('price_cp',value_cp(c)))*quantity if action=='buy' else 0
                    if held<price: raise ValueError('This character does not have enough coins.')
                    receive_card(db,cid,source,c,cr['id'],quantity)
                    # Stack consolidation can remap equipped item IDs on this character.
                    character=card(db,cr['id'],cid)[1]
                    entry['quantity']-=quantity;node['contents']=[e for e in node['contents'] if e['quantity']>0]
                    held-=price;purse+=price
            character.setdefault('tabletop',{})['money_cp']=coins(held);write(db,cr['id'],character)
            set_node_balance(db,node,cid,purse)
            if not node.get('contents') and not purse and node.get('remove_after_looting') and action!='sell':
                state['nodes']=[n for n in state['nodes'] if n['id']!=node['id']]
        db.execute('UPDATE campaign_maps SET state=?,revision=revision+1 WHERE id=?',(json.dumps(state),mid))
    return {'ok':True,'revision':maprow['revision']+1}
