import _bootstrap  # Shared backend import path for tests and previews.
import http.client
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import audio_library
from server import Handler, ThreadingHTTPServer


class AudioTests(unittest.TestCase):
    def test_shared_import_and_stream(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(audio_library, 'ROOT', Path(directory)), patch.object(Handler, 'current_user', return_value={'id': 1}):
            server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            client = http.client.HTTPConnection('127.0.0.1', server.server_port)
            def request(method, url, body=None, headers={}):
                client.request(method, url, body, headers)
                response = client.getresponse()
                return response.status, response.read(), response.headers
            try:
                body = b'ID3' + bytes(100)
                status, result, _ = request('POST', '/api/audio/import?folder=Music&name=theme.mp3', body)
                self.assertEqual(status, 201)
                url = json.loads(result)['url']
                with patch.object(Handler, 'current_user', return_value={'id': 2}):
                    status, result, _ = request('GET', '/api/audio')
                    self.assertIn('theme.mp3', result.decode())
                status, result, headers = request('GET', url, headers={'Range': 'bytes=3-12'})
                self.assertEqual((status, result), (206, body[3:13]))
                self.assertEqual(headers['Content-Range'], 'bytes 3-12/103')
                self.assertEqual(request('GET', url, headers={'Range': 'bytes=500-'})[0], 416)
                self.assertEqual(request('GET', '/api/audio/file?folder=Music&name=../server.py')[0], 404)
                self.assertEqual(request('POST', '/api/audio/import?folder=Music&name=bad.mp3', b'not audio')[0], 400)
                self.assertEqual(request('POST', '/api/audio/import?folder=Music&name=theme.mp3', body)[0], 201)
                self.assertEqual(len(list((Path(directory) / 'Music').glob('*.mp3'))), 2)
                with patch.object(Handler, 'current_user', return_value=None):
                    self.assertEqual(request('POST', '/api/audio/import?folder=Music&name=theme.mp3', body)[0], 401)
            finally:
                client.close()
                server.shutdown()
                server.server_close()


if __name__ == '__main__':
    unittest.main()
