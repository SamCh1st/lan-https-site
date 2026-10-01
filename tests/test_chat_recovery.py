import _bootstrap
import io
import json
import threading
import unittest
from unittest.mock import Mock, patch
import chat_generation
import character_memory
import server
import storage
import test_chat_images


class StreamTests(unittest.TestCase):
    def test_error_frame_is_reported_instead_of_silent_eof(self):
        response=io.BytesIO(b'{"error":"runner out of memory"}\n')
        with patch.object(server.urllib.request,'urlopen',return_value=response):
            with self.assertRaisesRegex(chat_generation.StreamInterrupted,'runner out of memory'):
                list(server.ollama_stream('/api/chat',{}))

    def test_disconnect_retries_same_message_and_closes_both_streams(self):
        closed=[];progress=[];calls=[]
        def stream(*args,**kwargs):
            attempt=len(calls);calls.append(args)
            try:
                yield {'message':{'content':'{"reply":"'+('discard' if attempt==0 else 'Recovered')+'"}'}}
                if attempt:yield {'done':True}
            finally:closed.append(attempt)
        raw=chat_generation.stream_reply(stream,{'model':'test'},progress.append,server.partial_json_string_field)
        self.assertEqual(json.loads(raw)['reply'],'Recovered')
        self.assertIn('',progress)
        self.assertEqual(closed,[0,1])
        self.assertEqual(calls[0],calls[1])

    def test_retry_is_bounded_and_exposes_real_error(self):
        stream=Mock(side_effect=lambda *a,**k:iter([{'error':'runner crashed'}]))
        with self.assertRaisesRegex(ValueError,'runner crashed'):
            chat_generation.stream_reply(stream,{},lambda text:None,server.partial_json_string_field)
        self.assertEqual(stream.call_count,2)

    def test_failed_retry_retains_text_from_the_first_attempt(self):
        stream=Mock(side_effect=[iter([{'message':{'content':'{"reply":"Keep these words'}}]),iter([{'error':'runner unavailable'}])])
        saved=[]
        with self.assertRaisesRegex(ValueError,'runner unavailable'):
            chat_generation.stream_reply(stream,{},saved.append,server.partial_json_string_field)
        self.assertEqual(saved[-1],'Keep these words')

    def test_terminal_frame_ends_stream_even_if_connection_remains_open(self):
        def stream(*args,**kwargs):
            yield {'done':True,'message':{'content':'{"reply":"Finished"}'}}
            raise AssertionError('Must close the stream on done')
        self.assertIn('Finished',chat_generation.stream_reply(stream,{},lambda text:None,server.partial_json_string_field))

    def test_deadline_does_not_start_another_attempt(self):
        stream=Mock(return_value=iter([{'message':{'content':'hello'}}]))
        with patch.object(chat_generation.time,'monotonic',side_effect=[0,181,181]):
            with self.assertRaises(TimeoutError):
                chat_generation.stream_reply(stream,{},lambda text:None,server.partial_json_string_field)
        self.assertEqual(stream.call_count,1)


