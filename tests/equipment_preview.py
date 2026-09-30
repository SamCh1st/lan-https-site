import _bootstrap  # Shared backend import path for tests and previews.
"""Isolated browser fixture; never opens the real campaign database."""
import json
from pathlib import Path
import ssl
import sys
import tempfile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import storage
import server

with tempfile.TemporaryDirectory(prefix='equipment-qa-') as tmp:
    storage.DB_PATH=Path(tmp)/'site.db';storage.UPLOAD_DIR=Path(tmp)/'uploads'
    storage.initialize()
    dm=storage.create_user('EquipmentDM',None,'Equipment-QA-12345')
    player=storage.create_user('EquipmentPlayer',None,'Equipment-QA-12345')
    cid=storage.create_work(dm,'Equipment test',{'category':'campaign','initial_map_kind':'2d','tabletop':{'ruleset':'2024'}})['id']
    storage.invite_to_campaign(dm,cid,'EquipmentPlayer');storage.answer_invite(player,cid,True)
    hero=storage.create_work(dm,'Equipment Hero',{'category':'character','campaign_id':cid,'owner_user_id':player,'character_class':'Fighter','character_level':1,'strength':16,'dexterity':14,'constitution':14,'hp_max':12,'hp_current':12,'speed':30})['id']
    for title in ('Greatsword','Shield','Plate'):
        storage.create_work(dm,title,{'category':'item','campaign_id':cid,'owner_ids':[hero],'quantity':1,'rarity':'Nonmagical','tabletop':{}})
    class PreviewServer(server.ThreadingHTTPServer):
        request_queue_size=128
    http=PreviewServer(('127.0.0.1',0),server.Handler);http.lan_ip='127.0.0.1'
    cert,key=server.ensure_certificate('127.0.0.1')
    context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.load_cert_chain(cert,key)
    http.socket=context.wrap_socket(http.socket,server_side=True)
    print(json.dumps({'port':http.server_port,'campaign':cid,'hero':hero}),flush=True)
    try: http.serve_forever()
    finally: http.server_close()
