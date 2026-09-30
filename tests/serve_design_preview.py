import _bootstrap  # Shared backend import path for tests and previews.
"""Isolated browser fixture: exercises real HTTP streaming without using Ollama."""
import json
import os
import runpy
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
import spell_reader

server.ollama_models = lambda: ['Drawing QA']
spell_reader.references = lambda terms: (spell_reader.BASE_REFERENCE, 'QA reference fixture')


def stream(path, payload, timeout):
    prompt = json.loads(payload['messages'][-1]['content'])['request']
    steps = [dict(action='add', id='s1', type='openRing', x=0, y=0, w=600, h=600, rotation=0, explanation='Draw an open boundary.'),
             dict(action='add', id='s2', type='light', x=0, y=0, w=70, h=70, rotation=0, explanation='Light is the supported element.'),
             dict(action='add', id='s3', type='concept', x=0, y=-180, w=60, h=60, rotation=0, label='Contact trigger', meaning='Proposed: someone stepping on the seal triggers it.', explanation='The trigger is a proposed mechanic.'),
             dict(action='add', id='s4', type='concept', x=150, y=90, w=60, h=60, rotation=0, label='Permanent blindness', meaning='Proposed: a lasting loss of sight, not temporary darkness.', explanation='Permanence remains an unverified mechanism.'),
             dict(action='close', id='s1', explanation='Close the ring last.')]
    if 'DETAILED MODE' in payload['messages'][0]['content']:
        steps = [dict(action='seal', core='repetition', bands=[dict(type=t, explanation='Interpret this band as a fan modifier.') for t in ['expansion', 'convergence', 'regions']])]
    yield {'message': {'content': '{"steps":['}}
    if 'empty' in prompt:
        yield {'message': {'content': '],"name":"No design"}'}, 'done': True}
        return
    for i, step in enumerate(steps):
        text = (',' if i else '') + json.dumps(step)
        # Split inside a JSON string so the incremental decoder must buffer it.
        mid = len(text) // 2
        yield {'message': {'content': text[:mid]}}
        time.sleep(.15)
        yield {'message': {'content': text[mid:]}}
        time.sleep(1 if 'cancel' in prompt else .65)
        if 'failure' in prompt and i == 0:
            raise ValueError('Simulated connection failure')
    summary = dict(name='Contact blindness blueprint', description='A conceptual trap that aims to blind whoever steps on it.', canon='Light is supported.', inference='The contact trigger and permanent injury are proposed.', matches_request='conceptual', limitations=['Permanent blindness is not verified by the supplied references.'])
    tail = '],' + json.dumps(summary)[1:]
    yield {'message': {'content': tail}, 'done': True}


server.ollama_stream = stream
os.environ['SPELL_QA_PORT'] = '8767'
runpy.run_path(str(Path(__file__).with_name('serve_preview.py')), run_name='__main__')
