import _bootstrap  # Shared backend import path for tests and previews.
import json
import unittest
from unittest.mock import patch
import test_campaign_maps as base
import storage
import campaign_maps as maps
import part_opening as opening


class PartOpeningTests(unittest.TestCase):
    setUp = base.CampaignMapsTests.setUp
    tearDown = base.CampaignMapsTests.tearDown

    def fixture(self, **settings):
        self.hero = storage.create_work(self.dm, 'Hero', dict(category='character', campaign_id=self.c, owner_user_id=self.player))['id']
        self.key = storage.create_work(self.dm, 'Iron Key', dict(category='item', campaign_id=self.c, reference_only=True))['id']
        self.loot = storage.create_work(self.dm, 'Treasure', dict(category='item', campaign_id=self.c, reference_only=True))['id']
        self.node = dict(id='gate', type='chest', x=0, y=0, w=40, h=40, contents=[dict(record_id=self.loot, quantity=2)], **settings)
        if self.node.get('needs_item'): self.node['required_item_id'] = self.key
        maps.update(self.dm, self.c, self.first, dict(revision=0, state=dict(nodes=[self.node])))
        return dict(node_id='gate', character_id=self.hero)

    def test_item_required_and_looted_copy_accepted_without_consuming(self):
        data = self.fixture(needs_item=True)
        with self.assertRaisesRegex(PermissionError, 'Iron Key'): opening.attempt(self.player,self.c,self.first,data)
        with self.assertRaises(PermissionError): maps.take_contents(self.player,self.c,self.first,dict(data,record_id=self.loot))
        with storage.connect() as db:
            row = db.execute('SELECT * FROM work_items WHERE id=?',(self.key,)).fetchone()
            owned = maps.economy.receive_card(db,self.c,row,json.loads(row['content']),self.hero)
        self.assertTrue(opening.attempt(self.player,self.c,self.first,data)['allowed'])
        maps.take_contents(self.player,self.c,self.first,dict(data,record_id=self.loot))
        with storage.connect() as db:
            self.assertEqual(json.loads(db.execute('SELECT content FROM work_items WHERE id=?',(owned,)).fetchone()['content'])['quantity'],1)

    def test_roll_records_failure_success_and_rejects_client_total(self):
        data = self.fixture(needs_roll=True,open_die_sides=6,open_die_count=2,open_die_bonus=1,open_roll_target=10)
        self.assertTrue(opening.attempt(self.player,self.c,self.first,data)['needs_roll'])
        with patch('part_opening.secrets.randbelow',return_value=0):
            failed = opening.attempt(self.player,self.c,self.first,dict(data,roll=True,total=999))
        self.assertEqual(failed['total'],3);self.assertFalse(failed['allowed'])
        with self.assertRaises(PermissionError): maps.take_contents(self.player,self.c,self.first,dict(data,record_id=self.loot))
        with patch('part_opening.secrets.randbelow',return_value=5):
            success = opening.attempt(self.player,self.c,self.first,dict(data,roll=True))
        self.assertTrue(success['allowed']);self.assertEqual(success['total'],13)
        self.assertTrue(opening.attempt(self.player,self.c,self.first,data)['allowed'])
        with storage.connect() as db:
            self.assertEqual([tuple(r) for r in db.execute('SELECT total,passed FROM campaign_part_rolls ORDER BY id')],[(3,0),(13,1)])
        self.node['open_roll_target']=14
        maps.update(self.dm,self.c,self.first,dict(revision=1,state=dict(nodes=[self.node])))
        self.assertTrue(opening.attempt(self.player,self.c,self.first,data)['needs_roll'])

    def test_mixed_dice_rolls_and_validation(self):
        data = self.fixture(needs_roll=True,open_die_count=3,open_die_sides=20,open_dice=[20,6,8],open_roll_target=25,open_die_bonus=2)
        with patch('part_opening.secrets.randbelow',side_effect=[19,3,5]) as random:
            result = opening.attempt(self.player,self.c,self.first,dict(data,roll=True))
        self.assertEqual([call.args[0] for call in random.call_args_list],[20,6,8])
        self.assertEqual(result['total'],32)
        self.assertTrue(result['allowed'])
        for bad in [dict(open_die_count=2,open_dice=[20]),dict(open_die_count=2,open_dice=[20,7]),dict(open_dice='d20')]:
            with self.assertRaises(ValueError): opening.validate(bad)

    def test_range_owner_validation_and_both_requirements(self):
        data = self.fixture(needs_item=True,needs_roll=True)
        with self.assertRaises(PermissionError): opening.attempt(self.player,self.c,self.first,dict(data,roll=True))
        with storage.connect() as db: self.assertEqual(db.execute('SELECT count(*) FROM campaign_part_rolls').fetchone()[0],0)
        other = storage.create_work(self.dm,'Other hero',dict(category='character',campaign_id=self.c,owner_user_id=self.outsider))['id']
        with self.assertRaises(PermissionError): opening.attempt(self.player,self.c,self.first,dict(data,character_id=other))
        maps.move(self.player,self.c,self.first,dict(x=50,z=50))
        with self.assertRaisesRegex(PermissionError,'Move closer'): opening.attempt(self.player,self.c,self.first,data)
        for bad in [dict(needs_roll='yes'),dict(open_die_sides=7),dict(open_die_count=0),dict(open_roll_target=1.5),dict(needs_item=True)]:
            with self.assertRaises(ValueError): opening.validate(bad)

if __name__ == '__main__': unittest.main()
