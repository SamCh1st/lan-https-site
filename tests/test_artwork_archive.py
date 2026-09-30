import _bootstrap  # Shared backend import path for tests and previews.
import unittest
import storage
import test_campaign_maps

class ArtworkArchiveTests(unittest.TestCase):
    setUp=test_campaign_maps.CampaignMapsTests.setUp
    tearDown=test_campaign_maps.CampaignMapsTests.tearDown

    def test_saved_artwork_permissions_and_editing(self):
        card=storage.create_work(self.player,'Moonlit sword',{'category':'artwork','campaign_id':self.c,'summary':'A silver blade','image_id':123,'assigned_user_ids':[self.player]})
        self.assertIn(card['id'],{r['id'] for r in storage.list_work(self.player)})
        self.assertIn(card['id'],{r['id'] for r in storage.list_work(self.dm)})
        self.assertTrue(storage.update_work(self.player,card['id'],'Renamed',{'category':'item','campaign_id':999,'summary':'New description','image_id':124}))
        saved=next(r for r in storage.list_work(self.player) if r['id']==card['id'])
        self.assertEqual(saved['content']['category'],'artwork');self.assertEqual(saved['content']['campaign_id'],self.c)
        self.assertEqual(saved['title'],'Renamed');self.assertEqual(saved['content']['summary'],'New description')
        self.assertFalse(storage.update_work(999,card['id'],'No',saved['content']))
        self.assertTrue(storage.delete_work(self.player,card['id']))

if __name__=='__main__':unittest.main()
