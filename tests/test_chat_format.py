import _bootstrap
import json
import unittest
from unittest.mock import Mock
import chat_format


class ChatFormatTests(unittest.TestCase):
    def test_typed_passages_render_using_library_styles(self):
        passages=[{'style':style,'text':text} for style,text in [
            ('action','#She opens the door.#'),('dialogue','Welcome. **Come in.**'),
            ('thought','*That was unexpected.*'),('whisper',"Don't wake him."),
            ('written','Meet me tomorrow. 🙂'),('plain','A rules explanation.')]]
        self.assertEqual(chat_format.render_reply(passages),
            '#She opens the door.#\n\n"Welcome. **Come in.**"\n\n*That was unexpected.*\n\n'
            "'Don't wake him.'\n\n`Meet me tomorrow. 🙂`\n\nA rules explanation.")

    def test_images_are_outside_styles_but_written_examples_stay_inert(self):
        import chat_art
        reply=chat_format.render_reply([
            {'style':'dialogue','text':'Here it is. <image>a cat</image>'},
            {'style':'written','text':'Example: <image>a dog</image>\nJust an example.'},
            {'style':'image','text':'<image>a forest</image>'}])
        self.assertIn('"Here it is." <image>a cat</image>',reply)
        self.assertIn('```Example:',reply)
        self.assertEqual([t['prompt'] for t in chat_art.tags(reply)],['a cat','a forest'])

    def test_invalid_passages_do_not_leak_json_to_readers(self):
        self.assertEqual(chat_format.render_reply(None),'')
        self.assertEqual(chat_format.render_reply([None,{'style':'unknown','text':'secret'},
            {'style':'dialogue','text':{}},{'style':'action','text':'  '},
            {'style':'image','text':'<image>bad nesting'}]),'')

    def test_partial_passages_stream_without_machine_fields_or_half_images(self):
        from server import partial_json_string_field
        raw=json.dumps({'reply':[{'style':'action','text':'She waves.'},
            {'style':'dialogue','text':'Hello, "friend".\nWelcome!'},
            {'style':'image','text':'A forest at dawn'}]},ensure_ascii=True)
        for end in range(len(raw)+1):
            visible=chat_format.partial_reply(raw[:end],partial_json_string_field)
            self.assertNotIn('"style":',visible)
            self.assertNotIn('"text":',visible)
            self.assertNotIn('"reply":',visible)
            self.assertEqual(visible.count('<image>'),visible.count('</image>'))
        self.assertEqual(chat_format.partial_reply(raw,partial_json_string_field),
            chat_format.render_reply(json.loads(raw)['reply']))
        partial='{"reply":[{"style":"action","text":"She waves."},{"style":"dialogue","text":"Welcome'
        self.assertEqual(chat_format.partial_reply(partial,partial_json_string_field),'#She waves.#\n\n"Welcome"')

    def test_balanced_nested_reply_needs_no_extra_call(self):
        request=Mock();text='`A letter with *a thought* and **emphasis**.` #An action.#'
        self.assertEqual(chat_format.prepare_reply(text,request,'model'),text);request.assert_not_called()

    def test_formatting_repair_preserves_image_request(self):
        original='#She reads. `A letter. <image>a cat with #123456 fur</image>'
        repaired='#She reads.# `A letter.` <image>a cat with #123456 fur</image>'
        request=Mock(return_value={'message':{'content':json.dumps({'reply':repaired})}})
        self.assertEqual(chat_format.prepare_reply(original,request,'model'),repaired)

    def test_repair_cannot_rewrite_image_prompts(self):
        original='#She reads <image>a cat</image>'
        request=Mock(return_value={'message':{'content':json.dumps({'reply':'#She reads# <image>a dog</image>'})}})
        result=chat_format.prepare_reply(original,request,'model')
        self.assertIn('<image>a cat</image>',result);self.assertNotIn('dog',result);self.assertNotIn('#',result)

    def test_failed_repair_hides_unmatched_markers_and_preserves_escapes(self):
        result=chat_format.prepare_reply('`Text with **emphasis** and \\#literal',Mock(side_effect=OSError('offline')),'model')
        self.assertEqual(result,'Text with **emphasis** and \\#literal')


