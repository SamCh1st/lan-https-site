"""Multiple normal-campaign maps, with shared campaign scenes and separate token positions.

See [README: world rules and artwork](../README.md#world-rules-and-artwork)."""
import json
import math
import re
import storage
import economy
import part_opening
from map_part_catalog import PARTS as MAP_PARTS
from ai_effects import SCENE_OPTIONS

ARRAYS=('objects','paint','expanded','removed','checkpoints','folders','icons','nodes')
MATERIALS=('empty','grass','water','sand','stone','snow','wood','path','wall','marble','brick','cobble','slate','iron','moss','mud','lava','swamp','ice','gravel','basalt','tiles','carpet','arcane')
ENVIRONMENT_TYPES=('mossy_boulder','rock_outcrop','standing_stone','driftwood','fern_patch','cattails','tide_pool','ice_crystal','stalagmite','fallen_leaves','glowing_mushrooms','brazier','lantern','candle_cluster','rune_stone','timber_fence')
LOCATION_TYPES=tuple(part['type'] for part in MAP_PARTS if part['group']=='locations')
PROP_TYPES=('book_red', 'book_blue', 'book_green', 'book_purple', 'book_brown', 'book_open', 'ceramic_mug', 'pewter_tankard', 'plate', 'wooden_bowl', 'goblet', 'potion_red', 'potion_blue', 'potion_green', 'potion_purple', 'scroll', 'brass_key', 'silver_spoon')
ITEM_PROP_TYPES=('item_club', 'item_dagger', 'item_greatclub', 'item_handaxe', 'item_javelin', 'item_light_hammer', 'item_mace', 'item_quarterstaff', 'item_sickle', 'item_spear', 'item_dart', 'item_light_crossbow', 'item_shortbow', 'item_sling', 'item_battleaxe', 'item_flail', 'item_glaive', 'item_greataxe', 'item_greatsword', 'item_halberd', 'item_lance', 'item_longsword', 'item_maul', 'item_morningstar', 'item_pike', 'item_rapier', 'item_scimitar', 'item_shortsword', 'item_trident', 'item_warhammer', 'item_war_pick', 'item_whip', 'item_blowgun', 'item_hand_crossbow', 'item_heavy_crossbow', 'item_longbow', 'item_padded', 'item_leather_armor', 'item_studded_leather', 'item_hide_armor', 'item_chain_shirt', 'item_scale_mail', 'item_breastplate', 'item_half_plate', 'item_ring_mail', 'item_chain_mail', 'item_splint', 'item_plate', 'item_shield', 'item_armor_plus_1', 'item_shield_plus_1', 'item_cloak_of_protection', 'item_backpack', 'item_bedroll', 'item_rope', 'item_torch', 'item_tinderbox', 'item_rations', 'item_waterskin', 'item_healers_kit', 'item_thieves_tools', 'item_herbalism_kit', 'item_component_pouch', 'item_arcane_focus_wand', 'item_holy_symbol_amulet', 'item_druidic_focus_sprig_of_mistletoe', 'item_spellbook', 'item_arrows_20', 'item_crossbow_bolts_20', 'item_explorers_pack', 'item_potion_of_healing', 'item_potion_of_greater_healing', 'item_potion_of_superior_healing', 'item_potion_of_supreme_healing', 'item_weapon_plus_1', 'item_goggles_of_night', 'item_bag_of_holding')
SETTLEMENT_TYPES=tuple(part['type'] for part in MAP_PARTS if part['group']=='settlement')
NEW_TYPES=SETTLEMENT_TYPES+tuple(part['type'] for part in MAP_PARTS if part['group']=='building_kits')+ITEM_PROP_TYPES+PROP_TYPES+LOCATION_TYPES+ENVIRONMENT_TYPES+('exit_location','point_light','shop','camera_bounds','encounter','lava','swamp','ice','gravel','basalt','tiles','carpet','arcane')+('stone_pillar', 'broken_pillar', 'portcullis', 'trapdoor', 'spike_pit', 'pressure_plate', 'lever', 'bone_pile', 'coffin', 'bench', 'round_table', 'cupboard', 'writing_desk', 'weapon_rack', 'market_stall', 'fountain', 'cart', 'hay_bale', 'forge', 'gravestone', 'ritual_circle', 'portal', 'crystal_cluster', 'arcane_obelisk', 'summoning_sigil', 'potion_table', 'bedroll', 'supply_crates', 'camp_tarp', 'rope_bridge', 'fallen_log', 'tree_stump', 'lily_pads', 'reeds', 'thorn_bush', 'spider_web')+('oak_tree','pine_tree','blossom_tree','building','hall','cottage','ruin','marble','brick','cobble','slate','iron','moss','mud','barrel','crate','table','chair','bed','bookshelf','altar','well','campfire','anvil','stairs','rug','sarcophagus','cage','boat','flowers','wildflowers','sunflowers','grass_tuft','foliage','fern','pebbles','mushrooms','butterfly','bee','dragonfly','firefly','ladybug')
NEW_TYPES += tuple(part['type'] for part in MAP_PARTS if part.get('catalog_pack') == 'business-2026-09')

