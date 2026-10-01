"""Visual recipes for the local renderer; subject instructions remain authoritative."""

STYLES = {
    'Painterly fantasy illustration': 'Painted fantasy illustration, visible brushwork, layered pigments, rich restrained colors, atmospheric lighting, carefully rendered materials.',
    'Painted anime illustration': 'Painted anime illustration, expressive features, clean selective outlines, soft painted shading, crisp focal details, harmonious colors.',
    'Realistic digital illustration': 'Realistic digital illustration, natural proportions, physically believable materials, subtle surface texture, coherent light and shadows.',
    'Ink and watercolor illustration': 'Ink and watercolor on textured paper, fine varied ink lines, translucent washes, pigment blooms, restrained detail and soft edges.',
    'Pixel art': 'Deliberate pixel art, crisp square pixel clusters, limited coordinated palette, stepped contours, readable silhouettes, no photographic texture or smooth gradients.',
    'Old-school RPG illustration': 'Old-school tabletop RPG illustration, hand-drawn pen hatching, textured muted pigments, strong silhouettes, worn printed-book finish.',
    'Cinematic realism': 'Cinematic realism, deliberate camera composition, motivated lighting, natural material detail, controlled depth of field, cohesive film color grading.',
    'Graphic novel': 'Graphic novel illustration, confident ink contours, bold shadow shapes, selective crosshatching, limited dramatic colors, no panels or lettering unless requested.',
    'Oil painting': 'Traditional oil painting, layered opaque paint, visible bristle strokes, rich midtones, selective impasto and carefully balanced edges.',
    'Item icon': 'Game inventory illustration, one clearly readable focal subject, crisp silhouette, carefully painted material highlights, restrained detail readable at small scale.',
}


def compose(prompt, style=''):
    if not isinstance(style, str) or (style and style not in STYLES):
        raise ValueError('Choose a supported art style.')
    if not style:
        return prompt
    return (prompt + '\nVisual treatment: ' + STYLES[style]
            + '\nApply this treatment without changing the requested subjects, appearance, action, or setting. Explicit details in the request take priority.')


def dimensions(size, shape='square'):
    if type(size) is not int or size not in (512, 768, 1024):
        raise ValueError('Choose a supported image size.')
    if shape not in ('square', 'portrait', 'landscape'):
        raise ValueError('Choose square, portrait, or landscape framing.')
    short = {512: 384, 768: 512, 1024: 768}[size]
    return (short, size) if shape == 'portrait' else (size, short) if shape == 'landscape' else (size, size)
