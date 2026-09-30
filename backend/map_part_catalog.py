"""Persistent, editable archive templates for the complete 2D palette."""
import json
import math
import re
import part_opening
from pathlib import Path

PARTS = json.loads((Path(__file__).parent.parent / 'site/assets/map-art/parts-catalog.json').read_text(encoding='utf-8'))
TYPES = {p['type'] for p in PARTS}
GROUPS = {p['group'] for p in PARTS} | {'lighting'}
NUMBERS = {'part_width': (1, 10000, 80), 'part_height': (1, 10000, 80),
           'height_scale': (0, 4, 1), 'light_radius': (10, 5000, 200),
           'light_intensity': (0, 1, 1), 'light_softness': (0, 1, .45),
           'shadow_length': (0, 8, 1.5), 'shadow_strength': (0, 1, 1),
           'fire_wave': (0, 1, .35), 'fire_flicker': (0, 1, .35)}


def validate(content):
    if content.get('category') != 'map_part':
        return
    if not isinstance(content.get('part_type'), str) or not isinstance(content.get('part_group'), str) or content['part_type'] not in TYPES or content['part_group'] not in GROUPS:
        raise ValueError('Choose a valid map part type and appearance.')
    part_opening.validate(content)
    if content.get('needs_item'):
        import storage
        with storage.connect() as db:
            part_opening.required_item(db,int(content.get('campaign_id') or 0),content)
    if content.get('steal_needs_item'):
        import storage
        with storage.connect() as db:
            part_opening.required_item(db,int(content.get('campaign_id') or 0),part_opening.theft_node(content))
    for key, (low, high, default) in NUMBERS.items():
        value = content.setdefault(key, default)
        if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
            raise ValueError('Invalid part setting: ' + key.replace('_', ' ') + '.')
    if type(content.setdefault('walk_over', True)) is not bool:
        raise ValueError('Invalid walk over setting.')
    for key in ('light_enabled', 'fire_light'):
        if type(content.setdefault(key, False)) is not bool:
            raise ValueError('Invalid part lighting checkbox.')
    color = content.setdefault('light_color', '#ffd58a')
    if not isinstance(color, str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', color):
        raise ValueError('Choose a valid light color.')
    if content.get('image_id') is not None and (type(content['image_id']) is not int or content['image_id'] < 1):
        raise ValueError('Choose a valid part image.')


def install(db, campaign_id=None, owner_id=None):
    # Move legacy business categories without replacing edited card content.
    categories = {p['type']: p['group'] for p in PARTS if p.get('catalog_pack') == 'business-2026-09'}
    for row in db.execute("SELECT id,content FROM work_items WHERE json_extract(content,'$.category')='map_part'").fetchall():
        content = json.loads(row['content'])
        target = categories.get(content.get('part_type'))
        if target and str(content.get('part_group', '')).startswith('business_') and (campaign_id is None or content.get('campaign_id') == campaign_id):
            content['part_group'] = target
            db.execute('UPDATE work_items SET content=? WHERE id=?', (json.dumps(content, ensure_ascii=False), row['id']))
    # Track installation separately: deleting or renaming a card stays permanent.
    db.execute('CREATE TABLE IF NOT EXISTS map_part_seeds (campaign_id INTEGER NOT NULL, part_type TEXT NOT NULL, PRIMARY KEY(campaign_id, part_type))')
    campaigns = [(campaign_id, owner_id)] if campaign_id else [
        (r['id'], r['user_id']) for r in db.execute("SELECT id,user_id FROM work_items WHERE json_extract(content,'$.category')='campaign'")]
    for cid, uid in campaigns:
        installed = {r[0] for r in db.execute('SELECT part_type FROM map_part_seeds WHERE campaign_id=?', (cid,))}
        for part in PARTS:
            if part['type'] in installed:
                continue
            content = {k: v for k, v in part.items() if k not in ('type', 'group', 'title')}
            content.update(category='map_part', campaign_id=cid, part_type=part['type'],
                           part_group=part['group'], builtin_part=part['type'],
                           summary=part.get('summary', 'Reusable ' + part['group'].replace('_', ' ') + ' part.'),
                           part_width=part.get('part_width',400 if part['type'] == 'point_light' else 80),
                           part_height=part.get('part_height',400 if part['type'] == 'point_light' else 80))
            validate(content)
            db.execute('INSERT INTO work_items(user_id,title,content) VALUES (?,?,?)',
                       (uid, part['title'], json.dumps(content, separators=(',', ':'))))
            db.execute('INSERT INTO map_part_seeds VALUES (?,?)', (cid, part['type']))
