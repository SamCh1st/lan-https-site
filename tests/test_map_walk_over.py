import _bootstrap  # Shared backend import path for tests and previews.
import unittest
import test_campaign_maps as base
import campaign_maps as maps
from map_part_catalog import validate


class WalkOverTests(unittest.TestCase):
    setUp = base.CampaignMapsTests.setUp
    tearDown = base.CampaignMapsTests.tearDown

    def test_part_setting_persists_and_requires_a_boolean(self):
        node = dict(id='table', type='table', x=40, y=0, w=40, h=40)
        for value in (None, False, True):
            if value is not None:
                node['walk_over'] = value
            revision = maps.get(self.dm, self.c, self.first)['revision']
            maps.update(self.dm, self.c, self.first, dict(revision=revision, state=dict(nodes=[node])))
            saved = maps.get(self.dm, self.c, self.first)['state']['nodes'][0]
            self.assertEqual(saved.get('walk_over', True), value if value is not None else True)
        for value in ('false', 0, None):
            revision = maps.get(self.dm, self.c, self.first)['revision']
            with self.assertRaises(ValueError):
                maps.update(self.dm, self.c, self.first, dict(revision=revision, state=dict(nodes=[dict(node, walk_over=value)])))

    def test_archive_template_defaults_and_validation(self):
        content = dict(category='map_part', part_type='table', part_group='furniture')
        validate(content)
        self.assertIs(content['walk_over'], True)
        content['walk_over'] = False
        validate(content)
        self.assertIs(content['walk_over'], False)
        content['walk_over'] = 'false'
        with self.assertRaises(ValueError):
            validate(content)
