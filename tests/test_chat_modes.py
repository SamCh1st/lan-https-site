import _bootstrap
import unittest
import chat_modes
import storage
from test_chat_images import ChatImagesTests

class ModesTests(unittest.TestCase):
    setUp=ChatImagesTests.setUp
    tearDown=ChatImagesTests.tearDown
    def test_modes_persist_without_replacing_campaign_fields(self):
        self.assertEqual(chat_modes.get(self.player,self.cid),'dnd')
        for mode in chat_modes.MODES:
            chat_modes.set_mode(self.dm,self.cid,mode)
            self.assertEqual(chat_modes.get(self.player,self.cid),mode)
            self.assertTrue(storage.campaign_record(self.dm,self.cid)['content']['ai_dm'])
        with self.assertRaises(ValueError):chat_modes.set_mode(self.dm,self.cid,'unknown')
        with self.assertRaises(PermissionError):chat_modes.set_mode(self.player,self.cid,'dnd')
    def test_private_chat_scope_and_permissions(self):
        chat=storage.create_work(self.dm,'Private',{'category':'chat','campaign_id':self.cid,'assigned_user_ids':[self.player]})
        chat_modes.set_mode(self.player,self.cid,'modern',chat['id'])
        self.assertEqual(chat_modes.get(self.player,self.cid,chat['id']),'modern')
        self.assertEqual(chat_modes.get(self.dm,self.cid),'dnd')
        with self.assertRaises(PermissionError):chat_modes.set_mode(self.other,self.cid,'medieval',chat['id'])
    def test_only_actual_dnd_scene_replies_can_mutate_game(self):
        for mode in chat_modes.MODES:
            for persona in ('dm','character'):
                for kind in (None,'conversation','scene'):
                    self.assertEqual(chat_modes.permits_effects(mode,persona,{'reply_kind':kind}),mode=='dnd' and persona=='dm' and kind=='scene')
        self.assertIn('reply_kind',chat_modes.reply_schema()['required'])

if __name__=='__main__':unittest.main()
