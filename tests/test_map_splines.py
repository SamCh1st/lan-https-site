import _bootstrap  # Shared backend import path for tests and previews.
import copy
import unittest
import test_campaign_maps as base
import campaign_maps as maps

class MapSplineTests(unittest.TestCase):
    setUp=base.CampaignMapsTests.setUp
    tearDown=base.CampaignMapsTests.tearDown
    def test_spline_settings_persist_and_validate(self):
        node=dict(id='wall-spline',type='wall',x=0,y=0,w=176,h=96,shape='stroke',points=[[8,8],[168,88]],brush=16,baseW=176,baseH=96,spline_kind='wall',spline_points=[[8,8],[168,88]],spline_base_w=176,spline_base_h=96,spline_width=16,spline_curve=False,spline_texture='stone',texture_scale=.5,building_details=True)
        maps.update(self.dm,self.c,self.first,dict(revision=0,state=dict(nodes=[node])))
        saved=maps.get(self.dm,self.c,self.first)['state']['nodes'][0]
        self.assertEqual(saved['spline_points'],node['spline_points']);self.assertEqual(saved['texture_scale'],.5)
        for update in [dict(spline_points=[[0,0]]),dict(spline_points=[[0,0],[float('nan'),0]]),dict(spline_base_w=0),dict(spline_width=321),dict(spline_texture='missing'),dict(spline_curve='yes'),dict(spline_flow=3),dict(texture_scale=0),dict(building_details='yes')]:
            invalid=copy.deepcopy(node);invalid.update(update)
            with self.assertRaises(ValueError): maps.clean_patch(dict(nodes=[invalid]))

if __name__=='__main__': unittest.main()