def initialize(db):
    db.executescript('''
    CREATE TABLE IF NOT EXISTS campaign_marker_meetings (
      campaign_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
      card_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY(campaign_id,card_id,user_id));
    CREATE TABLE IF NOT EXISTS campaign_maps (
      id INTEGER PRIMARY KEY, campaign_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
      title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('2d','3d')), state TEXT NOT NULL DEFAULT '{}', revision INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS campaign_part_rolls (
      id INTEGER PRIMARY KEY, map_id INTEGER NOT NULL REFERENCES campaign_maps(id) ON DELETE CASCADE,
      node_id TEXT NOT NULL, character_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, requirements TEXT NOT NULL,
      dice TEXT NOT NULL, total INTEGER NOT NULL, passed INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS part_roll_access ON campaign_part_rolls(map_id,node_id,character_id);
    CREATE TABLE IF NOT EXISTS campaign_map_settings (
      campaign_id INTEGER PRIMARY KEY REFERENCES work_items(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('2d','3d')));
    CREATE TABLE IF NOT EXISTS campaign_map_selection (
      campaign_id INTEGER PRIMARY KEY REFERENCES work_items(id) ON DELETE CASCADE,
      map_id INTEGER NOT NULL REFERENCES campaign_maps(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS campaign_map_views (
      campaign_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      map_id INTEGER NOT NULL REFERENCES campaign_maps(id) ON DELETE CASCADE,
      PRIMARY KEY(campaign_id,user_id));
    CREATE TABLE IF NOT EXISTS campaign_map_visits (
      campaign_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      map_id INTEGER NOT NULL REFERENCES campaign_maps(id) ON DELETE CASCADE,
      PRIMARY KEY(campaign_id,user_id,map_id));
    CREATE TABLE IF NOT EXISTS campaign_map_positions (
      map_id INTEGER NOT NULL REFERENCES campaign_maps(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      x REAL NOT NULL DEFAULT 0,y REAL NOT NULL DEFAULT 0,z REAL NOT NULL DEFAULT 0,motion TEXT NOT NULL DEFAULT 'idle',
      PRIMARY KEY(map_id,user_id));
    ''')

def access(user_id,campaign_id,creator=False):
    campaign=storage.campaign_record(user_id,campaign_id)
    if not campaign or campaign['content'].get('ai_dm') or (creator and storage.campaign_role(user_id,campaign_id)!='creator'):
        raise PermissionError('This map action requires access to a normal campaign'+(' as its DM.' if creator else '.'))
    return campaign

def map_kind(db,cid):
    setting=db.execute('SELECT kind FROM campaign_map_settings WHERE campaign_id=?',(cid,)).fetchone()
    if setting: return setting['kind']
    active=db.execute('SELECT m.kind FROM campaign_map_selection s JOIN campaign_maps m ON m.id=s.map_id AND m.campaign_id=s.campaign_id WHERE s.campaign_id=?',(cid,)).fetchone()
    first=db.execute('SELECT kind FROM campaign_maps WHERE campaign_id=? ORDER BY id LIMIT 1',(cid,)).fetchone()
    campaign=db.execute('SELECT content FROM work_items WHERE id=?',(cid,)).fetchone()
    chosen=active or first
    kind=chosen['kind'] if chosen else ('2d' if json.loads(campaign['content']).get('initial_map_kind')=='2d' else '3d')
    db.execute('INSERT OR IGNORE INTO campaign_map_settings(campaign_id,kind) VALUES (?,?)',(cid,kind))
    return db.execute('SELECT kind FROM campaign_map_settings WHERE campaign_id=?',(cid,)).fetchone()['kind']

def ensure_default(campaign):
    cid=campaign['id']
    with storage.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        kind=map_kind(db,cid)
        if not db.execute('SELECT 1 FROM campaign_maps WHERE campaign_id=? AND kind=?',(cid,kind)).fetchone():
            c=campaign['content'];state={key:c.get('map_'+key,[]) for key in ARRAYS if key!='nodes'}
            state.update(time=c.get('map_time','day'),weather=c.get('map_weather','clear'),scene=c.get('ai_world',{}))
            mid=db.execute('INSERT INTO campaign_maps(campaign_id,title,kind,state) VALUES (?,?,?,?)',(cid,'Main map' if c.get('initial_map_kind') else 'Original map',kind,json.dumps(state))).lastrowid
            db.execute('INSERT INTO campaign_map_positions(map_id,user_id,x,y,z,motion) SELECT ?,user_id,x,y,z,motion FROM campaign_player_positions WHERE campaign_id=?',(mid,cid))
            db.execute('INSERT OR REPLACE INTO campaign_map_selection(campaign_id,map_id) VALUES (?,?)',(cid,mid))

def listing(user_id,cid):
    campaign=access(user_id,cid);ensure_default(campaign)
    creator=storage.campaign_role(user_id,cid)=='creator'
    with storage.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        kind=map_kind(db,cid)
        maps=[dict(r) for r in db.execute('SELECT id,title,kind,revision FROM campaign_maps WHERE campaign_id=? AND kind=? ORDER BY id',(cid,kind))]
        active=db.execute('SELECT map_id FROM campaign_map_selection WHERE campaign_id=?',(cid,)).fetchone()
        active_id=active['map_id'] if active and any(m['id']==active['map_id'] for m in maps) else maps[0]['id']
        viewer_id=active_id
        if not creator:
            viewer_id=maps[0]['id']
            choice=db.execute('SELECT map_id FROM campaign_map_views WHERE campaign_id=? AND user_id=?',(cid,user_id)).fetchone()
            if choice and any(m['id']==choice['map_id'] for m in maps): viewer_id=choice['map_id']
            else: db.execute('INSERT OR REPLACE INTO campaign_map_views(campaign_id,user_id,map_id) VALUES (?,?,?)',(cid,user_id,viewer_id))
            db.execute('INSERT OR IGNORE INTO campaign_map_visits(campaign_id,user_id,map_id) VALUES (?,?,?)',(cid,user_id,viewer_id))
            visited={row['map_id'] for row in db.execute('SELECT map_id FROM campaign_map_visits WHERE campaign_id=? AND user_id=?',(cid,user_id))}
            maps=[m for m in maps if m['id'] in visited]
        archived=db.execute('SELECT COUNT(*) FROM campaign_maps WHERE campaign_id=? AND kind<>?',(cid,kind)).fetchone()[0]
    return {'maps':maps,'active_map_id':active_id,'viewer_map_id':viewer_id,'map_kind':kind,'archived_map_count':archived,'creator':creator}

