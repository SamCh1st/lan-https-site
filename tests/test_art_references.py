import _bootstrap
import base64
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from PIL import Image
import art_references
import local_art

class ReferenceTests(unittest.TestCase):
    def test_authorization_and_limits(self):
        with patch.object(art_references.storage, 'get_visible_upload', return_value=None):
            with self.assertRaisesRegex(ValueError, 'access'):
                art_references.resolve(1, [{'image_id': 42}])
        for values in ({}, [{'image_id': True}], [{'image_id': 1}] * 4):
            with self.assertRaises(ValueError): art_references.resolve(1, values)

    def test_shared_visible_image_and_bounded_notes(self):
        with patch.object(art_references.storage, 'get_visible_upload', return_value=(Path('shared.png'), 'image/png')) as access:
            result = art_references.resolve(5, [{'image_id': 7, 'note': 'x' * 800}])
        access.assert_called_once_with(5, 7)
        self.assertEqual(len(result[0]['note']), 500)

    def test_model_selection_checks_vision_capability(self):
        def request(path, payload=None, **kwargs):
            if path == '/api/tags': return {'models': [{'name': 'text'}, {'name': 'vision'}]}
            return {'capabilities': ['vision'] if payload['model'] == 'vision' else ['completion']}
        self.assertEqual(art_references.choose_model(request, ['text']), 'vision')
        with self.assertRaisesRegex(ValueError, 'vision model'):
            art_references.choose_model(lambda *a, **k: {'models': []}, [])

    def test_images_and_descriptions_reach_generator_in_order(self):
        with tempfile.TemporaryDirectory() as folder:
            original = Path(folder) / 'original.png'
            Image.new('RGBA', (1800, 900), (255, 0, 0, 128)).save(original)
            reference = {'path': original, 'name': 'Armor', 'note': 'Use the red metal'}
            def stream(path, payload, **kwargs):
                raw = base64.b64decode(payload['messages'][1]['images'][0])
                self.assertTrue(raw.startswith(b'\x89PNG'))
                self.assertIn('red metal', payload['messages'][1]['content'])
                yield {'message': {'content': 'Red armor with rounded plates.'}, 'done': True}
            def render(prompt, source, size, references=None):
                self.assertIn('rounded plates', prompt)
                self.assertIn('Use the red metal', prompt)
                self.assertIn('a knight', prompt)
                self.assertEqual(source, Path('canvas.png'))
                self.assertEqual(len(references), 1)
                with Image.open(references[0]) as image: self.assertEqual(image.size, (1024, 512))
                self.reference_path = references[0]
                yield {'event': 'pixels', 'data': b'result'}
            with patch.object(local_art, 'ready', return_value=True), patch.object(local_art, 'render', side_effect=render):
                events = list(local_art.design('a knight', Path('canvas.png'), 512, [], stream, False, False, [reference], 'vision'))
            self.assertTrue(any(e['event'] == 'image_reference' for e in events))
            self.assertFalse(self.reference_path.exists())

    def test_failed_analysis_never_starts_rendering(self):
        with tempfile.TemporaryDirectory() as folder:
            original = Path(folder) / 'original.png'; Image.new('RGB', (2, 2)).save(original)
            with patch.object(local_art, 'render') as render:
                with self.assertRaisesRegex(ValueError, 'finish reading'):
                    list(local_art.design('cat', None, 512, [], lambda *a, **k: (part for part in []), False, False,
                                         [{'path': original, 'name': 'Cat', 'note': ''}], 'vision'))
                render.assert_not_called()

    def test_engine_receives_canvas_then_all_references(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(local_art, 'ROOT', Path(folder)), patch.object(local_art, 'ready', return_value=True), patch.object(local_art.subprocess, 'Popen') as start:
            def run(args, **kwargs):
                paths = [args[i + 1] for i, value in enumerate(args) if value == '--ref-image']
                self.assertEqual(paths, ['canvas.png', 'first.png', 'second.png'])
                Path(args[args.index('--output') + 1]).write_bytes(b'\x89PNG\r\n\x1a\nresult')
                return Mock(poll=Mock(return_value=0), returncode=0)
            start.side_effect = run
            list(local_art.render('test', 'canvas.png', 512, ['first.png', 'second.png']))

    def test_cancellation_cleans_normalized_reference(self):
        with tempfile.TemporaryDirectory() as folder:
            original = Path(folder) / 'original.png'; Image.new('RGB', (2, 2)).save(original)
            reference = {'path': original, 'name': 'Cat', 'note': ''}
            paths = []
            def describe(reference, path, *args):
                paths.append(path)
                return 'A cat'
            with patch.object(art_references, 'describe', side_effect=describe):
                events = local_art.design('cat', None, 512, [], Mock(), False, False, [reference], 'vision')
                next(events); next(events)
                self.assertTrue(paths[0].exists())
                events.close()
                self.assertFalse(paths[0].exists())

    def test_route_passes_authorized_references_to_generation(self):
        import io
        import server
        handler = server.Handler.__new__(server.Handler)
        handler.headers = {}; handler.wfile = io.BytesIO()
        for name in ('send_json', 'send_response', 'send_header', 'end_headers'):
            setattr(handler, name, Mock())
        reference = {'path': Path('shared.png'), 'name': 'Armor', 'note': ''}
        with patch.object(server.storage, 'campaign_record', return_value={'content': {}}), patch.object(server.storage, 'campaign_role', return_value='member'), patch.object(art_references, 'resolve', return_value=[reference]), patch.object(art_references, 'choose_model', return_value='vision'), patch.object(local_art, 'ready', return_value=True), patch.object(local_art, 'design', return_value=(e for e in [])) as design:
            handler.design_art({'id': 5}, 2, {'prompt': 'knight', 'renderer': 'local-image', 'image_references': [{'image_id': 42}]})
        self.assertEqual(design.call_args.kwargs['image_references'], [reference])
        self.assertEqual(design.call_args.kwargs['vision_model'], 'vision')
