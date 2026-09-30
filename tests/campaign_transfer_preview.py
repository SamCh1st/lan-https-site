import sys,ssl,json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(root/'tests'),str(root/'backend')]
from test_campaign_transfer import CampaignTransferTests
import server
fixture=CampaignTransferTests();fixture.setUp()
server.CERT_DIR=Path(fixture.temp.name)/'cert'
cert,key=server.ensure_certificate('127.0.0.1')
httpd=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler);httpd.lan_ip='127.0.0.1'
tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(cert,key);httpd.socket=tls.wrap_socket(httpd.socket,server_side=True)
print(json.dumps({'port':httpd.server_port}),flush=True)
try:httpd.serve_forever()
finally:httpd.server_close();fixture.tearDown()
