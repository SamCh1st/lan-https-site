import _bootstrap
import json
import unittest
from unittest.mock import Mock
import chat_format


class ChatFormatTests(unittest.TestCase):
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
