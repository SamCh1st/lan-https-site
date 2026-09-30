import _bootstrap  # Shared backend import path for tests and previews.
import copy
import json
import unittest
import test_campaign_maps
import storage
import equipment


class EquipmentTests(unittest.TestCase):
    setUp = test_campaign_maps.CampaignMapsTests.setUp
    tearDown = test_campaign_maps.CampaignMapsTests.tearDown

    def hero(self, cls='Fighter', strength=10, **table):
        self.h = storage.create_work(self.dm, 'Hero', {'category':'character','campaign_id':self.c,'owner_user_id':self.player,
            'character_class':cls,'character_level':1,'strength':strength,'dexterity':14,'constitution':14,'wisdom':14,'tabletop':table})['id']

    def item(self, title, **table):
        return storage.create_work(self.dm,title,{'category':'item','campaign_id':self.c,'owner_ids':[self.h],
            'quantity':1,'rarity':'Nonmagical','tabletop':table})['id']

    def act(self, action='inspect', item=None, **data):
        return equipment.request(self.player,self.c,dict(character_id=self.h,action=action,item_id=item,**data))

    def content(self, ident):
        with storage.connect() as db:
            return json.loads(db.execute('SELECT content FROM work_items WHERE id=?',(ident,)).fetchone()[0])

    def test_hands_conflict_and_persisted_unequip(self):
        self.hero(strength=16); great=self.item('Greatsword'); shield=self.item('Shield')
        self.act('equip',great,slot='both_hands')
        with self.assertRaisesRegex(ValueError,'Unequip'):
            self.act('equip',shield,slot='off_hand')
        self.assertEqual(self.act()['loadout'],{'both_hands':great})
        self.act('unequip',great)
        state=self.act('equip',shield,slot='off_hand')
        self.assertEqual(state['ac'],14)
        self.assertEqual(self.content(self.h)['tabletop']['equipment_loadout'],{'off_hand':shield})

    def test_armor_penalties_are_not_illegal_class_lock(self):
        self.hero('Wizard',8); plate=self.item('Plate')
        state=self.act(); row=state['items'][0]
        self.assertTrue(row['options'][0]['allowed'])
        self.assertIn('cannot cast', ' '.join(row['warnings']))
        with self.assertRaisesRegex(ValueError,'penalties'): self.act('equip',plate,slot='body')
        state=self.act('equip',plate,slot='body',accept_penalties=True)
        self.assertEqual(state['ac'],18);self.assertEqual(state['speed_penalty'],10)
        self.assertFalse(state['can_cast_in_armor'])
        self.act('unequip',plate)
        self.assertTrue(self.act()['can_cast_in_armor'])

    def test_training_and_negative_dexterity(self):
        self.hero('Druid',equipment_order='warden'); armor=self.item('Breastplate')
        c=self.content(self.h);c['dexterity']=8;storage.update_work(self.dm,self.h,'Hero',c)
        self.assertEqual(self.act('equip',armor,slot='body')['ac'],13)

    def test_weight_quantity_and_missing_weight(self):
        self.hero(strength=1); item=self.item('Rope',weight=5)
        c=self.content(item);c['quantity']=4;storage.update_work(self.dm,item,'Rope',c)
        state=self.act();self.assertEqual(state['weight'],20);self.assertTrue(state['over_capacity'])
        self.item('Unknown artifact')
        self.assertTrue(any('weights' in n for n in self.act()['notices']))

    def test_attunement_rest_and_limit(self):
        self.hero(); ids=[self.item('Custom ring '+str(i),requires_attunement=True,equipment_slot='ring',equipment_reviewed=True) for i in range(4)]
        with self.assertRaisesRegex(ValueError,'short rest'):self.act('attune',ids[0])
        for ident in ids[:3]:self.act('attune',ident,rest_completed=True)
        with self.assertRaisesRegex(ValueError,'three'):self.act('attune',ids[3],rest_completed=True)
        self.act('unattune',ids[0],rest_completed=True)
        self.assertEqual(len(self.act()['attuned']),2)

    def test_cloak_bonus_requires_wearing_and_attunement(self):
        self.hero(); cloak=self.item('Cloak of Protection',requires_attunement=True)
        self.assertEqual(self.act('equip',cloak,slot='cloak',accept_penalties=True)['ac'],12)
        self.assertEqual(self.act('attune',cloak,rest_completed=True)['ac'],13)
        self.assertEqual(self.act('unequip',cloak)['ac'],12)
        self.assertIn(cloak,self.act()['attuned'])

    def test_unknown_items_review_and_curse(self):
        self.hero();item=self.item('Mystery',requires_attunement=True)
        self.assertTrue(self.act()['items'][0]['review'])
        with self.assertRaises(ValueError):self.act('equip',item,slot='main_hand')
        c=self.content(item);c['tabletop'].update(equipment_reviewed=True,equipment_slot='head',equipment_cursed=True)
        storage.update_work(self.dm,item,'Mystery',c)
        self.act('attune',item,rest_completed=True)
        with self.assertRaisesRegex(ValueError,'curse'):self.act('unattune',item,rest_completed=True)

    def test_authorization_reference_and_transfer(self):
        self.hero(); shield=self.item('Shield')
        with self.assertRaises(PermissionError):equipment.request(self.outsider,self.c,dict(character_id=self.h))
        self.act('equip',shield,slot='off_hand')
        c=self.content(shield);c['owner_ids']=[];c['reference_only']=True;storage.update_work(self.dm,shield,'Shield',c)
        state=self.act();self.assertEqual(state['loadout'],{});self.assertEqual(state['ac'],12)
        with self.assertRaises(PermissionError):self.act('equip',shield,slot='off_hand')

    def test_sheet_save_cannot_overwrite_loadout_or_grant_training(self):
        self.hero(); shield=self.item('Shield');old=copy.deepcopy(self.content(self.h))
        self.act('equip',shield,slot='off_hand')
        old['tabletop'].update(equipment_loadout={},equipment_armor_training='heavy',equipment_reviewed=True)
        storage.update_work(self.player,self.h,'Hero',old)
        now=self.content(self.h)['tabletop'];self.assertEqual(now['equipment_loadout'],{'off_hand':shield})
        self.assertNotIn('equipment_armor_training',now)

    def test_custom_edition_not_silently_approved(self):
        self.hero();self.item('Longsword');c=self.content(self.c);c['tabletop']={'ruleset':'2014'}
        storage.update_work(self.dm,self.c,'Campaign',c)
        self.assertFalse(any(o['allowed'] for o in self.act()['items'][0]['options']))

    def test_two_copies_from_one_stack_and_quantity_reduction(self):
        self.hero();item=self.item('Dagger');c=self.content(item);c['quantity']=2
        storage.update_work(self.dm,item,'Dagger',c)
        self.act('equip',item,slot='main_hand');self.act('equip',item,slot='off_hand')
        self.assertEqual(len(self.act()['loadout']),2)
        c['quantity']=1;storage.update_work(self.dm,item,'Dagger',c)
        self.assertEqual(len(self.act()['loadout']),1)
        self.act('unequip',item);self.assertEqual(self.act()['loadout'],{})

    def test_transferred_item_does_not_re_equip_when_returned(self):
        self.hero();item=self.item('Shield');self.act('equip',item,slot='off_hand')
        c=self.content(item);c['owner_ids']=[];storage.update_work(self.dm,item,'Shield',c)
        c['owner_ids']=[self.h];storage.update_work(self.dm,item,'Shield',c)
        self.assertEqual(self.act()['loadout'],{})

    def test_explicit_item_prerequisites(self):
        self.hero('Wizard',8); item=self.item('Special sword',equipment_base='Longsword',equipment_min_strength=15,equipment_classes='Fighter')
        row=self.act()['items'][0]
        self.assertTrue(any('Strength 15' in text for text in row['unmet']))
        self.assertTrue(any('fighter' in text for text in row['unmet']))
        with self.assertRaisesRegex(ValueError,'Requires'): self.act('equip',item,slot='main_hand',accept_penalties=True)


if __name__ == '__main__': unittest.main()
