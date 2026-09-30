import _bootstrap  # Shared backend import path for tests and previews.
import json,unittest
from unittest.mock import patch
import art_designer as A

class ArtTests(unittest.TestCase):
 def node(self):return dict(type='pen',name='Sack',x=256,y=256,w=180,h=220,angle=0,ink='#443322',fill='#998877',width=3,closed=True,points=[[-70,-80],[60,-70],[80,90],[-80,90]],text='')
 def test_streams_split_tokens(self):
  text=json.dumps(dict(layers=[self.node(),dict(self.node(),name='Flap',fill='#112233')],description='Bag',interpretation='Colors are artistic choices.'))
  def model(*args,**kwargs):
   for i in range(0,len(text),11):yield {'message':{'content':text[i:i+11]}}
   yield {'done':True}
  events=list(A.sketch('bag of holding','test',model,False));layers=[e for e in events if e['event']=='layer'];self.assertEqual(len(layers),2);self.assertTrue(layers[0]['node']['closed']);self.assertEqual(events[-1]['event'],'done')
 def test_canvas_contours_are_not_translated_twice(self):
  value=dict(self.node(),x=342,y=342,points=[[256,256],[408,256],[408,392],[256,392]])
  n=A.layer(value)
  self.assertEqual([[x+n['x'],y+n['y']] for x,y in n['points']],value['points'])
 def test_truncation_and_unsafe_layer(self):
  with self.assertRaises(ValueError):list(A.sketch('orc','test',lambda *a,**k:iter([{'message':{'content':'{"layers":['},'done':True}]),False))
  for bad in [dict(self.node(),type='image'),dict(self.node(),x=float('nan')),dict(self.node(),ink='url(https://example.com)'),dict(self.node(),points=[[0,float('inf')]])]:
   with self.assertRaises(ValueError):A.layer(bad)
 def test_bad_layer_does_not_discard_valid_art(self):
  text=json.dumps(dict(layers=[dict(self.node(),points=[]),self.node()],description='Bag',interpretation=''))
  events=list(A.sketch('bag','test',lambda *a,**k:iter([{'message':{'content':text},'done':True}]),False))
  self.assertEqual(events[-1]['layers'],1)
  self.assertEqual(events[-1]['skipped_layers'],1)
 def test_polygon_is_editable_filled_contour(self):
  n=A.layer(dict(self.node(),type='polygon',closed=False,fill='none'))
  self.assertEqual(n['type'],'pen')
  self.assertTrue(n['closed'])
  self.assertEqual(n['fill'],n['ink'])
 def test_reference_matching(self):
  def fetch(path,hour):
   if path.endswith('/bag-of-holding'):return {'name':'Bag of Holding','desc':['Larger inside.']}
   if path.endswith('/orc'):return {'name':'Orc','size':'Medium','type':'humanoid'}
   return {'results':[{'name':'Bag of Holding','url':'/api/2014/magic-items/bag-of-holding'},{'name':'Orc','url':'/api/2014/monsters/orc'}]} if path.endswith('magic-items') else {'results':[]}
  with patch.object(A,'fetch',side_effect=fetch):
   self.assertEqual(len(A.research('an orc holding a bag of holding')),2)
   self.assertEqual(A.research('an orchard'),[])
 def test_research_unavailable_is_honest(self):
  with patch.object(A,'fetch',side_effect=OSError('offline')):self.assertEqual(A.research('orc'),[])
