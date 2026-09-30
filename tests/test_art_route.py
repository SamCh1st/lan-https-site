import _bootstrap  # Shared backend import path for tests and previews.
import io,json,unittest
from unittest.mock import patch,Mock
import server

class ArtRouteTests(unittest.TestCase):
 def handler(self):
  h=server.Handler.__new__(server.Handler);h.send_json=Mock();h.send_response=Mock();h.send_header=Mock();h.end_headers=Mock();h.ai_model=Mock(return_value='campaign-model');h.wfile=io.BytesIO();return h
 def test_nonmember_cannot_generate(self):
  h=self.handler()
  with patch.object(server.storage,'campaign_record',return_value=None):h.design_art({'id':1},2,{'prompt':'orc'})
  self.assertEqual(h.send_json.call_args.args[0],403);h.ai_model.assert_not_called()
 def test_uses_campaign_model_and_streams(self):
  h=self.handler()
  with patch.object(server.storage,'campaign_record',return_value={'content':{'ai_model':'chosen'}}),patch.object(server.storage,'campaign_role',return_value='member'),patch.object(server.art_designer,'design',return_value=iter([])):
   # Real endpoint closes generator; supply a generator for the streaming contract.
   with patch.object(server.art_designer,'design',return_value=(e for e in [{'event':'done','layers':1}])) as design:
    h.design_art({'id':1},2,{'prompt':'orc','research':False})
    self.assertEqual(design.call_args.args[1],'campaign-model');self.assertFalse(design.call_args.args[3])
  h.ai_model.assert_called_once_with('chosen');self.assertEqual(json.loads(h.wfile.getvalue())['event'],'done')
