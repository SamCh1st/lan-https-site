import _bootstrap  # Shared backend import path for tests and previews.
import copy
import math
import unittest
import spell_composition as C
import spell_reader as R


def sparse_scene():
    def band(radius,count):return dict(x=0,y=0,radius=radius,pattern=['column','convergence','stability','dispersion'],count=count,start=0,sweep=360,rotation=180,size=10)
    return dict(action='composition',symmetry='quarter_turn',boundary=6000,modules=[dict(x=x,y=y,radius=1900,core='none',core_size=50,bands=[band(900,96),band(1600,96)]) for x,y in [(2200,2200),(-2200,2200),(-2200,-2200),(2200,-2200)]],bands=[band(5800,96)],marks=[],strokes=[])


class CompactLayoutTests(unittest.TestCase):
    def test_sparse_layout_packs_same_glyphs_with_readable_size(self):
        sparse=sparse_scene();packed=C.prepare_layout(sparse)
        self.assertLess(packed['boundary'],sparse['boundary']*.4)
        def total(scene):return sum(b['count'] for m in scene['modules'] for b in m['bands'])+sum(b['count'] for b in scene['bands'])
        self.assertEqual(total(sparse),total(packed))
        self.assertTrue(all(b['size']>=22 for m in packed['modules'] for b in m['bands']))
        for m in packed['modules']:
            edge=max(b['radius']+b['size']/math.sqrt(2) for b in m['bands'])
            self.assertAlmostEqual(m['radius']-edge,10)
        for i,m in enumerate(packed['modules']):
            for n in packed['modules'][i+1:]:self.assertGreaterEqual(math.hypot(m['x']-n['x'],m['y']-n['y']),m['radius']+n['radius']+6.9)
        self.assertEqual(sparse,sparse_scene())

    def test_external_modules_keep_connections_after_compaction(self):
        sparse=sparse_scene();sparse['boundary']=1000;sparse['bands']=[]
        packed=C.prepare_layout(sparse)
        self.assertTrue(all(math.hypot(m['x'],m['y'])>packed['boundary'] for m in packed['modules']))
        import spell_designer as D
        nodes=[]
        for op in C.symmetric_operations(C.expand(packed,R.SYMBOLS),4,R.SYMBOLS):D.apply_step(op,nodes)
        import spell_branches
        connected,_=spell_branches.connected(nodes)
        self.assertTrue(all(n['id'] in connected for n in nodes if n['type']=='ring'))

    def test_small_odd_band_does_not_emit_one_symbol_layer(self):
        sparse=sparse_scene();sparse['modules']=sparse['modules'][:1];sparse['modules'][0]['bands']=sparse['modules'][0]['bands'][:1];sparse['modules'][0]['bands'][0]['count']=3
        packed=C.prepare_layout(sparse)
        self.assertTrue(C.expand(packed,R.SYMBOLS))
