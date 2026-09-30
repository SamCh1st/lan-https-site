import _bootstrap  # Shared backend import path for tests and previews.
import json
import unittest
import storage
import campaign_maps as maps
from campaign_defaults import starter_records
import test_campaign_maps

class ArchiveTests(unittest.TestCase):
    setUp=test_campaign_maps.CampaignMapsTests.setUp
    tearDown=test_campaign_maps.CampaignMapsTests.tearDown

    def test_official_sections_and_idempotent_upgrade(self):
        refs=starter_records()
        for category,count in [('species',9),('background',4),('feat',4),('class',12)]:
            self.assertEqual(sum(r['content']['category']==category for r in refs),count)
        with storage.connect() as db:
            db.execute("DELETE FROM work_items WHERE json_extract(content,'$.category') IN ('species','background','feat')")
            db.execute("UPDATE work_items SET content=json_set(content,'$.category','lore','$.notes','Keep my class notes') WHERE json_extract(content,'$.category')='class'")
        storage.initialize()
        cards=storage.list_work(self.dm)
        self.assertEqual(sum(r['content'].get('category')=='species' for r in cards),9)
        self.assertTrue(all(r['content']['notes']=='Keep my class notes' for r in cards if r['content'].get('category')=='class'))
        storage.initialize()
        self.assertEqual(len(storage.list_work(self.dm)),len(cards))
        old=storage.create_work(self.dm,'Legacy',{'category':'campaign','tabletop':{'ruleset':'2014'}})['id']
        storage.initialize()
        self.assertFalse(any(r['content'].get('campaign_id')==old and r['content'].get('reference_only') for r in storage.list_work(self.dm)))

    def test_only_assigned_collected_and_met_cards(self):
        hero=storage.create_work(self.dm,'Hero',{'category':'character','campaign_id':self.c,'owner_user_id':self.player})['id']
        public=storage.create_work(self.dm,'Uncollected',{'category':'item','campaign_id':self.c,'player_visible':True})['id']
        given=storage.create_work(self.dm,'Assigned lore',{'category':'lore','campaign_id':self.c,'assigned_user_ids':[self.player]})['id']
        spell=storage.create_work(self.dm,'Given spell',{'category':'spell','campaign_id':self.c,'user_ids':[hero]})['id']
        npc=storage.create_work(self.dm,'Met NPC',{'category':'npc','campaign_id':self.c,'notes':'Card notes'})['id']
        visible={r['id'] for r in storage.list_work(self.player)}
        self.assertTrue({hero,given,spell}.issubset(visible));self.assertNotIn(public,visible);self.assertNotIn(npc,visible)
        references=[r for r in storage.list_work(self.player) if r['content'].get('reference_only')]
        self.assertTrue(references)
        self.assertTrue(all(r['content']['category'] != 'item' for r in references))
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':[{'id':'person','type':'npc','card_id':npc,'x':0,'y':0,'w':40,'h':40},{'id':'box','type':'chest','x':0,'y':0,'w':40,'h':40,'contents':[{'record_id':public,'quantity':1}]}]}})
        maps.meet_marker(self.player,self.c,self.first,{'node_id':'person'})
        loot=maps.take_contents(self.player,self.c,self.first,{'node_id':'box','character_id':hero,'record_id':public})
        visible={r['id'] for r in storage.list_work(self.player)}
        self.assertIn(npc,visible);self.assertIn(loot['record_id'],visible);self.assertNotIn(public,visible)
        self.assertIn(public,{r['id'] for r in storage.list_work(self.dm)})

    def test_archive_shared_with_all_members_but_not_outsiders(self):
        categories=('spell','attack','species','background','class','feat','map_part','artwork','lore')
        from map_part_catalog import PARTS
        cards=[]
        image=storage.save_upload(self.dm,b'archive image','.png','image/png')
        for category in categories:
            for reference in (False,True):
                content={'category':category,'campaign_id':self.c,'reference_only':reference,'player_visible':False,'image_id':image}
                if category=='map_part':
                    content.update(part_group='props',part_type=PARTS[0]['type'])
                cards.append(storage.create_work(self.dm,category,content))
        ids={r['id'] for r in cards}
        self.assertTrue(ids.issubset({r['id'] for r in storage.list_work(self.player)}))
        self.assertTrue(ids.isdisjoint({r['id'] for r in storage.list_work(self.outsider)}))
        self.assertIsNotNone(storage.get_visible_upload(self.player,image))
        self.assertIsNone(storage.get_visible_upload(self.outsider,image))
        for card in cards:
            self.assertFalse(storage.update_work(self.player,card['id'],'Changed',card['content']))
        storage.invite_to_campaign(self.dm,self.c,'Other')
        self.assertTrue(ids.isdisjoint({r['id'] for r in storage.list_work(self.outsider)}))
        storage.answer_invite(self.outsider,self.c,True)
        self.assertTrue(ids.issubset({r['id'] for r in storage.list_work(self.outsider)}))

    def test_join_without_character_and_view_party_read_only(self):
        self.assertTrue(storage.has_campaign_access(self.player,self.c))
        self.assertFalse(any(r['content'].get('category')=='character' for r in storage.list_work(self.player)))
        hero=storage.create_work(self.dm,'Other hero',{'category':'character','campaign_id':self.c,'owner_user_id':self.dm,'role':'party','player_visible':False})
        self.assertIn(hero['id'],{r['id'] for r in storage.list_work(self.player)})
        self.assertNotIn(hero['id'],{r['id'] for r in storage.list_work(self.outsider)})
        self.assertFalse(storage.update_work(self.player,hero['id'],'Changed',hero['content']))
        self.assertFalse(storage.delete_work(self.player,hero['id']))
        own=storage.create_work(self.player,'Later hero',{'category':'character','campaign_id':self.c,'owner_user_id':self.player,'role':'party'})
        self.assertTrue(storage.update_work(self.player,own['id'],'Updated hero',own['content']))

if __name__=='__main__':unittest.main()
