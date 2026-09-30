"""Correct outward-release drawings; preview still reads only drawn operators."""
import math
import re


def correct(nodes, prompt):
    text = prompt.lower()
    release_words = r'(?:explos\w*|explod\w*|blast\w*|detonat\w*|burst\w*|bombs?|bombard\w*|shockwaves?|erupt\w*)'
    if not re.search(r'\b' + release_words + r'\b', text):
        return []
    # Explicit inward/anti-explosion requests must not become outward attacks.
    if re.search(r'\b(implos\w*|inward|compress\w*|condens\w*|prevent\w*|contain\w*|absorb\w*|suppress\w*|stop\w*)\b', text) or re.search(r'\b(no|not|without|non)[ -]+(an? )?' + release_words, text):
        return []
    replacements = {
        'convergence': 'expansion', 'gathering': 'dispersion',
        'binding': 'expansion', 'levitation': 'dispersion',
        'stability': 'dispersion', 'strengthening': 'expansion',
        'entwining': 'coil', 'immobility': 'dispersion',
        'solidification': 'expansion', 'piercing': 'column',
        'stretch': 'expansion',
    }
    rings = [n for n in nodes if n['type'] == 'ring']
    events = []
    for node in nodes:
        before = dict(node)
        node['type'] = replacements.get(node['type'], node['type'])
        if node['type'] in ('pulling', 'column', 'sights', 'expansion', 'dispersion'):
            owners = [r for r in rings if math.hypot((node['x']-r['x'])/(r['w']/2), (node['y']-r['y'])/(r['h']/2)) <= 1]
            if rings:
                ring = min(owners, key=lambda r: r['w']*r['h']) if owners else min(rings, key=lambda r: (math.hypot(r['x'], r['y']), -r['w']*r['h']))
                node['rotation'] = math.degrees(math.atan2(node['x']-ring['x'], -(node['y']-ring['y']))) % 360
        if before != node:
            events.append(dict(event='step', action='update', node=dict(node), explanation='Outward release: correct this instruction so the explosion disperses instead of continuously compressing.'))
    return events
