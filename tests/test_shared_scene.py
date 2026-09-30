import _bootstrap  # Shared backend import path for tests and previews.
import unittest
import test_campaign_maps as base
import storage,campaign_maps as maps

class SharedSceneTests(unittest.TestCase):
    setUp=base.CampaignMapsTests.setUp
    tearDown=base.CampaignMapsTests.tearDown
    def test_scene_updates_all_maps_and_new_maps_without_changing_objects(self):
        second=maps.create(self.dm,self.c,{'title':'Interior'})['id']
        nodes=[dict(id='table',type='table',x=0,y=0,w=80,h=40)]
        maps.update(self.dm,self.c,second,{'revision':0,'state':{'nodes':nodes}})
        before=maps.get(self.dm,self.c,second)
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'scene':{'time':'Night','weather':'Snow','mood':'Quiet','location':'Village','danger':'Uneasy'}}})
        one=maps.get(self.dm,self.c,self.first);two=maps.get(self.dm,self.c,second)
        self.assertEqual(one['state']['scene'],two['state']['scene']);self.assertEqual(two['state']['nodes'],before['state']['nodes']);self.assertGreater(two['revision'],before['revision'])
        third=maps.create(self.dm,self.c,{'title':'New map'})['id'];self.assertEqual(maps.get(self.dm,self.c,third)['state']['scene'],one['state']['scene'])
        maps.update(self.dm,self.c,second,{'revision':two['revision'],'state':{'scene':{'mood':'Tense'}}})
        self.assertEqual(maps.get(self.dm,self.c,self.first)['state']['scene']['mood'],'Tense')
        self.assertEqual(maps.get(self.dm,self.c,self.first)['state']['scene']['weather'],'Snow')
        with self.assertRaises(FileExistsError):maps.update(self.dm,self.c,self.first,{'revision':one['revision'],'state':{'scene':{'weather':'Rain'}}})

    def test_legacy_controls_and_campaign_isolation(self):
        second=maps.create(self.dm,self.c,{'title':'Second'})['id']
        other=storage.create_work(self.dm,'Another campaign',{'category':'campaign','initial_map_kind':'2d'})['id'];other_map=maps.listing(self.dm,other)['active_map_id'];before=maps.get(self.dm,other,other_map)
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'time':'night','weather':'storm'}})
        state=maps.get(self.dm,self.c,second)['state'];self.assertEqual(state['scene']['weather'],'Storm');self.assertEqual(state['time'],'night')
        self.assertEqual(maps.get(self.dm,other,other_map),before)
        with self.assertRaises(PermissionError):maps.update(self.player,self.c,self.first,{'revision':1,'state':{'scene':{'time':'Day'}}})
