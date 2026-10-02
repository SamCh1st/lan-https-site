import _bootstrap  # Shared backend import path for tests and previews.
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import character_generator
import server
from portrayal_fixtures import portrayal

class CharacterGenerationTests(unittest.TestCase):
    def test_starting_fighter_hp_and_review_notes(self):
        raw={'title':'Harold Grandalf','content':{'character_class':'Fighter','species':'Dwarf','character_level':1,'constitution':14,'hp_max':26,'subclass':'Battle Master'}}
        raw['content']['portrayal'] = portrayal()
        draft=character_generator.generate('A dwarf knight',{'tabletop':{'ruleset':'2024'}},'model',lambda *a,**k:{'message':{'content':json.dumps(raw)}},server.response_json,server.normalize_character_stats)
        self.assertEqual(draft['content']['hp_max'],13)
        self.assertEqual(draft['content']['hp_current'],13)
        self.assertEqual(draft['content']['hit_die'],'d10')
        self.assertEqual(draft['content']['subclass'],'')
        self.assertIn('does not grant Action Surge',draft['content']['notes'])

    def test_alternate_model_shapes(self):
        for raw in [
            {'name':'Harold Grandalf','class':'Paladin','race':'Dwarf','level':1},
            {'character':{'name':'Harold Grandalf','class':'Paladin','race':'Dwarf'}},
            {'content':{'name':'Harold Grandalf','character_class':'Paladin','species':'Dwarf'}},
        ]:
            title, source = character_generator.unpack_draft(raw)
            self.assertEqual(title, 'Harold Grandalf')
            self.assertEqual(source['character_class'], 'Paladin')
            self.assertEqual(source['species'], 'Dwarf')

    def test_repairs_bad_response_once_and_preserves_concept(self):
        calls=[]
        def request(path, body, timeout):
            calls.append(body)
            self.assertIsInstance(body['format'],dict)
            self.assertEqual(body['format']['required'],['title','content'])
            raw = {'reply':'A dwarf knight'} if len(calls)==1 else {'title':'Harold Grandalf','content':{'character_class':'Paladin','species':'Dwarf'}}
            if 'content' in raw: raw['content']['portrayal'] = portrayal()
            return {'message':{'content':json.dumps(raw)}}
        draft=character_generator.generate('Harold Grandalf, a 62 year old dwarf knight.',{},'model',request,server.response_json,server.normalize_character_stats)
        self.assertEqual(len(calls),2)
        self.assertEqual(draft['title'],'Harold Grandalf')
        self.assertIn('62 year old dwarf knight',draft['content']['notes'])
        self.assertEqual(len(calls[1]['messages']),4)

    def test_draft_fields_resources_and_privileged_fields(self):
        payload={'title':'Mira','content':{'owner_user_id':999,'campaign_id':99,'image_id':42,'player_visible':True,'character_level':5,'dexterity':16,'wisdom':14,'hp_max':30,'character_class':'Wizard','tabletop':{'skill_perception':2,'slot_1_max':4,'slot_1_remaining':99,'condition_poisoned':True,'spell_ability':'intelligence','unknown':'ignore'}}}
        payload['content']['portrayal'] = portrayal()
        def request(path, body, timeout):
            self.assertEqual(path,'/api/chat')
            self.assertEqual(body['model'],'test-model')
            self.assertEqual(json.loads(body['messages'][1]['content'])['concept'],'An elven wizard')
            return {'message':{'content':json.dumps(payload)}}
        draft=character_generator.generate('An elven wizard',{'tabletop':{'ruleset':'2024','advancement':'milestone'}},'test-model',request,server.response_json,server.normalize_character_stats)
        c=draft['content']
        self.assertEqual(c['hp_current'],30)
        self.assertEqual(c['initiative'],3)
        self.assertEqual(c['passive_perception'],18)
        self.assertEqual(c['tabletop']['slot_1_remaining'],4)
        self.assertFalse(set(c)&{'owner_user_id','campaign_id','image_id','player_visible'})
        self.assertNotIn('condition_poisoned',c['tabletop'])
        self.assertNotIn('unknown',c['tabletop'])

    def test_unusable_response(self):
        with self.assertRaises(ValueError):
            character_generator.generate('A wizard',{},'model',lambda *a,**k:{'message':{'content':'{"reply":"hello"}'}},server.response_json,server.normalize_character_stats)

    def test_endpoint_permission_validation_and_no_save(self):
        handler=object.__new__(server.Handler)
        results=[]
        handler.send_json=lambda code,body:results.append((code,body))
        with patch.object(server.storage,'campaign_record',return_value=None), patch.object(server,'ollama_request') as request:
            handler.generate_character({'id':1},7,{'prompt':'Wizard'})
            self.assertEqual(results[-1][0],403)
            request.assert_not_called()
        campaign={'content':{'ai_dm':True,'ai_model':'test-model'}}
        with patch.object(server.storage,'campaign_record',return_value=campaign),patch.object(server.Handler,'ai_model',return_value='test-model'),patch.object(server.storage,'create_work') as save:
            handler.generate_character({'id':1},7,{'prompt':' '})
            self.assertEqual(results[-1][0],400)
            with patch.object(server.character_generator,'generate',return_value={'title':'Mira','content':{'category':'character'}}):
                handler.generate_character({'id':1},7,{'prompt':'Wizard'})
                self.assertEqual(results[-1][0],200)
            with patch.object(server.character_generator,'generate',side_effect=TimeoutError('Model timed out')):
                handler.generate_character({'id':1},7,{'prompt':'Wizard'})
                self.assertEqual(results[-1][0],503)
            save.assert_not_called()

if __name__=='__main__':unittest.main()
