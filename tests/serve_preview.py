import _bootstrap  # Shared backend import path for tests and previews.
"""Loopback-only QA server. Always uses a fresh temporary database and certificate."""
import sys
import os
import ssl
import tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
import storage

if __name__=='__main__':
    preview=Path(tempfile.mkdtemp(prefix='dnd-tabletop-qa-'))
    storage.DB_PATH=preview/'test.db'
    storage.UPLOAD_DIR=preview/'uploads'
    server.CERT_DIR=preview/'cert'
    storage.initialize()
    dm=storage.create_user('TabletopQA',None,'Tabletop-QA-12345')
    player=storage.create_user('DicePlayerQA',None,'Tabletop-QA-12345')
    for ai in (False,True):
        campaign=storage.create_work(dm,'Dice QA '+('AI' if ai else 'Normal'),{'category':'campaign','ai_dm':ai,'tabletop':{'ruleset':'2024'}})
        storage.invite_to_campaign(dm,campaign['id'],'DicePlayerQA')
        storage.answer_invite(player,campaign['id'],True)
        for title,dex in ([('Elara',16),('Borin',10)] if ai else [('Elara',16)]):
            storage.create_work(player,title,{'category':'character','campaign_id':campaign['id'],'owner_user_id':player,'assigned_user_ids':[player],'player_visible':True,'role':'party','character_level':5,'character_class':'Rogue','strength':10,'dexterity':dex,'constitution':14,'intelligence':12,'wisdom':14,'charisma':10,'hp_current':25,'hp_max':25,'tabletop':{'ruleset':'2024','skill_stealth':2,'exhaustion':1}})
    certificate,key=server.ensure_certificate('127.0.0.1')
    port=int(os.environ.get('SPELL_QA_PORT','8766'))
    server.ThreadingHTTPServer.request_queue_size=64
    if os.environ.get('SPELL_QA_NON_HOST') == '1':
        server.Handler.is_host_request = lambda self: False
    httpd=server.ThreadingHTTPServer(('127.0.0.1',port),server.Handler)
    httpd.lan_ip='127.0.0.1'
    tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    tls.load_cert_chain(certificate,key)
    httpd.socket=tls.wrap_socket(httpd.socket,server_side=True)
    print(f'Isolated QA site: https://127.0.0.1:{port}',flush=True)
    try:httpd.serve_forever()
    finally:httpd.server_close()
