"""Isolated chat-art QA server; fake image/AI calls only when explicitly requested."""
import _bootstrap
import io
import json
import os
import ssl
import time
from pathlib import Path
from PIL import Image
import server
import storage
import chat_art
import local_art
from test_chat_images import ChatImagesTests

fixture = ChatImagesTests(); fixture.setUp()
storage.create_work(fixture.player, 'Elara', {'category':'character','campaign_id':fixture.cid,
    'owner_user_id':fixture.player,'role':'party','player_visible':True,'image_id':fixture.image,
    'summary':'A traveler in a red cloak.'})
storage.create_work(fixture.dm, 'Red reference', {'category':'artwork','campaign_id':fixture.cid,'image_id':fixture.image})
if os.environ.get('CHAT_ART_FAKE') == '1':
    def design(*args, **kwargs):
        time.sleep(.2)
        output=io.BytesIO();Image.new('RGB',(512,512),'#396b72' if args[1] else '#925730').save(output,'PNG')
        yield {'event':'pixels','data':output.getvalue()}
        yield {'event':'done'}
    local_art.ready=lambda:True
    local_art.design=design
    chat_art.art_references.choose_model=lambda *args:'fake-vision'
    def stream(path, payload=None, **kwargs):
        assert '<image>' in payload['messages'][0]['content']
        assert 'WRITTEN text' in payload['messages'][0]['content']
        context=json.loads(payload['messages'][1]['content'])
        if context.get('answer_as',{}).get('type')=='character':
            assert 'character_memory' in context
            if context['character_memory']['reminder']:
                assert payload['messages'][-1]['role']=='system'
                assert any(context['character_memory']['reminder'] in m['content'] for m in payload['messages'] if m['role']=='system')
        yield {'message':{'content':json.dumps({'reply':'Before the portrait. <image>Elara in her red cloak</image> After the portrait.','memory':'','cards':[]})},'done':True}
    def request(path, payload=None, **kwargs):
        if path == '/api/tags': return {'models':[{'name':'fake-vision'}]}
        data = json.loads(payload['messages'][-1]['content'])
        if 'draft' in data:
            time.sleep(.5)
            answer = {'continuation':' Harold. I live near the old mill.'}
        elif 'draft_reply' in data: answer = {'reply':data['draft_reply']}
        elif 'character' in data and 'messages' in data:
            entries=data['messages'];answer={'memories':[{'kind':'goal','text':'Elara promised to bring medicine to Mara.','importance':4,'sources':[{'id':m['id'],'quote':m['text']}]} for m in entries if 'medicine' in m['text']]}
        elif 'records' in data: answer = {'ids':[r['id'] for r in data['records'] if r['name']=='Elara']}
        else: answer = {'prompt':data['campaign_context']}
        return {'message':{'content':json.dumps(answer)}}
    server.ollama_request=request
    server.ollama_stream=stream
    server.ollama_models=lambda:['fake-vision']

server.CERT_DIR=Path(fixture.temp.name)/'cert'
cert,key=server.ensure_certificate('127.0.0.1')
httpd=server.ThreadingHTTPServer(('127.0.0.1',int(os.environ.get('CHAT_ART_PORT','8770'))),server.Handler);httpd.lan_ip='127.0.0.1'
tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(cert,key);httpd.socket=tls.wrap_socket(httpd.socket,server_side=True)
print(json.dumps({'port':httpd.server_port,'campaign_id':fixture.cid,'fake':os.environ.get('CHAT_ART_FAKE')=='1'}),flush=True)
try:httpd.serve_forever()
finally:httpd.server_close()
