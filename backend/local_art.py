"""Local pixel artwork, isolated from the website and serialized on the GPU."""
from pathlib import Path
from contextlib import ExitStack
import json
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

def model_directory():
    # A copied project or updated model automatically falls back to its installed files.
    try:
        manifest=json.loads((ROOT/'model-cache.json').read_text(encoding='utf-8'))
        directory=Path(manifest['directory'])
        for name in ('diffusion.gguf','encoder.gguf','vae.safetensors'):
            source=(ROOT/name).stat();cached=(directory/name).stat();entry=manifest['files'][name]
            if (source.st_size,source.st_mtime_ns,cached.st_size,cached.st_mtime_ns)!=(entry['source_size'],entry['source_mtime'],entry['cached_size'],entry['cached_mtime']):return ROOT
        return directory
    except (OSError,ValueError,KeyError,TypeError):return ROOT


class ImageMemoryError(ValueError):
    pass


def render(prompt, source=None, size=512, references=None, seed=None):
    if not ready():
        raise ValueError('Local image models are not installed. Run scripts/setup_local_art.py on the server computer first.')
    allowed = {(512,512),(768,768),(1024,1024),(384,512),(512,384),(512,768),(768,512),(768,1024),(1024,768)}
    dimensions = (size, size) if type(size) is int else size
    if not isinstance(dimensions, tuple) or any(type(n) is not int for n in dimensions) or dimensions not in allowed:
        raise ValueError('Choose a supported image size.')
    if seed is not None and (type(seed) is not int or not 0 <= seed < 2**31):
        raise ValueError('Seed must be a whole number from 0 to 2147483647.')
    seed = secrets.randbelow(2**31) if seed is None else seed
    while not GPU.acquire(timeout=1):
        yield {'event': 'status', 'message': 'Waiting for the local image engine…'}
    try:
        try:
            yield from _render_once(prompt, source, dimensions, cpu_vae=False, references=references, seed=seed)
        except ImageMemoryError:
            yield {'event': 'status', 'message': 'GPU memory is tight. Retrying with slower CPU image decoding…'}
            yield from _render_once(prompt, source, dimensions, cpu_vae=True, references=references, seed=seed)
    finally:
        GPU.release()


def _render_once(prompt, source, size, cpu_vae, references=None, seed=None):
    process = None
    try:
        with ExitStack() as cleanup:
            folder = cleanup.enter_context(tempfile.TemporaryDirectory(prefix='job-', dir=ROOT))
            folder = Path(folder)
            output = folder / 'image.png'
            prompt_file = folder / 'prompt.txt'
            prompt_file.write_text(prompt, encoding='utf-8')
            models=model_directory()
            args = [str(ROOT / 'bin/sd-cli.exe'), '--diffusion-model', str(models / 'diffusion.gguf'),
                    '--llm', str(models / 'encoder.gguf'), '--vae', str(models / 'vae.safetensors'),
                    '--prompt-file', str(prompt_file), '--output', str(output), '--width', str(size[0]),
                    '--height', str(size[1]), '--cfg-scale', '1', '--steps', '4', '--sampling-method', 'euler',
                    '--offload-to-cpu', '--backend', 'te=cpu,vae='+('cpu' if cpu_vae else 'cuda0')+',diffusion=cuda0',
                    '--max-vram', '-1', '--diffusion-fa', '--vae-tiling', '--seed', str(seed),
                    '--disable-image-metadata']
            if source: args += ['--ref-image', str(source)]
            for reference in references or []: args += ['--ref-image', str(reference)]
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
            log.flush();log.seek(0)
            (ROOT / 'last-render.log').write_bytes(log.read())
            image = output.read_bytes()
            if not image.startswith(b'\x89PNG\r\n\x1a\n'): raise ValueError('The engine returned an invalid image.')
            yield {'event': 'pixels', 'data': image}
    finally:
        stop_process(process)

def design(prompt, source, size, helpers, stream_ai, use_references=True, transparent_background=True, image_references=None, vision_model=None, style='', shape='square', seed=None, cache_scope=None):
    # Keep normalized reference files alive through rendering and cancellation.
    import art_references
    import art_styles
    dimensions = art_styles.dimensions(size, shape)
    prompt = art_styles.compose(prompt, style)
    if seed is not None and (type(seed) is not int or not 0 <= seed < 2**31):
        raise ValueError('Seed must be a whole number from 0 to 2147483647.')
    seed = secrets.randbelow(2**31) if seed is None else seed
    with tempfile.TemporaryDirectory(prefix='art-references-') as folder:
        paths, descriptions = [], []
        for index, reference in enumerate(image_references or []):
            yield {'event': 'status', 'message': f'Reading reference {index + 1}: {reference["name"]}...'}
            path = art_references.prepare(reference, Path(folder) / f'reference-{index + 1}.png')
            description = art_references.describe_cached(reference, path, prompt, vision_model, stream_ai, cache_scope)
            paths.append(path)
            descriptions.append(f'Reference {index + 1}: {reference["name"]}. User guidance: {reference["note"]}. Observed: {description}')
            yield {'event': 'image_reference', 'index': index, 'name': reference['name'], 'description': description, 'model': vision_model}
        guidance = ''
        if paths:
            guidance = '\nUse the supplied reference images together with these observations. Follow the user request and per-image guidance; do not reproduce a collage or unrelated elements.\n' + '\n'.join(descriptions)
            if source:
                guidance += '\nThe first supplied image is the canvas to edit. Reference 1 onward refers to the subsequent images.'
        yield from _design(prompt + guidance, source, dimensions, helpers, stream_ai, use_references, transparent_background, paths, seed)


def _design(prompt, source, size, helpers, stream_ai, use_references=True, transparent_background=True, reference_paths=None, seed=None):
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
    yield {'event': 'recipe', 'prompt': brief, 'seed': seed, 'width': size[0], 'height': size[1], 'model': 'FLUX.2 Klein 4B Q8', 'transparent_background': transparent_background}
    for event in render(brief, source, size, references=reference_paths, seed=seed):
        if transparent_background and event.get('event') == 'pixels':
            yield {'event': 'status', 'message': 'Removing the background with local AI…'}
            event = {**event, 'data': remove_background(event['data'])}
        yield event
    yield {'event': 'done', 'result_kind': 'image', 'helper_models': used,
           'description': ('Background removed with local AI before adding the transparent PNG. ' if transparent_background else '') + 'Generated locally with FLUX.2 Klein. This is a pixel image layer; you can paint over it or ask for another edit. Undo restores the previous artwork.'}
