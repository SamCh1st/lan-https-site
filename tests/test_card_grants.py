import _bootstrap  # Shared backend import path for tests and previews.
import gc
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import storage

class CharacterGrantTests(unittest.TestCase):
    def test_private_grants_revoke_and_reject_foreign_characters(self):
        old_db, old_uploads = storage.DB_PATH, storage.UPLOAD_DIR
        with tempfile.TemporaryDirectory() as folder:
            try:
                storage.DB_PATH = Path(folder) / 'grants.db'
                storage.UPLOAD_DIR = Path(folder) / 'uploads'
                storage.initialize()
                dm = storage.create_user('GrantDM', None, 'Test password 12345')
                player = storage.create_user('GrantPlayer', None, 'Test password 12345')
                other = storage.create_user('GrantOther', None, 'Test password 12345')
                campaign = storage.create_work(dm, 'Grants', {'category':'campaign','tabletop':{'ruleset':'custom'}})
                foreign = storage.create_work(dm, 'Elsewhere', {'category':'campaign','tabletop':{'ruleset':'custom'}})
                for name, user in [('GrantPlayer', player), ('GrantOther', other)]:
                    storage.invite_to_campaign(dm, campaign['id'], name)
                    storage.answer_invite(user, campaign['id'], True)
                character = storage.create_work(player, 'Elara', {'category':'character','campaign_id':campaign['id'],'owner_user_id':player,'role':'party'})
                outsider = storage.create_work(dm, 'Other campaign PC', {'category':'character','campaign_id':foreign['id'],'owner_user_id':other})
                for category, key in [('item','owner_ids'),('spell','user_ids'),('attack','user_ids')]:
                    card = storage.create_work(dm, category, {'category':category,'campaign_id':campaign['id'],key:[character['id'],outsider['id'],999999], 'reference_only':True,'player_visible':False,'grant_mode':'characters'})
                    self.assertEqual(card['content'][key], [character['id']])
                    self.assertFalse(card['content']['reference_only'])
                    self.assertIn(card['id'], [r['id'] for r in storage.list_work(player)])
                    self.assertEqual(card['id'] in [r['id'] for r in storage.list_work(other)], category != 'item')
                    self.assertFalse(storage.update_work(player, card['id'], 'Cannot edit DM card', card['content']))
                    card['content'][key] = []
                    storage.update_work(dm, card['id'], card['title'], card['content'])
                    self.assertEqual(card['id'] in [r['id'] for r in storage.list_work(player)], category != 'item')
            finally:
                storage.DB_PATH, storage.UPLOAD_DIR = old_db, old_uploads
                gc.collect()

if __name__ == '__main__':
    unittest.main()