class ReplyLengthTests(unittest.TestCase):
    def test_sparse_roleplay_expands_once_without_replaying_effects(self):
        longer='I enjoy the careful work. '+('Every piece needs patience and a steady hand. '*18)
        request=Mock(return_value={'message':{'content':json.dumps({'reply':[{'style':'dialogue','text':longer}]})}})
        result=chat_format.develop_short_reply('"I enjoy my work."',[{'message':'What do you enjoy?'}],[],request,'test')
        self.assertGreater(len(result.split()),120)
        self.assertEqual(request.call_count,1)
        self.assertEqual(request.call_args.kwargs['timeout'],30)
        self.assertEqual(request.call_args.args[1]['format']['required'],['reply'])

    def test_long_texting_rules_and_explicit_brief_replies_need_no_expansion(self):
        request=Mock()
        for text,latest in [('"'+('Word '*150)+'"','Hello'),('`On my way.`','`Where are you?`'),
                ('"Yes."','Answer in one sentence.'),('"Oui."','Une phrase, s’il vous plaît.'),
                ('Roll a d20.','How do I roll?'),('"Yes."','OOC: explain that rule briefly.')]:
            self.assertEqual(chat_format.develop_short_reply(text,[{'message':latest}],[],request,'test'),text)
        request.assert_not_called()

    def test_expansion_failure_or_changed_image_keeps_the_original(self):
        original='"Here it is." <image>a cat</image>'
        for request in [Mock(side_effect=TimeoutError('slow')),Mock(return_value={'message':{'content':'invalid'}}),
                Mock(return_value={'message':{'content':json.dumps({'reply':[{'style':'dialogue','text':'Many more words. '*100}]})}})]:
            self.assertEqual(chat_format.develop_short_reply(original,[{'message':'Show me.'}],[],request,'test'),original)
            self.assertEqual(request.call_count,1)


class DeliveryTests(unittest.TestCase):
    def test_written_picture_delivery_is_repaired_to_real_tag(self):
        import chat_art
        history=[{'persona_name':'Steven','message':'`Emma, can you send me a quick pic? I miss you.`'}]
        fixed='`Miss you too.` <image>Emma, casual selfie, use her campaign portrait</image>'
        request=Mock(return_value={'message':{'content':json.dumps({'reply':fixed})}})
        result=chat_format.review_delivery("'Here you go.' #A photo appears on the screen.#",history,'Emma',request,'model')
        self.assertEqual(result,fixed);self.assertEqual(len(chat_art.tags(result)),1)
        self.assertIn('Do NOT add images',request.call_args.args[1]['messages'][0]['content'])
    def test_separate_image_prompt_is_compiled_outside_written_text(self):
        import chat_art
        request=Mock(return_value={'message':{'content':json.dumps({'reply':'`Miss you too 🙂`','written_reply':True,'image_prompt':'Emma, casual selfie using her campaign portrait'})}})
        result=chat_format.review_delivery('Here is a picture.',[{'message':'`Send me a pic?`'}],'Emma',request,'model')
        self.assertIn('🙂',result)
        self.assertEqual(chat_art.tags(result)[0]['prompt'],'Emma, casual selfie using her campaign portrait')
        self.assertTrue(result.startswith('`Miss you too 🙂`\n<image>'))

    def test_correct_delivery_needs_no_rewrite(self):
        request=Mock();history=[{'message':'`Send a photo?`'}]
        reply='`Here you go.` <image>Emma portrait</image>'
        self.assertEqual(chat_format.review_delivery(reply,history,'Emma',request,'model'),reply)
        request.assert_not_called()
    def test_ordinary_conversation_does_not_trigger_picture_repair(self):
        request=Mock();reply='Good morning.'
        self.assertEqual(chat_format.review_delivery(reply,[{'message':'Hello.'}],'Emma',request,'model'),reply)
        request.assert_not_called()
    def test_invalid_review_fails_instead_of_saving_false_delivery(self):
        request=Mock(return_value={'message':{'content':'{"reply":""}'}})
        with self.assertRaises(ValueError):chat_format.review_delivery('Here is the photo.',[{'message':'Send a pic'}],'Emma',request,'model')

if __name__=='__main__':unittest.main()