def create(user_id,cid,data):
    campaign=access(user_id,cid,True);ensure_default(campaign)
    title=str(data.get('title','')).strip()
    if not title or len(title)>120: raise ValueError('Enter a map name of at most 120 characters.')
    with storage.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        kind=map_kind(db,cid)
        if data.get('kind',kind)!=kind: raise ValueError('This campaign uses '+kind.upper()+' maps. All its maps must use the same type.')
        source=db.execute('SELECT m.state FROM campaign_maps m LEFT JOIN campaign_map_selection s ON s.campaign_id=m.campaign_id AND s.map_id=m.id WHERE m.campaign_id=? ORDER BY s.map_id IS NOT NULL DESC,m.id LIMIT 1',(cid,)).fetchone()
        shared=json.loads(source['state']) if source else {}
        initial={'nodes':[],'scene':shared.get('scene',{}),**{k:shared[k] for k in ('time','weather') if k in shared}}
        mid=db.execute('INSERT INTO campaign_maps(campaign_id,title,kind,state) VALUES (?,?,?,?)',(cid,title,kind,json.dumps(initial))).lastrowid
        db.execute('INSERT OR REPLACE INTO campaign_map_selection(campaign_id,map_id) VALUES (?,?)',(cid,mid))
    return {'id':mid,'title':title,'kind':kind,'revision':0}

def row_for(db,cid,mid):
    row=db.execute('SELECT * FROM campaign_maps WHERE id=? AND campaign_id=?',(mid,cid)).fetchone()
    if not row: raise ValueError('That map does not belong to this campaign.')
    kind=map_kind(db,cid)
    if row['kind']!=kind: raise ValueError('This campaign uses '+kind.upper()+' maps. That older map is preserved but unavailable here.')
    return row

def get(user_id,cid,mid):
    access(user_id,cid)
    dm=storage.campaign_role(user_id,cid)=='creator'
    with storage.connect() as db:
        row=row_for(db,cid,mid);state=json.loads(row['state'])
        targets={r['id'] for r in db.execute('SELECT id FROM campaign_maps WHERE campaign_id=? AND kind=?',(cid,row['kind']))}
        for node in state.get('nodes',[]):
            if node.get('connected_map_id') and node['connected_map_id'] not in targets: node['connected_map_id']=None
            if node.get('arrival_from_map_id') and node['arrival_from_map_id'] not in targets: node['arrival_from_map_id']=None
        positions={r['user_id']:dict(r) for r in db.execute('SELECT * FROM campaign_map_positions WHERE map_id=?',(mid,))}
        locations={r['user_id']:r['map_id'] for r in db.execute('SELECT user_id,map_id FROM campaign_map_views WHERE campaign_id=?',(cid,))}
        main_id=min(targets)
    if not dm:
        if mid not in {m['id'] for m in listing(user_id,cid)['maps']}:
            raise PermissionError('You have not visited this map yet.')
        state['nodes']=[node for node in state.get('nodes',[]) if not node.get('hidden')]
    # Public containers reveal only the card name/type, not private card notes.
    with storage.connect() as db:
        for node in state.get('nodes',[]):
            node.pop('marker_card',None)
            node['met']=bool(db.execute('SELECT 1 FROM campaign_marker_meetings WHERE campaign_id=? AND card_id=? AND user_id=?',(cid,node.get('card_id'),user_id)).fetchone())
            if node.get('card_id') and node.get('type') in ('npc','encounter','shop'):
                card=db.execute('SELECT id,title,content FROM work_items WHERE id=?',(node['card_id'],)).fetchone()
                if card:
                    c=json.loads(card['content'])
                    if int(c.get('campaign_id') or 0)==cid and c.get('category')==('npc' if node['type']=='shop' else node['type']):
                        node['marker_card']={'id':card['id'],'title':card['title'],'content':{'category':c['category'],'image_id':c.get('image_id'),'map_image_scale':c.get('map_image_scale',1)}}
            node['money_cp']=economy.node_balance(db,node,cid)
            for entry in node.get('contents',[]):
                card=db.execute("SELECT title,content FROM work_items WHERE id=?",(entry['record_id'],)).fetchone()
                if card:
                    c=json.loads(card['content'])
                    if int(c.get('campaign_id') or 0)==cid and c.get('category') in ('item','spell','attack'):
                        entry['title']=card['title'];entry['category']=c['category'];entry.setdefault('price_cp',economy.value_cp(c))
    base=storage.campaign_map_state(user_id,cid)
    players=[]
    for player in base['players']:
        present=locations.get(player['id'],main_id)==mid
        if not dm and not present: continue
        pos=positions.get(player['id'],{'x':0,'y':0,'z':0,'motion':'idle'})
        players.append({**player,**{key:pos[key] for key in ('x','y','z','motion')},'present':present,'placed':player['id'] in positions})
    return {'id':mid,'title':row['title'],'kind':row['kind'],'revision':row['revision'],'state':state,'players':players,'npcs':base['npcs']}

