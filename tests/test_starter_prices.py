import _bootstrap  # Shared backend import path for tests and previews.
import json
import unittest
import storage
import campaign_maps as maps
import test_campaign_maps
from campaign_defaults import starter_records
import starter_prices

class StarterPriceTests(unittest.TestCase):
    setUp=test_campaign_maps.CampaignMapsTests.setUp
    tearDown=test_campaign_maps.CampaignMapsTests.tearDown
    def test_conversion_and_existing_custom_prices(self):
        self.assertEqual(starter_prices.convert('1 cp'),100)
        self.assertEqual(starter_prices.convert('1 sp'),1000)
        self.assertEqual(starter_prices.convert('1 gp'),10000)
        refs={r['title']:r for r in starter_records() if r['content']['category']=='item'}
        self.assertEqual(refs['Club']['content']['tabletop']['value_cp'],1000)
        self.assertEqual(refs['Club']['content']['tabletop']['value'],'10 sp')
        self.assertEqual(refs['Dagger']['content']['tabletop']['value_cp'],20000)
        cards={r['title']:r for r in storage.list_work(self.dm) if r['content'].get('category')=='item'}
        club=cards['Club'];content=club['content'];content['tabletop'].update(value='1 sp',value_cp=100);content['tabletop'].pop('price_economy_version');content['tabletop'].pop('source_price')
        custom=cards['Sickle'];cc=custom['content'];cc['tabletop'].update(value='1 gp',value_cp=777);cc['tabletop'].pop('price_economy_version');cc['tabletop'].pop('source_price')
        with storage.connect() as db:
            db.execute('UPDATE work_items SET content=? WHERE id=?',(json.dumps(content),club['id']))
            db.execute('UPDATE work_items SET content=? WHERE id=?',(json.dumps(cc),custom['id']))
            db.execute("DELETE FROM site_data_updates WHERE name='official-prices-site-economy-v1'")
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':[{'id':'shop','type':'shop','x':0,'y':0,'w':40,'h':40,'contents':[{'record_id':club['id'],'quantity':2,'price_cp':100},{'record_id':custom['id'],'quantity':1,'price_cp':555}]}]}})
        storage.initialize()
        cards={r['id']:r for r in storage.list_work(self.dm)}
        self.assertEqual(cards[club['id']]['content']['tabletop']['value_cp'],1000)
        self.assertEqual(cards[custom['id']]['content']['tabletop']['value_cp'],777)
        stock=maps.get(self.dm,self.c,self.first)['state']['nodes'][0]['contents']
        self.assertEqual([e['price_cp'] for e in stock],[1000,555])
        storage.initialize()
        self.assertEqual(maps.get(self.dm,self.c,self.first)['state']['nodes'][0]['contents'],stock)

if __name__=='__main__':unittest.main()
