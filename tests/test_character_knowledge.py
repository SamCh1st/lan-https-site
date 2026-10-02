import _bootstrap
import json
import io
import unittest
from unittest.mock import Mock, patch

import character_knowledge
import character_research
import chat_generation
import record_generator
import server
from portrayal_fixtures import portrayal
import character_portrayal


class ReferenceTests(unittest.TestCase):
    def test_product_model_numbers_are_part_of_reference_relevance(self):
        response = {'query':{'pages':[
            {'title':'IPhone 18 Pro','extract':'A different model.'},
            {'title':'IPhone 15 Pro','extract':'The requested model.'}]}}
        opener = Mock()
        opener.open.return_value = io.BytesIO(json.dumps(response).encode())
        character_research.lookup.cache_clear()
        with patch.object(character_research.urllib.request,'build_opener',return_value=opener):
            sources = character_research.lookup('iPhone 15 Pro camera features',0)
        self.assertEqual([s['title'] for s in sources],['IPhone 15 Pro'])
        character_research.lookup.cache_clear()

    def test_modern_research_includes_relevant_real_product_as_third_topic(self):
        request = Mock(return_value={'message':{'content':json.dumps({'queries':
            ['Urban sketching','Bristol','iPhone 15 Pro']})}})
        with patch.object(character_research, 'lookup', return_value=[]) as lookup:
            report = character_research.research('modern', 'An urban sketcher with an iPhone 15 Pro', 'model', request)
        self.assertEqual([call.args[0] for call in lookup.call_args_list],
                         ['Urban sketching','Bristol','iPhone 15 Pro'])
        self.assertEqual(report['unavailable_queries'], report['queries'])

    def test_malformed_reference_response_is_unavailable_not_a_generation_failure(self):
        opener = Mock()
        opener.open.return_value = io.BytesIO(b'{"query":null}')
        character_research.lookup.cache_clear()
        with patch.object(character_research.urllib.request, 'build_opener', return_value=opener):
            self.assertEqual(character_research.lookup('Pottery', 0), [])
        character_research.lookup.cache_clear()

    def test_lookup_rejects_unrelated_article_instead_of_claiming_it_as_evidence(self):
        response = {'query': {'pages': [
            {'index':1,'title':'Levantine pottery','extract':'Ancient regional pottery.'},
            {'index':2,'title':'Pottery','extract':'Ceramic craft.'},
            {'index':3,'title':'Leeds','extract':'York is also mentioned here.'}]}}
        character_research.lookup.cache_clear()
        opener = Mock()
        opener.open.return_value = io.BytesIO(json.dumps(response).encode())
        with patch.object(character_research.urllib.request, 'build_opener', return_value=opener):
            sources = character_research.lookup('York pottery suppliers', 0)
        self.assertEqual([s['title'] for s in sources], ['Pottery'])
        self.assertTrue(opener.open.call_args.args[0].full_url.startswith('https://en.wikipedia.org/w/api.php?'))
        character_research.lookup.cache_clear()

    def test_similarly_named_place_is_not_substituted(self):
        wrong = {'query': {'pages': [{'title':'North York City Centre','extract':'In Toronto.'}]}}
        right = {'query': {'pages': [{'title':'York','extract':'A city in England.'}]}}
        opener = Mock()
        opener.open.side_effect = [io.BytesIO(json.dumps(wrong).encode()), io.BytesIO(json.dumps(right).encode())]
        character_research.lookup.cache_clear()
        with patch.object(character_research.urllib.request, 'build_opener', return_value=opener):
            sources = character_research.lookup('York city centre housing', 0)
        self.assertEqual([s['title'] for s in sources], ['York'])
        character_research.lookup.cache_clear()

    def test_template_copy_is_repaired_before_becoming_portrayal(self):
        bad = {'core':'{"appearance":"Brown hair"}', 'reminder':'Core is stable appearance guidance.'}
        good = {'core':portrayal('Nadia is patient with beginners and blunt about wasted materials.'),
                'reminder':'Speak plainly; ask practical questions before giving advice.'}
        request = Mock(side_effect=[{'message':{'content':json.dumps(bad)}},
                                    {'message':{'content':json.dumps(good)}}])
        result = record_generator.guidance({'title':'Nadia','content':{}},'modern','Develop voice',{},
            'model',request,server.response_json)
        self.assertEqual(result, dict(good, core=character_portrayal.render(good['core'], 'Nadia')))
        self.assertEqual(request.call_count, 2)

    def test_retrieval_matches_tradition_place_and_mode_without_copying_dossiers(self):
        context = character_knowledge.context('modern', 'A selkie repair worker in Orkney')
        self.assertIn('N13.3 Selkie', context)
        self.assertIn('Orkney', context)
        self.assertIn('N02.', context)
        self.assertNotIn('N16.2 Iona', context)
        self.assertLess(len(context), 15500)
        self.assertIn('M01.', character_knowledge.context('medieval', 'A tenant farmer in York'))
        self.assertIn('D03.', character_knowledge.context('dnd', 'A dwarf fighter'))

    def test_chat_retrieves_voice_guidance_not_entire_library(self):
        context = character_knowledge.context('modern', 'A Toronto electrician', purpose='chat')
        self.assertIn('N07.', context)
        self.assertIn('N09.1 Toronto', context)
        self.assertIn('not conversation history', context)
        self.assertLess(len(context), 10000)

    def test_missing_guides_do_not_break_generation(self):
        with patch.object(character_knowledge, '_chunks', side_effect=OSError):
            self.assertEqual(character_knowledge.context('modern'), '')

    def test_every_generation_researches_before_drafting_and_keeps_sources(self):
        calls = []
        source = {'title':'Electrician','url':'https://en.wikipedia.org/wiki/Electrician',
                  'notes':'An electrician works with electrical wiring.', 'retrieved':'2026-10-01'}
        def request(path, payload, **kwargs):
            calls.append(payload)
            if payload['format']['required'] == ['queries']:
                answer = {'queries':['Electrician', 'Toronto']}
            else:
                self.assertIn('ACTIVE RESEARCH RESULTS', payload['messages'][0]['content'])
                self.assertIn(source['notes'], payload['messages'][0]['content'])
                self.assertIn('N02.', payload['messages'][0]['content'])
                answer = {'title':'Morgan','summary':'An electrician.','notes':'Collects maps.',
                          'core':portrayal('Sociable, careful at work.'),'reminder':'Use concrete examples.'}
            return {'message':{'content':json.dumps(answer)}}
        with patch.object(character_research, 'lookup', return_value=[source]) as lookup:
            draft = record_generator.generate('An electrician in Toronto', 'character', {}, 'modern', [],
                'model', request, server.response_json, server.normalize_character_stats)
        self.assertEqual([call.args[0] for call in lookup.call_args_list], ['Electrician', 'Toronto'])
        self.assertEqual(len(calls), 2)
        self.assertIn(source['url'], draft['content']['notes'])
        self.assertEqual(len(draft['research']['sources']), 1)

    def test_failed_planner_still_attempts_research_and_offline_status_is_honest(self):
        with patch.object(character_research, 'lookup', side_effect=OSError('offline')) as lookup:
            report = character_research.research('medieval', 'A potter', 'model', Mock(side_effect=TimeoutError))
        lookup.assert_called_once()
        self.assertEqual(lookup.call_args.args[0], 'Middle Ages')
        self.assertTrue(report['unavailable_queries'])
        draft = character_research.annotate({'content':{'notes':'An original potter.'}}, report)
        self.assertIn('no usable online reference', draft['content']['notes'])

    def test_only_public_topics_reach_fixed_lookup(self):
        request = Mock(return_value={'message':{'content':json.dumps({'queries':['http://127.0.0.1/secret', 'Pottery']})}})
        with patch.object(character_research, 'lookup', return_value=[]) as lookup:
            character_research.research('modern', 'Concept', 'model', request)
        self.assertEqual(lookup.call_args.args[0], 'Pottery')
        self.assertEqual(lookup.call_count, 1)


class SpeakerTests(unittest.TestCase):
    def test_other_ai_characters_are_not_the_selected_assistant(self):
        evelyn = {'role':'assistant','persona_type':'character','persona_id':11}
        jasper = {'role':'assistant','persona_type':'character','persona_id':12}
        dm = {'role':'assistant','persona_type':'dm','persona_id':None}
        self.assertEqual(chat_generation.history_role(evelyn, 'character', 12), 'user')
        self.assertEqual(chat_generation.history_role(jasper, 'character', 12), 'assistant')
        self.assertEqual(chat_generation.history_role(dm, 'character', 12), 'user')
        self.assertEqual(chat_generation.history_role(jasper, 'dm'), 'user')
        self.assertEqual(chat_generation.history_role(dm, 'dm'), 'assistant')
        self.assertEqual(chat_generation.history_role(dict(jasper, role='user'), 'character', 12), 'user')


if __name__ == '__main__':
    unittest.main()
