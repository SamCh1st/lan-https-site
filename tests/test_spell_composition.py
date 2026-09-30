import _bootstrap  # Shared backend import path for tests and previews.
import json
import unittest
from unittest.mock import patch
import spell_composition as C
import spell_designer as D
import spell_reader as R
from composition_fixture import scene


class CompositionTests(unittest.TestCase):
    def test_detail_targets_expand_mixed_motifs_without_adding_sources(self):
        for target in (600,900):
            detailed,changed=C.refine_density(scene(),target,R.SYMBOLS)
            self.assertTrue(changed)
            nodes=[n for n in C.symmetric_operations(C.expand(detailed,R.SYMBOLS),2,R.SYMBOLS) if n['action']=='add']
            self.assertGreaterEqual(len(nodes),target*.8)
            self.assertLessEqual(len(nodes),1200)
            self.assertEqual(len(detailed['modules']),len(scene()['modules']))
            import math
            for band in detailed['bands']+[b for m in detailed['modules'] for b in m['bands']]:
                self.assertGreaterEqual(math.radians(abs(band['sweep']))*band['radius']/band['count'],15.9)

    def test_large_reader_input_keeps_every_component_in_groups(self):
        nodes=[dict(id='s0',type='ring',x=0,y=0,w=10000,h=10000,rotation=0)]+[dict(id='s'+str(i+1),type='column',x=(i%30-15)*40,y=(i//30-15)*40,w=20,h=20,rotation=i%360) for i in range(900)]
        context=R.reading_input(R.geometry(nodes))
        self.assertEqual(sum(len(group[-1]) for group in context['node_groups']),901)
        self.assertEqual(len({row[0] for group in context['node_groups'] for row in group[-1]}),901)

    def test_model_band_dimensions_are_recovered_before_streaming(self):
        draft=scene()
        for band in draft['bands']+[b for m in draft['modules'] for b in m['bands']]:
            band.update(radius='0',sweep=0,start=None,rotation=720,size=-12,count='8')
            del band['x'];del band['y']
        def model(path,payload,timeout):
            yield {'message':{'content':json.dumps(dict(steps=[draft],name='Recovered dimensions',limitations=[]))},'done':True}
        with patch.object(R,'references',return_value=('reference','cached')):
            events=list(D.design('Complex seal','test',model,detail='detailed'))
        self.assertEqual(events[-1]['event'],'done')
        self.assertTrue(events[-1]['nodes'])
        self.assertFalse(any(n['type']=='openRing' for n in events[-1]['nodes']))

    def test_band_partial_arcs_preserve_direction_and_reject_nonfinite_values(self):
        draft=scene();draft['modules'][0]['bands'][0].update(sweep=-180,start=0,count=3)
        self.assertTrue(C.expand(draft,R.SYMBOLS))
        draft['modules'][0]['bands'][0]['radius']=float('nan')
        with self.assertRaisesRegex(ValueError,'Band radius must be a finite number'):C.expand(draft,R.SYMBOLS)

    def test_circles_allow_no_core_and_remove_extra_directly_owned_elements(self):
        draft=scene();draft['modules'][0]['core']='none'
        nodes=[]
        for operation in C.expand(draft,R.SYMBOLS):D.apply_step(operation,nodes)
        measured=R.geometry(nodes)
        first=next(n for n in measured['nodes'] if n['type']=='ring' and n['x']==-280)
        self.assertFalse(any(n['group']=='sigil' and n.get('nearest_ring')==first['id'] for n in measured['nodes']))
        ops=[dict(action='add',id='s0',type='openRing',x=0,y=0,w=600,h=600,rotation=0),dict(action='add',id='s1',type='fire',x=90,y=0,w=40,h=40,rotation=0),dict(action='add',id='s2',type='water',x=0,y=90,w=40,h=40,rotation=0)]
        final=C.symmetric_operations(ops,2,R.SYMBOLS)
        sigils=[n for n in final if n.get('type') in ('fire','water')]
        self.assertEqual(len(sigils),1)
        self.assertEqual((sigils[0]['x'],sigils[0]['y']),(0,0))

    def test_quadrant_symmetry_rotates_whole_motifs_and_keeps_nested_circles(self):
        ops=[dict(action='add',id='s0',type='openRing',x=0,y=0,w=400,h=400,rotation=0),dict(action='add',id='s1',type='openRing',x=0,y=0,w=180,h=180,rotation=0),dict(action='add',id='s2',type='column',x=70,y=20,w=25,h=30,rotation=15)]
        result=C.symmetric_operations(ops,4)
        rings=[n for n in result if n.get('type')=='openRing']
        self.assertEqual(len(rings),2)
        signs=[n for n in result if n.get('type')=='column']
        self.assertEqual(len(signs),4)
        self.assertEqual({n['rotation'] for n in signs},{15,105,195,285})
        self.assertAlmostEqual(sum(n['x'] for n in signs),0)
        self.assertAlmostEqual(sum(n['y'] for n in signs),0)

    def test_unavailable_helper_preserves_and_repairs_lead_draft(self):
        draft=scene();draft['modules']=draft['modules'][:1];draft['modules'][0]['bands']=[];draft['bands']=[]
        def model(path,payload,timeout):
            if payload['model']=='offline':raise OSError('Model unavailable')
            yield {'message':{'content':json.dumps(dict(steps=[draft],name='Recovered',limitations=[]))},'done':True}
        with patch.object(R,'references',return_value=('reference','cached')):
            events=list(D.design('An orb','lead',model,detail='detailed',helper_models=['offline']))
        self.assertEqual(events[-1]['event'],'done')
        self.assertTrue(any(n['type']=='levitation' for n in events[-1]['nodes']))
        self.assertTrue(any('unavailable' in s for s in events[-1]['summary']['limitations']))

    def test_repeated_bad_bands_recover_with_configured_helper(self):
        draft=scene();draft['modules']=draft['modules'][:1];draft['modules'][0]['bands']=[];draft['bands']=[]
        calls=[]
        def model(path,payload,timeout):
            calls.append(payload['model'])
            yield {'message':{'content':json.dumps(dict(steps=[draft],name='Recovered',limitations=[]))},'done':True}
        with patch.object(R,'references',return_value=('reference','cached')):
            events=list(D.design('A floating orb','lead',model,detail='detailed',helper_models=['helper']))
        self.assertEqual(calls,['lead','helper'])
        result=events[-1]
        self.assertEqual(result['event'],'done')
        self.assertTrue(any(n['type']=='levitation' for n in result['nodes']))
        self.assertIn('helper',result['summary']['helper_models'])
        self.assertTrue(any('proposed instruction' in note for note in result['summary']['limitations']))
        self.assertFalse(any(n['type']=='openRing' for n in result['nodes']))

    def test_exterior_sign_loses_connection_when_branch_moves(self):
        nodes=[dict(id='s0',type='ring',x=0,y=0,w=200,h=200,rotation=0),dict(id='s1',type='column',x=300,y=0,w=40,h=40,rotation=0),dict(id='s2',type='stroke',x=200,y=0,w=200,h=10,rotation=0,points=[[-50,0],[50,0]],closed=False)]
        self.assertFalse(R.geometry(nodes)['structural_issues'])
        nodes[-1]['y']=200
        self.assertTrue(any('outside' in error for error in R.geometry(nodes)['structural_issues']))

    def test_sparse_detailed_plan_is_retried_before_any_drawing(self):
        small=scene();small['modules']=small['modules'][:1];small['modules'][0]['bands']=[];small['bands']=[]
        calls=[]
        def model(path,payload,timeout):
            calls.append(1)
            yield {'message':{'content':json.dumps(dict(steps=[small if len(calls)==1 else scene()],name='Full layout',limitations=[]))},'done':True}
        with patch.object(R,'references',return_value=('reference','cached')):
            events=list(D.design('A complex spell','test',model,detail='detailed'))
        self.assertEqual(len(calls),2)
        self.assertGreaterEqual(len(events[-1]['nodes']),60)
        self.assertTrue(any('before drawing' in e.get('message','') for e in events))
        self.assertEqual(sum(e.get('action')=='add' for e in events),len(events[-1]['nodes']))

    def test_rectangular_frame_becomes_circle_and_entire_layout_is_paired(self):
        draft=scene();draft['boundary']=60
        draft['strokes'].append(dict(points=[[-400,-250],[400,-250],[400,250],[-400,250]],closed=True))
        fixed=C.circular_layout(draft)
        self.assertEqual(fixed['boundary'],400)
        self.assertEqual(len(fixed['strokes']),len(draft['strokes'])-1)
        nodes=[]
        for operation in C.symmetric_operations(C.expand(fixed,R.SYMBOLS)):D.apply_step(operation,nodes)
        self.assertLessEqual(len(nodes),1200)
        self.assertEqual((nodes[0]['type'],nodes[0]['w'],nodes[0]['h']),('ring',800,800))
        for n in nodes:
            if abs(n['x'])<.001 and abs(n['y'])<.001:continue
            opposite=[p for p in nodes if p['type']==n['type'] and abs(p['x']+n['x'])<.001 and abs(p['y']+n['y'])<.001 and p['w']==n['w'] and p['h']==n['h']]
            self.assertTrue(opposite,n)
            if n['type']!='ring':self.assertTrue(any(abs((p['rotation']-n['rotation'])%360-180)<.001 for p in opposite))

    def test_main_ring_is_required_and_branches_connect_offset_subseals(self):
        draft=scene();draft['boundary']=0
        nodes=[]
        for operation in D.expand_step(draft):D.apply_step(operation,nodes)
        main=nodes[0]
        self.assertEqual((main['type'],main['x'],main['y']),('ring',0,0))
        import spell_branches
        connected,main_id=spell_branches.connected(nodes)
        self.assertEqual(main_id,main['id'])
        self.assertEqual(main['w'],120)
        for n in nodes[1:]:
            if R.SYMBOLS[n['type']][0] in ('ring','sign'):self.assertIn(n['id'],connected)
        self.assertEqual(C.schema(R.SYMBOLS)['properties']['boundary']['minimum'],60)

    def test_element_bands_are_retried_and_schema_only_allows_signs(self):
        bad=scene()
        for b in bad['bands']+[b for m in bad['modules'] for b in m['bands']]:b['pattern']=['fire','water']
        calls=[]
        def model(path,payload,timeout):
            calls.append(1)
            yield {'message':{'content':json.dumps(dict(steps=[bad if len(calls)==1 else scene()],name='Signs',limitations=[]))},'done':True}
        with patch.object(R,'references',return_value=('reference','cached')):
            events=list(D.design('Complex spell','test',model,detail='detailed'))
        self.assertEqual(len(calls),2)
        self.assertTrue(any(R.SYMBOLS[n['type']][0]=='sign' for n in events[-1]['nodes']))
        allowed=C.schema(R.SYMBOLS)['properties']['bands']['items']['properties']['pattern']['items']['enum']
        self.assertTrue(allowed)
        self.assertTrue(all(R.SYMBOLS[k][0]=='sign' for k in allowed))

    def test_undersized_boundaries_expand_without_moving_symbols(self):
        draft=scene()
        draft['boundary']=80
        draft['modules'][0]['core_size']=500
        draft['modules'][0]['radius']=60
        nodes=[]
        for operation in D.expand_step(draft):D.apply_step(operation,nodes)
        self.assertFalse(R.geometry(nodes)['structural_issues'])
        self.assertEqual(nodes[0]['w'],160)
        core=next(n for n in nodes if n['type']=='water')
        self.assertEqual((core['x'],core['y']),(-280,0))

    def test_scene_has_distinct_subseals_mixed_sequences_and_strokes(self):
        nodes=[]
        for step in D.expand_step(scene(True)):
            D.apply_step(step,nodes)
        self.assertEqual(len(nodes),325)
        self.assertEqual(len({(n['x'],n['y']) for n in nodes if n['type']=='ring'}),9)
        self.assertTrue(any(n['type']=='stroke' and len(n['points'])>=2 for n in nodes))
        self.assertFalse(R.geometry(nodes)['structural_issues'])
        # Every planned location survives; fitting must not move intentional motifs.
        plan=C.expand(scene(),R.SYMBOLS)
        result=[]
        for op in plan:D.apply_step(op,result)
        for expected,actual in zip([p for p in plan if p['action']=='add'],result):
            self.assertAlmostEqual(expected['x'],actual['x'],places=3)
            self.assertAlmostEqual(expected['y'],actual['y'],places=3)

    def test_composition_limit_and_invalid_strokes(self):
        invalid=scene(True)
        invalid['bands']*=8
        with self.assertRaisesRegex(ValueError,'1200'):C.expand(invalid,R.SYMBOLS)
        invalid=scene();invalid['strokes'][0]['points']=[[0,float('nan')],[1,1]]
        with self.assertRaises(ValueError):C.expand(invalid,R.SYMBOLS)

    def test_large_geometry_and_custom_points_survive_reader(self):
        node=dict(id='s1',type='stroke',x=0,y=0,w=9000,h=3000,rotation=20,points=[[-50,-50],[0,20],[50,50]],closed=False)
        measured=R.geometry([node])
        self.assertEqual(measured['nodes'][0]['points'],node['points'])
        self.assertEqual(R.reading_input(measured)['custom_strokes'][0]['points'],node['points'])
