import _bootstrap
import tempfile
import io
import unittest
import numpy as np
from PIL import Image
from pathlib import Path
from unittest.mock import Mock, patch
import art_styles
import art_references
import local_art
import background_removal


class GenerationOptionsTests(unittest.TestCase):
    def test_real_cutout_encoding_and_rejection_of_nearly_opaque_mask(self):
        source=io.BytesIO();Image.new('RGB',(320,320),'blue').save(source,'PNG')
        prediction=np.zeros((1,1,320,320),dtype=np.float32)
        prediction[:,:,60:260,60:260]=1
        engine=Mock();engine.get_inputs.return_value=[Mock(name='input')];engine.run.return_value=[prediction]
        with patch.object(background_removal,'session',return_value=engine):
            result=background_removal.remove_background(source.getvalue())
            with Image.open(io.BytesIO(result)) as image:
                self.assertEqual(image.mode,'RGBA');self.assertEqual(image.getpixel((0,0))[3],0);self.assertEqual(image.getpixel((160,160))[3],255)
            prediction[:]=1;prediction[:,:,0,0]=0
            with self.assertRaisesRegex(ValueError,'usable cutout'):
                background_removal.remove_background(source.getvalue())

    def test_cutout_is_enforced_only_when_selected(self):
        for transparent in (False, True):
            captured = []
            def render(prompt, source, size, **kwargs):
                captured.append((prompt, size, kwargs))
                yield {'event': 'pixels', 'data': b'original'}
            with patch.object(local_art, 'ready', return_value=True), patch.object(local_art, 'render', side_effect=render), patch('background_removal.remove_background', return_value=b'transparent') as remove:
                events = list(local_art.design('a knight in a forest', None, 768, [], Mock(), False, transparent,
                                              style='Ink and watercolor illustration', shape='portrait', seed=42))
            self.assertEqual(remove.call_count, int(transparent))
            self.assertEqual('No scenery' in captured[0][0], transparent)
            self.assertIn('translucent washes', captured[0][0])
            self.assertIn('a knight in a forest', captured[0][0])
            self.assertEqual(captured[0][1], (512,768))
            recipe = next(e for e in events if e['event']=='recipe')
            self.assertEqual(recipe['prompt'], captured[0][0])
            self.assertEqual(recipe['seed'], 42)
            self.assertEqual(next(e['data'] for e in events if e['event']=='pixels'), b'transparent' if transparent else b'original')

    def test_failed_cutout_never_publishes_opaque_pixels(self):
        with patch.object(local_art,'ready',return_value=True), patch.object(local_art,'render',return_value=iter([{'event':'pixels','data':b'opaque'}])), patch('background_removal.remove_background',side_effect=ValueError('No usable cutout')):
            received=[]
            with self.assertRaisesRegex(ValueError,'cutout'):
                for event in local_art.design('cat',None,512,[],Mock(),False,True):
                    received.append(event)
            self.assertFalse(any(e['event']=='pixels' for e in received))

    def test_invalid_options_do_not_start_engine(self):
        for options in ({'shape':'unknown'},{'shape':[]},{'seed':True},{'seed':-1},{'seed':2**31},{'style':'unknown'}):
            with patch.object(local_art,'render') as render:
                with self.assertRaises(ValueError):
                    list(local_art.design('cat',None,512,[],Mock(),False,False,**options))
                render.assert_not_called()

    def test_reference_cache_is_scoped_and_invalidated_by_inputs(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(art_references,'describe',return_value='A blue cat') as describe:
            path=Path(folder)/'reference.png';path.write_bytes(b'pixels')
            reference={'name':'Cat','note':'identity'}
            art_references._descriptions.clear()
            def read(scope=1,prompt='cat'):
                return art_references.describe_cached(reference,path,prompt,'vision',Mock(),scope)
            self.assertEqual(read(),'A blue cat');read();self.assertEqual(describe.call_count,1)
            read(scope=2);read(prompt='dog');reference['note']='style';read();path.write_bytes(b'changed');read()
            self.assertEqual(describe.call_count,5)
            with patch.object(art_references.time,'monotonic',return_value=10**12):read()
            self.assertEqual(describe.call_count,6)
            art_references._descriptions.clear()

    def test_memory_retry_keeps_seed_and_dimensions(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(local_art,'ROOT',Path(folder)),patch.object(local_art,'ready',return_value=True),patch.object(local_art.subprocess,'Popen') as start:
            def run(args,**kwargs):
                if start.call_count==1:
                    kwargs['stdout'].write(b'out of memory');kwargs['stdout'].flush()
                    return Mock(poll=Mock(return_value=1),returncode=1)
                Path(args[args.index('--output')+1]).write_bytes(b'\x89PNG\r\n\x1a\nresult')
                return Mock(poll=Mock(return_value=0),returncode=0)
            start.side_effect=run
            list(local_art.render('cat',size=(768,1024),seed=81))
            self.assertEqual(start.call_count,2)
            for call in start.call_args_list:
                args=call.args[0]
                self.assertEqual(args[args.index('--seed')+1],'81')
                self.assertEqual(args[args.index('--width')+1],'768')
                self.assertEqual(args[args.index('--height')+1],'1024')
