import _bootstrap  # Shared backend import path for tests and previews.
import gc
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import storage
import ai_effects
from server import normalize_character_stats

class AIEffectsTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.original=(storage.DB_PATH,storage.UPLOAD_DIR)
        storage.DB_PATH=Path(self.temp.name)/'test.db';storage.UPLOAD_DIR=Path(self.temp.name)/'uploads'
        storage.initialize()
        self.dm=storage.create_user('DM',None,'Test password 12345')
        self.player=storage.create_user('Player',None,'Test password 12345')
        self.other=storage.create_user('Other',None,'Test password 12345')
        self.campaign=storage.create_work(self.dm,'AI',{'category':'campaign','ai_dm':True,'ai_world':{'location':'Old tavern','weather':'Clear'},'tabletop':{'ruleset':'custom'}})
        self.cid=self.campaign['id']
        for name,uid in [('Player',self.player),('Other',self.other)]:
            storage.invite_to_campaign(self.dm,self.cid,name);storage.answer_invite(uid,self.cid,True)
        self.pc=storage.create_work(self.player,'Elara',{'category':'character','campaign_id':self.cid,'owner_user_id':self.player,'role':'party'})
        self.pc2=storage.create_work(self.other,'Borin',{'category':'character','campaign_id':self.cid,'owner_user_id':self.other,'role':'party'})
        self.ref=storage.create_work(self.dm,'Longsword',{'category':'item','campaign_id':self.cid,'reference_only':True,'item_type':'Weapon','quantity':1,'damage':'1d8','tabletop':{'item_properties':'Versatile (1d10)'}})
    def tearDown(self):
        storage.DB_PATH,storage.UPLOAD_DIR=self.original
        gc.collect();self.temp.cleanup()
    def message(self,audience=None,persona='dm'):
        return storage.add_ai_message(self.cid,None,persona,None,'DM','assistant',True,'Test',audience or [],None,'complete')['id']
    def apply(self,answer,**kw):
        return ai_effects.apply(self.cid,self.message(**kw),answer,normalize_character_stats)
    def test_scene_cards_grants_and_replay(self):
        mid=self.message()
        answer={'scene':{'location':'River Gate','time':'Night','weather':'Rain','visibility':'Dim','temperature':'Cold','danger':'Dangerous','pace':'Travel','mood':'Tense'},'cards':[
            {'category':'spell','title':'Fire Bolt','character_ids':[self.pc['id']],'spell_level':'Cantrip','school':'Evocation','tabletop':{'verbal':True,'somatic':True}},
            {'category':'quest','title':'Rescue the Miller','character_ids':[self.pc['id']],'state':'Active'},
            {'category':'encounter','title':'Bridge ambush','character_ids':[self.pc['id']],'difficulty':'Moderate','state':'Planned'}],
            'grants':[{'record_id':self.ref['id'],'character_ids':[self.pc['id']]}]}
        result=ai_effects.apply(self.cid,mid,answer,normalize_character_stats)
        self.assertEqual(result['warnings'],[]);self.assertEqual(len(result['cards']),4)
        self.assertEqual(storage.campaign_record(self.dm,self.cid)['content']['ai_world'],answer['scene'])
        visible=storage.list_work(self.player);titles={r['title'] for r in visible}
        self.assertTrue({'Longsword','Fire Bolt','Rescue the Miller','Bridge ambush'}<=titles)
        sword=next(r for r in visible if r['title']=='Longsword' and r['content']['category']=='item')
        self.assertEqual(sword['content']['owner_ids'],[self.pc['id']]);self.assertFalse(sword['content']['reference_only'])
        self.assertTrue(next(r for r in storage.list_work(self.dm) if r['id']==self.ref['id'])['content']['reference_only'])
        before=len(storage.list_work(self.dm));self.assertEqual(ai_effects.apply(self.cid,mid,answer,normalize_character_stats),result)
        self.assertEqual(len(storage.list_work(self.dm)),before)
        self.apply(answer);self.assertEqual(len(storage.list_work(self.dm)),before)
        self.assertNotIn('Rescue the Miller',{r['title'] for r in storage.list_work(self.other)})
    def test_partial_scene_and_existing_grant(self):
        item=storage.create_work(self.dm,'Rope',{'category':'item','campaign_id':self.cid})
        result=self.apply({'scene':{'time':'night','weather':'Lava'},'grants':[{'record_id':item['id'],'character_ids':[self.pc['id']]}]})
        self.assertTrue(result['warnings']);self.assertEqual(result['scene'],{'time':'Night'})
        world=storage.campaign_record(self.dm,self.cid)['content']['ai_world'];self.assertEqual(world['location'],'Old tavern');self.assertEqual(world['weather'],'Clear')
        self.assertEqual(result['cards'][0]['id'],item['id'])
    def test_reference_grant_wins_over_duplicate_card(self):
        result=self.apply({'cards':[{'category':'spell','title':'Longsword','character_ids':[self.pc['id']]}],'grants':[{'record_id':self.ref['id'],'character_ids':[self.pc['id']]}]})
        self.assertEqual(len(result['cards']),1)
        self.assertEqual(result['cards'][0]['category'],'item')
        item=next(r for r in storage.list_work(self.player) if r['id']==result['cards'][0]['id'])
        self.assertEqual(item['content']['damage'],'1d8')
    def test_updates_existing_quest_without_new_record(self):
        first=self.apply({'cards':[{'category':'quest','title':'Find the key','character_ids':[self.pc['id']],'state':'Active','notes':'Keep this objective.'}]})
        qid=first['cards'][0]['id']
        count=len(storage.list_work(self.dm))
        changed=self.apply({'cards':[{'record_id':qid,'category':'quest','title':'Find the key','character_ids':[],'state':'Completed'}]})
        self.assertEqual(changed['cards'][0]['id'],qid)
        self.assertEqual(len(storage.list_work(self.dm)),count)
        quest=next(r for r in storage.list_work(self.player) if r['id']==qid)
        self.assertEqual(quest['content']['state'],'Completed')
        self.assertEqual(quest['content']['notes'],'Keep this objective.')
        self.assertEqual(quest['content']['participant_ids'],[self.pc['id']])
    def test_private_and_foreign_recipients_blocked(self):
        noop=self.apply({'scene':{key:None for key in ['location','mood',*ai_effects.SCENE_OPTIONS]}},audience=[self.player])
        self.assertEqual(noop['warnings'],[])
        result=self.apply({'scene':{'location':'Secret'},'cards':[{'category':'item','title':'Private gift','character_ids':[self.pc2['id']]}],'grants':[{'record_id':99999,'character_ids':[self.pc['id']]}]},audience=[self.player])
        self.assertEqual(len(result['warnings']),3);self.assertEqual(result['cards'],[])
        self.assertEqual(storage.campaign_record(self.dm,self.cid)['content']['ai_world']['location'],'Old tavern')
        result=self.apply({'cards':[{'category':'quest','title':'Secret task','character_ids':[self.pc['id']],'share_with_party':True}]},audience=[self.player])
        self.assertEqual(result['warnings'],[])
        self.assertNotIn('Secret task',{r['title'] for r in storage.list_work(self.other)})
        with self.assertRaises(ValueError):self.apply({'scene':{'time':'Night'}},persona='character')
    def test_transaction_rollback(self):
        before=len(storage.list_work(self.dm))
        with patch.object(storage,'normalize_character_grants',side_effect=RuntimeError('simulated failure')):
            with self.assertRaises(RuntimeError):self.apply({'scene':{'location':'Changed'},'cards':[{'category':'item','title':'Sword','character_ids':[self.pc['id']]}]})
        self.assertEqual(len(storage.list_work(self.dm)),before)
        self.assertEqual(storage.campaign_record(self.dm,self.cid)['content']['ai_world']['location'],'Old tavern')

if __name__=='__main__':unittest.main()
