import _bootstrap
import io
import json
import queue
import unittest
from unittest.mock import Mock, patch
from PIL import Image

import chat_art
import storage
from test_chat_images import ChatImagesTests


class ChatArtTests(unittest.TestCase):
    setUpDatabase = ChatImagesTests.setUp
    tearDownDatabase = ChatImagesTests.tearDown

    def setUp(self):
        self.setUpDatabase()
        self.jobs = queue.Queue(maxsize=32)
        self.queue_patch = patch.object(chat_art, '_jobs', self.jobs)
        self.start_patch = patch.object(chat_art, '_start_worker')
        self.queue_patch.start(); self.start_patch.start()
        buffer = io.BytesIO(); Image.new('RGB', (16, 16), 'blue').save(buffer, 'PNG'); self.pixels = buffer.getvalue()
        def request(path, payload=None, **kwargs):
            if path == '/api/tags': return {'models':[{'name':'test'}]}
            data = json.loads(payload['messages'][-1]['content'])
            return {'message':{'content':json.dumps({'ids':[r['id'] for r in data['records']]} if 'records' in data else {'prompt':data['campaign_context']})}}
        self.request, self.stream = Mock(side_effect=request), Mock()

    def tearDown(self):
        self.queue_patch.stop(); self.start_patch.stop()
        self.tearDownDatabase()

    def message(self, text, audience=None, persona=None):
        return storage.add_ai_message(self.cid, self.player, 'character' if persona else 'dm', persona, 'Player', 'user', True, text, audience)

    def sync(self, message):
        chat_art.reconcile(self.player, self.cid, message['id'], self.request, self.stream)

    def art(self, message):
        return next(m for m in storage.list_ai_messages(self.player, self.cid) if m['id'] == message['id'])['art']

    def finish_job(self, result=None):
        job = self.jobs.get_nowait()
        def generate(*args, **kwargs):
            if result is not None: result(args, kwargs)
            yield {'event':'pixels','data':self.pixels}
            yield {'event':'done'}
        with patch.object(chat_art.local_art, 'ready', return_value=True), patch.object(chat_art.local_art, 'design', side_effect=generate), patch.object(chat_art.art_references, 'choose_model', return_value='vision'):
            chat_art.run_job(job)

    def test_prompt_research_skips_unrelated_batches_and_keeps_helper_loaded(self):
        for n in range(30):storage.create_work(self.player,'Unrelated '+str(n),{'category':'artwork','campaign_id':self.cid,'summary':'blue glass'})
        pc=storage.create_work(self.player,'Emma',{'category':'character','campaign_id':self.cid,'owner_user_id':self.player,'summary':'hazel hair'})
        message=self.message('<image>Emma smiling</image>',persona=pc['id'])
        chat_art.research_prompt(self.player,self.cid,storage.get_ai_message(self.cid,message['id']),'Emma smiling',self.request)
        calls=[c for c in self.request.call_args_list if c.args[0]=='/api/chat']
        self.assertEqual(len(calls),2)
        self.assertEqual(calls[0].args[1]['keep_alive'],'2m')
        self.assertEqual(calls[1].args[1]['keep_alive'],0)
        batch=json.loads(calls[0].args[1]['messages'][-1]['content'])['records']
        self.assertEqual([r['name'] for r in batch],['Emma'])

    def test_tag_limits_and_literal_examples(self):
        text = '`<image>quoted</image>` \\<image>escaped</image> <image>cat</image> after <image>cat</image>'
        self.assertEqual([(t['prompt'],t['occurrence']) for t in chat_art.tags(text)], [('cat',0),('cat',1)])
        self.assertEqual(len(chat_art.tags('<image>cat</image>'*9)),3)
        self.assertFalse(chat_art.tags('<image></image><image>unfinished'))

    def test_research_rejected_records_do_not_return_through_name_matching(self):
        storage.create_work(self.player,'Blue Knight',{'category':'artwork','campaign_id':self.cid,'summary':'Unwanted armored warrior','image_id':self.image})
        message=self.message('<image>a blue vase</image>')
        raw=storage.get_ai_message(self.cid,message['id'])
        brief,refs=chat_art.references(self.player,self.cid,raw,'a blue vase',selected_ids=[])
        self.assertEqual(brief,'a blue vase');self.assertEqual(refs,[])

    def test_chat_size_and_shape_persist_and_reach_renderer(self):
        message=self.message('<image>a cat</image>');self.sync(message);self.finish_job();art=self.art(message)[0]
        chat_art.enqueue(self.player,self.cid,art['id'],'regenerate','',art['revision'],self.request,self.stream,render_settings={'size':1024,'shape':'portrait'})
        def check(args,kwargs):
            self.assertEqual(args[2],1024);self.assertEqual(kwargs['shape'],'portrait')
        self.finish_job(check)
        self.assertEqual(self.art(message)[0]['render_settings'],{'size':1024,'shape':'portrait'})

    def test_reopen_and_prose_edits_reuse_images(self):
        message = self.message('Before <image>a cat</image> between <image>a cat</image> after')
        self.sync(message); self.assertEqual(self.jobs.qsize(),2)
        self.finish_job(); self.finish_job()
        before = self.art(message)
        self.assertNotEqual(before[0]['id'], before[1]['id'])
        storage.update_ai_message(self.cid,message['id'],'New opening <image>a cat</image> and <image>a cat</image> ending')
        self.sync(message)
        self.assertTrue(self.jobs.empty())
        self.assertEqual([a['image_id'] for a in self.art(message)], [a['image_id'] for a in before])

    def test_save_regenerate_and_edit_keep_catalog_copy(self):
        message = self.message('Before <image>a cat</image> after'); self.sync(message); self.finish_job()
        art = self.art(message)[0]
        saved = chat_art.save(self.player,self.cid,art['id'],'Cat',art['revision'])
        self.assertEqual(saved,chat_art.save(self.player,self.cid,art['id'],'Again',art['revision']))
        old_image = art['image_id']
        chat_art.enqueue(self.player,self.cid,art['id'],'edit','Give the cat a blue hat',art['revision'],self.request,self.stream)
        self.assertEqual(self.art(message)[0]['image_id'], old_image)
        def check(args, kwargs):
            self.assertIn('blue hat',args[0]); self.assertIsNotNone(args[1]); self.assertTrue(args[1].is_file())
        self.finish_job(check)
        new = self.art(message)[0]; self.assertNotEqual(new['image_id'], old_image); self.assertFalse(new['saved'])
        self.assertEqual(next(r for r in storage.list_work(self.player) if r['id']==saved)['content']['image_id'],old_image)
        self.assertIsNotNone(storage.get_visible_upload(self.other,new['image_id']))

    def test_failed_edit_keeps_previous_image(self):
        message=self.message('<image>a cat</image>'); self.sync(message); self.finish_job(); art=self.art(message)[0]
        chat_art.enqueue(self.player,self.cid,art['id'],'edit','blue hat',art['revision'],self.request,self.stream)
        with patch.object(chat_art.local_art,'ready',return_value=False):
            chat_art.run_job(self.jobs.get_nowait())
        failed=self.art(message)[0]
        self.assertEqual(failed['image_id'],art['image_id']);self.assertEqual(failed['status'],'error')

    def test_removed_prompt_cannot_publish_stale_result(self):
        message=self.message('<image>a cat</image>');self.sync(message)
        job=self.jobs.get_nowait();storage.update_ai_message(self.cid,message['id'],'No image');self.sync(message)
        with patch.object(chat_art.local_art,'design') as generate:
            chat_art.run_job(job);generate.assert_not_called()
        self.assertEqual(self.art(message),[])

    def test_private_images_and_actions_are_scoped(self):
        message=self.message('<image>a secret castle</image>',[self.player]);self.sync(message);self.finish_job();art=self.art(message)[0]
        self.assertIsNone(storage.get_visible_upload(self.other,art['image_id']))
        with self.assertRaises(PermissionError):chat_art.save(self.other,self.cid,art['id'],'Secret',art['revision'])
        with self.assertRaises(PermissionError):chat_art.enqueue(self.other,self.cid,art['id'],'regenerate','',art['revision'],self.request,self.stream)
        with self.assertRaises(ValueError):chat_art.enqueue(self.player,self.cid,art['id'],'regenerate','',art['revision']-1,self.request,self.stream)

    def test_character_and_item_references_are_real_and_scoped(self):
        pc=storage.create_work(self.player,'Elara',{'category':'character','campaign_id':self.cid,'owner_user_id':self.player,'image_id':self.image,'summary':'Silver hair and green eyes'})
        sword=storage.create_work(self.dm,'Moonblade',{'category':'item','campaign_id':self.cid,'owner_ids':[pc['id']],'summary':'Curved silver blade'})
        storage.create_work(self.dm,'Hidden sigil',{'category':'item','campaign_id':self.cid,'notes':'SECRET LORE'})
        message=self.message('<image>Elara holding Moonblade beside a hidden sigil</image>',persona=pc['id'])
        raw=storage.get_ai_message(self.cid,message['id'])
        brief,refs=chat_art.references(self.player,self.cid,raw,'Elara holding Moonblade beside a hidden sigil')
        self.assertIn('Silver hair',brief);self.assertIn('Curved silver blade',brief);self.assertNotIn('SECRET LORE',brief)
        self.assertEqual(refs[0]['image_id'],self.image)
        self.sync(message)
        self.finish_job(lambda args,kw:self.assertEqual(kw['image_references'][0]['name'],'Elara'))


if __name__ == '__main__':unittest.main()
