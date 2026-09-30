"""Install the project's local image engine; no accounts or paid services."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent / 'local-art'

def metadata(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)

def download(url, target, expected=None):
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and (not expected or digest(target) == expected):
        return target
    print('Downloading ' + target.name, flush=True)
    partial = target.with_suffix(target.suffix + '.part')
    with urllib.request.urlopen(url, timeout=120) as r, partial.open('wb') as out:
        while chunk := r.read(4 * 1024 * 1024):
            out.write(chunk)
    if expected and digest(partial) != expected:
        raise ValueError('Checksum mismatch: ' + target.name)
    partial.replace(target)
    print('Ready: ' + target.name, flush=True)
    return target

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        while chunk := f.read(4 * 1024 * 1024): h.update(chunk)
    return h.hexdigest()

def model(repo, filename, name):
    info = metadata('https://huggingface.co/api/models/' + repo + '?blobs=true')
    entry = next(x for x in info['siblings'] if x['rfilename'] == filename)
    return download('https://huggingface.co/' + repo + '/resolve/' + info['sha'] + '/' + filename,
                    ROOT / name, entry.get('lfs', {}).get('sha256'))

def main():
    release = metadata('https://api.github.com/repos/leejet/stable-diffusion.cpp/releases/tags/master-881-17860c0')
    assets = [a for a in release['assets'] if a['name'] in (
        'cudart-sd-bin-win-cu12-x64.zip', 'sd-master-17860c0-bin-win-cuda12-x64.zip')]
    for a in assets:
        archive = download(a['browser_download_url'], ROOT / a['name'], a['digest'].split(':')[-1])
        with zipfile.ZipFile(archive) as z:
            # Flatten the official release into one private runtime directory.
            for item in z.infolist():
                if not item.is_dir():
                    path = ROOT / 'bin' / Path(item.filename).name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(z.read(item))
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        tasks = [pool.submit(model, *args) for args in [
            ('leejet/FLUX.2-klein-4B-GGUF', 'flux-2-klein-4b-Q8_0.gguf', 'diffusion.gguf'),
            ('unsloth/Qwen3-4B-GGUF', 'Qwen3-4B-Q8_0.gguf', 'encoder.gguf'),
            ('Comfy-Org/flux2-klein-4B', 'split_files/vae/flux2-vae.safetensors', 'vae.safetensors')]]
        for task in tasks: task.result()
    import setup_background_removal
    setup_background_removal.main()
    print('Local artwork setup complete.', flush=True)

if __name__ == '__main__': main()
