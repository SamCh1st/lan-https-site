"""Local pixel artwork, isolated from the website and serialized on the GPU."""
from pathlib import Path
from contextlib import ExitStack
import secrets
import subprocess
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parent.parent / 'local-art'
GPU = threading.Lock()

def stop_process(process):
    if process and process.poll() is None:
        process.terminate()
        try: process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()

def ready():
    return all((ROOT / p).is_file() for p in ('bin/sd-cli.exe', 'diffusion.gguf', 'encoder.gguf', 'vae.safetensors'))

class ImageMemoryError(ValueError):
    pass


def render(prompt, source=None, size=512):
    if not ready():
        raise ValueError('Local image models are not installed. Run scripts/setup_local_art.py on the server computer first.')
    if size not in (512, 768, 1024):
        raise ValueError('Choose a supported image size.')
    while not GPU.acquire(timeout=1):
        yield {'event': 'status', 'message': 'Waiting for the local image engine…'}
    try:
        try:
            yield from _render_once(prompt, source, size, cpu_vae=False)
        except ImageMemoryError:
            yield {'event': 'status', 'message': 'GPU memory is tight. Retrying with slower CPU image decoding…'}
            yield from _render_once(prompt, source, size, cpu_vae=True)
    finally:
        GPU.release()


def _render_once(prompt, source, size, cpu_vae):
    process = None
    try:
        with ExitStack() as cleanup:
            folder = cleanup.enter_context(tempfile.TemporaryDirectory(prefix='job-', dir=ROOT))
            folder = Path(folder)
            output = folder / 'image.png'
            prompt_file = folder / 'prompt.txt'
            prompt_file.write_text(prompt, encoding='utf-8')
            args = [str(ROOT / 'bin/sd-cli.exe'), '--diffusion-model', str(ROOT / 'diffusion.gguf'),
                    '--llm', str(ROOT / 'encoder.gguf'), '--vae', str(ROOT / 'vae.safetensors'),
                    '--prompt-file', str(prompt_file), '--output', str(output), '--width', str(size),
                    '--height', str(size), '--cfg-scale', '1', '--steps', '4', '--sampling-method', 'euler',
                    '--offload-to-cpu', '--backend', 'te=cpu,vae='+('cpu' if cpu_vae else 'cuda0')+',diffusion=cuda0',
                    '--max-vram', '-1', '--diffusion-fa', '--vae-tiling', '--seed', str(secrets.randbelow(2**31)),
                    '--disable-image-metadata']
            if source: args += ['--ref-image', str(source)]
            yield {'event': 'status', 'message': 'Loading local image model (CPU text encoding, '+('CPU' if cpu_vae else 'GPU')+' image decoding)…'}
            log = cleanup.enter_context((folder / 'engine.log').open('w+b'))
            process = subprocess.Popen(args, stdout=log, stderr=subprocess.STDOUT,
                                       creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            cleanup.callback(stop_process, process)
            started = time.monotonic()
            while process.poll() is None:
                time.sleep(1)
                yield {'event': 'status', 'message': f'Local image engine working · {int(time.monotonic()-started)} seconds. Loading and rendering can take several minutes.'}
            if process.returncode:
                log.seek(0)
                detail = log.read().decode('utf-8', errors='replace')
                # Keep diagnostics locally; never claim a failed generation succeeded.
                (ROOT / 'last-error.log').write_text(detail, encoding='utf-8')
                if any(message in detail.lower() for message in ('out of memory', 'cannot make enough memory', 'workspace capacity check')):
                    raise ImageMemoryError('The image engine ran out of available memory. Stop other GPU-heavy tasks or try 512 pixels, then retry. Details: local-art/last-error.log. Your artwork is unchanged.')
                raise ValueError('Local image generation failed. See local-art/last-error.log on the server computer. Your artwork is unchanged.')
            if not output.is_file(): raise ValueError('The local engine did not produce an image.')
            image = output.read_bytes()
            if not image.startswith(b'\x89PNG\r\n\x1a\n'): raise ValueError('The engine returned an invalid image.')
            yield {'event': 'pixels', 'data': image}
    finally:
        stop_process(process)

def design(prompt, source, size, helpers, stream_ai, use_references=True, transparent_background=True):
    import art_designer
    if not ready(): raise ValueError('Local image model setup is not complete yet. Run scripts/setup_local_art.py on the server computer.')
    sources = []
    if use_references:
        yield {'event': 'status', 'message': 'Looking up optional D&D references…'}
        sources = art_designer.research(prompt)
        yield {'event': 'references', 'sources': sources, 'message': 'Reference lookup complete.'}
    brief = prompt
    if source:
        brief = 'Edit the supplied image: ' + prompt + '. Preserve everything unrelated to this change, including composition, identity and art style.'
    if sources: brief += '\nOptional appearance references: ' + str(sources)[:3500]
    used = []
    for helper in helpers:
        yield {'event': 'status', 'message': 'Local helper '+helper+' is preparing visual advice…'}
        stream = None
        try:
            stream = stream_ai('/api/chat', {'model': helper, 'stream': True, 'think': False, 'keep_alive': 0,
                'options': {'num_predict': 180, 'num_ctx': 4096}, 'messages': [
                    {'role': 'system', 'content': 'Give at most 80 words of concrete visual advice for an image model. Respect the exact request and subject; do not assume D&D, a portrait or a bag. For an edit, do not invent unrelated changes. No claims of completed work.'},
                    {'role': 'user', 'content': brief}]}, timeout=45)
            reply = ''
            for part in stream: reply += part.get('message', {}).get('content', '')
            if reply.strip():
                brief += '\nOptional visual advice: ' + reply[:800]
                used.append(helper)
        except (OSError, ValueError):
            yield {'event': 'status', 'message': 'Helper unavailable; continuing with your original request.'}
        finally:
            if stream is not None: stream.close()
    if transparent_background:
        from background_removal import PROMPT, remove_background
        brief += '\nOutput requirements: ' + PROMPT
    for event in render(brief, source, size):
        if transparent_background and event.get('event') == 'pixels':
            yield {'event': 'status', 'message': 'Removing the background with local AI…'}
            event = {**event, 'data': remove_background(event['data'])}
        yield event
    yield {'event': 'done', 'result_kind': 'image', 'helper_models': used,
           'description': ('Background removed with local AI before adding the transparent PNG. ' if transparent_background else '') + 'Generated locally with FLUX.2 Klein. This is a pixel image layer; you can paint over it or ask for another edit. Undo restores the previous artwork.'}
