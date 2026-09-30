"""Item requirements and recorded, server-rolled checks for map parts."""
import json
import secrets
import economy

DEFAULTS = dict(needs_item=False, required_item_id=0, needs_roll=False,
                open_die_sides=20, open_die_count=1, open_die_bonus=0, open_roll_target=10, open_dice=[])


def theft_node(node, revision=None):
    result = dict(node)
    result.update({key: node.get('steal_' + key, default) for key, default in DEFAULTS.items()})
    result['id'] = 'steal:' + str(node.get('id', ''))
    result['_steal_revision'] = revision
    return result


def validate(value, theft=False):
    if not theft:
        validate(theft_node(value), True)
    for key in ('needs_item', 'needs_roll'):
        if type(value.get(key, False)) is not bool:
            raise ValueError('Opening requirements must use checkboxes.')
    for key, low, high in [('required_item_id', 0, 2147483647), ('open_die_count', 1, 100),
                           ('open_die_bonus', -999, 999), ('open_roll_target', -999, 10999)]:
        number = value.get(key, DEFAULTS[key])
        if type(number) is not int or not low <= number <= high:
            raise ValueError('Invalid opening setting: ' + key.replace('_', ' ') + '.')
    if type(value.get('open_die_sides', 20)) is not int or value.get('open_die_sides', 20) not in (4, 6, 8, 10, 12, 20, 100):
        raise ValueError('Choose D4, D6, D8, D10, D12, D20 or D100.')
    dice=value.get('open_dice',[])
    if not isinstance(dice,list) or (dice and len(dice)!=value.get('open_die_count',1)) or any(type(d) is not int or d not in (4,6,8,10,12,20,100) for d in dice):
        raise ValueError('Choose a dice type for each die.')
    if value.get('needs_item') and not value.get('required_item_id'):
        raise ValueError('Choose the item needed to open this part.')


def required_item(db, cid, node):
    if not node.get('needs_item'):
        return None
    row = db.execute('SELECT * FROM work_items WHERE id=?', (node.get('required_item_id'),)).fetchone()
    content = json.loads(row['content']) if row else {}
    if content.get('category') != 'item' or int(content.get('campaign_id') or 0) != cid:
        raise ValueError('Choose an existing item from this campaign for the opening requirement.')
    return row, content


def actor(db, cid, user_id, character_id=None):
    if character_id:
        row = db.execute('SELECT * FROM work_items WHERE id=?', (character_id,)).fetchone()
    else:
        row = db.execute("SELECT * FROM work_items WHERE json_extract(content,'$.category')='character' AND CAST(json_extract(content,'$.campaign_id') AS INTEGER)=? AND CAST(json_extract(content,'$.owner_user_id') AS INTEGER)=? ORDER BY updated_at DESC,id DESC LIMIT 1", (cid, user_id)).fetchone()
    content = json.loads(row['content']) if row else {}
    if content.get('category') != 'character' or int(content.get('campaign_id') or 0) != cid:
        raise PermissionError('Select a player character to open this part.')
    return row, content


def signature(node):
    return json.dumps({**{k: node.get(k, v) for k, v in DEFAULTS.items()}, **({'steal_revision': node['_steal_revision']} if '_steal_revision' in node else {})}, sort_keys=True)


def check_item(db, cid, node, character_id):
    required = required_item(db, cid, node)
    if not required:
        return
    source, content = required
    identity = economy.item_stack_key(source['title'], content)
    for row in db.execute("SELECT * FROM work_items WHERE json_extract(content,'$.category')='item' AND CAST(json_extract(content,'$.campaign_id') AS INTEGER)=?", (cid,)):
        item = json.loads(row['content'])
        if item.get('reference_only') or int(item.get('quantity', 1)) < 1:
            continue
        if character_id not in item.get('owner_ids', []) and item.get('grant_mode') != 'all':
            continue
        if row['id'] == source['id'] or item.get('loot_source_record_id') == source['id'] or economy.item_stack_key(row['title'], item) == identity:
            return
    raise PermissionError('You need ' + source['title'] + ' in your inventory to open this part.')


