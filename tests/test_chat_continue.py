import _bootstrap
import json
import unittest
from unittest.mock import Mock
import chat_continue
import chat_art
import storage
from test_chat_images import ChatImagesTests

class ContinuationTests(unittest.TestCase):
    setUp = ChatImagesTests.setUp
    tearDown = ChatImagesTests.tearDown

    def test_suffix_preserves_draft_and_does_not_save(self):
        message = storage.add_ai_message(self.cid, self.player, 'dm', None, 'Player', 'user', True, 'old text')
        request = Mock(return_value={'message':{'content':json.dumps({'continuation':' Harold. I live nearby.'})}})
        draft = '**My name is'
        suffix = chat_continue.complete(self.player,self.cid,message['id'],draft,request,'test')
        self.assertEqual(draft + suffix,'**My name is Harold. I live nearby.')
        sent = json.loads(request.call_args.args[1]['messages'][-1]['content'])
        self.assertEqual(sent['draft'],draft)
        self.assertEqual(storage.get_ai_message(self.cid,message['id'])['message'],'old text')
        with self.assertRaises(PermissionError):
            chat_continue.complete(self.other,self.cid,message['id'],draft,request,'test')

    def test_missing_space_and_word_continuation(self):
        message = storage.add_ai_message(self.cid,self.player,'dm',None,'Player','user',True,'old')
        for draft, answer, expected in [('my name is', {'continuation':'Harold'}, ' Harold'), ('Har', {'continuation':'old', 'continues_word':True}, 'old')]:
            request = Mock(return_value={'message':{'content':json.dumps(answer)}})
            self.assertEqual(chat_continue.complete(self.player,self.cid,message['id'],draft,request,'test'),expected)

    def test_research_resolves_description_and_ignores_unpermitted_ids(self):
        pc = storage.create_work(self.player,'Elara',{'category':'character','campaign_id':self.cid,'owner_user_id':self.player,'summary':'Silver hair and green eyes','image_id':self.image})
        hidden = storage.create_work(self.dm,'Secret Queen',{'category':'npc','campaign_id':self.cid,'summary':'SECRET'})
        msg = storage.add_ai_message(self.cid,self.player,'character',pc['id'],'Elara','user',True,'picture')
        target = storage.get_ai_message(self.cid,msg['id'])
        calls = []
        def request(path,payload=None,**kwargs):
            if path == '/api/tags':return {'models':[{'name':'test'}]}
            data = json.loads(payload['messages'][-1]['content']);calls.append(data)
            answer = {'ids':[pc['id'],hidden['id']]} if 'records' in data else {'prompt':'A silver-haired traveler with green eyes beside a river, watercolor.'}
            return {'message':{'content':json.dumps(answer)}}
        final,refs = chat_art.research_prompt(self.player,self.cid,target,'the silver-haired traveler beside a river, watercolor',request)
        self.assertIn('watercolor',final);self.assertEqual(refs[0]['image_id'],self.image)
        self.assertIn('Silver hair',calls[-1]['campaign_context'])
        self.assertNotIn('SECRET',json.dumps(calls));self.assertNotIn('Secret Queen',json.dumps(calls))
        _, refs = chat_art.research_prompt(self.player,self.cid,target,'A small teal cup on a wooden table, watercolor',request)
        self.assertEqual(refs, [], 'Unrelated model-selected portraits must not enter object-only scenes')

if __name__ == '__main__':unittest.main()
