import _bootstrap  # Shared backend import path for tests and previews.
import unittest,json,copy
import art_editor as E
import art_composer as C

class EditTests(unittest.TestCase):
 def layers(self):return E.context(C.render('purple-skinned orc warrior',{})[0])
 def test_bigger_tusks_targets_only_existing_tusks(self):
  layers=self.layers();events=list(E.edit('bigger tusks','main',lambda *a,**k: self.fail('unnecessary generation'),layers))
  op=events[-2]['operations'][0]
  self.assertEqual([layers[i]['name'] for i in op['targets']],['Left tusk','Right tusk']);self.assertEqual(op['anchor'],'bottom');self.assertEqual(op['factor'],1.4)
 def test_unsafe_and_unsupported_edits_preserve_drawing(self):
  layers=self.layers();layers[0]['locked']=True
  for ops in [[],[{'action':'remove','targets':[0]}],[{'action':'scale','targets':[9999]}],[{'action':'scale','targets':[1],'factor':float('nan')}]]:
   with self.assertRaises(ValueError):E.validate(ops,layers)
 def test_replace_tusks_with_horns_keeps_other_layers(self):
  layers=self.layers();targets=[n['index'] for n in layers if 'tusk' in n['name'].lower()]
  ops=E.validate([{'action':'remove','targets':targets},{'action':'add_part','part':'horns','targets':[]}],layers)
  self.assertEqual(len(ops[1]['nodes']),2);self.assertEqual(ops[1]['nodes'][0]['name'],'Left horn')
 def test_helper_is_used_without_new_drawing(self):
  def model(*a,**k):yield {'message':{'content':json.dumps({'operations':[{'action':'scale','targets':[n['index'] for n in self.layers() if 'tusk' in n['name'].lower()],'factor':1.4,'anchor':'bottom'}]})},'done':True}
  events=list(E.edit('bigger tusks','main',model,self.layers(),['helper']))
  self.assertEqual(events[-1]['helper_models'],['helper']);self.assertFalse(any(e['event']=='layer' for e in events))
