import _bootstrap
import gc
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch
from PIL import Image
import storage
import campaign_transfer as transfer
import audio_library

class CampaignTransferTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.saved=storage.DB_PATH,storage.UPLOAD_DIR,transfer.WEB_ROOT,audio_library.ROOT
        root=Path(self.temp.name)
        storage.DB_PATH=root/'site.db';storage.UPLOAD_DIR=root/'uploads';transfer.WEB_ROOT=root/'site';audio_library.ROOT=root/'audio'
        storage.initialize()
        self.dm=storage.create_user('ExportDM',None,'password-123')
        self.member=storage.create_user('Player',None,'password-123')
        self.target=storage.create_user('Importer',None,'password-123')
        (transfer.WEB_ROOT/'assets').mkdir(parents=True)
        image=io.BytesIO();Image.new('RGBA',(8,8),(255,0,0,255)).save(image,format='PNG');self.image=image.getvalue()
        self.upload=storage.save_upload(self.dm,self.image,'.png','image/png')
        (transfer.WEB_ROOT/'assets/token.png').write_bytes(self.image)
        (audio_library.ROOT/'Music').mkdir(parents=True);(audio_library.ROOT/'Music/tune.mp3').write_bytes(b'ID3campaign audio')
        with storage.connect() as db:
            def card(title,content):return db.execute('INSERT INTO work_items(user_id,title,content) VALUES (?,?,?)',(self.dm,title,json.dumps(content))).lastrowid
            self.cid=card('Transfer realm',{'category':'campaign','image_id':self.upload,'ai_story':'Keep the story','initial_map_kind':'2d'})
            db.execute("INSERT INTO campaign_members(campaign_id,user_id,role,status) VALUES (?,?,'creator','accepted')",(self.cid,self.dm))
            db.execute("INSERT INTO campaign_members(campaign_id,user_id,role,status) VALUES (?,?,'member','accepted')",(self.cid,self.member))
            self.char=card('Hero',{'category':'character','campaign_id':self.cid,'owner_user_id':self.member,'image_id':self.upload,'map_image_scale':2.5})
            self.item=card('Key',{'category':'item','campaign_id':self.cid,'owner_ids':[self.char],'quantity':7,'image_url':'/assets/token.png'})
            content={'category':'character','campaign_id':self.cid,'owner_user_id':self.member,'image_id':self.upload,'tabletop':{'equipment_loadout':{'main_hand':self.item},'equipment_attuned':[self.item]}}
            db.execute('UPDATE work_items SET content=? WHERE id=?',(json.dumps(content),self.char))
            self.npc=card('Merchant',{'category':'npc','campaign_id':self.cid,'image_id':self.upload})
            self.chat=card('Secret conversation',{'category':'chat','campaign_id':self.cid,'participant_ids':[self.char],'assigned_user_ids':[self.member],'player_visible':False})
            self.first=db.execute('INSERT INTO campaign_maps(campaign_id,title,kind,state) VALUES (?,?,?,?)',(self.cid,'Village','2d','{}')).lastrowid
            self.second=db.execute('INSERT INTO campaign_maps(campaign_id,title,kind,state) VALUES (?,?,?,?)',(self.cid,'Inn','2d','{}')).lastrowid
            state={'objects':[{'id':'placed-merchant','type':'npc','npc_id':self.npc,'x':3,'y':0,'z':2}],'scene':{'time':'Night','weather':'Snow'},'nodes':[{'id':'door','type':'door','x':0,'y':0,'w':40,'h':40,'connected_map_id':self.second,'part_image_id':self.upload,'required_item_id':self.item,'contents':[{'record_id':self.item,'quantity':3}]}],'audio_url':'/api/audio/file?folder=Music&name=tune.mp3'}
            db.execute('UPDATE campaign_maps SET state=? WHERE id=?',(json.dumps(state),self.first))
            db.execute('UPDATE campaign_maps SET state=? WHERE id=?',(json.dumps({'nodes':[{'id':'exit','type':'exit_location','arrival_from_map_id':self.first}]}),self.second))
            db.execute('INSERT INTO campaign_map_settings VALUES (?,?)',(self.cid,'2d'))
            db.execute('INSERT INTO campaign_map_selection VALUES (?,?)',(self.cid,self.first))
            db.execute('INSERT INTO campaign_map_positions VALUES (?,?,?,?,?,?)',(self.first,self.member,4,0,9,'idle'))
            db.execute('INSERT INTO personal_notes(work_id,user_id,note) VALUES (?,?,?)',(self.item,self.dm,'DM note'))
            db.execute('INSERT INTO personal_notes(work_id,user_id,note) VALUES (?,?,?)',(self.item,self.member,'PRIVATE PLAYER NOTE'))
            db.execute("INSERT INTO campaign_ai_messages(campaign_id,chat_id,user_id,persona_type,persona_id,persona_name,role,audience_user_ids,message) VALUES (?,?,?,'character',?,'Hero','user',?,'Remember this')",(self.cid,self.chat,self.member,self.char,json.dumps([self.member])))
    def tearDown(self):
        storage.DB_PATH,storage.UPLOAD_DIR,transfer.WEB_ROOT,audio_library.ROOT=self.saved
        gc.collect();self.temp.cleanup()
    def archive(self):
        with transfer.export_campaign(self.dm,self.cid)[0] as stream:return stream.read()
    def mutate(self,body,fn):
        target=io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(body)) as original,zipfile.ZipFile(target,'w') as result:
            manifest=json.loads(original.read('manifest.json'));fn(manifest)
            for name in original.namelist():result.writestr(name,json.dumps(manifest) if name=='manifest.json' else original.read(name))
        target.seek(0);return target
    def count(self):
        with storage.connect() as db:return db.execute('SELECT COUNT(*) FROM work_items').fetchone()[0]
    def test_roundtrip_independent_copy_links_media_and_notes(self):
        body=self.archive()
        self.assertNotIn(b'PRIVATE PLAYER NOTE',zipfile.ZipFile(io.BytesIO(body)).read('manifest.json'))
        new=transfer.import_campaign(self.target,io.BytesIO(body));self.assertNotEqual(new['id'],self.cid)
        records={r['title']:r for r in storage.list_work(self.target)};hero=records['Hero'];key=records['Key']
        self.assertEqual(key['content']['owner_ids'],[hero['id']]);self.assertEqual(key['content']['quantity'],7)
        self.assertEqual(hero['content']['tabletop']['equipment_loadout']['main_hand'],key['id'])
        self.assertIsNone(hero['content']['owner_user_id'])
        self.assertEqual(key['personal_note'],'DM note')
        upload_id=hero['content']['image_id'];self.assertNotEqual(upload_id,self.upload)
        self.assertEqual(storage.get_upload(self.target,upload_id)[0].read_bytes(),self.image)
        with storage.connect() as db:
            maps={r['title']:dict(r) for r in db.execute('SELECT * FROM campaign_maps WHERE campaign_id=?',(new['id'],))}
            state=json.loads(maps['Village']['state']);node=state['nodes'][0]
            self.assertEqual(state['objects'][0]['npc_id'],records['Merchant']['id'])
            self.assertEqual(node['connected_map_id'],maps['Inn']['id']);self.assertEqual(node['required_item_id'],key['id'])
            self.assertEqual(node['contents'][0]['record_id'],key['id']);self.assertEqual(node['part_image_id'],upload_id)
            self.assertEqual(json.loads(maps['Inn']['state'])['nodes'][0]['arrival_from_map_id'],maps['Village']['id'])
            message=db.execute('SELECT * FROM campaign_ai_messages WHERE campaign_id=?',(new['id'],)).fetchone()
            self.assertEqual(message['persona_id'],hero['id']);self.assertEqual(message['chat_id'],records['Secret conversation']['id'])
            self.assertEqual(json.loads(message['audience_user_ids']),[self.target])
            self.assertEqual(db.execute('SELECT COUNT(*) FROM campaign_members WHERE campaign_id=?',(new['id'],)).fetchone()[0],1)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM campaign_maps WHERE campaign_id=?',(self.cid,)).fetchone()[0],2)
        again=transfer.import_campaign(self.target,io.BytesIO(body));self.assertNotEqual(again['id'],new['id'])
        self.assertTrue(key['content']['image_url'].startswith('/api/uploads/'))
    def test_assign_players_restores_character_and_map_position(self):
        result=transfer.import_campaign(self.target,io.BytesIO(self.archive()))
        with self.assertRaises(ValueError):transfer.player_assignment(self.target,result['id'],{str(self.member):self.member})
        storage.invite_to_campaign(self.target,result['id'],'Player');storage.answer_invite(self.member,result['id'],True)
        transfer.player_assignment(self.target,result['id'],{str(self.member):self.member})
        with storage.connect() as db:
            hero=db.execute("SELECT content FROM work_items WHERE title='Hero' AND json_extract(content,'$.campaign_id')=?",(result['id'],)).fetchone()
            self.assertEqual(json.loads(hero['content'])['owner_user_id'],self.member)
            position=db.execute('SELECT p.x,p.z FROM campaign_map_positions p JOIN campaign_maps m ON m.id=p.map_id WHERE m.campaign_id=? AND p.user_id=?',(result['id'],self.member)).fetchone()
            self.assertEqual(tuple(position),(4,9))
        with self.assertRaises(PermissionError):transfer.player_assignment(self.member,result['id'],{})
    def test_only_creator_can_export(self):
        for user in (self.member,self.target):
            with self.assertRaises(PermissionError):transfer.export_campaign(user,self.cid)
    def test_invalid_files_leave_no_partial_campaign_or_uploads(self):
        body=self.archive();before=self.count();files=set(storage.UPLOAD_DIR.iterdir())
        for change in (lambda m:m.update(version=999),lambda m:m['media'][0].update(sha256='bad'),lambda m:m['maps'][0].update(kind='bad'),lambda m:m['records'][0]['content'].update(campaign_id=123,category='item')):
            with self.assertRaises(ValueError):transfer.import_campaign(self.target,self.mutate(body,change))
            self.assertEqual(self.count(),before);self.assertEqual(set(storage.UPLOAD_DIR.iterdir()),files)
        dangerous=io.BytesIO()
        with zipfile.ZipFile(dangerous,'w') as z:z.writestr('../escape','bad');z.writestr('manifest.json','{}')
        dangerous.seek(0)
        with self.assertRaises(ValueError):transfer.import_campaign(self.target,dangerous)
    def test_write_failure_rolls_back_records_and_media(self):
        body=self.archive();before=self.count();files=set(storage.UPLOAD_DIR.iterdir());original=transfer._json
        def fail(value):
            if isinstance(value,dict) and value.get('category')=='item':raise OSError('simulated write failure')
            return original(value)
        with patch.object(transfer,'_json',side_effect=fail):
            with self.assertRaises(OSError):transfer.import_campaign(self.target,io.BytesIO(body))
        self.assertEqual(self.count(),before);self.assertEqual(set(storage.UPLOAD_DIR.iterdir()),files)
    def test_raw_url_cannot_expose_another_users_upload(self):
        with storage.connect() as db:
            db.execute('INSERT INTO work_items(user_id,title,content) VALUES (?,?,?)',(self.target,'Fake attachment',json.dumps({'category':'lore','summary':'/api/uploads/'+str(self.upload)})))
        self.assertIsNone(storage.get_visible_upload(self.target,self.upload))
    def test_asset_url_can_be_seen_by_invited_member(self):
        result=transfer.import_campaign(self.target,io.BytesIO(self.archive()))
        storage.invite_to_campaign(self.target,result['id'],'Player');storage.answer_invite(self.member,result['id'],True)
        with storage.connect() as db:
            row=db.execute("SELECT id,content FROM work_items WHERE json_extract(content,'$.category')='item' AND json_extract(content,'$.campaign_id')=?",(result['id'],)).fetchone()
            c=json.loads(row['content']);c['assigned_user_ids']=[self.member];db.execute('UPDATE work_items SET content=? WHERE id=?',(json.dumps(c),row['id']))
        ident=int(c['image_url'].rsplit('/',1)[1]);self.assertIsNotNone(storage.get_visible_upload(self.member,ident))

if __name__=='__main__':unittest.main()