class ReplyRecoveryTests(unittest.TestCase):
    setUp=test_chat_images.ChatImagesTests.setUp
    tearDown=test_chat_images.ChatImagesTests.tearDown

    def prepare(self):
        self.pc=storage.create_work(self.player,'Mira',{'category':'character','campaign_id':self.cid,'owner_user_id':self.player})
        self.handler=object.__new__(server.Handler)
        self.handler.headers={}
        self.responses=[]
        self.handler.send_json=lambda code,body:self.responses.append((code,body))
        self.handler.sync_chat_art=lambda *a:None
        self.handler.ai_model=lambda *a:'test'

    def respond(self):
        self.handler.ai_message({'id':self.player},self.cid,{'respond_only':True,'reply_as_type':'character','reply_as_id':self.pc['id']})

    def test_failure_releases_chat_and_next_reply_succeeds(self):
        self.prepare()
        with patch.object(server,'ollama_models',return_value=['test']),patch.object(character_memory,'learn_later') as learn:
            with patch.object(server,'ollama_stream',side_effect=lambda *a,**k:iter([{'message':{'content':'{"reply":"Partial words'}},{'error':'runner crashed'}])):
                self.respond()
            self.assertEqual(self.responses[-1][0],503)
            failed=storage.list_ai_messages(self.player,self.cid)[-1]
            self.assertEqual(failed['generation_status'],'error')
            self.assertIn('Partial words',failed['message'])
            learn.assert_not_called()
            with patch.object(server,'ollama_stream',side_effect=lambda *a,**k:iter([{'done':True,'message':{'content':'{"reply":"Hello again."}'}}])):
                self.respond()
            self.assertEqual(self.responses[-1][0],201)
            self.assertEqual(storage.list_ai_messages(self.player,self.cid)[-1]['message'],'Hello again.')
            learn.assert_called_once()

    def test_browser_disconnect_cannot_change_completed_reply_to_error(self):
        self.prepare()
        self.handler.send_json=Mock(side_effect=BrokenPipeError('Browser left'))
        with patch.object(server,'ollama_models',return_value=['test']),patch.object(server,'ollama_stream',side_effect=lambda *a,**k:iter([{'done':True,'message':{'content':'{"reply":"Saved reply."}'}}])):
            self.respond()
        self.assertEqual(storage.list_ai_messages(self.player,self.cid)[-1]['generation_status'],'complete')
        self.assertEqual(self.handler.send_json.call_count,1)

    def test_empty_conversation_has_a_real_turn_and_required_reply_schema(self):
        self.prepare()
        character_memory.change(self.player,self.cid,self.pc['id'],{'action':'profile','revision':0,'core':'A calm baker.','reminder':'Speak quietly.','enabled':True})
        def stream(path,payload,**kwargs):
            self.assertEqual(payload['messages'][-1]['role'],'user')
            self.assertIn('There are no earlier spoken messages',payload['messages'][-1]['content'])
            self.assertIn('Speak quietly.',str(payload['messages']))
            self.assertIn('150–300 words',str(payload['messages']))
            self.assertIn('writing styles dictionary',payload['messages'][-1]['content'])
            self.assertNotIn('brief, natural opening',payload['messages'][-1]['content'])
            self.assertEqual(payload['format']['required'],['reply'])
            self.assertEqual(payload['format']['properties']['reply']['type'],'array')
            self.assertEqual(payload['format']['properties']['reply']['minItems'],1)
            self.assertFalse(payload['format']['additionalProperties'])
            yield {'done':True,'message':{'content':'{"reply":"Welcome to the bakery."}'}}
        with patch.object(server,'ollama_models',return_value=['test']),patch.object(server,'ollama_stream',side_effect=stream),patch.object(character_memory,'learn_later'):
            self.respond()
        self.assertEqual(self.responses[-1][0],201)

    def test_existing_conversation_is_not_given_a_fake_opening_turn(self):
        self.prepare()
        storage.add_ai_message(self.cid,self.player,'character',self.pc['id'],'Player','user',True,'Is the bakery open?')
        def stream(path,payload,**kwargs):
            turns=[m for m in payload['messages'] if m['role']=='user']
            self.assertEqual(len(turns),1)
            self.assertIn('Is the bakery open?',turns[0]['content'])
            self.assertIn('REPLY DETAIL AND PRESENTATION',str(payload['messages']))
            self.assertNotIn('There are no earlier spoken messages',str(payload['messages']))
            yield {'done':True,'message':{'content':'{"reply":"Yes, come in."}'}}
        with patch.object(server,'ollama_models',return_value=['test']),patch.object(server,'ollama_stream',side_effect=stream),patch.object(character_memory,'learn_later'):
            self.respond()
        self.assertEqual(self.responses[-1][0],201)

    def test_structured_reply_is_rendered_saved_and_regenerated(self):
        self.prepare()
        raw=json.dumps({'reply':[{'style':'action','text':'She waves.'},{'style':'dialogue','text':'Welcome.'}]})
        with patch.object(server,'ollama_models',return_value=['test']),patch.object(server,'ollama_stream',return_value=iter([
            {'done':True,'message':{'content':raw}}])),patch.object(server,'ollama_request',return_value={'message':{'content':raw}}),patch.object(character_memory,'learn_later'):
            self.respond()
        message=storage.list_ai_messages(self.player,self.cid)[-1]
        self.assertEqual(message['message'],'#She waves.#\n\n"Welcome."')
        replacement=json.dumps({'reply':[{'style':'written','text':'See you tomorrow. 🙂'}]})
        with patch.object(server,'ollama_request',return_value={'message':{'content':replacement}}) as request:
            self.handler.ai_regenerate({'id':self.dm},self.cid,{'message_id':message['id'],'guidance':'Reply as a text message.'})
        self.assertEqual(self.responses[-1][0],200)
        self.assertEqual(storage.get_ai_message(self.cid,message['id'])['message'],'`See you tomorrow. 🙂`')
        self.assertEqual(request.call_count,1)

    def test_dm_rules_reply_stays_plain_and_has_no_scene_effects(self):
        self.prepare()
        raw=json.dumps({'reply':[{'style':'plain','text':'Roll a d20 and add your recorded bonus.'}],
            'reply_kind':'conversation','scene':{'weather':'Storm'},'cards':[],'grants':[]})
        with patch.object(server,'ollama_models',return_value=['test']),patch.object(server,'ollama_stream',return_value=iter([
            {'done':True,'message':{'content':raw}}])):
            self.handler.ai_message({'id':self.dm},self.cid,{'respond_only':True,'reply_as_type':'dm'})
        self.assertEqual(self.responses[-1][0],201)
        self.assertEqual(self.responses[-1][1]['reply']['message'],'Roll a d20 and add your recorded bonus.')
        self.assertNotEqual(storage.campaign_record(self.dm,self.cid)['content'].get('ai_world',{}).get('weather'),'Storm')

    def test_delivery_check_failure_keeps_reply_and_unlocks_chat(self):
        self.prepare()
        with patch.object(server,'ollama_models',return_value=['test']),patch.object(server,'ollama_stream',side_effect=lambda *a,**k:iter([{'done':True,'message':{'content':'{"reply":"Hello."}'}}])),patch.object(server.chat_format,'review_delivery',side_effect=TimeoutError('review stalled')),patch.object(character_memory,'learn_later'):
            self.respond()
        self.assertEqual(self.responses[-1][0],201)
        message=storage.list_ai_messages(self.player,self.cid)[-1]
        self.assertEqual(message['generation_status'],'complete')
        self.assertIn('Hello.',message['message'])

    def test_background_memory_does_not_queue_or_block_caller(self):
        self.prepare()
        entered=threading.Event();release=threading.Event();finished=threading.Event()
        def learn(*args,**kwargs):
            entered.set();release.wait(5);finished.set()
        with patch.object(character_memory,'learn',side_effect=learn) as mock:
            try:
                character_memory.learn_later(self.pc,self.cid,[],Mock(),'test')
                self.assertTrue(entered.wait(2))
                character_memory.learn_later(self.pc,self.cid,[],Mock(),'test')
                self.assertEqual(mock.call_count,1)
                self.assertEqual(mock.call_args.kwargs['max_batches'],1)
            finally:
                release.set();self.assertTrue(finished.wait(2))
                with character_memory._learning_worker:pass


if __name__=='__main__':unittest.main()
