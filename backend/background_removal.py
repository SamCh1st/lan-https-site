"""Local U2-Net foreground segmentation before generated art is published."""
import io
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / 'local-art'
LOCK = threading.Lock()
_session = None
PROMPT = ('Draw only the requested subject, fully inside the frame with a little margin, '
          'against a simple neutral backdrop. No scenery, floor, cast ground shadow, text, '
          'watermarks, borders or checkerboard patterns. A separate AI will remove the backdrop.')


def session():
    global _session
    if _session is None:
        runtime = str(ROOT / 'background-runtime')
        if runtime not in sys.path:
            sys.path.insert(0, runtime)
        try:
            import onnxruntime as ort
        except ImportError as error:
            raise ValueError('Background removal is not installed. Run setup_background_removal.py on the server.') from error
        model = ROOT / 'u2net.onnx'
        if not model.is_file():
            raise ValueError('Background-removal model is missing. Run setup_background_removal.py on the server.')
        config = ort.SessionOptions()
        config.intra_op_num_threads = 4
        config.inter_op_num_threads = 1
        _session = ort.InferenceSession(str(model), sess_options=config, providers=['CPUExecutionProvider'])
    return _session


def remove_background(data):
    with LOCK:
        engine = session()
        import numpy as np
        from PIL import Image, ImageOps
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert('RGBA')
        rgb = np.asarray(image.convert('RGB').resize((320, 320), Image.Resampling.LANCZOS), dtype=np.float32)
        rgb /= max(float(rgb.max()), 1e-6)
        rgb = (rgb - np.array([.485,.456,.406], dtype=np.float32)) / np.array([.229,.224,.225], dtype=np.float32)
        tensor = rgb.transpose(2,0,1)[None].astype(np.float32)
        prediction = engine.run(None, {engine.get_inputs()[0].name: tensor})[0][0,0]
        span = float(prediction.max()-prediction.min())
        if not np.isfinite(prediction).all() or span < 1e-6:
            raise ValueError('Background removal could not identify a subject. Your artwork is unchanged.')
        prediction = (prediction-prediction.min())/span
        mask = Image.fromarray((prediction.clip(0,1)*255).astype(np.uint8)).resize(image.size, Image.Resampling.LANCZOS)
        alpha = np.asarray(mask, dtype=np.float32)*np.asarray(image.getchannel('A'), dtype=np.float32)/255
        if not (alpha > 128).any() or not (alpha < 10).any():
            raise ValueError('Background removal could not produce a usable cutout. Your artwork is unchanged.')
        image.putalpha(Image.fromarray(alpha.astype(np.uint8)))
        output = io.BytesIO(); image.save(output, format='PNG')
        return output.getvalue()
