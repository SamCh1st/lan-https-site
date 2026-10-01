import ast,datetime as dt,ipaddress,socket,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from cryptography import x509
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
SOURCE=Path(__file__).resolve().parents[1]/'backend/server.py'
tree=ast.parse(SOURCE.read_text(encoding='utf-8'))
functions=ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('computer_hostname','ensure_certificate')],type_ignores=[])
exec(compile(functions,str(SOURCE),'exec'))
class HostnameCertificateTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
  globals()['CERT_DIR']=Path(self.temp.name)
 def cert(self):
  return x509.load_pem_x509_certificate(ensure_certificate('192.168.1.20')[0].read_bytes())
 def test_name_and_ip_and_reuse(self):
  with patch.object(socket,'gethostname',return_value='SamuelPortable'):
   a=self.cert();b=self.cert();self.assertEqual(a.serial_number,b.serial_number)
   names=a.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
   self.assertIn('samuelportable',names.get_values_for_type(x509.DNSName));self.assertIn('localhost',names.get_values_for_type(x509.DNSName));self.assertIn(ipaddress.ip_address('192.168.1.20'),names.get_values_for_type(x509.IPAddress))
 def test_new_computer_regenerates(self):
  with patch.object(socket,'gethostname',return_value='SamuelPortable'):a=self.cert()
  with patch.object(socket,'gethostname',return_value='OtherComputer'):b=self.cert()
  self.assertNotEqual(a.serial_number,b.serial_number)
  self.assertIn('othercomputer',b.extensions.get_extension_for_class(x509.SubjectAlternativeName).value.get_values_for_type(x509.DNSName))
 def test_ip_change_regenerates(self):
  a=self.cert();p,_=ensure_certificate('192.168.1.21');b=x509.load_pem_x509_certificate(p.read_bytes());self.assertNotEqual(a.serial_number,b.serial_number)
 def test_corrupted_certificate_recovers(self):
  self.cert();(CERT_DIR/'lan-cert.pem').write_text('broken');self.assertTrue(self.cert())
if __name__=='__main__':unittest.main()