def passed(db, mid, node, character_id):
    return db.execute('SELECT 1 FROM campaign_part_rolls WHERE map_id=? AND node_id=? AND character_id=? AND requirements=? AND passed=1 LIMIT 1', (mid, node['id'], character_id, signature(node))).fetchone() is not None


def require_open(db, cid, mid, user_id, node, character_id=None):
    if not (node.get('needs_item') or node.get('needs_roll')):
        return
    row, _ = actor(db, cid, user_id, character_id)
    check_item(db, cid, node, row['id'])
    if node.get('needs_roll') and not passed(db, mid, node, row['id']):
        raise PermissionError('Pass this part’s dice check before opening it.')


def attempt(user_id, cid, mid, data):
    import storage
    import campaign_maps as maps
    maps.access(user_id, cid)
    dm = storage.campaign_role(user_id, cid) == 'creator'
    with storage.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        maprow = maps.row_for(db, cid, mid)
        node = next((n for n in json.loads(maprow['state']).get('nodes', []) if n['id'] == data.get('node_id')), None)
        if not node or node.get('hidden'):
            raise PermissionError('That part is not available.')
        if data.get('purpose') in ('take', 'steal'):
            opener, opening_character = actor(db, cid, user_id, data.get('character_id'))
            if not dm and int(opening_character.get('owner_user_id') or 0) != user_id:
                raise PermissionError('Choose a character you control.')
            maps.require_interaction_range(db, mid, int(opening_character.get('owner_user_id') or 0), node, opening_character, maprow['kind'])
            require_open(db, cid, mid, user_id, node, opener['id'])
            node = theft_node(node, maprow['revision'])
        elif data.get('purpose') not in (None, 'open'):
            raise ValueError('Unknown check purpose.')
        if not (node.get('needs_item') or node.get('needs_roll')):
            return {'allowed': True}
        cr, character = actor(db, cid, user_id, data.get('character_id'))
        owner = int(character.get('owner_user_id') or 0)
        if not dm and owner != user_id:
            raise PermissionError('Choose a character you control.')
        maps.require_interaction_range(db, mid, owner, node, character, maprow['kind'])
        check_item(db, cid, node, cr['id'])
        if not node.get('needs_roll') or passed(db, mid, node, cr['id']):
            return {'allowed': True}
        settings = {k: node.get(k, v) for k, v in DEFAULTS.items()}
        if data.get('roll') is not True:
            return {'allowed': False, 'needs_roll': True, 'settings': settings}
        types=settings['open_dice'] or [settings['open_die_sides']]*settings['open_die_count']
        mode = data.get('mode', 'normal')
        if mode not in ('normal', 'advantage', 'disadvantage'):
            raise ValueError('Choose normal, advantage or disadvantage.')
        if mode != 'normal' and types.count(20) != 1:
            raise ValueError('Advantage or disadvantage requires exactly one D20 in this check.')
        dice = [secrets.randbelow(sides) + 1 for sides in types]
        pair = None
        if mode != 'normal':
            index = types.index(20)
            pair = [dice[index], secrets.randbelow(20) + 1]
            dice[index] = (max if mode == 'advantage' else min)(pair)
        breakdown = ' + '.join(map(str, dice)) + (f" {settings['open_die_bonus']:+d}" if settings['open_die_bonus'] else '')
        if pair:
            breakdown = f'D20 [{pair[0]}, {pair[1]}], kept {dice[index]} · ' + breakdown
        recorded = dice if pair is None else {'mode': mode, 'd20_rolls': pair, 'kept_dice': dice}
        total = sum(dice) + settings['open_die_bonus']
        success = total >= settings['open_roll_target']
        ident = db.execute('INSERT INTO campaign_part_rolls(map_id,node_id,character_id,user_id,requirements,dice,total,passed) VALUES (?,?,?,?,?,?,?,?)', (mid, node['id'], cr['id'], user_id, signature(node), json.dumps(recorded), total, success)).lastrowid
        return {'allowed': success, 'total': total, 'target': settings['open_roll_target'], 'roll_id': ident,
                'breakdown': breakdown, 'mode': mode}
