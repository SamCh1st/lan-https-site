"""Convert the renderer's edge-connected chroma backdrop into PNG alpha."""
import io

CUTOUT_INSTRUCTION = '''Output an isolated subject, entirely inside the frame with a little margin. Use a perfectly flat solid vivid magenta (#FF00FF) background as a temporary chroma key for automatic removal. No scenery, floor, backdrop gradient, background shadow, white background, gray background, checkerboard, transparency grid, border, or text. Do not draw fake transparency squares. Keep magenta out of the subject where possible; retain the requested subject colors and details. The application will replace the temporary magenta background with real transparent pixels.'''


def remove_backdrop(data):
    from PIL import Image, ImageDraw
    import numpy as np
    image = Image.open(io.BytesIO(data)).convert('RGBA')
    pixels = np.array(image)
    rgb = pixels[:, :, :3].astype(np.float32)
    # Some model outputs ignore the chroma instruction and use a white backdrop.
    # Only accept white when it consistently surrounds a nonwhite subject.
    border = np.concatenate((rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]))
    matte = np.array([255, 0, 255])
    low, high = 35, 125
    white = (border.min(axis=1) >= 245).mean() >= .9
    if white:
        if (rgb.min(axis=2) < 220).mean() < .01:
            return data, False
        matte = np.array([255, 255, 255])
        low, high = 8, 55
    distance = np.max(np.abs(rgb - matte), axis=2)
    eligible = distance < high
    if white:
        eligible &= (rgb.max(axis=2) - rgb.min(axis=2)) < 18
    eligible |= pixels[:, :, 3] == 0
    padded = np.pad(eligible.astype(np.uint8) * 255, 1, constant_values=255)
    mask = Image.fromarray(padded).copy()
    ImageDraw.floodfill(mask, (0, 0), 128, thresh=0)
    connected = np.array(mask)[1:-1, 1:-1] == 128
    removed = connected & (pixels[:, :, 3] > 0)
    if not removed.any():
        return data, False
    # Feather only the connected backdrop, leaving enclosed light details untouched.
    alpha = np.clip((distance - low) / (high - low), 0, 1)
    fraction = np.maximum(alpha, .01)[:, :, None]
    clean = np.clip((rgb - (1 - fraction) * matte) / fraction, 0, 255)
    pixels[:, :, :3][connected] = clean[connected].astype(np.uint8)
    pixels[:, :, 3][connected] = (pixels[:, :, 3][connected] * alpha[connected]).astype(np.uint8)
    output = io.BytesIO()
    Image.fromarray(pixels).save(output, format='PNG')
    return output.getvalue(), True

