"""Copy installed model weights to a faster local disk, verifying every copy."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
ROOT=Path(__file__).resolve().parent.parent/'local-art'
FILES=('diffusion.gguf','encoder.gguf','vae.safetensors')

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as handle:
        while chunk:=handle.read(8*1024*1024):h.update(chunk)
    return h.hexdigest()

def main():
    default=Path(os.environ.get('LOCALAPPDATA',Path.home()/'.cache'))/'InHouseDnD'/'image-model-cache'
    destination=Path(sys.argv[1]).expanduser().resolve() if len(sys.argv)>1 else default.resolve()
    if destination==ROOT.resolve():raise ValueError('Choose a different disk directory for the cache.')
    destination.mkdir(parents=True,exist_ok=True)
    required=sum((ROOT/name).stat().st_size for name in FILES)
    if shutil.disk_usage(destination).free<required+2*1024**3:raise ValueError('Not enough space for the model cache and a 2 GB reserve.')
    entries={}
    for name in FILES:
        source=ROOT/name;target=destination/name;before=source.stat()
        print('Caching '+name,flush=True)
        partial=destination/(name+'.partial')
        h=hashlib.sha256()
        with source.open('rb') as src,partial.open('wb') as dst:
            while chunk:=src.read(8*1024*1024):dst.write(chunk);h.update(chunk)
        if source.stat().st_mtime_ns!=before.st_mtime_ns or digest(partial)!=h.hexdigest():raise ValueError('Model changed or copy failed verification: '+name)
        shutil.move(str(partial),str(target));cached=target.stat()
        entries[name]={'source_size':before.st_size,'source_mtime':before.st_mtime_ns,'cached_size':cached.st_size,'cached_mtime':cached.st_mtime_ns,'sha256':h.hexdigest()}
    manifest={'directory':str(destination),'files':entries}
    temp=ROOT/'model-cache.json.partial';temp.write_text(json.dumps(manifest),encoding='utf-8');temp.replace(ROOT/'model-cache.json')
    print('Verified model cache ready: '+str(destination),flush=True)

if __name__=='__main__':main()
