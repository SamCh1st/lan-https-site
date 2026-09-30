"""Translate official prices through gold, keeping the site's custom denominations."""
import json
import re
from decimal import Decimal

RATES={'cp':100,'sp':1000,'ep':5000,'gp':10000,'pp':100000}

def convert(price):
    match=re.fullmatch(r'\s*([\d,]+(?:\.\d+)?)\s*(cp|sp|ep|gp|pp)\s*',str(price),re.I)
    return int(Decimal(match[1].replace(',',''))*RATES[match[2].lower()]) if match else None

def display(cp):
    unit,rate=('gp',10000) if cp>=10000 else ('sp',100) if cp>=100 else ('cp',1)
    return f'{Decimal(cp)/rate:g} {unit}'

def apply(content):
    if content.get('category')!='item': return
    table=content['tabletop'];original=table.get('value');converted=convert(original)
    if converted is None: return
    table.update(source_price=original,value=display(converted),value_cp=converted,price_economy_version=1)
    content['summary']=content['summary'].replace(str(original),table['value'])

def upgrade(db,references):
    db.execute('CREATE TABLE IF NOT EXISTS site_data_updates(name TEXT PRIMARY KEY)')
    if db.execute("SELECT 1 FROM site_data_updates WHERE name='official-prices-site-economy-v1'").fetchone(): return
    templates={r['title']:r['content'] for r in references if r['content']['category']=='item' and r['content']['tabletop'].get('source_price')}
    updates={}
    for row in db.execute("SELECT id,title,content FROM work_items WHERE json_extract(content,'$.category')='item'").fetchall():
        content=json.loads(row['content']);template=templates.get(row['title']);table=content.get('tabletop') or {}
        if not template or content.get('source_name')!=template['source_name'] or table.get('price_economy_version'): continue
        source=template['tabletop']['source_price']
        if table.get('value')!=source: continue
        import economy
        legacy=economy.value_cp({'tabletop':{'value':source}})
        if table.get('value_cp',legacy)!=legacy: continue
        old_summary=template['summary'].replace(template['tabletop']['value'],source)
        if content.get('summary')==old_summary: content['summary']=template['summary']
        table.update({k:template['tabletop'][k] for k in ('source_price','value','value_cp','price_economy_version')});content['tabletop']=table
        db.execute('UPDATE work_items SET content=? WHERE id=?',(json.dumps(content),row['id']))
        updates[row['id']]=(legacy,table['value_cp'])
    for row in db.execute('SELECT id,state FROM campaign_maps').fetchall():
        state=json.loads(row['state']);changed=False
        for node in state.get('nodes',[]):
            for entry in node.get('contents',[]):
                price=updates.get(entry.get('record_id'))
                if price and entry.get('price_cp')==price[0]: entry['price_cp']=price[1];changed=True
        if changed: db.execute('UPDATE campaign_maps SET state=?,revision=revision+1 WHERE id=?',(json.dumps(state),row['id']))
    db.execute("INSERT INTO site_data_updates VALUES ('official-prices-site-economy-v1')")
