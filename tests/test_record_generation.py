import _bootstrap
import json
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import character_memory
import chat_modes
import record_generator
import server
import storage
from test_ai_effects import AIEffectsTests


class DraftTests(unittest.TestCase):
    def generate(self, category='character', mode='modern', names=(), replies=None):
        self.calls = []
        responses = iter(replies or [{'title':'Nadia Park', 'summary':'A city mechanic.',
            'notes':'Repairs bicycles; dislikes waste.', 'core':'Practical, patient, observant.',
            'reminder':'Speak plainly and ask precise questions.', 'owner_user_id':999}])
        def request(path, body, timeout):
            self.calls.append(body)
            return {'message':{'content':json.dumps(next(responses))}}
        return record_generator.generate('A helpful local', category, {'tabletop':{'ruleset':'2024'}}, mode,
            [{'title':n,'content':{'category':'character'}} for n in names], 'model', request,
            server.response_json, server.normalize_character_stats)

    def test_narrative_character_has_guidance_not_generated_dnd_mechanics(self):
        draft = self.generate()
        self.assertEqual(draft['content']['generation_mode'], 'modern')
        self.assertNotIn('character_class', draft['content'])
        self.assertNotIn('owner_user_id', draft['content'])
        self.assertIn('patient', draft['guidance']['core'])
        self.assertIn('Contemporary', self.calls[0]['messages'][0]['content'])
        self.assertEqual(json.loads(self.calls[0]['messages'][1]['content'])['table_rules'], {})

    def test_medieval_npc_keeps_portrayal_in_notes(self):
        draft = self.generate(category='npc', mode='medieval')
        self.assertEqual(draft['content']['category'], 'npc')
        self.assertIn('patient', draft['content']['notes'])
        self.assertIn('preindustrial', self.calls[0]['messages'][0]['content'])

    def test_encounter_has_setting_appropriate_plan(self):
        draft = self.generate(category='encounter')
        self.assertNotIn('guidance', draft)
        self.assertEqual(draft['content']['state'], 'Planned')
        self.assertIn('noncombat', self.calls[0]['messages'][0]['content'])
        self.assertEqual(self.calls[0]['format']['required'], ['title','summary','notes'])

    def test_duplicate_name_repairs_once_and_rejects_repeated_collision(self):
        base = {'title':'LEON-DUMONT', 'summary':'Summary', 'notes':'Notes', 'core':'Core', 'reminder':'Reminder'}
        draft = self.generate(names=['Léon Dumont'], replies=[base, dict(base,title='Maya Chen')])
        self.assertEqual(draft['title'], 'Maya Chen')
        self.assertIn('previous draft reused', self.calls[1]['messages'][1]['content'])
        with self.assertRaisesRegex(ValueError, 'already exists'):
            self.generate(names=['Léon Dumont'], replies=[base, base])

    def test_malformed_guidance_is_repaired_and_uses_current_unsaved_text(self):
        calls = []
        def request(path, body, timeout):
            calls.append(body)
            return {'message':{'content':json.dumps([] if len(calls)==1 else {'core':'Preserved identity','reminder':'Be concise'})}}
        draft = record_generator.guidance({'title':'Léon', 'content':{'summary':'Gray eyes','notes':'Baker'}},
            'medieval','Develop his voice',{'core':'Never lies','reminder':'Quiet'},'model',request,server.response_json)
        self.assertEqual(draft['core'],'Preserved identity')
        self.assertEqual(len(calls),2)
        self.assertEqual(json.loads(calls[0]['messages'][1]['content'])['current_guidance']['core'],'Never lies')
        self.assertIn('Do not invent shared history',calls[0]['messages'][0]['content'])

    def test_dnd_identity_context_does_not_pollute_original_concept(self):
        calls=[]
        def request(path,body,timeout):
            calls.append(body)
            return {'message':{'content':json.dumps({'title':'Mira','content':{'character_class':'Fighter','species':'Human','portrayal':'Patient fighter','reminder':'Measured voice'}})}}
        draft=record_generator.generate('A loyal guard','character',{},'dnd',
            [{'title':'Existing Hero','content':{'category':'character'}}],
            'model',request,server.response_json,server.normalize_character_stats)
        self.assertIn('Existing Hero',calls[0]['messages'][0]['content'])
        self.assertNotIn('Existing Hero',draft['content']['notes'])
        self.assertEqual(draft['guidance']['reminder'],'Measured voice')


