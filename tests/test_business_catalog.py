import _bootstrap  # Shared backend import path for tests and previews.
import json
import unittest
from pathlib import Path
import test_campaign_maps
import storage
import business_catalog
import campaign_maps as maps
import map_part_catalog

class BusinessCatalogTests(unittest.TestCase):
    setUp=test_campaign_maps.CampaignMapsTests.setUp
    tearDown=test_campaign_maps.CampaignMapsTests.tearDown

    def goods(self):
        return [r for r in storage.list_work(self.dm) if r['content'].get('campaign_id')==self.c and r['content'].get('catalog_asset_id')]

    def test_new_items_have_prices_descriptions_and_private_permissions(self):
        goods=self.goods();self.assertEqual(len(goods),112)
        for item in goods:
            c=item['content'];self.assertGreater(c['tabletop']['value_cp'],0)
            self.assertTrue(c['reference_only']);self.assertFalse(c['player_visible'])
            self.assertGreater(len(c['summary']),15);self.assertGreater(len(c['notes']),80)
        player=storage.list_work(self.player)
        self.assertFalse(any(r['content'].get('catalog_asset_id') for r in player))
        self.assertEqual(len([r for r in player if r['content'].get('catalog_pack')=='business-2026-09']),240)

    def test_existing_campaign_upgrade_and_repeat_preserves_edits_and_deletions(self):
        with storage.connect() as db:
            db.execute("DELETE FROM work_items WHERE json_extract(content,'$.catalog_asset_id') IS NOT NULL")
            db.execute('DELETE FROM business_catalog_seeds')
        storage.initialize();self.assertEqual(len(self.goods()),112)
        first,second=self.goods()[:2]
        storage.update_work(self.dm,first['id'],'Custom store label',first['content'])
        storage.delete_work(self.dm,second['id'])
        storage.initialize();goods=self.goods()
        self.assertEqual(len(goods),111)
        self.assertTrue(any(r['id']==first['id'] and r['title']=='Custom store label' for r in goods))
        self.assertFalse(any(r['id']==second['id'] for r in goods))

    def test_all_new_parts_survive_map_save_and_reload(self):
        parts=[p for p in map_part_catalog.PARTS if p.get('catalog_pack')=='business-2026-09']
        self.assertEqual(len(parts),240)
        nodes=[{'id':p['type'],'type':p['type'],'x':0,'y':0,'w':p['part_width'],'h':p['part_height']} for p in parts]
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':nodes}})
        saved=maps.get(self.dm,self.c,self.first)['state']['nodes']
        self.assertEqual({n['type'] for n in saved},{p['type'] for p in parts})

    def test_custom_campaign_also_gets_mundane_goods(self):
        campaign=storage.create_work(self.dm,'Custom shop',{'category':'campaign','tabletop':{'ruleset':'custom'}})
        found=[r for r in storage.list_work(self.dm) if r['content'].get('campaign_id')==campaign['id'] and r['content'].get('catalog_asset_id')]
        self.assertEqual(len(found),112)

class CatalogAssetTests(unittest.TestCase):
    def test_manifest_coordinates_and_business_coverage(self):
        folder=Path(map_part_catalog.__file__).parent.parent/'site/assets/map-art'
        entries=json.loads((folder/'business-manifest.json').read_text(encoding='utf-8'))
        bounds=json.loads((folder/'business-bounds.json').read_text(encoding='utf-8'))
        self.assertEqual(len(entries),240);self.assertEqual(len(bounds),15)
        self.assertEqual(len({e['id'] for e in entries}),240)
        for group,atlas in bounds.items():
            self.assertEqual(len(atlas['rects']),16)
            self.assertEqual(sum(e['atlas']==group for e in entries),16)
            for x,y,w,h in atlas['rects']:
                self.assertGreater(w,0);self.assertGreater(h,0)
                self.assertGreaterEqual(x,0);self.assertGreaterEqual(y,0)
                self.assertLessEqual(x+w,atlas['width']);self.assertLessEqual(y+h,atlas['height'])
        for entry in entries:self.assertTrue((folder/'items'/(entry['id']+'.png')).is_file())

if __name__=='__main__':unittest.main()
