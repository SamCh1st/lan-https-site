import _bootstrap
import json
import unittest
from unittest.mock import Mock
import storage
import character_memory as memory
from test_chat_images import ChatImagesTests

class MemoryTests(unittest.TestCase):
    setUpDatabase=ChatImagesTests.setUp
    tearDown=ChatImagesTests.tearDown
    def setUp(self):
        self.setUpDatabase()
        self.char=storage.create_work(self.player,'Elara',{'category':'character','campaign_id':self.cid,'owner_user_id':self.player,'summary':'A cautious, compassionate traveler.'})
    def post(self,text,audience=None,chat=None):
        return storage.add_ai_message(self.cid,self.player,'character',self.char['id'],'Elara','user',True,text,audience,chat)
    def learn(self,message,text='Elara promised to bring medicine to Mara.',kind='goal',quote=None):
        note={'kind':kind,'text':text,'importance':4,'sources':[{'id':message['id'],'quote':quote or message['message']}]}
        request=Mock(return_value={'message':{'content':json.dumps({'memories':[note]})}})
        history=storage.list_ai_messages(self.player,self.cid,True,message.get('chat_id'))
        memory.learn(self.char,self.cid,history,request,'test')
        return request
    def recall(self,chat=None,audience=None):
        return memory.recall(self.player,self.cid,self.char['id'],'medicine Mara',chat,audience)['relevant_memories']
    def test_evidence_durable_and_learned_once(self):
        message=self.post('I promise to bring medicine to Mara tomorrow.')
        request=self.learn(message)
        self.assertIn('medicine',self.recall()[0]['memory'])
        memory.learn(self.char,self.cid,storage.list_ai_messages(self.player,self.cid,True),request,'test')
        self.assertEqual(request.call_count,1)
        storage.initialize()
        self.assertEqual(len(self.recall()),1)
        self.assertEqual(memory.state(self.player,self.cid,self.char['id'])['memories'][0]['evidence'][0]['id'],message['id'])
    def test_edits_deletion_and_manual_corrections(self):
        message=self.post('I promise to bring medicine to Mara tomorrow.');self.learn(message)
        storage.update_ai_message(self.cid,message['id'],'I promised to bring medicine to Mara tomorrow.')
        self.assertEqual(self.recall(),[])
        changed=storage.get_ai_message(self.cid,message['id']);self.learn(changed,quote=changed['message'])
        self.assertEqual(len(self.recall()),1)
        row=next(r for r in memory.state(self.player,self.cid,self.char['id'])['memories'] if r['status']=='current')
        memory.change(self.player,self.cid,self.char['id'],{'action':'update','id':row['id'],'revision':row['revision'],'kind':'event','text':'Elara delivered the medicine to Mara.','pinned':True})
        storage.delete_ai_message(self.cid,message['id'],self.player)
        self.assertEqual(self.recall()[0]['memory'],'Elara delivered the medicine to Mara.')
    def test_private_memory_never_enters_public_recall(self):
        message=self.post('I am hiding the medicine in the cellar.',[self.player]);self.learn(message,text='Elara said the medicine is hidden in the cellar.',kind='belief')
        self.assertEqual(self.recall(),[])
        self.assertEqual(len(self.recall(audience=[self.player])),1)
        self.assertEqual(self.recall(audience=[self.player,self.other]),[])
        chat=storage.create_work(self.dm,'Private',{'category':'chat','campaign_id':self.cid,'participant_ids':[self.char['id']],'assigned_user_ids':[self.player]})
        private=self.post('Mara knows the secret password.',[self.player],chat['id']);self.learn(private,text='Elara said Mara knows the password.',kind='belief')
        self.assertTrue(any('password' in r['memory'] for r in self.recall(audience=[self.player])))
        self.assertFalse(any('password' in r['memory'] for r in self.recall()))
        self.assertTrue(any('password' in r['memory'] for r in self.recall(chat['id'],[self.player])))
    def test_private_correction_keeps_its_audience_after_source_deletion(self):
        message=self.post('The cellar password is silver.',[self.player]);self.learn(message,text='The cellar password is silver.',kind='fact')
        row=memory.state(self.player,self.cid,self.char['id'])['memories'][0]
        memory.change(self.player,self.cid,self.char['id'],{'action':'update','id':row['id'],'revision':row['revision'],'kind':'fact','text':'The cellar password is gold.','pinned':True})
        storage.delete_ai_message(self.cid,message['id'],self.player)
        self.assertEqual(self.recall(),[])
        self.assertEqual(self.recall(audience=[self.player])[0]['memory'],'The cellar password is gold.')

    def test_permissions_profile_reminder_and_conflicts(self):
        with self.assertRaises(PermissionError):memory.state(self.other,self.cid,self.char['id'])
        first=memory.state(self.player,self.cid,self.char['id'])['profile']
        data={'action':'profile','revision':first['revision'],'core':'Elara values honesty and listens carefully.','reminder':'Speak calmly; ask before making promises.','enabled':True}
        memory.change(self.player,self.cid,self.char['id'],data)
        with self.assertRaises(ValueError):memory.change(self.player,self.cid,self.char['id'],data)
        result=memory.recall(self.player,self.cid,self.char['id'],'hello')
        self.assertIn('honesty',result['core_traits']);self.assertIn('Speak calmly',result['reminder'])
        self.assertEqual(memory.state(self.dm,self.cid,self.char['id'])['profile']['core'],data['core'])
    def test_forgetting_and_pausing_do_not_relearn_old_messages(self):
        message=self.post('I promise to bring medicine to Mara tomorrow.');request=self.learn(message)
        row=memory.state(self.player,self.cid,self.char['id'])['memories'][0]
        memory.change(self.player,self.cid,self.char['id'],{'action':'delete','id':row['id'],'revision':row['revision']})
        memory.learn(self.char,self.cid,storage.list_ai_messages(self.player,self.cid,True),request,'test')
        self.assertEqual(self.recall(),[]);self.assertEqual(request.call_count,1)
        memory.change(self.player,self.cid,self.char['id'],{'action':'profile','revision':0,'core':'','reminder':'','enabled':False})
        self.post('I now live at the mill.')
        memory.learn(self.char,self.cid,storage.list_ai_messages(self.player,self.cid,True),request,'test')
        self.assertEqual(request.call_count,1)
    def test_unverifiable_evidence_is_rejected_and_retried(self):
        message=self.post('Good morning.')
        with self.assertRaises(ValueError):self.learn(message,quote='I married Mara')
        self.assertEqual(self.recall(),[])
        self.learn(message,text='Elara greeted the group.',kind='event')
        self.assertEqual(len(self.recall()),1)
    def test_character_isolation_and_retrieval_of_old_relevant_event(self):
        other=storage.create_work(self.other,'Rowan',{'category':'character','campaign_id':self.cid,'owner_user_id':self.other})
        memory.change(self.player,self.cid,self.char['id'],{'action':'add','kind':'fact','text':'The observatory key is beneath the blue tile.','pinned':False})
        for i in range(45):memory.change(self.player,self.cid,self.char['id'],{'action':'add','kind':'event','text':'Uneventful camp evening '+str(i),'pinned':False})
        recalled=memory.recall(self.player,self.cid,self.char['id'],'Where is the observatory key?')['relevant_memories']
        self.assertIn('observatory',recalled[0]['memory'])
        self.assertEqual(memory.recall(self.other,self.cid,other['id'],'key')['relevant_memories'],[])

    def test_other_chats_membership_audience_corrections_and_deletion(self):
        chat=storage.create_work(self.dm,'Mara conversation',{'category':'chat','campaign_id':self.cid,'participant_ids':[self.char['id']],'assigned_user_ids':[self.player]})
        msg=self.post('The observatory key is beneath the blue tile.',[self.player],chat['id'])
        lookup=lambda audience:memory.recall(self.player,self.cid,self.char['id'],'observatory key',None,audience)['other_conversations']
        self.assertEqual(lookup([]),[])
        self.assertEqual(lookup([self.player,self.other]),[])
        self.assertEqual(lookup([self.player])[0]['message_id'],msg['id'])
        self.learn(msg,text='The observatory key is beneath the blue tile.',kind='fact')
        row=memory.state(self.player,self.cid,self.char['id'])['memories'][0]
        memory.change(self.player,self.cid,self.char['id'],{'action':'delete','id':row['id'],'revision':row['revision']})
        self.assertEqual(lookup([self.player]),[])
        excluded=storage.create_work(self.dm,'Not attended',{'category':'chat','campaign_id':self.cid,'participant_ids':[],'assigned_user_ids':[self.player]})
        self.post('Another observatory key is here.',[self.player],excluded['id'])
        self.assertEqual(lookup([self.player]),[])
        fresh=self.post('The observatory key has moved.',[self.player],chat['id'])
        storage.delete_ai_message(self.cid,fresh['id'],self.player)
        self.assertEqual(lookup([self.player]),[])

if __name__=='__main__':unittest.main()
