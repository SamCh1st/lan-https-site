import _bootstrap  # Shared backend import path for tests and previews.
import json,unittest,math
import art_composer as C
import art_designer as A

class ComposedTests(unittest.TestCase):
 def test_portrait_and_bag_have_curves_colors_and_facial_parts(self):
  nodes,c=C.render('purple-skinned orc warrior with breastplate and a bag',{})
  self.assertEqual(c['skin'],'#8958a6')
  for name in ['Left tusk','Right tusk','Eye white','Hair silhouette','Breastplate']:
   self.assertTrue(any(n['name']==name for n in nodes),name)
  self.assertGreater(len({n['fill'] for n in nodes if n['fill']!='none'}),8)
  self.assertGreater(max(len(n['points']) for n in nodes),60)
  for n in nodes:
   self.assertTrue(all(math.isfinite(v) for p in n['points'] for v in p))
  bag,c=C.render('bag of holding',{})
  self.assertTrue(any(n['name']=='Rounded leather body' for n in bag))
  self.assertGreater(len(bag),30)
 def test_helper_reviews_actual_direction_and_bad_helper_keeps_it(self):
  called=[]
  def model(path,payload,timeout):
   called.append(payload['model'])
   if payload['model']=='broken':raise OSError('offline')
   yield {'message':{'content':json.dumps({'skin':'#a060c0' if payload['model']=='helper' else '#778855'})},'done':True}
  events=list(A.design('orc portrait','main',model,False,['helper','broken','main']))
  self.assertEqual(called,['main','helper','broken'])
  self.assertEqual(events[-1]['helper_models'],['helper'])
  face=next(e['node'] for e in events if e['event']=='layer' and e['node']['name']=='Face silhouette')
  self.assertEqual(face['fill'],'#a060c0')
  self.assertNotIn('realistic painting',events[-1]['description'])
 def test_completed_description_ignores_model_boasts(self):
  def model(*a,**k):yield {'message':{'content':json.dumps({'description':'Photorealistic masterpiece','skin':'#778855'})},'done':True}
  done=list(A.design('orc','main',model,False))[-1]
  self.assertNotIn('masterpiece',done['description'])
  self.assertEqual(done['result_kind'],'composed')
 def test_explicit_skin_color_wins_over_helper(self):
  self.assertEqual(C.direction('purple-skinned orc',{'skin':'#00ff00'})['skin'],'#8958a6')
