"""Install the local foreground-removal model and a private CPU runtime."""
import hashlib
import subprocess
import sys
import urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent/'local-art'
def main():
    ROOT.mkdir(exist_ok=True)
    subprocess.run([sys.executable,'-m','pip','install','--target',str(ROOT/'background-runtime'),'onnxruntime==1.30.0','pillow==12.3.0','numpy==2.5.3'],check=True)
    model=ROOT/'u2net.onnx'
    if model.exists() and hashlib.md5(model.read_bytes()).hexdigest()=='60024c5c889badc19c04ad937298a77b':return
    temporary=model.with_suffix('.download')
    urllib.request.urlretrieve('https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx',temporary)
    if hashlib.md5(temporary.read_bytes()).hexdigest()!='60024c5c889badc19c04ad937298a77b':raise ValueError('Background model checksum mismatch.')
    temporary.replace(model)
    print('Local background removal ready.')
if __name__=='__main__':main()
