import _bootstrap  # Shared backend import path for tests and previews.
import unittest
from unittest.mock import patch
import test_economy as base
import storage,economy,part_opening,campaign_maps as maps

class StealingTests(unittest.TestCase):
    setUp=base.EconomyTests.setUp
    tearDown=base.EconomyTests.tearDown
    setup_trade=base.EconomyTests.setup_trade
    content=base.EconomyTests.content
    transact=base.EconomyTests.transact

    def test_quantity_and_atomic_limits(self):
        self.setup_trade()
        before=maps.get(self.player,self.c,self.first)
        for quantity in (0,3,-1,1.5,True):
            with self.assertRaises(ValueError):self.transact('steal',quantity=quantity)
            self.assertEqual(maps.get(self.player,self.c,self.first),before)
        self.transact('steal',quantity=2)
        held=[r for r in storage.list_work(self.player) if r['content'].get('owner_ids')==[self.hero]]
        self.assertEqual(len(held),1);self.assertEqual(held[0]['content']['quantity'],2)
        self.assertEqual(economy.balance(self.content(self.hero)),2000)

    def test_item_then_roll_and_one_theft_per_success(self):
        self.setup_trade()
        key=storage.create_work(self.dm,'Key',{'category':'item','campaign_id':self.c,'reference_only':True})
        current=maps.get(self.dm,self.c,self.first);n=current['state']['nodes'][0]
        n.update(steal_needs_item=True,steal_required_item_id=key['id'],steal_needs_roll=True,steal_open_roll_target=10)
        maps.update(self.dm,self.c,self.first,{'revision':current['revision'],'state':current['state']})
        data={'node_id':'shop','character_id':self.hero,'purpose':'steal'}
        with patch('part_opening.secrets.randbelow') as roll:
            with self.assertRaises(PermissionError):part_opening.attempt(self.player,self.c,self.first,{**data,'roll':True})
            roll.assert_not_called()
        with self.assertRaises(PermissionError):self.transact('steal')
        held=storage.create_work(self.dm,'Key',{**key['content'],'reference_only':False,'owner_ids':[self.hero],'quantity':1})
        self.assertTrue(part_opening.attempt(self.player,self.c,self.first,data)['needs_roll'])
        with patch('part_opening.secrets.randbelow',return_value=0):self.assertFalse(part_opening.attempt(self.player,self.c,self.first,{**data,'roll':True})['allowed'])
        with self.assertRaises(PermissionError):self.transact('steal')
        with patch('part_opening.secrets.randbelow',return_value=19):self.assertTrue(part_opening.attempt(self.player,self.c,self.first,{**data,'roll':True})['allowed'])
        self.transact('steal')
        with self.assertRaises(PermissionError):self.transact('steal')
        self.assertEqual(self.content(held['id'])['quantity'],1)

