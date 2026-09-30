import _bootstrap  # Shared backend import path for tests and previews.
import copy
import json
import unittest
from unittest.mock import patch
import spell_designer as D
import spell_reader as R
import spell_release


class ReleaseTests(unittest.TestCase):
    def drawing(self):
        return [dict(id='sr',type='ring',x=0,y=0,w=600,h=600,rotation=0),
                dict(id='sf',type='fire',x=0,y=0,w=60,h=60,rotation=0),
                dict(id='ss',type='convergence',x=0,y=-180,w=50,h=50,rotation=180)]

    def test_only_outward_requests_are_corrected(self):
        for prompt in ['implosion', 'contain an explosion', 'non-explosive light', 'compress before an explosion', 'water orb', 'contain a bomb', 'no bombs', 'non-explosive bomb prop']:
            nodes=self.drawing();before=copy.deepcopy(nodes)
            self.assertEqual(spell_release.correct(nodes,prompt),[])
            self.assertEqual(nodes,before)
        for prompt in ['a fire explosion', 'atomic bomb', 'bomb spell', 'a shockwave', 'volcanic eruption']:
            with self.subTest(prompt=prompt):
                nodes=self.drawing()
                events=spell_release.correct(nodes,prompt)
                self.assertEqual(nodes[-1]['type'],'expansion')
                self.assertEqual(nodes[-1]['rotation'],0)
                self.assertEqual(events[-1]['node'],nodes[-1])

    def test_streamed_drawing_matches_final_corrected_nodes(self):
        steps=[dict(n,action='add',preserve_layout=True) for n in self.drawing()]
        plan=dict(steps=steps,name='Explosion',limitations=[])
        def model(*args,**kwargs):
            yield dict(message=dict(content=json.dumps(plan)),done=True)
        with patch.object(R,'references',return_value=('Reference','cached')):
            events=list(D.design('Atomic bomb spell','test',model))
        drawn={}
        for event in events:
            if event['event']=='step':drawn[event['node']['id']]=copy.deepcopy(event['node'])
        self.assertEqual(list(drawn.values()),events[-1]['nodes'])
        self.assertEqual(drawn['ss']['type'],'expansion')
