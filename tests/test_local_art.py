import _bootstrap  # Shared backend import path for tests and previews.
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
import local_art
import server

class LocalArtTests(unittest.TestCase):
    def handler(self):
        h=server.Handler.__new__(server.Handler)
        for name in ('send_json','send_response','send_header','end_headers'): setattr(h,name,Mock())
        h.ai_model=Mock(side_effect=ValueError('Ollama offline'));h.wfile=io.BytesIO()
        return h

    def test_own_reference_required(self):
        h=self.handler()
        with patch.object(server.storage,'campaign_record',return_value={'content':{}}),patch.object(server.storage,'campaign_role',return_value='member'),patch.object(server.storage,'get_upload',return_value=None) as get:
            h.design_art({'id':5},2,{'prompt':'edit','renderer':'local-image','edit':True,'source_image_id':7})
        get.assert_called_once_with(5,7);self.assertEqual(h.send_json.call_args.args[0],400)

    def test_images_work_without_ollama_and_store_owned_output(self):
        h=self.handler()
        with patch.object(server.storage,'campaign_record',return_value={'content':{}}),patch.object(server.storage,'campaign_role',return_value='member'),patch.object(local_art,'ready',return_value=True),patch.object(local_art,'design',return_value=(e for e in [{'event':'pixels','data':b'png'},{'event':'done'}])),patch.object(server.storage,'save_upload',return_value=42) as save:
            h.design_art({'id':5},2,{'prompt':'cat','renderer':'local-image','research':False})
        save.assert_called_once_with(5,b'png','.png','image/png')
        events=[json.loads(line) for line in h.wfile.getvalue().splitlines()]
        self.assertEqual(events[0],{'event':'image','image_id':42})

    def test_cancellation_terminates_before_temp_cleanup_and_releases_gpu(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(local_art,'ROOT',Path(folder)),patch.object(local_art,'ready',return_value=True),patch.object(local_art.time,'sleep'),patch.object(local_art.subprocess,'Popen') as start:
            proc=start.return_value;proc.poll.return_value=None
            events=local_art.render('cat',size=512)
            next(events);next(events);events.close()
            args=start.call_args.args[0]
            self.assertEqual(args[args.index('--backend')+1],'te=cpu,vae=cuda0,diffusion=cuda0')
            self.assertEqual(args[args.index('--max-vram')+1],'-1')
            proc.terminate.assert_called();proc.wait.assert_called()
            self.assertFalse(list(Path(folder).iterdir()))
            self.assertTrue(local_art.GPU.acquire(blocking=False));local_art.GPU.release()

    def test_bad_size_does_not_start_process(self):
        with patch.object(local_art,'ready',return_value=True),patch.object(local_art.subprocess,'Popen') as start:
            with self.assertRaises(ValueError):list(local_art.render('cat',size=1))
            start.assert_not_called()

    def test_memory_failure_is_actionable_and_preserves_diagnostics(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(local_art,'ROOT',Path(folder)),patch.object(local_art,'ready',return_value=True),patch.object(local_art.subprocess,'Popen') as start:
            def failed(*args,**kwargs):
                kwargs['stdout'].write(b'model manager cannot make enough memory available on CUDA0')
                kwargs['stdout'].flush()
                return Mock(poll=Mock(return_value=1),returncode=1)
            start.side_effect=failed
            with self.assertRaisesRegex(ValueError,'try 512 pixels'):
                list(local_art.render('cat',size=1024))
            self.assertEqual(start.call_count,2)
            self.assertIn('CUDA0',(Path(folder)/'last-error.log').read_text())
            self.assertTrue(local_art.GPU.acquire(blocking=False));local_art.GPU.release()

    def test_gpu_memory_failure_retries_cpu_and_returns_image(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(local_art,'ROOT',Path(folder)),patch.object(local_art,'ready',return_value=True),patch.object(local_art.subprocess,'Popen') as start:
            png=b'\x89PNG\r\n\x1a\nresult'
            def run(args,**kwargs):
                backend=args[args.index('--backend')+1]
                if 'vae=cuda0' in backend:
                    kwargs['stdout'].write(b'workspace capacity check failed')
                    kwargs['stdout'].flush()
                    return Mock(poll=Mock(return_value=1),returncode=1)
                Path(args[args.index('--output')+1]).write_bytes(png)
                return Mock(poll=Mock(return_value=0),returncode=0)
            start.side_effect=run
            events=list(local_art.render('cat',size=512))
            self.assertEqual(start.call_count,2)
            self.assertEqual([e['data'] for e in events if e['event']=='pixels'],[png])
            self.assertTrue(any('Retrying' in e.get('message','') for e in events))
            self.assertFalse(list(Path(folder).glob('job-*')))
            self.assertTrue(local_art.GPU.acquire(blocking=False));local_art.GPU.release()

    def test_fast_default_skips_ollama_and_helpers_but_opt_in_works(self):
        for enabled in (False,True):
            h=self.handler()
            with patch.object(server.storage,'campaign_record',return_value={'content':{'ai_helper_models':['helper']}}),patch.object(server.storage,'campaign_role',return_value='member'),patch.object(local_art,'ready',return_value=True),patch.object(server,'ollama_models',return_value=['helper']) as models,patch.object(local_art,'design',return_value=(e for e in [])) as design:
                h.design_art({'id':5},2,{'prompt':'cat','renderer':'local-image','use_helpers':enabled})
            h.ai_model.assert_not_called()
            self.assertEqual(models.call_count,int(enabled))
            self.assertEqual(design.call_args.args[2],512)
            self.assertEqual(design.call_args.args[3],['helper'] if enabled else [])
            self.assertFalse(design.call_args.args[5])