class IdentityAndRouteTests(unittest.TestCase):
    setUp = AIEffectsTests.setUp
    tearDown = AIEffectsTests.tearDown
    message = AIEffectsTests.message
    apply = AIEffectsTests.apply

    def create(self, name, category='character', **extra):
        return storage.create_work(self.dm,name,{'category':category,'campaign_id':self.cid,'owner_user_id':self.dm,**extra})

    def test_names_are_shared_across_people_and_normalized(self):
        self.create('Léon Dumont')
        for name in ['LEON DUMONT','Léon-Dumont',' leon  dumont ']:
            with self.assertRaisesRegex(ValueError,'already used'):
                self.create(name,'npc')
        self.create('Léon Dumont','item')
        self.create('Léon Dumont','encounter')
        other = storage.create_work(self.dm,'Other campaign',{'category':'campaign','tabletop':{'ruleset':'custom'}})
        self.create('Léon Dumont',campaign_id=other['id'])

    def test_concurrent_creation_only_saves_one_record(self):
        def attempt(_):
            try:return self.create('Unique Person')['id']
            except ValueError:return None
        with ThreadPoolExecutor(max_workers=2) as pool:
            saved = list(pool.map(attempt, range(2)))
        self.assertEqual(sum(value is not None for value in saved),1)

    def test_rename_conflict_and_own_name_update(self):
        record = self.create('Mira')
        with self.assertRaisesRegex(ValueError,'already used'):
            storage.update_work(self.dm,record['id'],'ELARA',record['content'])
        self.assertTrue(storage.update_work(self.dm,record['id'],'MIRA',dict(record['content'],notes='Updated')))

    def test_initial_guidance_is_saved_atomically_without_learned_memories(self):
        record=self.create('Mira',character_guidance={'core':'Patient','reminder':'Low voice'})
        self.assertNotIn('character_guidance',record['content'])
        state=character_memory.state(self.dm,self.cid,record['id'])
        self.assertEqual(state['profile']['core'],'Patient')
        self.assertEqual(state['profile']['reminder'],'Low voice')
        self.assertEqual(state['memories'],[])
        with patch.object(storage,'normalize_character_grants',side_effect=RuntimeError('rollback')):
            with self.assertRaises(RuntimeError):self.create('Failed',character_guidance={'core':'Never saved'})
        self.assertNotIn('Failed',{r['title'] for r in storage.list_work(self.dm)})

    def test_ai_effects_cannot_recreate_manual_people_or_duplicate_same_reply(self):
        self.create('Mira','npc')
        result=self.apply({'cards':[{'category':'npc','title':n,'character_ids':[]} for n in ['Elara','MIRA','Jalen','Jalen']]})
        self.assertEqual(len(result['warnings']),3)
        self.assertEqual([r['title'] for r in result['cards']],['Jalen'])
        ident=result['cards'][0]['id']
        result=self.apply({'cards':[{'category':'npc','record_id':ident,'title':'Jalen','notes':'Updated','character_ids':[]}]})
        self.assertEqual(result['cards'][0]['id'],ident)
        self.assertEqual(result['warnings'],[])

    def handler(self, uid):
        handler=object.__new__(server.Handler)
        handler.require_user=lambda:{'id':uid}
        self.responses=[]
        handler.send_json=lambda code,body:self.responses.append((code,body))
        handler.ai_model=lambda requested:'model'
        return handler

    def test_generate_uses_chat_style_and_checks_permissions_without_saving(self):
        chat=storage.create_work(self.dm,'Modern chat',{'category':'chat','campaign_id':self.cid,'assigned_user_ids':[self.player],'ai_chat_mode':'modern'})
        handler=self.handler(self.player)
        before=len(storage.list_work(self.dm))
        with patch.object(record_generator,'generate',return_value={'title':'Mira','content':{'category':'character'}}) as generate:
            handler.generate_character({'id':self.player},self.cid,{'prompt':'A mechanic','chat_id':chat['id']})
            self.assertEqual(self.responses[-1][0],200)
            self.assertEqual(generate.call_args.args[3],'modern')
            generate.reset_mock()
            handler.generate_character({'id':self.player},self.cid,{'prompt':'A scene','category':'encounter'})
            self.assertEqual(self.responses[-1][0],403)
            handler.generate_character({'id':self.other},self.cid,{'prompt':'A mechanic','chat_id':chat['id']})
            self.assertEqual(self.responses[-1][0],403)
            generate.assert_not_called()
        self.assertEqual(len(storage.list_work(self.dm)),before)

    def test_guidance_endpoint_uses_style_and_does_not_save(self):
        chat_modes.set_mode(self.dm,self.cid,'medieval')
        handler=self.handler(self.player)
        data={'action':'generate','prompt':'Develop voice','current':{'core':'Unsaved boundary','reminder':'Quiet'}}
        before=character_memory.profile(self.pc['id'])
        with patch.object(record_generator,'guidance',return_value={'core':'Draft','reminder':'Draft reminder'}) as generate:
            handler.character_memory_request(self.cid,self.pc['id'],data)
            self.assertEqual(self.responses[-1][0],200)
            self.assertEqual(generate.call_args.args[1],'medieval')
            self.assertEqual(generate.call_args.args[3],data['current'])
            self.assertEqual(character_memory.profile(self.pc['id']),before)
            generate.reset_mock()
            handler.character_memory_request(self.cid,self.pc2['id'],data)
            self.assertEqual(self.responses[-1][0],403)
            generate.assert_not_called()


if __name__=='__main__':unittest.main()
