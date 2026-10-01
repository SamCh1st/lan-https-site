"""Loopback-only UI fixture with temporary data and deterministic model responses."""
import _bootstrap
import json
import tempfile
from pathlib import Path
import server
import storage

preview = tempfile.TemporaryDirectory(prefix='record-generation-qa-')
storage.DB_PATH = Path(preview.name) / 'site.db'
storage.UPLOAD_DIR = Path(preview.name) / 'uploads'
storage.initialize()
uid = storage.create_user('GenerationQA', None, 'Preview-only-12345')
campaign = storage.create_work(uid, 'Generation QA', {'category':'campaign', 'ai_dm':True,
    'ai_chat_mode':'modern', 'tabletop':{'ruleset':'custom'}})
storage.create_work(uid, 'Léon Dumont', {'category':'character','campaign_id':campaign['id'],
    'owner_user_id':uid,'role':'party','summary':'A thoughtful city baker with gray eyes.'})

def request(path, payload=None, **kwargs):
    if path == '/api/tags': return {'models':[{'name':'preview-model'}]}
    data=json.loads(payload['messages'][1]['content'])
    return {'message':{'content':json.dumps({'title':'Nadia Park',
        'summary':'A bicycle mechanic at a neighborhood repair shop.',
        'notes':'Repairs abandoned bicycles. A missing delivery creates a neighborhood mystery; interview witnesses or trace the courier route.',
        'core':('Léon is a thoughtful city baker with gray eyes.' if 'character' in data else 'Nadia is a practical city mechanic.')+' Patient, observant and quietly witty; asks precise questions.',
        'reminder':'Speak naturally and plainly. Listen before making promises; respect personal boundaries.'})}}

class PreviewHandler(server.Handler):
    def current_user(self):return {'id':uid,'username':'GenerationQA'}
    def safe_origin(self):return self.headers.get('Origin') in (None,'http://127.0.0.1:8773')

server.ollama_request=request
server.ollama_models=lambda:['preview-model']
httpd=server.ThreadingHTTPServer(('127.0.0.1',8773),PreviewHandler)
httpd.lan_ip='127.0.0.1'
print('Isolated fixture: http://127.0.0.1:8773',flush=True)
try:httpd.serve_forever()
finally:httpd.server_close();preview.cleanup()
