import _bootstrap
import base64
import gc
import io
import tempfile
import unittest
from pathlib import Path
from PIL import Image
import storage
import chat_images

class ChatImagesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original = storage.DB_PATH, storage.UPLOAD_DIR
        storage.DB_PATH = Path(self.temp.name) / 'test.db'
        storage.UPLOAD_DIR = Path(self.temp.name) / 'uploads'
        storage.initialize()
        self.dm = storage.create_user('DM', None, 'Test password 12345')
        self.player = storage.create_user('Player', None, 'Test password 12345')
        self.other = storage.create_user('Other', None, 'Test password 12345')
        self.cid = storage.create_work(self.dm, 'Chat test', {'category':'campaign','ai_dm':True})['id']
        for name, uid in [('Player', self.player), ('Other', self.other)]:
            storage.invite_to_campaign(self.dm, self.cid, name)
            storage.answer_invite(uid, self.cid, True)
        pixels = io.BytesIO(); Image.new('RGB', (1400, 700), 'red').save(pixels, 'PNG')
        self.image = storage.save_upload(self.player, pixels.getvalue(), '.png', 'image/png')
    def tearDown(self):
        storage.DB_PATH, storage.UPLOAD_DIR = self.original
        gc.collect(); self.temp.cleanup()
    def post(self, audience=None, chat=None):
        return storage.add_ai_message(self.cid, self.player, 'character', None, 'Player', 'user', True, '', audience, chat, image_ids=[self.image])
    def test_validation_and_pixels(self):
        self.assertEqual(chat_images.validate(self.player, [self.image, self.image]), [self.image])
        for value in [None, [True], ['1'], [self.image]*4]:
            with self.assertRaises(ValueError): chat_images.validate(self.player, value)
        with self.assertRaises(ValueError): chat_images.validate(self.other, [self.image])
        raw = base64.b64decode(chat_images.encoded(self.player, self.image))
        with Image.open(io.BytesIO(raw)) as image: self.assertEqual(image.size, (1024, 512))
    def test_public_persistence_and_edit_removal(self):
        message = self.post()
        self.assertEqual(message['image_ids'], [self.image])
        self.assertEqual(storage.list_ai_messages(self.other, self.cid)[0]['image_ids'], [self.image])
        self.assertIsNotNone(storage.get_visible_upload(self.other, self.image))
        storage.update_ai_message(self.cid, message['id'], 'Text only', [])
        self.assertEqual(storage.list_ai_messages(self.other, self.cid)[0]['image_ids'], [])
        self.assertIsNone(storage.get_visible_upload(self.other, self.image))
    def test_private_audience_and_deletion(self):
        message = self.post([self.player])
        self.assertIsNone(storage.get_visible_upload(self.other, self.image))
        self.assertIsNotNone(storage.get_visible_upload(self.dm, self.image))
        storage.delete_ai_message(self.cid, message['id'], self.player)
        self.assertIsNone(storage.get_visible_upload(self.dm, self.image))
    def test_private_chat_access(self):
        chat = storage.create_work(self.dm, 'Private', {'category':'chat','campaign_id':self.cid,'assigned_user_ids':[self.player]})
        self.post(chat=chat['id'])
        self.assertIsNone(storage.get_visible_upload(self.other, self.image))
        self.assertIsNotNone(storage.get_visible_upload(self.dm, self.image))
    def test_bounded_context_uses_actual_images(self):
        entries = [self.post() for _ in range(8)]
        messages = [{'role':'user','content':'Look'} for _ in entries]
        self.assertTrue(chat_images.attach_history(self.dm, entries, messages))
        self.assertEqual(sum(len(m.get('images', [])) for m in messages), 6)
        self.assertIn('omitted', messages[0]['content'])
        self.assertTrue(base64.b64decode(messages[-1]['images'][0]).startswith(b'\x89PNG'))
    def test_unavailable_image_not_hallucinated(self):
        messages = [{'role':'user','content':'Look'}]
        self.assertFalse(chat_images.attach_history(self.other, [{'image_ids':[self.image]}], messages))
        self.assertIn('unavailable', messages[0]['content'])

if __name__ == '__main__': unittest.main()
