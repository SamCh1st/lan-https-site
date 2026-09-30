import _bootstrap  # Shared backend import path for tests and previews.
import unittest
import test_campaign_maps as base
import storage,campaign_maps as maps

class ExitLocationTests(unittest.TestCase):
    setUp=base.CampaignMapsTests.setUp
    tearDown=base.CampaignMapsTests.tearDown
    def setup_route(self):
        self.destination=maps.create(self.dm,self.c,{'title':'Destination'})['id']
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':[dict(id='door',type='portal',x=40,y=0,w=40,h=40,connected_map_id=self.destination)]}})
        return dict(id='arrival',type='exit_location',x=400,y=800,w=40,h=40,arrival_from_map_id=self.first)

    def test_arrival_overrides_old_position_and_only_moves_traveler(self):
        arrival=self.setup_route()
        maps.update(self.dm,self.c,self.destination,{'revision':0,'state':{'nodes':[arrival]}})
        maps.move(self.dm,self.c,self.destination,{'user_id':self.player,'x':77,'z':66})
        maps.visit(self.player,self.c,self.destination,{'from_map_id':self.first,'node_id':'door'})
        result=maps.get(self.player,self.c,self.destination)
        player=next(p for p in result['players'] if p['id']==self.player)
        self.assertEqual((player['x'],player['z']),(10,20));self.assertTrue(player['present'])
        prior=maps.get(self.dm,self.c,self.first)
        self.assertFalse(next(p for p in prior['players'] if p['id']==self.player)['present'])
        self.assertEqual(maps.get(self.player,self.c,self.destination)['players'],result['players'])

    def test_hidden_or_unmatched_marker_does_not_reposition(self):
        arrival=self.setup_route();arrival['hidden']=True
        maps.update(self.dm,self.c,self.destination,{'revision':0,'state':{'nodes':[arrival]}})
        maps.move(self.dm,self.c,self.destination,{'user_id':self.player,'x':7,'z':6})
        maps.visit(self.player,self.c,self.destination,{'from_map_id':self.first,'node_id':'door'})
        p=next(p for p in maps.get(self.player,self.c,self.destination)['players'] if p['id']==self.player)
        self.assertEqual((p['x'],p['z']),(7,6))

    def test_invalid_and_duplicate_sources_rejected(self):
        arrival=self.setup_route()
        for nodes in [[{**arrival,'arrival_from_map_id':self.destination}],[{**arrival,'arrival_from_map_id':999999}],[arrival,{**arrival,'id':'duplicate'}],[{**arrival,'x':9000}]]:
            with self.assertRaises(ValueError):maps.update(self.dm,self.c,self.destination,{'revision':0,'state':{'nodes':nodes}})
        cards=[r for r in storage.list_work(self.dm) if r['content'].get('part_type')=='exit_location']
        self.assertTrue(cards)
