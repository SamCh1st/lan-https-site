"""Editable mundane goods, installed once without replacing user edits or stock."""
import copy
import json
from pathlib import Path

ITEMS=json.loads((Path(__file__).parent.parent/'site/assets/map-art/business-items.json').read_text(encoding='utf-8'))

def install(db,campaign_id=None,owner_id=None):
    db.execute('''CREATE TABLE IF NOT EXISTS business_catalog_seeds(
        campaign_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
        asset_id TEXT NOT NULL,PRIMARY KEY(campaign_id,asset_id))''')
    campaigns=[(campaign_id,owner_id)] if campaign_id else [(r['id'],r['user_id']) for r in db.execute(
        "SELECT id,user_id FROM work_items WHERE json_extract(content,'$.category')='campaign'")]
    for cid,uid in campaigns:
        installed={r[0] for r in db.execute('SELECT asset_id FROM business_catalog_seeds WHERE campaign_id=?',(cid,))}
        for item in ITEMS:
            if item['id'] in installed:continue
            content=copy.deepcopy(item['content']);content['campaign_id']=cid
            db.execute('INSERT INTO work_items(user_id,title,content) VALUES (?,?,?)',
                (uid,item['title'],json.dumps(content,ensure_ascii=False,separators=(',',':'))))
            db.execute('INSERT INTO business_catalog_seeds VALUES (?,?)',(cid,item['id']))
