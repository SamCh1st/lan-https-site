"""Site-wide audio folders, independent of accounts and campaigns."""
from pathlib import Path
from urllib.parse import quote
import re
import uuid

ROOT = Path(__file__).resolve().parent.parent / 'data' / 'audio'
FOLDERS = ('Music', 'Background Music', 'Ambient Music', 'Ambient Sounds',
           'Creature Sounds', 'Battle Sounds', 'Reward Sounds', 'Other Sounds')
MAX_BYTES = 100 * 1024 * 1024


def folders():
    ROOT.mkdir(parents=True, exist_ok=True)
    for name in FOLDERS:
        (ROOT / name).mkdir(exist_ok=True)
    return [p for p in sorted(ROOT.iterdir(), key=lambda p: p.name.casefold())
            if p.is_dir() and not p.is_symlink()]


def folder(name):
    return next((p for p in folders() if p.name == name), None)


def track(path):
    return {'name': path.name, 'url': '/api/audio/file?folder=' + quote(path.parent.name)
            + '&name=' + quote(path.name)}


def listing():
    return {'folders': [{'name': p.name, 'tracks': [track(f) for f in
            sorted(p.iterdir(), key=lambda f: f.name.casefold())
            if f.is_file() and not f.is_symlink() and f.suffix.lower() == '.mp3']}
            for p in folders()]}


def save(name, filename, body):
    target = folder(name)
    if target is None:
        raise ValueError('Choose an existing audio folder.')
    if not filename.lower().endswith('.mp3') or not body or len(body) > MAX_BYTES:
        raise ValueError('Choose an MP3 up to 100 MB.')
    if not (body.startswith(b'ID3') or (len(body) > 1 and body[0] == 255 and body[1] & 224 == 224)):
        raise ValueError('This file does not appear to be an MP3.')
    filename = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', filename).strip(' .')[:180]
    stem = Path(filename).stem.rstrip(' .') or 'Audio'
    filename = stem + '.mp3'
    while True:
        path = target / filename
        try:
            with path.open('xb') as stream:
                stream.write(body)
            return track(path)
        except FileExistsError:
            filename = stem + ' (' + uuid.uuid4().hex[:8] + ').mp3'
