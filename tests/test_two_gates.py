import _bootstrap  # Shared backend import path for tests and previews.
import unittest
from unittest.mock import patch
import test_part_opening as base
import storage,part_opening as opening,campaign_maps as maps

class TwoGateTests(unittest.TestCase):
    setUp=base.PartOpeningTests.setUp
    tearDown=base.PartOpeningTests.tearDown
    fixture=base.PartOpeningTests.fixture

    def test_advantage_and_disadvantage_are_server_rolled(self):
        data=self.fixture(needs_roll=True,open_roll_target=10)
        with patch('part_opening.secrets.randbelow',side_effect=[19,0]):
            low=opening.attempt(self.player,self.c,self.first,{**data,'roll':True,'mode':'disadvantage'})
        self.assertEqual(low['total'],1);self.assertFalse(low['allowed'])
        with patch('part_opening.secrets.randbelow',side_effect=[0,19]):
            high=opening.attempt(self.player,self.c,self.first,{**data,'roll':True,'mode':'advantage'})
        self.assertEqual(high['total'],20);self.assertTrue(high['allowed']);self.assertIn('[1, 20]',high['breakdown'])

    def test_opening_and_taking_are_separate_and_enforced(self):
        data=self.fixture(needs_roll=True,open_roll_target=10,steal_needs_roll=True,steal_open_roll_target=15)
        take={**data,'record_id':self.loot}
        with self.assertRaises(PermissionError):opening.attempt(self.player,self.c,self.first,{**data,'purpose':'take','roll':True})
        with patch('part_opening.secrets.randbelow',return_value=19):self.assertTrue(opening.attempt(self.player,self.c,self.first,{**data,'roll':True})['allowed'])
        with self.assertRaises(PermissionError):maps.take_contents(self.player,self.c,self.first,take)
        with patch('part_opening.secrets.randbelow',return_value=0):self.assertFalse(opening.attempt(self.player,self.c,self.first,{**data,'purpose':'take','roll':True})['allowed'])
        with self.assertRaises(PermissionError):maps.take_contents(self.player,self.c,self.first,take)
        with patch('part_opening.secrets.randbelow',return_value=19):self.assertTrue(opening.attempt(self.player,self.c,self.first,{**data,'purpose':'take','roll':True})['allowed'])
        maps.take_contents(self.player,self.c,self.first,take)
        self.assertTrue(opening.attempt(self.player,self.c,self.first,data)['allowed'])
        self.assertTrue(opening.attempt(self.player,self.c,self.first,{**data,'purpose':'take'})['needs_roll'])

    def test_two_distinct_keys(self):
        data=self.fixture(needs_item=True)
        second=storage.create_work(self.dm,'Loot permit',{'category':'item','campaign_id':self.c,'reference_only':True})
        current=maps.get(self.dm,self.c,self.first);current['state']['nodes'][0].update(steal_needs_item=True,steal_required_item_id=second['id'])
        maps.update(self.dm,self.c,self.first,{'revision':current['revision'],'state':current['state']})
        with self.assertRaises(PermissionError):opening.attempt(self.player,self.c,self.first,data)
        storage.create_work(self.dm,'Iron Key',{'category':'item','campaign_id':self.c,'owner_ids':[self.hero],'loot_source_record_id':self.key,'quantity':1})
        self.assertTrue(opening.attempt(self.player,self.c,self.first,data)['allowed'])
        with self.assertRaises(PermissionError):opening.attempt(self.player,self.c,self.first,{**data,'purpose':'take'})
        storage.create_work(self.dm,'Loot permit',{**second['content'],'reference_only':False,'owner_ids':[self.hero],'quantity':1})
        self.assertTrue(opening.attempt(self.player,self.c,self.first,{**data,'purpose':'take'})['allowed'])