def clean_patch(data):
    if not isinstance(data,dict): raise ValueError('Invalid map data.')
    if len(json.dumps(data,allow_nan=False))>2000000: raise ValueError('This map is too large to save.')
    clean={}
    for key in ARRAYS:
        if key in data:
            if not isinstance(data[key],list) or len(data[key])>5000: raise ValueError('Map layers must contain at most 5,000 entries.')
            clean[key]=data[key]
    if 'folders' in clean:
        if len(clean['folders'])>100: raise ValueError('A map can have at most 100 folders.')
        seen=set()
        for folder in clean['folders']:
            if not isinstance(folder,dict) or not isinstance(folder.get('id'),str) or not 1<=len(folder['id'])<=100 or folder['id'] in seen or not isinstance(folder.get('name'),str) or not 1<=len(folder['name'].strip())<=50: raise ValueError('Invalid map folder.')
            seen.add(folder['id'])
            if 'locked' in folder and type(folder['locked']) is not bool: raise ValueError('Invalid folder lock.')
            if 'parent_id' in folder and not isinstance(folder['parent_id'],str): raise ValueError('Invalid parent folder.')
        parents={folder['id']:folder.get('parent_id','') for folder in clean['folders']}
        for folder_id,parent in parents.items():
            visited={folder_id}
            while parent:
                if parent not in parents or parent in visited: raise ValueError('Folder nesting must not contain cycles or missing parents.')
                visited.add(parent)
                parent=parents[parent]
    if 'nodes' in clean:
        if sum(n.get('type')=='point_light' or n.get('point_light') is True for n in clean['nodes'] if isinstance(n,dict))>64: raise ValueError('A map can have at most 64 point lights.')
        import re
        for node in clean['nodes']:
            if not isinstance(node,dict) or not isinstance(node.get('id'),str) or len(node['id'])>100:
                raise ValueError('Invalid 2D map object.')
            if node.get('type') not in ('grass','water','path','stone','sand','snow','wood','wall','road','river','door','tree','oak','rock','mountain','chest','torch','house','tower','tent','bridge','fog','zone','npc','label')+NEW_TYPES:
                raise ValueError('Invalid 2D map object type.')
            for field in ('x','y','w','h','rotation'):
                value=node.get(field,0)
                if not isinstance(value,(int,float)) or not math.isfinite(value) or abs(value)>10000:
                    raise ValueError('Invalid 2D map dimensions.')
            if node.get('w',0)<=0 or node.get('h',0)<=0: raise ValueError('Map objects need positive dimensions.')
            if not re.fullmatch(r'#[0-9a-fA-F]{6}',str(node.get('color','#77746b'))): raise ValueError('Invalid map color.')
            if 'folder_id' in node and (not isinstance(node['folder_id'],str) or len(node['folder_id'])>100): raise ValueError('Invalid object folder.')
            node.pop('marker_card',None)
            node.pop('met',None)
            if node.get('card_id') is not None and (type(node['card_id']) is not int or node['card_id']<=0 or node.get('type') not in ('npc','encounter','shop')): raise ValueError('Choose a valid NPC or encounter card.')
            if node.get('type')=='camera_bounds': node['rotation']=0
            if node.get('arrival_from_map_id') is not None:
                if node.get('type') != 'exit_location' or type(node['arrival_from_map_id']) is not int or node['arrival_from_map_id'] <= 0:
                    raise ValueError('Choose a valid arrival source map for an exit location.')
            if node.get('type') == 'exit_location':
                node['walk_over'] = True
                node['connected_map_id'] = None
                if any(abs((node[axis]+node[size]/2-20)/40)>100 for axis,size in [('x','w'),('y','h')]):
                    raise ValueError('Place the exit location within the playable map.')
            node['label']=str(node.get('label',''))[:120]
            if node.get('connected_map_id') is not None and (type(node['connected_map_id']) is not int or node['connected_map_id']<=0):
                raise ValueError('Choose a valid connected map.')
            if node.get('texture_material','') not in MATERIALS+('',): raise ValueError('Choose a valid tile material.')
            if type(node.get('texture_scale',1)) not in (int,float) or not .1<=node.get('texture_scale',1)<=4: raise ValueError('Texture size must be between 0.1 and 4.')
            if 'spline_kind' in node:
                if node['spline_kind'] not in ('building','roof','wall','fence','river','stream','path','road'): raise ValueError('Invalid spline type.')
                points=node.get('spline_points')
                minimum=3 if node['spline_kind'] in ('building','roof') else 2
                if not isinstance(points,list) or not minimum<=len(points)<=160: raise ValueError('Invalid spline control points.')
                for point in points:
                    if not isinstance(point,list) or len(point)!=2 or any(type(v) not in (int,float) or not math.isfinite(v) or abs(v)>10000 for v in point): raise ValueError('Invalid spline point.')
                for field in ('spline_base_w','spline_base_h'):
                    if type(node.get(field)) not in (int,float) or not 0<node[field]<=10000: raise ValueError('Invalid spline scale.')
                if type(node.get('spline_curve',False)) is not bool: raise ValueError('Invalid spline curve setting.')
                if type(node.get('spline_width',12)) not in (int,float) or not 4<=node.get('spline_width',12)<=320: raise ValueError('Invalid spline width.')
                if node.get('spline_texture','stone') not in MATERIALS[1:]+('roof_terracotta','roof_slate'): raise ValueError('Invalid spline texture.')
                if node.get('roof_texture','roof_terracotta') not in MATERIALS[1:]+('roof_terracotta','roof_slate'): raise ValueError('Invalid roof texture.')
                for option in ('building_details','building_entry','roof_chimney'):
                    if type(node.get(option,True)) is not bool: raise ValueError('Building details must use checkboxes.')
                if type(node.get('spline_flow',1)) not in (int,float) or not -2<=node.get('spline_flow',1)<=2: raise ValueError('Spline flow must be between -2 and 2.')
                if node.get('building_view','interior') not in ('interior','exterior'): raise ValueError('Invalid building view.')
            for field in ('floor_texture','wall_texture'):
                if field in node and node[field] not in MATERIALS[1:]: raise ValueError('Invalid building material.')
            if 'wall_width' in node and (not isinstance(node['wall_width'],(int,float)) or not 4<=node['wall_width']<=32): raise ValueError('Invalid wall thickness.')
            if 'interior_walls' in node:
                if node['type'] not in ('building','hall','cottage','ruin') or not isinstance(node['interior_walls'],list) or len(node['interior_walls'])>100: raise ValueError('Invalid interior walls.')
                total=0
                for line in node['interior_walls']:
                    if not isinstance(line,list) or not 2<=len(line)<=1000: raise ValueError('Invalid wall line.')
                    total+=len(line)
                    for point in line:
                        if not isinstance(point,list) or len(point)!=2 or any(type(v) not in (int,float) or not math.isfinite(v) or abs(v)>10000 for v in point): raise ValueError('Invalid wall point.')
                if total>12000: raise ValueError('Too many interior wall points.')
                for field in ('wall_base_w','wall_base_h'):
                    if type(node.get(field)) not in (int,float) or not 0<node[field]<=10000: raise ValueError('Invalid wall scale.')
            if 'building_shapes' in node:
                if node['type'] not in ('building','hall','cottage','ruin') or not isinstance(node['building_shapes'],list) or not 1<=len(node['building_shapes'])<=100: raise ValueError('Invalid building outline.')
                total=0
                for shape in node['building_shapes']:
                    if not isinstance(shape,dict) or not isinstance(shape.get('points'),list) or not 3<=len(shape['points'])<=2000: raise ValueError('Invalid building shape.')
                    total+=len(shape['points'])
                    for point in shape['points']:
                        if not isinstance(point,list) or len(point)!=2 or any(type(v) not in (int,float) or not math.isfinite(v) or abs(v)>10000 for v in point): raise ValueError('Invalid building outline point.')
                    for field in ('floor_texture','wall_texture'):
                        if field in shape and shape[field] not in MATERIALS[1:]: raise ValueError('Invalid building material.')
                if total>12000: raise ValueError('Building outline is too detailed.')
                for field in ('room_base_w','room_base_h'):
                    if type(node.get(field)) not in (int,float) or not 0<node[field]<=10000: raise ValueError('Invalid building scale.')
            if 'rooms' in node:
                if not isinstance(node['rooms'],list) or not 1<=len(node['rooms'])<=100: raise ValueError('Invalid joined building.')
                cells=0
                for room in node['rooms']:
                    if not isinstance(room,dict): raise ValueError('Invalid room.')
                    for field in ('x','y','w','h'):
                        value=room.get(field)
                        if not isinstance(value,(int,float)) or not math.isfinite(value) or not 0<=value<=10000: raise ValueError('Invalid room dimensions.')
                    if room['w']<40 or room['h']<40: raise ValueError('Rooms must contain at least one grid square.')
                    cells+=math.ceil(room['w']/40)*math.ceil(room['h']/40)
                    for field in ('floor_texture','wall_texture'):
                        if room.get(field,'stone') not in MATERIALS[1:]: raise ValueError('Invalid room material.')
                    if not isinstance(room.get('wall_width',12),(int,float)) or not 4<=room.get('wall_width',12)<=32: raise ValueError('Invalid room wall thickness.')
                if cells>4096: raise ValueError('A joined building can contain at most 4,096 grid squares.')
                for field in ('room_base_w','room_base_h'):
                    if not isinstance(node.get(field),(int,float)) or not 0<node[field]<=10000: raise ValueError('Invalid joined building scale.')
            part_opening.validate(node)
            if 'contents' in node:
                if not isinstance(node['contents'],list) or len(node['contents'])>100: raise ValueError('A map object can hold at most 100 different cards.')
                ids=set()
                for entry in node['contents']:
                    if not isinstance(entry,dict) or type(entry.get('record_id')) is not int or type(entry.get('quantity')) is not int or not 1<=entry['quantity']<=9999 or entry['record_id'] in ids: raise ValueError('Invalid object contents.')
                    if 'price_cp' in entry: economy.coins(entry['price_cp'])
                    ids.add(entry['record_id'])
            if 'remove_after_looting' in node and type(node['remove_after_looting']) is not bool: raise ValueError('Invalid remove-after-looting setting.')
            if 'point_light' in node and (type(node['point_light']) is not bool or node.get('type') not in ('zone','point_light')): raise ValueError('Invalid point light marker.')
            if 'money_cp' in node: economy.coins(node['money_cp'])
            node['contents_public']=node.get('contents_public') is True
            for field,maximum in [('height_scale',4),('fire_wave',1),('fire_flicker',1),('light_radius',5000),('light_intensity',1),('light_softness',1),('shadow_length',8),('shadow_strength',1)]:
                if field in node and (type(node[field]) not in (int,float) or not math.isfinite(node[field]) or not 0<=node[field]<=maximum): raise ValueError('Invalid point light setting.')
            for key in ('part_card_id','part_image_id'):
                if key in node and (type(node[key]) is not int or node[key] < 1): raise ValueError('Invalid map part card or image.')
            if type(node.get('walk_over',True)) is not bool: raise ValueError('Invalid walk over setting.')
            if 'light_enabled' in node and type(node['light_enabled']) is not bool: raise ValueError('Invalid part light source setting.')
            if 'part_name' in node and (not isinstance(node['part_name'],str) or len(node['part_name'])>120): raise ValueError('Invalid part name.')
            if 'light_color' in node and (not isinstance(node['light_color'],str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',node['light_color'])): raise ValueError('Invalid light color.')
            if 'fire_light' in node and type(node['fire_light']) is not bool: raise ValueError('Invalid fire light setting.')
            if 'effects' in node and type(node['effects']) is not bool: raise ValueError('Invalid ambient effect setting.')
            for field in ('flow_x','flow_y'):
                if field in node and (node['type']!='river' or type(node[field]) not in (int,float) or not math.isfinite(node[field]) or not -2<=node[field]<=2): raise ValueError('River flow must be a number between -2 and 2.')
            if 'opacity' in node and (not isinstance(node['opacity'],(int,float)) or not 0<=node['opacity']<=1): raise ValueError('Invalid object opacity.')
            if 'instances' in node:
                ambience=('oak_tree','pine_tree','blossom_tree','flowers','wildflowers','sunflowers','grass_tuft','foliage','fern','pebbles','rock','mushrooms','butterfly','bee','dragonfly','firefly','ladybug')
                if node['type'] not in ambience or not isinstance(node['instances'],list) or not 1<=len(node['instances'])<=5000: raise ValueError('Invalid ambience layer.')
                for field in ('ambience_w','ambience_h'):
                    if type(node.get(field)) not in (int,float) or not 0<node[field]<=10000: raise ValueError('Invalid ambience scale.')
                for instance in node['instances']:
                    if not isinstance(instance,dict) or set(instance)-{'x','y','w','h','rotation'}: raise ValueError('Invalid ambience instance.')
                    for field in ('x','y','w','h','rotation'):
                        value=instance.get(field)
                        if type(value) not in (int,float) or not math.isfinite(value) or abs(value)>10000: raise ValueError('Invalid ambience dimensions.')
                    if instance['w']<=0 or instance['h']<=0: raise ValueError('Invalid ambience size.')
            if 'erasures' in node:
                if not isinstance(node['erasures'],list) or len(node['erasures'])>4000: raise ValueError('Too many reverse brush marks.')
                for mark in node['erasures']:
                    if not isinstance(mark,list) or len(mark)!=4 or any(type(v) not in (int,float) or not math.isfinite(v) or abs(v)>10000 for v in mark) or mark[2]<=0 or mark[3]<=0: raise ValueError('Invalid reverse brush mark.')
            if 'tile_cells' in node:
                cells=node['tile_cells']
                if node['type'] not in MATERIALS+('road','river') or not isinstance(cells,list) or not 1<=len(cells)<=5000: raise ValueError('Invalid tile paint.')
                for field in ('tile_base_w','tile_base_h'):
                    if type(node.get(field)) not in (int,float) or not math.isfinite(node[field]) or not 40<=node[field]<=10000 or node[field]%40: raise ValueError('Invalid tile paint bounds.')
                seen=set()
                for cell in cells:
                    if not isinstance(cell,list) or len(cell)!=2 or any(type(v) is not int or v<0 for v in cell): raise ValueError('Invalid painted tile.')
                    if cell[0]*40>=node['tile_base_w'] or cell[1]*40>=node['tile_base_h'] or tuple(cell) in seen: raise ValueError('Invalid painted tile bounds.')
                    seen.add(tuple(cell))
            if node.get('shape')=='stroke':
                if 'softness' in node and (not isinstance(node['softness'],(int,float)) or not 0<=node['softness']<=1): raise ValueError('Invalid brush softness.')
                if 'strokes' in node:
                    strokes=node['strokes']
                    if not isinstance(strokes,list) or not 1<=len(strokes)<=100: raise ValueError('Invalid connected brush.')
                    total=0
                    for stroke in strokes:
                        if not isinstance(stroke,dict) or not isinstance(stroke.get('points'),list) or not 1<=len(stroke['points'])<=2000: raise ValueError('Invalid connected stroke.')
                        total+=len(stroke['points'])
                        for point in stroke['points']:
                            if not isinstance(point,list) or len(point)!=2 or any(not isinstance(v,(int,float)) or not math.isfinite(v) or abs(v)>10000 for v in point): raise ValueError('Invalid connected brush point.')
                        if 'transform' in stroke and (not isinstance(stroke['transform'],list) or len(stroke['transform'])!=6 or any(type(v) not in (int,float) or not math.isfinite(v) or abs(v)>100000 for v in stroke['transform'])): raise ValueError('Invalid brush transform.')
                        if not isinstance(stroke.get('brush'),(int,float)) or not 0<stroke['brush']<=10000: raise ValueError('Invalid connected brush width.')
                        if not isinstance(stroke.get('softness',.55),(int,float)) or not 0<=stroke.get('softness',.55)<=1: raise ValueError('Invalid connected brush softness.')
                    if total>12000: raise ValueError('A connected brush has too many points.')
                points=node.get('points')
                if not isinstance(points,list) or not 1<=len(points)<=2000: raise ValueError('Invalid brush stroke.')
                for point in points:
                    if not isinstance(point,list) or len(point)!=2 or any(not isinstance(v,(int,float)) or not math.isfinite(v) or abs(v)>10000 for v in point): raise ValueError('Invalid brush point.')
                for key in ('brush','baseW','baseH'):
                    value=node.get(key,40)
                    if not isinstance(value,(int,float)) or not 0<value<=10000: raise ValueError('Invalid brush dimensions.')
    if 'canvas' in data:
        settings=data['canvas']
        if not isinstance(settings,dict): raise ValueError('Invalid canvas settings.')
        background=settings.get('background','empty')
        if background not in MATERIALS: raise ValueError('Invalid canvas background.')
        clean['canvas']={'background':background,'grid':settings.get('grid',True) is not False}
        if 'texture_seed' in settings:
            if type(settings['texture_seed']) is not int or not 0<=settings['texture_seed']<=1000000: raise ValueError('Invalid texture seed.')
            clean['canvas']['texture_seed']=settings['texture_seed']
        for field,default,maximum in [('light_angle',315,360),('relief',1,3),('sun_shadow_length',1,8),('sun_shadow_strength',1,1)]:
            value=settings.get(field,default)
            if not isinstance(value,(int,float)) or not math.isfinite(value) or not 0<=value<=maximum: raise ValueError('Invalid material lighting.')
            clean['canvas'][field]=value
    if 'scene' in data:
        if not isinstance(data['scene'],dict): raise ValueError('Invalid scene.')
        clean['scene']={}
        for key,value in data['scene'].items():
            if key in ('location','mood'): clean['scene'][key]=str(value)[:120]
            elif key in SCENE_OPTIONS and value in SCENE_OPTIONS[key]: clean['scene'][key]=value
    for key,values in [('time',('morning','day','evening','night')),('weather',('clear','rain','storm'))]:
        if key in data and data[key] in values: clean[key]=data[key]
    return clean

def update(user_id,cid,mid,data):
    access(user_id,cid,True)
    clean=clean_patch(data.get('state',{}))
    with storage.connect() as db:
        db.execute('BEGIN IMMEDIATE');row=row_for(db,cid,mid)
        if data.get('revision')!=row['revision']: raise FileExistsError('This map changed in another window. Reload the map before editing again.')
        if 'nodes' in clean:
            valid={r['id'] for r in db.execute("SELECT id FROM work_items WHERE CAST(json_extract(content,'$.campaign_id') AS INTEGER)=? AND json_extract(content,'$.category') IN ('item','spell','attack')",(cid,))}
            arrival_sources=set()
            for node in clean['nodes']:
                if node.get('arrival_from_map_id'):
                    source=node['arrival_from_map_id']
                    if source==mid: raise ValueError('Choose a different arrival source map.')
                    row_for(db,cid,source)
                    if source in arrival_sources: raise ValueError('Use one exit location per source map on this map.')
                    arrival_sources.add(source)
                part_opening.required_item(db,cid,node)
                part_opening.required_item(db,cid,part_opening.theft_node(node))
                if node.get('part_image_id') and not storage.get_visible_upload(user_id,node['part_image_id']): raise ValueError('Choose artwork available to this campaign.')
                if node.get('part_card_id'):
                    part=db.execute('SELECT content FROM work_items WHERE id=?',(node['part_card_id'],)).fetchone()
                    if part:
                        template=json.loads(part['content'])
                        if template.get('category')!='map_part' or int(template.get('campaign_id') or 0)!=cid: raise ValueError('Choose a part card from this campaign.')
                if node.get('card_id'):
                    card=db.execute('SELECT content FROM work_items WHERE id=?',(node['card_id'],)).fetchone()
                    c=json.loads(card['content']) if card else {}
                    if int(c.get('campaign_id') or 0)!=cid or c.get('category')!=('npc' if node['type']=='shop' else node['type']): raise ValueError('Choose a matching card from this campaign.')
                if node.get('card_id'): node['money_cp']=economy.node_balance(db,node,cid)
                if any(entry['record_id'] not in valid for entry in node.get('contents',[])): raise ValueError('Object contents must be items, spells or abilities from this campaign.')
                if node.get('connected_map_id') is not None:
                    if node['connected_map_id']==mid: raise ValueError('Connect the stamp to a different map.')
                    row_for(db,cid,node['connected_map_id'])
        state=json.loads(row['state'])
        scene_changed=any(k in clean for k in ('scene','time','weather'))
        if scene_changed:
            scene={**state.get('scene',{}),**clean.get('scene',{})}
            if 'time' in clean and 'time' not in clean.get('scene',{}): scene['time']=clean['time'].capitalize()
            if 'weather' in clean and 'weather' not in clean.get('scene',{}): scene['weather']=clean['weather'].capitalize()
            clean['scene']=scene
            clean['time']='morning' if scene.get('time')=='Dawn' else scene.get('time','Day').lower()
            clean['weather']=scene.get('weather','Clear').lower() if scene.get('weather') in ('Rain','Storm') else 'clear'
        state.update(clean)
        if scene_changed:
            for other in db.execute('SELECT id,state FROM campaign_maps WHERE campaign_id=? AND id<>?',(cid,mid)).fetchall():
                previous=json.loads(other['state'])
                updated={**previous,**{k:state[k] for k in ('scene','time','weather')}}
                if updated!=previous:
                    db.execute('UPDATE campaign_maps SET state=?,revision=revision+1 WHERE id=?',(json.dumps(updated),other['id']))
        db.execute('UPDATE campaign_maps SET state=?,revision=revision+1 WHERE id=?',(json.dumps(state),mid))
    return {'revision':row['revision']+1}

def activate(user_id,cid,mid):
    access(user_id,cid,True)
    with storage.connect() as db:
        row_for(db,cid,mid)
        db.execute('INSERT OR REPLACE INTO campaign_map_selection(campaign_id,map_id) VALUES (?,?)',(cid,mid))
    return {'ok':True}


def visit(user_id,cid,mid,data):
    """Travel through a visible map connection without moving anyone else."""
    access(user_id,cid)
    current_id=listing(user_id,cid)['viewer_map_id']
    with storage.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        row_for(db,cid,mid)
        choice=db.execute('SELECT map_id FROM campaign_map_views WHERE campaign_id=? AND user_id=?',(cid,user_id)).fetchone()
        if choice: current_id=choice['map_id']
        if data.get('from_map_id')!=current_id: raise PermissionError('This map connection is no longer in your current location.')
        origin=row_for(db,cid,current_id)
        part=next((n for n in json.loads(origin['state']).get('nodes',[]) if n['id']==data.get('node_id')),None)
        if not part or part.get('hidden') or part.get('connected_map_id')!=mid:
            raise PermissionError('Use a connected map part to travel to this location.')
        actor=db.execute("SELECT content FROM work_items WHERE json_extract(content,'$.category')='character' AND CAST(json_extract(content,'$.campaign_id') AS INTEGER)=? AND CAST(json_extract(content,'$.owner_user_id') AS INTEGER)=? ORDER BY updated_at DESC LIMIT 1",(cid,user_id)).fetchone()
        require_interaction_range(db,current_id,user_id,part,json.loads(actor['content']) if actor else {},origin['kind'])
        part_opening.require_open(db,cid,current_id,user_id,part)
        destination=row_for(db,cid,mid)
        arrival=next((n for n in json.loads(destination['state']).get('nodes',[]) if n.get('type')=='exit_location' and not n.get('hidden') and n.get('arrival_from_map_id')==current_id),None)
        if arrival:
            x=(arrival['x']+arrival['w']/2-20)/40
            z=(arrival['y']+arrival['h']/2-20)/40
            db.execute("INSERT INTO campaign_map_positions(map_id,user_id,x,y,z,motion) VALUES (?,?,?,0,?,'idle') ON CONFLICT(map_id,user_id) DO UPDATE SET x=excluded.x,y=0,z=excluded.z,motion='idle'",(mid,user_id,x,z))
        db.execute('INSERT OR REPLACE INTO campaign_map_views(campaign_id,user_id,map_id) VALUES (?,?,?)',(cid,user_id,mid))
        db.execute('INSERT OR IGNORE INTO campaign_map_visits(campaign_id,user_id,map_id) VALUES (?,?,?)',(cid,user_id,mid))
    return {'ok':True,'viewer_map_id':mid}

def rename(user_id,cid,mid,data):
    access(user_id,cid,True)
    title=data.get('title')
    if not isinstance(title,str) or not 1<=len(title.strip())<=120: raise ValueError('Enter a map name of 1 to 120 characters.')
    title=title.strip()
    with storage.connect() as db:
        row_for(db,cid,mid)
        db.execute('UPDATE campaign_maps SET title=? WHERE id=?',(title,mid))
    return {'id':mid,'title':title}


def summon(user_id,cid,mid,data):
    """The DM can explicitly send a campaign member to the selected map."""
    access(user_id,cid,True)
    target=data.get('user_id')
    if type(target) is not int: raise ValueError('Select a player to move.')
    with storage.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        row_for(db,cid,mid)
        if not db.execute("SELECT 1 FROM campaign_members WHERE campaign_id=? AND user_id=? AND role='member' AND status='accepted'",(cid,target)).fetchone():
            raise PermissionError('That player is not in this campaign.')
        db.execute('INSERT OR REPLACE INTO campaign_map_views(campaign_id,user_id,map_id) VALUES (?,?,?)',(cid,target,mid))
        db.execute('INSERT OR IGNORE INTO campaign_map_visits(campaign_id,user_id,map_id) VALUES (?,?,?)',(cid,target,mid))
    return {'ok':True,'user_id':target,'viewer_map_id':mid}


def move(user_id,cid,mid,data):
    access(user_id,cid);target=int(data.get('user_id') or user_id)
    if storage.campaign_role(user_id,cid)!='creator' and target!=user_id: raise PermissionError('You can move only your own token.')
    coords={key:float(data.get(key,0)) for key in ('x','y','z')}
    if any(not math.isfinite(v) or abs(v)>100 for v in coords.values()): raise ValueError('Position is outside the map.')
    motion=data.get('motion','idle')
    if motion not in ('idle','walk','swim','climb','fall'): raise ValueError('Invalid movement.')
    with storage.connect() as db:
        row_for(db,cid,mid)
        if not db.execute("SELECT 1 FROM campaign_members WHERE campaign_id=? AND user_id=? AND role='member' AND status='accepted'",(cid,target)).fetchone(): raise PermissionError('That player is not in this campaign.')
        db.execute('INSERT INTO campaign_map_positions(map_id,user_id,x,y,z,motion) VALUES (?,?,?,?,?,?) ON CONFLICT(map_id,user_id) DO UPDATE SET x=excluded.x,y=excluded.y,z=excluded.z,motion=excluded.motion',(mid,target,coords['x'],coords['y'],coords['z'],motion))
    return {'ok':True}

def require_interaction_range(db,mid,user_id,node,character,kind):
    if kind!='2d': return
    position=db.execute('SELECT x,z FROM campaign_map_positions WHERE map_id=? AND user_id=?',(mid,user_id)).fetchone()
    x,z=(position['x'],position['z']) if position else (0,0)
    distance=max(abs(x*40+20-(node['x']+node['w']/2)),abs(z*40+20-(node['y']+node['h']/2)))/40
    reach=character.get('tabletop',{}).get('interaction_range',5)
    if type(reach) not in (int,float) or not math.isfinite(reach): reach=5
    if distance>max(0,min(50,reach))+1e-9: raise PermissionError(f'Move closer. Your interaction range is {reach:g} grid squares.')


def take_contents(user_id,cid,mid,data):
    access(user_id,cid)
    dm=storage.campaign_role(user_id,cid)=='creator'
    record_id=data.get('record_id');character_id=data.get('character_id')
    if type(record_id) is not int or type(character_id) is not int: raise ValueError('Choose an item and a character.')
    visible={r['id'] for r in storage.list_work(user_id)} if not dm else set()
    with storage.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        row=row_for(db,cid,mid);state=json.loads(row['state'])
        node=next((n for n in state.get('nodes',[]) if n['id']==data.get('node_id')),None)
        if not node or (not dm and node.get('hidden')): raise PermissionError('These contents have not been revealed to you.')
        if node['type'] in economy.PEOPLE: raise PermissionError('Use Buy or ask the DM to apply Steal for this person.')
        entry=next((e for e in node.get('contents',[]) if e['record_id']==record_id),None)
        if not entry or entry['quantity']<1: raise ValueError('That item has already been taken.')
        character=db.execute('SELECT content FROM work_items WHERE id=?',(character_id,)).fetchone()
        character=json.loads(character['content']) if character else {}
        if character.get('category') not in ('character','npc') or int(character.get('campaign_id') or 0)!=cid or (not dm and (character.get('category')!='character' or int(character.get('owner_user_id') or 0)!=user_id)): raise PermissionError('Choose a character you control in this campaign.')
        if not dm:
            require_interaction_range(db,mid,user_id,node,character,row['kind'])
            part_opening.require_open(db,cid,mid,user_id,node,character_id)
        part_opening.require_open(db,cid,mid,user_id,part_opening.theft_node(node,row['revision']),character_id)
        source=db.execute('SELECT * FROM work_items WHERE id=?',(record_id,)).fetchone()
        content=json.loads(source['content']) if source else {}
        if content.get('category') not in ('item','spell','attack') or int(content.get('campaign_id') or 0)!=cid: raise ValueError('That card is not in this campaign.')
        acquired=economy.receive_card(db,cid,source,content,character_id)
        entry['quantity']-=1
        node['contents']=[e for e in node['contents'] if e['quantity']>0]
        if not node['contents'] and not economy.node_balance(db,node,cid) and node.get('remove_after_looting') is True:
            state['nodes']=[n for n in state['nodes'] if n['id']!=node['id']]
        db.execute('UPDATE campaign_maps SET state=?,revision=revision+1 WHERE id=?',(json.dumps(state),mid))
    return {'record_id':acquired,'revision':row['revision']+1}


def meet_marker(user_id,cid,mid,data):
    access(user_id,cid)
    with storage.connect() as db:
        row=row_for(db,cid,mid)
        node=next((n for n in json.loads(row['state']).get('nodes',[]) if n['id']==data.get('node_id')),None)
        if not node or node.get('hidden') or node.get('type') not in ('npc','encounter','shop') or not node.get('card_id'): raise PermissionError('That marker is unavailable.')
        card=db.execute('SELECT content FROM work_items WHERE id=?',(node['card_id'],)).fetchone()
        content=json.loads(card['content']) if card else {}
        if int(content.get('campaign_id') or 0)!=cid or content.get('category')!=('npc' if node['type']=='shop' else node['type']): raise ValueError('The assigned card is unavailable.')
        if storage.campaign_role(user_id,cid)!='creator':
            actor=db.execute("SELECT content FROM work_items WHERE json_extract(content,'$.category')='character' AND CAST(json_extract(content,'$.campaign_id') AS INTEGER)=? AND CAST(json_extract(content,'$.owner_user_id') AS INTEGER)=? ORDER BY updated_at DESC LIMIT 1",(cid,user_id)).fetchone()
            require_interaction_range(db,mid,user_id,node,json.loads(actor['content']) if actor else {},row['kind'])
            part_opening.require_open(db,cid,mid,user_id,node)
        db.execute('INSERT OR IGNORE INTO campaign_marker_meetings(campaign_id,card_id,user_id) VALUES (?,?,?)',(cid,node['card_id'],user_id))
    return {'met':True,'card_id':node['card_id']}

