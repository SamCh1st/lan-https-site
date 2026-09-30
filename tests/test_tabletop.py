import _bootstrap  # Shared backend import path for tests and previews.
import gc
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import storage
from campaign_defaults import starter_records
from server import normalize_character_stats

class TabletopTests(unittest.TestCase):
    def test_character_limits_and_zero_hp(self):
        content = {'category':'character','character_level':5,'hp_current':0,'hp_max':22,'dexterity':8,'tabletop':{'slot_1_max':2,'slot_1_remaining':9,'hit_dice_spent':9}}
        normalize_character_stats(content)
        self.assertEqual(content['hp_current'],0)
        self.assertEqual(content['proficiency_bonus'],3)
        self.assertEqual(content['tabletop']['slot_1_remaining'],2)
        self.assertEqual(content['tabletop']['hit_dice_spent'],5)
        content['hp_current']=200
        normalize_character_stats(content)
        self.assertEqual(content['hp_current'],22)

    def test_encounter_validation(self):
        content={'category':'encounter','tabletop':{'combatants':[{'id':'a','name':'Guard','hp':-3,'initiative':12},{'id':'a'},None], 'active_turn':'missing'}}
        normalize_character_stats(content)
        self.assertEqual(len(content['tabletop']['combatants']),1)
        self.assertEqual(content['tabletop']['combatants'][0]['hp'],0)
        self.assertEqual(content['tabletop']['active_turn'],'a')
        content['tabletop']['active_turn'] = []
        normalize_character_stats(content)
        self.assertEqual(content['tabletop']['active_turn'],'a')

    def test_library_isolated_and_transactional(self):
        old_db,old_uploads=storage.DB_PATH,storage.UPLOAD_DIR
        with tempfile.TemporaryDirectory() as folder:
            try:
                storage.DB_PATH=Path(folder)/'test.db'
                storage.UPLOAD_DIR=Path(folder)/'uploads'
                storage.initialize()
                user=storage.create_user('Tester',None,'Test password 12345')
                campaign=storage.create_work(user,'Test',{'category':'campaign','tabletop':{'ruleset':'2024'}})
                records=storage.list_work(user)
                refs=[r for r in records if r['content'].get('reference_only')]
                self.assertEqual(len(refs),122)
                self.assertEqual(Counter(r['content']['category'] for r in refs),{'item':77,'spell':19,'attack':13,'lore':13})
                self.assertTrue(all(r['content']['campaign_id']==campaign['id'] for r in refs))
                self.assertTrue(all(not r['content']['owner_ids'] and not r['content']['user_ids'] for r in refs))
                storage.update_work(user,campaign['id'],'Renamed',campaign['content'])
                self.assertEqual(len(storage.list_work(user)),123)
                storage.create_work(user,'Legacy',{'category':'campaign','tabletop':{'ruleset':'2014'}})
                self.assertEqual(len(storage.list_work(user)),124)
                another=storage.create_work(user,'Second',{'category':'campaign'})
                second=[r for r in storage.list_work(user) if r['content'].get('campaign_id')==another['id']]
                self.assertEqual(len(second),122)
                # An interrupted seed rolls back the campaign and membership, too.
                original=storage.starter_records
                def broken():
                    yield starter_records()[0]
                    raise RuntimeError('simulated seed failure')
                storage.starter_records=broken
                try:
                    with self.assertRaises(RuntimeError):storage.create_work(user,'Broken',{'category':'campaign'})
                    self.assertFalse(any(r['title']=='Broken' for r in storage.list_work(user)))
                finally:storage.starter_records=original
            finally:
                storage.DB_PATH,storage.UPLOAD_DIR=old_db,old_uploads
                gc.collect()

    def test_fractional_item_weight_and_charges(self):
        c={'category':'item','tabletop':{'weight':0.25,'charges_max':3,'charges_remaining':7}}
        normalize_character_stats(c)
        self.assertEqual(c['tabletop']['weight'],0.25)
        self.assertEqual(c['tabletop']['charges_remaining'],3)

if __name__=='__main__':unittest.main()
