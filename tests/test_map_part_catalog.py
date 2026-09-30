import _bootstrap  # Shared backend import path for tests and previews.
import json
import unittest
import test_campaign_maps as base
import storage
import campaign_maps as maps
from map_part_catalog import PARTS, validate


class MapPartCatalogTests(unittest.TestCase):
    setUp = base.CampaignMapsTests.setUp
    tearDown = base.CampaignMapsTests.tearDown

    def cards(self):
        return [r for r in storage.list_work(self.dm) if r['content'].get('category') == 'map_part']

    def test_complete_unique_catalog_and_persistent_edits(self):
        cards = self.cards()
        self.assertEqual({r['content']['part_type'] for r in cards}, {p['type'] for p in PARTS})
        self.assertEqual(len(cards), len(PARTS))
        card = cards[0]
        content = dict(card['content'], notes='Keep my settings', light_enabled=True, light_radius=321)
        storage.update_work(self.dm, card['id'], 'My terrain', content)
        storage.initialize()
        saved = next(r for r in self.cards() if r['id'] == card['id'])
        self.assertEqual(saved['title'], 'My terrain')
        self.assertEqual(saved['content']['light_radius'], 321)
        self.assertEqual(len(self.cards()), len(PARTS))

    def test_deleted_defaults_stay_deleted(self):
        card = self.cards()[0]
        storage.delete_work(self.dm, card['id'])
        storage.initialize()
        self.assertEqual(len(self.cards()), len(PARTS)-1)

    def test_all_location_stamps_save_and_reload(self):
        locations = {p['type'] for p in PARTS if p['group'] == 'locations'}
        self.assertEqual(set(maps.LOCATION_TYPES), locations)
        self.assertGreaterEqual(len(locations), 48)
        for kind in ('marker_cottage', 'marker_tavern', 'marker_blacksmith', 'marker_windmill', 'marker_dragon_lair'):
            self.assertIn(kind, locations)
        nodes = [dict(id=kind, type=kind, x=i*80, y=0, w=80, h=80) for i, kind in enumerate(sorted(locations))]
        maps.update(self.dm, self.c, self.first, {'revision':0, 'state':{'nodes':nodes}})
        self.assertEqual({n['type'] for n in maps.get(self.dm, self.c, self.first)['state']['nodes']}, locations)

    def test_settlement_parts_save_and_reload(self):
        parts = {p['type'] for p in PARTS if p['group'] == 'settlement'}
        self.assertGreaterEqual(len(parts), 73)
        self.assertEqual(set(maps.SETTLEMENT_TYPES), parts)
        for kind in ('thatched_house', 'row_houses', 'bakery_building', 'windmill_building', 'vegetable_patch', 'notice_board', 'empty_tilled_plot', 'empty_fenced_plot', 'crop_cabbage', 'crop_wheat'):
            self.assertIn(kind, parts)
        nodes = [dict(id=kind, type=kind, x=i*80, y=0, w=160, h=160) for i, kind in enumerate(sorted(parts))]
        maps.update(self.dm, self.c, self.first, {'revision':0, 'state':{'nodes':nodes}})
        self.assertEqual({n['type'] for n in maps.get(self.dm, self.c, self.first)['state']['nodes']}, parts)

    def test_custom_light_snapshot_survives_reload_and_card_deletion(self):
        c = dict(category='map_part', campaign_id=self.c, part_group='props', part_type='prop_mug', light_enabled=True)
        # Use a supported appearance from this catalog without relying on its label.
        c['part_type'] = next(p['type'] for p in PARTS if p['group']=='props')
        card = storage.create_work(self.dm, 'Glowing cup', c)
        node = dict(id='custom', type=c['part_type'], x=0,y=0,w=60,h=80,part_card_id=card['id'],light_enabled=True,light_color='#44aaff',light_radius=320)
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':[node]}})
        storage.delete_work(self.dm,card['id'])
        saved=maps.get(self.dm,self.c,self.first)['state']['nodes'][0]
        self.assertEqual(saved['light_radius'],320)
        self.assertTrue(saved['light_enabled'])
        maps.update(self.dm,self.c,self.first,{'revision':1,'state':{'nodes':[saved]}})

    def test_invalid_templates_and_light_flags_are_rejected(self):
        base=dict(category='map_part',part_group='props',part_type=PARTS[0]['type'])
        for change in ({'part_type':'invented'}, {'part_group':'invented'}, {'light_enabled':'true'}, {'light_radius':float('nan')}, {'light_color':'url(evil)'}, {'part_width':0}):
            with self.assertRaises(ValueError): validate(dict(base,**change))
        with self.assertRaises(ValueError):
            maps.clean_patch({'nodes':[dict(id='bad',type='table',x=0,y=0,w=40,h=40,light_enabled='true')]})

    def test_players_can_see_placed_art_without_private_card(self):
        image=storage.save_upload(self.dm,b'not decoded in this access test','.png','image/png')
        node=dict(id='art',type='table',x=0,y=0,w=40,h=40,part_image_id=image)
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':[node]}})
        self.assertIsNotNone(storage.get_visible_upload(self.player,image))
        self.assertIsNone(storage.get_visible_upload(self.outsider,image))
        maps.update(self.dm,self.c,self.first,{'revision':1,'state':{'nodes':[dict(node,hidden=True)]}})
        self.assertIsNone(storage.get_visible_upload(self.player,image))


if __name__ == '__main__': unittest.main()
