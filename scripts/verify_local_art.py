"""Render a real local image and verify foreground removal after installation."""
import io
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from PIL import Image
import local_art


def main():
    started = time.monotonic()
    last_status = 0
    verified = False
    output = local_art.ROOT / 'setup-check.png'
    events = local_art.design(
        'A single antique bronze lantern with an arched handle and warm amber glass, '
        'complete object visible, centered, finely painted metal details.',
        None, 512, [], None, False, True,
        style='Painterly fantasy illustration', shape='portrait', seed=1729)
    try:
        for event in events:
            if event['event'] == 'status':
                now = time.monotonic()
                if now - last_status >= 15 or 'Removing' in event['message'] or 'Retrying' in event['message']:
                    print(event['message'], flush=True)
                    last_status = now
            elif event['event'] == 'pixels':
                with Image.open(io.BytesIO(event['data'])) as image:
                    assert image.size == (384, 512), f'Unexpected dimensions: {image.size}'
                    assert image.mode == 'RGBA', 'Expected a transparent PNG'
                    alpha = image.getchannel('A').histogram()
                    assert sum(alpha[:10]) >= image.width * image.height * .01, 'No usable transparent background'
                    assert sum(alpha[129:]), 'No visible foreground'
                output.write_bytes(event['data'])
                verified = True
                print(f'Verified transparent PNG: {output}', flush=True)
    finally:
        events.close()
    if not verified:
        raise RuntimeError('The image engine did not return a finished image.')
    print(f'Generation and cutout completed in {time.monotonic() - started:.1f} seconds.', flush=True)


if __name__ == '__main__':
    main()
